/**
 * Resetea contraseña del admin SaaS y configura email de códigos OTP.
 *
 * Uso (en contenedor o con .env Couch):
 *   SAAS_LOGIN_EMAIL=uriel@admin.com \
 *   SAAS_LOGIN_PASSWORD='...' \
 *   ADMIN_LOGIN_OTP_EMAIL=elnootas2.0@gmail.com \
 *   node scripts/set-saas-admin-security.mjs
 */
import '../config/env.js';
import crypto from 'node:crypto';
import {
  findAccountByEmail,
  saveAccount,
} from '../services/couchdb.js';

const email = String(process.env.SAAS_LOGIN_EMAIL || process.argv[2] || '')
  .trim()
  .toLowerCase();
const password = String(process.env.SAAS_LOGIN_PASSWORD || process.argv[3] || '').trim();
const otpEmail = String(
  process.env.ADMIN_LOGIN_OTP_EMAIL || process.argv[4] || '',
)
  .trim()
  .toLowerCase();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

if (!email || !email.includes('@')) {
  console.error('Falta SAAS_LOGIN_EMAIL');
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error('Falta SAAS_LOGIN_PASSWORD (mín. 8)');
  process.exit(1);
}
if (!otpEmail || !otpEmail.includes('@')) {
  console.error('Falta ADMIN_LOGIN_OTP_EMAIL');
  process.exit(1);
}

const fakeReq = {};
const account = await findAccountByEmail(fakeReq, email);
if (!account) {
  console.error(JSON.stringify({ ok: false, error: 'no_account', email }));
  process.exit(2);
}

const now = new Date().toISOString();
const saved = await saveAccount(fakeReq, {
  ...account,
  passwordHash: hashPassword(password),
  password: undefined,
  loginOtpEmail: otpEmail,
  requireLoginOtp: true,
  failedLoginAttempts: 0,
  lockUntil: null,
  loginOtpHash: null,
  loginOtpExpiry: null,
  status: account.status || 'active',
  role: account.role || 'Admin',
  updatedAt: now,
});

console.log(
  JSON.stringify({
    ok: true,
    email: saved.email,
    user_id: saved.user_id,
    loginOtpEmail: saved.loginOtpEmail,
    requireLoginOtp: saved.requireLoginOtp === true,
    role: saved.role,
    passwordUpdated: true,
  }),
);
