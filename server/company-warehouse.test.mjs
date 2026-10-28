import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { openCompanyDb, createCompanyApi, mountCompanyApi } from './company-warehouse.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'company-test-'));
  const maps = new DatabaseSync(join(dir, 'maps.db')); const customs = new DatabaseSync(join(dir, 'customs.db'));
  maps.exec('CREATE TABLE places(place_id TEXT PRIMARY KEY,data TEXT,first_seen INTEGER,last_seen INTEGER,closed_suspect INTEGER)');
  const insert = maps.prepare('INSERT INTO places VALUES(?,?,1,2,0)');
  insert.run('map-a', JSON.stringify({ title: 'Acme Produce LLC', country: 'US', city: 'Miami', website: 'https://acme.example.org', email: 'sales@acme.example.org' }));
  insert.run('map-b', JSON.stringify({ title: 'Acme Produce LLC', country: 'US', city: 'Tampa', website: 'https://acme.example.org' }));
  insert.run('map-cn', JSON.stringify({ title: '上海农产品', country: 'CN' }));
  customs.exec(`CREATE TABLE directory_entities(dedupe_key TEXT PRIMARY KEY,name TEXT,country TEXT,city TEXT,confidence TEXT,email TEXT,phone TEXT,website TEXT,entity_type TEXT DEFAULT 'importer');
    CREATE TABLE customs_shipments(dedupe_key TEXT PRIMARY KEY,buyer TEXT,buyer_country TEXT,supplier TEXT,supplier_phone TEXT,date TEXT,hs TEXT,product_group TEXT,usd REAL);
    CREATE TABLE customs_rankings(dedupe_key TEXT PRIMARY KEY,role TEXT,name TEXT,country TEXT,product_group TEXT,product_inferred INTEGER,usd REAL);`);
  customs.prepare('INSERT INTO directory_entities(dedupe_key,name,country,city,confidence,email,phone,website) VALUES(?,?,?,?,?,?,?,?)').run('dir-a', 'Acme Produce LLC', 'US', 'Miami', 'normal', 'contact@acme.example.org', '+1 222 333 4444', 'https://acme.example.org');
  customs.prepare('INSERT INTO directory_entities(dedupe_key,name,country,city,confidence,email,phone,website) VALUES(?,?,?,?,?,?,?,?)').run('dir-unknown', 'Acme Produce LLC', 'ZZ', '', 'low', '', '', '');
  customs.prepare('INSERT INTO customs_shipments VALUES(?,?,?,?,?,?,?,?,?)').run('bl-a', 'Acme Produce LLC', 'US', 'Supplier Unknown', '', '2024-01-01', '081090', 'fruit', 123);
  customs.prepare('INSERT INTO customs_rankings VALUES(?,?,?,?,?,?,?)').run('rank-a', 'buyer', 'Acme Produce LLC', 'US', 'fruit', 1, 123);
  const sync = () => JSON.parse(execFileSync('python3', ['server/company-sync.py', '--maps', join(dir, 'maps.db'), '--customs', join(dir, 'customs.db'), '--output', join(dir, 'companies.db')], { encoding: 'utf8', timeout: 30000 }));
  const cleanup = () => { maps.close(); customs.close(); rmSync(dir, { recursive: true, force: true }); };
  return { dir, maps, customs, sync, cleanup };
}

test('source reconciliation: stable IDs, no auto merges, updated records, evidence preserved after source purge', () => {
  const f = fixture(); let db;
  try {
    f.sync(); db = openCompanyDb(join(f.dir, 'companies.db')); const api = createCompanyApi(db);
    const first = api.summary(); const ids = db.prepare('SELECT id,updated_at FROM companies ORDER BY id').all();
    assert.equal(first.profiles, 8); assert.equal(first.facts, 8); assert.equal(first.linked, 0);
    assert.equal(api.list({ q: '上海' }).total, 1);
    assert.equal(api.list({ q: '%_\' OR 1=1' }).total, 0);
    assert.equal(api.list({ product: 'fruit', source: 'shipments', role: 'buyer' }).total, 1);
    assert.equal(db.prepare("SELECT country FROM companies WHERE role='supplier'").get().country, '');
    assert.equal(api.list({ source: 'directory', country: 'ZZ' }).total, 0);
    f.sync(); assert.equal(api.summary().profiles, first.profiles); assert.equal(api.summary().facts, first.facts);
    assert.deepEqual(db.prepare('SELECT id,updated_at FROM companies ORDER BY id').all(), ids);
    f.maps.prepare('UPDATE places SET data=? WHERE place_id=?').run(JSON.stringify({ title: 'Acme Produce LLC', country: 'US', city: 'Miami', email: 'new@acme.example.org' }), 'map-a');
    f.customs.prepare('UPDATE customs_rankings SET usd=456 WHERE dedupe_key=?').run('rank-a');
    f.sync(); assert.equal(api.summary().facts, first.facts);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM company_contacts WHERE value='sales@acme.example.org'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM company_contacts WHERE value='new@acme.example.org'").get().n, 1);
    const rank = db.prepare("SELECT payload FROM company_facts WHERE source='rankings'").get(); assert.equal(JSON.parse(rank.payload).usd, 456);
    f.maps.exec('DELETE FROM places'); f.sync(); assert.equal(api.summary().facts, first.facts);
    assert.equal(api.list({ source: 'maps' }).total, 3);
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  } finally { db?.close(); f.cleanup(); }
});

test('manual review: reversible grouping, evidence changes, rejection persistence and no transitive merge', () => {
  const f = fixture(); let db;
  try {
    f.sync(); db = openCompanyDb(join(f.dir, 'companies.db')); const api = createCompanyApi(db);
    const row = api.candidates({}).rows.find(x => [x.left_source, x.right_source].includes('maps') && [x.left_source, x.right_source].includes('directory'));
    assert.ok(row.signals.includes('domain'));
    assert.throws(() => api.review(row.id, { action: 'approve', reason: '' }, 1), /lý do/);
    assert.throws(() => api.review(row.id, { action: 'approve', reason: 'Stale screen', revision: 'old' }, 1), /đã thay đổi/);
    api.review(row.id, { action: 'approve', reason: 'Fixture identity checked', revision: row.revision }, 1);
    assert.equal(api.summary().linked, 1); assert.equal(api.detail(row.left_id).profiles.length, 2);
    const rootBefore = api.detail(row.left_id).company.id;
    const other = api.candidates({}).rows.find(x => x.left_id === row.left_id || x.right_id === row.left_id || x.left_id === row.right_id || x.right_id === row.right_id);
    assert.throws(() => api.review(other.id, { action: 'approve', reason: 'Must reject chaining', revision: other.revision }, 1), /bắc cầu/);
    f.sync(); assert.equal(api.detail(row.right_id).company.id, rootBefore);
    f.customs.prepare('UPDATE directory_entities SET email=? WHERE dedupe_key=?').run('updated@acme.example.org', 'dir-a');
    f.sync(); assert.equal(api.candidates({ status: 'approved' }).rows[0].evidence_changed, 1);
    api.review(row.id, { action: 'undo', reason: 'Undo fixture decision' }, 1); assert.equal(api.summary().linked, 0);
    api.review(row.id, { action: 'reject', reason: 'Different branch' }, 1); f.sync();
    assert.equal(api.candidates({ status: 'rejected' }).rows[0].id, row.id);
    assert.equal(api.history(row.id).length, 3);
    assert.throws(() => api.review(row.id, { action: 'approve', reason: 'Already rejected' }, 1), /đã được xử lý/);
    api.review(row.id, { action: 'undo', reason: 'Reopen review' }, 1);
    assert.equal(api.detail(row.left_id).profiles.length, 1);
  } finally { db?.close(); f.cleanup(); }
});

test('all warehouse HTTP routes require admin and clamp pagination', async () => {
  const db = openCompanyDb(':memory:'); const app = express(); app.use(express.json());
  const requireAdmin = (req, res, next) => { if (req.headers['x-test-role'] !== 'admin') return res.status(403).json({ error: 'Forbidden' }); req.user = { id: 1 }; next(); };
  mountCompanyApi(app, requireAdmin, db);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['', '/summary', '/candidates', '/reviews/1', '/missing']) {
      assert.equal((await fetch(`${base}/api/admin/companies${path}`)).status, 403);
      assert.equal((await fetch(`${base}/api/admin/companies${path}`, { headers: { 'x-test-role': 'trial' } })).status, 403);
    }
    assert.equal((await fetch(`${base}/api/admin/companies/reviews/1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
    const result = await (await fetch(`${base}/api/admin/companies?limit=100000&offset=-5`, { headers: { 'x-test-role': 'admin' } })).json();
    assert.equal(result.limit, 100); assert.equal(result.offset, 0);
    assert.equal((await fetch(`${base}/api/admin/companies/missing`, { headers: { 'x-test-role': 'admin' } })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
