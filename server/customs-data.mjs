import { DatabaseSync } from 'node:sqlite';
import { PRODUCT_GROUPS, PRODUCT_LABELS, backfillProductGroups, normalizeHs } from './customs-products.mjs';

// Customs Data (vận đơn/hải quan thật) và Danh bạ doanh nghiệp nằm trong DB riêng, không dùng bảng `places` của kho.
export const CUSTOMS_DB_PATH = process.env.CUSTOMS_DB_PATH || '/var/lib/maps-data/customs.db';

export function openCustomsDb(path = CUSTOMS_DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS customs_files (
      path TEXT PRIMARY KEY, kind TEXT NOT NULL, rows INTEGER NOT NULL DEFAULT 0, imported_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customs_shipments (
      id INTEGER PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, file TEXT NOT NULL,
      date TEXT, buyer TEXT, buyer_norm TEXT, buyer_country TEXT, buyer_address TEXT,
      supplier TEXT, supplier_norm TEXT, supplier_address TEXT, supplier_phone TEXT,
      hs TEXT, product TEXT, usd REAL, qty REAL, unit TEXT, weight REAL,
      port_in TEXT, port_out TEXT, mode TEXT, incoterms TEXT, direction TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cs_buyer ON customs_shipments(buyer_norm, buyer_country);
    CREATE INDEX IF NOT EXISTS idx_cs_hs ON customs_shipments(hs);
    CREATE TABLE IF NOT EXISTS customs_rankings (
      id INTEGER PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, file TEXT NOT NULL,
      role TEXT NOT NULL, name TEXT NOT NULL, name_norm TEXT NOT NULL, country TEXT,
      hs TEXT, product TEXT, transactions REAL, usd REAL, qty REAL, weight REAL, share REAL, url TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cr_name ON customs_rankings(role, name_norm, country);
    CREATE TABLE IF NOT EXISTS customs_market (
      id INTEGER PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, file TEXT NOT NULL,
      kind TEXT NOT NULL, name TEXT NOT NULL, shipments REAL, usd REAL, qty REAL, weight REAL, product TEXT
    );
    CREATE TABLE IF NOT EXISTS directory_entities (
      id INTEGER PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, file TEXT NOT NULL,
      entity_type TEXT NOT NULL, name TEXT NOT NULL, name_norm TEXT NOT NULL, country TEXT, city TEXT,
      address TEXT, email TEXT, phone TEXT, website TEXT, contact_person TEXT, activity TEXT, confidence TEXT NOT NULL DEFAULT 'normal'
    );
    CREATE INDEX IF NOT EXISTS idx_de_name ON directory_entities(name_norm, country);
    CREATE INDEX IF NOT EXISTS idx_de_type ON directory_entities(entity_type, country);
  `);
  if (!db.prepare('PRAGMA table_info(customs_rankings)').all().some(c => c.name === 'product_inferred')) db.exec('ALTER TABLE customs_rankings ADD COLUMN product_inferred INTEGER NOT NULL DEFAULT 0');
  // Cột product_group thêm sau: migrate DB cũ, tạo chỉ mục, điền các dòng còn trống.
  for (const t of ['customs_shipments', 'customs_rankings', 'customs_market']) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === 'product_group')) db.exec(`ALTER TABLE ${t} ADD COLUMN product_group TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_pg ON ${t}(product_group)`);
  }
  // Mã HS lưu dạng số làm mất số 0 đầu (8109094 → 08109094): chuẩn hoá một lần để lọc/gợi ý theo đầu mã đúng.
  if (!db.prepare(`SELECT 1 FROM customs_files WHERE path = '__hs_normalized__'`).get()) {
    for (const t of ['customs_shipments', 'customs_rankings']) {
      const rows = db.prepare(`SELECT id, hs FROM ${t} WHERE hs <> ''`).all();
      const set = db.prepare(`UPDATE ${t} SET hs = ? WHERE id = ?`);
      db.exec('BEGIN');
      for (const r of rows) { const h = normalizeHs(r.hs); if (h !== r.hs) set.run(h, r.id); }
      db.exec('COMMIT');
    }
    db.prepare(`INSERT OR REPLACE INTO customs_files (path, kind, rows, imported_at) VALUES ('__hs_normalized__', 'migration', 0, ?)`).run(Date.now());
  }
  if (!db.prepare(`SELECT 1 FROM customs_files WHERE path = '__names_formatted__'`).get()) {
    const cache = new Map();
    const fmt = v => { let f = cache.get(v); if (f === undefined) { f = formatCompanyName(v); cache.set(v, f); } return f; };
    for (const [table, cols] of [['customs_shipments', ['buyer', 'supplier']], ['customs_rankings', ['name']], ['directory_entities', ['name']]]) {
      const rows = db.prepare(`SELECT id, ${cols.join(', ')} FROM ${table}`).all();
      const set = db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`);
      db.exec('BEGIN');
      for (const r of rows) { const next = cols.map(c => fmt(r[c] ?? '')); if (cols.some((c, i) => next[i] !== r[c])) set.run(...next, r.id); }
      db.exec('COMMIT');
    }
    db.prepare(`INSERT OR REPLACE INTO customs_files (path, kind, rows, imported_at) VALUES ('__names_formatted__', 'migration', 0, ?)`).run(Date.now());
  }
  if (!db.prepare(`SELECT 1 FROM customs_files WHERE path = '__ports_cleaned__'`).get()) {
    const rows = db.prepare(`SELECT id, port_in, port_out FROM customs_shipments WHERE port_in <> '' OR port_out <> ''`).all();
    const set = db.prepare('UPDATE customs_shipments SET port_in = ?, port_out = ? WHERE id = ?');
    db.exec('BEGIN');
    for (const r of rows) { const a = cleanPort(r.port_in), b = cleanPort(r.port_out); if (a !== r.port_in || b !== r.port_out) set.run(a, b, r.id); }
    db.exec('COMMIT');
    db.prepare(`INSERT OR REPLACE INTO customs_files (path, kind, rows, imported_at) VALUES ('__ports_cleaned__', 'migration', 0, ?)`).run(Date.now());
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_cs_port_in ON customs_shipments(port_in); CREATE INDEX IF NOT EXISTS idx_cs_port_out ON customs_shipments(port_out);');
  if (!db.prepare('PRAGMA table_info(directory_entities)').all().some(c => c.name === 'email_class')) db.exec('ALTER TABLE directory_entities ADD COLUMN email_class TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_de_email_class ON directory_entities(email_class)');
  classifyDirectoryEmails(db);
  backfillProductGroups(db);
  return db;
}

const SUFFIX = /\b(co|ltd|inc|llc|l l c|corp|corporation|limited|company|pvt|private|gmbh|sdn|bhd|jsc|joint|stock|the|sa|sarl|bv|b v|pte|fze|fzc|dmcc)\b/g;
export function normalizeName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

// Chuẩn hoá tên doanh nghiệp để hiển thị: "UNIQLO CO.,LTD" → "Uniqlo Co., Ltd", "cong ty tnhh abc" → "Cong Ty TNHH Abc".
// Viết hoa chữ cái đầu mỗi từ; tên đã có chữ hoa/thường lẫn lộn giữ nguyên phần còn lại; giữ HOA các viết tắt pháp lý (LLC, TNHH, JSC…).
const NAME_UPPER = new Set(['TNHH', 'MTV', 'CP', 'SX', 'TM', 'DV', 'XNK', 'JSC', 'LLC', 'LLP', 'LP', 'PLC', 'FZE', 'FZCO', 'FZC', 'DMCC', 'USA', 'UAE', 'UK', 'VN', 'HCM', 'HCMC', 'PT', 'CV', 'BV', 'NV', 'SA', 'SRL', 'SPA', 'AG', 'KG', 'AS', 'AB', 'OY', 'OOO', 'OJSC', 'CJSC', 'PJSC', 'SAS', 'SARL', 'SAL', 'WLL', 'QSC', 'II', 'III', 'IV', 'MS', 'LTDA', 'GMBH']);
const NAME_SPECIAL = { GMBH: 'GmbH' };
export function formatCompanyName(value) {
  let t = String(value ?? '').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+Tel\b(?=.*\b(?:Fax|Email)\b).*$/i, '').replace(/^[\s\-–,.;:]+|[\s,;:]+$/g, '');
  if (!t || !/\p{L}/u.test(t)) return t;
  t = t.replace(/(^|[^\p{L}])L\.?\s?L\.?\s?C\.?(?![\p{L}])/giu, '$1LLC').replace(/\s*,\s*/g, ', ').replace(/\.,(?=\p{L})/gu, '., ');
  const flat = t === t.toUpperCase() || t === t.toLowerCase();
  return t.replace(/[\p{L}\p{N}]+/gu, (w, off) => {
    const up = w.toUpperCase();
    if (/\d/.test(w)) return up;
    if (NAME_SPECIAL[up] && flat) return NAME_SPECIAL[up];
    if (NAME_UPPER.has(up) && (flat || w === up)) return up;
    if (t[off - 1] === "'" && (t.slice(0, off - 1).match(/\p{L}+$/u)?.[0].length ?? 0) > 1) return w.toLowerCase();
    return flat ? up[0] + w.slice(1).toLowerCase() : up[0] + w.slice(1);
  });
}

// Email cơ quan nhà nước/quân đội/tổ chức quốc tế/trường học không phải doanh nghiệp: loại khỏi danh bạ.
// Đuôi chung: .gov .edu .mil .int; dưới đuôi quốc gia (2 chữ): gov, gob, gouv, govt, gub, go, gv, nic, edu, ac, sch (vd .gov.vn, .gob.ec, .go.jp, .ac.uk).
const AGENCY_TLDS = new Set(['gov', 'edu', 'mil', 'int']);
const AGENCY_SECOND = new Set(['gov', 'gob', 'gouv', 'govt', 'gub', 'go', 'gv', 'nic', 'edu', 'ac', 'sch']);
export function isGovEduEmail(email) {
  const labels = String(email ?? '').trim().toLowerCase().split('@').pop().split('.').filter(Boolean);
  if (labels.length < 2) return false;
  const last = labels[labels.length - 1], second = labels[labels.length - 2];
  return AGENCY_TLDS.has(last) || (last.length === 2 && AGENCY_SECOND.has(second));
}
// Phân loại email của một doanh nghiệp: 'domain' (có ít nhất một email tên miền riêng) > 'gmail' > 'yahoo' > 'microsoft' > 'free' (webmail/ISP khác) > 'none'.
export const EMAIL_CLASS_LABELS = { domain: 'Domain riêng', gmail: 'Gmail', yahoo: 'Yahoo', microsoft: 'Hotmail / Outlook', free: 'Free / ISP khác', none: 'Không có email' };
const FREE_EXACT = new Set(['aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com', 'foxmail.com', 'mail.ru', 'rambler.ru', 'web.de', 'zoho.com', 'mail.com', 'inbox.com', 'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com', 'libero.it', 'orange.fr', 'wanadoo.fr', 'free.fr', 't-online.de',
  'emirates.net.ae', 'eim.ae', 'sbcglobal.net', 'bellsouth.net', 'comcast.net', 'earthlink.net', 'verizon.net', 'qwest.net', 'embarqmail.com', 'mindspring.com', 'charter.net', 'att.net', 'hughes.net', 'cox.net', 'pacbell.net', 'omantel.net.om', 'mptmail.net.mm', 'myanmar.com.mm', 'optonline.net', 'rr.com', 'windstream.net', 'frontier.com', 'centurylink.net', 'swbell.net', 'prodigy.net', 'ameritech.net', 'bigpond.com', 'telus.net', 'shaw.ca', 'rogers.com', 'sympatico.ca', 'btinternet.com', 'virginmedia.com', 'sky.com', 'talktalk.net', 'ntlworld.com']);
export function emailDomainClass(domain) {
  const d = String(domain ?? '').toLowerCase();
  if (d === 'gmail.com' || d === 'googlemail.com') return 'gmail';
  if (/^(yahoo|ymail|rocketmail)\./.test(d)) return 'yahoo';
  if (/^(hotmail|outlook|live|msn)\./.test(d)) return 'microsoft';
  if (FREE_EXACT.has(d) || /^(yandex|gmx)\./.test(d)) return 'free';
  return 'domain';
}
const VALID_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export function classifyEmailField(field) {
  const classes = new Set(String(field ?? '').split(/[;,\s]+/).filter(Boolean).map(e => e.toLowerCase().split('@')[1] ?? '').filter(d => VALID_DOMAIN.test(d)).map(emailDomainClass));
  return ['domain', 'gmail', 'yahoo', 'microsoft', 'free'].find(c => classes.has(c)) ?? 'none';
}
// Điền email_class cho dòng còn NULL (all = tính lại tất cả).
export function classifyDirectoryEmails(db, { all = false } = {}) {
  const rows = db.prepare(`SELECT id, email FROM directory_entities ${all ? '' : 'WHERE email_class IS NULL'}`).all();
  if (!rows.length) return 0;
  const set = db.prepare('UPDATE directory_entities SET email_class = ? WHERE id = ?');
  db.exec('BEGIN');
  for (const r of rows) set.run(classifyEmailField(r.email), r.id);
  db.exec('COMMIT');
  return rows.length;
}

// Trả về {email: các email còn lại ('a; b'), removed: có email gov/edu bị bỏ, dropAll: có email nhưng toàn gov/edu}.
export function stripGovEduEmails(field) {
  const all = String(field ?? '').split(/[;,\s]+/).filter(Boolean);
  const kept = all.filter(e => !isGovEduEmail(e));
  return { email: kept.join('; '), removed: kept.length < all.length, dropAll: all.length > 0 && kept.length === 0 };
}
// Xoá doanh nghiệp chỉ có email gov/edu; dòng còn email thường thì chỉ bỏ email gov/edu. Trả {deleted, stripped}.
export function purgeGovEduEntities(db) {
  const rows = db.prepare(`SELECT id, email FROM directory_entities WHERE email <> ''`).all();
  const del = db.prepare('DELETE FROM directory_entities WHERE id = ?');
  const upd = db.prepare('UPDATE directory_entities SET email = ? WHERE id = ?');
  let deleted = 0, stripped = 0;
  db.exec('BEGIN');
  for (const r of rows) {
    const x = stripGovEduEmails(r.email);
    if (x.dropAll) { del.run(r.id); deleted++; } else if (x.removed) { upd.run(x.email, r.id); stripped++; }
  }
  db.exec('COMMIT');
  if (stripped) classifyDirectoryEmails(db, { all: true });
  return { deleted, stripped };
}

// Tên cảng trong nguồn lẫn rác ("Not Available", "undefined") và nhiều cách viết cho cùng một cảng: làm sạch + gộp alias chính.
const PORT_ALIASES = [[/cat\s*lai/i, 'Cat Lai'], [/cai\s*mep/i, 'Cai Mep'], [/hai\s*phong|haiphong|lach\s*huyen/i, 'Hai Phong'], [/da\s*nang/i, 'Da Nang'], [/ho\s*chi\s*minh|\bhcm\b|sai\s*gon|saigon/i, 'Ho Chi Minh City']];
export function cleanPort(value) {
  const t = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!t || /^(not available|undefined|null|n\/?a|other|others|unknown|none|0|-+|\.+)$/i.test(t)) return '';
  const alias = PORT_ALIASES.find(([re]) => re.test(t));
  if (alias) return alias[1];
  return t === t.toUpperCase() || t === t.toLowerCase() ? t.toLowerCase().replace(/(^|[\s(\-/])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : t;
}

const like = value => `%${String(value).replace(/[\\%_]/g, '\\$&')}%`;
const productParam = query => (PRODUCT_LABELS[query.product] ? String(query.product) : '');
const page = (query, max = 100) => ({
  limit: Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), max),
  offset: Math.max(parseInt(query.offset, 10) || 0, 0),
});

export function createCustomsApi(db) {
  const one = (sql, ...params) => db.prepare(sql).get(...params);

  // Số dòng theo nhóm sản phẩm ở 3 bảng; buyers = số buyer riêng trong vận đơn.
  function products() {
    const agg = (table, extra = '') => Object.fromEntries(db.prepare(`SELECT product_group g, COUNT(*) n${extra} FROM ${table} GROUP BY product_group`).all().map(r => [r.g, r]));
    const s = agg('customs_shipments', ', ROUND(SUM(usd)) usd, COUNT(DISTINCT buyer_norm || buyer_country) buyers'), r = agg('customs_rankings'), m = agg('customs_market');
    return [...PRODUCT_GROUPS.map(g => g.key), 'khac'].map(key => ({
      key, label: PRODUCT_LABELS[key], shipments: s[key]?.n ?? 0, usd: s[key]?.usd ?? null, shipmentBuyers: s[key]?.buyers ?? 0, rankings: r[key]?.n ?? 0, market: m[key]?.n ?? 0,
    })).filter(p => p.shipments || p.rankings || p.market);
  }

  function summary() {
    return {
      shipments: one('SELECT COUNT(*) n, ROUND(SUM(usd)) usd, MIN(date) minDate, MAX(date) maxDate FROM customs_shipments'),
      buyers: one(`SELECT COUNT(*) n FROM (SELECT 1 FROM customs_shipments WHERE buyer_norm <> '' GROUP BY buyer_norm, buyer_country)`).n,
      rankings: one('SELECT COUNT(*) n FROM customs_rankings').n,
      market: one('SELECT COUNT(*) n FROM customs_market').n,
      directory: one('SELECT COUNT(*) n FROM directory_entities').n,
      files: one('SELECT COUNT(*) n FROM customs_files').n,
      topCountries: db.prepare(`SELECT buyer_country country, COUNT(*) shipments, ROUND(SUM(usd)) usd FROM customs_shipments WHERE buyer_country <> '' GROUP BY buyer_country ORDER BY shipments DESC LIMIT 10`).all(),
      products: products(),
      directoryTypes: db.prepare('SELECT entity_type type, COUNT(*) n FROM directory_entities GROUP BY entity_type ORDER BY n DESC').all(),
    };
  }

  // Buyer hợp nhất giữa vận đơn và bảng xếp hạng; lọc theo nước, mã HS và từ khóa tên.
  function buyers(query) {
    const { limit, offset } = page(query);
    const where = [];
    const params = [];
    if (query.q) { where.push(`name_norm LIKE ? ESCAPE '\\'`); params.push(like(normalizeName(query.q))); }
    if (query.country) { where.push('country = ?'); params.push(String(query.country).toUpperCase()); }
    if (query.hs) { where.push(`(',' || hs) LIKE ? ESCAPE '\\'`); params.push(`%,${String(query.hs).replace(/[^0-9]/g, '')}%`); }
    if (productParam(query)) { where.push('product_group = ?'); params.push(productParam(query)); }
    const sql = `FROM (
      SELECT buyer_norm name_norm, MIN(buyer) name, buyer_country country, COUNT(*) transactions, SUM(usd) usd, MAX(date) lastDate,
        GROUP_CONCAT(DISTINCT substr(hs,1,6)) hs, 'shipments' source, product_group FROM customs_shipments WHERE buyer_norm <> '' GROUP BY buyer_norm, buyer_country, product_group
      UNION ALL
      SELECT name_norm, MIN(name), country, SUM(transactions), SUM(usd), NULL, GROUP_CONCAT(DISTINCT substr(hs,1,6)), 'ranking', product_group
        FROM customs_rankings WHERE role = 'buyer' GROUP BY name_norm, country, product_group
    ) ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = one(`SELECT COUNT(*) n FROM (SELECT name_norm, country ${sql} GROUP BY name_norm, country)`, ...params).n;
    const rows = db.prepare(`SELECT MIN(name) name, country, SUM(transactions) transactions, ROUND(SUM(usd)) usd, MAX(lastDate) lastDate,
      GROUP_CONCAT(DISTINCT source) sources, GROUP_CONCAT(hs) hs, GROUP_CONCAT(DISTINCT product_group) productKeys ${sql} GROUP BY name_norm, country ORDER BY transactions DESC, name LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    return { total, limit, offset, rows: rows.map(({ productKeys, ...r }) => ({ ...r, products: String(productKeys || '').split(',').filter(Boolean).map(k => PRODUCT_LABELS[k] || k).slice(0, 6), hs: [...new Set(String(r.hs || '').split(',').filter(Boolean))].slice(0, 8) })) };
  }

  function shipments(query) {
    const { limit, offset } = page(query);
    const where = [];
    const params = [];
    if (query.q) { where.push(`(buyer_norm LIKE ? ESCAPE '\\' OR supplier_norm LIKE ? ESCAPE '\\')`); const p = like(normalizeName(query.q)); params.push(p, p); }
    if (query.country) { where.push('buyer_country = ?'); params.push(String(query.country).toUpperCase()); }
    if (query.hs) { where.push(`hs LIKE ? ESCAPE '\\'`); params.push(`${String(query.hs).replace(/[^0-9]/g, '')}%`); }
    if (productParam(query)) { where.push('product_group = ?'); params.push(productParam(query)); }
    if (query.portOut) { where.push(`port_out LIKE ? ESCAPE '\\'`); params.push(like(String(query.portOut).trim())); }
    if (query.portIn) { where.push(`port_in LIKE ? ESCAPE '\\'`); params.push(like(String(query.portIn).trim())); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one(`SELECT COUNT(*) n FROM customs_shipments ${w}`, ...params).n;
    const rows = db.prepare(`SELECT date, buyer, buyer_country buyerCountry, supplier, hs, product, product_group productKey, usd, qty, unit, port_out portOut, port_in portIn, incoterms FROM customs_shipments ${w} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { total, limit, offset, rows: rows.map(({ productKey, ...r }) => ({ ...r, group: PRODUCT_LABELS[productKey] || '' })) };
  }

  // Lọc theo đuôi email: ".vn"/"vn" = đuôi tên miền, "gmail.com" = đúng tên miền (kể cả tên miền con). Email lưu dạng 'a@x.com; b@y.vn'.
  function emailSuffixCond(raw) {
    const s = String(raw ?? '').trim().toLowerCase().replace(/^.*@/, '').replace(/[^a-z0-9.\-]/g, '');
    if (!s || s === '.') return null;
    const field = `(email || ';')`;
    if (s.startsWith('.') || !s.includes('.')) return { sql: `${field} LIKE ?`, params: [`%.${s.replace(/^\./, '')};%`] };
    return { sql: `(${field} LIKE ? OR ${field} LIKE ?)`, params: [`%@${s};%`, `%.${s};%`] };
  }

  // Thống kê tên miền/đuôi email của danh bạ (mỗi doanh nghiệp tính 1 lần cho mỗi tên miền); cache theo số dòng + id lớn nhất.
  let mailStats = null, mailKey = '';
  const SLD = new Set(['co', 'com', 'net', 'org', 'ne', 'or', 'ltd', 'plc']);
  function emailStats() {
    const k = one('SELECT COUNT(*) n, MAX(id) m FROM directory_entities');
    const key = `${k.n}:${k.m}`;
    if (mailStats && mailKey === key) return mailStats;
    const domains = new Map(), suffixes = new Map();
    const bump = (m, v) => m.set(v, (m.get(v) || 0) + 1);
    for (const r of db.prepare(`SELECT email FROM directory_entities WHERE email <> ''`).all()) {
      const doms = new Set(), sufs = new Set();
      for (const e of r.email.split(/[;,\s]+/).filter(Boolean)) {
        const d = e.toLowerCase().split('@')[1];
        if (!d || !/^[a-z0-9-]+(\.[a-z0-9-]+)+\.?$/.test(d) || !/\.[a-z]{2,}\.?$/.test(d)) continue; // bỏ email lỗi định dạng (".ae/", "gmail.c")
        const labels = d.split('.').filter(Boolean);
        if (labels.length < 2) continue;
        doms.add(d); sufs.add(`.${labels[labels.length - 1]}`);
        if (labels.length >= 3 && labels[labels.length - 1].length === 2 && SLD.has(labels[labels.length - 2])) sufs.add(`.${labels.slice(-2).join('.')}`);
      }
      doms.forEach(d => bump(domains, d)); sufs.forEach(s => bump(suffixes, s));
    }
    const byCount = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
    mailStats = { domains: [...domains].sort(byCount), suffixes: [...suffixes].sort(byCount) };
    mailKey = key;
    return mailStats;
  }

  function directory(query) {
    const { limit, offset } = page(query);
    const where = [];
    const params = [];
    if (query.q) { where.push(`name_norm LIKE ? ESCAPE '\\'`); params.push(like(normalizeName(query.q))); }
    if (query.country) { where.push('country = ?'); params.push(String(query.country).toUpperCase()); }
    if (query.type) { where.push('entity_type = ?'); params.push(String(query.type)); }
    if (query.hasEmail === '1') where.push(`email <> ''`);
    const suffix = emailSuffixCond(query.emailSuffix);
    if (suffix) { where.push(suffix.sql); params.push(...suffix.params); }
    if (EMAIL_CLASS_LABELS[query.emailClass]) { where.push('email_class = ?'); params.push(String(query.emailClass)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one(`SELECT COUNT(*) n FROM directory_entities ${w}`, ...params).n;
    const rows = db.prepare(`SELECT entity_type type, name, country, city, address, email, email_class emailClass, phone, website, contact_person contact, activity, confidence FROM directory_entities ${w} ORDER BY name LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { total, limit, offset, rows };
  }

  // Gợi ý khi gõ: field = name | hs | country; view quyết định bảng nguồn. Trả tối đa 8 mục (country: toàn bộ để lọc phía client).
  function suggest(query) {
    const field = String(query.field || '');
    const view = ['buyers', 'shipments', 'directory'].includes(query.view) ? query.view : 'buyers';
    const raw = String(query.q || '').trim();
    if (field === 'country') {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      const counts = {};
      const add = sql => db.prepare(sql).all().forEach(r => { if (/^[A-Z]{2}$/.test(r.c)) counts[r.c] = (counts[r.c] || 0) + r.n; });
      if (view === 'directory') add(`SELECT country c, COUNT(*) n FROM directory_entities GROUP BY country`);
      else {
        add(`SELECT buyer_country c, COUNT(*) n FROM customs_shipments GROUP BY buyer_country`);
        if (view === 'buyers') add(`SELECT country c, COUNT(*) n FROM customs_rankings WHERE role = 'buyer' GROUP BY country`);
      }
      return { options: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([code, n]) => { let label = code; try { label = names.of(code) || code; } catch { /* mã lạ */ } return { value: code, label, hint: n }; }) };
    }
    if (field === 'hs') {
      const d = raw.replace(/\D/g, '');
      if (d.length < 2) return { options: [] };
      const len = d.length > 6 ? 8 : 6;
      const rows = db.prepare(`SELECT code, product_group g, SUM(n) n FROM (
          SELECT substr(hs,1,${len}) code, product_group, COUNT(*) n FROM customs_shipments WHERE hs LIKE ? GROUP BY 1, 2
          UNION ALL SELECT substr(hs,1,${len}), product_group, COUNT(*) FROM customs_rankings WHERE hs LIKE ? GROUP BY 1, 2
        ) GROUP BY code, g ORDER BY code, n DESC`).all(`${d}%`, `${d}%`);
      const byCode = new Map();
      for (const r of rows) { const e = byCode.get(r.code) || { total: 0, g: r.g }; e.total += r.n; byCode.set(r.code, e); }
      return { options: [...byCode].sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([code, e]) => ({ value: code, label: PRODUCT_LABELS[e.g] || '', hint: e.total })) };
    }
    if (field === 'email_suffix') {
      const t = raw.toLowerCase().replace(/^.*@/, '').replace(/[^a-z0-9.\-]/g, '');
      const { domains, suffixes } = emailStats();
      const sufOpts = suffixes.filter(([v]) => !t || v.startsWith(t.startsWith('.') ? t : `.${t}`)).slice(0, t ? 3 : 8).map(([v, n]) => ({ value: v, label: 'đuôi', hint: n }));
      if (!t || t === '.') return { options: sufOpts };
      const pre = domains.filter(([v]) => v.startsWith(t)), inn = domains.filter(([v]) => !v.startsWith(t) && v.includes(t));
      const domOpts = t.startsWith('.') ? [] : [...pre, ...inn].slice(0, 8).map(([v, n]) => ({ value: v, label: 'tên miền', hint: n }));
      return { options: [...sufOpts, ...domOpts].slice(0, 8) };
    }
    if (field === 'port_in' || field === 'port_out') {
      const col = field; const t = raw.trim();
      if (t.length < 1) return { options: db.prepare(`SELECT ${col} v, COUNT(*) n FROM customs_shipments WHERE ${col} <> '' GROUP BY 1 ORDER BY n DESC LIMIT 8`).all().map(r => ({ value: r.v, hint: r.n })) };
      return { options: db.prepare(`SELECT ${col} v, COUNT(*) n FROM customs_shipments WHERE ${col} LIKE ? ESCAPE '\\' GROUP BY 1 ORDER BY (${col} LIKE ? ESCAPE '\\') DESC, n DESC LIMIT 8`).all(like(t), `${t.replace(/[\\%_]/g, '\\$&')}%`).map(r => ({ value: r.v, hint: r.n })) };
    }
    const n = normalizeName(raw);
    if (n.length < 2) return { options: [] };
    const any = like(n), pre = `${n.replace(/[\\%_]/g, '\\$&')}%`;
    const legs = view === 'directory'
      ? [`SELECT MIN(name) name, country, COUNT(*) n, name_norm nn, 'directory' role FROM directory_entities WHERE name_norm LIKE ? ESCAPE '\\' GROUP BY name_norm, country`]
      : view === 'shipments'
        ? [`SELECT MIN(buyer) name, buyer_country country, COUNT(*) n, buyer_norm nn, 'buyer' role FROM customs_shipments WHERE buyer_norm LIKE ? ESCAPE '\\' GROUP BY buyer_norm, buyer_country`,
           `SELECT MIN(supplier), '', COUNT(*), supplier_norm, 'supplier' FROM customs_shipments WHERE supplier_norm LIKE ? ESCAPE '\\' GROUP BY supplier_norm`]
        : [`SELECT MIN(buyer) name, buyer_country country, COUNT(*) n, buyer_norm nn, 'buyer' role FROM customs_shipments WHERE buyer_norm LIKE ? ESCAPE '\\' GROUP BY buyer_norm, buyer_country`,
           `SELECT MIN(name), country, COUNT(*), name_norm, 'buyer' FROM customs_rankings WHERE role = 'buyer' AND name_norm LIKE ? ESCAPE '\\' GROUP BY name_norm, country`];
    const rows = db.prepare(`SELECT MIN(name) name, country, role, SUM(n) n FROM (${legs.join(' UNION ALL ')})
      GROUP BY nn, country, role ORDER BY (nn LIKE ? ESCAPE '\\') DESC, n DESC, name LIMIT 8`).all(...legs.map(() => any), pre);
    return { options: rows.map(r => ({ value: r.name, label: [r.country, view === 'shipments' ? r.role : ''].filter(Boolean).join(' · '), hint: r.n })) };
  }

  // Số doanh nghiệp theo loại email (cho các tab nhỏ của "Phân loại email").
  function emailClasses() {
    const counts = Object.fromEntries(db.prepare('SELECT email_class k, COUNT(*) n FROM directory_entities GROUP BY email_class').all().map(r => [r.k, r.n]));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { total, classes: Object.entries(EMAIL_CLASS_LABELS).map(([key, label]) => ({ key, label, n: counts[key] || 0 })) };
  }

  // Danh sách tên miền email (mỗi doanh nghiệp tính 1 lần/tên miền) kèm loại; lọc q (chứa chuỗi), class.
  function emailDomains(query) {
    const { limit, offset } = page(query);
    const q = String(query.q ?? '').toLowerCase().replace(/^.*@/, '').replace(/[^a-z0-9.\-]/g, '');
    const cls = EMAIL_CLASS_LABELS[query.emailClass] ? String(query.emailClass) : '';
    const all = emailStats().domains.filter(([d]) => (!q || d.includes(q)) && (!cls || emailDomainClass(d) === cls));
    return { total: all.length, limit, offset, rows: all.slice(offset, offset + limit).map(([domain, n]) => ({ domain, class: EMAIL_CLASS_LABELS[emailDomainClass(domain)], n })) };
  }

  return { summary, products, suggest, buyers, shipments, directory, emailClasses, emailDomains };
}
