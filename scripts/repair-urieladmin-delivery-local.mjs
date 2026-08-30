/**
 * LOCAL ONLY — alinea delivery de uriel@admin.com (empresa activa modomio)
 * con el mismo mínimo que Vertial Demo Delivery: marca + 1 PDV + almacén.
 *
 *   node scripts/repair-urieladmin-delivery-local.mjs --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

const APPLY = process.argv.includes('--apply');
const UID = '1e73c3f5-8be3-49a9-8b81-3e51e433dfac';
const BUSINESS_ID = 'ec241315-4209-47f9-b7f3-f8cf1695e2b0';
const BUSINESS_DOC_ID = `business:${BUSINESS_ID}`;
const KEEP_PDV = 'pdv-ac14f43f-23bf-4c8a-b2d3-743fa6f97be4'; // Badalona
const KEEP_WC = 'wc-b0f55ba7-4d63-496d-9c8d-abd4ecbdda29';
const DROP_PDV = 'pdv-b93b63a7-a7fe-45fa-95a9-8be689eed678'; // test1
const DROP_WC = 'wc-dbb84ac2-c833-47ea-a5c2-9e3b51b7e0e6';

const CATALOG_DB = 'urielsaas-catalog';
const DELIVERY_DB = 'urielsaas-delivery';
const SALES_POINTS_DB = 'urielsaas-sales-points';
const BUSINESSES_DB = 'businesses';

const BASE = String(process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/+$/, '');
const AUTH = `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`;

console.log('Couch', BASE, 'user', process.env.COUCHDB_USER);

async function couchJson(method, pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
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

async function putDoc(db, doc) {
  if (!APPLY) {
    console.log('  [dry] PUT', db, doc._id, doc.type || '', doc.name || '');
    return { ok: true, id: doc._id };
  }
  return couchJson('PUT', `/${db}/${encodeURIComponent(doc._id)}`, doc);
}

async function softDelete(db, id, now) {
  let doc;
  try {
    doc = await couchJson('GET', `/${db}/${encodeURIComponent(id)}`);
  } catch {
    console.log('  skip missing', db, id);
    return;
  }
  if (doc.deletedAt) {
    console.log('  already deleted', db, id);
    return;
  }
  await putDoc(db, { ...doc, deletedAt: now, active: false, updatedAt: now });
}

async function main() {
  console.log('MODE', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('Repair delivery URIELADMIN → business', BUSINESS_ID);
  const now = new Date().toISOString();

  // 1) Rename active business + ensure delivery type
  const biz = await couchJson('GET', `/${BUSINESSES_DB}/${encodeURIComponent(BUSINESS_DOC_ID)}`);
  const nextBiz = {
    ...biz,
    name: 'URIELADMIN',
    legalName: biz.legalName || 'URIELADMIN',
    businessType: 'delivery',
    email: biz.email || 'uriel@admin.com',
    updatedAt: now,
    deletedAt: null,
  };
  console.log('1) business', biz.name, '→', nextBiz.name);
  await putDoc(BUSINESSES_DB, nextBiz);

  // 2) Soft-delete junk PDV test1 (dejar 1 tienda como demo)
  console.log('2) soft-delete PDV/WC test1');
  await softDelete(DELIVERY_DB, DROP_PDV, now);
  await softDelete(SALES_POINTS_DB, DROP_WC, now);

  // 3) Ensure Badalona PDV + WC active
  console.log('3) ensure Badalona PDV/WC active');
  const pdv = await couchJson('GET', `/${DELIVERY_DB}/${encodeURIComponent(KEEP_PDV)}`);
  await putDoc(DELIVERY_DB, {
    ...pdv,
    name: 'URIELADMIN Tienda',
    active: true,
    deletedAt: null,
    business_id: BUSINESS_ID,
    businessId: BUSINESS_ID,
    user_id: UID,
    workCenterId: KEEP_WC,
    updatedAt: now,
    terminals: Array.isArray(pdv.terminals) && pdv.terminals.length
      ? pdv.terminals
      : [{ id: `term-${BUSINESS_ID.slice(0, 8)}`, name: 'Tablet', active: true }],
  });
  const wc = await couchJson('GET', `/${SALES_POINTS_DB}/${encodeURIComponent(KEEP_WC)}`);
  await putDoc(SALES_POINTS_DB, {
    ...wc,
    name: 'URIELADMIN Tienda',
    active: true,
    deletedAt: null,
    business_id: BUSINESS_ID,
    businessId: BUSINESS_ID,
    user_id: UID,
    updatedAt: now,
  });

  // 4) Brand (como demo foodgood)
  console.log('4) ensure default brand');
  const brandId = `brand-urieladmin-${BUSINESS_ID.slice(0, 8)}`;
  let existingBrand = null;
  try {
    existingBrand = await couchJson('GET', `/${CATALOG_DB}/${encodeURIComponent(brandId)}`);
  } catch {
    existingBrand = null;
  }
  const brandDoc = {
    _id: brandId,
    _rev: existingBrand?._rev,
    type: 'brand',
    id: brandId,
    business_id: BUSINESS_ID,
    user_id: UID,
    name: 'URIELADMIN',
    description: 'Línea delivery URIELADMIN',
    logo: '',
    website: '',
    primaryColor: '#2563EB',
    secondaryColor: '',
    shortCode: 'URI',
    salesPointIds: [KEEP_WC, KEEP_PDV],
    deliveryLineKind: 'pizza',
    catalogCategories: ['Pizzas', 'Entrantes', 'Postres', 'Bebidas'],
    isDefault: true,
    active: true,
    createdAt: existingBrand?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await putDoc(CATALOG_DB, brandDoc);

  // Soft-delete any other brands wrongly on this delivery business
  const allCat = await couchJson('GET', `/${CATALOG_DB}/_all_docs?include_docs=true&limit=200000`);
  const otherBrands = (allCat.rows || [])
    .map((r) => r.doc)
    .filter(
      (d) =>
        d
        && d.type === 'brand'
        && !d.deletedAt
        && String(d.business_id) === BUSINESS_ID
        && d._id !== brandId,
    );
  for (const b of otherBrands) {
    console.log('  soft-delete extra brand', b._id, b.name);
    await softDelete(CATALOG_DB, b._id, now);
  }

  // 5) Warehouse linked to PDV
  console.log('5) ensure warehouse');
  const whId = `wh-urieladmin-${BUSINESS_ID.slice(0, 8)}`;
  let existingWh = null;
  try {
    existingWh = await couchJson('GET', `/${CATALOG_DB}/${encodeURIComponent(whId)}`);
  } catch {
    existingWh = null;
  }
  const whDoc = {
    _id: whId,
    _rev: existingWh?._rev,
    type: 'warehouse',
    id: whId,
    user_id: UID,
    business_id: BUSINESS_ID,
    businessId: BUSINESS_ID,
    name: 'Almacén URIELADMIN Tienda',
    code: 'URI-ALM',
    address: '',
    isDefault: true,
    active: true,
    notes: '',
    contactPerson: '',
    phone: '',
    email: '',
    warehouseType: 'store',
    salesPointId: KEEP_PDV,
    createdAt: existingWh?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  };
  await putDoc(CATALOG_DB, whDoc);

  // 6) Delivery config clean + activation-ready
  console.log('6) delivery config');
  const cfgId = `dlvconf-${UID}`;
  const cfg = await couchJson('GET', `/${DELIVERY_DB}/${encodeURIComponent(cfgId)}`);
  await putDoc(DELIVERY_DB, {
    ...cfg,
    storeIngredients: [],
    tpvBrandIngredients: {},
    tpvBrandSupplements: {},
    hasKitchen: true,
    hasAssemblyStation: true,
    hasCashRegister: true,
    hasOwnDelivery: true,
    hasTakeaway: true,
    hasDineIn: true,
    activeChannels: cfg.activeChannels?.length
      ? cfg.activeChannels
      : ['direct', 'phone', 'web', 'app'],
    updatedAt: now,
  });

  // 7) Soft-delete other delivery businesses of this owner (ya borradas o basura)
  console.log('7) soft-delete other delivery businesses of account');
  const allBiz = await couchJson('GET', `/${BUSINESSES_DB}/_all_docs?include_docs=true&limit=5000`);
  const others = (allBiz.rows || [])
    .map((r) => r.doc)
    .filter(
      (d) =>
        d
        && d.type === 'business'
        && d.businessType === 'delivery'
        && d._id !== BUSINESS_DOC_ID
        && (String(d.owner_user_id) === UID || JSON.stringify(d).includes(UID))
        && !d.deletedAt,
    );
  for (const o of others) {
    console.log('  soft-delete business', o._id, o.name);
    await softDelete(BUSINESSES_DB, o._id, now);
  }

  console.log(APPLY ? 'DONE — recarga y entra en URIELADMIN (delivery).' : 'Dry-run OK. Pasa --apply para escribir.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
