#!/usr/bin/env node
/**
 * Solo lectura: hueco Caja2 sin marca (~1.1k€) — ¿dónde iría con reglas actuales / pedidos?
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { attributeOrderRevenueByBrand } = require(
  path.join(root, 'shared/delivery/orderLineRevenueSplit.js'),
);

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
function madridDay(d = new Date()) {
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
  return madridDay(d);
}
function sessionDay(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return foldDay(raw);
}
function orderDay(o) {
  const del = String(o.deliveredAt || o.completedAt || '').trim();
  if (del) return foldDay(del);
  if (String(o.status || '').toLowerCase() === 'entregado') return foldDay(String(o.updatedAt || ''));
  return foldDay(String(o.createdAt || ''));
}
function orderEuro(o) {
  const t = Number(o.totalAmount ?? o.total);
  if (Number.isFinite(t) && t > 0) return t;
  return 0;
}
function canonCh(ch) {
  return ch === 'app' ? 'flipdish' : ch;
}

const docs = (
  await (
    await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=80000`, {
      headers: { Authorization: AUTH, Accept: 'application/json' },
    })
  ).json()
).rows.map((r) => r.doc).filter(Boolean);

const today = madridDay();
const monthStart = `${today.slice(0, 7)}-01`;

// billing rules
let billing = docs.find(
  (d) => d.type === 'brand_billing_config' && (bid(d) === DIS || d._id === `brand-billing-${DIS}`),
);
try {
  if (!billing) {
    billing = await (
      await fetch(`${COUCH}/bbddsaas-delivery/${encodeURIComponent(`brand-billing-${DIS}`)}`, {
        headers: { Authorization: AUTH, Accept: 'application/json' },
      })
    ).json();
    if (billing.error) billing = null;
  }
} catch {
  billing = null;
}
const rules = {
  sharedSplitMode: String(billing?.sharedSplitMode || 'majority') === 'equal' ? 'equal' : 'majority',
  monoBrandTakesAll: billing?.monoBrandTakesAll !== false,
};

const brandLabels = {};
const sessions = docs.filter(
  (d) => d.type === 'tpv_register_session' && !d.deletedAt && bid(d) === DIS,
);
const orders = docs.filter((d) => {
  if (d.deletedAt) return false;
  if (d.type !== 'delivery_order' && d.type !== 'order') return false;
  if (bid(d) !== DIS) return false;
  const st = String(d.status || '').toLowerCase();
  if (/cancel/.test(st) || st === 'devuelto') return false;
  return true;
});

// Month order attribution by brand (TPV reality)
const orderByBrandMonth = {};
let orderUnbranded = 0;
let orderTotal = 0;
const orderByBrandByDay = {}; // day -> brandId -> €

for (const o of orders) {
  const day = orderDay(o);
  if (!day || day < monthStart || day > today) continue;
  const rev = orderEuro(o);
  if (rev <= 0) continue;
  orderTotal = r2(orderTotal + rev);
  const att = attributeOrderRevenueByBrand(o, rules);
  const sum =
    Object.values(att.byBrand).reduce((s, n) => s + (Number(n) || 0), 0) +
    (Number(att.unbranded) || 0);
  const scale = sum > 0 ? rev / sum : 1;
  if (!orderByBrandByDay[day]) orderByBrandByDay[day] = {};
  for (const [id, amt] of Object.entries(att.byBrand)) {
    const v = r2((Number(amt) || 0) * scale);
    if (v <= 0) continue;
    orderByBrandMonth[id] = r2((orderByBrandMonth[id] || 0) + v);
    orderByBrandByDay[day][id] = r2((orderByBrandByDay[day][id] || 0) + v);
  }
  orderUnbranded = r2(orderUnbranded + (Number(att.unbranded) || 0) * scale);
}

// Gaps from closings
let gapTotal = 0;
let declaredBrand = {};
const gapSamples = [];
/** Simulations */
const sim = {
  /** proporcional a lo YA declarado por marca ese canal ese cierre */
  propDeclared: {},
  /** proporcional a pedidos TPV del mismo día (ambas marcas) */
  propOrdersSameDay: {},
  /** equal 50/50 entre marcas presentes ese día en pedidos (o en declarado) */
  equalPresent: {},
  /** majority: todo a la marca con más € pedidos ese día */
  majorityOrdersDay: {},
};

function addSim(bucket, id, amt) {
  if (!id || amt <= 0) return;
  bucket[id] = r2((bucket[id] || 0) + amt);
}

for (const s of sessions) {
  const day = sessionDay(s);
  if (!day || day < monthStart || day > today) continue;
  for (const [id, label] of Object.entries(s.closingBrandLabels || {})) {
    if (id && label) brandLabels[id] = label;
  }
  for (const ch of CHANNELS) {
    const declaredTotal = r2(Number(s.aggregatorClosingTotals?.[ch] || 0));
    const brandMap = s.aggregatorClosingBrandTotals?.[ch] || {};
    let brandSum = 0;
    const brands = [];
    for (const [id, raw] of Object.entries(brandMap)) {
      const amt = r2(Number(raw) || 0);
      if (!id || amt <= 0) continue;
      brands.push([id, amt]);
      brandSum = r2(brandSum + amt);
      declaredBrand[id] = r2((declaredBrand[id] || 0) + amt);
    }
    if (declaredTotal <= 0 && brandSum <= 0) continue;
    const effective = declaredTotal > 0 ? declaredTotal : brandSum;
    const gap = r2(effective - brandSum);
    if (gap <= 0.009) continue;
    gapTotal = r2(gapTotal + gap);
    if (gapSamples.length < 6) {
      gapSamples.push({
        day,
        channel: canonCh(ch),
        effective,
        brandSum,
        gap,
        brands: Object.fromEntries(brands.map(([id, amt]) => [brandLabels[id] || id.slice(0, 8), amt])),
      });
    }

    // --- propDeclared ---
    if (brandSum > 0) {
      for (const [id, amt] of brands) {
        addSim(sim.propDeclared, id, r2(gap * (amt / brandSum)));
      }
    } else {
      // sin marcas en ese canal: caer a pedidos del día
      const dayOrders = orderByBrandByDay[day] || {};
      const daySum = r2(Object.values(dayOrders).reduce((s, n) => s + n, 0));
      if (daySum > 0) {
        for (const [id, amt] of Object.entries(dayOrders)) {
          addSim(sim.propDeclared, id, r2(gap * (amt / daySum)));
        }
      }
    }

    // --- propOrdersSameDay ---
    {
      const dayOrders = orderByBrandByDay[day] || {};
      const daySum = r2(Object.values(dayOrders).reduce((s, n) => s + n, 0));
      if (daySum > 0) {
        for (const [id, amt] of Object.entries(dayOrders)) {
          addSim(sim.propOrdersSameDay, id, r2(gap * (amt / daySum)));
        }
      } else if (brandSum > 0) {
        for (const [id, amt] of brands) {
          addSim(sim.propOrdersSameDay, id, r2(gap * (amt / brandSum)));
        }
      }
    }

    // --- equalPresent ---
    {
      const ids = new Set([
        ...brands.map(([id]) => id),
        ...Object.keys(orderByBrandByDay[day] || {}).filter(
          (id) => (orderByBrandByDay[day][id] || 0) > 0,
        ),
      ]);
      const list = [...ids];
      if (list.length === 0 && Object.keys(orderByBrandMonth).length) {
        list.push(...Object.keys(orderByBrandMonth));
      }
      if (list.length > 0) {
        const each = r2(gap / list.length);
        list.forEach((id, i) => {
          const part = i === list.length - 1 ? r2(gap - each * (list.length - 1)) : each;
          addSim(sim.equalPresent, id, part);
        });
      }
    }

    // --- majorityOrdersDay ---
    {
      const dayOrders = orderByBrandByDay[day] || {};
      let winner = '';
      let best = -1;
      for (const [id, amt] of Object.entries(dayOrders)) {
        if (amt > best) {
          best = amt;
          winner = id;
        }
      }
      if (!winner && brands.length) {
        winner = brands.slice().sort((a, b) => b[1] - a[1])[0][0];
      }
      if (winner) addSim(sim.majorityOrdersDay, winner, gap);
    }
  }
}

function named(map) {
  return Object.fromEntries(
    Object.entries(map)
      .map(([id, amt]) => [brandLabels[id] || id.slice(0, 10), amt])
      .sort((a, b) => b[1] - a[1]),
  );
}

const orderNamed = named(orderByBrandMonth);
const orderMix = Object.fromEntries(
  Object.entries(orderNamed).map(([name, amt]) => [
    name,
    orderTotal > 0 ? r2((100 * amt) / orderTotal) : 0,
  ]),
);

console.log(
  JSON.stringify(
    {
      rulesNow: {
        source: billing ? billing._id : 'defaults',
        sharedSplitMode: rules.sharedSplitMode,
        monoBrandTakesAll: rules.monoBrandTakesAll,
        note: 'Sin config Facturación en Couch → majority + monoBrandTakesAll (como el motor de pedidos).',
      },
      gapSinMarcaMes: gapTotal,
      yaDeclaradoCaja2PorMarca: named(declaredBrand),
      pedidosTpvMes_atribuidos: {
        total: orderTotal,
        unbranded: orderUnbranded,
        byBrand: orderNamed,
        mixPct: orderMix,
      },
      siSeReparteElGap: {
        A_propALoDeclaradoEnEseCanal: named(sim.propDeclared),
        B_propAPedidosDelMismoDia_recomendado: named(sim.propOrdersSameDay),
        C_equalEntreMarcasPresentes: named(sim.equalPresent),
        D_majorityTodoALaQueMandaEseDia: named(sim.majorityOrdersDay),
      },
      marcasDespuesDeB_propPedidos: (() => {
        const out = { ...named(declaredBrand) };
        for (const [name, amt] of Object.entries(named(sim.propOrdersSameDay))) {
          out[name] = r2((out[name] || 0) + amt);
        }
        return out;
      })(),
      samplesGap: gapSamples,
      recomendacion:
        'La más lógica con “mirar pedidos de ambas marcas”: B (proporcional al mix TPV del día). Con reglas actuales de cruce (majority) sería D (casi todo a Modomio). Equal 50/50 (C) solo si quieres forzar paridad artificial.',
    },
    null,
    2,
  ),
);
