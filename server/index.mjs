// Backend cào Google Maps thật: chạy gosom/google-maps-scraper trong Docker, stream kết quả qua SSE.
import express from 'express';
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';

const PORT = Number(process.env.PORT || 3150);
const HOST = '127.0.0.1';
const IMAGE = process.env.GOSOM_IMAGE || 'gosom/google-maps-scraper:latest';
const WORK_DIR = process.env.WORK_DIR || '/var/lib/maps-jobs';
const MAX_RESULTS = 300;
const MAX_QUERIES = 12;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_QUEUE = 3;
const MAX_PROXIES = 10;

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

const app = express();
app.use(express.json({ limit: '32kb' }));

/** @type {Map<string, Job>} */
const jobs = new Map();
const queue = [];
let running = null;

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

class Job {
  constructor(spec) {
    this.id = randomUUID();
    this.spec = spec;
    this.status = 'queued'; // queued | running | done | failed | cancelled
    this.events = []; // lịch sử để client nối lại
    this.clients = new Set();
    this.count = 0;
    this.container = `maps-job-${this.id.slice(0, 8)}`;
    this.dir = path.join(WORK_DIR, this.id);
    this.offset = 0;
    this.partial = '';
  }
  emit(type, data) {
    const ev = { type, data };
    if (type === 'place') this.events.push(ev);
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(msg);
  }
  readNew() {
    const file = path.join(this.dir, 'out.json');
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    if (size <= this.offset) return;
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - this.offset);
    readSync(fd, buf, 0, buf.length, this.offset);
    closeSync(fd);
    this.offset = size;
    this.partial += buf.toString('utf8');
    const lines = this.partial.split('\n');
    this.partial = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const place = mapPlace(JSON.parse(line));
        if (!place.title) continue;
        this.count++;
        this.emit('place', place);
      } catch { /* dòng hỏng, bỏ qua */ }
    }
  }
  finish(status, message) {
    if (['done', 'failed', 'cancelled'].includes(this.status)) return;
    this.readNew();
    this.status = status;
    this.emit('end', { status, count: this.count, message: message || '' });
    for (const res of this.clients) res.end();
    this.clients.clear();
    rmSync(this.dir, { recursive: true, force: true });
    if (running === this) running = null;
    next();
  }
  kill() {
    execFile('docker', ['rm', '-f', this.container], () => {});
  }
}

function next() {
  if (running || queue.length === 0) return;
  const job = queue.shift();
  running = job;
  start(job);
}

function start(job) {
  const { queries, geo, radius, depth, extractEmails, lang, proxies } = job.spec;
  mkdirSync(job.dir, { recursive: true, mode: 0o777 });
  writeFileSync(path.join(job.dir, 'q.txt'), queries.join('\n') + '\n');
  // Proxy ghi vào file (không đưa lên dòng lệnh để tránh lộ user:pass qua ps/docker inspect); file bị xóa cùng thư mục job
  if (proxies.length) writeFileSync(path.join(job.dir, 'proxies.txt'), proxies.join('\n') + '\n', { mode: 0o644 });
  job.status = 'running';
  job.emit('status', { status: 'running', message: `Đang mở trình duyệt Google Maps (${queries.length} truy vấn${proxies.length ? `, qua ${proxies.length} proxy` : ', IP máy chủ'})...` });

  const args = [
    'run', '--rm', '--name', job.container,
    '--memory', '1800m', '--cpus', '2',
    '-v', `${job.dir}:/d`,
    IMAGE,
    '-input', '/d/q.txt', '-results', '/d/out.json', '-json',
    '-depth', String(depth), '-lang', lang,
    '-c', queries.length > 1 ? '2' : '1',
    '-exit-on-inactivity', '90s',
  ];
  if (extractEmails) args.push('-email');
  if (proxies.length) args.push('-proxies-file', '/d/proxies.txt');
  if (geo) args.push('-geo', geo, '-radius', String(radius));

  const proc = spawn('docker', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let errTail = '';
  proc.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-2000); });
  const poll = setInterval(() => job.readNew(), 700);
  const timer = setTimeout(() => { job.kill(); job.finish('failed', 'Quá thời gian tối đa 20 phút'); }, JOB_TIMEOUT_MS);

  proc.on('close', (code) => {
    clearInterval(poll);
    clearTimeout(timer);
    if (job.status === 'cancelled') return;
    job.readNew();
    if (job.count > 0) return job.finish('done');
    if (code === 0) return job.finish('failed', proxies.length
      ? 'Không nhận được kết quả: proxy có thể lỗi/sai thông tin, hoặc Google đang chặn, hoặc truy vấn không có kết quả.'
      : 'Không nhận được kết quả: Google có thể đang chặn IP máy chủ (CAPTCHA) hoặc truy vấn không có kết quả. Hãy thử cấu hình proxy.');
    let tail = errTail.split('\n').slice(-2).join(' ');
    for (const px of proxies) tail = tail.split(px).join('[proxy]');
    job.finish('failed', `Engine thoát với mã ${code}. ${tail.slice(0, 300)}`);
  });
  proc.on('error', (e) => { clearInterval(poll); clearTimeout(timer); job.finish('failed', e.message); });
}

app.post('/api/jobs', async (req, res) => {
  const b = req.body || {};
  const queries = (Array.isArray(b.queries) ? b.queries : [])
    .map((q) => clean(q)).filter(Boolean).slice(0, MAX_QUERIES);
  if (queries.length === 0) return res.status(400).json({ error: 'Thiếu truy vấn' });

  let geo = '';
  let radius = 10000;
  if (b.geo) {
    const m = String(b.geo).match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return res.status(400).json({ error: 'Tọa độ không hợp lệ' });
    geo = `${m[1]},${m[2]}`;
    radius = Math.min(50000, Math.max(500, Number(b.radius) || 10000));
  }
  let proxies = [];
  if (b.proxies !== undefined && b.proxies !== null) {
    if (!Array.isArray(b.proxies) || b.proxies.length > MAX_PROXIES) return res.status(400).json({ error: `Tối đa ${MAX_PROXIES} proxy` });
    try { proxies = await Promise.all(b.proxies.filter((x) => String(x).trim()).map(validateProxy)); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const maxResults = Math.min(MAX_RESULTS, Math.max(1, Number(b.maxResults) || 25));
  // mỗi lần cuộn ~7-20 kết quả; chia đều cho các truy vấn, dư để bù trùng
  const depth = Math.min(40, Math.max(1, Math.ceil((maxResults * 1.5) / queries.length / 7)));
  const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(b.lang || '') ? b.lang : 'vi';

  if (queue.length >= MAX_QUEUE) return res.status(429).json({ error: 'Hàng đợi đầy, thử lại sau' });
  const job = new Job({ queries, geo, radius, depth, extractEmails: Boolean(b.extractEmails), lang, proxies });
  jobs.set(job.id, job);
  queue.push(job);
  job.emit('status', { status: 'queued', position: queue.length + (running ? 1 : 0) });
  next();
  setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000).unref();
  res.json({ id: job.id, queued: queue.includes(job) });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: status\ndata: ${JSON.stringify({ status: job.status })}\n\n`);
  for (const ev of job.events) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
  if (['done', 'failed', 'cancelled'].includes(job.status)) {
    res.write(`event: end\ndata: ${JSON.stringify({ status: job.status, count: job.count })}\n\n`);
    return res.end();
  }
  job.clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(ping); job.clients.delete(res); });
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  const qi = queue.indexOf(job);
  if (qi >= 0) queue.splice(qi, 1);
  job.kill();
  job.finish('cancelled');
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, running: Boolean(running), queued: queue.length }));

app.listen(PORT, HOST, () => console.log(`maps-api listening on ${HOST}:${PORT}`));
