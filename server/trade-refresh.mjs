#!/usr/bin/env node
// Nạp snapshot đã được kiểm tra vào SQLite. Dùng worker/cron bên ngoài để chạy
// định kỳ; không tải dữ liệu trong request của người dùng.
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureTradeSchema, importTradeRows, readTradeFile } from './trade-data.mjs';

const file = process.env.TRADE_SNAPSHOT_FILE || process.argv[2];
const source = process.env.TRADE_SOURCE || 'Vietnam Customs/GSO snapshot';
const sourceUrl = process.env.TRADE_SOURCE_URL || '';
const period = process.env.TRADE_PERIOD || process.argv[3] || '';
if (!file) {
  console.error('Thiếu TRADE_SNAPSHOT_FILE. Ví dụ: TRADE_SNAPSHOT_FILE=/data/trade.csv TRADE_PERIOD=2026-08 node server/trade-refresh.mjs');
  process.exit(2);
}
const db = new DatabaseSync(process.env.DB_PATH || '/var/lib/maps-data/cache.db');
ensureTradeSchema(db);
const result = importTradeRows(db, readTradeFile(path.resolve(file)), { source, sourceUrl, period });
console.log(JSON.stringify({ ok: true, ...result, source, sourceUrl }));
