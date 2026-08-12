#!/usr/bin/env node
/**
 * Solo lectura: ¿doble conteo marcas Pau?
 * Para días con cierre Caja 2, cuenta pedidos agregador que DEBERÍAN excluirse.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DB = 'bbddsaas-delivery';
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
function normCh(ch) {
  const c = String(ch || '').toLowerCase().trim();
  if (!c) return 'tpv';
  if (c === 'uber' || c === 'uber_eats' || c === 'uber-eats') return 'ubereats';
  if (c === 'just_eat' || c === 'just-eat') return 'justeat';
  return c;
}
function orderDay(o) {
  const del = String(o.deliveredAt || o.completedAt || '').trim();
  if (del) return foldDay(del);
  if (String(o.status || '').toLowerCase() === 'entregado') return foldDay(String(o.updatedAt || ''));
  return foldDay(String(o.createdAt || ''));
}
function euro(o) {
  const t = Number(o.totalAmount ?? o.total);
  if (Number.isFinite(t) && t > 0) return t;
  return 0;
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const today = localDay();
const monthStart = `${today.slice(0, 7)}-01`;
const docs = await allDocs(DB);
const sessions = docs.filter(
  (d) => d.type === 'tpv_register_session' && !d.deletedAt && bid(d) === DIS,
);
const orders = docs.filter((d) => {
  if (d.deletedAt) return false;
  if (d.type !== 'delivery_order' && d.type !== 'order') return false;
  if (bid(d) !== DIS) return false;
  const st = String(d.status || '').toLowerCase();
  if (/cancel/.test(st) || st === 'devuelto') return false;
  if (String(d.paymentStatus || '').toLowerCase() === 'refunded') return false;
  return true;
});

// Build overlay day→channels like UI
const overlaid = new Map();
const closingDetail = [];
for (const s of sessions) {
  const day = sessionDay(s);
  if (!day || day < monthStart || day > today) continue;
  const row = {
    id: s._id,
    day,
    pdv: s.pointOfSaleId || s.pdvName || s.salesPointName,
    totals: {},
    brands: {},
  };
  for (const ch of CHANNELS) {
    const tot = r2(Number(s.aggregatorClosingTotals?.[ch] || 0));
    const brandMap = s.aggregatorClosingBrandTotals?.[ch] || {};
    let brandSum = 0;
    const brands = {};
    for (const [bid0, raw] of Object.entries(brandMap)) {
      const amt = r2(Number(raw) || 0);
      if (amt <= 0) continue;
      brands[bid0] = amt;
      brandSum = r2(brandSum + amt);
    }
    if (tot <= 0 && brandSum <= 0) continue;
    row.totals[ch] = tot > 0 ? tot : brandSum;
    row.brands[ch] = brands;
    let set = overlaid.get(day);
    if (!set) {
      set = new Set();
      overlaid.set(day, set);
    }
    if (ch === 'flipdish' || ch === 'app') {
      set.add('flipdish');
      set.add('app');
    } else set.add(ch);
  }
  if (Object.keys(row.totals).length) closingDetail.push(row);
}

// Channel histogram of month orders
const byCh = {};
const byDayCh = {};
let riskEuro = 0;
const riskSamples = [];
for (const o of orders) {
  const day = orderDay(o);
  if (!day || day < monthStart || day > today) continue;
  const ch = normCh(o.channel);
  byCh[ch] = (byCh[ch] || 0) + 1;
  const k = `${day}|${ch}`;
  byDayCh[k] = r2((byDayCh[k] || 0) + euro(o));
  const set = overlaid.get(day);
  const wouldReplace = Boolean(set?.has(ch));
  if (wouldReplace) {
    riskEuro = r2(riskEuro + euro(o));
    if (riskSamples.length < 8) {
      riskSamples.push({
        id: o._id,
        day,
        channel: o.channel,
        norm: ch,
        euro: euro(o),
        status: o.status,
      });
    }
  }
}

// Aggregator orders on overlaid days that would NOT match (channel mismatch)
let mismatchEuro = 0;
const mismatchSamples = [];
for (const o of orders) {
  const day = orderDay(o);
  if (!overlaid.has(day)) continue;
  const ch = normCh(o.channel);
  if (!['glovo', 'ubereats', 'justeat', 'flipdish', 'app'].includes(ch)) continue;
  if (overlaid.get(day).has(ch)) continue;
  mismatchEuro = r2(mismatchEuro + euro(o));
  if (mismatchSamples.length < 8) {
    mismatchSamples.push({ id: o._id, day, channel: o.channel, norm: ch, euro: euro(o) });
  }
}

// Raw channel values on orders
const rawChannels = {};
for (const o of orders) {
  const day = orderDay(o);
  if (!day || day < monthStart || day > today) continue;
  const raw = String(o.channel || '(empty)');
  rawChannels[raw] = (rawChannels[raw] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      today,
      monthStart,
      closingSessionsWithAgg: closingDetail.length,
      overlaidDays: [...overlaid.keys()].sort(),
      orderChannelsMonth: byCh,
      rawChannelsMonth: rawChannels,
      /** Pedidos que el panel SÍ excluiría (mismo día+canal que cierre). */
      wouldBeReplacedEuro: riskEuro,
      wouldBeReplacedSamples: riskSamples,
      /** Pedidos agregador en día con cierre pero canal no declarado ese día. */
      aggregatorOnOverlaidDayButChannelNotDeclaredEuro: mismatchEuro,
      mismatchSamples,
      /** Si wouldBeReplacedEuro>0 y el panel los sumara TAMBIÉN vía cierre → doble conteo. */
      verdict:
        riskEuro > 0
          ? 'Hay pedidos Vertial en días/canales con cierre: el panel debe excluirlos (anti doble conteo). Si closingToBrands también suma esos €, el cálculo es correcto SOLO si se excluyen.'
          : 'No hay pedidos Vertial en los días/canales declarados al cierre → el € de apps viene solo del cierre (sin doble conteo de pedidos).',
      noteGap:
        'Si aggregatorClosingTotals > suma aggregatorClosingBrandTotals, ese hueco NO entra en filas de marca (sí en vista integradores).',
      sampleClosings: closingDetail.slice(0, 3).map((c) => ({
        day: c.day,
        pdv: c.pdv,
        totals: c.totals,
        brandKeys: Object.fromEntries(
          Object.entries(c.brands).map(([ch, m]) => [ch, Object.keys(m).length]),
        ),
      })),
    },
    null,
    2,
  ),
);
