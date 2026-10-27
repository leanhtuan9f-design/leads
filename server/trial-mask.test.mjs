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
