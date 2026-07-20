#!/usr/bin/env node
/**
 * Desbloquea cuentas con lockUntil activo (prod o local).
 * Uso:
 *   NODE_ENV=production node scripts/unlock-locked-accounts.mjs
 *   NODE_ENV=production node scripts/unlock-locked-accounts.mjs --email=cliente@ejemplo.com
 *   NODE_ENV=production node scripts/unlock-locked-accounts.mjs --apply
 *
 * Sin --apply solo lista. Con --apply limpia failedLoginAttempts + lockUntil.
 */
import '../config/env.js';
import {
  ensureDatabase,
  getAllDocuments,
  getAccountsDbName,
  saveAccount,
} from '../services/couchdb.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const emailArg = args.find((a) => a.startsWith('--email='));
const onlyEmail = emailArg ? String(emailArg.split('=')[1] || '').trim().toLowerCase() : '';

const req = { headers: {} };
const db = getAccountsDbName();
await ensureDatabase(req, db);
const docs = await getAllDocuments(req, db);
const now = Date.now();

const locked = (docs || []).filter((d) => {
  if (!d || d.type !== 'account' || d.deletedAt) return false;
  if (onlyEmail && String(d.email || '').trim().toLowerCase() !== onlyEmail) return false;
  if (!d.lockUntil) return false;
  const until = new Date(d.lockUntil).getTime();
  return Number.isFinite(until) && until > now;
});

console.log(`[unlock] Cuentas bloqueadas ahora: ${locked.length}`);
for (const a of locked) {
  console.log(` - ${a.email} · intentos=${a.failedLoginAttempts || 0} · hasta=${a.lockUntil}`);
}

if (!apply) {
  console.log('[unlock] Dry-run. Añade --apply para desbloquear.');
  process.exit(0);
}

for (const a of locked) {
  await saveAccount(req, {
    ...a,
    failedLoginAttempts: 0,
    lockUntil: null,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[unlock] OK ${a.email}`);
}

console.log(`[unlock] Desbloqueadas: ${locked.length}`);
