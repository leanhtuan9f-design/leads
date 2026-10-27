import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const text = (value, max = 255) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';
const email = (value) => {
  const result = text(value, 320).toLowerCase();
  if (!result || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw Object.assign(new Error('Email không hợp lệ'), { statusCode: 422 });
  return result;
};
const constantEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
};
const jsonHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function ensureBillingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_orders (
      order_id TEXT PRIMARY KEY,
      crm_session_id TEXT UNIQUE,
      email TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      product_sku TEXT NOT NULL,
      plan TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      amount INTEGER,
      currency TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      trial_id TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_pending_accounts (
      order_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      pass TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_events (
      event_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_plans (
      user_id INTEGER PRIMARY KEY,
      plan TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      order_id TEXT NOT NULL,
      effective_from INTEGER NOT NULL,
      effective_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS crm_event_log (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      order_id TEXT,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_orders_email ON billing_orders(email);
  `);
  // Quốc gia được phép tìm kiếm: chọn lúc mua (billing_orders.country) rồi khoá vào user_plans.countries (JSON mảng tên nước).
  for (const [table, column, type] of [['billing_orders', 'country', 'TEXT'], ['billing_orders', 'countries', 'TEXT'], ['billing_orders', 'quantity', 'INTEGER NOT NULL DEFAULT 1'], ['user_plans', 'countries', 'TEXT'], ['user_plans', 'limit_overrides', 'TEXT']]) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export const parseCountries = (value) => {
  try { const list = JSON.parse(value || '[]'); return Array.isArray(list) ? list.map((c) => text(c, 100)).filter(Boolean) : []; } catch { return []; }
};
// Admin ghi đè giới hạn theo từng người dùng (user_plans.limit_overrides, JSON); khoá vắng = theo cấu hình gói.
export const OVERRIDE_KEYS = ['maxCountries', 'maxConcurrentSearches', 'dailySearches'];
export const parseOverrides = (value) => {
  try {
    const raw = JSON.parse(value || '{}');
    return Object.fromEntries(OVERRIDE_KEYS.filter((k) => Number.isInteger(raw?.[k]) && raw[k] >= 0).map((k) => [k, raw[k]]));
  } catch { return {}; }
};
// Danh sách quốc gia khách chọn khi mua: bỏ trùng (không phân biệt hoa thường/dấu), tối đa MAX_PURCHASE_COUNTRIES.
export const MAX_PURCHASE_COUNTRIES = 60;
export const cleanCountryList = (value) => {
  const raw = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
  const seen = new Set();
  return raw.map((c) => text(String(c ?? '').replace(/\s+/g, ' '), 100)).filter((c) => c && !seen.has(normCountry(c)) && seen.add(normCountry(c))).slice(0, MAX_PURCHASE_COUNTRIES);
};
export const normCountry = (value) => text(String(value ?? ''), 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');

export function createBillingService({ db, stmt, hashPassword, crm = {}, planQuotas = {} }) {
  const initialSourceKey = text(crm.sourceKey || process.env.CRM_SOURCE_KEY, 120);
  const baseUrl = text(crm.baseUrl || process.env.CRM_BASE_URL, 1000).replace(/\/$/, '');
  const apiKey = text(crm.apiKey || process.env.CRM_CHECKOUT_API_KEY, 4096);
  const websiteKey = text(crm.websiteKey || process.env.CRM_WEBSITE_KEY, 4096);
  const callbackKey = text(crm.callbackKey || process.env.CRM_CALLBACK_API_KEY, 4096);
  const eventEndpoint = text(crm.eventEndpoint || process.env.CRM_EVENT_ENDPOINT || (baseUrl && websiteKey ? `/api/public/websites/${encodeURIComponent(websiteKey)}/events` : ''), 2048);
  const paymentConfigKey = text(crm.paymentConfigKey || process.env.CRM_PAYMENT_CONFIG_KEY, 160);
  const envSkus = Object.fromEntries(['BASIC_MONTHLY', 'BASIC_ANNUAL', 'ADVANCED_MONTHLY', 'ADVANCED_ANNUAL'].map((key) => [key, text(process.env[`CRM_SKU_${key}`], 160)]));
  const defaultQuotas = {
    // maxCountries / maxConcurrentSearches / dailySearches: 0 = không giới hạn. Admin chỉnh từng trường trong cấu hình gói.
    BASIC: { dailyNew: 500, dailyRefresh: 10, maxCountries: 1, maxConcurrentSearches: 1, dailySearches: 0, ...(planQuotas.BASIC || {}) },
    ADVANCED: { dailyNew: 2000, dailyRefresh: 50, maxCountries: 0, maxConcurrentSearches: 0, dailySearches: 0, ...(planQuotas.ADVANCED || {}) },
  };
  const defaultPrices = {
    BASIC: { MONTHLY: 2000, ANNUAL: 4000 },
    ADVANCED: { MONTHLY: 4000, ANNUAL: 8000 },
  };
  const readConfig = () => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'billing'").get();
    let saved = {};
    try { saved = row?.value ? JSON.parse(row.value) : {}; } catch { /* dùng env */ }
    const prices = { BASIC: { ...defaultPrices.BASIC, ...(saved.prices?.BASIC || {}) }, ADVANCED: { ...defaultPrices.ADVANCED, ...(saved.prices?.ADVANCED || {}) } };
    // Danh sách tính năng hiển thị cho khách do admin soạn (rỗng = dùng mặc định của giao diện). Khoá `benefits`, không dùng `features` cũ đã lỗi thời.
    const benefitList = (value) => (Array.isArray(value) ? value.map((item) => text(item, 200)).filter(Boolean).slice(0, 20) : []);
    const benefits = Object.fromEntries(['BASIC', 'ADVANCED'].map((key) => [key, benefitList(saved.benefits?.[key])]).filter(([, list]) => list.length));
    return { sourceKey: text(saved.sourceKey || initialSourceKey, 120), skus: { ...envSkus, ...(saved.skus || {}) }, plans: { BASIC: { ...defaultQuotas.BASIC, ...(saved.plans?.BASIC || {}) }, ADVANCED: { ...defaultQuotas.ADVANCED, ...(saved.plans?.ADVANCED || {}) } }, prices, benefits };
  };

  const callCrm = async (path, init = {}, auth = true) => {
    if (!baseUrl || (auth && !apiKey)) throw Object.assign(new Error('Central CRM payment chưa được cấu hình'), { statusCode: 503 });
    const response = await fetch(new URL(path, `${baseUrl}/`), {
      ...init,
      redirect: 'error',
      headers: { ...(init.headers || {}), 'content-type': 'application/json', ...(auth ? { 'x-crm-source-api-key': apiKey } : {}) },
      signal: AbortSignal.timeout(Number(process.env.CRM_REQUEST_TIMEOUT_MS || 8000)),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body?.error?.message || 'Central CRM request failed'), {
      statusCode: response.status,
      code: body?.error?.code || body?.code || `CRM_HTTP_${response.status}`,
    });
    return body;
  };

  const emitEvent = async (eventType, orderId, payload) => {
    if (!websiteKey || !eventEndpoint) return;
    const eventId = `${eventType}:${orderId}`;
    const previous = db.prepare('SELECT status FROM crm_event_log WHERE event_id=?').get(eventId);
    if (previous?.status === 'SENT') return;
    const body = JSON.stringify({ ...payload, eventType });
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(new URL(eventEndpoint, `${baseUrl}/`), { method: 'POST', headers: { 'content-type': 'application/json', 'x-crm-website-key': websiteKey }, body, redirect: 'error', signal: AbortSignal.timeout(Number(process.env.CRM_REQUEST_TIMEOUT_MS || 8000)) });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          db.prepare('INSERT INTO crm_event_log (event_id,event_type,order_id,status,payload_json,attempts,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,attempts=excluded.attempts,updated_at=excluded.updated_at').run(eventId, eventType, orderId, 'SENT', body, attempt, Date.now());
          return result;
        }
        lastError = Object.assign(new Error(result?.error?.message || `CRM event failed (${response.status})`), { statusCode: response.status });
        if (response.status < 500) break;
      } catch (error) { lastError = error; }
    }
    db.prepare('INSERT INTO crm_event_log (event_id,event_type,order_id,status,payload_json,attempts,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,attempts=excluded.attempts,updated_at=excluded.updated_at').run(eventId, eventType, orderId, 'FAILED', body, 3, Date.now());
    throw Object.assign(new Error(lastError?.message || 'CRM event failed'), {
      statusCode: lastError?.statusCode || 503,
      code: lastError?.code || 'CRM_EVENT_FAILED',
    });
  };

  const inflightCheckouts = new Map();
  const createCheckoutOnce = async ({ name, emailAddress, phone, password, plan, billingCycle, trialId, existingUser, country, countries }) => {
    const config = readConfig();
    const customerEmail = existingUser?.email || email(emailAddress);
    const normalizedPlan = text(plan, 20).toUpperCase();
    const cycle = text(billingCycle, 20).toUpperCase();
    if (!['BASIC', 'ADVANCED'].includes(normalizedPlan) || !['MONTHLY', 'ANNUAL'].includes(cycle)) throw Object.assign(new Error('Gói thanh toán không hợp lệ'), { statusCode: 422 });
    if (!existingUser && (typeof password !== 'string' || password.length < 10 || password.length > 200)) throw Object.assign(new Error('Mật khẩu phải có từ 10 ký tự'), { statusCode: 422 });
    // Gói giới hạn số quốc gia (Basic): người mua chọn các nước ngay lúc thanh toán; giá = giá gói × số nước (CRM nhân theo quantity).
    // Nước được khoá sau khi thanh toán, admin đổi được.
    const limited = (config.plans[normalizedPlan]?.maxCountries || 0) > 0;
    const orderCountries = limited ? cleanCountryList(countries ?? country) : [];
    if (limited && orderCountries.length === 0) throw Object.assign(new Error('Hãy chọn ít nhất 1 quốc gia sử dụng cho gói này'), { statusCode: 422, code: 'COUNTRY_REQUIRED' });
    const quantity = limited ? orderCountries.length : 1;
    const productSku = text(config.skus[`${normalizedPlan}_${cycle}`], 160);
    if (!productSku) throw Object.assign(new Error('SKU sản phẩm CRM chưa được cấu hình'), { statusCode: 503 });
    const now = Date.now();
    // A repeated click/submit must not create another CRM order + payment session: reuse the customer's recent unpaid order.
    const recent = db.prepare("SELECT order_id, crm_session_id FROM billing_orders WHERE email = ? AND product_sku = ? AND status = 'PENDING_PAYMENT' AND quantity = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1").get(customerEmail, productSku, quantity, now - 10 * 60 * 1000);
    if (recent) {
      try {
        const body = await callCrm(`/api/public/payment-sessions/${encodeURIComponent(recent.crm_session_id)}/status`, {}, false);
        const live = body?.data || body;
        if (live?.status === 'PENDING' && live.paymentSessionId === recent.crm_session_id) {
          db.prepare('UPDATE billing_pending_accounts SET customer_name = ?, pass = ? WHERE order_id = ?').run(text(name, 255) || customerEmail, hashPassword(password), recent.order_id);
          db.prepare('UPDATE billing_orders SET country = ?, countries = ? WHERE order_id = ?').run(orderCountries[0] || null, orderCountries.length ? JSON.stringify(orderCountries) : null, recent.order_id);
          return { orderId: recent.order_id, status: 'PENDING_PAYMENT', session: live, reused: true };
        }
      } catch { /* fall through and create a fresh session */ }
    }
    const orderId = `MAPS-${randomUUID()}`;
    const stored = { orderId, email: customerEmail, customerName: text(name, 255) || customerEmail, productSku, plan: normalizedPlan, billingCycle: cycle, status: 'CREATED', createdAt: now, trialId: text(trialId, 120) || null };
    const response = await callCrm('/api/integrations/payment-sessions', { method: 'POST', body: JSON.stringify({
      schemaVersion: 1, sourceKey: config.sourceKey, externalOrderId: orderId, idempotencyKey: `maps-checkout:${orderId}`,
      productSku, customer: { name: stored.customerName, email: customerEmail, ...(text(phone, 40) ? { phone: text(phone, 40) } : {}) }, metadata: { billingCycle: cycle },
      ...(quantity > 1 ? { quantity } : {}), // CRM tính tiền = giá SKU × quantity
    }) }).catch((error) => {
      // CRM cũ (schema strict) từ chối trường quantity: báo rõ thay vì lỗi chung, và không tạo đơn sai tiền
      if (quantity > 1 && [400, 422].includes(Number(error?.statusCode))) throw Object.assign(new Error('Cổng thanh toán chưa hỗ trợ mua nhiều quốc gia. Hãy chọn 1 quốc gia hoặc liên hệ hỗ trợ.'), { statusCode: 503, code: 'CRM_QUANTITY_UNSUPPORTED' });
      throw error;
    });
    const session = response?.data || response;
    const returnedSourceKey = text(session.sourceKey, 120);
    if (!session?.paymentSessionId || session.externalOrderId !== orderId || (returnedSourceKey && returnedSourceKey !== config.sourceKey) || text(session.product?.sku, 160).toUpperCase() !== productSku.toUpperCase()) throw Object.assign(new Error('Central CRM trả về payment session không khớp'), { statusCode: 502, code: 'CRM_SESSION_MISMATCH' });
    const amount = Number(session.amount?.value);
    const currency = text(session.amount?.currency, 12).toUpperCase();
    // Mua nhiều quốc gia: CRM phải xác nhận đúng quantity và số tiền = giá một đơn vị × quantity, nếu không dừng (tránh thu thiếu tiền).
    if (quantity > 1) {
      const unit = Number(session.unitAmount);
      if (Number(session.quantity) !== quantity || !Number.isFinite(unit) || Math.abs(amount - unit * quantity) > 0.01) {
        throw Object.assign(new Error('Cổng thanh toán chưa xác nhận đúng số tiền cho nhiều quốc gia. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.'), { statusCode: 503, code: 'CRM_QUANTITY_UNSUPPORTED' });
      }
    }
    db.prepare(`INSERT INTO billing_orders (order_id, crm_session_id, email, customer_name, product_sku, plan, billing_cycle, amount, currency, status, created_at, updated_at, trial_id, country, countries, quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(orderId, session.paymentSessionId, customerEmail, stored.customerName, productSku, normalizedPlan, cycle, Number.isSafeInteger(amount) ? amount : null, currency || null, 'PENDING_PAYMENT', now, now, stored.trialId, orderCountries[0] || null, orderCountries.length ? JSON.stringify(orderCountries) : null, quantity);
    db.prepare('INSERT INTO billing_pending_accounts (order_id, email, customer_name, pass, created_at) VALUES (?,?,?,?,?)').run(orderId, customerEmail, stored.customerName, existingUser?.pass || hashPassword(password), now);
    const customer = { fullName: stored.customerName, email: customerEmail, ...(text(phone, 40) ? { phone: text(phone, 40) } : {}) };
    const item = { productSku, name: session.product?.name || productSku, quantity, unitPrice: Number.isFinite(amount) ? amount / quantity : 0 };
    // CRM bookkeeping events must not hold up the customer: the payment session already exists. Failures stay in crm_event_log as FAILED.
    void (async () => {
      await emitEvent('lead_submitted', orderId, { customer, metadata: { page: 'https://maps.dn1nguoi.com' } });
      await emitEvent('order_created', orderId, { customer, order: { orderCode: orderId, externalOrderId: orderId, items: [item] }, payment: { amount: Number.isFinite(amount) ? amount : 0, currency, ...(paymentConfigKey ? { configKey: paymentConfigKey } : {}) } });
    })().catch((error) => console.error(`[crm-event] ${orderId}: ${error?.message || error}`));
    return { orderId, status: 'PENDING_PAYMENT', session };
  };

  const createCheckout = (input) => {
    const key = `${input.existingUser?.email || email(input.emailAddress)}|${text(input.plan, 20).toUpperCase()}|${text(input.billingCycle, 20).toUpperCase()}|${cleanCountryList(input.countries ?? input.country).map(normCountry).sort().join(',')}`;
    const running = inflightCheckouts.get(key);
    if (running) return running;
    const promise = createCheckoutOnce(input).finally(() => inflightCheckouts.delete(key));
    inflightCheckouts.set(key, promise);
    return promise;
  };

  const status = async (orderId) => {
    const config = readConfig();
    const order = db.prepare('SELECT * FROM billing_orders WHERE order_id = ?').get(text(orderId, 120));
    if (!order) return null;
    const body = await callCrm(`/api/public/payment-sessions/${encodeURIComponent(order.crm_session_id)}/status`, {}, false);
    const current = body?.data || body;
    let localStatus = current?.status || order.status;
    // CRM's public status payload is intentionally minimal (status, amount, paidAt, instructions): it carries no
    // crmTransactionId/sourceKey/productSku. Fulfil from this order's own stored facts, bound to the exact CRM session.
    const crmTransactionId = current?.crmTransactionId || `session:${order.crm_session_id}`;
    if (localStatus === 'PAID' && (!current.paymentSessionId || current.paymentSessionId === order.crm_session_id)) {
      const fulfillment = applyEntitlement({
        providedKey: apiKey,
        eventType: 'PAYMENT_COMPLETED',
        eventId: `status:${order.crm_session_id}:${current.crmTransactionId}`,
        externalOrderId: order.order_id,
        sourceKey: current.sourceKey || config.sourceKey,
        crmTransactionId,
        crmPaymentSessionId: order.crm_session_id,
        paymentReference: current.paymentReference,
      productSku: current.productSku || current.product?.sku || order.product_sku,
        amount: current.amount,
      });
      if (fulfillment.acknowledged) localStatus = 'FULFILLED';
      await emitEvent('payment_success', order.order_id, { customer: { fullName: order.customer_name, email: order.email }, order: { orderCode: order.order_id, externalOrderId: order.order_id, items: [{ productSku: order.product_sku, quantity: 1, unitPrice: order.amount || 0 }] }, payment: { amount: Number(current.amount?.value || order.amount || 0), currency: current.amount?.currency || order.currency, status: 'paid', provider: 'central_crm', transactionId: crmTransactionId } });
    }
    return { orderId: order.order_id, status: localStatus, session: current };
  };

  const applyEntitlement = (payload) => {
    const config = readConfig();
    if ((!callbackKey || !constantEqual(payload?.providedKey, callbackKey)) && (!apiKey || !constantEqual(payload?.providedKey, apiKey))) throw Object.assign(new Error('Callback authentication failed'), { statusCode: 401 });
    const eventId = text(payload.eventId, 200);
    const orderId = text(payload.externalOrderId || payload.orderId || payload.mapsOrderId, 120);
    const sku = text(payload.productSku, 160).toUpperCase();
    const callbackSource = text(payload.sourceKey, 120);
    const facts = { eventId, orderId, sku, sourceKey: callbackSource, transaction: text(payload.crmTransactionId, 200), amount: payload.amount, occurredAt: text(payload.occurredAt, 80) };
    if (!eventId || !orderId || !sku || callbackSource !== config.sourceKey || !['PAYMENT_COMPLETED', 'PAYMENT_FULFILLED', 'GLOBAL_SEPAY_PAYMENT_COMPLETED'].includes(payload.eventType)) throw Object.assign(new Error('Callback contract không hợp lệ'), { statusCode: 400 });
    const order = db.prepare('SELECT * FROM billing_orders WHERE order_id = ?').get(orderId);
    if (!order || order.product_sku.toUpperCase() !== sku) throw Object.assign(new Error('Đơn hàng Maps không khớp callback'), { statusCode: 409 });
    const existing = db.prepare('SELECT payload_hash FROM billing_events WHERE event_id = ?').get(eventId);
    const fingerprint = jsonHash(facts);
    if (existing) { if (existing.payload_hash !== fingerprint) throw Object.assign(new Error('Callback trùng nhưng dữ liệu xung đột'), { statusCode: 409 }); return { acknowledged: true, duplicate: true }; }
    const amount = Number(payload.amount?.value ?? payload.amount?.amount ?? payload.amount);
    const callbackCurrency = text(payload.amount?.currency, 12).toUpperCase();
    if (order.amount !== null && Number.isFinite(amount) && amount !== order.amount) throw Object.assign(new Error('Số tiền callback không khớp đơn hàng'), { statusCode: 409 });
    if (order.currency && callbackCurrency && callbackCurrency !== String(order.currency).toUpperCase()) throw Object.assign(new Error('Currency callback không khớp đơn hàng'), { statusCode: 409 });
    const pending = db.prepare('SELECT * FROM billing_pending_accounts WHERE order_id = ?').get(orderId);
    if (!pending) throw Object.assign(new Error('Không tìm thấy tài khoản chờ thanh toán'), { statusCode: 409 });
    const quota = config.plans[order.plan] || config.plans.BASIC;
    const result = (() => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const user = stmt.userByEmail.get(pending.email);
        const userId = user?.id || db.prepare('INSERT INTO users (email, pass, role, daily_new, daily_refresh, created_at) VALUES (?,?,?,?,?,?)').run(pending.email, pending.pass, 'user', quota.dailyNew, quota.dailyRefresh, Date.now()).lastInsertRowid;
        db.prepare('UPDATE users SET daily_new=?, daily_refresh=?, disabled=0 WHERE id=?').run(quota.dailyNew, quota.dailyRefresh, userId);
        const prevPlan = db.prepare('SELECT plan FROM user_plans WHERE user_id=?').get(userId)?.plan;
        db.prepare(`INSERT INTO user_plans (user_id, plan, billing_cycle, order_id, effective_from) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, billing_cycle=excluded.billing_cycle, order_id=excluded.order_id, effective_from=excluded.effective_from`).run(userId, order.plan, order.billing_cycle, orderId, Date.now());
        if (prevPlan !== order.plan) db.prepare('UPDATE user_plans SET limit_overrides=NULL WHERE user_id=?').run(userId); // đổi gói: bỏ ghi đè của admin
        const kept = db.prepare('SELECT countries, limit_overrides FROM user_plans WHERE user_id=?').get(userId);
        const bought = cleanCountryList(parseCountries(order.countries).length ? parseCountries(order.countries) : order.country);
        let maxCountries = parseOverrides(kept?.limit_overrides).maxCountries ?? (quota.maxCountries || 0);
        let overrides = parseOverrides(kept?.limit_overrides);
        if ((quota.maxCountries || 0) > 0 && bought.length) { // mua N quốc gia: được tìm đúng N nước đã mua (ghi đè giới hạn theo gói)
          maxCountries = bought.length;
          overrides = { ...overrides, maxCountries: bought.length };
          if (bought.length === quota.maxCountries) delete overrides.maxCountries;
        }
        db.prepare('UPDATE user_plans SET limit_overrides=? WHERE user_id=?').run(Object.keys(overrides).length ? JSON.stringify(overrides) : null, userId);
        const lockedCountries = maxCountries > 0 ? (bought.length ? bought.slice(0, maxCountries) : parseCountries(kept?.countries).slice(0, maxCountries)) : [];
        db.prepare('UPDATE user_plans SET countries=? WHERE user_id=?').run(JSON.stringify(lockedCountries), userId);
        db.prepare('INSERT INTO billing_events (event_id, order_id, payload_hash, created_at) VALUES (?,?,?,?)').run(eventId, orderId, fingerprint, Date.now());
        db.prepare("UPDATE billing_orders SET status='FULFILLED', updated_at=? WHERE order_id=?").run(Date.now(), orderId);
        db.prepare('DELETE FROM billing_pending_accounts WHERE order_id=?').run(orderId);
        db.exec('COMMIT');
        return { userId: Number(userId), plan: order.plan, dailyNew: quota.dailyNew, dailyRefresh: quota.dailyRefresh };
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    })();
    return { acknowledged: true, duplicate: false, fulfillment: result };
  };

  // Giới hạn tìm kiếm của người dùng theo gói đang dùng; null = không có gói (admin/trial/tài khoản thủ công) → không áp giới hạn này.
  const limitsFor = (userId) => {
    const row = db.prepare('SELECT plan, billing_cycle, countries, limit_overrides, effective_from, order_id FROM user_plans WHERE user_id = ?').get(userId);
    const plan = row && readConfig().plans[row.plan];
    if (!plan) return null;
    const overrides = parseOverrides(row.limit_overrides);
    const pick = (key) => overrides[key] ?? (plan[key] || 0);
    return { plan: row.plan, billingCycle: row.billing_cycle, effectiveFrom: row.effective_from, manual: row.order_id === 'ADMIN', maxCountries: pick('maxCountries'), maxConcurrentSearches: pick('maxConcurrentSearches'), dailySearches: pick('dailySearches'), countries: parseCountries(row.countries), planMaxCountries: plan.maxCountries || 0, planMaxConcurrentSearches: plan.maxConcurrentSearches || 0, planDailySearches: plan.dailySearches || 0, overrides };
  };
  // value null = bỏ ghi đè (theo gói). Trả false nếu người dùng chưa có gói.
  const setOverrides = (userId, patch) => {
    const row = db.prepare('SELECT limit_overrides FROM user_plans WHERE user_id = ?').get(userId);
    if (!row) return false;
    const next = { ...parseOverrides(row.limit_overrides) };
    for (const key of OVERRIDE_KEYS) {
      if (!(key in patch)) continue;
      if (patch[key] === null) delete next[key]; else if (Number.isInteger(patch[key]) && patch[key] >= 0 && patch[key] <= 100000) next[key] = patch[key];
    }
    db.prepare('UPDATE user_plans SET limit_overrides = ? WHERE user_id = ?').run(Object.keys(next).length ? JSON.stringify(next) : null, userId);
    return true;
  };
  // Admin gán/đổi/gỡ gói thủ công (không qua thanh toán). plan=null → gỡ gói. Đổi sang gói khác thì xoá ghi đè và nước đã khoá.
  const assignPlan = (userId, planKey, cycle = 'MONTHLY') => {
    if (planKey === null) { db.prepare('DELETE FROM user_plans WHERE user_id = ?').run(userId); return true; }
    const quota = readConfig().plans[planKey];
    if (!quota || !['MONTHLY', 'ANNUAL'].includes(cycle)) throw Object.assign(new Error('Gói hoặc chu kỳ không hợp lệ'), { statusCode: 422 });
    const prev = db.prepare('SELECT plan FROM user_plans WHERE user_id = ?').get(userId);
    if (!prev) db.prepare('INSERT INTO user_plans (user_id, plan, billing_cycle, order_id, effective_from) VALUES (?,?,?,?,?)').run(userId, planKey, cycle, 'ADMIN', Date.now());
    else db.prepare('UPDATE user_plans SET plan=?, billing_cycle=? WHERE user_id=?').run(planKey, cycle, userId);
    if (prev && prev.plan !== planKey) db.prepare('UPDATE user_plans SET limit_overrides=NULL, countries=NULL WHERE user_id=?').run(userId);
    if (!prev || prev.plan !== planKey) db.prepare('UPDATE users SET daily_new=?, daily_refresh=? WHERE id=?').run(quota.dailyNew, quota.dailyRefresh, userId);
    return true;
  };
  const setCountries = (userId, countries) => {
    const seen = new Set();
    const list = (countries || []).map((c) => text(String(c).replace(/\s+/g, ' '), 100)).filter((c) => c && !seen.has(normCountry(c)) && seen.add(normCountry(c))).slice(0, 50);
    return db.prepare('UPDATE user_plans SET countries = ? WHERE user_id = ?').run(JSON.stringify(list), userId).changes > 0;
  };

  return { getConfig: readConfig, createCheckout, status, applyEntitlement, limitsFor, setCountries, setOverrides, assignPlan };
}
