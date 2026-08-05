#!/usr/bin/env node
/** Pedidos + sesión TPV Badalona hoy: estados y salesPoint. */
import '../config/env.js';

const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
const REG = 'tpvreg-11cef074-bf63-4b33-afc4-59e6395fca4a';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw || '127.0.0.1:5984'}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}
const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(
  `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64')}`;

async function get(db, id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH },
  });
  return res.json();
}

async function allDocs(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=200000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function madridDay(iso) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso || '').slice(0, 10);
  }
}

async function main() {
  const today = madridDay(new Date().toISOString());
  console.log({ today, PDV, REG });

  const session = await get('bbddsaas-delivery', REG);
  console.log('\n=== SESSION ===');
  console.log(
    JSON.stringify(
      {
        _id: session._id,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        pointOfSaleId: session.pointOfSaleId || session.salesPointId,
        openedBy: session.openedBy,
        workerName: session.workerName,
        user_id: session.user_id,
        business_id: session.business_id || session.businessId,
      },
      null,
      2,
    ),
  );

  const pdv = await get('vertial-delivery', PDV);
  console.log('\n=== PDV point_of_sale (vertial-delivery) ===');
  console.log(
    JSON.stringify(
      {
        _id: pdv._id,
        name: pdv.name,
        tabletCode: pdv.tabletCode || pdv.codigoTablet || pdv.tpvCode,
        workCenterId: pdv.workCenterId,
        businessId: pdv.businessId || pdv.business_id,
        user_id: pdv.user_id,
        keys: Object.keys(pdv || {}).filter((k) => /tablet|code|codigo/i.test(k)),
      },
      null,
      2,
    ),
  );

  const docs = await allDocs('bbddsaas-delivery');
  const orders = docs.filter((d) => {
    if (d?.type !== 'delivery_order') return false;
    const sp = String(d.salesPointId || d.pointOfSaleId || '');
    if (sp !== PDV) return false;
    const day =
      madridDay(d.updatedAt) === today ||
      madridDay(d.createdAt) === today ||
      madridDay(d.completedAt) === today ||
      madridDay(d.orderedAt) === today;
    return day;
  });

  const byStatus = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  console.log(`\n=== Orders Badalona PDV hoy: ${orders.length} ===`);
  console.log(byStatus);

  for (const o of orders.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))) {
    console.log(
      JSON.stringify({
        _id: o._id,
        status: o.status,
        orderNumber: o.orderNumber || o.ticketNumber || o.code,
        channel: o.channel || o.platform || o.source,
        total: o.total ?? o.totals?.total ?? o.grandTotal,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        completedAt: o.completedAt,
        kitchenCompletedAt: o.kitchenCompletedAt,
        deliveredAt: o.deliveredAt,
        registerSessionId: o.registerSessionId || o.tpvRegisterSessionId,
        createdBy: o.createdBy || o.workerId || o.orderTakerId,
      }),
    );
  }

  // Also listo / completado across all Pau today
  const pauToday = docs.filter((d) => {
    if (d?.type !== 'delivery_order') return false;
    if (String(d.user_id || d.userId || '') !== PAU && String(d.business_id || d.businessId || '') !== BID)
      return false;
    return (
      madridDay(d.updatedAt) === today ||
      madridDay(d.createdAt) === today ||
      madridDay(d.completedAt) === today
    );
  });
  const pauStatus = {};
  for (const o of pauToday) pauStatus[o.status] = (pauStatus[o.status] || 0) + 1;
  console.log(`\n=== All Pau orders today: ${pauToday.length} ===`, pauStatus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
