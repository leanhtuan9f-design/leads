// Dùng chung cho server và script quản lý người dùng
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export function ensureAuthSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      pass TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      daily_new INTEGER NOT NULL DEFAULT 200,
      daily_refresh INTEGER NOT NULL DEFAULT 3,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      new_places INTEGER NOT NULL DEFAULT 0,
      refreshes INTEGER NOT NULL DEFAULT 0,
      searches INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);
  if (!db.prepare('PRAGMA table_info(usage)').all().some((c) => c.name === 'searches')) db.exec('ALTER TABLE usage ADD COLUMN searches INTEGER NOT NULL DEFAULT 0');
}

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const DUMMY = hashPassword('dummy-password-for-timing');

export function verifyPassword(pw, stored) {
  const parts = String(stored || DUMMY).split('$');
  if (parts[0] !== 's1' || parts.length !== 3) return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(pw, Buffer.from(parts[1], 'hex'), expected.length);
  return timingSafeEqual(actual, expected) && Boolean(stored);
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const randomPassword = () => randomBytes(12).toString('base64url');
export const vnDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
