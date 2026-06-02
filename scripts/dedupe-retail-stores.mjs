/**
 * Elimina duplicados: 1 tienda retail por nombre y empresa; 1 PDV activo por workCenterId.
 *
 * Uso:
 *   node scripts/dedupe-retail-stores.mjs
 *   node scripts/dedupe-retail-stores.mjs --apply
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

function readBid(wc) {
  return String(wc.businessId || wc.business_id || '').trim();
}

function isRetail(wc) {
  return (
    !wc.deletedAt &&
    (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen')
  );
}

function normName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
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

function pickKeeper(group) {
  return [...group].sort((a, b) => {
    const ta = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (ta !== 0) return ta;
    return String(a._id || '').localeCompare(String(b._id || ''));
  })[0];
}

function dedupePdvs(pdvs) {
  const byWc = new Map();
  const dupes = [];
  for (const p of pdvs.filter((x) => x.active !== false)) {
    const wcId = String(p.workCenterId || '').trim();
    if (!wcId) continue;
    const prev = byWc.get(wcId);
    if (!prev) {
      byWc.set(wcId, p);
      continue;
    }
    const newer =
      String(p.updatedAt || p.createdAt || '') >= String(prev.updatedAt || prev.createdAt || '')
        ? p
        : prev;
    const older = newer === p ? prev : p;
    byWc.set(wcId, newer);
    dupes.push(older);
  }
  return { keep: [...byWc.values()], dupes };
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
  const modomio =
    businesses.find((b) => /modomio/i.test(String(b.name || ''))) || businesses[0];
  const uid = dataUserId(user, modomio);

  await api(`/api/couch/db/${encodeURIComponent(WC_DB)}`, { method: 'PUT', token }).catch(() => null);
  const docsRes = await api(`/api/couch/docs/${encodeURIComponent(WC_DB)}`, { token });
  const docs = (docsRes.data?.docs || []).filter(
    (d) => d?.type === 'sales_point' && String(d.user_id || '') === uid,
  );

  const retail = docs.filter(isRetail);
  const byKey = new Map();
  for (const wc of retail) {
    const key = `${readBid(wc) || '_legacy'}::${normName(wc.name) || wc._id}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(wc);
  }

  const wcToSoftDelete = [];
  for (const [key, group] of byKey) {
    if (group.length <= 1) continue;
    const keeper = pickKeeper(group);
    for (const wc of group) {
      if (wc._id !== keeper._id) wcToSoftDelete.push({ wc, key, keeperId: keeper._id });
    }
  }

  const pdvRes = await api(`/api/delivery/points-of-sale/${encodeURIComponent(uid)}`, { token });
  const pdvs = pdvRes.data?.pointsOfSale || pdvRes.data || [];
  const { dupes: pdvDupes } = dedupePdvs(Array.isArray(pdvs) ? pdvs : []);

  console.log(`\nCuenta: ${EMAIL}`);
  console.log(`Tiendas retail: ${retail.length}`);
  console.log(`Grupos con nombre duplicado: ${[...byKey.values()].filter((g) => g.length > 1).length}`);
  console.log(`Tiendas a archivar (soft-delete): ${wcToSoftDelete.length}`);
  console.log(`PDV duplicados por workCenterId: ${pdvDupes.length}\n`);

  for (const { wc, key, keeperId } of wcToSoftDelete) {
    console.log(`  WC  archivar «${wc.name}» (${wc._id}) → conservar ${keeperId} [${key}]`);
  }
  for (const p of pdvDupes) {
    console.log(`  PDV desactivar ${p.name} (${p._id}) wc=${p.workCenterId}`);
  }

  if (!APPLY) {
    console.log('\nSimulación. Para aplicar: node scripts/dedupe-retail-stores.mjs --apply\n');
    process.exit(0);
  }

  const now = new Date().toISOString();
  let wcDone = 0;
  for (const { wc } of wcToSoftDelete) {
    const body = {
      ...wc,
      active: false,
      deletedAt: now,
      updatedAt: now,
    };
    const put = await api(`/api/couch/doc/${encodeURIComponent(WC_DB)}/${encodeURIComponent(wc._id)}`, {
      method: 'PUT',
      token,
      body,
    });
    if (put.status === 200 || put.status === 201) {
      wcDone += 1;
      console.log(`OK  archivada tienda ${wc.name}`);
    } else {
      console.error(`FAIL ${wc.name}:`, put.data?.error || put.status);
    }
  }

  let pdvDone = 0;
  for (const p of pdvDupes) {
    const del = await api(
      `/api/delivery/points-of-sale/${encodeURIComponent(uid)}/${encodeURIComponent(p._id)}`,
      { method: 'DELETE', token },
    );
    if (del.status === 200 || del.status === 204) {
      pdvDone += 1;
      console.log(`OK  PDV eliminado ${p.name}`);
    } else {
      const put = await api(
        `/api/delivery/points-of-sale/${encodeURIComponent(uid)}/${encodeURIComponent(p._id)}`,
        {
          method: 'PUT',
          token,
          body: { pointOfSale: { ...p, active: false } },
        },
      );
      if (put.status === 200) {
        pdvDone += 1;
        console.log(`OK  PDV desactivado ${p.name}`);
      } else {
        console.error(`FAIL PDV ${p._id}:`, del.data?.error || put.data?.error || del.status);
      }
    }
  }

  console.log(`\nListo: ${wcDone} tienda(s) archivadas, ${pdvDone} PDV(s) limpiados. Recarga la app (Ctrl+F5).\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
