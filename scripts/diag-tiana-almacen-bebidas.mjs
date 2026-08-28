#!/usr/bin/env node
/**
 * SOLO LECTURA — Almacén Tiana: bebidas / stock por warehouse.
 * Por qué al cambiar de tienda «no se ven» productos.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const COUCH = (process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/$/, '');
const USER = process.env.COUCHDB_USER || process.env.COUCH_USER || 'admin';
const PASS = process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || '';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const TIANA_PDV = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';
const BADALONA_PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';

const BEBIDA_RE =
  /bebida|refresco|agua|coca|fanta|sprite|cerveza|vino|nestea|aquarius|mahou|estrella|moretti|peroni|amstel|desperados|zumo|tonica|schweppes|red\s*bull|monster|cafe|café/i;

async function couch(p, init) {
  const res = await fetch(`${COUCH}${p}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function allDocs(db) {
  const { ok, status, data } = await couch(
    `/${encodeURIComponent(db)}/_all_docs?include_docs=true`,
  );
  if (!ok) {
    console.log('FAIL all_docs', db, status, data.error || data.reason);
    return [];
  }
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function qtyForWh(item, warehouseId) {
  const wh = String(warehouseId || '').trim();
  if (!wh) return Number(item.stockQuantity || 0) || 0;
  const rows = Array.isArray(item.warehouseStock) ? item.warehouseStock : [];
  const hit = rows.find((r) => String(r?.warehouseId || '').trim() === wh);
  if (hit) return Number(hit.quantity || 0) || 0;
  // Sin fila de warehouse: algunos UIs muestran 0 en tienda (no el stockQuantity global)
  return 0;
}

function isStockish(d) {
  if (!d || d.type !== 'catalog_item') return false;
  if (d.module === 'stock' || d.isStockItem === true) return true;
  const sc = String(d.stockCategory || '');
  return ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable'].includes(sc);
}

function isBebida(d) {
  const sc = String(d.stockCategory || '').toLowerCase();
  const cat = String(d.category || '').toLowerCase();
  const name = String(d.name || '');
  if (sc === 'beverage' || /bebida/.test(cat)) return true;
  return BEBIDA_RE.test(name) || BEBIDA_RE.test(cat);
}

function summarizeItem(d, tianaWh, badWh) {
  const rows = Array.isArray(d.warehouseStock) ? d.warehouseStock : [];
  return {
    id: d._id,
    name: d.name,
    module: d.module,
    stockCategory: d.stockCategory || '',
    category: d.category || '',
    active: d.active !== false,
    deletedAt: d.deletedAt || null,
    business_id: bid(d) || '(sin)',
    stockQuantity: Number(d.stockQuantity || 0) || 0,
    tianaQty: qtyForWh(d, tianaWh),
    badalonaQty: qtyForWh(d, badWh),
    whRows: rows.length,
    whIds: rows.map((r) => String(r?.warehouseId || '').slice(0, 12)).slice(0, 6),
    updatedAt: d.updatedAt || d.createdAt || '',
  };
}

const catalogDb = process.env.VITE_CATALOG_DB || process.env.CATALOG_DB || 'bbddsaas-catalog';
const deliveryDb = process.env.VITE_DELIVERY_DB || process.env.DELIVERY_DB || 'bbddsaas-delivery';

console.log('=== DIAG TIANA ALMACÉN / BEBIDAS (solo lectura) ===');
console.log({ COUCH, catalogDb, deliveryDb, user: USER });

const [catalogDocs, deliveryDocs] = await Promise.all([
  allDocs(catalogDb),
  allDocs(deliveryDb),
]);

const pdvs = deliveryDocs.filter(
  (d) =>
    d.type === 'point_of_sale'
    && !d.deletedAt
    && (String(d.user_id || '') === PAU || /tiana|badalona/i.test(String(d.name || ''))),
);
console.log('\n--- PDVs Pau / Tiana-Badalona ---');
for (const p of pdvs) {
  console.log({
    id: p._id,
    name: p.name,
    code: p.code,
    active: p.active !== false,
    businessId: bid(p),
    workCenterId: p.workCenterId || '',
  });
}

const warehouses = catalogDocs.filter(
  (d) =>
    d.type === 'warehouse'
    && !d.deletedAt
    && (String(d.user_id || '') === PAU
      || /tiana|badalona|almacén|almacen/i.test(String(d.name || ''))),
);
console.log('\n--- Warehouses ---');
for (const w of warehouses) {
  console.log({
    id: w._id,
    name: w.name,
    salesPointId: w.salesPointId || '',
    warehouseType: w.warehouseType || '',
    active: w.active !== false,
    isDefault: Boolean(w.isDefault),
    business_id: bid(w) || '(sin)',
  });
}

const tianaWh =
  warehouses.find((w) => String(w.salesPointId || '') === TIANA_PDV)?._id
  || warehouses.find((w) => /tiana/i.test(String(w.name || '')))?._id
  || '';
const badWh =
  warehouses.find((w) => String(w.salesPointId || '') === BADALONA_PDV)?._id
  || warehouses.find((w) => /badalona/i.test(String(w.name || '')))?._id
  || '';

console.log('\nResolved warehouses:', { tianaWh, badWh });

const pauCatalog = catalogDocs.filter(
  (d) => d.type === 'catalog_item' && String(d.user_id || '') === PAU,
);

const live = pauCatalog.filter((d) => !d.deletedAt && d.active !== false);
const deleted = pauCatalog.filter((d) => d.deletedAt);
const stockLive = live.filter(isStockish);
const stockDeleted = deleted.filter(isStockish);
const bebidasLive = stockLive.filter(isBebida);
const bebidasDeleted = stockDeleted.filter(isBebida);

const recentlyDeleted = [...stockDeleted]
  .sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')))
  .slice(0, 25)
  .map((d) => ({
    id: d._id,
    name: d.name,
    deletedAt: d.deletedAt,
    module: d.module,
    stockCategory: d.stockCategory,
    isBebida: isBebida(d),
  }));

console.log('\n--- Totales catálogo Pau ---');
console.log({
  catalogItems: pauCatalog.length,
  live: live.length,
  deleted: deleted.length,
  stockLive: stockLive.length,
  stockDeleted: stockDeleted.length,
  bebidasLive: bebidasLive.length,
  bebidasDeleted: bebidasDeleted.length,
});

const tianaVisibleQty = bebidasLive.filter((d) => qtyForWh(d, tianaWh) > 0);
const tianaZeroQty = bebidasLive.filter((d) => qtyForWh(d, tianaWh) <= 0);
const tianaNoWhRow = bebidasLive.filter((d) => {
  const rows = Array.isArray(d.warehouseStock) ? d.warehouseStock : [];
  return !rows.some((r) => String(r?.warehouseId || '') === tianaWh);
});

console.log('\n--- Bebidas stock vs Tiana warehouse ---');
console.log({
  bebidasLive: bebidasLive.length,
  withQtyInTiana: tianaVisibleQty.length,
  zeroInTiana: tianaZeroQty.length,
  withoutTianaWhRow: tianaNoWhRow.length,
  note: 'Si Almacén filtra «con stock» o muestra 0, al cambiar a Tiana parece vacío',
});

console.log('\n--- Bebidas CON cantidad en Tiana (top 40) ---');
console.log(
  JSON.stringify(
    tianaVisibleQty
      .map((d) => summarizeItem(d, tianaWh, badWh))
      .sort((a, b) => b.tianaQty - a.tianaQty)
      .slice(0, 40),
    null,
    2,
  ),
);

console.log('\n--- Bebidas LIVE pero 0 en Tiana (top 40; sí en Badalona?) ---');
console.log(
  JSON.stringify(
    tianaZeroQty
      .map((d) => summarizeItem(d, tianaWh, badWh))
      .sort((a, b) => b.badalonaQty - a.badalonaQty || a.name.localeCompare(b.name))
      .slice(0, 40),
    null,
    2,
  ),
);

console.log('\n--- Soft-delete recientes (stock) ---');
console.log(JSON.stringify(recentlyDeleted, null, 2));

// Sin business_id vs con business_id (filtro almacén multi-empresa)
const stockNoBiz = stockLive.filter((d) => !bid(d));
const stockWithBiz = stockLive.filter((d) => bid(d));
const bizCounts = {};
for (const d of stockWithBiz) {
  const b = bid(d);
  bizCounts[b] = (bizCounts[b] || 0) + 1;
}
console.log('\n--- Stock live por business_id ---');
console.log({
  sinBusinessId: stockNoBiz.length,
  conBusinessId: stockWithBiz.length,
  byBusiness: bizCounts,
});

const bebidasSampleNoWh = tianaNoWhRow.slice(0, 15).map((d) => summarizeItem(d, tianaWh, badWh));
console.log('\n--- Muestra bebidas SIN fila warehouse Tiana ---');
console.log(JSON.stringify(bebidasSampleNoWh, null, 2));

console.log('\nDONE');
