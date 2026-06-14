/**
 * Elimina cuentas de prueba en CouchDB para poder reutilizar el mismo email.
 *
 * Uso (en el VPS con .env del proyecto):
 *   node scripts/delete-test-accounts.mjs email1@test.com email2@test.com
 *   node scripts/delete-test-accounts.mjs --list
 *   node scripts/delete-test-accounts.mjs --list-duplicates
 *   node scripts/delete-test-accounts.mjs --purge-unverified
 *
 * --list: muestra cuentas email (no borradas), marca verificadas
 * --list-duplicates: emails con más de una cuenta activa
 * --purge-unverified: borra TODAS las cuentas con emailVerified=false (excepto protegidas)
 */
import '../config/env.js';

const ACCOUNTS_DB = 'accounts';

const PROTECTED = new Set(
  [
    process.env.SAAS_LOGIN_EMAIL,
    'uriel@admin.com',
    'noreply@vertialapp.com',
    'admin@vertialapp.com',
  ]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean),
);

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

async function couchJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === 'object' && data?.reason ? data.reason : `${res.status} ${text}`);
  }
  return data;
}

function norm(email) {
  return String(email || '').trim().toLowerCase();
}

async function listAccounts() {
  const data = await couchJson('GET', `/${ACCOUNTS_DB}/_all_docs?include_docs=true`);
  return (data.rows || [])
    .map((r) => r.doc)
    .filter((d) => d?.type === 'account' && !d.deletedAt);
}

async function hardDelete(doc) {
  await couchJson('DELETE', `/${ACCOUNTS_DB}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`);
}

async function deleteByEmail(email) {
  const target = norm(email);
  if (!target) return { email, status: 'skip', reason: 'email vacío' };
  if (PROTECTED.has(target)) return { email: target, status: 'skip', reason: 'cuenta protegida' };

  const accounts = await listAccounts();
  const matches = accounts.filter((a) => norm(a.email) === target);
  if (!matches.length) return { email: target, status: 'not_found' };

  for (const doc of matches) {
    await hardDelete(doc);
  }
  return { email: target, status: 'deleted', count: matches.length };
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD en .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (!args.length) {
    console.log(`Uso:
  node scripts/delete-test-accounts.mjs correo1@ejemplo.com [correo2 ...]
  node scripts/delete-test-accounts.mjs --list
  node scripts/delete-test-accounts.mjs --list-duplicates
  node scripts/delete-test-accounts.mjs --purge-unverified`);
    process.exit(0);
  }

  if (args[0] === '--list') {
    const accounts = await listAccounts();
    for (const a of accounts.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))) {
      const verified = a.emailVerified ? '✓' : '·';
      console.log(`${verified} ${a.email}  (${a.fullName || '—'})  ${a.createdAt?.slice(0, 10) || ''}`);
    }
    console.log(`\nTotal: ${accounts.length}`);
    return;
  }

  if (args[0] === '--list-duplicates') {
    const accounts = await listAccounts();
    const byEmail = new Map();
    for (const account of accounts) {
      const email = norm(account.email);
      if (!email) continue;
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(account);
    }

    let duplicateEmails = 0;
    for (const [email, group] of [...byEmail.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (group.length < 2) continue;
      duplicateEmails += 1;
      console.log(`\n${email} (${group.length} cuentas)`);
      for (const account of group.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
        console.log(
          `  · ${account.user_id}  ${account.fullName || '—'}  role=${account.role || '—'}  ${account.createdAt?.slice(0, 10) || ''}`,
        );
      }
    }

    if (!duplicateEmails) {
      console.log('No hay emails duplicados.');
    } else {
      console.log(`\nTotal emails duplicados: ${duplicateEmails}`);
    }
    return;
  }

  if (args[0] === '--purge-unverified') {
    const accounts = await listAccounts();
    const targets = accounts.filter((a) => !a.emailVerified && !PROTECTED.has(norm(a.email)));
    if (!targets.length) {
      console.log('No hay cuentas sin verificar para borrar.');
      return;
    }
    console.log(`Se borrarán ${targets.length} cuenta(s) sin verificar:`);
    for (const a of targets) console.log(`  - ${a.email}`);
    for (const doc of targets) {
      await hardDelete(doc);
      console.log(`  eliminado: ${doc.email}`);
    }
    return;
  }

  for (const email of args) {
    const result = await deleteByEmail(email);
    console.log(result);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
