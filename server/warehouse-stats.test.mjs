import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWarehouseStats, createWarehouseSegments } from './warehouse-stats.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE places (place_id TEXT PRIMARY KEY, data TEXT, last_seen INTEGER);
    CREATE TABLE auto_tasks (id INTEGER PRIMARY KEY, plan_group TEXT);
    CREATE TABLE auto_runs (task_id INTEGER, qkey TEXT);
    CREATE TABLE query_places (qkey TEXT, place_id TEXT);`);
  return db;
}

test('warehouse rankings count unique stored records, omit unknown fields and refresh after cache expiry', () => {
  const db = fixture();
  const insert = db.prepare('INSERT INTO places VALUES (?, ?, ?)');
  for (let i = 0; i < 7; i++) insert.run(String(i), JSON.stringify({country: `C${i}`, category: `Industry ${i}`}), 100 + i);
  insert.run('more', JSON.stringify({country:' C1 ', category:'Industry 1'}), 200);
  insert.run('unknown', JSON.stringify({country:' ', category:null}), 201);
  insert.run('bad', 'invalid JSON', 202);
  let time = 1000;
  const read = createWarehouseStats(db, { now: () => time, cacheMs: 100 });
  const first = read();
  assert.equal(first.total, 10);
  assert.equal("segments" in first, false);
  const internal = createWarehouseSegments(db)();
  assert.equal(internal.segments.reduce((sum, row) => sum + row.count, 0), first.total);
  assert.equal(internal.importerVerification, "not_assessed");
  assert.equal(first.lastUpdatedAt, 202);
  assert.equal(first.countries.length, 5);
  assert.deepEqual({...first.countries[0]}, {name:'C1',count:2});
  assert.deepEqual(first.products, []);
  assert.ok(first.countries.every(row => Object.keys(row).join(',') === 'name,count'));
  insert.run('new', JSON.stringify({country:'C1',category:'Industry 1'}), 300);
  assert.equal(read().total,10);
  time += 100;
  assert.equal(read().total,11);
  assert.equal(read().countries[0].count,3);
  db.close();
});

test('empty warehouse returns empty rankings and null update time', () => {
 const db = fixture();
 const read = createWarehouseStats(db);
 assert.equal(read().total,0);
 assert.equal(read().lastUpdatedAt,null);
 assert.deepEqual(read().countries,[]);
 assert.deepEqual(read().products,[]);
 db.close();
});

test('HS rankings deduplicate companies across runs/tasks, allow multiple products and exclude unmapped or deleted records', () => {
 const db = fixture();
 db.exec(`INSERT INTO places VALUES ('a','{}',1), ('b','{}',2), ('c','{}',3);
 INSERT INTO auto_tasks VALUES (1,'08|Hàng rau quả'),(2,'08|Hàng rau quả'),(3,'84|Máy móc'),(4,''),(5,'bad|Invalid');
 INSERT INTO auto_runs VALUES (1,'q1'),(1,'q2'),(2,'q3'),(3,'q4'),(4,'q5'),(5,'q6');
 INSERT INTO query_places VALUES ('q1','a'),('q2','a'),('q3','a'),('q1','b'),('q4','a'),('q4','deleted'),('q5','c'),('q6','c');`);
 const rows = createWarehouseStats(db)().products.map(row => ({...row}));
 assert.deepEqual(rows,[{hsCode:'08',name:'Hàng rau quả',count:2},{hsCode:'84',name:'Máy móc',count:1}]);
 db.close();
});
