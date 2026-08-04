#!/usr/bin/env node
/**
 * Solo lectura — caza BBQ / 33€ a fondo (incl. deleted, totales raros, extras).
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BBQ_ID = 'catitem-a57bd632-954f-4f4b-b16e-d8654dd64491';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

async function allDocs(db) {
  const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`);
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isPizzaBbq(name) {
  const n = fold(name);
  if (!/bbq|barbacoa|barbecue/.test(n)) return false;
  if (/taco|salsa|burger|black\s*bbq|ingrediente/.test(n)) return false;
  return true;
}

const delivery = await allDocs('bbddsaas-delivery');
const cutoff = Date.parse('2026-07-28T00:00:00.000Z');

console.log('=== A) Todas las líneas BBQ pizza Pau desde 28-jul (cualquier estado) ===');
const bbqLines = [];
for (const o of delivery) {
  if (!o || (o.type !== 'delivery_order' && o.type !== 'order')) continue;
  if (String(o.user_id || '') !== PAU) continue;
  const t = Date.parse(o.createdAt || o.updatedAt || 0);
  if (t && t < cutoff) continue;
  for (const it of o.items || []) {
    if (!isPizzaBbq(it.name)) continue;
    bbqLines.push({
      order: o.orderNumber,
      id: o._id,
      status: o.status,
      deletedAt: o.deletedAt || null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      pdv: o.salesPointName,
      paymentStatus: o.paymentStatus,
      itemsSubtotal: o.itemsSubtotal,
      discountAmount: o.discountAmount,
      totalAmount: o.totalAmount,
      line: {
        name: it.name,
        qty: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        extras: it.extras,
        catalogItemId: it.catalogItemId,
        notes: it.notes,
      },
    });
  }
}
bbqLines.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
console.log('count', bbqLines.length);
for (const r of bbqLines) console.log(JSON.stringify(r));

console.log('\n=== B) Pedidos con totalAmount/unit ≈33 o línea ≥30 (Pau hoy+) ===');
for (const o of delivery) {
  if (!o || o.type !== 'delivery_order') continue;
  if (String(o.user_id || '') !== PAU) continue;
  if (String(o.createdAt || '') < '2026-07-29') continue;
  const items = o.items || [];
  const weird = items.some(
    (i) =>
      Number(i.unitPrice) >= 30 ||
      Number(i.total) >= 30 ||
      (Number(i.quantity) === 1 && Number(i.unitPrice) >= 28),
  );
  const tot33 = Math.abs(Number(o.totalAmount) - 33) < 0.05;
  if (!weird && !tot33) continue;
  console.log(
    JSON.stringify({
      order: o.orderNumber,
      status: o.status,
      deletedAt: o.deletedAt || null,
      totalAmount: o.totalAmount,
      discountAmount: o.discountAmount,
      itemsSubtotal: o.itemsSubtotal,
      items: items.map((i) => ({
        name: i.name,
        qty: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
        extras: i.extras,
      })),
    }),
  );
}

console.log('\n=== C) Revisiones BBQ catálogo (si hay) ===');
const revs = await couch(`/${encodeURIComponent('bbddsaas-catalog')}/${encodeURIComponent(BBQ_ID)}?revs_info=true`);
const infos = (revs._revs_info || []).slice(0, 8);
console.log('current', { unitPrice: revs.unitPrice, rev: revs._rev, updatedAt: revs.updatedAt });
for (const info of infos) {
  if (info.status !== 'available') {
    console.log(info.rev, info.status);
    continue;
  }
  const old = await couch(
    `/${encodeURIComponent('bbddsaas-catalog')}/${encodeURIComponent(BBQ_ID)}?rev=${encodeURIComponent(info.rev)}`,
  );
  console.log({
    rev: info.rev,
    unitPrice: old.unitPrice,
    name: old.name,
    updatedAt: old.updatedAt,
  });
}

console.log('\n=== D) Sesiones caja Badalona hoy — txs con 33 ===');
for (const s of delivery) {
  if (s?.type !== 'tpv_register_session') continue;
  if (!/badalona/i.test(String(s.pointOfSaleName || ''))) continue;
  if (String(s.openedAt || '') < '2026-07-29') continue;
  const txs = s.transactions || [];
  const hit = txs.filter((t) => Math.abs(Number(t.amount || t.total || 0) - 33) < 0.05);
  console.log({
    session: s._id,
    status: s.status,
    openedAt: s.openedAt,
    txs: txs.length,
    txs33: hit,
    linked: s.linkedOrderIds,
  });
}
