#!/usr/bin/env node
// Quản lý tài khoản từ dòng lệnh:
//   node server/users.mjs create <email> [admin|user]   → tạo, in mật khẩu ngẫu nhiên
//   node server/users.mjs reset <email>                  → đặt lại mật khẩu ngẫu nhiên
//   node server/users.mjs list
import { DatabaseSync } from 'node:sqlite';
import { ensureAuthSchema, hashPassword, randomPassword } from './auth-lib.mjs';

const db = new DatabaseSync(process.env.DB_PATH || '/var/lib/maps-data/cache.db');
ensureAuthSchema(db);
const [cmd, emailArg, roleArg] = process.argv.slice(2);
const email = (emailArg || '').trim().toLowerCase();

if (cmd === 'create') {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('Email không hợp lệ'); process.exit(1); }
  const role = roleArg === 'admin' ? 'admin' : 'user';
  const pw = randomPassword();
  try {
    db.prepare('INSERT INTO users (email, pass, role, created_at) VALUES (?, ?, ?, ?)').run(email, hashPassword(pw), role, Date.now());
  } catch { console.error('Email đã tồn tại'); process.exit(1); }
  console.log(`Đã tạo ${role}: ${email}\nMật khẩu: ${pw}\n(Hãy đổi mật khẩu sau khi đăng nhập)`);
} else if (cmd === 'reset') {
  const pw = randomPassword();
  const r = db.prepare('UPDATE users SET pass = ?, disabled = 0 WHERE email = ?').run(hashPassword(pw), email);
  if (!r.changes) { console.error('Không tìm thấy tài khoản'); process.exit(1); }
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(email);
  console.log(`Mật khẩu mới của ${email}: ${pw}`);
} else if (cmd === 'list') {
  for (const u of db.prepare('SELECT id, email, role, daily_new, daily_refresh, disabled FROM users').all()) console.log(JSON.stringify(u));
} else {
  console.error('Dùng: create <email> [admin|user] | reset <email> | list');
  process.exit(1);
}
