import { DatabaseSync } from 'node:sqlite';
import { PRODUCT_GROUPS, PRODUCT_LABELS, backfillProductGroups } from './customs-products.mjs';

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
  // Cột product_group thêm sau: migrate DB cũ, tạo chỉ mục, điền các dòng còn trống.
  for (const t of ['customs_shipments', 'customs_rankings', 'customs_market']) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === 'product_group')) db.exec(`ALTER TABLE ${t} ADD COLUMN product_group TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_pg ON ${t}(product_group)`);
  }
  backfillProductGroups(db);
  return db;
}

const SUFFIX = /\b(co|ltd|inc|llc|l l c|corp|corporation|limited|company|pvt|private|gmbh|sdn|bhd|jsc|joint|stock|the|sa|sarl|bv|b v|pte|fze|fzc|dmcc)\b/g;
export function normalizeName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
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
    if (query.hs) { where.push(`hs LIKE ? ESCAPE '\\'`); params.push(`${String(query.hs).replace(/[^0-9]/g, '')}%`); }
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
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one(`SELECT COUNT(*) n FROM customs_shipments ${w}`, ...params).n;
    const rows = db.prepare(`SELECT date, buyer, buyer_country buyerCountry, supplier, hs, product, product_group productKey, usd, qty, unit, port_in portIn, incoterms FROM customs_shipments ${w} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { total, limit, offset, rows: rows.map(({ productKey, ...r }) => ({ ...r, group: PRODUCT_LABELS[productKey] || '' })) };
  }

  function directory(query) {
    const { limit, offset } = page(query);
    const where = [];
    const params = [];
    if (query.q) { where.push(`name_norm LIKE ? ESCAPE '\\'`); params.push(like(normalizeName(query.q))); }
    if (query.country) { where.push('country = ?'); params.push(String(query.country).toUpperCase()); }
    if (query.type) { where.push('entity_type = ?'); params.push(String(query.type)); }
    if (query.hasEmail === '1') where.push(`email <> ''`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one(`SELECT COUNT(*) n FROM directory_entities ${w}`, ...params).n;
    const rows = db.prepare(`SELECT entity_type type, name, country, city, address, email, phone, website, contact_person contact, activity, confidence FROM directory_entities ${w} ORDER BY name LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { total, limit, offset, rows };
  }

  return { summary, products, buyers, shipments, directory };
}
