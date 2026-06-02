/**
 * Reactiva una cuenta suspendida en CouchDB (soporte / producción).
 *
 * Uso:
 *   node scripts/reactivate-account.mjs --search modomio
 *   node scripts/reactivate-account.mjs email@empresa.com
 */
import '../config/env.js';

const ACCOUNTS_DB = 'accounts';

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

async function saveAccount(doc) {
  const res = await couchJson('PUT', `/${ACCOUNTS_DB}/${encodeURIComponent(doc._id)}`, doc);
  return { ...doc, _rev: res.rev };
}

function parseArgs(argv) {
  let email = '';
  let search = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--search' && argv[i + 1]) {
      search = argv[++i];
    } else if (!a.startsWith('--') && !email) {
      email = a;
    }
  }
  return { email, search };
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD en .env');
    process.exit(1);
  }

  const { email, search } = parseArgs(process.argv.slice(2));
  const accounts = await listAccounts();

  let target = null;
  if (email) {
    target = accounts.find((a) => norm(a.email) === norm(email)) || null;
  } else if (search) {
    const q = search.toLowerCase();
    const hits = accounts.filter(
      (a) =>
        String(a.companyName || '').toLowerCase().includes(q) ||
        String(a.fullName || '').toLowerCase().includes(q) ||
        norm(a.email).includes(q),
    );
    if (hits.length === 1) target = hits[0];
    else if (hits.length > 1) {
      console.log('Varias cuentas coinciden; indica el email:');
      for (const h of hits) {
        console.log(`  ${h.email}  ${h.companyName || h.fullName || '—'}  status=${h.subscription?.status || '—'}`);
      }
      process.exit(1);
    }
  } else {
    console.log(`Uso:
  node scripts/reactivate-account.mjs --search modomio
  node scripts/reactivate-account.mjs email@empresa.com`);
    process.exit(0);
  }

  if (!target) {
    console.error('Cuenta no encontrada.');
    process.exit(1);
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const graceEnd = new Date(periodEnd);
  graceEnd.setDate(graceEnd.getDate() + 7);

  const sub = { ...(target.subscription || {}) };
  const previous = sub.status || '—';
  sub.status = 'subscription_active';
  sub.billingExempt = true;
  sub.currentPeriodEnd = periodEnd.toISOString();
  sub.gracePeriodEndsAt = graceEnd.toISOString();

  const updated = await saveAccount({
    ...target,
    subscription: sub,
    updatedAt: now.toISOString(),
  });

  console.log('OK — cuenta reactivada:');
  console.log(`  Email:     ${updated.email}`);
  console.log(`  Empresa:   ${updated.companyName || '—'}`);
  console.log(`  Estado:    ${previous} → ${sub.status}`);
  console.log(`  Exento:    billingExempt=true`);
  console.log(`  Fin mes:   ${sub.currentPeriodEnd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
