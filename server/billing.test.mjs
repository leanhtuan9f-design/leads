import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureAuthSchema, hashPassword } from './auth-lib.mjs';
import { ensureBillingSchema, createBillingService, normCountry, parseCountries } from './billing.mjs';

function setup(saved) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  ensureAuthSchema(db);
  ensureBillingSchema(db);
  if (saved) db.prepare("INSERT INTO app_settings (key, value) VALUES ('billing', ?)").run(JSON.stringify(saved));
  const stmt = { userByEmail: db.prepare('SELECT * FROM users WHERE email = ?') };
  const billing = createBillingService({ db, stmt, hashPassword, crm: { sourceKey: 'maps', apiKey: 'api-key', callbackKey: 'cb-key', baseUrl: 'http://127.0.0.1:9' } });
  return { db, billing };
}

function paidOrder(db, billing, { orderId, plan, country, email = 'a@b.com' }) {
  const sku = `${plan}_ANNUAL`;
  db.prepare('INSERT INTO billing_orders (order_id, crm_session_id, email, customer_name, product_sku, plan, billing_cycle, amount, currency, status, created_at, updated_at, country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(orderId, `s-${orderId}`, email, 'A', sku, plan, 'ANNUAL', 4000, 'VND', 'PENDING_PAYMENT', 1, 1, country ?? null);
  db.prepare('INSERT INTO billing_pending_accounts (order_id, email, customer_name, pass, created_at) VALUES (?,?,?,?,?)').run(orderId, email, 'A', hashPassword('x'.repeat(12)), 1);
  return billing.applyEntitlement({ providedKey: 'cb-key', eventType: 'PAYMENT_COMPLETED', eventId: `e-${orderId}`, externalOrderId: orderId, sourceKey: 'maps', productSku: sku, amount: { value: 4000, currency: 'VND' }, crmTransactionId: 't1' });
}

test('default plan limits: Basic 1 country + 1 concurrent search, Advanced unlimited; all editable', () => {
  const { billing } = setup();
  const { plans } = billing.getConfig();
  assert.deepEqual([plans.BASIC.maxCountries, plans.BASIC.maxConcurrentSearches, plans.BASIC.dailySearches], [1, 1, 0]);
  assert.deepEqual([plans.ADVANCED.maxCountries, plans.ADVANCED.maxConcurrentSearches, plans.ADVANCED.dailySearches], [0, 0, 0]);
  const custom = setup({ plans: { BASIC: { dailyNew: 100, dailyRefresh: 2, maxCountries: 3, maxConcurrentSearches: 2, dailySearches: 40 } } }).billing.getConfig().plans;
  assert.deepEqual([custom.BASIC.maxCountries, custom.BASIC.maxConcurrentSearches, custom.BASIC.dailySearches, custom.ADVANCED.maxCountries], [3, 2, 40, 0]);
});

test('Basic checkout requires a country; Advanced does not', async () => {
  const { billing } = setup();
  const existingUser = { id: 1, email: 'a@b.com', pass: 'p' };
  await assert.rejects(billing.createCheckout({ plan: 'BASIC', billingCycle: 'ANNUAL', existingUser }), (e) => e.statusCode === 422 && e.code === 'COUNTRY_REQUIRED');
  await assert.rejects(billing.createCheckout({ plan: 'BASIC', billingCycle: 'ANNUAL', existingUser, country: '  ' }), (e) => e.code === 'COUNTRY_REQUIRED');
  // Advanced: không đòi quốc gia, lỗi tiếp theo là thiếu SKU (chưa cấu hình), không phải COUNTRY_REQUIRED
  await assert.rejects(billing.createCheckout({ plan: 'ADVANCED', billingCycle: 'ANNUAL', existingUser }), (e) => e.code !== 'COUNTRY_REQUIRED' && e.statusCode === 503);
});

test('payment locks the chosen country for Basic; Advanced keeps none; limitsFor reflects plan', () => {
  const { db, billing } = setup();
  assert.equal(billing.limitsFor(999), null);
  paidOrder(db, billing, { orderId: 'o1', plan: 'BASIC', country: 'Japan' });
  const id = db.prepare('SELECT id FROM users WHERE email = ?').get('a@b.com').id;
  assert.deepEqual(billing.limitsFor(id), { plan: 'BASIC', maxCountries: 1, maxConcurrentSearches: 1, dailySearches: 0, countries: ['Japan'], planMaxCountries: 1, overrides: {} });
  // admin đổi nước
  assert.equal(billing.setCountries(id, ['Germany', 'germany', ' ']), true);
  assert.deepEqual(billing.limitsFor(id).countries, ['Germany']);
  billing.setCountries(id, ['France']);
  // nâng lên Advanced: bỏ khoá quốc gia
  paidOrder(db, billing, { orderId: 'o2', plan: 'ADVANCED' });
  const adv = billing.limitsFor(id);
  assert.deepEqual([adv.plan, adv.maxCountries, adv.maxConcurrentSearches, adv.countries], ['ADVANCED', 0, 0, []]);
});

test('country helpers', () => {
  assert.equal(normCountry('  Việt   Nam '), 'viet nam');
  assert.equal(normCountry('UNITED states'), 'united states');
  assert.deepEqual(parseCountries('["Japan"," "]'), ['Japan']);
  assert.deepEqual(parseCountries('not json'), []);
  assert.deepEqual(parseCountries(null), []);
});

test('admin can override the number of countries per user; plan change resets it', () => {
  const { db, billing } = setup();
  paidOrder(db, billing, { orderId: 'o1', plan: 'BASIC', country: 'Japan' });
  const id = db.prepare('SELECT id FROM users WHERE email = ?').get('a@b.com').id;
  assert.equal(billing.limitsFor(id).maxCountries, 1);
  assert.equal(billing.setOverrides(id, { maxCountries: 3 }), true);
  let l = billing.limitsFor(id);
  assert.deepEqual([l.maxCountries, l.planMaxCountries, l.overrides], [3, 1, { maxCountries: 3 }]);
  assert.equal(l.maxConcurrentSearches, 1); // các trường khác vẫn theo gói
  billing.setOverrides(id, { maxCountries: 0 }); // 0 = không giới hạn
  assert.equal(billing.limitsFor(id).maxCountries, 0);
  billing.setOverrides(id, { maxCountries: null }); // bỏ ghi đè
  assert.deepEqual([billing.limitsFor(id).maxCountries, billing.limitsFor(id).overrides], [1, {}]);
  assert.equal(billing.setOverrides(id, { maxCountries: -1 }) && billing.limitsFor(id).maxCountries, 1); // giá trị sai bị bỏ qua
  assert.equal(billing.setOverrides(12345, { maxCountries: 2 }), false); // chưa có gói
  // gia hạn cùng gói giữ ghi đè và nước đã khoá; đổi gói thì xoá ghi đè
  billing.setOverrides(id, { maxCountries: 2 });
  paidOrder(db, billing, { orderId: 'o2', plan: 'BASIC' });
  l = billing.limitsFor(id);
  assert.deepEqual([l.maxCountries, l.countries], [2, ['Japan']]);
  paidOrder(db, billing, { orderId: 'o3', plan: 'ADVANCED' });
  assert.deepEqual([billing.limitsFor(id).overrides, billing.limitsFor(id).maxCountries], [{}, 0]);
});
