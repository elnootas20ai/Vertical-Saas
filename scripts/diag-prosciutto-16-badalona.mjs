#!/usr/bin/env node
/**
 * Solo lectura: pedidos Badalona/Pau con Prosciutto ~16€ (hoy + últimos 2 días).
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BADALONA = 'wc-16361270-5794-4b95-89e5-644685f36e24';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isProsciutto(name) {
  const n = fold(name);
  return /prosc?i?utto|prosciuto|proscuito/.test(n);
}

function linePrice(it) {
  const candidates = [
    it.unitPrice,
    it.price,
    it.basePrice,
    it.finalPrice,
    it.total,
    it.lineTotal,
    it.amount,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

const ordersDb = 'bbddsaas-delivery';
const docs = await allDocs(ordersDb);
const now = Date.now();
const cutoff = now - 3 * 24 * 60 * 60 * 1000;

const hits = [];
for (const d of docs) {
  if (!d || d.type !== 'delivery_order') continue;
  if (d.deletedAt) continue;
  const uid = String(d.user_id || d.userId || '');
  const pdv = String(d.salesPointId || d.pointOfSaleId || d.workCenterId || '');
  const pdvName = String(d.salesPointName || d.pointOfSaleName || '');
  const isBadalona =
    pdv === BADALONA || /badalona/i.test(pdvName) || uid === PAU;
  if (!isBadalona && uid !== PAU) continue;

  const created = d.createdAt || d.orderedAt || d.updatedAt;
  const t = created ? Date.parse(created) : 0;
  if (t && t < cutoff) continue;

  const items = Array.isArray(d.items) ? d.items : [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const name = it.name || it.productName || it.title || '';
    if (!isProsciutto(name)) continue;
    const price = linePrice(it);
    hits.push({
      orderId: d._id,
      orderNumber: d.orderNumber || d.code || d.ticketNumber,
      status: d.status,
      channel: d.channel || d.source,
      createdAt: created,
      pdv: pdvName || pdv,
      salesPointId: pdv,
      user_id: uid,
      paymentStatus: d.paymentStatus,
      total: d.total ?? d.totals?.total ?? d.grandTotal,
      itemIndex: i,
      itemName: name,
      qty: it.qty ?? it.quantity ?? 1,
      unitPrice: it.unitPrice,
      price: it.price,
      basePrice: it.basePrice,
      finalPrice: it.finalPrice,
      lineTotal: it.lineTotal ?? it.total,
      resolvedPrice: price,
      promo: it.promo || it.promotion || it.appliedPromo || null,
      discount: it.discount ?? it.discountAmount,
      rawKeys: Object.keys(it),
    });
  }
}

hits.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
console.log(`Hits Prosciutto (Pau/Badalona, ~3d): ${hits.length}`);
for (const h of hits) {
  console.log(JSON.stringify(h, null, 2));
  console.log('---');
}

const at16 = hits.filter((h) => {
  const p = Number(h.resolvedPrice);
  return p >= 15.5 && p <= 16.5;
});
console.log(`\nCon precio ~16€: ${at16.length}`);
for (const h of at16) {
  console.log(`${h.orderId} ${h.orderNumber} ${h.itemName} → ${h.resolvedPrice}€ totalPedido=${h.total}`);
}
