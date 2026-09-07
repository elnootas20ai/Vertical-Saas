#!/usr/bin/env node
/**
 * Reset password ONLY for ubertest@vertial.com (no recreate business).
 * Uso: UBER_TEST_PASSWORD='...' node scripts/remote-reset-ubertest-password.mjs
 */
import crypto from 'node:crypto';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const pass = String(process.env.UBER_TEST_PASSWORD || 'UberTest-Vertial-2026!').trim();
if (pass.length < 8) {
  console.error('Password too short');
  process.exit(1);
}

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
const passwordHash = `${salt}:${hash}`;

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const passwordHash = ${JSON.stringify(passwordHash)};
const find = await fetch(couch + '/accounts/_find', {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ selector: { type: 'account', email: 'ubertest@vertial.com' }, limit: 5 }),
});
const docs = (await find.json()).docs || [];
const acc = docs.find((d) => !d.deletedAt);
if (!acc) throw new Error('ubertest account not found');
acc.passwordHash = passwordHash;
acc.updatedAt = new Date().toISOString();
acc.failedLoginAttempts = 0;
acc.lockUntil = null;
const put = await fetch(couch + '/accounts/' + encodeURIComponent(acc._id), {
  method: 'PUT',
  headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(acc),
});
const saved = await put.json();
if (!put.ok) throw new Error(JSON.stringify(saved));
console.log(JSON.stringify({ ok: true, email: acc.email, businessId: acc.linkedBusinessId, rev: saved.rev }, null, 2));
NODE`;

console.log('[reset-ubertest-password] setting password on VPS…');
const r = sshRunScript(user, host, identity, bash);
if ((r.status ?? 1) === 0) {
  console.log('Email: ubertest@vertial.com');
  console.log('Password:', pass);
}
process.exit(r.status ?? (r.error ? 1 : 0));
