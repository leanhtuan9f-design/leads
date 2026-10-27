// Backend cào Google Maps thật: chạy gosom/google-maps-scraper trong Docker, stream kết quả qua SSE.
import express from 'express';
import { createWarehouseStats } from './warehouse-stats.mjs';
import { settleAutoTasks, expandAutoPlan } from './auto-expand.mjs';
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, openSync, readSync, closeSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { AI_DAILY_LIMIT, AiError, aiGuard, usingRouter9, setQuotaConfig, getQuotaConfig, aiEnabled, cleanProfile, profileIsEmpty, suggestCountries, suggestAreas, getAiConfig, setAiConfig, listModels, normalizeBaseUrl, testConnection, DEFAULT_SYSTEM_PROMPT, FIXED_SUFFIX } from './ai-suggest.mjs';
import { ensureAuthSchema, hashPassword, verifyPassword, sha256, newToken, randomPassword, vnDay } from './auth-lib.mjs';
import { buildMarketRecommendations, defaultLogisticsPoints } from './trade-recommend.mjs';
import { ensureTradeSchema, rankTradeMarkets, rankAllExportMarkets, mergeAiWithTrade } from './trade-data.mjs';
import { ensureLogisticsSchema, loadLogisticsConfig, logisticsView, normalizeLogisticsPoint } from './logistics-config.mjs';
import { ensureBillingSchema, createBillingService } from './billing.mjs';
import { isKey, fetchKeyProxy } from './key-proxy.mjs';

// Nạp /opt/maps/.env (khóa AI...) nếu có; biến đã đặt trong môi trường được ưu tiên
try { process.loadEnvFile(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.env')); } catch { /* không có .env */ }

const PORT = Number(process.env.PORT || 3150);
const HOST = '127.0.0.1';
const IMAGE = process.env.GOSOM_IMAGE || 'gosom/google-maps-scraper:latest';
const WORK_DIR = process.env.WORK_DIR || '/var/lib/maps-jobs';
const MAX_RESULTS = 300;
const MAX_QUERIES = 12;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const AUTO_TIMEOUT_MS = Number(process.env.AUTO_TIMEOUT_MS ?? 30 * 60 * 1000);
const MAX_QUEUE = 3;
const MAX_PROXIES = 10;
const DB_PATH = process.env.DB_PATH || '/var/lib/maps-data/cache.db';
const TRADE_TIMER_OVERRIDE = '/etc/systemd/system/maps-trade-refresh.timer.d/override.conf';
const TTL_MS = 14 * 24 * 3600 * 1000; // dữ liệu quá 14 ngày coi là cũ → trả ngay + cập nhật nền
const FORCE_PER_DAY = 3; // số lần "làm mới" bắt buộc mỗi IP mỗi ngày
const JOB_LOG_KEEP_MS = 30 * 24 * 3600 * 1000; // giữ lịch sử job 30 ngày
const BG_QUERIES_PER_HOUR = 6; // trần số truy vấn cập nhật nền mỗi giờ
const bgWorkersEnv = Number(process.env.BG_WORKERS || 2);
const DEFAULT_BG_WORKERS = Number.isFinite(bgWorkersEnv) ? Math.max(1, Math.min(8, Math.floor(bgWorkersEnv))) : 2;
let bgWorkerLimit = DEFAULT_BG_WORKERS; // có thể đổi trực tiếp trong giao diện admin
let bgScanEnabled = false;
let bgScanIntervalMinutes = 60;
let bgScanTimer = null;
const PURGE_AFTER_MS = 180 * 24 * 3600 * 1000; // xóa dữ liệu không ai dùng sau 180 ngày
const DEPTHS = [1, 2, 4, 8, 16, 32, 40];
const AUTO_GAP_MS = Number(process.env.AUTO_GAP_MS ?? 20000); // nghỉ giữa hai lần cào thật của tác vụ tự động (tránh dồn dập lên Google)
const AUTO_MAX_PAIRS = 80;
const AUTO_MAX_RUNS = 600; // trần tổng số cặp (kể cả cặp tách nhỏ) mỗi tác vụ
const AUTO_SAT = 100; // một truy vấn trả ≥ ngần này lead = chạm trần ~120 của Google → tách thành khu nhỏ để không sót
const AUTO_MAX_LEVEL = 3; // thành phố → quận → phường → khu nhỏ
const AUTO_RETRY_ERROR = 3; // số lần thử tối đa cho cặp lỗi
const AUTO_RETRY_EMPTY = 2;
const AUTO_BREAKER = 5; // 5 cặp liên tiếp lỗi hẳn → tự dừng tác vụ
const CITY_DATA = JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'data', 'cities.json'), 'utf8'));
const citiesOfCountry = (country) => {
  const k = String(country).trim().toLowerCase();
  const name = Object.keys(CITY_DATA.cities).find((n) => n.toLowerCase() === k) || Object.keys(CITY_DATA.cities).find((n) => n.toLowerCase() === String(CITY_DATA.alias[k] || '').toLowerCase());
  return name ? { name, cities: CITY_DATA.cities[name] } : null;
};

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
};

const systemctl = (args) => new Promise((resolve, reject) => execFile('systemctl', args, { timeout: 10000 }, (error, stdout) => error ? reject(error) : resolve(String(stdout))));
const tradeTimerInfo = async () => {
  let schedule = '03:20';
  let frequency = 'daily';
  try {
    const override = readFileSync(TRADE_TIMER_OVERRIDE, 'utf8');
    schedule = override.match(/OnCalendar=\*[-*]-\* (\d{2}:\d{2}):00/)?.[1] || schedule;
    const calendar = override.match(/OnCalendar=\*-(?:\d{2}|01,04,07,10)-01 (\d{2}:\d{2}):00/)?.[0] || '';
    if (/\*-01-01/.test(calendar)) frequency = 'yearly';
    else if (/\*-01,04,07,10-01/.test(calendar)) frequency = 'quarterly';
    else if (/\*-(?:\d{2})-01/.test(calendar)) frequency = 'monthly';
  } catch { /* dùng lịch mặc định trong unit */ }
  try {
    const state = await systemctl(['show', 'maps-trade-refresh.timer', '--property=ActiveState,UnitFileState,NextElapseUSecRealtime', '--no-pager']);
    const values = Object.fromEntries(state.trim().split('\n').map((line) => line.split('=')));
    return { schedule, frequency, enabled: values.UnitFileState === 'enabled', active: values.ActiveState === 'active', next: values.NextElapseUSecRealtime || '' };
  } catch { return { schedule, frequency, enabled: false, active: false, next: '' }; }
};

// Kiểm tra proxy do người dùng nhập: chỉ http/https/socks5, không cho trỏ vào mạng nội bộ của máy chủ
async function validateProxy(raw) {
  let line = String(raw).trim();
  if (!line || line.length > 300 || /\s/.test(line)) throw new Error('Proxy sai định dạng');
  if (!/^[a-z0-9]+:\/\//i.test(line)) { // nhà cung cấp hay gửi dạng ngắn: host:port, host:port:user:pass, user:pass@host:port → mặc định http://
    const p = line.split(':');
    if (!line.includes('@') && p.length === 4 && /^\d{2,5}$/.test(p[1])) line = `http://${encodeURIComponent(p[2])}:${encodeURIComponent(p[3])}@${p[0]}:${p[1]}`;
    else line = `http://${line}`;
  }
  let u;
  try { u = new URL(line); } catch { throw new Error('Proxy sai định dạng (dùng host:port, host:port:user:pass hoặc http://user:pass@host:port)'); }
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(u.protocol)) throw new Error('Proxy chỉ hỗ trợ http, https, socks5');
  if (!u.hostname || !u.port) throw new Error('Proxy cần có host và port');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host.toLowerCase() === 'localhost') throw new Error('Không cho phép proxy nội bộ');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).then((r) => r.map((x) => x.address)).catch(() => { throw new Error(`Không phân giải được host proxy: ${host}`); }));
  if (addrs.some(isPrivateIp)) throw new Error('Không cho phép proxy trỏ vào mạng nội bộ');
  return line;
}

mkdirSync(WORK_DIR, { recursive: true, mode: 0o777 });
mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ===== Kho dữ liệu SQLite =====
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS places (
    place_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    closed_suspect INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS query_runs (
    qkey TEXT PRIMARY KEY,
    query_text TEXT NOT NULL,
    last_run_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    depth INTEGER NOT NULL,
    with_email INTEGER NOT NULL,
    result_count INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS query_places (
    qkey TEXT NOT NULL,
    place_id TEXT NOT NULL,
    pos INTEGER NOT NULL,
    PRIMARY KEY (qkey, place_id)
  );
  CREATE INDEX IF NOT EXISTS idx_qp_qkey ON query_places(qkey, pos);
`);
ensureTradeSchema(db);
ensureLogisticsSchema(db);
ensureBillingSchema(db);
loadLogisticsConfig(db);
ensureAuthSchema(db);
db.exec(`CREATE TABLE IF NOT EXISTS user_state (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS job_log (
  id TEXT PRIMARY KEY,
  started_at INTEGER,
  finished_at INTEGER NOT NULL,
  user_id INTEGER,
  user_email TEXT,
  kind TEXT NOT NULL,
  queries TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  cache_n INTEGER NOT NULL DEFAULT 0,
  live_n INTEGER NOT NULL DEFAULT 0,
  proxies INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  message TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS job_log_finished ON job_log(finished_at)');
db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  user_email TEXT,
  ok INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  message TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS ai_log_at ON ai_log(at)');
db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
try {
  const saved = db.prepare("SELECT value FROM app_settings WHERE key = 'background' ").get();
  const config = JSON.parse(saved?.value || '{}');
  const n = Number(config.workers);
  if (Number.isInteger(n) && n >= 1 && n <= 8) bgWorkerLimit = n;
  if (config.enabled === true) bgScanEnabled = true;
  const interval = Number(config.intervalMinutes);
  if (Number.isInteger(interval) && interval >= 5 && interval <= 1440) bgScanIntervalMinutes = interval;
} catch (e) { console.error('Không đọc được cấu hình chạy nền', e?.message); }
db.exec(`CREATE TABLE IF NOT EXISTS auto_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_by INTEGER, created_email TEXT, product TEXT NOT NULL, country TEXT NOT NULL,
  max_results INTEGER NOT NULL, keywords TEXT NOT NULL, cities TEXT NOT NULL, buyer_types TEXT NOT NULL DEFAULT '[]', proxies TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER, note TEXT NOT NULL DEFAULT '')`);
db.exec(`CREATE TABLE IF NOT EXISTS auto_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, keyword TEXT NOT NULL, city TEXT NOT NULL, qtext TEXT NOT NULL, qkey TEXT NOT NULL,
  status TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, cache_n INTEGER NOT NULL DEFAULT 0, live_n INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER, finished_at INTEGER, message TEXT NOT NULL DEFAULT '')`);
for (const col of ["level INTEGER NOT NULL DEFAULT 0", "parent_id INTEGER", "saturated INTEGER NOT NULL DEFAULT 0", "attempts INTEGER NOT NULL DEFAULT 1", "split_state TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE auto_runs ADD COLUMN ${col}`); } catch { /* đã có cột */ }
}
for (const col of ["burst_n INTEGER NOT NULL DEFAULT 0", "rest_min INTEGER NOT NULL DEFAULT 0", "rest_max INTEGER NOT NULL DEFAULT 0", "win_on INTEGER NOT NULL DEFAULT 0", "win_start INTEGER NOT NULL DEFAULT 8", "win_end INTEGER NOT NULL DEFAULT 19", "tz TEXT NOT NULL DEFAULT ''", "since_rest INTEGER NOT NULL DEFAULT 0", "rest_until INTEGER NOT NULL DEFAULT 0", "plan_round INTEGER NOT NULL DEFAULT 0", "plan_group TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE auto_tasks ADD COLUMN ${col}`); } catch { /* đã có cột */ }
}
db.exec('CREATE TABLE IF NOT EXISTS auto_areas (place TEXT PRIMARY KEY, areas TEXT NOT NULL, at INTEGER NOT NULL)');
db.exec('CREATE INDEX IF NOT EXISTS auto_runs_task ON auto_runs(task_id, status)');
db.exec("UPDATE auto_runs SET status='pending' WHERE status='running'"); // khởi động lại giữa chừng → chạy lại cặp dở
try { // cấu hình AI do admin đặt trong giao diện (khóa API nằm trong DB, không bao giờ trả về trình duyệt)
  const r = db.prepare("SELECT value FROM app_settings WHERE key = 'ai'").get();
  if (r) setAiConfig(JSON.parse(r.value));
} catch (e) { console.error('Không đọc được cấu hình AI', e?.message); }
try { // cấu hình kiểm tra quota 9router (mật khẩu dashboard chỉ ghi vào, không trả về trình duyệt)
  const r = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_quota'").get();
  if (r) setQuotaConfig(JSON.parse(r.value));
} catch (e) { console.error('Không đọc được cấu hình quota AI', e?.message); }
db.exec(`CREATE TABLE IF NOT EXISTS user_items (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  data TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_items_seq ON user_items (user_id, kind, seq)`);
const stmt = {
  itemCount: db.prepare('SELECT COUNT(*) AS n FROM user_items WHERE user_id = ? AND kind = ?'),
  itemMaxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM user_items WHERE user_id = ? AND kind = ?'),
  itemsAfter: db.prepare('SELECT item_id, data, deleted, seq FROM user_items WHERE user_id = ? AND kind = ? AND seq > ? ORDER BY seq LIMIT ?'),
  upsertItem: db.prepare(`INSERT INTO user_items (user_id, kind, item_id, data, deleted, seq) VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(user_id, kind, item_id) DO UPDATE SET data = excluded.data, deleted = 0, seq = excluded.seq`),
  trashItems: db.prepare('SELECT data FROM user_items WHERE user_id = ? AND kind = ? AND deleted = 1 ORDER BY seq DESC LIMIT 2000'),
  removeItem: db.prepare('UPDATE user_items SET deleted = 1, seq = ? WHERE user_id = ? AND kind = ? AND item_id = ? AND deleted = 0'),
  getState: db.prepare('SELECT value, updated_at FROM user_state WHERE user_id = ? AND key = ?'),
  setState: db.prepare(`INSERT INTO user_state (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  allUsers: db.prepare('SELECT id, email, role, daily_new, daily_refresh, disabled, created_at FROM users ORDER BY id'),
  insertUser: db.prepare('INSERT INTO users (email, pass, role, daily_new, daily_refresh, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  setPass: db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
  getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  getUsage: db.prepare('SELECT new_places, refreshes FROM usage WHERE user_id = ? AND day = ?'),
  addNew: db.prepare(`INSERT INTO usage (user_id, day, new_places) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET new_places = new_places + 1`),
  addRefresh: db.prepare(`INSERT INTO usage (user_id, day, refreshes) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET refreshes = refreshes + 1`),
  purgeUsage: db.prepare('DELETE FROM usage WHERE day < ?'),
  getRun: db.prepare('SELECT * FROM query_runs WHERE qkey = ?'),
  touchRun: db.prepare('UPDATE query_runs SET hits = hits + 1, last_used_at = ? WHERE qkey = ?'),
  upsertPlace: db.prepare(`INSERT INTO places (place_id, data, first_seen, last_seen, closed_suspect) VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(place_id) DO UPDATE SET data = excluded.data, last_seen = excluded.last_seen, closed_suspect = 0`),
  runPlaces: db.prepare(`SELECT p.data, p.closed_suspect FROM query_places q JOIN places p ON p.place_id = q.place_id WHERE q.qkey = ? ORDER BY q.pos`),
  linkedIds: db.prepare('SELECT place_id FROM query_places WHERE qkey = ?'),
  unlink: db.prepare('DELETE FROM query_places WHERE qkey = ?'),
  link: db.prepare('INSERT OR IGNORE INTO query_places (qkey, place_id, pos) VALUES (?, ?, ?)'),
  markClosed: db.prepare('UPDATE places SET closed_suspect = 1 WHERE place_id = ?'),
  saveRun: db.prepare(`INSERT INTO query_runs (qkey, query_text, last_run_at, last_used_at, depth, with_email, result_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(qkey) DO UPDATE SET query_text = excluded.query_text, last_run_at = excluded.last_run_at, last_used_at = excluded.last_used_at,
      depth = excluded.depth, with_email = excluded.with_email, result_count = excluded.result_count`),
  stats: db.prepare(`SELECT
    (SELECT COUNT(*) FROM places) AS places,
    (SELECT COUNT(*) FROM places WHERE COALESCE(json_extract(data, '$.email'), '') <> '') AS withEmail,
    (SELECT COUNT(*) FROM places WHERE COALESCE(json_extract(data, '$.email'), '') = '') AS withoutEmail,
    (SELECT COUNT(*) FROM places WHERE COALESCE(json_extract(data, '$.phone'), '') <> '') AS withPhone,
    (SELECT COUNT(*) FROM query_runs) AS queries,
    (SELECT COALESCE(SUM(hits),0) FROM query_runs) AS hits`),
  logJob: db.prepare('INSERT OR REPLACE INTO job_log (id, started_at, finished_at, user_id, user_email, kind, queries, count, cache_n, live_n, proxies, status, message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'),
  recentLog: db.prepare('SELECT * FROM job_log ORDER BY finished_at DESC LIMIT 100'),
  countLog: db.prepare('SELECT COUNT(*) AS n FROM job_log'),
  purgeLog: db.prepare('DELETE FROM job_log WHERE finished_at < ?'),
  aiUsageGet: db.prepare('SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?'),
  aiUsageAdd: db.prepare('INSERT INTO ai_usage (user_id, day, calls) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1'),
  aiLogAdd: db.prepare('INSERT INTO ai_log (at, user_id, user_email, ok, input_tokens, output_tokens, items, message) VALUES (?,?,?,?,?,?,?,?)'),
  aiLogRecent: db.prepare('SELECT * FROM ai_log ORDER BY at DESC LIMIT 20'),
  aiLogStats: db.prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(ok),0) AS ok, COALESCE(SUM(input_tokens),0) AS inp, COALESCE(SUM(output_tokens),0) AS outp FROM ai_log WHERE at >= ?'),
  aiLogPurge: db.prepare('DELETE FROM ai_log WHERE at < ?'),
  aiUsagePurge: db.prepare('DELETE FROM ai_usage WHERE day < ?'),
  autoNextRun: db.prepare("SELECT r.*, t.max_results, t.proxies FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE t.status='running' AND r.status='pending' AND t.rest_until <= ? ORDER BY r.task_id, r.id LIMIT 1"),
  autoNextWake: db.prepare("SELECT MIN(t.rest_until) AS w FROM auto_tasks t WHERE t.status='running' AND t.rest_until > ? AND EXISTS (SELECT 1 FROM auto_runs r WHERE r.task_id=t.id AND r.status='pending')"),
  autoRunProgress: db.prepare('UPDATE auto_runs SET count=?, live_n=? WHERE id=?'),
  autoSetSplit: db.prepare('UPDATE auto_runs SET split_state=? WHERE id=?'),
  autoRunStart: db.prepare("UPDATE auto_runs SET status='running', started_at=? WHERE id=?"),
  autoRunEnd: db.prepare('UPDATE auto_runs SET status=?, count=?, cache_n=?, live_n=?, finished_at=?, message=? WHERE id=?'),
  autoLeft: db.prepare("SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=? AND (status IN ('pending','running') OR split_state='todo')"),
  autoNextSplit: db.prepare("SELECT r.* FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE t.status='running' AND r.split_state='todo' ORDER BY r.id LIMIT 1"),
  autoTaskEnd: db.prepare("UPDATE auto_tasks SET status=?, finished_at=?, note=? WHERE id=? AND status='running'"),
  purgeRuns: db.prepare('DELETE FROM query_runs WHERE last_used_at < ?'),
  purgeLinks: db.prepare('DELETE FROM query_places WHERE qkey NOT IN (SELECT qkey FROM query_runs)'),
  purgePlaces: db.prepare('DELETE FROM places WHERE place_id NOT IN (SELECT place_id FROM query_places)'),
};
const billing = createBillingService({ db, stmt, hashPassword });
function purgeOld() {
  stmt.purgeSessions.run(Date.now());
  stmt.purgeUsage.run(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  stmt.purgeLog.run(Date.now() - JOB_LOG_KEEP_MS);
  stmt.aiLogPurge.run(Date.now() - JOB_LOG_KEEP_MS);
  stmt.aiUsagePurge.run(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  stmt.purgeRuns.run(Date.now() - PURGE_AFTER_MS);
  stmt.purgeLinks.run();
  stmt.purgePlaces.run();
}
purgeOld();
setInterval(purgeOld, 24 * 3600 * 1000).unref();

// Khóa tra cứu: bỏ dấu, chữ thường, bỏ ký tự thừa → "Nha Khoa" và "nha khoa" là một
const normalize = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^\p{L}\p{M}\p{N}., -]/gu, ' ').replace(/\s+/g, ' ').trim(); // giữ chữ Hán/Nhật/Hàn/Kirin...: trước đây bị xóa nên mọi từ khóa không phải Latin trùng một khóa kho
const makeKey = (query, lang, geo) => `${lang}|${geo || ''}|${normalize(query)}`;
const neededDepth = (maxResults, nQueries) => {
  const raw = Math.ceil((maxResults * 1.5) / nQueries / 7);
  return DEPTHS.find((d) => d >= raw) || 40;
};

const app = express();
app.use(['/api/state', '/api/items'], express.json({ limit: '25mb' })); // lead/job của người dùng có thể lớn
app.use(express.json({ limit: '32kb' }));

// ===== Xác thực =====
const COOKIE = 'mapsid';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const setCookie = (res, token, maxAgeSec) => res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`);

// Chặn CSRF: yêu cầu ghi từ trình duyệt phải cùng nguồn gốc (cookie còn có SameSite=Lax)
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Nguồn không hợp lệ' }); } catch { return res.status(403).json({ error: 'Nguồn không hợp lệ' }); } }
  }
  next();
});

app.use((req, _res, next) => {
  const tok = parseCookies(req)[COOKIE];
  if (tok) {
    const sess = stmt.getSession.get(sha256(tok));
    if (sess && sess.expires_at > Date.now()) {
      const u = stmt.userById.get(sess.user_id);
      if (u && !u.disabled) { req.user = u; req.sessionHash = sess.token_hash; }
    }
  }
  next();
});
const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Chưa đăng nhập' }));
const requireAdmin = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Chưa đăng nhập' }) : req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Không có quyền' }));
const canAccess = (user, job) => Boolean(user && (user.role === 'admin' || job.userId === user.id));

// ===== Central CRM billing =====
app.get('/api/billing/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = billing.getConfig();
  res.json({ sourceKey: config.sourceKey, plans: config.plans, prices: config.prices, features: config.features, skus: config.skus });
});
app.get('/api/admin/billing-config', requireAdmin, (_req, res) => {
  const config = billing.getConfig();
  res.json({ sourceKey: config.sourceKey, skus: config.skus, plans: config.plans, prices: config.prices, features: config.features, hasCheckoutApiKey: Boolean(process.env.CRM_CHECKOUT_API_KEY), hasWebsiteKey: Boolean(process.env.CRM_WEBSITE_KEY), hasCallbackKey: Boolean(process.env.CRM_CALLBACK_API_KEY) });
});
app.put('/api/admin/billing-config', requireAdmin, (req, res) => {
  const sourceKey = String(req.body?.sourceKey || '').trim().slice(0, 120);
  const rawSkus = req.body?.skus || {};
  const rawPlans = req.body?.plans || {};
  const rawPrices = req.body?.prices || {};
  const rawFeatures = req.body?.features || {};
  const skus = Object.fromEntries(['BASIC_MONTHLY', 'BASIC_ANNUAL', 'ADVANCED_MONTHLY', 'ADVANCED_ANNUAL'].map((key) => [key, String(rawSkus[key] || '').trim().slice(0, 160)]));
  const plans = Object.fromEntries(['BASIC', 'ADVANCED'].map((key) => [key, { dailyNew: Math.max(0, Math.min(1000000, Number(rawPlans[key]?.dailyNew) || 0)), dailyRefresh: Math.max(0, Math.min(100000, Number(rawPlans[key]?.dailyRefresh) || 0)) }]));
  const prices = Object.fromEntries(['BASIC', 'ADVANCED'].map((key) => [key, { MONTHLY: Math.max(0, Math.min(1000000000, Number(rawPrices[key]?.MONTHLY) || 0)), ANNUAL: Math.max(0, Math.min(1000000000, Number(rawPrices[key]?.ANNUAL) || 0)) }]));
  const features = Object.fromEntries(['BASIC', 'ADVANCED'].map((key) => [key, Array.isArray(rawFeatures[key]) ? rawFeatures[key].map((item) => String(item).trim().slice(0, 200)).filter(Boolean).slice(0, 12) : []]));
  if (!sourceKey || Object.values(skus).some((sku) => !sku)) return res.status(422).json({ error: 'Cần nhập Source key và đủ 4 SKU hiện có trong CRM' });
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('billing', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ sourceKey, skus, plans, prices, features }));
  res.json({ sourceKey, skus, plans, prices, features, hasCheckoutApiKey: Boolean(process.env.CRM_CHECKOUT_API_KEY), hasWebsiteKey: Boolean(process.env.CRM_WEBSITE_KEY), hasCallbackKey: Boolean(process.env.CRM_CALLBACK_API_KEY) });
});
app.post('/api/billing/checkout', async (req, res) => {
  try {
    const existingUser = req.user && req.user.role !== 'trial' ? { id: req.user.id, email: req.user.email, pass: req.user.pass } : undefined;
    const result = await billing.createCheckout({ name: req.body?.name, emailAddress: req.body?.email, phone: req.body?.phone, password: req.body?.password, plan: req.body?.plan, billingCycle: req.body?.billingCycle, trialId: req.body?.trialId, existingUser });
    res.status(201).json(result);
  } catch (error) {
    res.status(Number(error?.statusCode) || 502).json({ code: error?.code || 'CHECKOUT_FAILED', error: error?.message || 'Không tạo được đơn thanh toán' });
  }
});
app.get('/api/billing/orders/:id/status', async (req, res) => {
  try {
    const result = await billing.status(req.params.id);
    if (!result) return res.status(404).json({ error: 'Không tìm thấy đơn thanh toán' });
    // Trial checkout creates the paid account only after CRM confirms payment.
    // Once fulfilled, move the current trial session to that newly created account
    // so the browser does not reload back into the old trial session.
    if ((result.status === 'PAID' || result.status === 'FULFILLED') && req.user?.role === 'trial') {
      const order = db.prepare('SELECT email, trial_id FROM billing_orders WHERE order_id = ?').get(req.params.id);
      if (order?.trial_id && String(order.trial_id) === String(req.user.id)) {
        const paidUser = stmt.userByEmail.get(order.email);
        if (paidUser && !paidUser.disabled) {
          const token = newToken();
          stmt.insertSession.run(sha256(token), paidUser.id, Date.now() + SESSION_MS);
          setCookie(res, token, SESSION_MS / 1000);
        }
      }
    }
    res.json(result);
  } catch (error) {
    res.status(Number(error?.statusCode) || 503).json({ code: error?.code || 'PAYMENT_STATUS_FAILED', error: error?.message || 'Không đọc được trạng thái thanh toán' });
  }
});
app.post('/api/integrations/crm/entitlements', (req, res) => {
  try {
    const providedKey = req.get('x-crm-to-maps-payment-key') || req.get('x-crm-callback-secret');
    res.status(200).json(billing.applyEntitlement({ ...req.body, providedKey }));
  } catch (error) {
    res.status(Number(error?.statusCode) || 503).json({ code: error?.code || 'CRM_CALLBACK_FAILED', error: error?.message || 'Không xử lý được callback CRM' });
  }
});
app.get('/api/account/plan', requireAuth, (req, res) => {
  let accountUser = req.user;
  if (accountUser.role === 'trial') {
    const paidOrder = db.prepare("SELECT email FROM billing_orders WHERE trial_id = ? AND status = 'FULFILLED' ORDER BY updated_at DESC LIMIT 1").get(String(accountUser.id));
    const paidUser = paidOrder ? stmt.userByEmail.get(paidOrder.email) : null;
    if (paidUser && !paidUser.disabled) {
      const token = newToken();
      stmt.insertSession.run(sha256(token), paidUser.id, Date.now() + SESSION_MS);
      setCookie(res, token, SESSION_MS / 1000);
      accountUser = paidUser;
    }
  }
  const plan = db.prepare('SELECT plan, billing_cycle AS billingCycle, order_id AS orderId, effective_from AS effectiveFrom, effective_until AS effectiveUntil FROM user_plans WHERE user_id = ?').get(accountUser.id);
  const config = billing.getConfig();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ plan: plan || { plan: 'TRIAL', billingCycle: null, orderId: null }, quota: quotaOf(accountUser), plans: config.plans, prices: config.prices, features: config.features });
});
app.use('/api/jobs', requireAuth);
app.use(['/api/state', '/api/items'], requireAuth);

// ===== Dữ liệu riêng của từng người dùng (lead, lịch sử job, proxy) =====
const STATE_KEYS = new Set(['proxies', 'profile']);
app.get('/api/state/:key', (req, res) => {
  if (!STATE_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Không tìm thấy' });
  const row = stmt.getState.get(req.user.id, req.params.key);
  res.json(row ? { value: JSON.parse(row.value), updatedAt: row.updated_at } : { value: null, updatedAt: 0 });
});

// Lead và job lưu từng dòng (đồng bộ theo phần thay đổi, xóa mềm để các thiết bị khác biết)
const ITEM_KINDS = { leads: 'lead', jobs: 'job' };
const MAX_SYNC_ITEMS = 2000;
const inTx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
app.get('/api/items/:kind', (req, res) => {
  const kind = ITEM_KINDS[req.params.kind];
  if (!kind) return res.status(404).json({ error: 'Không tìm thấy' });
  const uid = req.user.id;
  const after = toInt(req.query.after, 0, Number.MAX_SAFE_INTEGER);
  const limit = Math.max(1, toInt(req.query.limit, 1000, 2000));
  if (after === 0 && stmt.itemCount.get(uid, kind).n === 0) {
    // Chuyển dữ liệu dạng mảng cũ (user_state) sang từng dòng, một lần
    const old = stmt.getState.get(uid, req.params.kind);
    if (old) {
      inTx(() => {
        const arr = JSON.parse(old.value);
        if (!Array.isArray(arr)) return;
        let seq = 0;
        // mảng cũ xếp mới nhất trước → ghi ngược để seq lớn nhất = mới nhất
        for (let i = arr.length - 1; i >= 0; i--) {
          const id = arr[i]?.id;
          if (typeof id === 'string' && id && id.length <= 200) stmt.upsertItem.run(uid, kind, id, JSON.stringify(arr[i]), ++seq);
        }
      });
    }
  }
  const rows = stmt.itemsAfter.all(uid, kind, after, limit + 1);
  const more = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => ({ id: r.item_id, data: r.deleted ? null : JSON.parse(r.data), deleted: Boolean(r.deleted), seq: r.seq }));
  res.json({ items, more, last: items.length ? items[items.length - 1].seq : after });
});
app.get('/api/items/:kind/trash', (req, res) => {
  const kind = ITEM_KINDS[req.params.kind];
  if (!kind) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json({ items: stmt.trashItems.all(req.user.id, kind).map((r) => JSON.parse(r.data)) });
});
app.post('/api/items/:kind', (req, res) => {
  const kind = ITEM_KINDS[req.params.kind];
  if (!kind) return res.status(404).json({ error: 'Không tìm thấy' });
  const upsert = Array.isArray(req.body?.upsert) ? req.body.upsert : [];
  const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];
  if (kind === 'lead' && remove.length > 0 && req.user.role !== 'admin') return res.status(403).json({ error: 'Tài khoản người dùng không được xóa lead.' });
  if (upsert.length + remove.length > MAX_SYNC_ITEMS) return res.status(400).json({ error: 'Gửi quá nhiều dòng một lần' });
  const validId = (id) => typeof id === 'string' && id && id.length <= 200;
  if (!upsert.every((x) => x && typeof x === 'object' && validId(x.id)) || !remove.every(validId)) return res.status(400).json({ error: 'Dữ liệu sai định dạng' });
  const uid = req.user.id;
  const last = inTx(() => {
    let seq = stmt.itemMaxSeq.get(uid, kind).m;
    for (const x of upsert) stmt.upsertItem.run(uid, kind, x.id, JSON.stringify(x), ++seq);
    for (const id of remove) stmt.removeItem.run(++seq, uid, kind, id);
    return seq;
  });
  res.json({ ok: true, last });
});
app.put('/api/state/:key', (req, res) => {
  if (!STATE_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Không tìm thấy' });
  const v = req.body?.value;
  if (v === undefined || v === null) return res.status(400).json({ error: 'Thiếu dữ liệu' });
  let value = v;
  if (req.params.key === 'profile') {
    if (typeof v !== 'object' || Array.isArray(v)) return res.status(400).json({ error: 'Dữ liệu sai định dạng' });
    value = cleanProfile(v);
  } else if (req.params.key === 'proxies' ? typeof v !== 'string' : !Array.isArray(v)) return res.status(400).json({ error: 'Dữ liệu sai định dạng' });
  const updatedAt = Date.now();
  stmt.setState.run(req.user.id, req.params.key, JSON.stringify(value), updatedAt);
  res.json({ ok: true, updatedAt });
});

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role });
function quotaOf(u) {
  const use = stmt.getUsage.get(u.id, vnDay()) || { new_places: 0, refreshes: 0 };
  return { newUsed: use.new_places, newLimit: u.daily_new, refreshUsed: use.refreshes, refreshLimit: u.daily_refresh };
}

const loginFails = new Map(); // key -> { n, until }
const failKey = (req, email) => `${req.headers['x-real-ip'] || req.ip}|${email}`;
app.post('/api/trial/start', (req, res) => {
  if (req.user) {
    if (req.user.role === 'trial') {
      const paidOrder = db.prepare("SELECT email FROM billing_orders WHERE trial_id = ? AND status = 'FULFILLED' ORDER BY updated_at DESC LIMIT 1").get(String(req.user.id));
      const paidUser = paidOrder ? stmt.userByEmail.get(paidOrder.email) : null;
      if (paidUser && !paidUser.disabled) {
        const token = newToken();
        stmt.insertSession.run(sha256(token), paidUser.id, Date.now() + SESSION_MS);
        setCookie(res, token, SESSION_MS / 1000);
        return res.json({ user: publicUser(paidUser), quota: quotaOf(paidUser), trial: false });
      }
    }
    return res.json({ user: publicUser(req.user), quota: quotaOf(req.user), trial: true });
  }
  const trialId = newToken();
  const trialEmail = `trial_${trialId.slice(0, 24)}@trial.local`;
  const userId = stmt.insertUser.run(trialEmail, hashPassword(randomPassword()), 'trial', 20, 3, Date.now()).lastInsertRowid;
  const token = newToken();
  stmt.insertSession.run(sha256(token), Number(userId), Date.now() + SESSION_MS);
  setCookie(res, token, SESSION_MS / 1000);
  const user = stmt.userById.get(Number(userId));
  res.status(201).json({ user: publicUser(user), quota: quotaOf(user), trial: true, trialId: String(userId) });
});
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(req.body?.password || '').slice(0, 200);
  const key = failKey(req, email);
  const f = loginFails.get(key);
  if (f && f.until > Date.now()) return res.status(429).json({ error: 'Sai quá nhiều lần, thử lại sau 15 phút' });
  const u = stmt.userByEmail.get(email);
  const ok = verifyPassword(password, u?.pass) && u && !u.disabled; // luôn băm để thời gian phản hồi như nhau
  if (!ok) {
    const n = (f?.n || 0) + 1;
    loginFails.set(key, { n, until: n >= 8 ? Date.now() + 15 * 60 * 1000 : 0 });
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
  }
  loginFails.delete(key);
  const token = newToken();
  stmt.insertSession.run(sha256(token), u.id, Date.now() + SESSION_MS);
  setCookie(res, token, SESSION_MS / 1000);
  res.json({ user: publicUser(u), quota: quotaOf(u) });
});

app.post('/api/auth/logout', (req, res) => {
  const tok = parseCookies(req)[COOKIE];
  if (tok) stmt.delSession.run(sha256(tok));
  setCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  res.json({ user: publicUser(req.user), quota: quotaOf(req.user) });
});

app.post('/api/auth/password', requireAuth, (req, res) => {
  const cur = String(req.body?.current || '');
  const nw = String(req.body?.next || '');
  if (!verifyPassword(cur, req.user.pass)) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
  if (nw.length < 10 || nw.length > 200) return res.status(400).json({ error: 'Mật khẩu mới cần từ 10 ký tự' });
  stmt.setPass.run(hashPassword(nw), req.user.id);
  stmt.delOtherSessions.run(req.user.id, req.sessionHash);
  res.json({ ok: true });
});

// ===== Quản trị người dùng (chỉ admin) =====
const toInt = (v, def, max = 1000000) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= max ? n : def; };
app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const day = vnDay();
  res.json({ users: stmt.allUsers.all().map((u) => {
    const use = stmt.getUsage.get(u.id, day) || { new_places: 0, refreshes: 0 };
    return { id: u.id, email: u.email, role: u.role, dailyNew: u.daily_new, dailyRefresh: u.daily_refresh, disabled: Boolean(u.disabled), newUsed: use.new_places, refreshUsed: use.refreshes };
  }) });
});
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return res.status(400).json({ error: 'Email không hợp lệ' });
  const role = req.body?.role === 'admin' ? 'admin' : 'user';
  const password = String(req.body?.password || '') || randomPassword();
  if (password.length < 10) return res.status(400).json({ error: 'Mật khẩu cần từ 10 ký tự' });
  try {
    stmt.insertUser.run(email, hashPassword(password), role, toInt(req.body?.dailyNew, 200), toInt(req.body?.dailyRefresh, 3, 1000), Date.now());
  } catch { return res.status(409).json({ error: 'Email đã tồn tại' }); }
  res.json({ email, password }); // mật khẩu chỉ hiện một lần
});
app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = stmt.userById.get(id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy' });
  const b = req.body || {};
  if (b.disabled === true && u.id === req.user.id) return res.status(400).json({ error: 'Không thể tự khóa tài khoản của mình' });
  if (b.role && b.role !== 'admin' && u.id === req.user.id) return res.status(400).json({ error: 'Không thể tự hạ quyền của mình' });
  db.prepare('UPDATE users SET daily_new = ?, daily_refresh = ?, disabled = ?, role = ? WHERE id = ?').run(
    toInt(b.dailyNew, u.daily_new), toInt(b.dailyRefresh, u.daily_refresh, 1000),
    b.disabled === undefined ? u.disabled : (b.disabled ? 1 : 0), b.role === 'admin' || b.role === 'user' ? b.role : u.role, id);
  if (b.disabled) stmt.delUserSessions.run(id);
  let newPassword;
  if (b.resetPassword) {
    newPassword = randomPassword();
    stmt.setPass.run(hashPassword(newPassword), id);
    stmt.delUserSessions.run(id);
  }
  res.json({ ok: true, newPassword });
});

/** @type {Map<string, Job>} */
const jobs = new Map();

const clean = (s, max = 120) =>
  String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function mapPlace(p) {
  const cA = p.complete_address || {};
  const emails = Array.isArray(p.emails) ? p.emails.filter(Boolean) : [];
  const socials = {};
  const hours = p.open_hours && typeof p.open_hours === 'object' ? p.open_hours : {};
  const hoursSummary = Object.entries(hours)
    .slice(0, 7)
    .map(([d, v]) => `${d}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' | ');
  return {
    id: `lead_${p.place_id || p.cid || randomUUID()}`,
    title: p.title || '',
    category: p.category || (p.categories && p.categories[0]) || '',
    subcategories: Array.isArray(p.categories) ? p.categories : [],
    address: p.address || '',
    street: cA.street || '',
    city: cA.city || '',
    state: cA.state || '',
    postalCode: cA.postal_code || '',
    country: cA.country || '',
    phone: p.phone || '',
    website: p.web_site || '',
    email: emails[0] || '',
    additionalEmails: emails.slice(1),
    socials,
    rating: Number(p.review_rating) || 0,
    reviewsCount: Number(p.review_count) || 0,
    priceLevel: p.price_range || '',
    isClaimed: Boolean(p.owner && p.owner.id),
    isOpenNow: p.status ? /open|mở/i.test(p.status) : false,
    openHoursSummary: hoursSummary,
    latitude: Number(p.latitude) || 0,
    longitude: Number(p.longitude ?? p.longtitude) || 0,
    googleMapsUrl: p.link || '',
    placeId: p.place_id || '',
    photosCount: Array.isArray(p.images) ? p.images.length : 0,
    leadScore: 0, // client tính lại bằng calculateLeadScore
    leadStatus: 'cold',
    scrapedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
  };
}

const sseWrite = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

class Job {
  constructor(spec) {
    this.id = randomUUID();
    this.spec = spec; // { queries:[{text,key}], geo, radius, depth, extractEmails, lang, proxies, force, background }
    this.status = 'queued';
    this.createdAt = Date.now();
    this.startedAt = null;
    this.history = []; // các sự kiện place để client nối lại
    this.clients = new Set();
    this.count = 0;
    this.ended = false;
    this.aborted = false; // người dùng bấm hủy → kill ngay
    this.detached = false; // đủ chỉ tiêu → để truy vấn đang chạy hoàn tất vào kho rồi dừng
    this.dir = path.join(WORK_DIR, this.id);
    this.container = null;
    this.userId = spec.userId || null;
    this.quotaLeft = Infinity;
    this.source = { cache: 0, live: 0, oldestAt: null, refreshing: false };
  }
  emit(type, data) {
    if (this.ended) return;
    if (type === 'place') this.history.push(data);
    for (const res of this.clients) sseWrite(res, type, data);
  }
  sourceLabel() {
    const { cache, live } = this.source;
    return cache && live ? 'mixed' : cache ? 'cache' : 'live';
  }
  endClients(status, message = '') {
    if (this.ended) return;
    this.emit('end', {
      status, count: this.count, message,
      source: this.sourceLabel(), oldestAt: this.source.oldestAt, refreshing: this.source.refreshing,
    });
    this.ended = true;
    this.endStatus = status;
    this.endMessage = message;
    for (const res of this.clients) res.end();
    this.clients.clear();
  }
  detach(message = '') { // đủ chỉ tiêu, hết hạn mức, hoặc người dùng đã rời trang
    if (this.detached || this.aborted) return;
    this.detached = true;
    this.endClients('done', message);
  }
  deliverLive(place) { // địa điểm cào mới: tính vào hạn mức của người dùng
    if (this.detached || this.aborted) return;
    if (this.userId) {
      if (this.quotaLeft <= 0) { this.detach('Đã hết hạn mức địa điểm mới hôm nay. Dữ liệu đã lưu vẫn xem được; hạn mức đặt lại vào 0h (giờ Việt Nam).'); return; }
      this.quotaLeft--;
      stmt.addNew.run(this.userId, vnDay());
    }
    this.count++; this.source.live++;
    if (this.spec.auto) { try { stmt.autoRunProgress.run(this.count, this.source.live, this.spec.auto.runId); } catch { /* không để lỗi ghi tiến độ làm hỏng job */ } }
    this.emit('place', place);
  }
  abort() {
    this.aborted = true;
    if (this.container) execFile('docker', ['rm', '-f', this.container], () => {});
    this.endClients('cancelled');
  }
}

let running = null;
const backgroundRuns = new Set();
const queue = [];
const bgPending = new Map(); // key -> { q, depth, withEmail, lang, geo, radius, proxies }
let bgDoneThisHour = 0;
setInterval(() => { bgDoneThisHour = 0; }, 3600 * 1000).unref();

// Ghi lịch sử job vào SQLite (trang admin 'Chạy ngầm'); lỗi ghi log không được làm hỏng job
function logJob(job) {
  try {
    const v = jobView(job);
    const kind = job.spec.auto ? 'auto' : job.spec.background ? 'background' : job.cacheOnly ? 'cache' : job.spec.force ? 'force' : 'user';
    stmt.logJob.run(job.id, job.startedAt || job.createdAt, Date.now(), job.userId, v.user || (v.autoTask ? `Tác vụ #${v.autoTask.id}${v.autoTask.product ? ` · ${v.autoTask.product} → ${v.autoTask.country}` : ''}` : null), kind, JSON.stringify(v.queries),
      job.count, job.source.cache, job.source.live, v.proxies, job.endStatus || (job.aborted ? 'cancelled' : 'done'), job.endMessage || '');
  } catch (e) { console.error('logJob error', e); }
}

function jobView(job) {
  const u = job.userId ? stmt.userById.get(job.userId) : null;
  return {
    id: job.id.slice(0, 8),
    background: Boolean(job.spec.background),
    auto: Boolean(job.spec.auto),
    force: Boolean(job.spec.force),
    user: u ? u.email : null,
    autoTask: job.spec.auto ? (() => { const t = db.prepare('SELECT id, product, country FROM auto_tasks WHERE id=?').get(job.spec.auto.taskId); return t ? { id: t.id, product: t.product, country: t.country } : { id: job.spec.auto.taskId, product: '', country: '' }; })() : null,
    queries: job.spec.queries.map((q) => q.text),
    count: job.count,
    cache: job.source.cache,
    live: job.source.live,
    proxies: (job.spec.proxies || []).length,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    detached: job.detached,
  };
}

function runManagedJob(job, pool = false) {
  if (pool) backgroundRuns.add(job); else running = job;
  job.startedAt = Date.now();
  runJob(job).catch((e) => {
    console.error('runJob error', e);
    job.endClients('failed', 'Lỗi nội bộ máy chủ');
  }).finally(() => {
    rmSync(job.dir, { recursive: true, force: true });
    logJob(job);
    if (job.spec.auto) finishAutoRun(job);
    if (pool) backgroundRuns.delete(job); else running = null;
    next();
  });
}

function startBackgroundRefresh() {
  if (bgPending.size === 0 || bgDoneThisHour >= BG_QUERIES_PER_HOUR || backgroundRuns.size >= bgWorkerLimit) return false;
  const [key, e] = bgPending.entries().next().value;
  bgPending.delete(key);
  bgDoneThisHour++;
  const job = new Job({
    queries: [e.q], geo: e.geo, radius: e.radius, depth: e.depth, extractEmails: e.withEmail,
    lang: e.lang, proxies: e.proxies || [], force: true, background: true,
  });
  jobs.set(job.id, job);
  job.live = prepareCached(job);
  runManagedJob(job, true);
  return true;
}

function next() {
  // Job người dùng luôn chiếm worker chính và được ưu tiên trước nền.
  if (!running && queue.length > 0) {
    const job = queue.shift();
    runManagedJob(job);
    return;
  }

  // Có thể chạy nhiều cập nhật kho đồng thời, kể cả khi một tác vụ nền khác đang chạy.
  // Khi có người dùng đang chờ, nhường tài nguyên cho họ.
  if (queue.length === 0) {
    while (startBackgroundRefresh()) { /* lấp đầy pool nền */ }
  }

  if (!running) pickAuto();
  else if (running.spec.auto) pickAutoExtra();
}

function backgroundKeyActive(key) {
  if (bgPending.has(key)) return true;
  return [...backgroundRuns].some((job) => job.spec.background && job.spec.queries.some((q) => q.key === key));
}

function scanBackgroundCache() {
  if (!bgScanEnabled) return;
  const cutoff = Date.now() - TTL_MS;
  const stale = db.prepare('SELECT qkey, query_text, depth, with_email FROM query_runs WHERE last_run_at < ? ORDER BY last_run_at LIMIT 100').all(cutoff);
  for (const row of stale) {
    if (backgroundKeyActive(row.qkey)) continue;
    const parts = String(row.qkey).split('|');
    const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/i.test(parts[0]) ? parts[0] : 'vi';
    let geo = '';
    let radius = 10000;
    const geoPart = parts[1] || '';
    const geoMatch = geoPart.match(/^(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)@(\d+)$/);
    if (geoMatch) { geo = geoMatch[1]; radius = Number(geoMatch[2]) || radius; }
    bgPending.set(row.qkey, {
      q: { text: row.query_text, key: row.qkey }, depth: row.depth, withEmail: Boolean(row.with_email),
      lang, geo, radius, proxies: [],
    });
  }
  next();
}

function scheduleBackgroundScan(delay = bgScanIntervalMinutes * 60 * 1000) {
  if (bgScanTimer) clearTimeout(bgScanTimer);
  if (!bgScanEnabled) return;
  bgScanTimer = setTimeout(() => {
    bgScanTimer = null;
    scanBackgroundCache();
    scheduleBackgroundScan();
  }, Math.max(1000, delay));
  bgScanTimer.unref();
}

// gosom từ chối proxy không có tài khoản ("failed to start auth proxy ... username and password are required"):
// proxy dùng whitelist IP bỏ qua thông tin đăng nhập nên thêm tài khoản giả là vô hại.
function withProxyCreds(raw) {
  return /^[a-z0-9]+:\/\/[^/@]*@/i.test(raw) ? raw : String(raw).replace(/^([a-z0-9]+:\/\/)/i, '$1proxy:proxy@');
}

// Chạy gosom cho đúng 1 truy vấn → lưu vào kho; trả về số địa điểm
function scrapeQuery(job, q, idx) {
  return new Promise((resolve) => {
    const { geo, radius, depth, extractEmails, lang, proxies } = job.spec;
    const dir = path.join(job.dir, String(idx));
    mkdirSync(dir, { recursive: true, mode: 0o777 });
    writeFileSync(path.join(dir, 'q.txt'), q.text + '\n');
    if (proxies.length) writeFileSync(path.join(dir, 'proxies.txt'), proxies.map(withProxyCreds).join('\n') + '\n', { mode: 0o644 });
    job.container = `maps-job-${job.id.slice(0, 8)}-${idx}`;

    const args = [
      'run', '--rm', '--name', job.container, '--memory', '1800m', '--cpus', '2',
      '-v', `${dir}:/d`, IMAGE,
      '-input', '/d/q.txt', '-results', '/d/out.json', '-json',
      '-depth', String(depth), '-lang', lang, '-c', '1', '-exit-on-inactivity', '90s',
    ];
    if (extractEmails) args.push('-email');
    if (proxies.length) args.push('-proxies-file', '/d/proxies.txt');
    if (geo) args.push('-geo', geo, '-radius', String(radius));

    const proc = spawn('docker', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errTail = '';
    proc.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-2000); });

    const file = path.join(dir, 'out.json');
    let offset = 0;
    let partial = '';
    const placeIds = [];
    const seen = new Set();
    const readNew = () => {
      if (!existsSync(file)) return;
      const size = statSync(file).size;
      if (size <= offset) return;
      const fd = openSync(file, 'r');
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      closeSync(fd);
      offset = size;
      partial += buf.toString('utf8');
      const lines = partial.split('\n');
      partial = lines.pop();
      const now = Date.now();
      for (const line of lines) {
        if (!line.trim()) continue;
        let place;
        try { place = mapPlace(JSON.parse(line)); } catch { continue; }
        if (!place.title) continue;
        const pid = place.placeId || place.id;
        if (seen.has(pid)) continue;
        seen.add(pid);
        placeIds.push(pid);
        stmt.upsertPlace.run(pid, JSON.stringify(place), now, now);
        job.deliverLive(place);
      }
    };
    const poll = setInterval(readNew, 700);
    const limit = job.spec.auto ? AUTO_TIMEOUT_MS : JOB_TIMEOUT_MS;
    const timer = setTimeout(() => { job.timedOut = true; job.aborted = true; execFile('docker', ['rm', '-f', job.container], () => {}); job.endClients('failed', `Quá thời gian tối đa ${limit / 60000} phút`); }, limit);

    const done = (code) => {
      clearInterval(poll);
      clearTimeout(timer);
      readNew();
      let tail = errTail.split('\n').slice(-2).join(' ');
      for (const px of proxies) tail = tail.split(px).join('[proxy]');
      resolve({ code, placeIds, tail: tail.slice(0, 300) });
    };
    proc.on('close', done);
    proc.on('error', (e) => { errTail = e.message; done(-1); });
  });
}

// Ghi nhận một truy vấn đã cào xong trọn vẹn: cập nhật liên kết, đánh dấu cơ sở biến mất là "có thể đã đóng cửa"
function saveRun(job, q, placeIds) {
  const now = Date.now();
  const old = new Set(stmt.linkedIds.all(q.key).map((r) => r.place_id));
  stmt.unlink.run(q.key);
  placeIds.forEach((pid, i) => stmt.link.run(q.key, pid, i));
  const fresh = new Set(placeIds);
  for (const pid of old) if (!fresh.has(pid)) stmt.markClosed.run(pid);
  stmt.saveRun.run(q.key, q.text, now, now, job.spec.depth, job.spec.extractEmails ? 1 : 0, placeIds.length);
}

// Dùng được nếu cào đủ sâu, hoặc kho đã có đủ số địa điểm phần của truy vấn này
const isUsable = (run, spec) => Boolean(run && (run.with_email || !spec.extractEmails)
  && (run.depth >= spec.depth || run.result_count >= Math.ceil(spec.maxResults / spec.queries.length)));

// Giai đoạn 1 (không cần trình duyệt, chạy ngay khi nhận yêu cầu): lấy từ kho những truy vấn còn dùng được.
// Trả về danh sách truy vấn còn thiếu cần cào mới.
function prepareCached(job) {
  const { queries, force, background } = job.spec;
  const live = [];
  let cachedQueries = 0;
  for (const q of queries) {
    const run = force ? null : stmt.getRun.get(q.key);
    if (!isUsable(run, job.spec)) { live.push(q); continue; }
    cachedQueries++;
    stmt.touchRun.run(Date.now(), q.key);
    for (const r of stmt.runPlaces.all(q.key)) {
      const place = JSON.parse(r.data);
      if (r.closed_suspect) place.possiblyClosed = true;
      place.fromCache = true;
      job.count++; job.source.cache++;
      job.emit('place', place);
    }
    if (!job.source.oldestAt || run.last_run_at < job.source.oldestAt) job.source.oldestAt = run.last_run_at;
    if (Date.now() - run.last_run_at > TTL_MS && !bgPending.has(q.key) && !background) {
      bgPending.set(q.key, { q, depth: run.depth, withEmail: Boolean(run.with_email), lang: job.spec.lang, geo: job.spec.geo, radius: job.spec.radius, proxies: job.spec.proxies });
      job.source.refreshing = true; // sẽ cập nhật nền khi máy rảnh
    }
  }
  if (cachedQueries > 0) {
    job.emit('status', {
      status: 'running',
      message: `Lấy ${cachedQueries}/${queries.length} truy vấn từ kho dữ liệu đã lưu${live.length ? `, cào mới ${live.length} truy vấn` : ''}...`,
      cache: { queries: cachedQueries, oldestAt: job.source.oldestAt, refreshing: job.source.refreshing },
    });
  }
  return live;
}

async function runJob(job) {
  const live = job.live;
  const background = Boolean(job.spec.background);
  job.status = 'running';
  mkdirSync(job.dir, { recursive: true, mode: 0o777 });
  if (live.length === job.spec.queries.length) {
    const via = job.spec.proxies.length ? `qua ${job.spec.proxies.length} proxy` : 'IP máy chủ';
    job.emit('status', { status: 'running', message: `Đang mở trình duyệt Google Maps (${live.length} truy vấn, ${via})...` });
  }

  // Đã có dữ liệu từ kho: chờ ngắn để client kịp báo "đủ chỉ tiêu" trước khi mở trình duyệt cào thêm
  if (job.count > 0 && live.length > 0) await new Promise((r) => setTimeout(r, 2500));

  // Giai đoạn 2: cào mới từng truy vấn (tuần tự, 1 trình duyệt)
  let lastErr = '';
  let scrapedAny = 0;
  let idx = 0;
  for (const q of live) {
    if (job.aborted || job.detached) break;
    job.emit('status', { status: 'running', message: `Đang cào: ${q.text}` });
    const r = await scrapeQuery(job, q, idx++);
    if (job.timedOut && job.spec.auto && r.placeIds.length > 0) { // hết giờ nhưng đã lấy được một phần: giữ lại, cặp này sẽ được tách nhỏ
      saveRun(job, q, r.placeIds);
      job.count = r.placeIds.length; job.source.live = r.placeIds.length;
      break;
    }
    if (job.aborted) break;
    if (r.placeIds.length > 0 && (r.code === 0 || !job.aborted)) {
      saveRun(job, q, r.placeIds); // ngay cả khi người dùng đã rời đi, truy vấn này vẫn vào kho
      scrapedAny += r.placeIds.length;
    } else if (r.code !== 0) {
      lastErr = `Engine thoát với mã ${r.code}. ${r.tail}`;
    }
  }

  job.errNote = lastErr;
  if (job.aborted) { job.endClients('cancelled'); return; }
  if (job.count === 0 && !background && !job.detached) {
    const msg = lastErr || (job.spec.proxies.length
      ? 'Không nhận được kết quả: proxy có thể lỗi/sai thông tin, hoặc Google đang chặn, hoặc truy vấn không có kết quả.'
      : 'Không nhận được kết quả: Google có thể đang chặn IP máy chủ (CAPTCHA) hoặc truy vấn không có kết quả. Hãy thử cấu hình proxy.');
    job.endClients('failed', msg);
    return;
  }
  job.endClients('done');
}

// ===== API =====
app.post('/api/jobs', async (req, res) => {
  const b = req.body || {};
  const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(b.lang || '') ? b.lang : 'vi';

  let geo = '';
  let radius = 10000;
  if (b.geo) {
    const m = String(b.geo).match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return res.status(400).json({ error: 'Tọa độ không hợp lệ' });
    geo = `${(+m[1]).toFixed(4)},${(+m[2]).toFixed(4)}`; // làm tròn để các tọa độ gần nhau dùng chung kho
    radius = Math.min(50000, Math.max(500, Number(b.radius) || 10000));
  }
  const texts = (Array.isArray(b.queries) ? b.queries : []).map((q) => clean(q)).filter(Boolean).slice(0, MAX_QUERIES);
  if (texts.length === 0) return res.status(400).json({ error: 'Thiếu truy vấn' });
  const queries = texts.map((text) => ({ text, key: makeKey(text, lang, geo ? `${geo}@${radius}` : '') }));

  let proxies = [];
  if (b.proxies !== undefined && b.proxies !== null) {
    if (!Array.isArray(b.proxies) || b.proxies.length > MAX_PROXIES) return res.status(400).json({ error: `Tối đa ${MAX_PROXIES} proxy` });
    try { proxies = await Promise.all(b.proxies.filter((x) => String(x).trim()).map(validateProxy)); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }

  const user = req.user;
  const usage = stmt.getUsage.get(user.id, vnDay()) || { new_places: 0, refreshes: 0 };
  const force = Boolean(b.refresh);
  if (force && usage.new_places >= user.daily_new) {
    return res.status(429).json({ error: 'Đã hết hạn mức địa điểm mới hôm nay nên không thể làm mới. Hạn mức đặt lại vào 0h (giờ Việt Nam).' });
  }
  if (force && usage.refreshes >= user.daily_refresh) {
    return res.status(429).json({ error: `Hết lượt làm mới hôm nay (${user.daily_refresh} lần/ngày). Dữ liệu đã lưu vẫn dùng được.` });
  }

  const maxResults = Math.min(MAX_RESULTS, Math.max(1, Number(b.maxResults) || 25));
  const depth = neededDepth(maxResults, queries.length);

  if (queue.length >= MAX_QUEUE) return res.status(429).json({ error: 'Hàng đợi đầy, thử lại sau' });
  const job = new Job({ queries, geo, radius, depth, maxResults, extractEmails: Boolean(b.extractEmails), lang, proxies, force, background: false, userId: user.id });
  job.quotaLeft = Math.max(0, user.daily_new - usage.new_places);
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000).unref();
  job.live = prepareCached(job); // dữ liệu có sẵn được đẩy ngay, không chờ hàng đợi
  if (job.live.length === 0) {
    job.cacheOnly = true;
    job.endClients('done'); // đủ từ kho: không cần trình duyệt
    logJob(job);
    next(); // nếu có truy vấn cũ cần cập nhật nền và máy đang rảnh
    return res.json({ id: job.id });
  }
  if (job.quotaLeft <= 0) { // hết hạn mức địa điểm mới: chỉ phục vụ phần có sẵn trong kho
    job.cacheOnly = true;
    job.endClients('done', 'Đã hết hạn mức địa điểm mới hôm nay: chỉ hiển thị dữ liệu đã lưu. Hạn mức đặt lại vào 0h (giờ Việt Nam).');
    logJob(job);
    return res.json({ id: job.id });
  }
  if (force) stmt.addRefresh.run(user.id, vnDay());
  queue.push(job);
  job.emit('status', { status: 'queued', position: queue.length + (running ? 1 : 0) });
  next();
  res.json({ id: job.id });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !canAccess(req.user, job)) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  sseWrite(res, 'status', { status: job.status });
  for (const p of job.history) sseWrite(res, 'place', p);
  if (job.ended) {
    sseWrite(res, 'end', { status: job.endStatus || 'done', message: job.endMessage || '', count: job.count, source: job.sourceLabel(), oldestAt: job.source.oldestAt, refreshing: job.source.refreshing });
    return res.end();
  }
  job.clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    job.clients.delete(res);
    // Người dùng rời trang mà không hủy: sau 30 giây không còn ai xem thì dừng (để truy vấn đang chạy kịp vào kho)
    if (job.clients.size === 0 && !job.ended) {
      setTimeout(() => { if (job.clients.size === 0 && !job.ended) { const i = queue.indexOf(job); if (i >= 0) queue.splice(i, 1); job.detach(); } }, 30000).unref();
    }
  });
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !canAccess(req.user, job)) return res.status(404).end();
  const qi = queue.indexOf(job);
  if (qi >= 0) {
    queue.splice(qi, 1);
    if (req.query.graceful) job.detach(); else job.abort();
    return res.json({ ok: true });
  }
  if (req.query.graceful) job.detach(); else job.abort();
  res.json({ ok: true });
});

// Homepage statistics read directly from the shared warehouse, cached for 15 seconds.
const warehouseStats = createWarehouseStats(db);
app.get('/api/public/warehouse-stats', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(warehouseStats()); }
  catch (error) {
    console.error('Warehouse statistics failed:', error.message);
    res.status(503).json({ error: 'Chưa tải được thống kê dữ liệu.' });
  }
});

app.get('/api/cache/stats', requireAdmin, (_req, res) => {
  const s = stmt.stats.get();
  res.json({ places: s.places, withEmail: s.withEmail, withoutEmail: s.withoutEmail, withPhone: s.withPhone, queries: s.queries, hits: s.hits, bgPending: bgPending.size, ttlDays: TTL_MS / 86400000 });
});

// Báo cáo chi tiết kho theo trạng thái liên hệ (chỉ admin, phân trang để không tải cả kho lên trình duyệt).
app.get('/api/admin/cache/places', requireAdmin, (req, res) => {
  const contactMode = ['withEmail', 'withoutEmail', 'withPhone'].includes(String(req.query.contact)) ? String(req.query.contact) : '';
  if (!contactMode) return res.status(400).json({ error: 'Bộ lọc liên hệ không hợp lệ.' });
  const search = clean(req.query.search, 120).toLowerCase();
  const page = Math.max(0, Number.parseInt(String(req.query.page || '0'), 10) || 0);
  const limit = Math.min(100, Math.max(10, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
  const contactWhere = contactMode === 'withEmail'
    ? "COALESCE(json_extract(data, '$.email'), '') <> ''"
    : contactMode === 'withPhone'
      ? "COALESCE(json_extract(data, '$.phone'), '') <> ''"
      : "COALESCE(json_extract(data, '$.email'), '') = ''";
  const where = [contactWhere];
  const params = [];
  if (search) { where.push('lower(data) LIKE ?'); params.push(`%${search}%`); }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM places WHERE ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT place_id, data, last_seen FROM places WHERE ${whereSql} ORDER BY last_seen DESC, place_id LIMIT ? OFFSET ?`)
    .all(...params, limit, page * limit)
    .map((row) => {
      let p = {};
      try { p = JSON.parse(row.data); } catch { /* dữ liệu lỗi sẽ bị bỏ qua ở phần hiển thị */ }
      return {
        id: row.place_id,
        title: p.title || '', category: p.category || '', address: p.address || '', city: p.city || '', country: p.country || '',
        phone: p.phone || '', website: p.website || '', email: p.email || '', rating: Number(p.rating) || 0,
        reviewsCount: Number(p.reviewsCount) || 0, googleMapsUrl: p.googleMapsUrl || '', lastSeen: row.last_seen,
      };
    });
  res.json({ contact: contactMode, search, page, pageSize: limit, total, rows });
});

// Cấu hình thị trường/logistics do admin quản lý; đọc nhanh từ SQLite, dùng chung cho mọi user.
app.get('/api/admin/market-config', requireAdmin, async (_req, res) => {
  const products = db.prepare('SELECT alias, hs_code AS hsCode, product_group AS productGroup, confidence, reviewed, source FROM product_hs_aliases ORDER BY product_group, alias').all();
  const known = new Set(products.map((p) => p.productGroup));
  for (const row of db.prepare("SELECT DISTINCT product_group AS productGroup, hs_code AS hsCode FROM trade_flows WHERE product_group IS NOT NULL AND product_group != '' ORDER BY product_group").all()) {
    if (!known.has(row.productGroup)) products.push({ alias: '', hsCode: row.hsCode, productGroup: row.productGroup, confidence: 'snapshot', reviewed: 1, source: 'GSO snapshot' });
  }
  const countries = rankAllExportMarkets(db, 200).markets;
  res.json({ countries, products, logistics: logisticsView(db), defaults: defaultLogisticsPoints, timer: await tradeTimerInfo() });
});

app.put('/api/admin/market-config/timer', requireAdmin, async (req, res) => {
  const schedule = String(req.body?.schedule || '').trim();
  const frequency = String(req.body?.frequency || 'daily');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule)) return res.status(400).json({ error: 'Giờ timer phải có dạng HH:MM' });
  if (!['daily', 'monthly', 'quarterly', 'yearly'].includes(frequency)) return res.status(400).json({ error: 'Chu kỳ timer không hợp lệ' });
  const enabled = req.body?.enabled !== false;
  try {
    mkdirSync(path.dirname(TRADE_TIMER_OVERRIDE), { recursive: true });
    const calendar = frequency === 'yearly' ? `*-01-01 ${schedule}:00` : frequency === 'quarterly' ? `*-01,04,07,10-01 ${schedule}:00` : frequency === 'monthly' ? `*-*-01 ${schedule}:00` : `*-*-* ${schedule}:00`;
    writeFileSync(TRADE_TIMER_OVERRIDE, `[Timer]\nOnCalendar=\nOnCalendar=${calendar}\nRandomizedDelaySec=20min\n`, { mode: 0o644 });
    await systemctl(['daemon-reload']);
    await systemctl(enabled ? ['enable', '--now', 'maps-trade-refresh.timer'] : ['disable', '--now', 'maps-trade-refresh.timer']);
    res.json({ ok: true, timer: await tradeTimerInfo() });
  } catch (e) { res.status(500).json({ error: `Không cập nhật được timer: ${e.message}` }); }
});

app.post('/api/admin/market-config/logistics', requireAdmin, (req, res) => {
  try {
    const p = normalizeLogisticsPoint(req.body);
    const r = db.prepare(`INSERT INTO logistics_points (country, product, city, port, airport, logistics_score, logistics_reason, lat, lon, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.country, p.product, p.city, p.port, p.airport, p.logisticsScore, p.logisticsReason, p.lat, p.lon, p.enabled, Date.now());
    loadLogisticsConfig(db);
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { res.status(400).json({ error: e.message || 'Không lưu được điểm logistics' }); }
});

app.patch('/api/admin/market-config/logistics/:id', requireAdmin, (req, res) => {
  try {
    const p = normalizeLogisticsPoint(req.body);
    const r = db.prepare(`UPDATE logistics_points SET country = ?, product = ?, city = ?, port = ?, airport = ?, logistics_score = ?, logistics_reason = ?, lat = ?, lon = ?, enabled = ?, updated_at = ? WHERE id = ?`).run(p.country, p.product, p.city, p.port, p.airport, p.logisticsScore, p.logisticsReason, p.lat, p.lon, p.enabled, Date.now(), Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy điểm logistics' });
    loadLogisticsConfig(db);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message || 'Không cập nhật được điểm logistics' }); }
});

app.delete('/api/admin/market-config/logistics/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM logistics_points WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy điểm logistics' });
  loadLogisticsConfig(db);
  res.json({ ok: true });
});

app.post('/api/admin/market-config/products', requireAdmin, (req, res) => {
  const alias = String(req.body?.alias || '').trim().toLowerCase().slice(0, 120);
  const hsCode = String(req.body?.hsCode || '').replace(/[^0-9]/g, '').slice(0, 10);
  const productGroup = String(req.body?.productGroup || '').trim().slice(0, 160);
  if (!alias || !hsCode || !productGroup) return res.status(400).json({ error: 'Cần nhập từ khóa, mã HS và mặt hàng' });
  db.prepare('INSERT INTO product_hs_aliases (alias, hs_code, product_group, confidence, reviewed, source) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(alias) DO UPDATE SET hs_code = excluded.hs_code, product_group = excluded.product_group, confidence = excluded.confidence, reviewed = 1, source = excluded.source').run(alias, hsCode, productGroup, 'admin', 'admin');
  res.json({ ok: true });
});

app.delete('/api/admin/market-config/products/:alias', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM product_hs_aliases WHERE alias = ? AND source = \'admin\'').run(String(req.params.alias).toLowerCase());
  if (!r.changes) return res.status(404).json({ error: 'Chỉ có thể xóa từ khóa do admin thêm' });
  res.json({ ok: true });
});

// ===== AI gợi ý từ khóa từ hồ sơ người dùng =====
app.use('/api/suggest', requireAuth);
const aiInFlight = new Set();
const profileOf = (uid) => { const r = stmt.getState.get(uid, 'profile'); return r ? cleanProfile(JSON.parse(r.value)) : null; };
const profileHash = (p) => sha256(JSON.stringify([p.offer, p.customers, p.area, p.notes, getAiConfig().systemPrompt, 'buyer-targeting-v3'])); // đổi prompt thì gợi ý cũ hết hiệu lực
// Sản phẩm gõ trực tiếp ở ô tìm (ưu tiên) hoặc lấy từ Hồ sơ
const subjectOf = (uid, product) => {
  const t = typeof product === 'string' ? product.trim().slice(0, 600) : '';
  return t ? { offer: t } : profileOf(uid);
};
const aiUsedToday = (uid) => stmt.aiUsageGet.get(uid, vnDay())?.calls || 0;
const savedSuggestions = (uid) => { const r = stmt.getState.get(uid, 'suggestions'); return r ? JSON.parse(r.value) : null; };


app.get('/api/suggest', (req, res) => {
  const p = subjectOf(req.user.id, req.query.product);
  const trade = p ? rankTradeMarkets(db, p.offer) : { status: 'no_product', markets: [] };
  const exportMarkets = rankAllExportMarkets(db);
  const saved = savedSuggestions(req.user.id);
  const fresh = Boolean(saved && p && saved.hash === profileHash(p) && saved.countries?.length);
  res.json({
    enabled: aiEnabled(), hasProfile: !profileIsEmpty(p), used: aiUsedToday(req.user.id), limit: AI_DAILY_LIMIT,
    profileOffer: profileOf(req.user.id)?.offer || '',
    countries: fresh ? saved.countries : [], buyerTypes: fresh ? saved.buyerTypes || [] : [],
    recommendations: fresh ? buildMarketRecommendations(p?.offer, saved.countries, trade) : null,
    tradeData: trade,
    exportMarkets,
    stale: Boolean(saved?.countries?.length && p && !fresh),
  });
});

// Một lần gọi AI: quốc gia + từ khóa tìm người mua. Thành phố do giao diện tự lấy từ bảng có sẵn.
app.post('/api/suggest', async (req, res) => {
  const user = req.user;
  if (!aiEnabled()) return res.status(503).json({ error: 'Tính năng gợi ý AI chưa được bật trên máy chủ.' });
  const p = subjectOf(user.id, req.body?.product);
  if (profileIsEmpty(p)) return res.status(400).json({ error: 'Hãy nhập sản phẩm xuất khẩu của bạn (vd: cà phê rang xay, hạt điều) rồi bấm AI gợi ý.' });
  const hash = profileHash(p);
  const trade = rankTradeMarkets(db, p.offer);
  const exportMarkets = rankAllExportMarkets(db);
  const saved = savedSuggestions(user.id);
  const used = () => ({ used: aiUsedToday(user.id), limit: AI_DAILY_LIMIT });
  // đã có kết quả cho đúng hồ sơ + prompt: dùng lại, không gọi AI, không trừ lượt
  if (saved && saved.hash === hash && saved.countries?.length) return res.json({ countries: saved.countries, buyerTypes: saved.buyerTypes || [], recommendations: buildMarketRecommendations(p.offer, saved.countries, trade), tradeData: trade, exportMarkets, cached: true, ...used() });
  if (aiUsedToday(user.id) >= AI_DAILY_LIMIT) {
    return res.status(429).json({ error: `Hôm nay bạn đã dùng hết ${AI_DAILY_LIMIT} lượt gợi ý AI. Lượt đặt lại vào 0h (giờ Việt Nam).` });
  }
  if (aiInFlight.has(user.id)) return res.status(429).json({ error: 'Đang xử lý yêu cầu trước, vui lòng đợi.' });
  aiInFlight.add(user.id);
  try {
    stmt.aiUsageAdd.run(user.id, vnDay()); // tính lượt trước khi gọi để không bị lách bằng cách ngắt kết nối
    let result;
    const t0 = Date.now();
    try {
      result = await suggestCountries(p);
    } catch (e) {
      const msg = e instanceof AiError ? e.message : 'Lỗi nội bộ khi gọi AI';
      stmt.aiLogAdd.run(Date.now(), user.id, user.email, 0, 0, 0, 0, msg);
      return res.status(502).json({ error: msg });
    }
    const at = Date.now();
    const countries = mergeAiWithTrade(result.countries, trade, trade.classification || { name: '' });
    stmt.setState.run(user.id, 'suggestions', JSON.stringify({ hash, countries, buyerTypes: result.buyerTypes, at }), at);
    stmt.aiLogAdd.run(at, user.id, user.email, 1, result.usage.input, result.usage.output, result.countries.length, `${((at - t0) / 1000).toFixed(1)}s`);
    res.json({ countries, buyerTypes: result.buyerTypes, recommendations: buildMarketRecommendations(p.offer, countries, trade), tradeData: trade, exportMarkets, cached: false, ...used() });
  } finally {
    aiInFlight.delete(user.id);
  }
});

// Cầu chì AI: trạng thái dừng / quota tuần 9router (chỉ admin). Mật khẩu dashboard chỉ ghi vào.
const aiGuardView = () => {
  const q = getQuotaConfig() || {};
  return { ...aiGuard.status(), router9: usingRouter9(), settings: { enabled: Boolean(q.enabled), url: q.url || '', threshold: q.threshold || 95, hasPassword: Boolean(q.password) } };
};
app.get('/api/admin/ai-guard', requireAdmin, (_req, res) => res.json(aiGuardView()));
app.post('/api/admin/ai-guard/check', requireAdmin, async (_req, res) => { await aiGuard.checkNow(); res.json(aiGuardView()); });
app.post('/api/admin/ai-guard/resume', requireAdmin, (_req, res) => { aiGuard.resume(); res.json(aiGuardView()); });
app.put('/api/admin/ai-guard/settings', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const cur = getQuotaConfig() || {};
  const url = String(b.url || '').trim().replace(/\/+$/, '').slice(0, 500);
  if (url && !/^https?:\/\/\S+$/.test(url)) return res.status(400).json({ error: 'Dashboard URL phải bắt đầu bằng http:// hoặc https://.' });
  const threshold = Math.round(Number(b.threshold));
  if (!(threshold >= 50 && threshold <= 100)) return res.status(400).json({ error: 'Ngưỡng dừng phải từ 50 đến 100.' });
  const password = typeof b.password === 'string' && b.password.trim() ? b.password.trim().slice(0, 500) : cur.password || '';
  if (url && !password) return res.status(400).json({ error: 'Cần nhập mật khẩu dashboard.' });
  const next = { enabled: Boolean(url && password), url, password, threshold };
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai_quota', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
  setQuotaConfig(next);
  await aiGuard.checkNow();
  res.json(aiGuardView());
});

// Cấu hình kết nối AI (chỉ admin). Khóa API chỉ ghi vào, không bao giờ đọc ra.
const aiConfigView = () => {
  const c = getAiConfig();
  return { format: c.format, baseUrl: c.baseUrl, model: c.model, hasKey: Boolean(c.apiKey), keyHint: c.apiKey ? c.apiKey.slice(-4) : '', keySource: c.keySource, enabled: aiEnabled(), systemPrompt: c.systemPrompt, customPrompt: c.customPrompt, defaultPrompt: DEFAULT_SYSTEM_PROMPT, fixedSuffix: FIXED_SUFFIX };
};
app.get('/api/admin/ai-config', requireAdmin, (_req, res) => res.json(aiConfigView()));

app.put('/api/admin/ai-config', requireAdmin, (req, res) => {
  const b = req.body || {};
  try {
    const cur = getAiConfig();
    const next = {
      format: b.format === 'openai' ? 'openai' : 'anthropic',
      baseUrl: normalizeBaseUrl(b.baseUrl),
      model: String(b.model || '').trim().slice(0, 200),
      systemPrompt: (() => { const t = String(b.systemPrompt || '').trim(); return t === DEFAULT_SYSTEM_PROMPT.trim() ? '' : t.slice(0, 6000); })(),
      apiKey: b.clearKey ? '' : typeof b.apiKey === 'string' && b.apiKey.trim() ? b.apiKey.trim().slice(0, 500) : (cur.keySource === 'db' ? cur.apiKey : ''),
    };
    if (/[\s\u0000-\u001f]/.test(next.model)) return res.status(400).json({ error: 'Tên model không được chứa khoảng trắng.' });
    if (next.format === 'openai' && !next.baseUrl) return res.status(400).json({ error: 'Kiểu OpenAI cần nhập Base URL.' });
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
    setAiConfig(next);
    res.json(aiConfigView());
  } catch (e) {
    res.status(400).json({ error: e instanceof AiError ? e.message : 'Không lưu được cấu hình' });
  }
});

// Thử kết nối + tải danh sách model (dùng khóa đã lưu nếu ô khóa để trống)
app.post('/api/admin/ai-config/models', requireAdmin, async (req, res) => {
  const b = req.body || {};
  try {
    const cur = getAiConfig();
    const apiKey = typeof b.apiKey === 'string' && b.apiKey.trim() ? b.apiKey.trim() : cur.apiKey;
    const models = await listModels({ baseUrl: b.baseUrl, apiKey, format: b.format === 'openai' ? 'openai' : 'anthropic' });
    res.json({ ok: true, models });
  } catch (e) {
    res.status(400).json({ error: e instanceof AiError ? e.message : 'Không tải được danh sách model' });
  }
});

// Thử kết nối thật (tải model + gọi 1 câu ngắn), dùng khóa đã lưu nếu ô khóa để trống
app.post('/api/admin/ai-config/test', requireAdmin, async (req, res) => {
  const b = req.body || {};
  try {
    const cur = getAiConfig();
    const apiKey = typeof b.apiKey === 'string' && b.apiKey.trim() ? b.apiKey.trim() : cur.apiKey;
    res.json(await testConnection({ baseUrl: b.baseUrl, apiKey, format: b.format, model: b.model }));
  } catch (e) {
    res.status(400).json({ error: e instanceof AiError ? e.message : 'Không thử được kết nối' });
  }
});

// Theo dõi việc chạy ngầm (chỉ admin)
app.get('/api/admin/background', requireAdmin, (_req, res) => {
  const s = stmt.stats.get();
  res.json({
    now: Date.now(),
    running: running ? { ...jobView(running), status: running.status } : null,
    backgroundRunning: [...backgroundRuns, ...autoExtra].map((job) => ({ ...jobView(job), status: job.status })),
    workerCount: bgWorkerLimit,
    scanEnabled: bgScanEnabled,
    scanIntervalMinutes: bgScanIntervalMinutes,
    queue: queue.map(jobView),
    pending: [...bgPending.values()].map((e) => ({ query: e.q.text, depth: e.depth, withEmail: e.withEmail, lang: e.lang, proxies: (e.proxies || []).length })),
    autoQueue: {
      total: db.prepare("SELECT COUNT(*) AS n FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE t.status='running' AND r.status='pending'").get().n,
      next: db.prepare("SELECT r.keyword, r.city, r.level, r.attempts, t.* FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE t.status='running' AND r.status='pending' ORDER BY r.task_id, r.id LIMIT 15").all()
        .map((x) => { const w = taskWait(x); return { keyword: x.keyword, city: x.city, level: x.level, attempts: x.attempts, product: x.product, country: x.country, restUntil: w ? w.until : 0, waitReason: w ? w.reason : '' }; }),
    },
    autoQueues: Object.fromEntries([['manual', '=0'], ['plan', '>0']].map(([k, cond]) => [k, {
      total: db.prepare(`SELECT COUNT(*) AS n FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE t.status='running' AND r.status='pending' AND t.plan_round${cond}`).get().n,
      running: db.prepare(`SELECT COUNT(*) AS n FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE r.status='running' AND t.plan_round${cond}`).get().n,
      completed: db.prepare(`SELECT COUNT(*) AS n FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE r.status IN ('done','empty','error') AND t.plan_round${cond}`).get().n,
      next: db.prepare(`SELECT r.keyword, r.city, r.level, r.attempts, t.* FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE t.status='running' AND r.status='pending' AND t.plan_round${cond} ORDER BY r.task_id, r.id LIMIT 15`).all()
        .map((x) => { const w = taskWait(x); return { keyword: x.keyword, city: x.city, level: x.level, attempts: x.attempts, product: x.product, country: x.country, restUntil: w ? w.until : 0, waitReason: w ? w.reason : '' }; }),
    }])),
    bgDoneThisHour, bgPerHour: BG_QUERIES_PER_HOUR, ttlDays: TTL_MS / 86400000,
    recent: stmt.recentLog.all().map((r) => ({
      id: r.id, kind: r.kind, auto: r.kind === 'auto', background: r.kind === 'background', force: r.kind === 'force', cacheOnly: r.kind === 'cache',
      user: r.user_email, queries: JSON.parse(r.queries), count: r.count, cache: r.cache_n, live: r.live_n, proxies: r.proxies,
      createdAt: r.started_at, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, message: r.message || '', detached: false,
    })),
    ai: (() => {
      const st = stmt.aiLogStats.get(Date.now() - JOB_LOG_KEEP_MS);
      return {
        enabled: aiEnabled(), model: getAiConfig().model, dailyLimit: AI_DAILY_LIMIT,
        calls30d: st.calls, ok30d: st.ok, inputTokens30d: st.inp, outputTokens30d: st.outp,
        recent: stmt.aiLogRecent.all().map((r) => ({ at: r.at, user: r.user_email, ok: Boolean(r.ok), input: r.input_tokens, output: r.output_tokens, items: r.items, message: r.message || '' })),
      };
    })(),
    logTotal: stmt.countLog.get().n, logKeepDays: JOB_LOG_KEEP_MS / 86400000,
    cache: { places: s.places, withEmail: s.withEmail, withoutEmail: s.withoutEmail, withPhone: s.withPhone, queries: s.queries, hits: s.hits },
  });
});

app.put('/api/admin/background/workers', requireAdmin, (req, res) => {
  const workers = Number(req.body?.workers);
  if (!Number.isInteger(workers) || workers < 1 || workers > 8) {
    return res.status(400).json({ error: 'Số luồng phải là số nguyên từ 1 đến 8.' });
  }
  bgWorkerLimit = workers;
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('background', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ workers, enabled: bgScanEnabled, intervalMinutes: bgScanIntervalMinutes }));
  next();
  res.json({ ok: true, workerCount: bgWorkerLimit });
});

app.put('/api/admin/background/config', requireAdmin, (req, res) => {
  const workers = Number(req.body?.workers);
  const intervalMinutes = Number(req.body?.intervalMinutes);
  const enabled = req.body?.enabled === true;
  if (!Number.isInteger(workers) || workers < 1 || workers > 8) return res.status(400).json({ error: 'Số luồng phải là số nguyên từ 1 đến 8.' });
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 1440) return res.status(400).json({ error: 'Chu kỳ quét phải từ 5 đến 1440 phút.' });
  bgWorkerLimit = workers;
  bgScanIntervalMinutes = intervalMinutes;
  bgScanEnabled = enabled;
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('background', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ workers, enabled, intervalMinutes }));
  if (bgScanEnabled) { scanBackgroundCache(); scheduleBackgroundScan(); }
  else if (bgScanTimer) { clearTimeout(bgScanTimer); bgScanTimer = null; }
  res.json({ ok: true, workerCount: bgWorkerLimit, scanEnabled: bgScanEnabled, scanIntervalMinutes: bgScanIntervalMinutes });
});


// ===== Tác vụ tự động (admin): sản phẩm + quốc gia → từ khóa AI × thành phố, chạy lần lượt khi máy rảnh =====
let autoNotBefore = 0;
let autoPicking = false;

const autoExtra = new Set(); // luồng phụ của lịch xoay vòng (chỉ chạy khi tác vụ có proxy xoay IP)
let extraNotBefore = 0;
const memAvailMb = () => { try { return Number(readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/)[1]) / 1024; } catch { return Infinity; } };
// Số luồng tự động điều chỉnh theo CPU/RAM: tối thiểu AUTO_MIN_THREADS, tối đa AUTO_MAX_THREADS.
// Mỗi container cào giới hạn 1,8GB RAM/2 CPU: luồng thứ 3 trở đi chỉ mở khi RAM trống đủ cho một container nữa và tải CPU chưa cao.
// Không ngắt luồng đang chạy; khi tài nguyên thấp thì số luồng tự giảm dần vì không mở thêm.
const AUTO_MIN_THREADS = Math.max(1, Number(process.env.AUTO_MIN_THREADS) || 2);
const AUTO_MAX_THREADS = Math.max(AUTO_MIN_THREADS, Number(process.env.AUTO_MAX_THREADS) || 6);
const AUTO_MIN_FREE_MB = 2200, AUTO_FLOOR_FREE_MB = 1200, AUTO_MAX_LOAD = 0.75;
const cpuLoad = () => os.loadavg()[0] / Math.max(1, os.cpus().length);
const recentLaunches = []; // thời điểm mở các luồng gần đây: container mới chưa kịp chiếm RAM/CPU nên phải tăng luồng từ từ, mỗi lần một luồng
const AUTO_RAMP_MS = 60000, AUTO_RESERVE_MB = 1000;
function autoThreadBudget() { // { allowed, mem, load }: có được mở thêm một luồng nữa (khi đang chạy `n` luồng) hay không
  while (recentLaunches.length && Date.now() - recentLaunches[0] > AUTO_RAMP_MS) recentLaunches.shift();
  const mem = memAvailMb() - recentLaunches.length * AUTO_RESERVE_MB, load = cpuLoad() + recentLaunches.length * 0.15, n = (running?.spec.auto ? 1 : 0) + autoExtra.size;
  const allowed = n < AUTO_MIN_THREADS ? mem >= AUTO_FLOOR_FREE_MB : n < AUTO_MAX_THREADS && mem >= AUTO_MIN_FREE_MB && load < AUTO_MAX_LOAD;
  return { allowed, mem: Math.round(mem), load: Math.round(load * 100) / 100, n };
}

// Chọn cặp chờ đầu tiên của tác vụ không đang nghỉ và đang trong khung giờ làm việc; tác vụ bị chặn → trả giờ thức dậy sớm nhất
function selectAutoPair(extra) {
  let r = null, wake = 0;
  if (extra && planProxies().length === 0) return { r, wake }; // luồng phụ chỉ khi có proxy: không có proxy (hết hạn/dự phòng) thì xếp hàng chung 1 luồng với tab Thủ công, không chạy song song cùng IP máy chủ
  const filter = extra ? " AND plan_round>0 AND proxies != '[]'" : '';
  const keyOk = !planBlocked(loadPlan());
  for (const t of db.prepare(`SELECT * FROM auto_tasks WHERE status='running'${filter} AND EXISTS (SELECT 1 FROM auto_runs x WHERE x.task_id=auto_tasks.id AND x.status='pending') ORDER BY id`).all()) {
    const w = taskWait(t) || (t.plan_round > 0 && !keyOk ? { until: Date.now() + 15000 } : null); // chế độ Key mà chưa có proxy hợp lệ: chờ, tuyệt đối không cào bằng IP máy chủ
    if (w) { wake = wake ? Math.min(wake, w.until) : w.until; continue; }
    r = db.prepare("SELECT r.*, t.max_results, t.proxies, t.plan_round FROM auto_runs r JOIN auto_tasks t ON t.id=r.task_id WHERE r.task_id=? AND r.status='pending' ORDER BY r.id LIMIT 1").get(t.id);
    if (r) break;
  }
  return { r, wake };
}

// Bắt đầu cào một cặp. extra=false: luồng chính (chiếm `running`, nhường người dùng); extra=true: luồng phụ
function launchAuto(r, extra) {
  autoPicking = true;
  try {
    let proxies = [];
    try { proxies = JSON.parse(r.proxies || '[]'); } catch { proxies = []; }
    if (r.plan_round > 0) { const c = loadPlan(); if (c.keys.length || c.proxies.length) proxies = planProxies(); } // luôn dùng proxy mới nhất đã sẵn sàng, không dùng cột cũ trong DB
    stmt.autoRunStart.run(Date.now(), r.id);
    const job = new Job({
      queries: [{ text: r.qtext, key: makeKey(r.qtext, 'vi', '') }], geo: '', radius: 10000, depth: neededDepth(MAX_RESULTS, 1), maxResults: MAX_RESULTS, // khóa tính lại từ qtext: khóa cũ lưu trong DB của từ khóa không phải Latin đã bị trùng
      extractEmails: true, lang: 'vi', proxies, force: false, background: true, auto: { runId: r.id, taskId: r.task_id },
    });
    jobs.set(job.id, job);
    setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000).unref();
    job.live = prepareCached(job);
    if (job.live.length === 0) { // cặp này đã có đủ trong kho → báo cáo luôn, không mở trình duyệt
      job.cacheOnly = true;
      job.endClients('done');
      logJob(job);
      finishAutoRun(job);
      setImmediate(next);
      return;
    }
    if (extra) autoExtra.add(job); else running = job;
    recentLaunches.push(Date.now());
    job.startedAt = Date.now();
    runJob(job).catch((e) => { console.error('auto runJob error', e); job.endClients('failed', 'Lỗi nội bộ máy chủ'); }).finally(() => {
      rmSync(job.dir, { recursive: true, force: true });
      logJob(job);
      finishAutoRun(job);
      if (extra) { autoExtra.delete(job); extraNotBefore = Date.now() + AUTO_GAP_MS; } else { autoNotBefore = Date.now() + AUTO_GAP_MS; running = null; }
      next();
    });
    setTimeout(next, 5000).unref(); // lấp đầy các luồng phụ, mỗi lần một luồng (autoThreadBudget giữ chỗ RAM cho container vừa mở)
  } finally {
    autoPicking = false;
  }
}

async function pickAuto() {
  if (running || autoPicking) return;
  const wait = autoNotBefore - Date.now();
  if (wait > 0) { setTimeout(next, wait + 50).unref(); return; }
  const sp = stmt.autoNextSplit.get();
  if (sp) {
    autoPicking = true;
    try { await splitRun(sp); } catch (e) { console.error('splitRun error', e); stmt.autoSetSplit.run('failed', sp.id); } finally {
      settleAutoTasks(db);
      autoPicking = false;
      setImmediate(planTick);
    }
    setImmediate(next);
    return;
  }
  const { r, wake } = selectAutoPair(false);
  if (!r) {
    if (wake) setTimeout(next, Math.max(1000, wake - Date.now()) + 100).unref();
    return;
  }
  launchAuto(r, false);
}

// Luồng phụ: chỉ khi luồng chính đang chạy một cặp tự động, không có người dùng chờ, còn đủ RAM, và tác vụ có proxy (IP xoay)
function pickAutoExtra() {
  if (autoPicking || queue.length > 0) return;
  const wait = extraNotBefore - Date.now();
  if (wait > 0) { setTimeout(next, wait + 50).unref(); return; }
  if (!autoThreadBudget().allowed) { if (autoExtra.size < AUTO_MAX_THREADS - 1) setTimeout(next, 60000).unref(); return; }
  const { r, wake } = selectAutoPair(true);
  if (!r) {
    if (wake) setTimeout(next, Math.max(1000, wake - Date.now()) + 100).unref();
    return;
  }
  launchAuto(r, true);
}

// Khung giờ làm việc theo múi giờ của nước đích: chỉ cào khi giờ địa phương nằm trong [win_start, win_end)
const hourFmt = new Map(); // tạo Intl.DateTimeFormat rất tốn: dùng lại theo múi giờ (trước đây tạo mới hàng chục nghìn lần mỗi lượt chọn tác vụ → tràn RAM)
const localHour = (tz, t) => {
  try {
    let f = hourFmt.get(tz);
    if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }); hourFmt.set(tz, f); }
    return Number(f.format(new Date(t)));
  } catch { return null; }
};
const inWindow = (task, t = Date.now()) => {
  if (!task.win_on || !task.tz) return true;
  const h = localHour(task.tz, t);
  if (h === null) return true;
  return task.win_start <= task.win_end ? h >= task.win_start && h < task.win_end : h >= task.win_start || h < task.win_end;
};
const nextWindowOpen = (task, t = Date.now()) => { // thời điểm gần nhất (làm tròn 5 phút) mà khung giờ mở; 0 nếu đang mở
  if (inWindow(task, t)) return 0;
  for (let i = 1; i <= 24 * 12 + 12; i++) { const x = t + i * 5 * 60000; if (inWindow(task, x)) return x; }
  return 0;
};
// Thời điểm tác vụ được phép cào tiếp: sau nghỉ định kỳ và trong khung giờ làm việc
const taskWait = (task, now = Date.now()) => {
  const restAt = Math.max(task.rest_until, task.plan_round > 0 && planRestUntil > now && planProxies().length === 0 ? planRestUntil : 0); // tác vụ của lịch xoay vòng dùng chung một bộ đếm nghỉ — chỉ khi chạy không proxy (có proxy thì nghỉ chung không còn hiệu lực)
  const rest = restAt > now ? restAt : 0;
  const win = nextWindowOpen(task, Math.max(now, rest));
  return win ? { until: win, reason: 'window' } : rest ? { until: rest, reason: 'rest' } : null;
};

// Thời gian nghỉ ngẫu nhiên đều trong [min, max] phút (max < min hoặc 0 = cố định bằng min), làm tròn đến giây
const restDelayMs = (minM, maxM) => {
  const lo = Math.min(minM, maxM > 0 ? maxM : minM), hi = Math.max(minM, maxM);
  return Math.round((lo + Math.random() * (hi - lo)) * 60) * 1000;
};

function finishAutoRun(job) {
  const { runId, taskId } = job.spec.auto;
  const run = db.prepare('SELECT * FROM auto_runs WHERE id=?').get(runId);
  if (job.stopRequested) { // admin bấm Dừng: trả cặp về hàng chờ, không tính một lần thử
    db.prepare("UPDATE auto_runs SET status='pending', message='Tạm dừng — sẽ chạy lại cặp này' WHERE id=?").run(runId);
    return;
  }
  const partial = Boolean(job.timedOut && job.count > 0);
  let status = job.aborted && !partial ? 'error' : 'done';
  let msg = job.endMessage || '';
  if (partial) msg = `Hết giờ (${AUTO_TIMEOUT_MS / 60000} phút): lấy được một phần ${job.count} lead → tách thành khu nhỏ để lấy nốt`;
  if (job.count === 0) {
    status = job.errNote ? 'error' : 'empty';
    msg = job.errNote || msg || 'Google không trả kết quả cho cặp này';
  } else if (job.cacheOnly) msg = 'Lấy từ kho đã lưu';
  // nghỉ định kỳ (chống bị Google chặn khi không có proxy): sau mỗi N lần cào thật thì nghỉ M phút
  if (!job.cacheOnly) {
    const t = db.prepare('SELECT burst_n, rest_min, rest_max, since_rest, plan_round, proxies FROM auto_tasks WHERE id=?').get(taskId);
    if (t && t.plan_round > 0) { // có proxy xoay IP thì không cần nghỉ chung
      const cfg = loadPlan();
      if ((job.spec.proxies || []).length === 0 && cfg.burstN > 0 && ++planSince >= cfg.burstN) { planSince = 0; planRestUntil = Date.now() + restDelayMs(cfg.restMin, cfg.restMax); }
    } else if (t && t.burst_n > 0 && (t.rest_min > 0 || t.rest_max > 0)) {
      const n = t.since_rest + 1;
      if (n >= t.burst_n) db.prepare('UPDATE auto_tasks SET since_rest=0, rest_until=? WHERE id=?').run(Date.now() + restDelayMs(t.rest_min, t.rest_max), taskId);
      else db.prepare('UPDATE auto_tasks SET since_rest=? WHERE id=?').run(n, taskId);
    }
  }
  // gián đoạn / lỗi tạm thời: thử lại thay vì bỏ sót cặp này
  const maxTry = status === 'error' ? AUTO_RETRY_ERROR : status === 'empty' && !job.cacheOnly ? AUTO_RETRY_EMPTY : 1;
  if (run && run.attempts < maxTry) {
    db.prepare("UPDATE auto_runs SET status='pending', attempts=attempts+1, message=? WHERE id=?").run(`Thử lại lần ${run.attempts + 1}/${maxTry} — ${String(msg).slice(0, 200)}`, runId);
    return;
  }
  const saturated = status === 'done' && (job.count >= AUTO_SAT || partial);
  stmt.autoRunEnd.run(status, job.count, job.source.cache, job.source.live, Date.now(), String(msg).slice(0, 300), runId);
  if (saturated) db.prepare('UPDATE auto_runs SET saturated=1, split_state=? WHERE id=?').run(run && run.level >= AUTO_MAX_LEVEL ? 'maxlevel' : 'todo', runId);
  // cầu chì: nhiều cặp liên tiếp lỗi hẳn (thường do Google chặn IP) → dừng để admin xử lý, không đốt hết các cặp còn lại
  const last = db.prepare("SELECT status FROM auto_runs WHERE task_id=? AND status IN ('done','empty','error') ORDER BY finished_at DESC, id DESC LIMIT ?").all(taskId, AUTO_BREAKER);
  if (last.length === AUTO_BREAKER && last.every((x) => x.status === 'error')) {
    stmt.autoTaskEnd.run('stopped', Date.now(), `Tự dừng: ${AUTO_BREAKER} cặp liên tiếp lỗi (có thể Google chặn IP). Kiểm tra proxy rồi bấm Tiếp tục.`, taskId);
    return;
  }
  if (stmt.autoLeft.get(taskId).n === 0) { stmt.autoTaskEnd.run('done', Date.now(), '', taskId); setImmediate(planTick); }
}

// ---- Lịch xoay vòng theo dữ liệu xuất khẩu (GSO) ----
// Mỗi vòng, mỗi mặt hàng được cào ĐÚNG MỘT nước nhập khẩu (vòng 1 = nước kim ngạch cao nhất, vòng 2 = nước thứ hai…);
// mỗi nước chỉ cào vài từ khóa × vài thành phố lớn. Vòng sau chỉ bắt đầu khi mọi tác vụ của vòng trước đã xong/dừng.
const PLAN_SKIP_HS = new Set(['2709', '2710', '2701', '26', '2523']); // dầu thô, xăng dầu, than, quặng, xi măng: không phải ngành tìm người mua trên Google Maps
const PLAN_DEFAULT = { enabled: false, round: 0, filled: false, cycles: 0, keywords: 3, cities: 3, burstN: 5, restMin: 20, restMax: 40, proxies: [], proxyExpiresAt: 0, keys: [], note: '' };
let planRestUntil = 0, planSince = 0, planBusy = false;
function loadPlan() {
  try {
    const r = db.prepare("SELECT value FROM app_settings WHERE key='autoplan'").get();
    if (r) {
      const c = { ...PLAN_DEFAULT, ...JSON.parse(r.value) };
      if (c.proxy && !c.proxies.length) c.proxies = [c.proxy]; // cấu hình cũ: một proxy duy nhất
      delete c.proxy;
      return c;
    }
  } catch { /* dùng mặc định */ }
  return { ...PLAN_DEFAULT };
}
const savePlan = (cfg) => db.prepare("INSERT INTO app_settings (key, value) VALUES ('autoplan', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(cfg));
// Danh sách mặt hàng + nước (đã sắp theo kim ngạch giảm dần) từ snapshot theo mặt hàng mới nhất
function planProducts() {
  const snap = db.prepare("SELECT snapshot_id AS id FROM trade_flows WHERE hs_code != 'TOTAL' ORDER BY period DESC, snapshot_id DESC LIMIT 1").get();
  if (!snap) return [];
  const rows = db.prepare("SELECT hs_code, product_group, partner_name, SUM(export_value_usd) AS v FROM trade_flows WHERE snapshot_id=? AND hs_code != 'TOTAL' GROUP BY hs_code, product_group, partner_name ORDER BY v DESC").all(snap.id);
  const by = new Map();
  for (const r of rows) {
    if (PLAN_SKIP_HS.has(r.hs_code) || !citiesOfCountry(r.partner_name)) continue;
    const key = `${r.hs_code}|${r.product_group}`;
    if (!by.has(key)) by.set(key, { key, product: r.product_group, total: 0, markets: [] });
    const p = by.get(key); p.total += Number(r.v) || 0; p.markets.push(citiesOfCountry(r.partner_name).name);
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}
// Proxy xoay theo Key (proxy.vn): mỗi Key cho một proxy sống ~30 phút; gọi lại gần hết hạn để lấy proxy (IP) mới.
// Key là bí mật: chỉ lưu trong app_settings, không bao giờ trả về trình duyệt hay ghi vào log.
const KEY_REFRESH_BEFORE_MS = 150000;
const KEY_SETTLE_MS = 60000; // sau khi lấy proxy mới, chờ thêm 1 phút rồi mới cào tiếp
const keyState = new Map(); // key -> { proxy, expiresAt, error, retryAt, location, carrier }
let serverIpCache = { ip: '', at: 0 };
// Proxy còn hạn được lưu để khởi động lại (mỗi lần deploy) dùng tiếp, không gọi lại API (nhà cung cấp giới hạn tần suất đổi IP)
const saveKeyState = () => db.prepare("INSERT INTO app_settings (key, value) VALUES ('keyproxy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
  .run(JSON.stringify(Object.fromEntries([...keyState].filter(([, st]) => st.proxy && st.expiresAt > Date.now()).map(([k, st]) => [k, { proxy: st.proxy, expiresAt: st.expiresAt, location: st.location, carrier: st.carrier, tokenExpires: st.tokenExpires || 0 }]))));
try {
  const saved = db.prepare("SELECT value FROM app_settings WHERE key='keyproxy'").get();
  if (saved) for (const [k, st] of Object.entries(JSON.parse(saved.value))) if (st.expiresAt > Date.now() + 60000 && loadPlan().keys.includes(k)) keyState.set(k, { ...st, error: '', retryAt: 0 });
} catch { /* không có thì lấy mới */ }
async function serverPublicIp() {
  if (process.env.SERVER_PUBLIC_IP) return process.env.SERVER_PUBLIC_IP;
  if (serverIpCache.ip && Date.now() - serverIpCache.at < 3600000) return serverIpCache.ip;
  try {
    const t = (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) })).text()).trim();
    if (/^[0-9a-f.:]{7,45}$/i.test(t)) serverIpCache = { ip: t, at: Date.now() };
  } catch { /* dùng IP cũ nếu có */ }
  return serverIpCache.ip;
}
const keyProxies = () => [...keyState.values()].filter((st) => st.proxy && st.expiresAt > Date.now()).map((st) => st.proxy);
// Proxy "khỏe" = còn hạn quá cửa sổ gia hạn và đã qua thời gian chờ sau khi lấy: chỉ khi có proxy khỏe mới mở cặp mới (đang đổi proxy thì dừng mở cặp mới)
const keyHealthy = () => { const now = Date.now(); return [...keyState.values()].filter((st) => st.proxy && st.expiresAt - now >= KEY_REFRESH_BEFORE_MS && now >= (st.readyAt || 0)).map((st) => st.proxy); };
const ownProxyExpired = (c) => c.proxyExpiresAt > 0 && c.proxyExpiresAt <= Date.now();
// Key coi là hết hạn/không dùng được khi MỌI Key liên tục không lấy được proxy suốt KEY_FAIL_FALLBACK_MS
// (không dựa vào 'Token expiration date' của nhà cung cấp: giá trị này không phải hạn của Key, từng trả về mốc đã qua ngay lúc vừa lấy được proxy)
const KEY_FAIL_FALLBACK_MS = 30 * 60 * 1000;
const keysExpired = (c) => c.keys.length > 0 && c.keys.every((k) => { const st = keyState.get(k); return st && st.failingSince > 0 && Date.now() - st.failingSince >= KEY_FAIL_FALLBACK_MS && !(st.proxy && st.expiresAt > Date.now()); });
// Proxy đã hết hạn mà không gia hạn → lịch chạy như tab Thủ công không proxy: IP máy chủ, 1 luồng, nghỉ chống chặn
// Mốc chính là NGÀY HẾT HẠN do admin nhập (áp dụng cho cả Key lẫn proxy tự nhập); riêng Key còn tự rơi vào dự phòng nếu liên tục không lấy được proxy ≥30 phút
const planFallback = (c) => (c.keys.length > 0 || c.proxies.length > 0) && (ownProxyExpired(c) || (c.keys.length > 0 && keysExpired(c)));
// Proxy dùng cho tác vụ của lịch: chế độ Key → proxy khỏe từ Key; không thì proxy tự nhập; hết hạn → không proxy
const planProxies = () => { const c = loadPlan(); return planFallback(c) ? [] : c.keys.length ? keyHealthy() : c.proxies; };
// Có Key/proxy còn hạn nhưng chưa dùng được (đang đổi proxy) → không mở cặp mới, tuyệt đối không cào bằng IP máy chủ
const planBlocked = (c) => !planFallback(c) && c.keys.length > 0 && keyHealthy().length === 0;
// Đồng bộ proxy của các tác vụ lịch đang chạy với cấu hình hiện tại (kể cả khi chuyển sang/ra chế độ không proxy)
function syncPlanProxies() {
  const c = loadPlan();
  if (planBlocked(c)) return;
  const list = planProxies();
  if (list.length > 0 && (planRestUntil > 0 || planSince > 0)) { planRestUntil = 0; planSince = 0; } // quay lại chế độ có proxy: bỏ nghỉ chung còn dư từ chế độ dự phòng
  const json = JSON.stringify(list);
  db.prepare("UPDATE auto_tasks SET proxies=? WHERE plan_round>0 AND status='running' AND proxies != ?").run(json, json);
}
setInterval(() => { try { syncPlanProxies(); next(); } catch (e) { console.error('syncPlanProxies', e?.message); } }, 30000).unref();
setTimeout(() => { try { syncPlanProxies(); next(); } catch (e) { console.error('syncPlanProxies', e?.message); } }, 3000).unref(); // ngay sau khi khởi động: đồng bộ lại cột proxy của tác vụ lịch
let keyRefreshing = false;
async function refreshKeyProxies(force = false) {
  if (keyRefreshing) return;
  keyRefreshing = true;
  try {
    const cfg = loadPlan();
    for (const k of [...keyState.keys()]) if (!cfg.keys.includes(k)) keyState.delete(k);
    if (!cfg.keys.length) return;
    if (ownProxyExpired(cfg)) return; // đã quá ngày hết hạn admin nhập: không gọi API của nhà cung cấp nữa
    const whitelist = await serverPublicIp();
    for (const key of cfg.keys) {
      const st = keyState.get(key) || {}, now = Date.now();
      if (!force && st.proxy && st.expiresAt - now >= KEY_REFRESH_BEFORE_MS) continue;
      if (!force && st.retryAt > now) continue;
      try {
        const r = await fetchKeyProxy(key, { whitelist });
        await validateProxy(r.proxy);
        keyState.set(key, { ...r, error: '', retryAt: 0, readyAt: Date.now() + KEY_SETTLE_MS });
        console.log(`[key …${key.slice(-4)}] lấy proxy OK ${r.proxy.replace(/^http:\/\/([^@]*@)?/, '')} ${r.carrier} ${r.location}, sống ${Math.round((r.expiresAt - Date.now()) / 1000)}s, chạy tiếp sau ${KEY_SETTLE_MS / 1000}s`);
      } catch (e) {
        keyState.set(key, { ...st, error: String(e?.message || e).slice(0, 200), retryAt: Date.now() + (e?.retryAfterMs || 60000), failingSince: st.failingSince || Date.now() });
        console.log(`[key …${key.slice(-4)}] lỗi: ${String(e?.message || e).slice(0, 200)} — thử lại sau ${Math.round((e?.retryAfterMs || 60000) / 1000)}s`);
      }
    }
    saveKeyState();
    const list = keyHealthy();
    if (list.length) { // cặp mới dùng proxy mới; cặp đang cào giữ proxy cũ cho tới khi xong
      const json = JSON.stringify(list);
      db.prepare("UPDATE auto_tasks SET proxies=? WHERE plan_round>0 AND status='running' AND proxies != ?").run(json, json);
    }
  } finally { keyRefreshing = false; }
}
setInterval(() => { refreshKeyProxies().then(() => next()).catch((e) => console.error('refreshKeyProxies', e?.message)); }, 30000).unref();
setTimeout(() => { refreshKeyProxies().catch((e) => console.error('refreshKeyProxies', e?.message)); }, 6000).unref();

async function createPlanTask(p, country, cfg) {
  const known = citiesOfCountry(country);
  const cities = known.cities.slice(0, cfg.cities);
  const t0 = Date.now();
  const ai = await suggestCountries({ offer: `${p.product} (xuất khẩu từ Việt Nam)`, area: `Bắt buộc có "${known.name}" trong danh sách quốc gia trả về.` });
  stmt.aiLogAdd.run(Date.now(), 0, 'lịch xoay vòng', 1, ai.usage.input, ai.usage.output, ai.countries.length, `lịch xoay vòng ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const hit = ai.countries.find((c) => c.country.toLowerCase() === known.name.toLowerCase());
  const keywords = [...new Set([...(hit?.keywords || []), ...ai.buyerTypes.map((x) => x.keyword)].map((k) => k.trim()).filter(Boolean))].slice(0, cfg.keywords);
  if (!keywords.length) throw new Error(`AI không trả từ khóa cho ${p.product} → ${known.name}`);
  const tz = CITY_DATA.tz?.[known.name] || '';
  const re = new RegExp(`(^|,\\s*)${known.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  inTx(() => {
    const r = db.prepare('INSERT INTO auto_tasks (created_by, created_email, product, country, max_results, keywords, cities, buyer_types, proxies, status, created_at, burst_n, rest_min, rest_max, win_on, win_start, win_end, tz, plan_round, plan_group) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(0, 'Lịch xoay vòng', `${p.product} (xuất khẩu)`, known.name, MAX_RESULTS, JSON.stringify(keywords), JSON.stringify(cities), JSON.stringify(ai.buyerTypes), JSON.stringify(planProxies()), 'running', Date.now(), 0, 0, 0, tz ? 1 : 0, 8, 19, tz, cfg.round + 1, p.key);
    const ins = db.prepare('INSERT INTO auto_runs (task_id, keyword, city, qtext, qkey, status) VALUES (?,?,?,?,?,?)');
    for (const city of cities) for (const kw of keywords) {
      const qtext = `${kw} ${city}${re.test(city) ? '' : `, ${known.name}`}`;
      ins.run(Number(r.lastInsertRowid), kw, city, qtext, makeKey(qtext, 'vi', ''), 'pending');
    }
  });
}
async function planTick() {
  if (planBusy) return;
  planBusy = true;
  try {
    const cfg = loadPlan();
    if (!cfg.enabled) return;
    settleAutoTasks(db);
    // Recover completed old plans once, then expand subsequent markets at cycle end.
    if (!cfg.expansionVersion) {
      let expanded;
      inTx(() => { expanded = expandAutoPlan(db, { citiesOfCountry, makeKey, maxRuns: AUTO_MAX_RUNS, maxLevel: AUTO_MAX_LEVEL, retryFailed: true }); });
      cfg.expansionVersion = 1;
      cfg.note = `Mở rộng: ${expanded.tasks} tác vụ, +${expanded.pairs} cặp thành phố, ${expanded.splits} khu vực tách sâu`;
      savePlan(cfg);
      next();
    }
    // Expansion from an older round must finish before advancing the cycle.
    if (db.prepare("SELECT 1 FROM auto_tasks WHERE plan_round>0 AND status='running' AND plan_round!=?").get(cfg.round + 1)) return;
    if (!aiEnabled()) { if (cfg.note !== 'AI chưa được cấu hình') savePlan({ ...cfg, note: 'AI chưa được cấu hình' }); return; }
    const products = planProducts();
    if (!products.length) { savePlan({ ...cfg, enabled: false, note: 'Chưa có dữ liệu xuất khẩu theo mặt hàng' }); return; }
    for (let guard = 0; guard < 10; guard++) {
      if (cfg.filled) {
        if (db.prepare("SELECT 1 FROM auto_tasks WHERE plan_round=? AND status='running'").get(cfg.round + 1)) return; // vòng hiện tại chưa xong
        cfg.round++; cfg.filled = false;
      }
      const items = products.filter((p) => p.markets[cfg.round]).map((p) => ({ p, country: p.markets[cfg.round] }));
      if (!items.length) {
        let expanded;
        inTx(() => { expanded = expandAutoPlan(db, { citiesOfCountry, makeKey, maxRuns: AUTO_MAX_RUNS, maxLevel: AUTO_MAX_LEVEL }); });
        if (expanded.tasks) {
          cfg.note = `Đang mở rộng: +${expanded.pairs} cặp thành phố, ${expanded.splits} khu vực tách sâu`;
          savePlan(cfg); next(); return;
        }
        savePlan({ ...cfg, enabled: false, round: 0, filled: false, cycles: cfg.cycles + 1,
          note: `Đã xong một chu kỳ (${cfg.round} vòng), gồm các thành phố có sẵn và tách khu vực đến cấp ${AUTO_MAX_LEVEL}. Các khu vực lỗi hoặc chạm giới hạn xem trong báo cáo độ phủ.` });
        return;
      }
      let created = 0;
      for (const { p, country } of items) {
        if (db.prepare('SELECT 1 FROM auto_tasks WHERE plan_group=? AND country=?').get(p.key, country)) continue;
        try { await createPlanTask(p, country, cfg); created++; } catch (e) {
          savePlan({ ...cfg, note: `Vòng ${cfg.round + 1}: lỗi tạo ${p.product} → ${country}: ${String(e?.message || e).slice(0, 160)} (sẽ thử lại)` });
          return;
        }
      }
      cfg.filled = true; cfg.note = `Vòng ${cfg.round + 1}: đã tạo ${created} tác vụ`;
      savePlan(cfg);
      if (created) { next(); return; }
    }
  } finally { planBusy = false; }
}
setInterval(() => { planTick().catch((e) => console.error('planTick', e)); }, 10 * 60 * 1000).unref();
setTimeout(() => { planTick().catch((e) => console.error('planTick', e)); }, 8000).unref();

app.get('/api/admin/auto-plan', requireAdmin, (_req, res) => {
  const cfg = loadPlan(); const products = planProducts();
  const cur = db.prepare("SELECT COUNT(*) AS n, SUM(status='running') AS run FROM auto_tasks WHERE plan_round=?").get(cfg.round + 1);
  const rounds = Math.max(0, ...products.map((p) => p.markets.length));
  const pairsPer = cfg.keywords * cfg.cities;
  res.json({
    ...cfg, products: products.length, rounds, items: products.reduce((n, p) => n + p.markets.length, 0),
    totalPairs: products.reduce((n, p) => n + p.markets.length, 0) * pairsPer,
    current: { round: cfg.round + 1, tasks: cur.n, running: cur.run || 0 },
    restUntil: planRestUntil > Date.now() ? planRestUntil : 0, aiEnabled: aiEnabled(),
    hasProxy: cfg.proxies.length > 0 || cfg.keys.length > 0, proxy: undefined, keys: undefined, keyCount: cfg.keys.length,
    proxyList: cfg.proxies.map((x) => x.replace(/^[a-z0-9]+:\/\/([^@]*@)?/i, '')), proxyExpiresAt: cfg.proxyExpiresAt, proxyExpired: ownProxyExpired(cfg), blocked: planBlocked(cfg), fallback: planFallback(cfg),
    mode: planFallback(cfg) ? 'fallback' : cfg.keys.length > 0 ? (planBlocked(cfg) ? 'switching' : 'key') : cfg.proxies.length > 0 ? 'own' : 'none',
    keyStatus: cfg.keys.map((k) => { const st = keyState.get(k) || {}; return { id: `…${k.slice(-4)}`, ok: Boolean(st.proxy && st.expiresAt > Date.now()), hostPort: st.proxy ? st.proxy.replace(/^http:\/\/([^@]*@)?/, '') : '', expiresAt: st.expiresAt || 0, carrier: st.carrier || '', location: st.location || '', error: st.error || '', retryAt: st.retryAt > Date.now() ? st.retryAt : 0, readyAt: st.readyAt > Date.now() ? st.readyAt : 0, changing: Boolean(st.proxy && st.expiresAt - Date.now() < KEY_REFRESH_BEFORE_MS) }; }),
    threads: { running: (running?.spec.auto ? 1 : 0) + autoExtra.size, min: AUTO_MIN_THREADS, max: AUTO_MAX_THREADS, ...autoThreadBudget() },
  });
});
// Thử proxy: 3 lần gọi qua proxy tới dịch vụ hỏi IP (xem IP có đổi không) + 1 lần tới Google Maps (xem có bị chặn không).
// Proxy truyền cho curl qua stdin (-K -) để không lộ user:pass trên danh sách tiến trình.
const curlViaProxy = (proxy, url, timeoutS = 15) => new Promise((resolve) => {
  const t0 = Date.now();
  const child = execFile('curl', ['-K', '-', '-sS', '-L', '--max-time', String(timeoutS), '-o', '-', '-w', '\n%{http_code}', '-A', 'Mozilla/5.0', url],
    { timeout: (timeoutS + 5) * 1000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      const out = String(stdout || ''); const i = out.lastIndexOf('\n');
      resolve({ ok: !error, ms: Date.now() - t0, body: i >= 0 ? out.slice(0, i) : out, status: Number(i >= 0 ? out.slice(i + 1) : 0) || 0, error: error ? String(stderr || error.message).replace(/\/\/[^@\s]*@/g, '//***@').slice(0, 200) : '' });
    });
  child.stdin.end(`proxy = "${proxy.replace(/["\\]/g, '')}"\n`);
});
app.post('/api/admin/auto-plan/test-proxy', requireAdmin, async (req, res) => {
  let proxy = String(req.body?.proxy || '').trim() || (loadPlan().keys.length ? keyProxies()[0] : '') || loadPlan().proxies[0] || '';
  if (!proxy) return res.status(400).json({ error: 'Chưa có proxy để thử (nhập vào ô hoặc lưu proxy trước).' });
  try { proxy = await validateProxy(proxy); } catch (e) { return res.status(400).json({ error: e.message }); }
  const ips = [];
  let firstError = '';
  for (let i = 0; i < 3; i++) {
    const r = await curlViaProxy(proxy, 'https://api.ipify.org');
    if (r.ok && r.status === 200 && /^[0-9a-f.:]{7,45}$/i.test(r.body.trim())) ips.push({ ip: r.body.trim(), ms: r.ms });
    else if (!firstError) firstError = r.error || `HTTP ${r.status}`;
  }
  const connected = ips.length > 0;
  let serverIp = '', hint = '';
  if (!connected) { // chẩn đoán: IP máy chủ (để whitelist) + gợi ý theo kiểu lỗi
    const d = await new Promise((resolve) => execFile('curl', ['-sS', '--max-time', '8', 'https://api.ipify.org'], { timeout: 12000 }, (e, out) => resolve(e ? '' : String(out).trim())));
    serverIp = /^[0-9a-f.:]{7,45}$/i.test(d) ? d : '';
    if (/reset by peer|Empty reply|\(56\)|\(52\)|\(97\)/i.test(firstError)) hint = `Proxy từ chối kết nối ngay khi vừa mở: thường do chưa cho phép IP máy chủ${serverIp ? ` (${serverIp})` : ''} trong trang quản lý của nhà cung cấp (whitelist IP), hoặc proxy cần user:pass (nhập dạng host:port:user:pass).`;
    else if (/407|Proxy Authentication|\(22\)/i.test(firstError)) hint = 'Proxy yêu cầu đăng nhập: nhập dạng host:port:user:pass hoặc http://user:pass@host:port, kiểm tra lại user/mật khẩu.';
    else if (/timed out|\(28\)/i.test(firstError)) hint = 'Hết thời gian chờ: proxy chậm, sai cổng, hoặc bị tường lửa chặn từ IP máy chủ.';
    else if (/\(7\)|refused/i.test(firstError)) hint = 'Không mở được cổng proxy: kiểm tra lại host và port, hoặc proxy đã tắt.';
    else if (/\(5\)|\(6\)|resolve/i.test(firstError)) hint = 'Không phân giải được tên miền proxy: kiểm tra lại host.';
  }
  const g = connected ? await curlViaProxy(proxy, 'https://www.google.com/maps?hl=en', 20) : { ok: false, status: 0, ms: 0, body: '', error: 'bỏ qua vì chưa kết nối được proxy' };
  const blocked = g.ok && (g.status === 429 || /unusual traffic|\/sorry\//i.test(g.body));
  const distinct = new Set(ips.map((x) => x.ip)).size;
  const mapsOk = g.ok && g.status === 200 && !blocked;
  res.json({
    connected, mapsOk, ips, distinct, rotating: ips.length >= 2 && distinct > 1,
    avgMs: ips.length ? Math.round(ips.reduce((n, x) => n + x.ms, 0) / ips.length) : null,
    maps: { status: g.status, ms: g.ms, blocked, error: g.ok ? '' : g.error },
    error: connected ? '' : firstError || 'Không kết nối được qua proxy', serverIp, hint,
  });
});

app.put('/api/admin/auto-plan', requireAdmin, async (req, res) => {
  const b = req.body || {}; const cfg = loadPlan();
  const int = (v, lo, hi, d) => (v === undefined || v === '' ? d : Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);
  const keywords = int(b.keywords, 1, 6, cfg.keywords), cities = int(b.cities, 1, 10, cfg.cities), burstN = int(b.burstN, 0, 100, cfg.burstN), restMin = int(b.restMin, 0, 240, cfg.restMin), restMax = int(b.restMax, 0, 240, cfg.restMax);
  if ([keywords, cities, burstN, restMin, restMax].includes(null)) return res.status(400).json({ error: 'Từ khóa 1–6, thành phố 1–10, số cặp nghỉ 0–100, phút nghỉ 0–240.' });
  if (restMax < restMin) return res.status(400).json({ error: 'Nghỉ tối đa phải ≥ nghỉ tối thiểu.' });
  const wasFallback = planFallback(cfg);
  const next_ = { ...cfg, keywords, cities, burstN, restMin, restMax };
  let proxiesChanged = false;
  if (b.proxies !== undefined || b.proxy !== undefined) { // mỗi dòng một proxy tự nhập (như tab Thủ công, tối đa 10); rỗng = xóa
    const raw = String(Array.isArray(b.proxies) ? b.proxies.join('\n') : b.proxies ?? b.proxy).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (raw.length > MAX_PROXIES) return res.status(400).json({ error: `Tối đa ${MAX_PROXIES} proxy` });
    try { next_.proxies = await Promise.all(raw.map(validateProxy)); } catch (e) { return res.status(400).json({ error: e.message }); }
    proxiesChanged = true;
  }
  if (b.proxyExpiresAt !== undefined) { // mốc hết hạn của proxy tự nhập (ms); rỗng/0 = không giới hạn
    const v = b.proxyExpiresAt === '' || b.proxyExpiresAt === null ? 0 : Number(b.proxyExpiresAt);
    if (!Number.isFinite(v) || v < 0 || v > 4102444800000) return res.status(400).json({ error: 'Ngày hết hạn proxy không hợp lệ.' });
    next_.proxyExpiresAt = v;
    proxiesChanged = true;
  }
  let keysChanged = false;
  if (b.keys !== undefined) { // mỗi dòng một Key proxy xoay (tối đa 6); rỗng = xóa; Key chỉ ghi vào, không bao giờ trả lại
    const list = [...new Set(String(Array.isArray(b.keys) ? b.keys.join('\n') : b.keys).split(/[\s,;]+/).filter(Boolean))];
    if (list.length > 6) return res.status(400).json({ error: 'Tối đa 6 Key.' });
    if (!list.every(isKey)) return res.status(400).json({ error: 'Key chỉ gồm chữ và số (10–64 ký tự), mỗi dòng một Key.' });
    keysChanged = JSON.stringify(list) !== JSON.stringify(cfg.keys);
    next_.keys = list;
  }
  if (b.enabled !== undefined) {
    next_.enabled = Boolean(b.enabled);
    if (next_.enabled && !cfg.enabled) { next_.note = 'Đã bật'; if (cfg.note.startsWith('Đã xong một chu kỳ')) { next_.round = 0; next_.filled = false; } }
  }
  savePlan(next_);
  if (keysChanged) {
    if (next_.keys.length) await refreshKeyProxies(true);
    else keyState.clear();
  }
  if (next_.keys.length && !keysChanged && wasFallback && !planFallback(next_)) await refreshKeyProxies(true); // gia hạn xong: lấy proxy Key mới ngay
  if (proxiesChanged || keysChanged) { // cập nhật ngay proxy của các tác vụ lịch đang chạy (cặp mới dùng ngay), bỏ nghỉ chung dư nếu đã có proxy
    const list = planProxies();
    if (list.length > 0) { planRestUntil = 0; planSince = 0; }
    if (!planBlocked(next_)) db.prepare("UPDATE auto_tasks SET proxies=? WHERE plan_round>0 AND status='running'").run(JSON.stringify(list));
  }
  if (next_.enabled) planTick().catch((e) => console.error('planTick', e));
  next();
  res.json({ ok: true });
});
app.post('/api/admin/auto-plan/refresh-keys', requireAdmin, async (_req, res) => {
  if (!loadPlan().keys.length) return res.status(400).json({ error: 'Chưa có Key proxy xoay.' });
  await refreshKeyProxies(true);
  next();
  res.json({ ok: true });
});

// Tách một cặp chạm trần Google thành các khu nhỏ (AI liệt kê quận/phường, lưu cache theo địa điểm), tạo cặp con cho cùng từ khóa
async function splitRun(r) {
  const task = db.prepare('SELECT * FROM auto_tasks WHERE id=?').get(r.task_id);
  const place = r.qtext.slice(r.keyword.length + 1); // "Los Angeles, United States"
  const pkey = normalize(place);
  let areas = parseJsonCol(db.prepare('SELECT areas FROM auto_areas WHERE place=?').get(pkey)?.areas, null);
  if (!areas) {
    const t0 = Date.now();
    const out = await suggestAreas(place);
    areas = out.areas;
    db.prepare('INSERT OR REPLACE INTO auto_areas (place, areas, at) VALUES (?,?,?)').run(pkey, JSON.stringify(areas), Date.now());
    stmt.aiLogAdd.run(Date.now(), task.created_by, task.created_email, 1, out.usage.input, out.usage.output, areas.length, `chia khu vực "${place}" ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=?').get(r.task_id).n;
  if (total + areas.length > AUTO_MAX_RUNS) { stmt.autoSetSplit.run('capped', r.id); return; }
  const ins = db.prepare('INSERT INTO auto_runs (task_id, keyword, city, qtext, qkey, status, level, parent_id) VALUES (?,?,?,?,?,?,?,?)');
  const have = db.prepare('SELECT 1 FROM auto_runs WHERE task_id=? AND qkey=?');
  inTx(() => {
    for (const a of areas) {
      const qtext = `${r.keyword} ${a}, ${place}`;
      const qkey = makeKey(qtext, 'vi', '');
      if (have.get(r.task_id, qkey)) continue;
      ins.run(r.task_id, r.keyword, `${a}, ${r.city}`, qtext, qkey, 'pending', r.level + 1, r.id);
    }
    stmt.autoSetSplit.run('done', r.id);
  });
}

const parseJsonCol = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
function taskStats(t) {
  const runs = db.prepare('SELECT status, COUNT(*) AS n, SUM(count) AS cnt, SUM(cache_n) AS c, SUM(live_n) AS l FROM auto_runs WHERE task_id=? GROUP BY status').all(t.id);
  const by = Object.fromEntries(runs.map((x) => [x.status, x]));
  const total = runs.reduce((a, x) => a + x.n, 0);
  const u = db.prepare(`SELECT COUNT(DISTINCT qp.place_id) AS places,
      COUNT(DISTINCT CASE WHEN json_extract(p.data,'$.phone')<>'' THEN qp.place_id END) AS phone,
      COUNT(DISTINCT CASE WHEN json_extract(p.data,'$.website')<>'' THEN qp.place_id END) AS website,
      COUNT(DISTINCT CASE WHEN json_extract(p.data,'$.email')<>'' THEN qp.place_id END) AS email
    FROM query_places qp JOIN places p ON p.place_id=qp.place_id WHERE qp.qkey IN (SELECT qkey FROM auto_runs WHERE task_id=? AND status IN ('done'))`).get(t.id);
  return {
    total, pending: by.pending?.n || 0, running: by.running?.n || 0, done: by.done?.n || 0, empty: by.empty?.n || 0, error: by.error?.n || 0,
    found: runs.reduce((a, x) => a + (x.cnt || 0), 0), fromCache: runs.reduce((a, x) => a + (x.c || 0), 0), fromLive: runs.reduce((a, x) => a + (x.l || 0), 0),
    saturated: db.prepare('SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=? AND saturated=1').get(t.id).n,
    unsplit: db.prepare("SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=? AND saturated=1 AND split_state IN ('capped','failed','maxlevel')").get(t.id).n,
    splitting: db.prepare("SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=? AND split_state='todo'").get(t.id).n,
    retried: db.prepare('SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=? AND attempts>1').get(t.id).n,
    uniquePlaces: u.places, withPhone: u.phone, withWebsite: u.website, withEmail: u.email,
  };
}
const taskView = (t) => ({
  id: t.id, product: t.product, country: t.country, maxResults: t.max_results, status: t.status, by: t.created_email, plan: t.plan_round > 0,
  keywords: parseJsonCol(t.keywords, []), cities: parseJsonCol(t.cities, []), buyerTypes: parseJsonCol(t.buyer_types, []),
  proxies: parseJsonCol(t.proxies, []).length, // chỉ trả số lượng, không lộ user:pass
  createdAt: t.created_at, finishedAt: t.finished_at, note: t.note, stats: taskStats(t),
  current: db.prepare("SELECT keyword, city, started_at AS startedAt FROM auto_runs WHERE task_id=? AND status='running' LIMIT 1").get(t.id) || null,
  next: db.prepare("SELECT keyword, city FROM auto_runs WHERE task_id=? AND status='pending' ORDER BY id LIMIT 6").all(t.id),
  proxyMode: parseJsonCol(t.proxies, []).length ? 'proxy' : 'server',
  burstN: t.burst_n, restMin: t.rest_min, restMax: Math.max(t.rest_min, t.rest_max), restUntil: t.rest_until > Date.now() ? t.rest_until : 0,
  win: { on: Boolean(t.win_on), start: t.win_start, end: t.win_end, tz: t.tz, open: inWindow(t), openAt: nextWindowOpen(t), localHour: t.tz ? localHour(t.tz, Date.now()) : null },
});

app.get('/api/admin/auto', requireAdmin, (req, res) => {
  const kind = req.query.kind === 'plan' ? 'plan' : req.query.kind === 'manual' ? 'manual' : '';
  const tasks = db.prepare(`SELECT * FROM auto_tasks ${kind === 'plan' ? 'WHERE plan_round>0' : kind === 'manual' ? 'WHERE plan_round=0' : ''} ORDER BY id DESC LIMIT ${kind === 'plan' ? 200 : 50}`).all();
  res.json({ tasks: tasks.map(taskView), aiEnabled: aiEnabled(), gapSec: AUTO_GAP_MS / 1000, maxPairs: AUTO_MAX_PAIRS });
});

app.get('/api/admin/auto/:id', requireAdmin, (req, res) => {
  const t = db.prepare('SELECT * FROM auto_tasks WHERE id=?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Không có tác vụ' });
  const runs = db.prepare('SELECT id, keyword, city, status, count, cache_n, live_n, started_at, finished_at, message, level, saturated, attempts, split_state FROM auto_runs WHERE task_id=? ORDER BY id').all(t.id);
  res.json({ task: taskView(t), runs: runs.map((r) => ({ id: r.id, keyword: r.keyword, city: r.city, status: r.status, count: r.count, cache: r.cache_n, live: r.live_n, startedAt: r.started_at, finishedAt: r.finished_at, message: r.message, level: r.level, saturated: Boolean(r.saturated), attempts: r.attempts, splitState: r.split_state })) });
});

app.post('/api/admin/auto', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const product = clean(b.product, 300), country = clean(b.country, 60);
  if (!product || !country) return res.status(400).json({ error: 'Cần nhập sản phẩm và quốc gia.' });
  if (!aiEnabled()) return res.status(503).json({ error: 'AI chưa được cấu hình (menu tài khoản → Cấu hình AI).' });
  const maxResults = MAX_RESULTS; // tác vụ tự động luôn lấy sâu nhất để không sót
  const hasBurst = b.burstN !== undefined && b.burstN !== null && b.burstN !== '';
  const intIn = (v, lo, hi) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);

  // thành phố: nhập tay (ưu tiên) hoặc bảng có sẵn của nước đó
  const extra = String(b.cities || '').split(/[\n,;]+/).map((x) => clean(x, 60)).filter(Boolean);
  const known = citiesOfCountry(country);
  const cities = [...new Set(extra.length ? extra : known?.cities || [])];
  if (cities.length === 0) return res.status(400).json({ error: `Chưa có danh sách thành phố cho "${country}". Hãy nhập thành phố vào ô Thành phố (cách nhau bằng dấu phẩy).` });

  let proxies = [];
  const rawProxies = String(b.proxies || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (rawProxies.length > MAX_PROXIES) return res.status(400).json({ error: `Tối đa ${MAX_PROXIES} proxy` });
  try { proxies = await Promise.all(rawProxies.map(validateProxy)); } catch (e) { return res.status(400).json({ error: e.message }); }

  // AI: từ khóa của nước này + loại khách hàng (một lần gọi, có yêu cầu bắt buộc có nước đã chọn)
  let ai;
  const t0 = Date.now();
  try {
    ai = await suggestCountries({ offer: product, area: `Bắt buộc có "${known?.name || country}" trong danh sách quốc gia trả về.` });
  } catch (e) {
    const msg = e instanceof AiError ? e.message : 'Lỗi nội bộ khi gọi AI';
    stmt.aiLogAdd.run(Date.now(), req.user.id, req.user.email, 0, 0, 0, 0, msg);
    return res.status(502).json({ error: msg });
  }
  stmt.aiLogAdd.run(Date.now(), req.user.id, req.user.email, 1, ai.usage.input, ai.usage.output, ai.countries.length, `tác vụ tự động ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const want = (known?.name || country).toLowerCase();
  const hit = ai.countries.find((c) => c.country.toLowerCase() === want || c.country.toLowerCase() === country.toLowerCase());
  if (!hit) return res.status(422).json({ error: `AI không đưa "${country}" vào thị trường phù hợp với sản phẩm này (AI gợi ý: ${ai.countries.map((c) => c.country).join(', ')}). Hãy thử nước khác hoặc mô tả sản phẩm cụ thể hơn.` });
  const keywords = [...new Set([...hit.keywords, ...ai.buyerTypes.map((x) => x.keyword)].map((k) => k.trim()).filter(Boolean))].slice(0, 6);
  if (keywords.length * cities.length > AUTO_MAX_PAIRS) cities.length = Math.max(1, Math.floor(AUTO_MAX_PAIRS / keywords.length));

  // nghỉ định kỳ: mặc định 5 cặp / 30 phút khi không có proxy, 0 (không nghỉ) khi có proxy
  let burstN = proxies.length ? 0 : 5, restMin = proxies.length ? 0 : 20, restMax = proxies.length ? 0 : 40;
  if (hasBurst) {
    burstN = intIn(b.burstN, 0, 100); restMin = intIn(b.restMin, 0, 240); restMax = b.restMax === undefined || b.restMax === '' ? restMin : intIn(b.restMax, 0, 240);
    if (burstN === null || restMin === null || restMax === null) return res.status(400).json({ error: 'Số cặp nghỉ phải từ 0–100 và số phút nghỉ từ 0–240.' });
    if (restMax < restMin) return res.status(400).json({ error: 'Thời gian nghỉ tối đa phải lớn hơn hoặc bằng tối thiểu.' });
  }
  const tz = CITY_DATA.tz?.[known?.name || ''] || '';
  let winOn = tz ? 1 : 0, winStart = 8, winEnd = 19;
  if (b.winOn !== undefined) winOn = b.winOn && tz ? 1 : 0;
  if (b.winStart !== undefined && b.winStart !== '') winStart = intIn(b.winStart, 0, 23);
  if (b.winEnd !== undefined && b.winEnd !== '') winEnd = intIn(b.winEnd, 1, 24);
  if (winStart === null || winEnd === null || winStart === winEnd) return res.status(400).json({ error: 'Khung giờ làm việc không hợp lệ (giờ bắt đầu 0–23, kết thúc 1–24, khác nhau).' });
  const suffix = known?.name || country;
  const now = Date.now();
  const id = inTx(() => {
    const r = db.prepare('INSERT INTO auto_tasks (created_by, created_email, product, country, max_results, keywords, cities, buyer_types, proxies, status, created_at, burst_n, rest_min, rest_max, win_on, win_start, win_end, tz) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, req.user.email, product, suffix, maxResults, JSON.stringify(keywords), JSON.stringify(cities), JSON.stringify(ai.buyerTypes), JSON.stringify(proxies), 'running', now, burstN, restMin, restMax, winOn, winStart, winEnd, tz);
    const ins = db.prepare('INSERT INTO auto_runs (task_id, keyword, city, qtext, qkey, status) VALUES (?,?,?,?,?,?)');
    for (const city of cities) for (const kw of keywords) {
      const qtext = `${kw} ${city}${new RegExp(`(^|,\\s*)${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(city) ? '' : `, ${suffix}`}`;
      ins.run(Number(r.lastInsertRowid), kw, city, qtext, makeKey(qtext, 'vi', ''), 'pending');
    }
    return Number(r.lastInsertRowid);
  });
  next();
  res.json({ id });
});

app.post('/api/admin/auto/:id/stop', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  stmt.autoTaskEnd.run('stopped', Date.now(), 'Admin dừng', id);
  const activeAuto = [running, ...backgroundRuns, ...autoExtra].find((job) => job?.spec.auto?.taskId === id);
  if (activeAuto) { activeAuto.stopRequested = true; activeAuto.abort(); } // dừng luôn cặp đang cào
  res.json({ ok: true });
});
// Sửa thông số nghỉ của tác vụ đang có (áp dụng từ cặp kế tiếp)
app.patch('/api/admin/auto/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const n = Number(req.body?.burstN), m = Number(req.body?.restMin), x = req.body?.restMax === undefined || req.body?.restMax === '' ? m : Number(req.body.restMax);
  if (!Number.isInteger(n) || n < 0 || n > 100 || !Number.isInteger(m) || m < 0 || m > 240 || !Number.isInteger(x) || x < 0 || x > 240) return res.status(400).json({ error: 'Số cặp nghỉ phải từ 0–100 và số phút nghỉ từ 0–240.' });
  if (x < m) return res.status(400).json({ error: 'Thời gian nghỉ tối đa phải lớn hơn hoặc bằng tối thiểu.' });
  const cur = db.prepare('SELECT win_on, win_start, win_end, tz FROM auto_tasks WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: 'Không có tác vụ' });
  const winOn = req.body?.winOn === undefined ? cur.win_on : (req.body.winOn && cur.tz ? 1 : 0);
  const ws = req.body?.winStart === undefined ? cur.win_start : Number(req.body.winStart), we = req.body?.winEnd === undefined ? cur.win_end : Number(req.body.winEnd);
  if (!Number.isInteger(ws) || ws < 0 || ws > 23 || !Number.isInteger(we) || we < 1 || we > 24 || ws === we) return res.status(400).json({ error: 'Khung giờ làm việc không hợp lệ (bắt đầu 0–23, kết thúc 1–24, khác nhau).' });
  const r = db.prepare('UPDATE auto_tasks SET burst_n=?, rest_min=?, rest_max=?, win_on=?, win_start=?, win_end=?, since_rest=0, rest_until=0 WHERE id=?').run(n, m, x, winOn, ws, we, id);
  if (!r.changes) return res.status(404).json({ error: 'Không có tác vụ' });
  next(); // thông số mới (khung giờ/nghỉ) có thể cho phép chạy ngay
  res.json({ ok: true });
});
app.post('/api/admin/auto/:id/resume', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const left = db.prepare("SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=? AND (status='pending' OR split_state='todo')").get(id).n;
  if (!left) return res.status(400).json({ error: 'Không còn cặp nào chờ chạy.' });
  db.prepare("UPDATE auto_tasks SET status='running', finished_at=NULL, note='' WHERE id=? AND status='stopped'").run(id);
  next();
  res.json({ ok: true });
});
app.delete('/api/admin/auto/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  inTx(() => { db.prepare('DELETE FROM auto_runs WHERE task_id=?').run(id); db.prepare('DELETE FROM auto_tasks WHERE id=?').run(id); });
  res.json({ ok: true });
});

// Xuất toàn bộ lead của một tác vụ (CSV); ô bắt đầu bằng = + - @ được thêm ' để không bị Excel chạy như công thức
app.get('/api/admin/auto/:id/export.csv', requireAdmin, (req, res) => {
  const t = db.prepare('SELECT * FROM auto_tasks WHERE id=?').get(Number(req.params.id));
  if (!t) return res.status(404).end();
  const rows = db.prepare(`SELECT r.keyword, r.city, p.data FROM auto_runs r JOIN query_places qp ON qp.qkey=r.qkey JOIN places p ON p.place_id=qp.place_id
    WHERE r.task_id=? AND r.status='done' ORDER BY r.id, qp.pos`).all(t.id);
  const esc = (v) => { let x = String(v ?? ''); if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`; return `"${x.replace(/"/g, '""')}"`; };
  const seen = new Set();
  const lines = [['Mặt hàng', 'Quốc gia', 'Tên', 'Danh mục', 'Địa chỉ', 'Điện thoại', 'Website', 'Email', 'Đánh giá', 'Số review', 'Google Maps', 'Từ khóa', 'Thành phố'].map(esc).join(',')];
  for (const r of rows) {
    const p = JSON.parse(r.data);
    const k = p.placeId || p.id;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push([t.product, t.country, p.title, p.category, p.address, p.phone, p.website, p.email, p.rating, p.reviewsCount, p.googleMapsUrl, r.keyword, r.city].map(esc).join(','));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="task_${t.id}.csv"` });
  res.send('﻿' + lines.join('\n'));
});

for (const t of db.prepare("SELECT id, country FROM auto_tasks WHERE tz=''").all()) { // tác vụ tạo trước khi có khung giờ: gán múi giờ theo nước (chưa bật khung giờ)
  const z = CITY_DATA.tz?.[t.country]; if (z) db.prepare('UPDATE auto_tasks SET tz=? WHERE id=?').run(z, t.id);
}
execFile('sh', ['-c', 'docker ps -aq --filter name=maps-job- | xargs -r docker rm -f'], () => {}); // container mồ côi của lần chạy trước bị ngắt
try { for (const d of readdirSync(WORK_DIR)) rmSync(path.join(WORK_DIR, d), { recursive: true, force: true }); } catch { /* chưa có thư mục */ } // thư mục tạm của job bị ngắt lần trước
setTimeout(next, 5000).unref(); // sau khi khởi động, tiếp tục các tác vụ đang dở
if (bgScanEnabled) setTimeout(() => { scanBackgroundCache(); scheduleBackgroundScan(); }, 5000).unref();

// (health không cần đăng nhập)
app.get('/api/health', (_req, res) => res.json({ ok: true, running: Boolean(running) || backgroundRuns.size > 0, backgroundRunning: backgroundRuns.size, queued: queue.length }));

app.listen(PORT, HOST, () => console.log(`maps-api listening on ${HOST}:${PORT}`));
