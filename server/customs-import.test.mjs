import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { openCustomsDb, createCustomsApi, normalizeName } from './customs-data.mjs';
import { importAll, toCountry, countryFromPath, toDate } from './customs-import.mjs';

function book(dir, rel, sheets) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  XLSX.writeFile(wb, file);
}

test('normalizers handle countries, dates and company suffixes', () => {
  assert.equal(toCountry('Hong Kong(China)'), 'HK');
  assert.equal(toCountry('united states'), 'US');
  assert.equal(countryFromPath('01.Countries Data/001.Data_UAE/01.UAE/x.xlsx'), 'AE');
  assert.equal(toDate(45297), '2024-01-06');
  assert.equal(normalizeName('ABC Trading Co., Ltd.'), normalizeName('abc trading'));
});

test('imports shipments, rankings, directory entries; dedupes repeats and keeps tables separate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  const bolHeader = ['Total amount(USD)', 'Product Description', 'Date', 'Bill of Lading Number', "Supplier Address", "Buyer's address", 'HS code', 'Qty', 'quantity unit', 'importing country', 'Destination country', 'Buyer', 'Supplier'];
  const line = [1000, 'Fresh mango', 45297, 'N/A', 'HCM', '1 Main St, Dubai, AE', 8045020, 10, 'Bag', 'VN', 'Vietnam', 'Al Noor Trading LLC', 'VN Exporter Co'];
  book(dir, '03.52WMB/BL_a.xlsx', { S: [bolHeader, line, line] });
  book(dir, '03.52WMB/BL_b.xlsx', { S: [bolHeader, line] });
  book(dir, '03.52WMB/00.Countries/Korea/080719-south korea-Buyer list.xlsx', { S: [['Buyer', 'Transactions', 'Percent', 'seller', 'URL'], ['jin won trading corp', 9, 0.25, '-', 'https://en.52wmb.com/buyer/1'], ['lotte co', 8, 0.2, '-', 'https://en.52wmb.com/buyer/2']] });
  book(dir, '01.Countries Data/Data_Qatar/importers.xlsx', { S: [['Company', 'Email', 'Phone', 'Website'], ['Doha Fruits WLL', 'Info@Doha.Example; sales@doha.example', '+974 4000 1234', 'doha.example'], ['No Contact', '', '', '']] });
  const db = openCustomsDb(':memory:');
  const stats = importAll(dir, { db });
  const count = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  assert.equal(count('customs_shipments'), 1);
  assert.equal(count('customs_rankings'), 2);
  assert.equal(count('directory_entities'), 2);
  assert.equal(stats.files, 4);
  const s = db.prepare('SELECT * FROM customs_shipments').get();
  assert.equal(s.buyer_country, 'AE');
  assert.equal(s.date, '2024-01-06');
  const r = db.prepare("SELECT * FROM customs_rankings WHERE name = 'jin won trading corp'").get();
  assert.equal(r.country, 'KR');
  assert.equal(r.hs, '080719');
  const d = db.prepare("SELECT * FROM directory_entities WHERE name = 'Doha Fruits WLL'").get();
  assert.equal(d.email, 'info@doha.example; sales@doha.example');
  assert.equal(d.country, 'QA');

  const api = createCustomsApi(db);
  assert.equal(api.summary().shipments.n, 1);
  assert.equal(api.buyers({ country: 'kr' }).total, 2);
  assert.equal(api.buyers({ q: 'al noor' }).rows[0].transactions, 1);
  assert.equal(api.directory({ hasEmail: '1' }).total, 1);
  assert.equal(api.shipments({ hs: '0804' }).total, 1);
  assert.equal(api.buyers({ q: "%' OR 1=1 --" }).total, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('country-count tables and product-description cells do not become buyer rankings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  book(dir, '03.52WMB/Banana/Banana_Import Country.xlsx', { S: [['Buyer country', 'Transactions', 'Percent', 'weight', 'qty', 'amount', 'buyer', 'seller'], ['china', 11262, 0.37, 1, 2, 175648739, 88, 88], ['singapore', 5464, 0.18, 1, 2, 24959158, 5, 8]] });
  const names = [['Buyer', 'Products'], ['UNIQLO CO.,LTD', '36323#&Áo thun nam#&VN @'], ['BEREG LLC', 'K90A#&Bộ quần áo#&VN @'], ['OLD NAVY,LLC', 'Quần short'], ['GAP INC', 'Áo']];
  book(dir, '03.52WMB/02. HS Code 52WMB Buyer/4603.xlsx', { S: names });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM customs_rankings WHERE name GLOB \'[0-9]*\'').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM customs_market').get().n, 2);
  assert.equal(db.prepare('SELECT MAX(transactions) m FROM customs_rankings').get().m, null);
});

test('supplier list with a "buyer" count column ranks by supplier name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  book(dir, '03.52WMB/Coconut-Supplier list.xlsx', { S: [['Supplier', 'Transactions', 'Percent', 'weight', 'qty', 'amount', 'buyer', 'URL'], ['van minh co', 33, 0.15, 0, 15282, 117982, 1, 'u1'], ['hanla co', 2, 0.01, 0, 1220, 12200, 1, 'u2']] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const rows = db.prepare('SELECT role, name FROM customs_rankings ORDER BY name').all();
  assert.deepEqual(rows.map(r => [r.role, r.name]), [['supplier', 'hanla co'], ['supplier', 'van minh co']]);
});

test('implausible USD values are hidden but rows are kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  book(dir, '03.52WMB/India/081090-india-Buyer list.xlsx', { S: [['Buyer', 'Transactions', 'Percent', 'qty', 'amount', 'seller', 'URL'], ['daisy fruit llc', 68, 0.1, 234294016, 34637210093, 1, 'u1'], ['ok trading', 10, 0.1, 100, 5000, 1, 'u2']] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const rows = db.prepare('SELECT name, usd FROM customs_rankings ORDER BY name').all();
  assert.deepEqual(rows.map(r => [r.name, r.usd]), [['daisy fruit llc', null], ['ok trading', 5000]]);
});

test('product groups: description beats wrong HS; HS padded; folder used for rankings; API filters by product', async () => {
  const { productGroup, normalizeHs } = await import('./customs-products.mjs');
  assert.equal(normalizeHs('8109094'), '08109094');
  assert.equal(productGroup({ description: 'Fresh passion fruit (2kg/ctn)#&VN', hs: '8109094' }), 'chanh-day');
  assert.equal(productGroup({ description: 'Fresh mangosteen' }), 'mang-cut');
  assert.equal(productGroup({ description: 'Dried coconut tofu', hs: '8109094' }), 'dua');
  assert.equal(productGroup({ description: 'Along mosquito nets', hs: '709609' }), 'khac');
  assert.equal(productGroup({ description: 'unknown', hs: '8045030' }), 'xoai');
  assert.equal(productGroup({ source: '02.Datatradepro/Fruits/01.Dragon Fruits/USA/a.xlsx' }), 'thanh-long');
  assert.equal(productGroup({ source: '03.52WMB/Product_Fresh Air Exports/a.xlsx' }), 'khac');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  book(dir, '02.Datatradepro/Fruits/Mango/Mango_Người mua.xlsx', { S: [['Buyer', 'Transactions', 'Percent', 'seller', 'URL'], ['al noor llc', 9, 0.2, 1, 'u'], ['b trading', 5, 0.1, 1, 'u']] });
  book(dir, '02.Datatradepro/Fruits/Lychee/Lychee_Người mua.xlsx', { S: [['Buyer', 'Transactions', 'Percent', 'seller', 'URL'], ['c trading', 4, 0.2, 1, 'u']] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const api = createCustomsApi(db);
  assert.deepEqual(api.buyers({ product: 'xoai' }).rows.map(r => r.name).sort(), ['al noor llc', 'b trading']);
  assert.equal(api.buyers({ product: 'nhan-vai' }).total, 1);
  assert.equal(api.buyers({}).total, 3);
  assert.ok(api.summary().products.some(p => p.key === 'xoai' && p.rankings === 2));
});

test('suggest: names, HS prefixes (zero-padded) and countries; buyers HS filter matches any code in the list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  const bolHeader = ['Total amount(USD)', 'Product Description', 'Date', 'Bill of Lading Number', 'Supplier Address', "Buyer's address", 'HS code', 'Qty', 'quantity unit', 'importing country', 'Destination country', 'Buyer', 'Supplier'];
  const row = (hs, buyer, desc) => [1000, desc, 45297, 'N/A', 'HCM', '1 Main St, Dubai, AE', hs, 10, 'Bag', 'VN', 'Vietnam', buyer, 'VN Exporter Co'];
  book(dir, '03.52WMB/BL.xlsx', { S: [bolHeader, row(8109094, 'Al Noor Trading LLC', 'Fresh dragon fruit'), row(8039010, 'Al Noor Trading LLC', 'Fresh banana'), row(8039010, 'Bravo Foods', 'Fresh banana')] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const api = createCustomsApi(db);
  assert.equal(api.suggest({ field: 'name', view: 'buyers', q: 'al no' }).options[0].value, 'Al Noor Trading LLC');
  assert.deepEqual(api.suggest({ field: 'name', view: 'buyers', q: 'a' }).options, []);
  const hs = api.suggest({ field: 'hs', view: 'shipments', q: '0810' }).options;
  assert.deepEqual(hs.map(o => [o.value, o.label, o.hint]), [['081090', 'Dragon fruit', 1]]);
  assert.equal(api.suggest({ field: 'country', view: 'shipments', q: '' }).options[0].value, 'AE');
  assert.equal(api.buyers({ hs: '0803' }).total, 2);
  assert.equal(api.buyers({ hs: '0810' }).rows[0].name, 'Al Noor Trading LLC');
});

test('mixed-file rankings get a product from the buyer\'s own shipments; flowers/mushrooms group exists', async () => {
  const { productGroup, inferRankingProducts } = await import('./customs-products.mjs');
  assert.equal(productGroup({ description: 'Fresh hydrangea #&VN', hs: '6031900' }), 'hoa-nam');
  assert.equal(productGroup({ description: 'Fresh mushrooms 100 gr#&VN' }), 'hoa-nam');
  assert.equal(productGroup({ description: 'unknown', hs: '7095990' }), 'hoa-nam');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  const bolHeader = ['Total amount(USD)', 'Product Description', 'Date', 'Bill of Lading Number', 'Supplier Address', "Buyer's address", 'HS code', 'Qty', 'quantity unit', 'importing country', 'Destination country', 'Buyer', 'Supplier'];
  const row = (buyer, desc) => [1000, desc, 45297, 'N/A', 'HCM', '1 Main St, Dubai, AE', 8045020, 10, 'Bag', 'VN', 'Vietnam', buyer, 'VN Exporter Co'];
  book(dir, '03.52WMB/BL.xlsx', { S: [bolHeader, row('Mixed Buyer Ltd', 'Fresh dragon fruit'), row('Mixed Buyer Ltd', 'Fresh dragon fruit 2'), row('Mixed Buyer Ltd', 'Fresh banana')] });
  book(dir, '03.52WMB/Product_Fresh Air Exports/List of Air Buyer.xlsx', { S: [['Buyer', 'Transactions', 'Percent', 'seller', 'URL'], ['mixed buyer ltd', 3, 0.1, 1, 'u'], ['nobody known inc', 2, 0.1, 1, 'u']] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const get = n => db.prepare('SELECT product_group g, product_inferred i FROM customs_rankings WHERE name = ?').get(n);
  assert.deepEqual({ ...get('mixed buyer ltd') }, { g: 'thanh-long', i: 1 });
  assert.deepEqual({ ...get('nobody known inc') }, { g: 'khac', i: 0 });
  assert.deepEqual(inferRankingProducts(db), { buyer: 0, supplier: 0 });
});
