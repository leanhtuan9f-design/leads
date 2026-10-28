import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const COMPANY_DB_PATH = process.env.COMPANY_DB_PATH || '/var/lib/maps-data/companies.db';
export function openCompanyDb(path = COMPANY_DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./company-warehouse.sql', import.meta.url), 'utf8'));
  return db;
}
const page = q => ({ limit: Math.min(100, Math.max(1, Number.parseInt(q.limit, 10) || 50)), offset: Math.max(0, Number.parseInt(q.offset, 10) || 0) });
export const normalizeCompanyName = v => String(v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escapeLike = v => String(v).replace(/[\\%_]/g, '\\$&');
function problem(message, status = 400) { const e = new Error(message); e.status = status; return e; }

export function createCompanyApi(db) {
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const members = id => all('SELECT id,name,source,role,country,city,confidence,source_key,updated_at FROM companies WHERE COALESCE(merged_into,id)=? ORDER BY source,name', id);
  function summary() {
    return {
      ...one('SELECT COUNT(*) profiles,SUM(merged_into IS NULL) roots,SUM(merged_into IS NOT NULL) linked FROM companies'),
      sources: all('SELECT source,COUNT(*) profiles FROM companies GROUP BY source'),
      facts: one('SELECT COUNT(*) n FROM company_facts').n,
      pending: one("SELECT COUNT(*) n FROM company_candidates WHERE status='pending'").n,
      lastSync: one('SELECT * FROM company_sync_runs ORDER BY id DESC LIMIT 1') || null,
      countries: all("SELECT country,COUNT(*) n FROM companies WHERE country<>'' AND merged_into IS NULL GROUP BY country ORDER BY n DESC"),
      products: all("SELECT product,COUNT(DISTINCT company_id) n FROM company_facts WHERE product<>'' GROUP BY product ORDER BY n DESC"),
    };
  }
  function list(q) {
    const { limit, offset } = page(q); const conditions = ['c.merged_into IS NULL']; const params = [];
    // Every filter is applied to members of the canonical profile, including reviewed links.
    const exists = (sql, ...values) => { conditions.push(`EXISTS(SELECT 1 FROM companies m WHERE (m.id=c.id OR m.merged_into=c.id) AND ${sql})`); params.push(...values); };
    if (q.q) exists("m.name_norm LIKE ? ESCAPE '\\'", `%${escapeLike(normalizeCompanyName(q.q).slice(0, 150))}%`);
    if (q.country) exists('m.country=?', String(q.country).toUpperCase().slice(0, 2));
    if (q.city) exists("m.city LIKE ? ESCAPE '\\'", `%${escapeLike(String(q.city).slice(0, 100))}%`);
    if (q.source) exists('m.source=?', String(q.source));
    if (q.role) exists('m.role=?', String(q.role));
    if (q.contact) exists('EXISTS(SELECT 1 FROM company_contacts x WHERE x.company_id=m.id AND x.kind=?)', String(q.contact));
    if (q.product) exists('EXISTS(SELECT 1 FROM company_facts f WHERE f.company_id=m.id AND f.product=?)', String(q.product));
    if (q.hs) exists("EXISTS(SELECT 1 FROM company_facts f WHERE f.company_id=m.id AND f.hs LIKE ? ESCAPE '\\')", `${escapeLike(String(q.hs).replace(/\D/g, '').slice(0, 10))}%`);
    if (q.linked === '1') conditions.push('EXISTS(SELECT 1 FROM companies x WHERE x.merged_into=c.id)');
    const where = conditions.join(' AND ');
    const total = one(`SELECT COUNT(*) n FROM companies c WHERE ${where}`, ...params).n;
    const rows = all(`SELECT c.id,c.name,c.country,c.city,c.role,c.source,c.confidence,c.updated_at,
      (SELECT GROUP_CONCAT(DISTINCT m.source) FROM companies m WHERE (m.id=c.id OR m.merged_into=c.id)) sources,
      (SELECT COUNT(*) FROM companies m WHERE m.merged_into=c.id) linked,
      (SELECT GROUP_CONCAT(DISTINCT x.kind) FROM companies m JOIN company_contacts x ON x.company_id=m.id WHERE (m.id=c.id OR m.merged_into=c.id)) contacts
      FROM companies c WHERE ${where} ORDER BY c.name,c.id LIMIT ? OFFSET ?`, ...params, limit, offset);
    return { total, limit, offset, rows };
  }
  function detail(id, q = {}) {
    const company = one('SELECT * FROM companies WHERE id=?', id);
    if (!company) throw problem('Không tìm thấy hồ sơ.', 404);
    const root = company.merged_into || id; const profiles = members(root); const ids = profiles.map(m => m.id);
    const marks = ids.map(() => '?').join(','); const { limit, offset } = page(q);
    const contacts = all(`SELECT x.kind,x.value,m.source,x.fact_id FROM company_contacts x JOIN companies m ON m.id=x.company_id WHERE x.company_id IN (${marks}) GROUP BY x.kind,x.value,m.source ORDER BY x.kind,x.value LIMIT 500`, ...ids);
    const facts = all(`SELECT id,source,role,source_key,payload,product,hs,trade_date,first_imported_at,imported_at FROM company_facts WHERE company_id IN (${marks}) ORDER BY trade_date DESC,id LIMIT ? OFFSET ?`, ...ids, limit, offset).map(f => ({ ...f, payload: JSON.parse(f.payload) }));
    const totals = all(`SELECT source,role,COUNT(*) rows,MIN(NULLIF(trade_date,'')) firstDate,MAX(NULLIF(trade_date,'')) lastDate FROM company_facts WHERE company_id IN (${marks}) GROUP BY source,role`, ...ids);
    return { company: one('SELECT * FROM companies WHERE id=?', root), profiles, contacts, facts, totals,
      total: one(`SELECT COUNT(*) n FROM company_facts WHERE company_id IN (${marks})`, ...ids).n, limit, offset };
  }
  function candidates(q) {
    const { limit, offset } = page(q); const status = ['pending','approved','rejected'].includes(q.status) ? q.status : 'pending';
    const from = `FROM company_candidates r JOIN companies a ON a.id=r.left_id JOIN companies b ON b.id=r.right_id WHERE r.status=?`;
    return { total: one(`SELECT COUNT(*) n ${from}`, status).n, limit, offset,
      rows: all(`SELECT r.*,a.name left_name,b.name right_name,a.source left_source,b.source right_source,a.country,
        a.confidence left_confidence,b.confidence right_confidence,a.merged_into left_parent,b.merged_into right_parent
        ${from} ORDER BY instr(r.signals,'domain') DESC,r.id LIMIT ? OFFSET ?`, status, limit, offset) };
  }
  function review(id, body, actor) {
    if (!['approve','reject','undo'].includes(body.action)) throw problem('Thao tác không hợp lệ.');
    const reason = String(body.reason || '').trim(); if (reason.length < 3 || reason.length > 1000) throw problem('Nhập lý do từ 3 đến 1.000 ký tự.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = one('SELECT * FROM company_candidates WHERE id=?', id);
      if (!row) throw problem('Không tìm thấy cặp liên kết.', 404);
      const a = one('SELECT * FROM companies WHERE id=?', row.left_id); const b = one('SELECT * FROM companies WHERE id=?', row.right_id);
      const currentRevision = `${a.updated_at}:${b.updated_at}`;
      if (body.action === 'approve') {
        if (row.status !== 'pending') throw problem('Cặp đã được xử lý. Tải lại danh sách.', 409);
        if (body.revision !== row.revision) throw problem('Bằng chứng đã thay đổi từ lúc mở màn hình. Tải lại và xem lại hai hồ sơ.', 409);
        if (row.revision !== currentRevision || row.evidence_changed) throw problem('Bằng chứng đã thay đổi. Chờ đồng bộ và xem lại trước khi duyệt.', 409);
        if (!a.country || a.country !== b.country) throw problem('Không thể gộp khi quốc gia thiếu hoặc khác nhau.', 409);
        if (a.merged_into || b.merged_into || one('SELECT id FROM companies WHERE merged_into IN (?,?) LIMIT 1', a.id, b.id)) throw problem('Một hồ sơ đã có liên kết. Hoàn tác liên kết cũ trước để tránh gộp bắc cầu.', 409);
        db.prepare('UPDATE companies SET merged_into=? WHERE id=?').run(a.id, b.id);
      } else if (body.action === 'reject') {
        if (row.status !== 'pending') throw problem('Cặp đã được xử lý.', 409);
      } else {
        if (row.status === 'pending') throw problem('Cặp chưa có quyết định để hoàn tác.', 409);
        if (row.status === 'approved') {
          if (b.merged_into !== a.id) throw problem('Liên kết đã thay đổi, không thể hoàn tác tự động.', 409);
          db.prepare('UPDATE companies SET merged_into=NULL WHERE id=?').run(b.id);
        }
      }
      const status = { approve: 'approved', reject: 'rejected', undo: 'pending' }[body.action];
      db.prepare('UPDATE company_candidates SET status=?,revision=?,evidence_changed=0 WHERE id=?').run(status, currentRevision, id);
      db.prepare('INSERT INTO company_reviews(candidate_id,action,actor,reason,at) VALUES(?,?,?,?,?)').run(id, body.action, actor, reason, Date.now());
      db.exec('COMMIT'); return { ok: true, status };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { summary, list, detail, candidates, review,
    history: id => all('SELECT action,actor,reason,at FROM company_reviews WHERE candidate_id=? ORDER BY id DESC LIMIT 100', id) };
}

export function mountCompanyApi(app, requireAdmin, db) {
  const api = createCompanyApi(db);
  const route = fn => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(fn(req)); } catch (e) {
      const status = e.status || (String(e.code).includes('BUSY') || String(e.message).includes('locked') ? 503 : 500);
      if (status >= 500) console.error('Company warehouse:', e.message);
      res.status(status).json({ error: status === 500 ? 'Không đọc được kho doanh nghiệp.' : status === 503 ? 'Kho đang đồng bộ, vui lòng thử lại.' : e.message });
    }
  };
  app.get('/api/admin/companies/summary', requireAdmin, route(() => api.summary()));
  app.get('/api/admin/companies', requireAdmin, route(req => api.list(req.query)));
  app.get('/api/admin/companies/candidates', requireAdmin, route(req => api.candidates(req.query)));
  app.get('/api/admin/companies/reviews/:id', requireAdmin, route(req => api.history(req.params.id)));
  app.post('/api/admin/companies/reviews/:id', requireAdmin, route(req => api.review(req.params.id, req.body || {}, req.user.id)));
  app.get('/api/admin/companies/:id', requireAdmin, route(req => api.detail(req.params.id, req.query)));
}
