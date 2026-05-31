/**
 * Verificación E2E de persistencia (local): login → negocios → tienda → PDV → lectura CouchDB.
 * Uso: node scripts/verify-save-flow.mjs
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
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
const TAG = `[verify-save ${new Date().toISOString()}]`;

const outcomes = [];

function ok(step, detail = '') {
  outcomes.push({ step, ok: true, detail });
  console.log(`OK  ${step}${detail ? ` — ${detail}` : ''}`);
}

function bad(step, detail = '') {
  outcomes.push({ step, ok: false, detail });
  console.error(`FAIL ${step}${detail ? ` — ${detail}` : ''}`);
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
  console.log(`${TAG} API ${BASE} · Couch prefix ${COUCH_PREFIX}`);

  if (!EMAIL || !PASSWORD) {
    bad('config', 'Faltan SAAS_LOGIN_EMAIL / SAAS_LOGIN_PASSWORD en .env.development');
    process.exit(1);
  }

  const health = await api('/health');
  if (!health.data?.ok) {
    bad('health', `Backend no responde (${health.status})`);
    process.exit(1);
  }
  ok('health', `CouchDB ${health.data?.checks?.couchdb?.ok ? 'OK' : '?'}`);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.accessToken;
  const user = login.data?.user;
  if (!token || !user?.user_id) {
    bad('login', login.data?.error || `status ${login.status}`);
    process.exit(1);
  }
  ok('login', user.email || user.user_id);

  const bizRes = await api(`/api/businesses/user/${encodeURIComponent(user.user_id)}`, { token });
  const businesses = bizRes.data?.businesses || [];
  if (!Array.isArray(businesses) || businesses.length === 0) {
    bad('list-businesses', 'Sin negocios en la cuenta de prueba');
    process.exit(1);
  }
  ok('list-businesses', `${businesses.length} negocio(s)`);

  const business =
    businesses.find((b) => b.businessType === 'delivery') ||
    businesses.find((b) => String(b.businessType || '').includes('delivery')) ||
    businesses[0];
  const businessId = String(business.business_id || business.id || '');
  const uid = dataUserId(user, business);
  ok('pick-business', `${business.name || businessId} (${business.businessType || '?'}) · dataUserId=${uid}`);

  const wcId = `wc-verify-${randomUUID()}`;
  const wcName = `${TAG} Tienda prueba`;
  const now = new Date().toISOString();
  const wcDoc = {
    _id: wcId,
    id: wcId,
    type: 'sales_point',
    user_id: uid,
    businessId: businessId || undefined,
    name: wcName,
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    address: 'Calle Verificación Persistencia 123',
    city: 'Madrid',
    active: true,
    expectedStaffCount: 3,
    createdAt: now,
    updatedAt: now,
  };

  await api(`/api/couch/db/${encodeURIComponent(WC_DB)}`, { method: 'PUT', token }).catch(() => null);

  const createWc = await api(`/api/couch/doc/${encodeURIComponent(WC_DB)}/${encodeURIComponent(wcId)}`, {
    method: 'PUT',
    token,
    body: wcDoc,
  });
  if (createWc.status !== 200 && createWc.status !== 201) {
    bad('create-work-center', createWc.data?.error || `HTTP ${createWc.status}`);
  } else {
    ok('create-work-center', wcId);
  }

  const readWc = await api(`/api/couch/doc/${encodeURIComponent(WC_DB)}/${encodeURIComponent(wcId)}`, { token });
  const readName = readWc.data?.name || readWc.data?.doc?.name;
  if (readName === wcName) {
    ok('read-work-center', 'Nombre coincide tras PUT');
  } else {
    bad('read-work-center', `Esperado "${wcName}", leído "${readName || '?'}"`);
  }

  const pdvPayload = {
    pointOfSale: {
      name: wcName,
      code: `V${Date.now().toString(36).slice(-4).toUpperCase()}`,
      workCenterId: wcId,
      businessId: businessId || undefined,
      active: true,
      address: wcDoc.address,
      preserveDisplayName: true,
    },
  };
  const createPdv = await api(`/api/delivery/points-of-sale/${encodeURIComponent(uid)}`, {
    method: 'POST',
    token,
    body: pdvPayload,
  });
  const pdv = createPdv.data?.pointOfSale;
  if (!pdv?._id) {
    bad('create-pdv', createPdv.data?.error || `HTTP ${createPdv.status}`);
  } else {
    ok('create-pdv', `${pdv._id} (${pdv.code})`);
  }

  const listPdv = await api(`/api/delivery/points-of-sale/${encodeURIComponent(uid)}`, { token });
  const pdvs = listPdv.data?.pointsOfSale || [];
  const foundPdv = pdvs.find((p) => p._id === pdv?._id || p.workCenterId === wcId);
  if (foundPdv) {
    ok('list-pdv', `PDV visible en listado (${pdvs.length} total)`);
  } else {
    bad('list-pdv', `No aparece el PDV recién creado (${pdvs.length} en lista)`);
  }

  const noteSuffix = ` · ${TAG}`;
  const prevPhone = business.phone || '';
  const newPhone = `${prevPhone}${noteSuffix}`.slice(0, 40);
  const updateBiz = await api(`/api/businesses/${encodeURIComponent(businessId)}`, {
    method: 'PUT',
    token,
    body: { phone: newPhone },
  });
  if (updateBiz.data?.business?.phone === newPhone || updateBiz.data?.ok) {
    ok('update-business', 'Teléfono actualizado');
    const readBiz = await api(`/api/businesses/${encodeURIComponent(businessId)}`, { token });
    const phoneBack = readBiz.data?.business?.phone;
    if (phoneBack === newPhone) {
      ok('read-business', 'Teléfono persiste tras GET');
    } else {
      bad('read-business', `GET devolvió phone="${phoneBack || '?'}"`);
    }
    await api(`/api/businesses/${encodeURIComponent(businessId)}`, {
      method: 'PUT',
      token,
      body: { phone: prevPhone },
    });
    ok('cleanup-business', 'Teléfono restaurado');
  } else {
    bad('update-business', updateBiz.data?.error || `HTTP ${updateBiz.status}`);
  }

  if (pdv?._id) {
    const delPdv = await api(
      `/api/delivery/points-of-sale/${encodeURIComponent(uid)}/${encodeURIComponent(pdv._id)}`,
      { method: 'DELETE', token },
    );
    if (delPdv.status === 200 || delPdv.data?.ok) {
      ok('cleanup-pdv', pdv._id);
    } else {
      bad('cleanup-pdv', delPdv.data?.error || `HTTP ${delPdv.status}`);
    }
  }

  const readWcRev = readWc.data?._rev || readWc.data?.doc?._rev;
  if (readWcRev) {
    const delWc = await api(`/api/couch/doc/${encodeURIComponent(WC_DB)}/${encodeURIComponent(wcId)}`, {
      method: 'DELETE',
      token,
      body: { _rev: readWcRev },
    });
    if (delWc.status === 200 || delWc.data?.ok) {
      ok('cleanup-work-center', wcId);
    } else {
      bad('cleanup-work-center', delWc.data?.error || `HTTP ${delWc.status}`);
    }
  }

  const itemName = `Producto verify ${Date.now()}`;
  const createItem = await api(`/api/delivery/catalog/${encodeURIComponent(uid)}`, {
    method: 'POST',
    token,
    body: { item: { name: itemName, unitPrice: 9.99, active: true, brandIds: [] } },
  });
  const catalogItem = createItem.data?.item || createItem.data?.catalogItem;
  if (catalogItem?._id) {
    ok('create-catalog', catalogItem._id);
    const listCat = await api(`/api/delivery/catalog/${encodeURIComponent(uid)}`, { token });
    const items = listCat.data?.items || listCat.data?.catalogItems || [];
    if (items.some((i) => i._id === catalogItem._id || i.name === itemName)) {
      ok('read-catalog', `${items.length} productos en catálogo`);
    } else {
      bad('read-catalog', 'Producto no aparece en listado');
    }
    await api(
      `/api/delivery/catalog/${encodeURIComponent(uid)}/${encodeURIComponent(catalogItem._id)}`,
      { method: 'DELETE', token },
    );
    ok('cleanup-catalog', catalogItem._id);
  } else {
    bad('create-catalog', createItem.data?.error || `HTTP ${createItem.status}`);
  }

  const brandName = `Marca verify ${Date.now()}`;
  const createBrand = await api(`/api/brands/${encodeURIComponent(businessId)}`, {
    method: 'POST',
    token,
    body: { brand: { name: brandName, active: true } },
  });
  const brand = createBrand.data?.brand;
  if (brand?._id) {
    ok('create-brand', brand._id);
    const listBrands = await api(`/api/brands/${encodeURIComponent(businessId)}`, { token });
    const brands = listBrands.data?.brands || [];
    if (brands.some((b) => b._id === brand._id)) {
      ok('read-brand', `${brands.length} marca(s)`);
    } else {
      bad('read-brand', 'Marca no aparece en listado');
    }
    await api(`/api/brands/${encodeURIComponent(businessId)}/${encodeURIComponent(brand._id)}`, {
      method: 'DELETE',
      token,
    });
    ok('cleanup-brand', brand._id);
  } else {
    bad('create-brand', createBrand.data?.error || `HTTP ${createBrand.status}`);
  }

  const failed = outcomes.filter((o) => !o.ok);
  console.log('\n--- Resumen ---');
  console.log(`Pasaron: ${outcomes.length - failed.length}/${outcomes.length}`);
  if (failed.length) {
    console.log('Fallos:');
    for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
    process.exit(1);
  }
  console.log('Persistencia local verificada: tienda, PDV, negocio, catálogo y marca guardan y leen bien.');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
