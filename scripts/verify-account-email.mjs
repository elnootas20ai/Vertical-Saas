/**
 * Marca una cuenta como email verificada (o corrige el email) en CouchDB.
 *
 * Uso en el VPS:
 *   NODE_ENV=production node scripts/verify-account-email.mjs urielarnau4@gmail.com
 *   NODE_ENV=production node scripts/verify-account-email.mjs urielarnau4@admin.com --set-email urielarnau4@gmail.com
 */
import '../config/env.js';

const ACCOUNTS_DB = 'accounts';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  // Scripts en el host del VPS: "couchdb" no resuelve fuera de Docker.
  const hostOverride = String(process.env.COUCHDB_URL_HOST || '').trim();
  if (hostOverride) return hostOverride.replace(/\/+$/, '');
  try {
    const href = /^[a_zA-Z][a_zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    if (u.hostname === 'couchdb') {
      u.hostname = '127.0.0.1';
    }
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const couchUser = process.env['COUCHDB_' + 'USER'];
const couchPass = process.env.COUCHDB_PASSWORD;
const AUTH = couchUser && couchPass
  ? `Basic ${Buffer.from(`${couchUser}:${couchPass}`).toString('base64')}`
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

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const setEmailIdx = process.argv.indexOf('--set-email');
  const newEmail = setEmailIdx >= 0 ? norm(process.argv[setEmailIdx + 1]) : '';

  const lookup = norm(args[0]);
  if (!lookup) {
    console.error('Uso: node scripts/verify-account-email.mjs email@ejemplo.com [--set-email nuevo@email.com]');
    process.exit(1);
  }

  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_user o COUCHDB_PASSWORD');
    process.exit(1);
  }

  let doc = null;
  const found = await couchJson('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email: lookup },
    limit: 5,
  });
  doc = (found.docs || [])[0];

  if (!doc) {
    const all = await couchJson('GET', `/${ACCOUNTS_DB}/_all_docs?include_docs=true`);
    doc = (all.rows || [])
      .map((r) => r.doc)
      .find((d) => d?.type === 'account' && norm(d.email).includes('urielarnau4'));
  }

  if (!doc) {
    console.error(`No se encontró cuenta para ${lookup}`);
    process.exit(1);
  }

  const before = doc.email;
  if (newEmail && newEmail !== norm(doc.email)) {
    doc.email = newEmail;
  }
  doc.emailVerified = true;
  doc.emailVerificationTokenHash = null;
  doc.emailVerificationExpiry = null;
  doc.updatedAt = new Date().toISOString();

  await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`, doc);

  console.log(JSON.stringify({
    ok: true,
    emailBefore: before,
    emailNow: doc.email,
    user_id: doc.user_id,
    emailVerified: true,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
