import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
  const { billingCycle, effectiveFrom, manual, planMaxConcurrentSearches, planDailySearches, ...rest } = billing.limitsFor(id);
  assert.deepEqual(rest, { plan: 'BASIC', maxCountries: 1, maxConcurrentSearches: 1, dailySearches: 0, countries: ['Japan'], planMaxCountries: 1, overrides: {} });
  assert.deepEqual([billingCycle, manual, planMaxConcurrentSearches, planDailySearches], ['ANNUAL', false, 1, 0]);
  assert.ok(effectiveFrom > 0);
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


// CRM giả: ghi lại body, trả phiên với giá SKU 4000 (nhân quantity nếu `supportsQuantity`).
// reject400: mô phỏng CRM cũ (schema strict) từ chối trường quantity bằng 422.
function fakeCrm({ supportsQuantity = true, reject400 = false } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push(body);
      res.setHeader('content-type', 'application/json');
      if (reject400 && body.quantity) { res.statusCode = 422; return res.end(JSON.stringify({ error: { message: 'Unrecognized key(s): quantity' } })); }
      const q = supportsQuantity ? (body.quantity ?? 1) : 1;
      res.end(JSON.stringify({ data: { paymentSessionId: `ps-${seen.length}`, externalOrderId: body.externalOrderId, sourceKey: body.sourceKey, product: { sku: body.productSku, name: 'Basic' },
        amount: { value: String(4000 * q), currency: 'VND' }, status: 'PENDING', instructions: {}, ...(supportsQuantity && q > 1 ? { quantity: q, unitAmount: '4000' } : {}) } }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}
function setupWithCrm(url) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  ensureAuthSchema(db);
  ensureBillingSchema(db);
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('billing', ?)").run(JSON.stringify({ sourceKey: 'maps', skus: { BASIC_ANNUAL: 'SKU_BA', BASIC_MONTHLY: 'SKU_BM', ADVANCED_ANNUAL: 'SKU_AA', ADVANCED_MONTHLY: 'SKU_AM' } }));
  const billing = createBillingService({ db, stmt: { userByEmail: db.prepare('SELECT * FROM users WHERE email = ?') }, hashPassword, crm: { sourceKey: 'maps', apiKey: 'api-key', callbackKey: 'cb-key', baseUrl: url } });
  return { db, billing };
}
const existing = { id: 1, email: 'a@b.com', pass: 'p' };

test('multi-country checkout sends quantity = number of countries and stores the countries; total = unit × N', async () => {
  const crm = await fakeCrm();
  try {
    const { db, billing } = setupWithCrm(crm.url);
    const r = await billing.createCheckout({ plan: 'BASIC', billingCycle: 'ANNUAL', existingUser: existing, countries: ['Japan', 'japan', 'Germany', 'Viet Nam'] });
    assert.equal(crm.seen[0].quantity, 3); // 'Japan' và 'japan' là một
    assert.equal(r.session.amount.value, '12000');
    const order = db.prepare('SELECT * FROM billing_orders WHERE order_id = ?').get(r.orderId);
    assert.deepEqual([order.quantity, order.amount, JSON.parse(order.countries), order.country], [3, 12000, ['Japan', 'Germany', 'Viet Nam'], 'Japan']);
    // một quốc gia: không gửi quantity (tương thích CRM cũ)
    const r1 = await billing.createCheckout({ plan: 'BASIC', billingCycle: 'MONTHLY', existingUser: existing, country: 'Japan' });
    assert.equal('quantity' in crm.seen[1], false);
    assert.equal(db.prepare('SELECT quantity FROM billing_orders WHERE order_id = ?').get(r1.orderId).quantity, 1);
    // đơn chờ thanh toán cũ không được dùng lại khi đổi số quốc gia (giá khác)
    const again = await billing.createCheckout({ plan: 'BASIC', billingCycle: 'ANNUAL', existingUser: existing, countries: ['Japan', 'Germany'] });
    assert.notEqual(again.orderId, r.orderId);
    assert.equal(again.session.amount.value, '8000');
    // Advanced: không cần/không gửi quốc gia
    await billing.createCheckout({ plan: 'ADVANCED', billingCycle: 'ANNUAL', existingUser: existing, countries: ['Japan', 'Germany'] });
    assert.equal('quantity' in crm.seen.at(-1), false);
  } finally { crm.server.close(); }
});

test('multi-country checkout refuses to continue when the CRM does not confirm quantity', async () => {
  for (const mode of [{ supportsQuantity: false }, { reject400: true }]) {
    const crm = await fakeCrm(mode);
    try {
      const { db, billing } = setupWithCrm(crm.url);
      await assert.rejects(billing.createCheckout({ plan: 'BASIC', billingCycle: 'ANNUAL', existingUser: existing, countries: ['Japan', 'Germany'] }), (e) => e.code === 'CRM_QUANTITY_UNSUPPORTED' && e.statusCode === 503);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_orders').get().n, 0);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_pending_accounts').get().n, 0);
    } finally { crm.server.close(); }
  }
});

test('paying for N countries locks exactly those countries and allows N; renewal with fewer replaces them', () => {
  const { db, billing } = setup();
  const pay = (orderId, countries) => {
    db.prepare('INSERT INTO billing_orders (order_id, crm_session_id, email, customer_name, product_sku, plan, billing_cycle, amount, currency, status, created_at, updated_at, country, countries, quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(orderId, `s-${orderId}`, 'a@b.com', 'A', 'BASIC_ANNUAL', 'BASIC', 'ANNUAL', 4000 * countries.length, 'VND', 'PENDING_PAYMENT', 1, 1, countries[0], JSON.stringify(countries), countries.length);
    db.prepare('INSERT INTO billing_pending_accounts (order_id, email, customer_name, pass, created_at) VALUES (?,?,?,?,?)').run(orderId, 'a@b.com', 'A', hashPassword('x'.repeat(12)), 1);
    return billing.applyEntitlement({ providedKey: 'cb-key', eventType: 'PAYMENT_COMPLETED', eventId: `e-${orderId}`, externalOrderId: orderId, sourceKey: 'maps', productSku: 'BASIC_ANNUAL', amount: { value: 4000 * countries.length, currency: 'VND' }, crmTransactionId: 't' });
  };
  pay('o1', ['Japan', 'Germany', 'France']);
  const id = db.prepare('SELECT id FROM users WHERE email = ?').get('a@b.com').id;
  let l = billing.limitsFor(id);
  assert.deepEqual([l.maxCountries, l.countries, l.planMaxCountries], [3, ['Japan', 'Germany', 'France'], 1]);
  pay('o2', ['Italy']); // gia hạn chỉ 1 nước → về đúng giới hạn gói, bỏ ghi đè
  l = billing.limitsFor(id);
  assert.deepEqual([l.maxCountries, l.countries, l.overrides], [1, ['Italy'], {}]);
});

test('admin-managed benefits: trimmed, capped, empty lists omitted, legacy "features" ignored', () => {
  const long = 'x'.repeat(300);
  const { billing } = setup({ features: { BASIC: ['Chọn 1 quốc gia (cũ)'] }, benefits: { BASIC: ['  Xuất CSV  ', '', long, ...Array.from({ length: 30 }, (_, i) => `Dòng ${i}`)], ADVANCED: ['  ', ''] } });
  const { benefits } = billing.getConfig();
  assert.equal(benefits.BASIC[0], 'Xuất CSV');
  assert.equal(benefits.BASIC.length, 20);
  assert.equal(benefits.BASIC[1].length, 200);
  assert.equal('ADVANCED' in benefits, false); // rỗng → giao diện dùng mặc định
  assert.equal('features' in billing.getConfig(), false);
  assert.deepEqual(setup().billing.getConfig().benefits, {});
});

test('admin assignPlan: creates, switches (clearing overrides and countries), removes; applies plan quotas', () => {
  const { db, billing } = setup();
  const id = Number(db.prepare('INSERT INTO users (email, pass, role, daily_new, daily_refresh, created_at) VALUES (?,?,?,?,?,?)').run('m@b.com', 'p', 'user', 1, 1, 1).lastInsertRowid);
  assert.equal(billing.limitsFor(id), null);
  billing.assignPlan(id, 'BASIC', 'MONTHLY');
  let l = billing.limitsFor(id);
  assert.deepEqual([l.plan, l.billingCycle, l.manual, l.maxConcurrentSearches], ['BASIC', 'MONTHLY', true, 1]);
  const quota = billing.getConfig().plans.BASIC;
  const row = db.prepare('SELECT daily_new, daily_refresh FROM users WHERE id=?').get(id);
  assert.deepEqual([row.daily_new, row.daily_refresh], [quota.dailyNew, quota.dailyRefresh]);
  billing.setOverrides(id, { dailySearches: 5 });
  billing.setCountries(id, ['Japan']);
  billing.assignPlan(id, 'ADVANCED', 'ANNUAL');
  l = billing.limitsFor(id);
  assert.deepEqual([l.plan, l.billingCycle, l.overrides, l.countries, l.maxCountries], ['ADVANCED', 'ANNUAL', {}, [], 0]);
  assert.throws(() => billing.assignPlan(id, 'GOLD'), /không hợp lệ/);
  billing.assignPlan(id, null);
  assert.equal(billing.limitsFor(id), null);
});
