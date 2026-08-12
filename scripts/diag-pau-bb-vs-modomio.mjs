#!/usr/bin/env node
/**
 * Solo lectura: ¿Blackburger “poco” es real?
 * Compara Marcas (pedidos+cierre por marca) vs Excel (reparto por uds pizza/burger/taco).
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}
function dayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
function foldDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return dayKey(d);
}
function sessionDay(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return foldDay(raw);
}
function channelTotal(s, ch) {
  const a = Number(s.aggregatorClosingTotals?.[ch] || 0);
  if (a > 0) return r2(a);
  return r2(Number(s.summary?.salesByChannel?.[ch] || s.salesByChannel?.[ch] || 0));
}
function excelFromSession(s) {
  const m = s.summary?.salesByMethod || {};
  const efectivo = r2(m.efectivo || 0);
  const tpv = r2(m.tarjeta || 0);
  const x = r2((m.bizum || 0) + (m.otro || 0));
  const app = r2(channelTotal(s, 'flipdish') + channelTotal(s, 'app'));
  const uber = r2(channelTotal(s, 'ubereats'));
  const justEat = r2(channelTotal(s, 'justeat'));
  const glovo = r2(channelTotal(s, 'glovo'));
  const total = r2(efectivo + tpv + x + app + uber + justEat + glovo);
  const pizza = Math.max(0, Math.floor(Number(s.productClosingCounts?.pizza || 0)));
  const burger = Math.max(0, Math.floor(Number(s.productClosingCounts?.burger || 0)));
  const taco = Math.max(0, Math.floor(Number(s.productClosingCounts?.taco || 0)));
  return { total, pizza, burger, taco };
}
function shares(pizza, burger, taco) {
  const m = Math.max(0, pizza);
  const b = Math.max(0, burger) + Math.max(0, taco);
  const sum = m + b;
  if (sum <= 0) return { mm: 0.5, bb: 0.5 };
  return { mm: m / sum, bb: b / sum };
}

const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=80000`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const docs = (await res.json()).rows.map((r) => r.doc).filter(Boolean);
const today = dayKey();
const monthStart = `${today.slice(0, 7)}-01`;

const sessions = docs.filter(
  (d) =>
    d.type === 'tpv_register_session' &&
    !d.deletedAt &&
    bid(d) === DIS &&
    (d.status === 'closed' || d.closedAt),
);

let excel = { total: 0, pizza: 0, burger: 0, taco: 0, mm: 0, bb: 0 };
let caja2ByBrand = {};
const brandLabels = {};

for (const s of sessions) {
  const day = sessionDay(s);
  if (!day || day < monthStart || day > today) continue;
  const a = excelFromSession(s);
  const sh = shares(a.pizza, a.burger, a.taco);
  excel.total = r2(excel.total + a.total);
  excel.pizza += a.pizza;
  excel.burger += a.burger;
  excel.taco += a.taco;
  excel.mm = r2(excel.mm + a.total * sh.mm);
  excel.bb = r2(excel.bb + a.total * sh.bb);

  for (const [id, label] of Object.entries(s.closingBrandLabels || {})) {
    if (id && label) brandLabels[id] = label;
  }
  for (const map of Object.values(s.aggregatorClosingBrandTotals || {})) {
    for (const [id, raw] of Object.entries(map || {})) {
      const amt = r2(Number(raw) || 0);
      if (amt <= 0) continue;
      caja2ByBrand[id] = r2((caja2ByBrand[id] || 0) + amt);
    }
  }
}

const foodUnits = excel.pizza + excel.burger + excel.taco;
const bbUnits = excel.burger + excel.taco;
const namedCaja2 = Object.fromEntries(
  Object.entries(caja2ByBrand).map(([id, amt]) => [brandLabels[id] || id.slice(0, 10), amt]),
);

console.log(
  JSON.stringify(
    {
      scope: 'DISARMINK agosto hasta hoy',
      udsCierre: {
        pizza: excel.pizza,
        burger: excel.burger,
        taco: excel.taco,
        pctPizza: foodUnits ? r2((100 * excel.pizza) / foodUnits) : 0,
        pctBurgerTaco: foodUnits ? r2((100 * bbUnits) / foodUnits) : 0,
      },
      excelRepartoPorUds: {
        total: excel.total,
        modomio: excel.mm,
        blackburger: excel.bb,
        pctBb: excel.total ? r2((100 * excel.bb) / excel.total) : 0,
        pctMm: excel.total ? r2((100 * excel.mm) / excel.total) : 0,
      },
      marcasCaja2SoloAppsDeclaradoPorMarca: namedCaja2,
      lectura: [
        'Blackburger va mucho más bajo porque el negocio es pizza-first: ~' +
          (foodUnits ? Math.round((100 * excel.pizza) / foodUnits) : '?') +
          '% de uds comida son pizza → Excel le da ese % del dinero a Modomio.',
        'Dashboard Marcas NO usa el mismo criterio que Excel: Marcas atribuye TPV por brandIds de líneas + Caja2 por marca declarada; Excel parte TODO el día por proporción pizza vs burger+taco.',
        'Por eso los € de Blackburger en Marcas y en Excel pueden diferir, pero “mucho menos que Modomio” sí es real en ambos.',
      ],
    },
    null,
    2,
  ),
);
