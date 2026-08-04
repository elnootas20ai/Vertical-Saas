#!/usr/bin/env node
/** Solo lectura: productos a 12,80€ (y cercanos) Modomio / DISARMINK / Tiana. */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');

const BIZ = {
  modomio: '33821959-ae50-4e52-bfea-ea2b145faeac',
  disarmink: 'ed846f31-aee7-4568-ac03-fa25ff3ad773',
};

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}

function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const data = await couch('/bbddsaas-catalog/_all_docs?include_docs=true');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const catalog = docs.filter((d) => {
  const b = bid(d);
  return b === BIZ.modomio || b === BIZ.disarmink;
});

const target = 12.8;
const hits = catalog
  .filter((d) => !d.deletedAt)
  .filter((d) => Math.abs(priceOf(d) - target) < 0.001)
  .map((d) => ({
    id: d._id,
    name: d.name,
    price: priceOf(d),
    biz: bid(d) === BIZ.modomio ? 'modomio' : 'disarmink',
    active: d.active !== false,
    itemType: d.itemType,
    category: d.category || d.categoryName,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

console.log('exact 12.80 count', hits.length);
for (const h of hits) console.log(JSON.stringify(h));

// Also scan today's Tiana register sales for lines/orders near 12.80 or 32.95
const del = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const regs = (del.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && d._id === 'tpvreg-7d1d3343-05c3-4422-8e8c-1cb58698246a');
const session = regs[0];
if (session) {
  const txs = session.transactions || [];
  const cashSales = txs.filter(
    (t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === 'efectivo',
  );
  console.log('\n--- cash sales in open Tiana session ---');
  for (const t of cashSales) {
    console.log(
      JSON.stringify({
        amount: t.amount,
        desc: t.description,
        orderId: t.orderId || t.relatedOrderId,
        date: t.date,
      }),
    );
  }
  const near = cashSales.filter(
    (t) =>
      Math.abs(Number(t.amount) - 12.8) < 0.02 ||
      Math.abs(Number(t.amount) - 32.95) < 0.02 ||
      Math.abs(Number(t.amount) - 12.85) < 0.02,
  );
  console.log('cash txs near 12.80 / 32.95', near.length);

  // orders linked
  const orderIds = [
    ...new Set(
      cashSales
        .map((t) => String(t.orderId || t.relatedOrderId || t.entityId || '').trim())
        .filter(Boolean),
    ),
  ];
  const orderDocs = [];
  for (const id of orderIds) {
    try {
      orderDocs.push(await couch(`/bbddsaas-delivery/${encodeURIComponent(id)}`));
    } catch {
      /* skip */
    }
  }
  console.log('\n--- order items priced 12.80 or totals ---');
  for (const o of orderDocs) {
    const items = o.items || [];
    const hitItems = items.filter((it) => Math.abs(Number(it.total || it.unitPrice || it.price || 0) - 12.8) < 0.02);
    if (hitItems.length || Math.abs(Number(o.totalAmount || o.paidAmount || 0) - 12.8) < 0.02) {
      console.log(
        JSON.stringify({
          order: o.orderNumber || o._id,
          total: o.totalAmount || o.paidAmount,
          pm: o.paymentMethod,
          items: hitItems.map((it) => ({
            name: it.name,
            total: it.total,
            unit: it.unitPrice || it.price,
            qty: it.quantity,
          })),
        }),
      );
    }
  }

  // any order item 12.80 in session orders (all methods)
  const allOrderIds = [
    ...new Set(
      txs
        .filter((t) => t.type === 'sale')
        .map((t) => String(t.orderId || t.relatedOrderId || '').trim())
        .filter(Boolean),
    ),
  ];
  const allOrders = [];
  for (const id of allOrderIds) {
    try {
      allOrders.push(await couch(`/bbddsaas-delivery/${encodeURIComponent(id)}`));
    } catch {
      /* skip */
    }
  }
  const itemHits = [];
  for (const o of allOrders) {
    for (const it of o.items || []) {
      const unit = Number(it.unitPrice ?? it.price ?? 0);
      const total = Number(it.total ?? 0);
      if (Math.abs(unit - 12.8) < 0.02 || Math.abs(total - 12.8) < 0.02) {
        itemHits.push({
          order: o.orderNumber || o._id,
          pm: o.paymentMethod,
          name: it.name,
          unit,
          total,
          qty: it.quantity,
        });
      }
    }
  }
  console.log('\n--- items 12.80 in today session orders ---');
  console.log('count', itemHits.length);
  for (const h of itemHits) console.log(JSON.stringify(h));

  // catalog names containing prices near 12.8 among active
  const nearCatalog = catalog
    .filter((d) => !d.deletedAt && d.active !== false)
    .filter((d) => {
      const p = priceOf(d);
      return p >= 12.5 && p <= 13.1;
    })
    .map((d) => ({
      name: d.name,
      price: priceOf(d),
      biz: bid(d) === BIZ.modomio ? 'modomio' : 'disarmink',
    }))
    .sort((a, b) => a.price - b.price || fold(a.name).localeCompare(fold(b.name)));
  console.log('\n--- catalog 12.50–13.10 ---');
  for (const h of nearCatalog) console.log(JSON.stringify(h));
}
