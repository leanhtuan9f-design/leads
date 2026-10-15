// Backend cào Google Maps thật: chạy gosom/google-maps-scraper trong Docker, stream kết quả qua SSE.
import express from 'express';
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { ensureAuthSchema, hashPassword, verifyPassword, sha256, newToken, randomPassword, vnDay } from './auth-lib.mjs';

const PORT = Number(process.env.PORT || 3150);
const HOST = '127.0.0.1';
const IMAGE = process.env.GOSOM_IMAGE || 'gosom/google-maps-scraper:latest';
const WORK_DIR = process.env.WORK_DIR || '/var/lib/maps-jobs';
const MAX_RESULTS = 300;
const MAX_QUERIES = 12;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_QUEUE = 3;
const MAX_PROXIES = 10;
const DB_PATH = process.env.DB_PATH || '/var/lib/maps-data/cache.db';
const TTL_MS = 14 * 24 * 3600 * 1000; // dữ liệu quá 14 ngày coi là cũ → trả ngay + cập nhật nền
const FORCE_PER_DAY = 3; // số lần "làm mới" bắt buộc mỗi IP mỗi ngày
const BG_QUERIES_PER_HOUR = 6; // trần số truy vấn cập nhật nền mỗi giờ
const PURGE_AFTER_MS = 180 * 24 * 3600 * 1000; // xóa dữ liệu không ai dùng sau 180 ngày
const DEPTHS = [1, 2, 4, 8, 16, 32, 40];

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
};

// Kiểm tra proxy do người dùng nhập: chỉ http/https/socks5, không cho trỏ vào mạng nội bộ của máy chủ
async function validateProxy(raw) {
  const line = String(raw).trim();
  if (!line || line.length > 300 || /\s/.test(line)) throw new Error('Proxy sai định dạng');
  let u;
  try { u = new URL(line); } catch { throw new Error('Proxy sai định dạng (cần dạng http://user:pass@host:port)'); }
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
ensureAuthSchema(db);
const stmt = {
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
  stats: db.prepare('SELECT (SELECT COUNT(*) FROM places) AS places, (SELECT COUNT(*) FROM query_runs) AS queries, (SELECT COALESCE(SUM(hits),0) FROM query_runs) AS hits'),
  purgeRuns: db.prepare('DELETE FROM query_runs WHERE last_used_at < ?'),
  purgeLinks: db.prepare('DELETE FROM query_places WHERE qkey NOT IN (SELECT qkey FROM query_runs)'),
  purgePlaces: db.prepare('DELETE FROM places WHERE place_id NOT IN (SELECT place_id FROM query_places)'),
};
function purgeOld() {
  stmt.purgeSessions.run(Date.now());
  stmt.purgeUsage.run(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  stmt.purgeRuns.run(Date.now() - PURGE_AFTER_MS);
  stmt.purgeLinks.run();
  stmt.purgePlaces.run();
}
purgeOld();
setInterval(purgeOld, 24 * 3600 * 1000).unref();

// Khóa tra cứu: bỏ dấu, chữ thường, bỏ ký tự thừa → "Nha Khoa" và "nha khoa" là một
const normalize = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9., -]/g, ' ').replace(/\s+/g, ' ').trim();
const makeKey = (query, lang, geo) => `${lang}|${geo || ''}|${normalize(query)}`;
const neededDepth = (maxResults, nQueries) => {
  const raw = Math.ceil((maxResults * 1.5) / nQueries / 7);
  return DEPTHS.find((d) => d >= raw) || 40;
};

const app = express();
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
app.use('/api/jobs', requireAuth);

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role });
function quotaOf(u) {
  const use = stmt.getUsage.get(u.id, vnDay()) || { new_places: 0, refreshes: 0 };
  return { newUsed: use.new_places, newLimit: u.daily_new, refreshUsed: use.refreshes, refreshLimit: u.daily_refresh };
}

const loginFails = new Map(); // key -> { n, until }
const failKey = (req, email) => `${req.headers['x-real-ip'] || req.ip}|${email}`;
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
    this.emit('place', place);
  }
  abort() {
    this.aborted = true;
    if (this.container) execFile('docker', ['rm', '-f', this.container], () => {});
    this.endClients('cancelled');
  }
}

let running = null;
const queue = [];
const bgPending = new Map(); // key -> { q, depth, withEmail, lang, geo, radius, proxies }
let bgDoneThisHour = 0;
setInterval(() => { bgDoneThisHour = 0; }, 3600 * 1000).unref();

function next() {
  if (running) return;
  let job = queue.shift();
  if (!job && bgPending.size > 0 && bgDoneThisHour < BG_QUERIES_PER_HOUR) {
    const [key, e] = bgPending.entries().next().value;
    bgPending.delete(key);
    bgDoneThisHour++;
    job = new Job({
      queries: [e.q], geo: e.geo, radius: e.radius, depth: e.depth, extractEmails: e.withEmail,
      lang: e.lang, proxies: e.proxies || [], force: true, background: true,
    });
    jobs.set(job.id, job);
    job.live = prepareCached(job);
  }
  if (!job) return;
  running = job;
  runJob(job).catch((e) => {
    console.error('runJob error', e);
    job.endClients('failed', 'Lỗi nội bộ máy chủ');
  }).finally(() => {
    rmSync(job.dir, { recursive: true, force: true });
    running = null;
    next();
  });
}

// Chạy gosom cho đúng 1 truy vấn → lưu vào kho; trả về số địa điểm
function scrapeQuery(job, q, idx) {
  return new Promise((resolve) => {
    const { geo, radius, depth, extractEmails, lang, proxies } = job.spec;
    const dir = path.join(job.dir, String(idx));
    mkdirSync(dir, { recursive: true, mode: 0o777 });
    writeFileSync(path.join(dir, 'q.txt'), q.text + '\n');
    if (proxies.length) writeFileSync(path.join(dir, 'proxies.txt'), proxies.join('\n') + '\n', { mode: 0o644 });
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
    const timer = setTimeout(() => { job.aborted = true; execFile('docker', ['rm', '-f', job.container], () => {}); job.endClients('failed', 'Quá thời gian tối đa 20 phút'); }, JOB_TIMEOUT_MS);

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
    if (job.aborted) break;
    if (r.placeIds.length > 0 && (r.code === 0 || !job.aborted)) {
      saveRun(job, q, r.placeIds); // ngay cả khi người dùng đã rời đi, truy vấn này vẫn vào kho
      scrapedAny += r.placeIds.length;
    } else if (r.code !== 0) {
      lastErr = `Engine thoát với mã ${r.code}. ${r.tail}`;
    }
  }

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
    job.endClients('done'); // đủ từ kho: không cần trình duyệt
    next(); // nếu có truy vấn cũ cần cập nhật nền và máy đang rảnh
    return res.json({ id: job.id });
  }
  if (job.quotaLeft <= 0) { // hết hạn mức địa điểm mới: chỉ phục vụ phần có sẵn trong kho
    job.endClients('done', 'Đã hết hạn mức địa điểm mới hôm nay: chỉ hiển thị dữ liệu đã lưu. Hạn mức đặt lại vào 0h (giờ Việt Nam).');
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

app.get('/api/cache/stats', requireAdmin, (_req, res) => {
  const s = stmt.stats.get();
  res.json({ places: s.places, queries: s.queries, hits: s.hits, bgPending: bgPending.size, ttlDays: TTL_MS / 86400000 });
});

// (health không cần đăng nhập)
app.get('/api/health', (_req, res) => res.json({ ok: true, running: Boolean(running), queued: queue.length }));

app.listen(PORT, HOST, () => console.log(`maps-api listening on ${HOST}:${PORT}`));
