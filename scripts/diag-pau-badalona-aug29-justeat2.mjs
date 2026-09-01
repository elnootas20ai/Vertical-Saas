/**
 * SOLO LECTURA — buscar cualquier rastro Just Eat Badalona 29/08
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DAY = '2026-08-29';
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const BAD_PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
const SESSION_BAD = 'tpvreg-f7965d40-fd87-408c-b79c-9d6dbbcf8021';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function allDocs() {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function blob(d) {
  try {
    return JSON.stringify(d).toLowerCase();
  } catch {
    return '';
  }
}

function dayHit(d) {
  const b = blob(d);
  return b.includes('2026-08-29') || b.includes('29/08/2026') || b.includes('29-08-2026');
}

const docs = await allDocs();

const jeHits = docs.filter((d) => {
  if (d.deletedAt) return false;
  const b = blob(d);
  if (!/just.?eat|justeat/.test(b)) return false;
  if (bid(d) && bid(d) !== DIS) return false;
  return dayHit(d) || d._id === SESSION_BAD || String(d.registerSessionId || d.sessionId || '') === SESSION_BAD;
});

const session = docs.find((d) => d._id === SESSION_BAD);

// tipos de docs con justeat
const byType = {};
for (const d of jeHits) {
  const t = String(d.type || d.docType || 'unknown');
  byType[t] = (byType[t] || 0) + 1;
}

// pedidos DIS del día (cualquier canal) — muestreo campos canal
const dayOrders = docs.filter((d) => {
  if (d.deletedAt) return false;
  if (bid(d) !== DIS) return false;
  const t = String(d.type || '');
  if (!/order/i.test(t)) return false;
  return String(d.createdAt || '').startsWith(DAY);
});

const channelDist = {};
for (const o of dayOrders) {
  const c = String(o.channel || o.source || o.platform || o.deliveryChannel || o.origin || '—');
  channelDist[c] = (channelDist[c] || 0) + 1;
}

const pdvDist = {};
for (const o of dayOrders) {
  const p = String(o.pointOfSaleId || o.pdvId || '—');
  pdvDist[p] = (pdvDist[p] || 0) + 1;
}

// sample order shapes
const samples = dayOrders.slice(0, 8).map((o) => ({
  id: o._id,
  type: o.type,
  channel: o.channel,
  source: o.source,
  platform: o.platform,
  deliveryChannel: o.deliveryChannel,
  origin: o.origin,
  paymentMethod: o.paymentMethod || o.payMethod,
  total: o.total ?? o.grandTotal,
  pdv: o.pointOfSaleId || o.pdvId,
  sessionId: o.registerSessionId || o.tpvSessionId || o.sessionId,
  status: o.status,
  createdAt: o.createdAt,
}));

// session keys related to aggregator
const aggKeys = Object.keys(session || {}).filter((k) =>
  /aggreg|just|glovo|uber|flip|unpaid|productClosing|channel/i.test(k),
);

console.log(
  JSON.stringify(
    {
      sessionAggSnapshot: {
        totals: session?.aggregatorClosingTotals,
        cash: session?.aggregatorClosingCash,
        card: session?.aggregatorClosingCard,
        unpaidCash: session?.aggregatorUnpaidCash,
        unpaidCard: session?.aggregatorUnpaidCard,
        unitsJE: session?.productClosingCounts?.byChannel?.justeat,
        jeTotalEntered: r2(session?.aggregatorClosingTotals?.justeat),
        jeCash: r2(session?.aggregatorClosingCash?.justeat),
        jeCard: r2(session?.aggregatorClosingCard?.justeat),
      },
      jeRelatedDocs: {
        count: jeHits.length,
        byType,
        ids: jeHits.slice(0, 40).map((d) => ({
          id: d._id,
          type: d.type || d.docType,
          createdAt: d.createdAt || d.openedAt || d.closedAt || null,
        })),
      },
      disOrdersOnDay: {
        count: dayOrders.length,
        channelDist,
        pdvDist,
        samples,
      },
      sessionAggKeys: aggKeys,
      interpretation: {
        justEatEnCaja: '81.20 € total apps (manual al cerrar)',
        cobroEfectivoTarjetaApps: '0 / 0 — todo como total plataforma, sin no-pagado',
        unidades: '5 pizzas Just Eat en conteo de cierre',
        pedidosEnBbdd:
          dayOrders.length === 0
            ? 'No hay delivery_order DIS el 29 (apps se meten a mano en 2ª caja)'
            : 'Hay pedidos; ver channelDist',
      },
    },
    null,
    2,
  ),
);
