// node --test server/ai-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiGuard, modelFamily, pickRows, summarize, walkQuota, QuotaError, quotaRetryMs, RECHECK_MS, DAY_MS } from './ai-guard.mjs';

const mk = (over = {}) => {
  let t = 1_000_000;
  const deps = { now: () => t, probe: async () => ({ ok: true }), getModel: () => 'ag/claude-sonnet-4-6', getQuotaConfig: () => null, ...over };
  return { g: createAiGuard(deps), adv: (ms) => (t += ms), at: () => t };
};
const reading = (accounts, reset = 0) => summarize(accounts.map(([account, pct]) => ({ name: account, label: 'W', account, pct, reset })));

test('lỗi dịch vụ: dừng, sau 30 phút gọi thử, lỗi thì chờ tiếp, thành công thì bỏ dừng', async () => {
  const probes = [{ ok: false, error: 'No active credentials' }, { ok: true }];
  const { g, adv } = mk({ probe: async () => probes.shift() });
  assert.equal(await g.blocked(), false);
  g.trip('HTTP 503');
  assert.equal(await g.blocked(), true);
  adv(RECHECK_MS);
  assert.equal(await g.blocked(), true);
  assert.equal(g.status().outage.probeError, 'No active credentials');
  adv(RECHECK_MS);
  assert.equal(await g.blocked(), false);
  assert.equal(g.status().outage, null);
});

test('quota: chỉ dừng khi TẤT CẢ tài khoản đạt ngưỡng', async () => {
  const cfg = { enabled: true, url: 'http://x', password: 'p', threshold: 95 };
  const one = mk({ getQuotaConfig: () => cfg, readQuota: async () => reading([['a', 99], ['b', 30]]) });
  assert.equal(await one.g.blocked(), false);
  const all = mk({ getQuotaConfig: () => cfg, readQuota: async () => reading([['a', 99], ['b', 96]], 2_000_000) });
  assert.equal(await all.g.blocked(), true);
  const s = all.g.status();
  assert.match(s.outage.error, /Tất cả 2 tài khoản/);
  assert.equal(s.outage.nextCheck, 2_000_000 + 60_000);
});

test('dashboard không vào được: thử lại sau 1 giờ; sai mật khẩu: sau 1 ngày', async () => {
  const cfg = { enabled: true, url: 'http://x', password: 'p', threshold: 95 };
  const errs = [new QuotaError('down', 'unreachable'), new QuotaError('pw', 'auth')];
  let calls = 0;
  const { g, adv } = mk({ getQuotaConfig: () => cfg, readQuota: async () => { calls++; if (errs.length) throw errs.shift(); return reading([['a', 10]]); } });
  assert.equal(await g.blocked(), false); assert.equal(calls, 1);
  adv(3_599_000); await g.blocked(); assert.equal(calls, 1);
  adv(1_000); await g.blocked(); assert.equal(calls, 2);
  adv(DAY_MS - 1_000); await g.blocked(); assert.equal(calls, 2);
  adv(1_000); await g.blocked(); assert.equal(calls, 3);
  assert.equal(quotaRetryMs(new QuotaError('x', 'auth')), DAY_MS);
});

test('họ model: Gemini đọc "Gemini (Weekly)", Claude/GPT đọc "Claude & GPT (Weekly)"', () => {
  assert.equal(modelFamily('ag/gemini-3.8-flash'), 'gemini');
  assert.equal(modelFamily('ag/claude-sonnet-4-6'), 'claude-gpt');
  const rows = [];
  walkQuota({ a: { label: 'Gemini (Weekly)', used: 99, total: 100 }, b: { label: 'Claude & GPT (Weekly)', used: 10, total: 100 }, c: { label: 'Gemini (Daily)', used: 100, total: 100 } }, 'c1', rows, 'x@y');
  assert.deepEqual(pickRows(rows, 'ag/gemini-flash').map((r) => r.pct), [99]);
  assert.deepEqual(pickRows(rows, 'ag/claude-sonnet-4-6').map((r) => r.pct), [10]);
});
