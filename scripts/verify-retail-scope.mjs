/**
 * Verifica carga de tiendas por empresa (misma lógica que retailScopeLoader + filter).
 *
 * Uso: node scripts/verify-retail-scope.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const BASE = process.env.VERIFY_API_BASE || 'http://127.0.0.1:3001';
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
const COUCH_PREFIX = process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial';
const WC_DB = `${COUCH_PREFIX}-sales-points`;

function readBid(wc) {
  return String(wc.businessId || wc.business_id || '').trim();
}

function isRetail(wc) {
  return (
    !wc.deletedAt &&
    (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen')
  );
}

function filterWC(workCenters, businessId, accountN) {
  const bid = String(businessId || '').trim();
  const active = workCenters.filter((wc) => !wc.deletedAt);
  const mine = active.filter((wc) => readBid(wc) === bid);
  const mineRetail = mine.filter(isRetail);
  if (accountN === undefined) return mine;
  if (mineRetail.length === 0) {
    const legacy = active.filter((wc) => !readBid(wc) && isRetail(wc));
    const merged = new Map();
    for (const wc of [...mine, ...legacy]) merged.set(wc._id, wc);
    return [...merged.values()];
  }
  return mine;
}

async function api(route, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Faltan SAAS_LOGIN_EMAIL / SAAS_LOGIN_PASSWORD');
    process.exit(1);
  }

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.accessToken;
  const user = login.data?.user;
  if (!token || !user?.user_id) {
    console.error('Login fallido:', login.data?.error || login.status);
    process.exit(1);
  }

  const bizRes = await api(`/api/businesses/user/${encodeURIComponent(user.user_id)}`, { token });
  const businesses = bizRes.data?.businesses || [];
  const accountN = businesses.length;

  await api(`/api/couch/db/${encodeURIComponent(WC_DB)}`, { method: 'PUT', token }).catch(() => null);
  const docsRes = await api(`/api/couch/docs/${encodeURIComponent(WC_DB)}`, { token });
  const allWcs = (docsRes.data?.docs || []).filter(
    (d) => d?.type === 'sales_point' && String(d.user_id || '') === user.user_id,
  );

  let failed = false;
  console.log(`\nCuenta: ${EMAIL} | empresas: ${accountN} | WC DB: ${WC_DB}\n`);

  for (const b of businesses) {
    if (b.businessType !== 'delivery') continue;
    const bid = b.business_id || b.id;
    const scoped = filterWC(allWcs, bid, accountN).filter(isRetail);
    const ok = scoped.length > 0;
    console.log(`${ok ? 'OK' : 'FAIL'}  ${b.name}: ${scoped.length} tienda(s) → ${scoped.map((x) => x.name).join(', ') || '(ninguna)'}`);
    if (!ok) failed = true;
  }

  console.log(failed ? '\nHay empresas delivery sin tiendas visibles.\n' : '\nTodas las empresas delivery tienen tiendas en scope.\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
