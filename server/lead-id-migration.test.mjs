import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateLeadIds } from './lead-id-migration.mjs';
import { opaqueLeadId } from './trial-mask.mjs';

test('lead ids no longer expose the Google placeId, in items and job results; migration runs once', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE user_items (user_id INTEGER, kind TEXT, item_id TEXT, data TEXT, deleted INTEGER DEFAULT 0, seq INTEGER, PRIMARY KEY (user_id, kind, item_id))');
  const ins = db.prepare('INSERT INTO user_items (user_id, kind, item_id, data, seq) VALUES (?,?,?,?,?)');
  ins.run(4, 'lead', 'lead_ChIJabc', JSON.stringify({ id: 'lead_ChIJabc', title: 'A', placeId: 'ChIJabc' }), 1);
  ins.run(4, 'job', 'job_1', JSON.stringify({ id: 'job_1', results: [{ id: 'lead_ChIJabc' }] }), 1);
  assert.equal(migrateLeadIds(db), 2);
  const lead = db.prepare("SELECT item_id, data, seq FROM user_items WHERE kind = 'lead'").get();
  assert.equal(lead.item_id, opaqueLeadId('lead_ChIJabc'));
  assert.ok(!lead.item_id.includes('ChIJ') && lead.seq === 2 && JSON.parse(lead.data).id === lead.item_id);
  const job = JSON.parse(db.prepare("SELECT data FROM user_items WHERE kind = 'job'").get().data);
  assert.equal(job.results[0].id, lead.item_id);
  assert.equal(migrateLeadIds(db), 0);
  assert.equal(opaqueLeadId(lead.item_id), lead.item_id);
});
