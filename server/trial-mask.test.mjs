import test from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskPhone, maskWebsite, maskTrialPlace } from './trial-mask.mjs';

test('maskEmail hides most of local part and domain, keeps TLD', () => {
  assert.equal(maskEmail('john.smith@acme-coffee.com'), 'jo***@a***.com');
  assert.equal(maskEmail('a@b.de'), 'a***@b***.de');
  assert.equal(maskEmail(''), '');
});

test('maskPhone keeps formatting, area digits and last two digits', () => {
  assert.equal(maskPhone('+49 40 1234567'), '+49 4• •••••67');
  assert.equal(maskPhone('(213) 555-0147'), '(213) •••-••47');
  assert.equal(maskPhone('1234'), '••••');
  assert.equal(maskPhone(''), '');
});

test('maskWebsite keeps only first letter and TLD, drops scheme, www and path', () => {
  assert.equal(maskWebsite('https://www.acme-coffee.com/shop?x=1'), 'a***.com');
  assert.equal(maskWebsite('acme.co.uk'), 'a***.uk');
  assert.equal(maskWebsite('localhost'), '***');
  assert.equal(maskWebsite(''), '');
});

test('maskTrialPlace masks every contact field and leaves the rest untouched', () => {
  const m = maskTrialPlace({ title: 'X', email: 'john@acme.com', additionalEmails: ['sales@acme.com'], phone: '+49 40 1234567', website: 'https://acme.com/about' });
  assert.deepEqual([m.title, m.email, m.additionalEmails, m.phone, m.website], ['X', 'jo***@a***.com', ['sa***@a***.com'], '+49 4• •••••67', 'a***.com']);
});

test('free plan: best 10 leads stay visible; the rest are only partly hidden', async () => {
  const { pickVisibleIds, redactPlace, maskName } = await import('./trial-mask.mjs');
  const results = Array.from({ length: 25 }, (_, i) => ({ id: `l${i}`, title: `Co ${i}`, email: i < 12 ? `a${i}@x.com` : '', phone: '123', website: 'https://x.com', address: 'Somewhere' }));
  const ids = pickVisibleIds(results, 10);
  assert.equal(ids.length, 10);
  assert.ok(ids.every((id) => Number(id.slice(1)) < 12), 'ưu tiên lead có email');
  assert.equal(maskName('Hamburg Coffee Company mbH'), 'Ham*** Cof*** Com*** m**');
  const p = redactPlace({ id: 'l20', title: 'Secret Coffee', phone: '+49 40 3096160', email: 'email@hacofco.de', website: 'https://hacofco.de/', address: 'Am Sandtorkai 77, 20457 Hamburg', street: 'Am Sandtorkai 77', city: 'Hamburg', country: 'DE', placeId: 'P', googleMapsUrl: 'u', latitude: 53.542212, longitude: 9.982337, category: 'Cà phê' });
  assert.equal(p.title, 'Sec*** Cof***');
  assert.deepEqual([p.address, p.street, p.placeId, p.googleMapsUrl, p.latitude, p.longitude, p.category, p.hidden], ['Hamburg, DE', '', '', '', 53.5, 10, 'Cà phê', true]);
  assert.ok(!p.email.includes('hacofco') && !p.website.includes('hacofco') && p.phone.includes('•'));
});
