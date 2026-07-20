#!/usr/bin/env node
/**
 * Desbloquea cuenta: failedLoginAttempts=0, lockUntil=null.
 * Uso (local o en contenedor): node scripts/unlock-account.mjs <email>
 */
import '../config/env.js';
import {
  findAccountByEmail,
  resetFailedLoginAttempts,
} from '../services/couchdb.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Uso: node scripts/unlock-account.mjs <email>');
  process.exit(1);
}

const fakeReq = {};
const account = await findAccountByEmail(fakeReq, email);
if (!account) {
  console.error(JSON.stringify({ ok: false, error: 'no_account', email }));
  process.exit(2);
}

const before = {
  failedLoginAttempts: account.failedLoginAttempts || 0,
  lockUntil: account.lockUntil || null,
};
const saved = await resetFailedLoginAttempts(fakeReq, account);
console.log(
  JSON.stringify({
    ok: true,
    email: saved.email,
    user_id: saved.user_id,
    before,
    after: {
      failedLoginAttempts: saved.failedLoginAttempts || 0,
      lockUntil: saved.lockUntil || null,
    },
  }),
);
