#!/usr/bin/env node
/** Solo lectura: ¿entran pizzas/integradores del cierre en Dashboard Marcas Pau? */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const CHANNELS = ['glovo', 'ubereats', 'justeat', 'flipdish', 'app'];

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
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
function sessionDay(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return foldDay(raw);
}
function food(o) {
  return {
    pizza: Math.max(0, Math.floor(Number(o?.pizza) || 0)),
    burger: Math.max(0, Math.floor(Number(o?.burger) || 0)),
    taco: Math.max(0, Math.floor(Number(o?.taco) || 0)),
  };
}
function add(a, b) {
  return { pizza: a.pizza + b.pizza, burger: a.burger + b.burger, taco: a.taco + b.taco };
}
function empty() {
  return { pizza: 0, burger: 0, taco: 0 };
}

const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=80000`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const data = await res.json();
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const today = localDay();
const monthStart = `${today.slice(0, 7)}-01`;

const sessions = docs.filter(
  (d) => d.type === 'tpv_register_session' && !d.deletedAt && bid(d) === DIS,
);

let topLevel = empty();
let byChannelOverlay = empty(); // like closingBrandOverlay (only channels with €)
let byChannelAll = empty(); // sum all byChannel even without €
let sessionsWithTop = 0;
let sessionsWithByCh = 0;
const channelEuro = {};
const samples = [];

for (const s of sessions) {
  const day = sessionDay(s);
  if (!day || day < monthStart || day > today) continue;
  const pc = s.productClosingCounts;
  const top = food(pc);
  if (top.pizza || top.burger || top.taco) {
    sessionsWithTop += 1;
    topLevel = add(topLevel, top);
  }
  const byCh = pc?.byChannel || {};
  if (Object.keys(byCh).length) sessionsWithByCh += 1;

  for (const ch of CHANNELS) {
    const tot = r2(Number(s.aggregatorClosingTotals?.[ch] || 0));
    const brandMap = s.aggregatorClosingBrandTotals?.[ch] || {};
    let brandSum = 0;
    for (const raw of Object.values(brandMap)) brandSum = r2(brandSum + (Number(raw) || 0));
    const hasMoney = tot > 0 || brandSum > 0;
    const chFood = food(byCh[ch]);
    byChannelAll = add(byChannelAll, chFood);
    if (hasMoney) {
      const effective = tot > 0 ? tot : brandSum;
      const key = ch === 'app' ? 'flipdish' : ch;
      channelEuro[key] = r2((channelEuro[key] || 0) + effective);
      byChannelOverlay = add(byChannelOverlay, chFood);
    }
  }

  if (samples.length < 5 && (top.pizza || Object.keys(byCh).length || Object.keys(s.aggregatorClosingTotals || {}).length)) {
    samples.push({
      day,
      pdv: s.pointOfSaleId || s.pdvName,
      topLevel: top,
      byChannel: Object.fromEntries(
        Object.entries(byCh).map(([k, v]) => [k, food(v)]),
      ),
      aggTotals: s.aggregatorClosingTotals || {},
      hasBrandTotals: Object.keys(s.aggregatorClosingBrandTotals || {}).length > 0,
    });
  }
}

const integratorEuroSum = r2(Object.values(channelEuro).reduce((s, n) => s + n, 0));

console.log(
  JSON.stringify(
    {
      scope: 'DISARMINK mes',
      today,
      monthStart,
      /** Lo que Excel / resumen usa: productClosingCounts.pizza|burger|taco */
      udsDeclaradasTopLevel_excelStyle: topLevel,
      sessionsWithTopLevelUds: sessionsWithTop,
      /** Lo que Marcas overlay suma hoy: solo byChannel de canales con € declarado */
      udsQueEntranEnMarcasOverlay_byChannelConEuro: byChannelOverlay,
      /** byChannel completo aunque no hubiera € */
      udsByChannelTodas: byChannelAll,
      sessionsWithByChannel: sessionsWithByCh,
      /** € integradores que SÍ entran en bloque Integradores del panel (closing revenueByChannel) */
      euroIntegradoresEnPanelMarcas: channelEuro,
      euroIntegradoresSuma: integratorEuroSum,
      gapUds:
        topLevel.pizza - byChannelOverlay.pizza !== 0 ||
        topLevel.burger - byChannelOverlay.burger !== 0 ||
        topLevel.taco - byChannelOverlay.taco !== 0
          ? {
              pizza: topLevel.pizza - byChannelOverlay.pizza,
              burger: topLevel.burger - byChannelOverlay.burger,
              taco: topLevel.taco - byChannelOverlay.taco,
              meaning:
                'Si gap>0: en cierre rellenan TOTAL pizzas pero Marcas solo lee byChannel → faltan uds de apps en la tira Uds',
            }
          : null,
      samples,
      verdict: {
        eurosIntegradores:
          integratorEuroSum > 0
            ? 'SÍ se suman al bloque Integradores (Glovo/Uber/JE/Flipdish) vía cierre'
            : 'No hay € de integradores en cierres del mes',
        pizzasTotales:
          sessionsWithTop > 0 && byChannelOverlay.pizza < topLevel.pizza
            ? 'FALTAN en Marcas: el total de pizzas del cierre (top-level) no se usa; solo byChannel'
            : sessionsWithByCh === 0 && sessionsWithTop > 0
              ? 'FALTAN: hay totales de uds al cierre pero sin byChannel → Marcas no ve pizzas de apps'
              : 'byChannel alineado o sin declaración de uds',
      },
    },
    null,
    2,
  ),
);
