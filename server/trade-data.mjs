import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyProduct } from './trade-recommend.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const ALIASES = [
  ['cà phê', '0901', 'Cà phê'], ['coffee', '0901', 'Cà phê'],
  ['hạt điều', '0801', 'Hạt điều'], ['cashew', '0801', 'Hạt điều'],
  ['gạo', '1006', 'Gạo'], ['rice', '1006', 'Gạo'],
  ['hồ tiêu', '0904', 'Hồ tiêu'], ['pepper', '0904', 'Hồ tiêu'],
  ['cao su', '4001', 'Cao su'], ['rubber', '4001', 'Cao su'],
  ['thủy sản', '03', 'Thủy sản'], ['seafood', '03', 'Thủy sản'],
  ['dệt may', '61', 'Dệt may'], ['garment', '61', 'Dệt may'],
  ['giày dép', '64', 'Giày dép'], ['footwear', '64', 'Giày dép'],
  ['gỗ', '44', 'Gỗ và sản phẩm gỗ'], ['wood', '44', 'Gỗ và sản phẩm gỗ'],
];

export function ensureTradeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_url TEXT,
      period TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS trade_flows (
      snapshot_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      reporter_iso TEXT NOT NULL DEFAULT 'VNM',
      partner_iso TEXT NOT NULL,
      partner_name TEXT NOT NULL,
      hs_code TEXT NOT NULL,
      product_group TEXT,
      export_value_usd REAL NOT NULL DEFAULT 0,
      quantity REAL,
      quantity_unit TEXT,
      yoy_growth REAL,
      source_url TEXT,
      PRIMARY KEY (snapshot_id, partner_iso, hs_code, product_group)
    );
    CREATE INDEX IF NOT EXISTS idx_trade_hs_partner ON trade_flows(hs_code, partner_iso, period);
    CREATE TABLE IF NOT EXISTS product_hs_aliases (
      alias TEXT PRIMARY KEY,
      hs_code TEXT NOT NULL,
      product_group TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'reviewed',
      reviewed INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'curated'
    );
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO product_hs_aliases (alias, hs_code, product_group) VALUES (?, ?, ?)');
  for (const row of ALIASES) insert.run(...row);
}

const clean = (v, max = 160) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const field = (row, names) => names.map((x) => row[x] ?? row[x.toLowerCase()]).find((x) => x !== undefined && x !== null && x !== '');

export function normalizeTradeRow(row, defaults = {}) {
  const hsRaw = clean(field(row, ['hs_code', 'hsCode', 'cmdCode', 'commodity_code', 'ma_hs']), 20);
  const hs = hsRaw.toUpperCase() === 'TOTAL' ? 'TOTAL' : hsRaw.replace(/[^0-9]/g, '');
  const partner = clean(field(row, ['partner_iso', 'partnerIso', 'country_iso', 'partner_code', 'country']), 20).toUpperCase();
  const partnerName = clean(field(row, ['partner_name', 'partnerName', 'country_name', 'country']), 120);
  const period = clean(field(row, ['period', 'year', 'nam']), 20) || clean(defaults.period, 20);
  if (!hs || !partner || !partnerName || !period) throw new Error('Mỗi dòng cần hs_code, partner_iso, partner_name và period');
  return {
    period, reporterIso: clean(field(row, ['reporter_iso', 'reporterIso']) || defaults.reporterIso || 'VNM', 10).toUpperCase(),
    partnerIso: partner, partnerName, hsCode: hs, productGroup: clean(field(row, ['product_group', 'productGroup', 'product_name']) || defaults.productGroup, 160),
    exportValueUsd: num(field(row, ['export_value_usd', 'exportValueUsd', 'trade_value_usd', 'value_usd', 'value'])) ?? 0,
    quantity: num(field(row, ['quantity', 'qty', 'luong'])), quantityUnit: clean(field(row, ['quantity_unit', 'qtyUnit', 'unit', 'dvt']), 30),
    yoyGrowth: num(field(row, ['yoy_growth', 'yoyGrowth', 'growth'])), sourceUrl: clean(field(row, ['source_url', 'sourceUrl']) || defaults.sourceUrl, 500),
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((x) => x.trim());
  if (!lines.length) return [];
  const split = (line) => { const out = []; let cur = '', quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };
  const headers = split(lines[0]).map((x) => x.replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => { const values = split(line); return Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])); });
}

export function readTradeFile(file) {
  const text = readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.csv')) return parseCsv(text);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows : [];
}

export function importTradeRows(db, rows, meta = {}) {
  const normalized = rows.map((x) => normalizeTradeRow(x, meta));
  if (!normalized.length) throw new Error('Snapshot không có dòng dữ liệu');
  const period = meta.period || normalized[0].period;
  db.exec('BEGIN');
  try {
    const result = db.prepare('INSERT INTO trade_snapshots (source, source_url, period, imported_at, row_count) VALUES (?, ?, ?, ?, ?)').run(clean(meta.source || 'unknown', 120), clean(meta.sourceUrl, 500), period, Date.now(), normalized.length);
    const id = Number(result.lastInsertRowid);
    const insert = db.prepare('INSERT INTO trade_flows (snapshot_id, period, reporter_iso, partner_iso, partner_name, hs_code, product_group, export_value_usd, quantity, quantity_unit, yoy_growth, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const r of normalized) insert.run(id, r.period, r.reporterIso, r.partnerIso, r.partnerName, r.hsCode, r.productGroup, r.exportValueUsd, r.quantity, r.quantityUnit, r.yoyGrowth, r.sourceUrl);
    db.exec('COMMIT');
    return { snapshotId: id, rows: normalized.length, period };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function rankTradeMarkets(db, product, limit = 8) {
  const classification = classifyProduct(product);
  if (!classification.hs.length) return { status: 'unclassified', classification, markets: [] };
  const latestRow = db.prepare(`SELECT snapshot_id AS id, period FROM trade_flows WHERE hs_code IN (${classification.hs.map(() => '?').join(',')}) ORDER BY period DESC, snapshot_id DESC LIMIT 1`).get(...classification.hs);
  const latest = latestRow?.id;
  if (!latest) return { status: 'not_loaded', classification, markets: [] };
  const previous = db.prepare(`SELECT snapshot_id AS id FROM trade_flows WHERE period < ? AND hs_code IN (${classification.hs.map(() => '?').join(',')}) ORDER BY period DESC, snapshot_id DESC LIMIT 1`).get(latestRow.period, ...classification.hs)?.id;
  const placeholders = classification.hs.map(() => '?').join(',');
  const rows = db.prepare(`SELECT partner_iso, partner_name, SUM(export_value_usd) AS value, AVG(yoy_growth) AS growth, COUNT(DISTINCT period) AS periods, MAX(period) AS period FROM trade_flows WHERE snapshot_id = ? AND hs_code IN (${placeholders}) GROUP BY partner_iso, partner_name ORDER BY value DESC`).all(latest, ...classification.hs);
  if (!rows.length) return { status: 'not_loaded', classification, markets: [] };
  const priorRows = previous ? db.prepare(`SELECT partner_iso, SUM(export_value_usd) AS value FROM trade_flows WHERE snapshot_id = ? AND hs_code IN (${placeholders}) GROUP BY partner_iso`).all(previous, ...classification.hs) : [];
  const prior = new Map(priorRows.map((r) => [r.partner_iso, Number(r.value) || 0]));
  const maxValue = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  const markets = rows.map((r) => {
    const value = Number(r.value) || 0, old = prior.get(r.partner_iso) || 0;
    const growth = r.growth === null && old > 0 ? (value - old) / old * 100 : r.growth === null ? null : Number(r.growth);
    return { country: r.partner_name, countryIso: r.partner_iso, exportValueUsd: value, growthRate: growth === null ? null : Math.round(growth * 100) / 100, periods: Number(r.periods), period: r.period, score: Math.round(value / maxValue * 75 + Math.max(-25, Math.min(25, growth || 0))) };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
  const total = markets.reduce((s, x) => s + x.exportValueUsd, 0) || 1;
  return { status: 'loaded', classification, markets: markets.map((x) => ({ ...x, share: Math.round(x.exportValueUsd / total * 10000) / 100 })) };
}

export function rankAllExportMarkets(db, limit = 100) {
  const latestRow = db.prepare("SELECT snapshot_id AS id, period FROM trade_flows WHERE hs_code = 'TOTAL' ORDER BY period DESC, snapshot_id DESC LIMIT 1").get();
  const latest = latestRow?.id;
  if (!latest) return { status: 'not_loaded', markets: [] };
  const rows = db.prepare("SELECT partner_iso, partner_name, SUM(export_value_usd) AS value, MAX(period) AS period FROM trade_flows WHERE snapshot_id = ? AND hs_code = 'TOTAL' GROUP BY partner_iso, partner_name ORDER BY value DESC LIMIT ?").all(latest, limit);
  const total = rows.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
  return { status: rows.length ? 'loaded' : 'not_loaded', period: rows[0]?.period || null, markets: rows.map((r) => ({ country: r.partner_name, countryIso: r.partner_iso, exportValueUsd: Number(r.value) || 0, share: Math.round((Number(r.value) || 0) / total * 10000) / 100, period: r.period })) };
}

export function mergeAiWithTrade(aiCountries, trade, classification) {
  if (trade.status !== 'loaded') return aiCountries;
  const byName = new Map(aiCountries.map((x) => [x.country.toLowerCase(), x]));
  return trade.markets.map((m) => {
    const ai = byName.get(m.country.toLowerCase());
    return { country: m.country, keywords: ai?.keywords?.length ? ai.keywords : [`${classification.name || 'product'} importer`], reason: ai?.reason || `Việt Nam có kim ngạch xuất khẩu đáng kể; tăng trưởng ${m.growthRate ?? 'chưa có'}%`, trade: m };
  });
}
