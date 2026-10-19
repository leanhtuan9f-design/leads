import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { expandAutoPlan, settleAutoTasks } from './auto-expand.mjs';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE auto_tasks(id INTEGER PRIMARY KEY, plan_round INTEGER, status TEXT, finished_at INTEGER, cities TEXT, keywords TEXT, country TEXT, note TEXT);
    CREATE TABLE auto_runs(id INTEGER PRIMARY KEY, task_id INTEGER, keyword TEXT, city TEXT, qtext TEXT, qkey TEXT, status TEXT, split_state TEXT DEFAULT '', saturated INTEGER DEFAULT 0, level INTEGER DEFAULT 0);
    INSERT INTO auto_tasks VALUES(1,1,'running',NULL,'["A"]','["buyer"]','Country','');
    INSERT INTO auto_runs VALUES(1,1,'buyer','A','buyer A, Country','buyer A, Country','done','maxlevel',1,2);`);
  return db;
}
const options = { citiesOfCountry: () => ({cities: ['A','B','C']}), makeKey: q => q, maxRuns: 600, maxLevel: 3, retryFailed: true };

test('settles exhausted tasks but retains pending work and unfinished splits', () => {
  const db = setup();
  db.exec("UPDATE auto_runs SET split_state='todo'");
  assert.equal(settleAutoTasks(db), 0);
  db.exec("UPDATE auto_runs SET split_state='failed'");
  assert.equal(settleAutoTasks(db), 1);
  assert.equal(db.prepare('SELECT status FROM auto_tasks').get().status, 'done');
  db.close();
});

test('adds unseen cities, reopens depth-limited work, and is idempotent', () => {
  const db = setup();
  assert.deepEqual(expandAutoPlan(db, options), {pairs: 2, splits: 1, tasks: 1});
  assert.deepEqual(expandAutoPlan(db, options), {pairs: 0, splits: 0, tasks: 0});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auto_runs').get().n, 3);
  assert.equal(db.prepare('SELECT split_state FROM auto_runs WHERE id=1').get().split_state, 'todo');
  db.close();
});

test('preserves stopped/manual tasks and respects the run cap', () => {
  const db = setup();
  db.exec("UPDATE auto_tasks SET status='stopped'");
  assert.equal(expandAutoPlan(db, options).tasks, 0);
  db.exec("UPDATE auto_tasks SET status='done',plan_round=0");
  assert.equal(expandAutoPlan(db, options).tasks, 0);
  db.exec("UPDATE auto_tasks SET plan_round=1");
  assert.deepEqual(expandAutoPlan(db, {...options, maxRuns: 2}), {pairs: 1, splits: 0, tasks: 1});
  db.close();
});

test('failed splits get only the explicit recovery attempt; max depth stays final', () => {
  const db = setup();
  db.exec("UPDATE auto_runs SET split_state='failed'");
  assert.equal(expandAutoPlan(db, {...options, retryFailed: false}).splits, 0);
  assert.equal(expandAutoPlan(db, options).splits, 1);
  db.exec("UPDATE auto_runs SET split_state='maxlevel',level=3 WHERE id=1");
  assert.equal(expandAutoPlan(db, options).splits, 0);
  db.close();
});
