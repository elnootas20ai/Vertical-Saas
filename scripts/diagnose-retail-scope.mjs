/**
 * Diagnóstico completo tiendas / PDV / empresa en producción.
 * node scripts/diagnose-retail-scope.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const BASE = process.env.VERIFY_API_BASE || 'https://vertialapp.com';
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();
const COUCH_PREFIX = process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'BBDDsaas';
const WC_DB = `${COUCH_PREFIX}-sales-points`;

function readBid(wc) {
  return String(wc.businessId || wc.business_id || '').trim();
}

function isRetail(wc) {
  return !wc.deletedAt && (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen');
}

function filterWC(workCenters, businessId, accountN) {
  const bid = String(businessId || '').trim();
  const active = workCenters.filter((wc) => !wc.deletedAt);
  const mine = active.filter((wc) => readBid(wc) === bid);
  if (accountN === undefined) return mine;
  if (mine.length === 0) {
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
  return { status: res.status, data, ok: res.ok };
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
  if (!docsRes.ok) {
    console.error('FAIL couch docs:', docsRes.status, docsRes.data?.error);
    process.exit(1);
  }

  const allWcs = (docsRes.data?.docs || []).filter(
    (d) => d?.type === 'sales_point' && !d.deletedAt,
  );

  const pdvRes = await api(`/api/delivery/points-of-sale/${encodeURIComponent(user.user_id)}`, {
    token,
  });
  const pdvs = pdvRes.data?.pointsOfSale || pdvRes.data?.pointOfSales || [];

  console.log(`\n=== ${EMAIL} | user_id=${user.user_id} | empresas=${accountN} | WC DB=${WC_DB} ===\n`);

  console.log('--- TODAS las tiendas retail en CouchDB ---');
  const retail = allWcs.filter(isRetail);
  if (retail.length === 0) console.log('  (ninguna)');
  for (const wc of retail) {
    const bid = readBid(wc) || '(sin businessId)';
    const biz = businesses.find((b) => (b.business_id || b.id) === bid);
    const pdv = pdvs.find((p) => String(p.workCenterId || '') === wc._id);
    console.log(
      `  • ${wc.name} | wc=${wc._id.slice(0, 8)}… | businessId=${bid}${biz ? ` (${biz.name})` : ''} | user_id=${wc.user_id?.slice(0, 12)}… | PDV=${pdv ? pdv.name : 'NO'}`,
    );
  }

  console.log('\n--- Por empresa delivery (filtro actual) ---');
  for (const b of businesses) {
    if (b.businessType !== 'delivery') continue;
    const bid = b.business_id || b.id;
    const scoped = filterWC(allWcs, bid, accountN).filter(isRetail);
    console.log(`  ${scoped.length ? 'OK' : 'FAIL'}  «${b.name}» (${bid?.slice(0, 8)}…): ${scoped.length} tienda(s)`);
    for (const wc of scoped) {
      console.log(`       → ${wc.name} (${wc._id.slice(0, 8)}…)`);
    }
    if (scoped.length === 0) {
      const misTagged = retail.filter((wc) => {
        const wb = readBid(wc);
        return wb && wb !== bid;
      });
      const orphans = retail.filter((wc) => !readBid(wc));
      if (orphans.length) console.log(`       huérfanas: ${orphans.map((x) => x.name).join(', ')}`);
      if (misTagged.length)
        console.log(
          `       etiquetadas otra empresa: ${misTagged.map((x) => `${x.name}→${readBid(x).slice(0, 8)}`).join(', ')}`,
        );
    }
  }

  console.log('\n--- PDV delivery ---');
  for (const p of pdvs) {
    console.log(
      `  • ${p.name} | code=${p.code} | wc=${String(p.workCenterId || '').slice(0, 8) || '—'} | active=${p.active !== false}`,
    );
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
