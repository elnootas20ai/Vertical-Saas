/**
 * Repara tiendas: las 2 más antiguas → empresa que NO es Modomio; el resto → Modomio.
 * Así Modomio sigue con sus 4 y la otra empresa solo ve sus 2.
 *
 * Uso:
 *   node scripts/repair-store-business-ids.mjs
 *   node scripts/repair-store-business-ids.mjs --apply
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
const APPLY = process.argv.includes('--apply');
const MODOMIO_HINT = /modomio/i;
const KEEP_FOR_OTHER = 2;

function readBid(wc) {
  return String(wc.businessId || wc.business_id || '').trim();
}

function isRetail(wc) {
  return (
    !wc.deletedAt &&
    (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen')
  );
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

function dataUserId(user, business) {
  const selfId = String(user?.user_id || '').trim();
  const ownerId = String(business?.owner_user_id || '').trim();
  if (!ownerId || ownerId === selfId) return selfId;
  const members = business?.members || [];
  if (members.some((m) => String(m.user_id || '').trim() === selfId)) return ownerId;
  return selfId;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Faltan SAAS_LOGIN_EMAIL y SAAS_LOGIN_PASSWORD en .env');
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
  if (businesses.length < 2) {
    console.log(`Solo ${businesses.length} empresa(s) en la cuenta. No hace falta reparto multi-empresa.`);
    process.exit(0);
  }

  const modomio =
    businesses.find((b) => MODOMIO_HINT.test(String(b.name || ''))) ||
    businesses.find((b) => MODOMIO_HINT.test(String(b.slug || '')));
  const other = businesses.find((b) => b !== modomio);

  if (!modomio || !other) {
    console.error('No se encontraron las dos empresas (Modomio + otra). Negocios:', businesses.map((b) => b.name));
    process.exit(1);
  }

  const modomioId = String(modomio.business_id || modomio.id || '').trim();
  const otherId = String(other.business_id || other.id || '').trim();
  const uid = dataUserId(user, modomio);

  await api(`/api/couch/db/${encodeURIComponent(WC_DB)}`, { method: 'PUT', token }).catch(() => null);
  const docsRes = await api(`/api/couch/docs/${encodeURIComponent(WC_DB)}`, { token });
  const docs = (docsRes.data?.docs || []).filter(
    (d) => d?.type === 'sales_point' && String(d.user_id || '') === uid,
  );

  const retail = docs
    .filter(isRetail)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  const forOther = retail.slice(0, KEEP_FOR_OTHER);
  const forModomio = retail.slice(KEEP_FOR_OTHER);

  console.log(`\nEmpresa Modomio: ${modomio.name} (${modomioId})`);
  console.log(`Otra empresa:   ${other.name} (${otherId})`);
  console.log(`Tiendas retail en cuenta: ${retail.length}\n`);

  console.log(`→ ${forOther.length} tienda(s) para "${other.name}" (las más antiguas):`);
  for (const wc of forOther) {
    console.log(`   · ${wc.name} (${wc._id}) [actual: ${readBid(wc) || 'sin empresa'}]`);
  }

  console.log(`→ ${forModomio.length} tienda(s) para "${modomio.name}":`);
  for (const wc of forModomio) {
    console.log(`   · ${wc.name} (${wc._id}) [actual: ${readBid(wc) || 'sin empresa'}]`);
  }

  if (!APPLY) {
    console.log('\nSimulación. Para guardar en CouchDB: node scripts/repair-store-business-ids.mjs --apply\n');
    process.exit(0);
  }

  let updated = 0;
  for (const wc of forOther) {
    const targetId = otherId;
    if (readBid(wc) === targetId) continue;
    const body = {
      ...wc,
      businessId: targetId,
      business_id: targetId,
      updatedAt: new Date().toISOString(),
    };
    const put = await api(`/api/couch/doc/${encodeURIComponent(WC_DB)}/${encodeURIComponent(wc._id)}`, {
      method: 'PUT',
      token,
      body,
    });
    if (put.status === 200 || put.status === 201) {
      updated += 1;
      console.log(`OK  ${wc.name} → ${other.name}`);
    } else {
      console.error(`FAIL ${wc.name}:`, put.data?.error || put.status);
    }
  }

  for (const wc of forModomio) {
    const targetId = modomioId;
    if (readBid(wc) === targetId) continue;
    const body = {
      ...wc,
      businessId: targetId,
      business_id: targetId,
      updatedAt: new Date().toISOString(),
    };
    const put = await api(`/api/couch/doc/${encodeURIComponent(WC_DB)}/${encodeURIComponent(wc._id)}`, {
      method: 'PUT',
      token,
      body,
    });
    if (put.status === 200 || put.status === 201) {
      updated += 1;
      console.log(`OK  ${wc.name} → ${modomio.name}`);
    } else {
      console.error(`FAIL ${wc.name}:`, put.data?.error || put.status);
    }
  }

  console.log(`\nListo: ${updated} tienda(s) actualizadas. Recarga la app (Ctrl+F5).\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
