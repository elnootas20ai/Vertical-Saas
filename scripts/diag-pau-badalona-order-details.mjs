#!/usr/bin/env node
/** Full dump 2 pedidos Badalona + logic check statuses. */
import '../config/env.js';

const IDS = [
  'dord-0a4105b8-744f-4acc-a898-68858a6b51b8',
  'dord-c3eacdeb-5e8b-49ad-baf6-da417f1284c2',
];
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

async function main() {
  const session = await get('bbddsaas-delivery', REG);
  console.log('session', {
    status: session.status,
    openedAt: session.openedAt,
    pointOfSaleId: session.pointOfSaleId,
  });

  for (const id of IDS) {
    const o = await get('bbddsaas-delivery', id);
    const status = String(o.status || '').toLowerCase();
    const inCompletados = status === 'entregado' || status === 'cancelled' || status === 'cancelado' || status === 'devuelto';
    const inMontaje = ['nuevo', 'cocina', 'listo'].includes(status);
    const inReparto = status === 'en_reparto';
    console.log('\n====', id, '====');
    console.log(
      JSON.stringify(
        {
          status: o.status,
          deliveryType: o.deliveryType,
          channel: o.channel,
          salesPointId: o.salesPointId,
          pointOfSaleId: o.pointOfSaleId,
          orderNumber: o.orderNumber,
          totalAmount: o.totalAmount,
          paidAmount: o.paidAmount,
          paymentStatus: o.paymentStatus,
          paymentCollected: o.paymentCollected,
          paymentMethod: o.paymentMethod,
          createdAt: o.createdAt,
          kitchenCompletedAt: o.kitchenCompletedAt,
          deliveredAt: o.deliveredAt,
          registerSessionId: o.registerSessionId,
          createdByUserId: o.createdByUserId || o.createdBy,
          orderTakerId: o.orderTakerId,
          itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          UI: { inMontaje, inReparto, inCompletadosHistorial: inCompletados },
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
