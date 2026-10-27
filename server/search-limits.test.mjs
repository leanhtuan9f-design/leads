import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSearchLimits as check } from './search-limits.mjs';

const basic = (over = {}) => ({ plan: 'BASIC', maxCountries: 1, maxConcurrentSearches: 1, dailySearches: 10, countries: ['Japan'], ...over });
const advanced = { plan: 'ADVANCED', maxCountries: 0, maxConcurrentSearches: 0, dailySearches: 0, countries: [] };

test('no plan / admin: nothing is limited', () => {
  assert.deepEqual(check({ limits: null, searchesToday: 999, activeSearches: 9, country: '' }), { ok: true });
});

test('Basic: 1 concurrent search', () => {
  assert.equal(check({ limits: basic(), activeSearches: 0, country: 'Japan' }).ok, true);
  const blocked = check({ limits: basic(), activeSearches: 1, country: 'Japan' });
  assert.deepEqual([blocked.ok, blocked.status, blocked.body.code], [false, 429, 'SEARCH_IN_PROGRESS']);
  assert.equal(check({ limits: basic({ maxConcurrentSearches: 2 }), activeSearches: 1, country: 'Japan' }).ok, true); // admin nâng lên 2
  assert.equal(check({ limits: basic({ maxConcurrentSearches: 0 }), activeSearches: 50, country: 'Japan' }).ok, true); // 0 = không giới hạn
});

test('Basic: 10 searches per day, counted per accepted search; 0 = unlimited', () => {
  assert.equal(check({ limits: basic(), searchesToday: 9, country: 'Japan' }).ok, true);
  const blocked = check({ limits: basic(), searchesToday: 10, country: 'Japan' });
  assert.deepEqual([blocked.ok, blocked.status, blocked.body.code], [false, 429, 'DAILY_SEARCH_LIMIT']);
  assert.match(blocked.body.error, /10 lượt tìm kiếm mỗi ngày/);
  assert.equal(check({ limits: basic({ dailySearches: 0 }), searchesToday: 100000, country: 'Japan' }).ok, true);
});

test('Basic: one country locked; other countries rejected; country is required', () => {
  assert.equal(check({ limits: basic(), country: 'japan' }).ok, true); // không phân biệt hoa thường
  assert.equal(check({ limits: basic({ countries: ['Việt Nam'] }), country: 'viet nam' }).ok, true); // không phân biệt dấu
  const other = check({ limits: basic(), country: 'Germany' });
  assert.deepEqual([other.ok, other.status, other.body.code], [false, 403, 'COUNTRY_LOCKED']);
  assert.match(other.body.error, /Japan/);
  const none = check({ limits: basic(), country: '  ' });
  assert.deepEqual([none.ok, none.status, none.body.code], [false, 422, 'COUNTRY_REQUIRED']);
});

test('Multi-country purchase: any of the N bought countries works, others do not', () => {
  const three = basic({ maxCountries: 3, countries: ['Japan', 'Germany', 'France'] });
  for (const c of ['Japan', 'GERMANY', 'france']) assert.equal(check({ limits: three, country: c }).ok, true, c);
  assert.equal(check({ limits: three, country: 'Italy' }).status, 403);
});

test('legacy paid account with fewer locked countries than allowed: the first new country is locked on use', () => {
  const legacy = basic({ countries: [] });
  assert.deepEqual(check({ limits: legacy, country: 'Spain' }), { ok: true, lockCountry: 'Spain' });
  const partial = basic({ maxCountries: 2, countries: ['Japan'] });
  assert.deepEqual(check({ limits: partial, country: 'Spain' }), { ok: true, lockCountry: 'Spain' });
  assert.equal(check({ limits: partial, country: 'Japan' }).lockCountry, undefined);
});

test('Advanced: no limits on countries, concurrency or daily searches', () => {
  assert.deepEqual(check({ limits: advanced, searchesToday: 5000, activeSearches: 20, country: 'Anywhere' }), { ok: true });
  assert.deepEqual(check({ limits: advanced, country: '' }), { ok: true }); // không cần gửi quốc gia
});

test('check order: daily limit, then concurrency, then country', () => {
  assert.equal(check({ limits: basic(), searchesToday: 10, activeSearches: 1, country: 'Germany' }).body.code, 'DAILY_SEARCH_LIMIT');
  assert.equal(check({ limits: basic(), searchesToday: 0, activeSearches: 1, country: 'Germany' }).body.code, 'SEARCH_IN_PROGRESS');
});
