/**
 * Concede cupo de PDV y suscripción activa a una cuenta (superadmin / soporte).
 *
 * Uso:
 *   node scripts/grant-pdv-quota.mjs urielarnau4@gmail.com
 *   node scripts/grant-pdv-quota.mjs --search badalona
 *   node scripts/grant-pdv-quota.mjs email@test.com --total 4 --pro
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
  let total = 4;
  let pro = true;
  let planId = 'pro';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--search' && argv[i + 1]) {
      search = argv[++i];
    } else if (a === '--total' && argv[i + 1]) {
      total = Math.max(1, Math.min(99, Math.floor(Number(argv[++i]) || 4)));
    } else if (a === '--plan' && argv[i + 1]) {
      planId = String(argv[++i]).trim().toLowerCase() || 'pro';
    } else if (a === '--no-pro-access') {
      pro = false;
    } else if (!a.startsWith('--') && !email) {
      email = a;
    }
  }

  return { email, search, total, adminProAccess: pro, planId };
}

function planMeta(planId) {
  const map = {
    basic: { name: 'Básico', base: 1 },
    normal: { name: 'Normal', base: 1 },
    pro: { name: 'Pro', base: 2 },
  };
  return map[planId] || map.pro;
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD en .env');
    process.exit(1);
  }

  const { email, search, total, adminProAccess, planId } = parseArgs(process.argv.slice(2));
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
        console.log(`  ${h.email}  ${h.companyName || h.fullName || '—'}`);
      }
      process.exit(1);
    }
  } else {
    console.log(`Uso:
  node scripts/grant-pdv-quota.mjs EMAIL
  node scripts/grant-pdv-quota.mjs --search badalona
  node scripts/grant-pdv-quota.mjs EMAIL --total 4 --plan pro`);
    process.exit(0);
  }

  if (!target) {
    console.error('Cuenta no encontrada.');
    process.exit(1);
  }

  const meta = planMeta(planId);
  const extra = Math.max(0, total - meta.base);

  const sub = { ...(target.subscription || {}) };
  sub.selectedPlanId = planId;
  sub.planName = meta.name;
  sub.status = 'subscription_active';
  sub.extraPointOfSaleSlots = extra;
  sub.adminProAccess = adminProAccess;
  sub.moneiSubscriptionStatus = sub.moneiSubscriptionStatus || 'SKIPPED';
  if (!sub.lastPaymentAt) sub.lastPaymentAt = new Date().toISOString();

  const updated = await saveAccount({
    ...target,
    subscription: sub,
    updatedAt: new Date().toISOString(),
  });

  console.log('OK — cupo actualizado:');
  console.log(`  Email:     ${updated.email}`);
  console.log(`  Empresa:   ${updated.companyName || '—'}`);
  console.log(`  Plan:      ${meta.name} (${planId})`);
  console.log(`  Estado:    ${sub.status}`);
  console.log(`  PDV máx.:  ${total} (${meta.base} plan + ${extra} extra)`);
  console.log(`  PRO admin: ${adminProAccess ? 'sí' : 'no'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
