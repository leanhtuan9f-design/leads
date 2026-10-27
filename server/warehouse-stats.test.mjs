import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWarehouseStats } from './warehouse-stats.mjs';

test('warehouse rankings count unique stored records, omit unknown fields and refresh after cache expiry', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE places (place_id TEXT PRIMARY KEY, data TEXT, last_seen INTEGER)');
  const insert = db.prepare('INSERT INTO places VALUES (?, ?, ?)');
  for (let i = 0; i < 7; i++) insert.run(String(i), JSON.stringify({country: `C${i}`, category: `Industry ${i}`}), 100 + i);
  insert.run('more', JSON.stringify({country:' C1 ', category:'Industry 1'}), 200);
  insert.run('unknown', JSON.stringify({country:' ', category:null}), 201);
  insert.run('bad', 'invalid JSON', 202);
  let time = 1000;
  const read = createWarehouseStats(db, { now: () => time, cacheMs: 100 });
  const first = read();
  assert.equal(first.total, 10);
  assert.equal(first.lastUpdatedAt, 202);
  assert.equal(first.countries.length, 5);
  assert.deepEqual({...first.countries[0]}, {name:'C1',count:2});
  assert.deepEqual({...first.industries[0]}, {name:'Industry 1',count:2});
  assert.ok(first.countries.every(row => Object.keys(row).join(',') === 'name,count'));
  insert.run('new', JSON.stringify({country:'C1',category:'Industry 1'}), 300);
  assert.equal(read().total,10);
  time += 100;
  assert.equal(read().total,11);
  assert.equal(read().countries[0].count,3);
  db.close();
});

test('empty warehouse returns empty rankings and null update time', () => {
 const db = new DatabaseSync(':memory:');
 db.exec('CREATE TABLE places (place_id TEXT PRIMARY KEY, data TEXT, last_seen INTEGER)');
 const read = createWarehouseStats(db);
 assert.equal(read().total,0);
 assert.equal(read().lastUpdatedAt,null);
 assert.deepEqual(read().countries,[]);
 assert.deepEqual(read().industries,[]);
 db.close();
});
