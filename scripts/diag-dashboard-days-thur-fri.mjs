#!/usr/bin/env node
/**
 * SOLO LECTURA — auditoría día a día (dashboard delivery / marcas).
 * Compara pedidos vs cierres (Caja 2) para Uber y comida (pizza/burger/taco).
 *
 * Días objetivo: jueves y viernes de la semana en curso (Europe/Madrid).
 * Cuenta: Pau (DISARMINK) — misma que diag-pau-dashboard-marcas.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildFoodFamilyCountsFromOrders } = require(
  path.join(root, 'shared/delivery/foodFamilyCounts.js'),
);

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DB = 'bbddsaas-delivery';
const CLOSING_CHANNELS = ['glovo', 'ubereats', 'justeat', 'flipdish', 'app'];

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function madridDayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDaysKey(dayKey, delta) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return madridDayKey(dt);
}

function weekdayNameEs(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(dt);
}

/** Último jueves y viernes ≤ hoy (Madrid). */
function resolveThuFri(todayKey) {
  // 0=dom … 4=jue 5=vie (UTC noon of dayKey)
  const [y, m, d] = todayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0 sun
  // distance back to Thursday (4)
  const backToThu = (dow + 7 - 4) % 7;
  const thu = addDaysKey(todayKey, -backToThu);
  const fri = addDaysKey(thu, 1);
  // if Friday is in the future, use previous week
  if (fri > todayKey) {
    return { thu: addDaysKey(thu, -7), fri: addDaysKey(fri, -7) };
  }
  return { thu, fri };
}

function bid(doc) {
  return String(doc.business_id || doc.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function normalizeChannel(channel) {
  const ch = String(channel || '').toLowerCase().trim();
  if (!ch) return 'tpv';
  if (ch === 'uber' || ch === 'uber_eats' || ch === 'uber-eats') return 'ubereats';
  if (ch === 'just_eat' || ch === 'just-eat') return 'justeat';
  return ch;
}

function sessionWorkDayKey(session) {
  const raw =
    session?.workDayKey ||
    session?.businessDayKey ||
    session?.openedAt ||
    session?.createdAt ||
    '';
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return madridDayKey(d);
}

function foldDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return madridDayKey(d);
}

function orderDeliveredAtIso(order) {
  return String(
    order.deliveredAt ||
      order.completedAt ||
      (Array.isArray(order.stageHistory)
        ? [...order.stageHistory]
            .reverse()
            .find((s) => /entreg/i.test(String(s?.status || s?.stage || '')))?.date ||
          [...order.stageHistory]
            .reverse()
            .find((s) => /entreg/i.test(String(s?.status || s?.stage || '')))?.at
        : '') ||
      '',
  ).trim();
}

function isDelivered(order) {
  if (String(order.status || '').toLowerCase() === 'entregado') return true;
  return Boolean(orderDeliveredAtIso(order));
}

function isCancelled(order) {
  return /cancel/.test(String(order.status || '').toLowerCase());
}

function isRefunded(order) {
  if (String(order.paymentStatus || '').toLowerCase() === 'refunded') return true;
  return String(order.status || '').toLowerCase() === 'devuelto';
}

function orderDayKey(order) {
  const delivered = orderDeliveredAtIso(order);
  if (delivered) {
    const k = foldDay(delivered);
    if (k) return k;
  }
  if (isDelivered(order)) {
    const k = foldDay(String(order.updatedAt || ''));
    if (k) return k;
  }
  return foldDay(String(order.createdAt || ''));
}

function orderEuro(order) {
  const t = Number(order.totalAmount ?? order.total);
  if (Number.isFinite(t) && t > 0) return t;
  return 0;
}

async function couchAllDocs(db) {
  const url = `${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error(`Couch ${db}: ${res.status}`);
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}

function emptyFood() {
  return { pizza: 0, burger: 0, taco: 0 };
}

function sumFood(a, b) {
  return {
    pizza: (a?.pizza || 0) + (b?.pizza || 0),
    burger: (a?.burger || 0) + (b?.burger || 0),
    taco: (a?.taco || 0) + (b?.taco || 0),
  };
}

function auditDay(dayKey, orders, sessions) {
  const dayOrders = orders.filter((o) => orderDayKey(o) === dayKey);
  const daySessions = sessions.filter((s) => sessionWorkDayKey(s) === dayKey);

  // Cierre: canales declarados
  const closingByChannel = {};
  const closingFoodByChannel = {};
  const overlaid = new Set();
  const sessionDetails = [];

  for (const s of daySessions) {
    const row = {
      id: s._id,
      status: s.status,
      pdv: s.pointOfSaleName || s.pointOfSaleId,
      openedAt: s.openedAt,
      closedAt: s.closedAt || null,
      totals: {},
      foodByCh: {},
    };
    for (const ch of CLOSING_CHANNELS) {
      const declared = r2(Number(s.aggregatorClosingTotals?.[ch] || 0));
      const brandMap = s.aggregatorClosingBrandTotals?.[ch] || {};
      let brandSum = 0;
      for (const v of Object.values(brandMap)) brandSum = r2(brandSum + (Number(v) || 0));
      if (declared <= 0 && brandSum <= 0) continue;
      const effective = declared > 0 ? declared : brandSum;
      const key = ch === 'app' ? 'flipdish' : ch;
      closingByChannel[key] = r2((closingByChannel[key] || 0) + effective);
      overlaid.add(ch);
      if (ch === 'app') overlaid.add('flipdish');
      if (ch === 'flipdish') overlaid.add('app');
      row.totals[ch] = { declared, brandSum, effective };
      const food = s.productClosingCounts?.byChannel?.[ch];
      if (food) {
        closingFoodByChannel[key] = sumFood(
          closingFoodByChannel[key] || emptyFood(),
          {
            pizza: Math.max(0, Math.floor(Number(food.pizza) || 0)),
            burger: Math.max(0, Math.floor(Number(food.burger) || 0)),
            taco: Math.max(0, Math.floor(Number(food.taco) || 0)),
          },
        );
        row.foodByCh[ch] = food;
      }
    }
    if (Object.keys(row.totals).length) sessionDetails.push(row);
  }

  // Pedidos por canal
  const ordersByChannel = {};
  const keptByChannel = {};
  const replacedByChannel = {};
  const orderFoodAll = emptyFood();
  const orderFoodKept = emptyFood();
  const uberOrders = [];

  for (const o of dayOrders) {
    if (isCancelled(o) || isRefunded(o)) continue;
    if (!isDelivered(o) && String(o.paymentStatus || '') !== 'paid' && !o.paymentCollected) {
      // mismo panel: suele contar entregados; también cobrados
      // CompanyBrandPerformance usa activeOrders filtrados en dashboard — asumimos entregados/cobrados
    }
    const ch = normalizeChannel(o.channel);
    const euro = orderEuro(o);
    const food = buildFoodFamilyCountsFromOrders([o]);
    ordersByChannel[ch] = r2((ordersByChannel[ch] || 0) + euro);
    orderFoodAll.pizza += food.pizza;
    orderFoodAll.burger += food.burger;
    orderFoodAll.taco += food.taco;

    const replaced = overlaid.has(ch);
    if (replaced) {
      replacedByChannel[ch] = r2((replacedByChannel[ch] || 0) + euro);
    } else {
      keptByChannel[ch] = r2((keptByChannel[ch] || 0) + euro);
      orderFoodKept.pizza += food.pizza;
      orderFoodKept.burger += food.burger;
      orderFoodKept.taco += food.taco;
    }

    if (ch === 'ubereats') {
      uberOrders.push({
        id: o._id,
        number: o.orderNumber,
        status: o.status,
        euro,
        dayKey: orderDayKey(o),
        createdAt: o.createdAt,
        deliveredAt: o.deliveredAt || null,
        food,
        replaced,
        pdv: o.salesPointName || o.pointOfSaleName || o.salesPointId,
      });
    }
  }

  // Dashboard panel: pedidos no pisados + cierre
  const dashboardChannel = { ...keptByChannel };
  for (const [ch, amt] of Object.entries(closingByChannel)) {
    dashboardChannel[ch] = r2((dashboardChannel[ch] || 0) + amt);
  }
  // Comida dashboard: pedidos no pisados + food de cierre (canales pisados)
  const closingFoodTotal = Object.values(closingFoodByChannel).reduce(
    (acc, f) => sumFood(acc, f),
    emptyFood(),
  );
  // Nota: el panel suma foodFamilyCountsFromOrders(kept) + closing.food
  // closing.food solo suma byChannel de canales DECLARADOS (pisados)
  const dashboardFood = sumFood(orderFoodKept, closingFoodTotal);

  // Riesgo: food de pedidos de canales NO pisados + food cierre; si cierre no declara food, se pierden uds
  // Riesgo inverso: food de pedidos de canal pisado se excluye bien, pero si cierre food=0, dashboard pierde burgers/tacos

  return {
    dayKey,
    weekday: weekdayNameEs(dayKey),
    sessions: daySessions.length,
    sessionsWithClosing: sessionDetails.length,
    sessionDetails,
    orderCount: dayOrders.length,
    ordersByChannel,
    keptByChannel,
    replacedByChannel,
    closingByChannel,
    dashboardChannel,
    uberOrders: uberOrders.sort((a, b) => b.euro - a.euro),
    food: {
      ordersAll: orderFoodAll,
      ordersKept: orderFoodKept,
      closing: closingFoodTotal,
      dashboard: dashboardFood,
      gapIfClosingFoodMissing: {
        // si hay overlay uber/glovo pero food cierre 0, las uds de esos pedidos no entran
        note: 'Si canal pisado y productClosingCounts.byChannel vacío → burgers/tacos del cierre no aparecen y los pedidos se excluyen',
      },
    },
  };
}

async function main() {
  const todayKey = madridDayKey();
  const { thu, fri } = resolveThuFri(todayKey);
  // También el jueves/viernes inmediatamente anteriores por si miran la semana pasada
  const prevThu = addDaysKey(thu, -7);
  const prevFri = addDaysKey(fri, -7);
  const days = [...new Set([thu, fri, prevThu, prevFri])].sort();

  console.log(JSON.stringify({ mode: 'READ_ONLY', todayKey, focus: { thu, fri }, also: { prevThu, prevFri } }, null, 2));

  const docs = await couchAllDocs(DB);
  const orders = docs.filter(
    (d) =>
      d &&
      (d.type === 'delivery_order' || d.type === 'order') &&
      bid(d) === DIS,
  );
  const sessions = docs.filter(
    (d) => d && d.type === 'tpv_register_session' && bid(d) === DIS,
  );

  // Fallback: si DIS no tiene datos, probar por user Pau en otro business_id
  let bizId = DIS;
  let usedOrders = orders;
  let usedSessions = sessions;
  if (orders.length === 0) {
    const byBiz = new Map();
    for (const d of docs) {
      if (!d || (d.type !== 'delivery_order' && d.type !== 'order')) continue;
      if (String(d.user_id || '') !== PAU && String(d.ownerUserId || '') !== PAU) continue;
      const b = bid(d) || '_';
      byBiz.set(b, (byBiz.get(b) || 0) + 1);
    }
    console.log('No orders for DIS; Pau order counts by business:', Object.fromEntries(byBiz));
  }

  console.log({
    business: bizId,
    orders: usedOrders.length,
    sessions: usedSessions.length,
  });

  const report = {};
  for (const day of days) {
    report[day] = auditDay(day, usedOrders, usedSessions);
  }

  // Resumen compacto
  for (const day of days) {
    const a = report[day];
    console.log('\n========', a.weekday.toUpperCase(), day, '========');
    console.log('Uber pedidos (todos):', a.ordersByChannel.ubereats || 0, '€');
    console.log('Uber reemplazados por cierre:', a.replacedByChannel.ubereats || 0, '€');
    console.log('Uber cierre declarado:', a.closingByChannel.ubereats || 0, '€');
    console.log('Uber en dashboard (kept+cierre):', a.dashboardChannel.ubereats || 0, '€');
    console.log('Food pedidos all P/B/T:', a.food.ordersAll);
    console.log('Food pedidos kept P/B/T:', a.food.ordersKept);
    console.log('Food cierre P/B/T:', a.food.closing);
    console.log('Food dashboard P/B/T:', a.food.dashboard);
    console.log(
      'Uber pedidos detalle:',
      a.uberOrders.map((u) => ({
        n: u.number,
        eur: u.euro,
        replaced: u.replaced,
        food: u.food,
        status: u.status,
      })),
    );
    console.log(
      'Cierres con apps:',
      a.sessionDetails.map((s) => ({
        pdv: s.pdv,
        status: s.status,
        totals: s.totals,
        foodByCh: s.foodByCh,
      })),
    );
  }

  // Flag 39.25
  for (const day of days) {
    const a = report[day];
    const hit = a.uberOrders.filter((u) => Math.abs(u.euro - 39.25) < 0.02);
    const dash = a.dashboardChannel.ubereats;
    if (hit.length || Math.abs((dash || 0) - 39.25) < 0.02) {
      console.log('\n*** MATCH ~39,25 en', day, '***', { dash, hit });
    }
  }

  // Buscar 39,25 en cierres Uber (cualquier día reciente) y en pedidos
  console.log('\n======== BUSQUEDA 39.25 (Uber / cierres) ========');
  const recentSessions = usedSessions.filter((s) => {
    const k = sessionWorkDayKey(s);
    return k >= addDaysKey(todayKey, -21) && k <= todayKey;
  });
  for (const s of recentSessions) {
    const u = r2(Number(s.aggregatorClosingTotals?.ubereats || 0));
    if (Math.abs(u - 39.25) < 0.02) {
      console.log('CIERRE Uber 39.25', {
        day: sessionWorkDayKey(s),
        pdv: s.pointOfSaleName,
        status: s.status,
        id: s._id,
        totals: s.aggregatorClosingTotals,
        foodUber: s.productClosingCounts?.byChannel?.ubereats || null,
      });
    }
    // también sumas parciales / brand totals
    const brandU = s.aggregatorClosingBrandTotals?.ubereats || {};
    for (const [bid, raw] of Object.entries(brandU)) {
      const amt = r2(Number(raw) || 0);
      if (Math.abs(amt - 39.25) < 0.02) {
        console.log('CIERRE Uber brand 39.25', {
          day: sessionWorkDayKey(s),
          pdv: s.pointOfSaleName,
          brand: bid,
          label: s.closingBrandLabels?.[bid],
        });
      }
    }
  }
  for (const o of usedOrders) {
    if (normalizeChannel(o.channel) !== 'ubereats') continue;
    if (Math.abs(orderEuro(o) - 39.25) < 0.02) {
      console.log('PEDIDO Uber 39.25', {
        day: orderDayKey(o),
        number: o.orderNumber,
        status: o.status,
        createdAt: o.createdAt,
        deliveredAt: o.deliveredAt,
      });
    }
  }

  // Detalle food cierre por canal (jueves/viernes foco)
  for (const day of [thu, fri]) {
    console.log('\n======== FOOD CIERRE DETALLE', day, '========');
    const daySessions = usedSessions.filter((s) => sessionWorkDayKey(s) === day);
    for (const s of daySessions) {
      console.log({
        pdv: s.pointOfSaleName,
        totals: s.aggregatorClosingTotals,
        foodByCh: s.productClosingCounts?.byChannel || null,
        foodTop: s.productClosingCounts
          ? {
              pizza: s.productClosingCounts.pizza,
              burger: s.productClosingCounts.burger,
              taco: s.productClosingCounts.taco,
            }
          : null,
      });
    }
    // pedidos con burger/taco ese día
    const foodOrders = usedOrders.filter((o) => {
      if (orderDayKey(o) !== day) return false;
      if (isCancelled(o) || isRefunded(o)) return false;
      const f = buildFoodFamilyCountsFromOrders([o]);
      return f.burger > 0 || f.taco > 0;
    });
    console.log(
      'Pedidos con burger/taco',
      foodOrders.map((o) => ({
        n: o.orderNumber,
        ch: normalizeChannel(o.channel),
        eur: orderEuro(o),
        food: buildFoodFamilyCountsFromOrders([o]),
        status: o.status,
      })),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
