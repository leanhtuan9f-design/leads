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
  assert.equal(api.shipments({ hs: '8045' }).total, 1);
  assert.equal(api.buyers({ q: "%' OR 1=1 --" }).total, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
