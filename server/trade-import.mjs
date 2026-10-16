#!/usr/bin/env node
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { importTradeRows, ensureTradeSchema, readTradeFile } from './trade-data.mjs';

const [, , file, source = 'Vietnam Customs/GSO snapshot', period = ''] = process.argv;
if (!file) { console.error('Dùng: DB_PATH=/path/cache.db node server/trade-import.mjs snapshot.csv "Nguồn" 2025'); process.exit(2); }
const db = new DatabaseSync(process.env.DB_PATH || '/var/lib/maps-data/cache.db');
ensureTradeSchema(db);
const result = importTradeRows(db, readTradeFile(path.resolve(file)), { source, period, sourceUrl: process.env.TRADE_SOURCE_URL || '' });
console.log(JSON.stringify(result));
