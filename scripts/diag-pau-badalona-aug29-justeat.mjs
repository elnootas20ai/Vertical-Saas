/**
 * SOLO LECTURA — Badalona 2026-08-29: Just Eat en cierre de caja + txs/pedidos.
 * No escribe nada.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const SESSION_BAD = 'tpvreg-f7965d40-fd87-408c-b79c-9d6dbbcf8021';
const DAY = '2026-08-29';
const BAD_PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function get(id) {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

async function allDocs() {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

function channelOf(d) {
  const c = String(d.channel || d.source || d.platform || d.aggregator || d.app || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (/just.?eat|justeat|je\b/.test(c)) return 'justeat';
  if (/glovo/.test(c)) return 'glovo';
  if (/uber/.test(c)) return 'ubereats';
  if (/flip/.test(c)) return 'flipdish';
  if (/tpv|local|sala|phone|telefono|web|app/.test(c)) return c || 'local';
  return c || 'local';
}

function payMethod(raw) {
  const m = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (/efectivo|cash|metalic/.test(m)) return 'efectivo';
  if (/tarjeta|card|visa|tpv|credit|debit|sumup/.test(m)) return 'tarjeta';
  if (/bizum/.test(m)) return 'bizum';
  if (/online|app|platform|aggregator/.test(m)) return 'online';
  return m || 'otro';
}

const s = await get(SESSION_BAD);
const docs = await allDocs();

const open = new Date(s.openedAt).getTime();
const close = new Date(s.closedAt || Date.now()).getTime();

// Pedidos Badalona / DIS en ventana del turno o día
const orders = docs.filter((d) => {
  if (d.deletedAt) return false;
  if (bid(d) !== DIS) return false;
  const t = String(d.type || d.docType || '');
  const looksOrder =
    /order/i.test(t) ||
    d.orderNumber != null ||
    (Array.isArray(d.items) && (d.total != null || d.grandTotal != null));
  if (!looksOrder) return false;
  const pdv = String(d.pointOfSaleId || d.pdvId || d.salesPointId || '').trim();
  const created = new Date(d.createdAt || d.openedAt || d.paidAt || d.completedAt || 0).getTime();
  if (!created) return false;
  const inWindow = created >= open - 5 * 60 * 1000 && created <= close + 5 * 60 * 1000;
  const onDay = dayKey(d.createdAt || d.openedAt) === DAY;
  if (!(inWindow || onDay)) return false;
  if (pdv && pdv !== BAD_PDV) return false;
  // si no tiene pdv, incluir solo si canal apps o sesión ligada
  return true;
});

const justeatOrders = orders.filter((o) => channelOf(o) === 'justeat');
const otherAppOrders = orders.filter((o) => ['glovo', 'ubereats', 'flipdish'].includes(channelOf(o)));

function orderBrief(o) {
  const total = r2(o.total ?? o.grandTotal ?? o.amount ?? 0);
  const status = o.status || o.paymentStatus || null;
  const pay = payMethod(o.paymentMethod || o.payMethod || o.method);
  const unpaid =
    o.paid === false ||
    /pending|unpaid/i.test(String(status || '')) ||
    String(o.paymentStatus || '') === 'pending';
  return {
    id: o._id,
    orderNumber: o.orderNumber || o.number || null,
    channel: channelOf(o),
    total,
    pay,
    status,
    unpaid,
    createdAt: o.createdAt || o.openedAt || null,
    pdv: o.pointOfSaleId || o.pdvId || null,
    sessionId: o.registerSessionId || o.tpvSessionId || o.sessionId || null,
  };
}

const jeSum = r2(justeatOrders.reduce((a, o) => a + Number(orderBrief(o).total || 0), 0));

// txs de la sesión que mencionen justeat
const tx = Array.isArray(s.transactions) ? s.transactions : [];
const jeTx = tx.filter((t) => {
  const blob = JSON.stringify(t).toLowerCase();
  return /just.?eat|justeat/.test(blob);
});

const agg = {
  totals: s.aggregatorClosingTotals || {},
  cash: s.aggregatorClosingCash || {},
  card: s.aggregatorClosingCard || {},
  unpaidCash: s.aggregatorUnpaidCash || s.unpaidCashByChannel || {},
  unpaidCard: s.aggregatorUnpaidCard || s.unpaidCardByChannel || {},
};

console.log(
  JSON.stringify(
    {
      session: {
        id: s._id,
        pdv: 'LOCAL BADALONA / BAD-01',
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        status: s.status,
        summary: s.summary?.salesByMethod || null,
        totalSales: s.summary?.totalSales ?? s.totalSales,
        productClosingCounts: s.productClosingCounts || null,
      },
      justEatInCierre: {
        aggTotal: r2(agg.totals.justeat),
        aggCash: r2(agg.cash.justeat),
        aggCard: r2(agg.card.justeat),
        unpaidCash: r2(agg.unpaidCash.justeat),
        unpaidCard: r2(agg.unpaidCard.justeat),
        unitsInClosing: s.productClosingCounts?.byChannel?.justeat || null,
        allAgg: agg,
      },
      justEatOrdersFound: {
        count: justeatOrders.length,
        sumTotals: jeSum,
        orders: justeatOrders.map(orderBrief).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
      },
      otherAppsOrdersSameScope: {
        count: otherAppOrders.length,
        byChannel: otherAppOrders.reduce((acc, o) => {
          const c = channelOf(o);
          acc[c] = acc[c] || { count: 0, sum: 0 };
          acc[c].count += 1;
          acc[c].sum = r2(acc[c].sum + Number(orderBrief(o).total || 0));
          return acc;
        }, {}),
      },
      sessionTxMentionJustEat: jeTx.map((t) => ({
        amount: t.amount ?? t.total,
        method: t.method || t.paymentMethod,
        at: t.createdAt || t.at,
        channel: t.channel || t.source,
      })),
      consistency: {
        aggTotal_vs_ordersSum: r2(r2(agg.totals.justeat) - jeSum),
        note:
          r2(agg.totals.justeat) === jeSum
            ? 'Cierre Just Eat = suma pedidos encontrados'
            : 'Cierre Just Eat ≠ suma pedidos (manual en cierre o pedidos fuera de filtro)',
      },
    },
    null,
    2,
  ),
);
