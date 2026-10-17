// Proxy xoay theo Key (proxy.vn / proxyxoay.shop): gọi API lấy proxy hiện tại và (tùy chọn) cho phép IP máy chủ.
// Tài liệu: https://proxy.vn/?home=apixoay — GET /api/get.php?key=&nhamang=&tinhthanh=&whitelist=
// Thành công: {"status":100,"message":"proxy nay se die sau 1777s","proxyhttp":"ip:port::", ...}
const API = process.env.PROXY_KEY_API || 'https://proxyxoay.shop/api/get.php';

export const isKey = (k) => /^[A-Za-z0-9]{10,64}$/.test(String(k));

// "ip:port::" | "ip:port:user:pass" → http://[user:pass@]ip:port
export function parseProxy(raw) {
  const p = String(raw || '').trim().split(':');
  if (p.length < 2 || !/^[0-9a-zA-Z.-]+$/.test(p[0]) || !/^\d{2,5}$/.test(p[1])) return '';
  const [host, port, user = '', pass = ''] = p;
  return user ? `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}` : `http://${host}:${port}`;
}

export async function fetchKeyProxy(key, { whitelist = '', api = API, fetchImpl = fetch } = {}) {
  const u = new URL(api);
  u.searchParams.set('key', key);
  u.searchParams.set('nhamang', 'Random');
  u.searchParams.set('tinhthanh', '0');
  if (whitelist) u.searchParams.set('whitelist', whitelist);
  let res;
  try { res = await fetchImpl(u, { signal: AbortSignal.timeout(20000) }); } catch { throw new Error('Không gọi được API proxy xoay (mạng hoặc quá thời gian)'); }
  let j;
  try { j = JSON.parse(await res.text()); } catch { throw new Error(`API proxy xoay trả về không phải JSON (HTTP ${res.status})`); }
  const msg = String(j.message || j.comen || '').slice(0, 200);
  if (Number(j.status) !== 100) {
    const e = new Error(msg || `API proxy xoay báo lỗi (status ${j.status})`);
    const wait = Number(/(\d+)\s*s\b/i.exec(msg)?.[1]); // vd 'vui long doi 45s' → thử lại sau chừng đó
    e.retryAfterMs = wait > 0 && wait <= 3600 ? wait * 1000 : 0;
    throw e;
  }
  const proxy = parseProxy(j.proxyhttp);
  if (!proxy) throw new Error('API proxy xoay không trả về proxy hợp lệ');
  const life = Number(/sau\s*(\d+)\s*s/i.exec(msg)?.[1]);
  return { proxy, expiresAt: Date.now() + (life > 0 ? life * 1000 : 25 * 60 * 1000), location: String(j['Vi Tri'] || ''), carrier: String(j['Nha Mang'] || '') };
}
