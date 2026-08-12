#!/usr/bin/env node
/**
 * Solo lectura: ¿Excel Uriel (Caja) de Pau carga bien los cierres?
 * Replica sessionToUrielAmounts + reparto por uds (hojas MODOMIO / BLACK BURGER).
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DB = 'bbddsaas-delivery';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}
function madridDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
function sessionDay(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return String(raw).slice(0, 10);
  return madridDay(dt);
}
function channelTotal(session, channel) {
  const fromAgg = Number(session.aggregatorClosingTotals?.[channel] || 0);
  if (fromAgg > 0) return r2(fromAgg);
  const fromSummary = Number(session.summary?.salesByChannel?.[channel] || 0);
  const fromSession = Number(session.salesByChannel?.[channel] || 0);
  return r2(fromAgg || fromSummary || fromSession);
}

/** Igual que sessionToUrielAmounts (sin rebuild de transactions). */
function sessionToUrielAmounts(session) {
  const method = session.summary?.salesByMethod || {};
  const efectivo = r2(method.efectivo || 0);
  const tpv = r2(method.tarjeta || 0);
  const x = r2((method.bizum || 0) + (method.otro || 0));
  const online = r2(method.online || 0);
  const justEat = channelTotal(session, 'justeat');
  const uber = channelTotal(session, 'ubereats');
  const glovo = channelTotal(session, 'glovo');
  const app = r2(channelTotal(session, 'flipdish') + channelTotal(session, 'app'));
  const total = r2(efectivo + tpv + x + app + uber + justEat + glovo);
  const pizza = Math.max(0, Math.floor(Number(session.productClosingCounts?.pizza || 0)));
  const burger = Math.max(0, Math.floor(Number(session.productClosingCounts?.burger || 0)));
  const taco = Math.max(0, Math.floor(Number(session.productClosingCounts?.taco || 0)));
  return { efectivo, tpv, x, app, uber, justEat, glovo, total, pizza, burger, taco, online };
}

function sheetShares(pizza, burger, taco) {
  // LEGACY: modomio=pizza, blackburger=burger+taco
  const m = Math.max(0, pizza);
  const b = Math.max(0, burger) + Math.max(0, taco);
  const sum = m + b;
  if (sum <= 0) return { modomio: 0.5, blackburger: 0.5 };
  return { modomio: m / sum, blackburger: b / sum };
}

function brandDeclaredFromClosing(session) {
  const out = {};
  const maps = session.aggregatorClosingBrandTotals || {};
  for (const brandMap of Object.values(maps)) {
    for (const [id, raw] of Object.entries(brandMap || {})) {
      const amt = r2(Number(raw) || 0);
      if (amt <= 0) continue;
      out[id] = r2((out[id] || 0) + amt);
    }
  }
  const labels = session.closingBrandLabels || {};
  return Object.entries(out).map(([id, amt]) => ({
    id,
    name: labels[id] || id.slice(0, 10),
    amt,
  }));
}

const res = await fetch(`${COUCH}/${DB}/_all_docs?include_docs=true&limit=80000`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const docs = (await res.json()).rows.map((r) => r.doc).filter(Boolean);
const today = madridDay();
const ym = today.slice(0, 7);
const monthStart = `${ym}-01`;

const sessions = docs
  .filter((d) => d.type === 'tpv_register_session' && !d.deletedAt && bid(d) === DIS)
  .filter((d) => {
    const day = sessionDay(d);
    return day >= monthStart && day <= today;
  })
  .filter((d) => String(d.status || '').toLowerCase() === 'closed' || d.closedAt);

const byDay = new Map();
const byPdv = new Map();
const flags = [];
let month = {
  efectivo: 0,
  tpv: 0,
  x: 0,
  app: 0,
  uber: 0,
  justEat: 0,
  glovo: 0,
  total: 0,
  pizza: 0,
  burger: 0,
  taco: 0,
  onlineIgnored: 0,
};
let modoMoney = 0;
let bbMoney = 0;
let declaredBrandSum = 0;
let sessionsWithEmptyMethodButTx = 0;
let sessionsWithZeroTotal = 0;
let sessionsWithFood = 0;
let sessionsWithApps = 0;

for (const s of sessions) {
  const day = sessionDay(s);
  const a = sessionToUrielAmounts(s);
  const methodTotal =
    Number(s.summary?.salesByMethod?.efectivo || 0) +
    Number(s.summary?.salesByMethod?.tarjeta || 0) +
    Number(s.summary?.salesByMethod?.bizum || 0) +
    Number(s.summary?.salesByMethod?.online || 0) +
    Number(s.summary?.salesByMethod?.otro || 0);
  const txCount = Array.isArray(s.transactions) ? s.transactions.length : 0;
  if (methodTotal <= 0 && txCount > 0) {
    sessionsWithEmptyMethodButTx += 1;
    flags.push({
      type: 'summary_vacio_con_tx',
      day,
      id: s._id,
      txCount,
      note: 'Excel en app recalcula summary; este diag no — revisar en UI',
    });
  }
  if (a.total <= 0 && a.pizza + a.burger + a.taco <= 0) {
    sessionsWithZeroTotal += 1;
  }
  if (a.pizza + a.burger + a.taco > 0) sessionsWithFood += 1;
  if (a.app + a.uber + a.justEat + a.glovo > 0) sessionsWithApps += 1;
  if (a.online > 0) {
    flags.push({
      type: 'online_no_entra_excel',
      day,
      id: s._id,
      online: a.online,
    });
  }

  for (const k of Object.keys(month)) {
    if (k === 'onlineIgnored') month.onlineIgnored = r2(month.onlineIgnored + a.online);
    else if (a[k] != null) month[k] = r2(month[k] + a[k]);
  }

  const shares = sheetShares(a.pizza, a.burger, a.taco);
  modoMoney = r2(modoMoney + a.total * shares.modomio);
  bbMoney = r2(bbMoney + a.total * shares.blackburger);

  for (const b of brandDeclaredFromClosing(s)) {
    declaredBrandSum = r2(declaredBrandSum + b.amt);
  }

  if (!byDay.has(day)) {
    byDay.set(day, {
      day,
      total: 0,
      pizza: 0,
      burger: 0,
      taco: 0,
      efectivo: 0,
      tpv: 0,
      apps: 0,
      sessions: 0,
    });
  }
  const row = byDay.get(day);
  row.total = r2(row.total + a.total);
  row.pizza += a.pizza;
  row.burger += a.burger;
  row.taco += a.taco;
  row.efectivo = r2(row.efectivo + a.efectivo);
  row.tpv = r2(row.tpv + a.tpv);
  row.apps = r2(row.apps + a.app + a.uber + a.justEat + a.glovo);
  row.sessions += 1;

  const pdv = String(s.pointOfSaleName || s.pointOfSaleId || 'pdv');
  if (!byPdv.has(pdv)) byPdv.set(pdv, { pdv, total: 0, sessions: 0, pizza: 0 });
  const p = byPdv.get(pdv);
  p.total = r2(p.total + a.total);
  p.sessions += 1;
  p.pizza += a.pizza;
}

const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
const check =
  Math.abs(month.total - (month.efectivo + month.tpv + month.x + month.app + month.uber + month.justEat + month.glovo)) <
  0.02;

console.log(
  JSON.stringify(
    {
      business: 'DISARMINK / Pau',
      ym,
      closedSessionsInMonth: sessions.length,
      sessionsWithFood,
      sessionsWithApps,
      sessionsWithZeroTotal,
      sessionsWithEmptyMethodButTx,
      excelMonthLikeStoreSheet: month,
      excelBrandSheetsByUnits: {
        modomioApprox: modoMoney,
        blackburgerApprox: bbMoney,
        sum: r2(modoMoney + bbMoney),
        note: 'Las hojas marca reparten TODO el dinero del día por proporción de uds (pizza vs burger+taco), NO por aggregatorClosingBrandTotals',
      },
      declaredCaja2BrandSum_notUsedByExcelSheets: declaredBrandSum,
      arithmeticOk: check,
      byPdv: [...byPdv.values()].sort((a, b) => b.total - a.total),
      byDay: days,
      flags: flags.slice(0, 20),
      verdict: [
        check ? 'OK: TOTAL = EFECTIVO+TPV+X+App+UBER+JE+GLOVO' : 'FAIL: descuadre aritmético',
        sessionsWithEmptyMethodButTx > 0
          ? `ATENCIÓN: ${sessionsWithEmptyMethodButTx} cierres con summary vacío y tx (la app Excel debería recalcular)`
          : 'OK: summaries con método de pago',
        month.onlineIgnored > 0
          ? `ATENCIÓN: ${month.onlineIgnored}€ method.online no entran en columnas Excel`
          : 'OK: sin online huérfano',
        month.pizza > 0 || month.burger > 0
          ? `OK: uds cierre cargan (pizza ${month.pizza}, burger ${month.burger}, taco ${month.taco})`
          : 'ATENCIÓN: sin uds en productClosingCounts',
        month.app + month.uber + month.justEat + month.glovo > 0
          ? `OK: Caja 2 apps en Excel (${r2(month.app + month.uber + month.justEat + month.glovo)}€)`
          : 'ATENCIÓN: sin apps en cierres',
        'Hojas MODOMIO/BLACK BURGER = reparto por pizzas/burgers, no por € marca del cierre (eso es otra vista)',
      ],
    },
    null,
    2,
  ),
);
