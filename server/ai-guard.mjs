// Cầu chì cho AI (9router): lỗi dịch vụ hoặc hết quota tuần thì dừng gọi AI, tự thử lại khi AI hoạt động trở lại.
// - Lỗi dịch vụ (HTTP 5xx/402/408/429/401/403, timeout, không kết nối được): dừng; sau 30 phút gọi thử model một câu ngắn,
//   trả lời bình thường thì tự bỏ dừng, lỗi thì chờ thêm 30 phút.
// - Quota: mỗi ngày một lần đăng nhập dashboard 9router, đọc hạn mức tuần của họ model đang dùng (Gemini / Claude & GPT)
//   cho từng tài khoản Antigravity; chỉ dừng khi TẤT CẢ tài khoản đạt ngưỡng; đến giờ reset đọc lại, chưa xuống thì chờ thêm 1 ngày.
//   Dashboard không vào được → thử lại sau 1 giờ; sai mật khẩu → sau 1 ngày.

export const RECHECK_MS = 30 * 60_000;
export const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

/** kind: unreachable (1 giờ), auth = sai mật khẩu (1 ngày), data (1 giờ). */
export class QuotaError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}
export const quotaRetryMs = (e) => (e instanceof QuotaError && e.kind === 'auth' ? DAY_MS : HOUR_MS);

/** Nhận diện 9router theo Base URL: cổng mặc định 20128 hoặc trùng host:port với dashboard đã cấu hình. */
export function isRouter9Url(baseUrl, dashboardUrl = '') {
  const parse = (v) => {
    const t = String(v || '').trim();
    if (!t) return null;
    try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return { host: u.hostname.toLowerCase(), port: u.port || (u.protocol === 'http:' ? '80' : '443') }; } catch { return null; }
  };
  const b = parse(baseUrl);
  if (!b) return false;
  if (b.port === '20128') return true;
  const d = parse(dashboardUrl);
  return Boolean(d && d.host === b.host && d.port === b.port);
}

export function modelFamily(model) {
  const m = String(model || '');
  if (/gemini/i.test(m)) return 'gemini';
  if (/claude|gpt|sonnet|opus|haiku|\bo[134]\b/i.test(m)) return 'claude-gpt';
  return null;
}

/** Thu mọi nút có phần trăm đã dùng (used/total, usedPercentage, remainingPercentage, percentUsed). */
export function walkQuota(node, path, out, account = '') {
  if (!node || typeof node !== 'object') return;
  const num = (k) => (typeof node[k] === 'number' ? node[k] : null);
  let pct = null;
  if (num('remainingPercentage') !== null) pct = 100 - num('remainingPercentage');
  else if (num('usedPercentage') !== null) pct = num('usedPercentage');
  else if (num('percentUsed') !== null) pct = num('percentUsed');
  else if (num('used') !== null && num('total') !== null && num('total') > 0) pct = (num('used') / num('total')) * 100;
  if (pct !== null) {
    const raw = node.resetAt ?? node.reset_at ?? node.resetsAt;
    const t = typeof raw === 'number' ? (raw > 1e12 ? raw : raw * 1000) : typeof raw === 'string' ? Date.parse(raw) : 0;
    const named = [node.label, node.name, node.title, node.displayName, node.model].find((v) => typeof v === 'string' && v.trim());
    out.push({ name: path, label: named ? named.trim() : path.split('/').pop(), account, pct: Math.round(pct * 10) / 10, reset: Number.isFinite(t) ? t : 0 });
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walkQuota(v, `${path}/${k}`, out, account);
}

/** Hạn mức tuần của họ model đang dùng; không gắn nhãn theo họ thì lấy mọi hạn mức tuần. */
export function pickRows(rows, model) {
  const weekly = rows.filter((r) => /week|weekly|7d|7_day/i.test(`${r.name} ${r.label}`));
  const fam = modelFamily(model);
  if (!fam) return weekly;
  const re = fam === 'gemini' ? /gemini/i : /claude|gpt/i;
  const hit = weekly.filter((r) => re.test(`${r.name} ${r.label}`));
  return hit.length ? hit : weekly;
}

/** Mỗi tài khoản lấy mức dùng cao nhất; đọc = tài khoản còn nhiều chỗ nhất (dừng chỉ khi ngay cả nó cũng đạt ngưỡng). */
export function summarize(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r.account || r.name.split('/')[0];
    if (!by.has(k) || r.pct > by.get(k).pct) by.set(k, { account: k, label: r.label, pct: r.pct, reset: r.reset });
  }
  const accounts = [...by.values()].sort((a, b) => a.pct - b.pct);
  if (!accounts.length) return null;
  const resets = accounts.map((a) => a.reset).filter((v) => v > 0);
  return { pct: accounts[0].pct, reset: resets.length ? Math.min(...resets) : 0, accounts };
}

export async function fetchQuota({ url, password }, model, fetchImpl = fetch) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!base || !password) throw new QuotaError('Chưa cấu hình URL/mật khẩu dashboard 9router.', 'data');
  const net = (e) => new QuotaError(`Không kết nối được dashboard: ${e?.message || 'lỗi mạng'}`, 'unreachable');
  const login = await fetchImpl(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    redirect: 'manual', signal: AbortSignal.timeout(20_000),
  }).catch((e) => { throw net(e); });
  if (login.status === 401 || login.status === 403) throw new QuotaError('Sai mật khẩu dashboard 9router.', 'auth');
  if (login.status >= 400) throw new QuotaError(`Dashboard lỗi khi đăng nhập (HTTP ${login.status}).`, 'unreachable');
  const cookie = (login.headers.getSetCookie?.() || []).map((v) => v.split(';')[0]).join('; ');
  const get = async (path) => {
    const r = await fetchImpl(`${base}${path}`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) }).catch((e) => { throw net(e); });
    return r.ok ? r.json().catch(() => null) : null;
  };
  const prov = await get('/api/providers');
  const conns = Array.isArray(prov) ? prov : prov?.connections ?? [];
  const ids = conns.filter((c) => c && c.id && (!c.provider || /antigravity|^ag$/i.test(String(c.provider))))
    .map((c) => ({ id: String(c.id), account: String(c.email ?? c.name ?? c.displayName ?? c.id) }));
  if (!ids.length) throw new QuotaError('Không tìm thấy kết nối Antigravity trong dashboard.', 'data');
  const rows = [];
  for (const { id, account } of ids) walkQuota(await get(`/api/usage/${encodeURIComponent(id)}`), id, rows, account);
  if (!rows.length) throw new QuotaError('Dashboard không trả dữ liệu quota đọc được.', 'data');
  return summarize(pickRows(rows, model));
}

const fmt = (t) => new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
export function quotaMessage(r, threshold) {
  if (r.accounts.length > 1) return `Tất cả ${r.accounts.length} tài khoản Antigravity đã dùng từ ${r.pct}% trở lên (ngưỡng ${threshold}%).`;
  const a = r.accounts[0];
  return `Hạn mức tuần Antigravity đã dùng ${a.pct}% (ngưỡng ${threshold}%)${a.account ? ` — ${a.account}` : ''} — ${a.label}.`;
}

/**
 * deps: { now?, probe(): Promise<{ok, error?}>, getModel(): string, getQuotaConfig(): {url,password,threshold,enabled}|null, readQuota?(cfg, model) }
 */
export function createAiGuard(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const readQuota = deps.readQuota || ((cfg, model) => fetchQuota(cfg, model));
  let state = null; // { type: 'service'|'quota', since, nextCheck, error, checks, probeError }
  let reading = null, quotaError = null, nextQuotaTry = null, lastQuotaCheck = null, busy = false;

  const clear = () => { state = null; return false; };
  const quotaCfg = () => { const c = deps.getQuotaConfig?.(); return c && c.enabled && c.url && c.password ? c : null; };

  async function checkQuota() {
    const cfg = quotaCfg();
    if (!cfg || (nextQuotaTry !== null && now() < nextQuotaTry)) return;
    lastQuotaCheck = now(); nextQuotaTry = now() + DAY_MS;
    try {
      const r = await readQuota(cfg, deps.getModel());
      quotaError = null;
      if (!r) return;
      reading = { ...r, at: now() };
      if (r.pct >= cfg.threshold) state = { type: 'quota', since: now(), nextCheck: r.reset > now() ? r.reset + 60_000 : now() + DAY_MS, error: quotaMessage(r, cfg.threshold), checks: 0, probeError: null };
    } catch (e) {
      quotaError = e?.message || 'Không đọc được quota.';
      nextQuotaTry = now() + quotaRetryMs(e);
    }
  }

  async function recheck() {
    if (state.type === 'quota') {
      const cfg = quotaCfg();
      let r = null, failure = null;
      if (cfg) { try { r = await readQuota(cfg, deps.getModel()); quotaError = null; if (r) reading = { ...r, at: now() }; } catch (e) { failure = e; quotaError = e?.message || 'Không đọc được quota.'; } }
      if (!cfg || (!failure && (!r || r.pct < cfg.threshold))) return clear();
      state = { ...state, checks: state.checks + 1, nextCheck: failure ? now() + quotaRetryMs(failure) : r.reset > now() ? r.reset + 60_000 : now() + DAY_MS, error: failure ? state.error : quotaMessage(r, cfg.threshold) };
      return true;
    }
    const res = await deps.probe().catch((e) => ({ ok: false, error: e?.message || 'Lỗi không xác định.' }));
    if (res.ok) return clear();
    state = { ...state, nextCheck: now() + RECHECK_MS, checks: state.checks + 1, probeError: res.error || 'Không có phản hồi.' };
    return true;
  }

  /** true khi đang dừng (đã thử lại nếu đến hạn). */
  async function blocked() {
    if (!state) await checkQuota();
    if (!state) return false;
    if (now() < state.nextCheck || busy) return true;
    busy = true;
    try { return await recheck(); } finally { busy = false; }
  }

  return {
    blocked,
    trip(error) {
      state = { type: state?.type ?? 'service', since: state?.since ?? now(), nextCheck: now() + RECHECK_MS, error: String(error).slice(0, 300), checks: state?.checks ?? 0, probeError: state?.probeError ?? null };
    },
    resume() { state = null; },
    async checkNow() {
      if (busy) return;
      busy = true;
      try { if (state) await recheck(); else { nextQuotaTry = null; await checkQuota(); } } finally { busy = false; }
    },
    status() {
      const cfg = deps.getQuotaConfig?.();
      return {
        outage: state && { ...state },
        quota: { enabled: Boolean(quotaCfg()), threshold: cfg?.threshold ?? null, lastCheckAt: lastQuotaCheck, nextCheckAt: state?.type === 'quota' ? state.nextCheck : nextQuotaTry, reading, error: quotaError },
        model: deps.getModel() || null,
      };
    },
    pausedMessage() {
      return state ? `AI đang tạm dừng (${state.type === 'quota' ? 'hết quota tuần' : 'lỗi dịch vụ'}). Hệ thống kiểm tra lại lúc ${fmt(state.nextCheck)}, hãy thử lại sau.` : '';
    },
  };
}
