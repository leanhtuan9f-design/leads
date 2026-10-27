#!/usr/bin/env node
// Nhập `5.Customers Data` vào DB Customs Data (customs.db). Mặc định dry-run; thêm --apply để ghi.
// Dùng: node server/customs-import.mjs <thư mục> [--apply] [--docs] [--db /path/customs.db]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import XLSX from 'xlsx';
import { openCustomsDb, normalizeName } from './customs-data.mjs';
import { backfillProductGroups, normalizeHs } from './customs-products.mjs';

// ---- chuẩn hóa chung ----
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRY = new Map();
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b);
  let n; try { n = names.of(code); } catch { continue; }
  if (n && n !== code) COUNTRY.set(n.toLowerCase(), code);
}
Object.entries({ usa: 'US', 'u s a': 'US', 'united states of america': 'US', america: 'US', uk: 'GB', england: 'GB', 'united kingdom': 'GB', korea: 'KR', 'south korea': 'KR', 'republic of korea': 'KR',
  'hong kong': 'HK', hongkong: 'HK', 'hong kong(china)': 'HK', 'taiwan(china)': 'TW', taiwan: 'TW', taiwain: 'TW', vietnam: 'VN', 'viet nam': 'VN', uae: 'AE', 'united arab emirates': 'AE', 'united arap emirates': 'AE',
  russia: 'RU', iran: 'IR', nethelands: 'NL', netherlands: 'NL', holland: 'NL', czech: 'CZ', 'czech republic': 'CZ', 'saudi arabia': 'SA', macau: 'MO', 'macao(china)': 'MO', 'china': 'CN', 'mainland china': 'CN' })
  .forEach(([k, v]) => COUNTRY.set(k, v));
export function toCountry(value) {
  const s = String(value ?? '').trim();
  if (!s || s === '0' || s === '-' || /^n\/?a$/i.test(s)) return '';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const k = s.toLowerCase().replace(/^data[_ ]/, '').replace(/^\d+\./, '').replace(/\s*\(\d+\)$/, '').replace(/[_]+/g, ' ').trim();
  return COUNTRY.get(k) || '';
}
export function countryFromPath(rel) {
  for (const seg of [...path.dirname(rel).split('/'), path.basename(rel).replace(/\.[^.]+$/, '')].reverse()) {
    const c = toCountry(seg) || toCountry(seg.replace(/^\d+[\s.]*data[_ ]/i, '').replace(/^\d+\./, ''));
    if (c) return c;
    const m = seg.match(/-(united states|south korea|england|taiwan|pakistan|india|vietnam|malaysia|singapore|japan|china|korea)(?: new)?-/i);
    if (m) { const cc = toCountry(m[1]); if (cc) return cc; }
  }
  return '';
}
export function hsFromPath(rel) {
  const m = rel.match(/\[(\d{4,8})\]/) || path.basename(rel).match(/(?:^|[^\d])(\d{6,8})(?:[^\d]|$)/) || rel.match(/\/(\d{6,8})\//);
  return m ? m[1] : '';
}
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const clean = v => { const t = text(v); return /^(n\/?a|-|\.|0|unknown)$/i.test(t) ? '' : t; };
export function toDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}
// Giá trị USD phi thực tế trong nguồn (đơn vị sai/nhập sai): ẩn (NULL), giữ dòng. Khóa dedupe vẫn dùng giá trị gốc.
export const MAX_SHIPMENT_USD = 1e7, MAX_RANKING_USD_PER_TX = 1e7;
export const shipmentUsd = v => (v != null && v >= MAX_SHIPMENT_USD ? null : v);
export const rankingUsd = (v, tx) => (v != null && tx > 0 && v / tx >= MAX_RANKING_USD_PER_TX ? null : v);
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 24);
const keyOf = s => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Đọc sheet thành {header, rows(objects)}; tự tìm dòng tiêu đề, nếu không có thì trả danh sách thô.
function readSheet(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const filled = r => r.filter(x => text(x) !== '').length;
  const i = raw.findIndex((r, idx) => filled(r) >= 3 && raw.slice(idx + 1, idx + 6).some(n => filled(n) >= 2) && r.filter(x => typeof x === 'string' && text(x)).length >= 3);
  if (i < 0) return { header: null, raw };
  const header = raw[i].map(text);
  const seen = {};
  const keys = header.map((h, c) => { let k = keyOf(h) || `col${c}`; seen[k] = (seen[k] || 0) + 1; return seen[k] > 1 ? `${k}_${seen[k]}` : k; });
  const rows = raw.slice(i + 1).filter(r => filled(r)).map(r => Object.fromEntries(keys.map((k, c) => [k, r[c]])));
  return { header, keys, rows, raw };
}
const pick = (row, ...names) => { for (const n of names) { const v = row[keyOf(n)]; if (v !== undefined && text(v) !== '') return v; } return ''; };
const has = (keys, ...names) => names.some(n => keys.includes(keyOf(n)));

// Nước của buyer: ưu tiên mã/tên nước ở cuối địa chỉ; cột "importing/destination" đôi khi là nước xuất (VN) nên bỏ VN.
function buyerCountry(address, ...candidates) {
  const a = text(address);
  const code = a.match(/[,\s]([A-Z]{2})\s*$/);
  if (code && toCountry(code[1]) && code[1] !== 'VN') return code[1];
  const byName = toCountry(a.split(/[,;]/).pop().trim());
  if (byName && byName !== 'VN') return byName;
  for (const c of candidates) { const cc = toCountry(c); if (cc && cc !== 'VN') return cc; }
  return '';
}

function productHint(rel) {
  return path.dirname(rel).split('/').slice(-3).join(' / ');
}

// ---- parse từng loại sheet. Trả {shipments, rankings, market, directory} ----
export function parseSheet(sheet, rel, sheetName) {
  const out = { shipments: [], rankings: [], market: [], directory: [] };
  const country0 = countryFromPath(rel) || toCountry(sheetName);
  const hs0 = hsFromPath(rel);
  const base = path.basename(rel);
  const product = productHint(rel);
  const { keys, rows, raw } = sheet;

  if (!keys) { // danh sách tên (có thể kèm số lô hàng ở cột 2), không có dòng tiêu đề
    const list = raw.filter(r => typeof r[0] === 'string' && text(r[0]).length > 2 && text(r[0]).length < 160);
    if (raw.length < 3 || list.length < raw.filter(r => text(r[0])).length * 0.8) return out;
    const role = /supplier|nhà cung cấp|exporter/i.test(`${base} ${sheetName}`) ? 'supplier' : 'buyer';
    for (const r of list) {
      if (/^(importer|buyer|lọc|countries|company|name|list of|potential)/i.test(text(r[0]))) continue;
      // Cột 2 chỉ là số lô hàng khi là số thật; "100100064770#&Quần áo…" là mô tả hàng, không parseFloat.
      const c2 = typeof r[1] === 'number' ? r[1] : /^[\d.,]+$/.test(text(r[1])) ? num(r[1]) : null;
      out.rankings.push({ role, name: text(r[0]), country: country0 || toCountry(sheetName), hs: hs0, product: c2 === null && text(r[1]) ? text(r[1]).split('#&').pop().replace(/\s*@$/, '').slice(0, 200) || product : product, transactions: c2, usd: null, qty: null, weight: null, share: null, url: '' });
    }
    return out;
  }

  const k = keys;
  // 1) vận đơn / hồ sơ hải quan chi tiết
  const isBolBuyerSupplier = has(k, 'Total amount(USD)') && has(k, 'Buyer') && has(k, 'Supplier') || has(k, 'Total amount(USD)') && has(k, 'Bill of Lading Number');
  const isImporterSide = has(k, 'B/L Number') && has(k, 'Importer') && has(k, 'Exporter');
  const isDtpShipment = has(k, 'Consignee Name') && has(k, 'Invoice Value') && has(k, 'HS Code');
  const isExporterImporter = has(k, 'Exporter') && has(k, 'Importer') && has(k, 'HS Code') && has(k, 'Value(USD)');
  if (isBolBuyerSupplier || isImporterSide || isDtpShipment || isExporterImporter) {
    for (const r of rows) {
      let s;
      if (isBolBuyerSupplier) s = { date: toDate(pick(r, 'Date')), buyer: text(pick(r, 'Buyer')), buyerCountry: buyerCountry(pick(r, "Buyer's address"), pick(r, 'importing country'), pick(r, 'Destination country')), buyerAddress: clean(pick(r, "Buyer's address")),
        supplier: text(pick(r, 'Supplier', 'supplier')), supplierAddress: clean(pick(r, 'Supplier Address')), supplierPhone: clean(pick(r, "Supplier's phone number")), hs: text(pick(r, 'HS code')), product: text(pick(r, 'Product Description')),
        usd: num(pick(r, 'Total amount(USD)')), qty: num(pick(r, 'Qty')), unit: text(pick(r, 'quantity unit')), weight: null, portIn: clean(pick(r, 'Import port')), portOut: clean(pick(r, 'Port of departure')), mode: clean(pick(r, 'Transportation mode')), incoterms: clean(pick(r, 'Trade mode')) };
      else if (isImporterSide) s = { date: toDate(pick(r, 'Date')), buyer: text(pick(r, 'Importer')), buyerCountry: buyerCountry(pick(r, "Importer's Address"), pick(r, 'Country of Destination'), country0), buyerAddress: clean(pick(r, "Importer's Address")),
        supplier: text(pick(r, 'Exporter')), supplierAddress: clean(pick(r, "Exporter's Address (EN)")) || clean(pick(r, "Exporter's Address")), supplierPhone: clean(pick(r, "Exporter's Phone Number")), hs: text(pick(r, 'HS Code')), product: text(pick(r, 'Product Description')),
        usd: num(pick(r, "Total Price (US$)")), qty: num(pick(r, 'Quantity')), unit: text(pick(r, 'Quantity Unit')), weight: num(pick(r, 'Weight')), portIn: clean(pick(r, 'Port of Destination')), portOut: clean(pick(r, 'Port of Loading')), mode: clean(pick(r, 'Transport Mode')), incoterms: clean(pick(r, 'Incoterms')) };
      else if (isDtpShipment) s = { date: toDate(pick(r, 'Date')), buyer: text(pick(r, 'Consignee Name')), buyerCountry: buyerCountry([pick(r, 'Consignee Address'), pick(r, 'Consignee Address 2'), pick(r, 'Consignee Address 3'), pick(r, 'Consignee Address 4')].map(text).filter(Boolean).join(', '), pick(r, 'Country of Destination')), buyerAddress: clean([pick(r, 'Consignee Address'), pick(r, 'Consignee Address 2'), pick(r, 'Consignee Address 3')].map(text).filter(Boolean).join(', ')),
        supplier: text(pick(r, 'Shipper Name')), supplierAddress: clean(pick(r, 'Shipper Address')), supplierPhone: clean(pick(r, 'Shipper Phone')), hs: text(pick(r, 'HS Code')), product: text(pick(r, 'Product Description')),
        usd: /^usd$/i.test(text(pick(r, 'Value Currency'))) ? num(pick(r, 'Invoice Value')) : null, qty: num(pick(r, 'Quantity')), unit: text(pick(r, 'Unit')), weight: num(pick(r, 'Gross Weight')), portIn: clean(pick(r, 'Port of Destination')), portOut: clean(pick(r, 'Port of Origin')), mode: clean(pick(r, 'Shipment Mode')), incoterms: clean(pick(r, 'Incoterms')) };
      else s = { date: toDate(pick(r, 'Date')), buyer: text(pick(r, 'Importer')), buyerCountry: buyerCountry(pick(r, 'Importer Address'), pick(r, 'Destination Country')), buyerAddress: clean(pick(r, 'Importer Address')),
        supplier: text(pick(r, 'Exporter')), supplierAddress: clean(pick(r, 'Exporter Address')), supplierPhone: clean(pick(r, 'Exporter Contact')), hs: text(pick(r, 'HS Code')), product: text(pick(r, 'Description')),
        usd: num(pick(r, 'Value(USD)')), qty: num(pick(r, 'Quantity')), unit: text(pick(r, 'Quantity Unit')), weight: null, portIn: clean(pick(r, 'Destination Port')), portOut: clean(pick(r, 'Origin Port')), mode: clean(pick(r, 'Mode of Transportation')), incoterms: clean(pick(r, 'incoterms')) };
      if (!s.buyer && !s.supplier) continue;
      if (/^\d{5,6}$/.test(String(pick(r, 'Date')))) s.date = toDate(Number(pick(r, 'Date')));
      s.hs = s.hs.replace(/\D/g, '');
      out.shipments.push(s);
    }
    return out;
  }

  // 2) bảng thống kê thị trường: quốc gia/cảng/HS
  const marketCol = ['Quốc gia', 'Cảng dỡ hàng', 'Buyer country', 'Supplier country', 'Countries'].find(n => has(k, n));
  // "Buyer country list" của 52WMB có cột buyer/seller = SỐ buyer/seller của nước đó, không phải tên công ty.
  if (marketCol && (/ country$/i.test(marketCol) || !has(k, 'Buyer') && !has(k, 'Supplier'))) {
    const kind = /cảng/i.test(marketCol) ? 'port' : 'country';
    for (const r of rows) {
      const name = text(r[keyOf(marketCol)]);
      if (!name || name.length > 120) continue;
      out.market.push({ kind, name, shipments: num(pick(r, 'lô hàng', 'Transactions', 'Shipment')), usd: num(pick(r, 'Giá trị (US$)', 'amount')), qty: num(pick(r, 'Số lượng', 'qty')), weight: num(pick(r, 'Cân nặng (kg)', 'weight')), product });
    }
    return out;
  }

  // 3) bảng xếp hạng buyer/supplier (52WMB, Datatradepro, Tên công ty/Nhà nhập khẩu)
  // Cột tên là cột đứng đầu trong tiêu đề; file Supplier list còn có cột "buyer" = số buyer, không được lấy làm tên.
  const nameCands = ['Buyer', 'Supplier', 'Tên công ty', 'Nhà nhập khẩu', 'Importer'];
  const nameCol = nameCands.filter(n => has(k, n)).sort((a, b) => k.indexOf(keyOf(a)) - k.indexOf(keyOf(b)))[0];
  const trans = ['Transactions', 'lô hàng', 'Shipment', 'Percentage'].find(n => has(k, n));
  if (nameCol && trans) {
    const role = nameCol === 'Supplier' || /nhà cung cấp|supplier/i.test(base) ? 'supplier' : 'buyer';
    for (const r of rows) {
      const name = text(r[keyOf(nameCol)]);
      if (!name || name.length > 160 || /^total$/i.test(name)) continue;
      out.rankings.push({ role, name, country: toCountry(pick(r, 'Destination country')) || country0, hs: text(pick(r, 'HS Code')).replace(/\D/g, '') || hs0, product: text(pick(r, 'Products')) || product,
        transactions: trans === 'Percentage' ? num(pick(r, 'Quantity')) : num(r[keyOf(trans)]), usd: num(pick(r, 'Giá trị (US$)', 'amount')), qty: trans === 'Percentage' ? null : num(pick(r, 'Số lượng', 'qty', 'quantity')), weight: num(pick(r, 'Cân nặng (kg)', 'weight')),
        share: num(pick(r, 'Percent')), url: text(pick(r, 'URL')) });
    }
    return out;
  }
  if (nameCol === 'Buyer' && has(k, 'Products')) { // Buyer|Products(|Currency...)
    for (const r of rows) {
      const name = text(r.buyer);
      if (name) out.rankings.push({ role: 'buyer', name, country: toCountry(pick(r, 'Destination country')) || country0, hs: text(pick(r, 'HS Code')).replace(/\D/g, '') || hs0, product: text(pick(r, 'Products')).slice(0, 200), transactions: null, usd: null, qty: null, weight: null, share: null, url: '' });
    }
    return out;
  }
  if (has(k, 'Tên công ty') && has(k, 'Quốc gia')) {
    for (const r of rows) { const name = text(r[keyOf('Tên công ty')]); if (name) out.rankings.push({ role: 'buyer', name, country: toCountry(r[keyOf('Quốc gia')]) || country0, hs: hs0, product, transactions: null, usd: null, qty: null, weight: null, share: null, url: '' }); }
    return out;
  }

  // 4) danh bạ có liên hệ / registry / nhà máy
  const NAMES = ['name', 'company', 'company name', 'consignee name', 'tên công ty', 'vendor name', 'facility_name', 'importer name', '기업명', 'tên người nhập khẩu'].map(keyOf);
  const nameKey = NAMES.find(n => k.includes(n)) || null;
  if (!nameKey) return out;
  const emailKeys = k.filter(x => /email/.test(x)), phoneKeys = k.filter(x => /^(phone|tel|telephone|mobile|contactofficenumber|mainnumber|number|전화번호)/.test(x) || /phone|tel$/.test(x));
  const webKey = k.find(x => /web|site|homepage|홈페이지/.test(x));
  const addrKey = k.find(x => /address|địachỉ|주소|billingaddress|street/.test(x));
  const cityKey = k.find(x => /^(city|citystate|location|areaofbusiness)$/.test(x) || x === 'city');
  const contactKey = k.find(x => /^(attention|contact|담당자|contactname|contactperson|managingdirector)$/.test(x));
  const actKey = k.find(x => /^(activity|product|business|areaofbusiness|취급제품|품목|activitycode|class|activity_2|producttype)$/.test(x));
  const countryKey = k.find(x => /^(country|국가지역|countryregion)$/.test(x));
  const type = entityTypeFor(rel);
  if (!emailKeys.length && !phoneKeys.length && !addrKey && !webKey && type !== 'registry') return out;
  for (const r of rows) {
    const name = text(r[nameKey]);
    if (!name || name.length > 200 || /^(name|company|no\.?)$/i.test(name)) continue;
    const emails = emailKeys.flatMap(x => String(r[x] ?? '').split(/[;,\s]+/)).map(e => e.trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    const phone = clean(phoneKeys.map(x => r[x]).find(v => String(v ?? '').replace(/\D/g, '').length > 5));
    let web = clean(webKey ? r[webKey] : '');
    if (web && !/\./.test(web)) web = '';
    out.directory.push({ type, name, country: toCountry(countryKey ? r[countryKey] : '') || country0, city: clean(cityKey ? r[cityKey] : ''), address: clean(addrKey ? r[addrKey] : ''), email: [...new Set(emails)].join('; '), phone: type === 'registry' ? '' : String(phone || ''), website: web,
      contact: clean(contactKey ? r[contactKey] : ''), activity: clean(actKey ? r[actKey] : '').slice(0, 300), confidence: 'normal' });
  }
  return out;
}

export function entityTypeFor(rel) {
  const r = rel.toLowerCase();
  if (/factoriesreport/.test(r)) return 'manufacturer';
  if (/icvsuppliers/.test(r)) return 'supplier';
  if (/nationalshippers/.test(r)) return 'shipper';
  if (/shrimp|us importer list|attachment-ii|importer/.test(r) && !/fruit/.test(r)) return 'importer';
  if (/giftware|trade_map|trade map|fresh fruit buyers|바이어정보|dubai chamber|uk-importers|buyer/.test(r)) return 'importer';
  if (/company-list|incorporation|registry/.test(r)) return 'registry';
  if (/usda|vendor|contact list|hmpc|packinghouse/.test(r)) return 'vendor';
  if (/data_competitors|competitor/.test(r)) return 'competitor';
  return 'contact';
}

// ---- PDF / DOC: trích email kèm tên (độ tin cậy thấp) ----
export function parseDocText(txt, rel) {
  const out = [];
  const lines = txt.split(/\r?\n/).map(l => l.replace(/\s{2,}/g, '  ').trim());
  const country = countryFromPath(rel);
  const type = entityTypeFor(rel);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
    if (!m) continue;
    const before = lines[i].split(m[0])[0].split(/  |\t/)[0];
    let name = text(before.replace(/[:|,;]+$/, ''));
    if (name.length < 3 || /^(e-?mail|email|tel|fax|phone)\b/i.test(name)) {
      name = ''; for (let j = i - 1; j >= Math.max(0, i - 4); j--) { if (lines[j] && !/@/.test(lines[j]) && /[A-Za-z]{3}/.test(lines[j]) && !/^(tel|fax|phone|e-?mail|address|www)/i.test(lines[j])) { name = text(lines[j].split(/  /)[0]); break; } }
    }
    const website = (lines.slice(i - 2, i + 3).join(' ').match(/(?:https?:\/\/|www\.)[^\s,;]+/i) || [''])[0];
    const phone = (lines.slice(i - 2, i + 3).join(' ').match(/\+?\d[\d\s().-]{7,}\d/) || [''])[0];
    if (!name || name.length > 120) continue;
    out.push({ type: type === 'contact' ? 'document' : type, name, country, city: '', address: '', email: [...new Set(m.map(e => e.toLowerCase()))].join('; '), phone, website, contact: '', activity: '', confidence: 'low' });
  }
  return out;
}
function docToText(file) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.pdf') return execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 256 << 20, timeout: 120000 }).toString('utf8');
    if (ext === '.doc') return execFileSync('antiword', [file], { maxBuffer: 64 << 20, timeout: 60000 }).toString('utf8');
  } catch { /* tệp hỏng hoặc quét ảnh */ }
  return '';
}

// ---- ghi DB ----
function walk(dir, exts) {
  const out = [];
  (function go(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) go(p); else if (exts.test(e.name)) out.push(p); } })(dir);
  return out.sort();
}

export function importAll(root, { db, docs = false } = {}) {
  const apply = true; // dry-run dùng DB :memory:, nên luôn ghi vào `db` được truyền vào
  const stats = { files: 0, errors: 0, shipments: 0, rankings: 0, market: 0, directory: 0, docFiles: 0, perKind: {} };
  const insS = db.prepare(`INSERT OR IGNORE INTO customs_shipments (dedupe_key,file,date,buyer,buyer_norm,buyer_country,buyer_address,supplier,supplier_norm,supplier_address,supplier_phone,hs,product,usd,qty,unit,weight,port_in,port_out,mode,incoterms,direction)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'export')`);
  const insR = db.prepare('INSERT OR IGNORE INTO customs_rankings (dedupe_key,file,role,name,name_norm,country,hs,product,transactions,usd,qty,weight,share,url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insM = db.prepare('INSERT OR IGNORE INTO customs_market (dedupe_key,file,kind,name,shipments,usd,qty,weight,product) VALUES (?,?,?,?,?,?,?,?,?)');
  const insD = db.prepare('INSERT OR IGNORE INTO directory_entities (dedupe_key,file,entity_type,name,name_norm,country,city,address,email,phone,website,contact_person,activity,confidence) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insF = db.prepare('INSERT OR REPLACE INTO customs_files (path,kind,rows,imported_at) VALUES (?,?,?,?)');
  const changes = r => Number(r.changes);
  if (apply) db.exec('BEGIN');
  const addDir = (list, rel) => {
    for (const d of list) {
      const norm = normalizeName(d.name);
      if (!norm) continue;
      stats.directory++;
      if (apply) insD.run(sha([d.type, d.country, norm, d.email, d.phone].join('|')), rel, d.type, d.name, norm, d.country, d.city, d.address, d.email, d.phone, d.website, d.contact, d.activity, d.confidence);
    }
  };
  const files = walk(root, /\.xlsx?$/i);
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    let wb;
    try { wb = XLSX.readFile(file, { cellDates: false }); } catch { stats.errors++; continue; }
    stats.files++;
    const kinds = new Set();
    let rowsTotal = 0;
    for (const sn of wb.SheetNames) {
      const sheet = readSheet(wb.Sheets[sn]);
      const res = parseSheet(sheet, rel, sn);
      rowsTotal += res.shipments.length + res.rankings.length + res.market.length + res.directory.length;
      for (const s of res.shipments) {
        const bn = normalizeName(s.buyer), sn2 = normalizeName(s.supplier);
        stats.shipments++; kinds.add('shipments');
        if (apply) insS.run(sha([s.date, bn, sn2, s.hs, s.usd, s.qty, s.portIn, s.product.slice(0, 80), s.buyerCountry].join('|')), rel, s.date, s.buyer, bn, s.buyerCountry, s.buyerAddress, s.supplier, sn2, s.supplierAddress, s.supplierPhone, normalizeHs(s.hs), s.product.slice(0, 300), shipmentUsd(s.usd), s.qty, s.unit, s.weight, s.portIn, s.portOut, s.mode, s.incoterms);
      }
      res.rankings.forEach((r, i) => {
        const norm = normalizeName(r.name); if (!norm) return;
        stats.rankings++; kinds.add('rankings');
        if (apply) insR.run(sha([rel, sn, i, r.role, norm].join('|')), rel, r.role, r.name, norm, r.country, normalizeHs(r.hs), r.product, r.transactions, rankingUsd(r.usd, r.transactions), r.qty, r.weight, r.share, r.url);
      });
      res.market.forEach((m, i) => { stats.market++; kinds.add('market'); if (apply) insM.run(sha([rel, sn, i, m.name].join('|')), rel, m.kind, m.name, m.shipments, m.usd, m.qty, m.weight, m.product); });
      if (res.directory.length) kinds.add('directory');
      addDir(res.directory, rel);
    }
    const kind = [...kinds].join('+') || 'ignored';
    stats.perKind[kind] = (stats.perKind[kind] || 0) + 1;
    if (apply) insF.run(rel, kind, rowsTotal, Date.now());
  }
  if (docs) {
    for (const file of walk(root, /\.(pdf|doc)$/i)) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      const list = parseDocText(docToText(file), rel);
      stats.docFiles++;
      addDir(list, rel);
      if (apply) insF.run(rel, 'document', list.length, Date.now());
    }
  }
  if (apply) { db.exec('COMMIT'); stats.productGroups = backfillProductGroups(db); }
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const root = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--db');
  if (!root) { console.error('Dùng: node server/customs-import.mjs <thư mục> [--apply] [--docs] [--db /path/customs.db]'); process.exit(2); }
  const apply = args.includes('--apply');
  const dbPath = args.includes('--db') ? args[args.indexOf('--db') + 1] : (apply ? undefined : ':memory:');
  const db = openCustomsDb(dbPath);
  const stats = importAll(path.resolve(root), { db, docs: args.includes('--docs') });
  const inDb = n => db.prepare(`SELECT COUNT(*) n FROM ${n}`).get().n;
  console.log(JSON.stringify({ apply, ...stats, inDb: { shipments: inDb('customs_shipments'), rankings: inDb('customs_rankings'), market: inDb('customs_market'), directory: inDb('directory_entities') } }, null, 1));
}
