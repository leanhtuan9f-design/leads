#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { ensureTradeSchema, importTradeRows } from './trade-data.mjs';
import { discoverGsoFile, readGsoXls } from './trade-xls.mjs';

const pageUrl = (kind) => process.env[kind === 'total' ? 'TRADE_TOTAL_PAGE_URL' : 'TRADE_PRODUCT_PAGE_URL'];
const source = process.env.TRADE_SOURCE || 'Cục Thống kê Việt Nam - GSO';
const db = new DatabaseSync(process.env.DB_PATH || '/var/lib/maps-data/cache.db');
ensureTradeSchema(db);

async function refresh(kind) {
  const page = pageUrl(kind);
  if (!page) throw new Error(`Thiếu URL nguồn cho ${kind}`);
  const html = await (await fetch(page)).text();
  const fileUrl = discoverGsoFile(html, kind);
  if (!fileUrl) throw new Error(`Không tìm thấy file XLS ${kind} trên ${page}`);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Tải XLS lỗi HTTP ${response.status}: ${fileUrl}`);
  const rows = readGsoXls(Buffer.from(await response.arrayBuffer()), { kind, sourceUrl: fileUrl });
  const period = rows[0].period;
  const exists = db.prepare('SELECT id FROM trade_snapshots WHERE source = ? AND period = ? AND source_url = ? LIMIT 1').get(source, period, fileUrl);
  if (exists && process.env.TRADE_REFRESH_FORCE !== '1') return { kind, period, rows: 0, skipped: true, snapshotId: exists.id, sourceUrl: fileUrl };
  const result = importTradeRows(db, rows, { source, sourceUrl: fileUrl, period });
  return { kind, ...result, sourceUrl: fileUrl };
}

try {
  const results = [await refresh('total'), await refresh('product')];
  console.log(JSON.stringify({ ok: true, results }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}
