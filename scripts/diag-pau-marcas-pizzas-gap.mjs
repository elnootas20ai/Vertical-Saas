#!/usr/bin/env node
/** Solo lectura: pizzas pedidos TPV + byChannel vs total cierre Pau */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function foldDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localDay(d);
}
function orderDay(o) {
  const del = String(o.deliveredAt || o.completedAt || '').trim();
  if (del) return foldDay(del);
  if (String(o.status || '').toLowerCase() === 'entregado') return foldDay(String(o.updatedAt || ''));
  return foldDay(String(o.createdAt || ''));
}
function sessionDay(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return foldDay(raw);
}

// Same heuristics as shiftFoodFamilyCounts roughly
function lineKind(item) {
  const cat = String(item.category || item.categoryName || '').toLowerCase();
  const name = String(item.name || item.productName || '').toLowerCase();
  const blob = `${cat} ${name}`;
  if (/pizza/.test(blob)) return 'pizza';
  if (/burger|hamburg|blackburger/.test(blob)) return 'burger';
  if (/taco|mexican/.test(blob)) return 'taco';
  return null;
}

const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=80000`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const docs = (await res.json()).rows.map((r) => r.doc).filter(Boolean);
const today = localDay();
const monthStart = `${today.slice(0, 7)}-01`;

const orders = docs.filter((d) => {
  if (d.deletedAt) return false;
  if (d.type !== 'delivery_order' && d.type !== 'order') return false;
  if (bid(d) !== DIS) return false;
  const st = String(d.status || '').toLowerCase();
  if (/cancel/.test(st) || st === 'devuelto') return false;
  return true;
});

let fromOrders = { pizza: 0, burger: 0, taco: 0 };
for (const o of orders) {
  const day = orderDay(o);
  if (!day || day < monthStart || day > today) continue;
  for (const it of o.items || []) {
    const k = lineKind(it);
    if (!k) continue;
    const q = Math.max(0, Number(it.quantity) || 0);
    fromOrders[k] += q;
  }
}

let top = { pizza: 0, burger: 0, taco: 0 };
let byCh = { pizza: 0, burger: 0, taco: 0 };
for (const s of docs) {
  if (s.type !== 'tpv_register_session' || bid(s) !== DIS || s.deletedAt) continue;
  const day = sessionDay(s);
  if (!day || day < monthStart || day > today) continue;
  const pc = s.productClosingCounts || {};
  top.pizza += Math.max(0, Math.floor(Number(pc.pizza) || 0));
  top.burger += Math.max(0, Math.floor(Number(pc.burger) || 0));
  top.taco += Math.max(0, Math.floor(Number(pc.taco) || 0));
  for (const v of Object.values(pc.byChannel || {})) {
    byCh.pizza += Math.max(0, Math.floor(Number(v.pizza) || 0));
    byCh.burger += Math.max(0, Math.floor(Number(v.burger) || 0));
    byCh.taco += Math.max(0, Math.floor(Number(v.taco) || 0));
  }
}

const marcasUdsApprox = {
  pizza: fromOrders.pizza + byCh.pizza,
  burger: fromOrders.burger + byCh.burger,
  taco: fromOrders.taco + byCh.taco,
};

console.log(
  JSON.stringify(
    {
      fromOrdersTpvHeuristic: fromOrders,
      fromClosingByChannel: byCh,
      marcasUdsApprox_ordersPlusByChannel: marcasUdsApprox,
      cierreTopLevel_loQuePauDeclaraComoTotal: top,
      gapVsCierreTotal: {
        pizza: top.pizza - marcasUdsApprox.pizza,
        burger: top.burger - marcasUdsApprox.burger,
        taco: top.taco - marcasUdsApprox.taco,
      },
      note: 'Si gap>0, Marcas muestra menos uds que el total del cierre (Excel).',
    },
    null,
    2,
  ),
);
