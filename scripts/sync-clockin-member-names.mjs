/**
 * Sincroniza member_name en docs clockin con el nombre real de la cuenta.
 * Uso: node scripts/sync-clockin-member-names.mjs
 */
import '../config/env.js';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`;
const ACCOUNTS_DB = 'accounts';
const prefix = (process.env.VITE_COUCHDB_DB || 'vertial').toLowerCase();
const CLOCKINS_DB = `${prefix}-clockins`;

async function couch(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function displayName(account) {
  if (!account) return '';
  return String(
    account.fullName
    || [account.firstName, account.lastName].filter(Boolean).join(' ')
    || account.email
    || '',
  ).trim();
}

async function main() {
  const accountsResp = await couch('GET', `/${ACCOUNTS_DB}/_all_docs?include_docs=true`);
  const byUserId = new Map();
  for (const row of accountsResp.rows || []) {
    const doc = row.doc;
    if (doc?.type === 'account' && doc.user_id) {
      byUserId.set(doc.user_id, doc);
    }
  }

  const clkResp = await couch('GET', `/${CLOCKINS_DB}/_all_docs?include_docs=true`);
  let updated = 0;
  for (const row of clkResp.rows || []) {
    const doc = row.doc;
    if (doc?.type !== 'clockin' || doc.deletedAt) continue;
    const account = byUserId.get(doc.member_id);
    const name = displayName(account);
    if (!name || doc.member_name === name) continue;
    const next = { ...doc, member_name: name, updatedAt: new Date().toISOString() };
    const r = await couch('PUT', `/${CLOCKINS_DB}/${encodeURIComponent(doc._id)}`, next);
    if (r?.ok) {
      updated += 1;
      console.log(`✅ ${doc.date} · ${doc.member_name} → ${name}`);
    }
  }
  console.log(`Listo. ${updated} fichaje(s) actualizado(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
