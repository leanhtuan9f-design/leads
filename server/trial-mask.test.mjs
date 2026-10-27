import test from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskPhone, maskTrialPlace } from './trial-mask.mjs';

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

test('maskTrialPlace masks every contact field and leaves the rest', () => {
  const m = maskTrialPlace({ title: 'X', email: 'john@acme.com', additionalEmails: ['sales@acme.com'], phone: '+49 40 1234567', website: 'https://acme.com' });
  assert.deepEqual([m.title, m.email, m.additionalEmails, m.phone, m.website], ['X', 'jo***@a***.com', ['sa***@a***.com'], '+49 4• •••••67', 'https://acme.com']);
});
