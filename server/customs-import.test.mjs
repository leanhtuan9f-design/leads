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
  const r = db.prepare("SELECT * FROM customs_rankings WHERE name = 'Jin Won Trading Corp'").get();
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
  assert.deepEqual(rows.map(r => [r.role, r.name]), [['supplier', 'Hanla Co'], ['supplier', 'Van Minh Co']]);
});

test('implausible USD values are hidden but rows are kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  book(dir, '03.52WMB/India/081090-india-Buyer list.xlsx', { S: [['Buyer', 'Transactions', 'Percent', 'qty', 'amount', 'seller', 'URL'], ['daisy fruit llc', 68, 0.1, 234294016, 34637210093, 1, 'u1'], ['ok trading', 10, 0.1, 100, 5000, 1, 'u2']] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const rows = db.prepare('SELECT name, usd FROM customs_rankings ORDER BY name').all();
  assert.deepEqual(rows.map(r => [r.name, r.usd]), [['Daisy Fruit LLC', null], ['Ok Trading', 5000]]);
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
  assert.deepEqual(api.buyers({ product: 'xoai' }).rows.map(r => r.name).sort(), ['Al Noor LLC', 'B Trading']);
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
  assert.deepEqual({ ...get('Mixed Buyer Ltd') }, { g: 'thanh-long', i: 1 });
  assert.deepEqual({ ...get('Nobody Known Inc') }, { g: 'khac', i: 0 });
  assert.deepEqual(inferRankingProducts(db), { buyer: 0, supplier: 0 });
});

test('ports: junk values dropped, aliases merged, filters and suggestions work', async () => {
  const { cleanPort } = await import('./customs-data.mjs');
  assert.equal(cleanPort('Not Available'), '');
  assert.equal(cleanPort('undefined'), '');
  assert.equal(cleanPort('CANG CAT LAI (HCM)'), 'Cat Lai');
  assert.equal(cleanPort('Cat Lai Oil Port'), 'Cat Lai');
  assert.equal(cleanPort('JEBEL ALI'), 'Jebel Ali');
  assert.equal(cleanPort('Port Kelang Swetten'), 'Port Kelang Swetten');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customs-'));
  const hdr = ['Total amount(USD)', 'Product Description', 'Date', 'Bill of Lading Number', 'Supplier Address', "Buyer's address", 'HS code', 'Qty', 'quantity unit', 'importing country', 'Destination country', 'Buyer', 'Supplier', 'Import port', 'Port of departure'];
  const row = (inP, outP, buyer) => [1000, 'Fresh mango', 45297, 'N/A', 'HCM', '1 Main St, Dubai, AE', 8045020, 10, 'Bag', 'VN', 'Vietnam', buyer, 'VN Exporter Co', inP, outP];
  book(dir, '03.52WMB/BL.xlsx', { S: [hdr, row('JEBEL ALI', 'Cat Lai Oil Port', 'A Co'), row('Jebel Ali', 'CANG CAT LAI (HCM)', 'B Co'), row('Not Available', 'undefined', 'C Co')] });
  const db = openCustomsDb(':memory:');
  importAll(dir, { db });
  const api = createCustomsApi(db);
  const rows = api.shipments({}).rows;
  assert.deepEqual(rows.map(r => [r.portOut, r.portIn]).sort(), [['', ''], ['Cat Lai', 'Jebel Ali'], ['Cat Lai', 'Jebel Ali']]);
  assert.equal(api.shipments({ portIn: 'jebel' }).total, 2);
  assert.equal(api.shipments({ portOut: 'cat' , portIn: 'ali'}).total, 2);
  assert.deepEqual(api.suggest({ field: 'port_out', view: 'shipments', q: 'cat' }).options, [{ value: 'Cat Lai', hint: 2 }]);
});

test('formatCompanyName capitalizes words and keeps legal abbreviations', async () => {
  const { formatCompanyName: f } = await import('./customs-data.mjs');
  assert.equal(f('UNIQLO CO.,LTD'), 'Uniqlo Co., Ltd');
  assert.equal(f('daisy fruit trading co llc'), 'Daisy Fruit Trading Co LLC');
  assert.equal(f('INNOVATECH TECHNOLOGY SOLUTIONS L.L.C'), 'Innovatech Technology Solutions LLC');
  assert.equal(f('CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ ÁNH DƯƠNG SAO'), 'Công Ty TNHH Thương Mại Dịch Vụ Ánh Dương Sao');
  assert.equal(f('Cong Ty TNHH Thuong Mai Dich Vu anh Duong Sao'), 'Cong Ty TNHH Thuong Mai Dich Vu Anh Duong Sao');
  assert.equal(f('Voelkel GmbH'), 'Voelkel GmbH');
  assert.equal(f('VOELKEL GMBH'), 'Voelkel GmbH');
  assert.equal(f("FRESH D'OR S.L"), "Fresh D'Or S.L");
  assert.equal(f("WOMEN'S CLUB"), "Women's Club");
  assert.equal(f('3J FOODS CORPORATION'), '3J Foods Corporation');
  assert.equal(f('branch vietnam tourism&amp;consulting co.ltd'), 'Branch Vietnam Tourism&Consulting Co.Ltd');
  assert.equal(f('ASIA EXPRESS FOOD KAMPEN, NETHERLANDS Tel -/ Fax- Email - Web- Attn -NEW'), 'Asia Express Food Kampen, Netherlands');
  assert.equal(f('M/S. T. S. Corporation'), 'M/S. T. S. Corporation');
  assert.equal(f(''), '');
});
