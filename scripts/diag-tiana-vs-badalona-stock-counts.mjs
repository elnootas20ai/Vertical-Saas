#!/usr/bin/env node
/** SOLO LECTURA — conteo stock Tiana vs Badalona (LOCAL) */
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
const TIANA_PDV = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';
const BAD_PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
const BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function all(db) {
  const r = await fetch(`${COUCH}/${db}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const j = await r.json();
  return (j.rows || []).map((x) => x.doc).filter(Boolean);
}

function qty(item, wid) {
  const rows = Array.isArray(item.warehouseStock) ? item.warehouseStock : [];
  const hit = rows.find((r) => String(r.warehouseId || '') === wid);
  return hit ? Number(hit.quantity || 0) || 0 : 0;
}

function isStockish(d) {
  if (d.module === 'stock' || d.isStockItem === true) return true;
  return ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable'].includes(
    String(d.stockCategory || ''),
  );
}

const docs = await all('bbddsaas-catalog');
const whs = docs.filter((d) => d.type === 'warehouse' && String(d.user_id || '') === PAU);
const tWh = whs.find((w) => w.salesPointId === TIANA_PDV)?._id;
const bWh = whs.find((w) => w.salesPointId === BAD_PDV)?._id;

const items = docs.filter(
  (d) =>
    d.type === 'catalog_item'
    && String(d.user_id || '') === PAU
    && !d.deletedAt
    && d.active !== false
    && isStockish(d)
    && String(d.business_id || d.businessId || '').replace(/^business:/, '') === BIZ,
);

let tPos = 0;
let tZero = 0;
let tNeg = 0;
let bPos = 0;
let onlyB = 0;
let onlyT = 0;
let both = 0;
const todayBev = [];
const todayStock = [];

for (const it of items) {
  const tq = qty(it, tWh);
  const bq = qty(it, bWh);
  if (tq > 0) tPos += 1;
  else if (tq < 0) tNeg += 1;
  else tZero += 1;
  if (bq > 0) bPos += 1;
  if (tq > 0 && bq > 0) both += 1;
  if (bq > 0 && tq <= 0) onlyB += 1;
  if (tq > 0 && bq <= 0) onlyT += 1;
  const u = String(it.updatedAt || '');
  if (u.startsWith('2026-08-27')) {
    const row = {
      name: it.name,
      sc: it.stockCategory || '',
      tq,
      bq,
      rows: (it.warehouseStock || []).map((r) => ({
        w: String(r.warehouseId || '').slice(0, 14),
        q: r.quantity,
      })),
      u,
    };
    todayStock.push(row);
    if (String(it.stockCategory || '') === 'beverage' || /bebida/i.test(String(it.category || ''))) {
      todayBev.push(row);
    }
  }
}

console.log(
  JSON.stringify(
    {
      warehouses: { tWh, bWh },
      stockBizDisarmink: items.length,
      tianaPos: tPos,
      tianaZero: tZero,
      tianaNeg: tNeg,
      badalonaPos: bPos,
      onlyBadalona: onlyB,
      onlyTiana: onlyT,
      bothStores: both,
      updatedToday: todayStock.length,
      bebidasUpdatedToday: todayBev.length,
      todayBev,
      todayStockSample: todayStock.slice(0, 25),
    },
    null,
    2,
  ),
);
