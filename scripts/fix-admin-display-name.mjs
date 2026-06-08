/**
 * Fija nombre visible del admin uriel@admin.com en accounts + members de empresas.
 * Uso: node scripts/fix-admin-display-name.mjs
 */
import '../config/env.js';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const ADMIN_EMAIL = String(process.env.SAAS_LOGIN_EMAIL || 'uriel@admin.com').trim().toLowerCase();
const DISPLAY_NAME = String(process.env.SAAS_LOGIN_FIRST_NAME || 'Uriel').trim();

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
const AUTH = `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`;

async function couch(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  if (!BASE || !process.env.COUCHDB_USER) {
    console.error('Falta COUCHDB_URL / credenciales');
    process.exit(1);
  }

  const found = await couch('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email: ADMIN_EMAIL },
    limit: 1,
  });
  const account = found?.docs?.[0];
  if (!account) {
    console.error(`No hay cuenta ${ADMIN_EMAIL}`);
    process.exit(1);
  }

  const userId = account.user_id;
  const updatedAccount = {
    ...account,
    firstName: DISPLAY_NAME,
    lastName: '',
    fullName: DISPLAY_NAME,
    updatedAt: new Date().toISOString(),
  };
  const accRes = await couch('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(account._id)}`, updatedAccount);
  if (!accRes?.ok) {
    console.error('Error actualizando account:', accRes);
    process.exit(1);
  }
  console.log(`✅ Cuenta ${ADMIN_EMAIL} → "${DISPLAY_NAME}"`);

  const bizAll = await couch('GET', `/${BUSINESSES_DB}/_all_docs?include_docs=true`);
  let bizUpdated = 0;
  for (const row of bizAll.rows || []) {
    const doc = row.doc;
    if (!doc || doc.type !== 'business' || doc.deletedAt) continue;
    let changed = false;
    if (doc.owner_user_id === userId) changed = true;
    const members = Array.isArray(doc.members) ? [...doc.members] : [];
    for (let i = 0; i < members.length; i++) {
      if (members[i]?.user_id === userId) {
        members[i] = { ...members[i], fullName: DISPLAY_NAME };
        changed = true;
      }
    }
    if (doc.owner_user_id === userId && !members.some((m) => m.user_id === userId)) {
      members.unshift({
        user_id: userId,
        fullName: DISPLAY_NAME,
        email: ADMIN_EMAIL,
        role: 'Admin',
        joinedAt: doc.createdAt || new Date().toISOString(),
      });
      changed = true;
    }
    if (!changed) continue;
    const next = {
      ...doc,
      members,
      updatedAt: new Date().toISOString(),
    };
    const r = await couch('PUT', `/${BUSINESSES_DB}/${encodeURIComponent(doc._id)}`, next);
    if (r?.ok) {
      bizUpdated += 1;
      console.log(`✅ Empresa "${doc.name}" actualizada`);
    }
  }

  console.log(`Listo. ${bizUpdated} empresa(s) tocada(s). Recarga Fichajes en el navegador.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
