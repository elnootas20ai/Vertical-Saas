/**
 * Elimina basura de registros de onboarding de prueba:
 * - Cuentas duplicadas/incompletas (por defecto urielarnau4@gmail.com)
 * - Empresas cuyo owner ya no tiene cuenta
 * - Tarjetas huérfanas (usuario borrado)
 *
 * Uso:
 *   node scripts/purge-onboarding-orphans.mjs           # dry-run
 *   node scripts/purge-onboarding-orphans.mjs --apply     # ejecutar
 *   node scripts/purge-onboarding-orphans.mjs --apply --email extra@test.com
 */
import '../config/env.js';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const CARDS_DB = 'cards';

const PROTECTED_EMAILS = new Set(
  [
    process.env.SAAS_LOGIN_EMAIL,
    'uriel@admin.com',
    'uriarnau8@gmail.com',
    'noreply@vertialapp.com',
    'admin@vertialapp.com',
    'trabajador@test.local',
    'prueba-trabajador@test.local',
    'prueba-empresa@test.local',
  ]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean),
);

const DEFAULT_DELETE_EMAILS = ['urielarnau4@gmail.com'];

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

function assertLocalhostOnly() {
  if (process.env.ALLOW_REMOTE_PURGE === '1') return;
  let host = '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(BASE) ? BASE : `http://${BASE}`;
    host = new URL(href).hostname.toLowerCase();
  } catch {
    host = '';
  }
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!local) {
    throw new Error(
      `Bloqueado: COUCHDB apunta a "${host || BASE}". Solo localhost permitido. ` +
        'Para remoto usa ALLOW_REMOTE_PURGE=1 explícitamente.',
    );
  }
}

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

async function allDocs(db) {
  const data = await couchJson('GET', `/${db}/_all_docs?include_docs=true`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function hardDelete(db, doc) {
  await couchJson('DELETE', `/${db}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`);
}

function norm(email) {
  return String(email || '').trim().toLowerCase();
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD en .env');
    process.exit(1);
  }

  assertLocalhostOnly();

  const apply = process.argv.includes('--apply');
  const extraEmails = process.argv
    .slice(2)
    .filter((a) => a !== '--apply')
    .map(norm)
    .filter(Boolean);
  const deleteEmails = new Set([...DEFAULT_DELETE_EMAILS.map(norm), ...extraEmails]);

  const accounts = (await allDocs(ACCOUNTS_DB)).filter((d) => d.type === 'account' && !d.deletedAt);
  const businesses = (await allDocs(BUSINESSES_DB)).filter((d) => d.type === 'business' && !d.deletedAt);
  const cards = (await allDocs(CARDS_DB)).filter((d) => !d.deletedAt);

  const accountsToDelete = accounts.filter((a) => {
    const email = norm(a.email);
    if (PROTECTED_EMAILS.has(email)) return false;
    return deleteEmails.has(email);
  });

  const survivingAccountIds = new Set(
    accounts.filter((a) => !accountsToDelete.some((d) => d._id === a._id)).map((a) => String(a.user_id || '').trim()),
  );

  const businessesToDelete = businesses.filter((b) => {
    const owner = String(b.owner_user_id || '').trim();
    return !survivingAccountIds.has(owner);
  });

  const cardsToDelete = cards.filter((c) => {
    const uid = String(c.userId || c.user_id || '').trim();
    return !survivingAccountIds.has(uid);
  });

  console.log(apply ? '=== APLICANDO LIMPIEZA ===' : '=== DRY-RUN (usa --apply para ejecutar) ===\n');

  console.log(`Cuentas a eliminar (${accountsToDelete.length}):`);
  for (const a of accountsToDelete) {
    console.log(`  - ${a.email} (${a.user_id})`);
  }

  console.log(`\nEmpresas huérfanas a eliminar (${businessesToDelete.length}):`);
  for (const b of businessesToDelete) {
    console.log(`  - ${b.name} (${b.business_id}) owner=${b.owner_user_id}`);
  }

  console.log(`\nTarjetas huérfanas a eliminar (${cardsToDelete.length}):`);
  for (const c of cardsToDelete) {
    console.log(`  - user ${c.userId || c.user_id} ···${c.lastFourDigits || '????'}`);
  }

  if (!apply) {
    console.log('\nNo se ha borrado nada. Ejecuta con --apply para confirmar.');
    return;
  }

  for (const doc of businessesToDelete) {
    await hardDelete(BUSINESSES_DB, doc);
    console.log(`✓ empresa eliminada: ${doc.name}`);
  }
  for (const doc of cardsToDelete) {
    await hardDelete(CARDS_DB, doc);
    console.log(`✓ tarjeta eliminada: ${doc.userId || doc.user_id}`);
  }
  for (const doc of accountsToDelete) {
    await hardDelete(ACCOUNTS_DB, doc);
    console.log(`✓ cuenta eliminada: ${doc.email}`);
  }

  console.log('\nLimpieza completada.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
