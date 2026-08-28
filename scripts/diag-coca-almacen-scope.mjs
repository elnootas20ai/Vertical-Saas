#!/usr/bin/env node
/**
 * SOLO LECTURA — ¿por qué no sale Coca-Cola en Almacén Bebidas?
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const COUCH = (process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/$/, '');
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
  ).toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773'; // DISARMINK
const TIANA_WH = 'wh-cf70d37f-f62e-4d66-9b7d-4cc68068583e';
const BAD_WH = 'wh-457ce46b-3f85-46ec-9889-0bb9b85a12be';

async function all(db) {
  const r = await fetch(`${COUCH}/${db}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const j = await r.json();
  return (j.rows || []).map((x) => x.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function qty(item, wid) {
  const rows = Array.isArray(item.warehouseStock) ? item.warehouseStock : [];
  const hit = rows.find((r) => String(r.warehouseId || '') === wid);
  return hit ? Number(hit.quantity || 0) || 0 : 0;
}

function isStockInventoryItem(item) {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  if (item.isStockItem === true) return true;
  if (item.module === 'stock') return true;
  if (item.stockCategory === 'finished_product') return false;
  if (
    item.stockCategory
    && ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable'].includes(item.stockCategory)
  ) {
    return true;
  }
  if (item.module === 'catalog') return false;
  return false;
}

function isBebidaOrganizer(item) {
  return String(item.stockCategory || '') === 'beverage' || /bebida/i.test(String(item.category || ''));
}

const docs = await all('bbddsaas-catalog');
const items = docs.filter(
  (d) => d.type === 'catalog_item' && String(d.user_id || '') === PAU,
);

const coca = items
  .filter((d) => /coca/i.test(String(d.name || '')))
  .map((d) => ({
    id: d._id,
    name: d.name,
    module: d.module,
    stockCategory: d.stockCategory || '',
    category: d.category || '',
    itemType: d.itemType || '',
    isStockItem: d.isStockItem === true,
    active: d.active !== false,
    deletedAt: d.deletedAt || null,
    business_id: bid(d) || '(sin)',
    inAlmacen: isStockInventoryItem(d),
    inBebidasChip: isStockInventoryItem(d) && isBebidaOrganizer(d),
    tianaQty: qty(d, TIANA_WH),
    badQty: qty(d, BAD_WH),
    stockQuantity: Number(d.stockQuantity || 0) || 0,
    updatedAt: d.updatedAt || '',
  }))
  .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.deletedAt || '').localeCompare(String(b.deletedAt || '')));

const liveBiz = items.filter(
  (d) =>
    !d.deletedAt
    && d.active !== false
    && (bid(d) === BIZ || !bid(d)),
);

const stockLive = liveBiz.filter(isStockInventoryItem);
const bebidasChip = stockLive.filter(isBebidaOrganizer);
const bebidasWithAnyQty = bebidasChip.filter(
  (d) => qty(d, TIANA_WH) > 0 || qty(d, BAD_WH) > 0 || Number(d.stockQuantity || 0) > 0,
);

const fantaNestea = stockLive
  .filter((d) => /fanta|nestea|aquarius|agua|cerveza|mahou|coca/i.test(String(d.name || '')))
  .map((d) => ({
    name: d.name,
    sc: d.stockCategory,
    module: d.module,
    inBebidas: isBebidaOrganizer(d),
    tq: qty(d, TIANA_WH),
    bq: qty(d, BAD_WH),
  }));

console.log(
  JSON.stringify(
    {
      counts: {
        stockLiveBiz: stockLive.length,
        bebidasChip: bebidasChip.length,
        bebidasWithAnyQty: bebidasWithAnyQty.length,
        bebidasList: bebidasChip.map((d) => ({
          name: d.name,
          sc: d.stockCategory,
          cat: d.category,
          tq: qty(d, TIANA_WH),
          bq: qty(d, BAD_WH),
          module: d.module,
        })),
      },
      cocaAll: coca,
      relatedSample: fantaNestea,
    },
    null,
    2,
  ),
);
