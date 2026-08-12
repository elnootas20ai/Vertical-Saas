#!/usr/bin/env node
/**
 * Solo lectura: recalcula Dashboard → Marcas (día / mes) para Pau (DISARMINK / Modomio)
 * con la misma lógica que CompanyBrandPerformancePanel + closingBrandOverlay.
 *
 * Uso VPS: node scripts/diag-pau-dashboard-marcas.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  attributeOrderRevenueByBrand,
  attributeOrderUnitsByBrand,
  lineRevenueAmount,
} = require(path.join(root, 'shared/delivery/orderLineRevenueSplit.js'));

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MOD = '33821959-ae50-4e52-bfea-ea2b145faeac';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DB = 'bbddsaas-delivery';
const BRAND_DBS = ['bbddsaas-brands', 'udar-brands', 'vertial-brands', 'bbddsaas'];

const CLOSING_AGGREGATOR_CHANNELS = ['glovo', 'ubereats', 'justeat', 'flipdish', 'app'];

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function localCalendarDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  return localCalendarDayKey(d);
}

function normalizeOrderChannel(channel) {
  const ch = String(channel || '').toLowerCase().trim();
  if (!ch) return 'tpv';
  if (ch === 'uber' || ch === 'uber_eats' || ch === 'uber-eats') return 'ubereats';
  if (ch === 'just_eat' || ch === 'just-eat') return 'justeat';
  return ch;
}

function channelAliases(channel) {
  if (channel === 'flipdish' || channel === 'app') return ['flipdish', 'app'];
  return [channel];
}

function canonicalChannel(channel) {
  return channel === 'app' ? 'flipdish' : channel;
}

function isRefunded(order) {
  if (String(order.paymentStatus || '').toLowerCase() === 'refunded') return true;
  return String(order.status || '').toLowerCase() === 'devuelto';
}

function isCancelled(order) {
  return /cancel/.test(String(order.status || '').toLowerCase());
}

function orderDeliveredAtIso(order) {
  return String(
    order.deliveredAt ||
      order.completedAt ||
      (Array.isArray(order.stageHistory)
        ? [...order.stageHistory].reverse().find((s) => /entreg/i.test(String(s?.status || s?.stage || '')))
            ?.at
        : '') ||
      '',
  ).trim();
}

function isDelivered(order) {
  if (String(order.status || '').toLowerCase() === 'entregado') return true;
  return Boolean(orderDeliveredAtIso(order));
}

function foldDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localCalendarDayKey(d);
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

function dayKeyInRange(day, range, todayKey) {
  if (!day) return false;
  if (range === 'day') return day === todayKey;
  if (range === 'month') {
    const monthStart = `${todayKey.slice(0, 7)}-01`;
    return day >= monthStart && day <= todayKey;
  }
  return day.slice(0, 4) === todayKey.slice(0, 4);
}

function orderEuro(order) {
  const t = Number(order.totalAmount ?? order.total);
  if (Number.isFinite(t) && t > 0) return t;
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((s, it) => s + lineRevenueAmount(it), 0);
}

function emptyClosing() {
  return {
    overlaidChannelsByDay: new Map(),
    revenueByBrand: {},
    revenueByChannel: {},
    revenueByChannelByBrand: {},
    brandLabels: {},
    hasData: false,
    /** € de canal declarado sin reparto a marca (posible agujero en panel marcas). */
    unattributedByChannel: {},
    sessionsUsed: 0,
  };
}

function buildClosingBrandOverlay(sessions, dayInRange) {
  const overlay = emptyClosing();
  if (!Array.isArray(sessions) || sessions.length === 0) return overlay;

  for (const session of sessions) {
    const dayKey = sessionWorkDayKey(session);
    if (!dayKey || !dayInRange(dayKey)) continue;

    for (const [brandId, label] of Object.entries(session.closingBrandLabels || {})) {
      const id = String(brandId || '').trim();
      const name = String(label || '').trim();
      if (id && name && !overlay.brandLabels[id]) overlay.brandLabels[id] = name;
    }

    let used = false;
    for (const channel of CLOSING_AGGREGATOR_CHANNELS) {
      const declaredTotal = r2(Number(session.aggregatorClosingTotals?.[channel] || 0));
      const brandMap = session.aggregatorClosingBrandTotals?.[channel] || {};
      let brandSum = 0;
      const brandAmounts = [];
      for (const [brandId, raw] of Object.entries(brandMap)) {
        const id = String(brandId || '').trim();
        const amt = r2(Number(raw) || 0);
        if (!id || amt <= 0) continue;
        brandAmounts.push([id, amt]);
        brandSum = r2(brandSum + amt);
      }
      if (declaredTotal <= 0 && brandSum <= 0) continue;

      used = true;
      const effectiveTotal = declaredTotal > 0 ? declaredTotal : brandSum;
      let daySet = overlay.overlaidChannelsByDay.get(dayKey);
      if (!daySet) {
        daySet = new Set();
        overlay.overlaidChannelsByDay.set(dayKey, daySet);
      }
      for (const alias of channelAliases(channel)) daySet.add(alias);

      const chKey = canonicalChannel(channel);
      overlay.revenueByChannel[chKey] = r2((overlay.revenueByChannel[chKey] || 0) + effectiveTotal);
      for (const [id, amt] of brandAmounts) {
        overlay.revenueByBrand[id] = r2((overlay.revenueByBrand[id] || 0) + amt);
        const chMap = overlay.revenueByChannelByBrand[chKey] || {};
        chMap[id] = r2((chMap[id] || 0) + amt);
        overlay.revenueByChannelByBrand[chKey] = chMap;
      }
      const gap = r2(effectiveTotal - brandSum);
      if (gap > 0.009) {
        overlay.unattributedByChannel[chKey] = r2(
          (overlay.unattributedByChannel[chKey] || 0) + gap,
        );
      }
      overlay.hasData = true;
    }
    if (used) overlay.sessionsUsed += 1;
  }
  return overlay;
}

function isOrderReplacedByClosing(overlay, orderDay, channel) {
  if (!overlay.hasData) return false;
  const daySet = overlay.overlaidChannelsByDay.get(orderDay);
  return Boolean(daySet?.has(channel));
}

function buildBrandRows(orders, brandNameById, rules, closing) {
  const revenue = {};
  const units = {};
  const orderHit = {};
  let orderEuroTotal = 0;
  let attributedToBrands = 0;
  let unbranded = 0;
  let multiBrandOrders = 0;

  for (const order of orders) {
    const rev = orderEuro(order);
    orderEuroTotal = r2(orderEuroTotal + rev);
    const attributed = attributeOrderRevenueByBrand(order, rules);
    const unitMap = attributeOrderUnitsByBrand(order, rules);
    const attributedSum =
      Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0) +
      (Number(attributed.unbranded) || 0);
    const scale = attributedSum > 0 && rev > 0 ? rev / attributedSum : 1;
    const brandKeys = Object.keys(attributed.byBrand).filter((k) => (Number(attributed.byBrand[k]) || 0) > 0);
    if (brandKeys.length >= 2) multiBrandOrders += 1;

    for (const [id, amt] of Object.entries(attributed.byBrand)) {
      const v = (Number(amt) || 0) * scale;
      if (v <= 0) continue;
      revenue[id] = (revenue[id] || 0) + v;
      orderHit[id] = (orderHit[id] || 0) + 1;
      attributedToBrands = r2(attributedToBrands + v);
    }
    unbranded = r2(unbranded + (Number(attributed.unbranded) || 0) * scale);

    for (const [id, u] of Object.entries(unitMap)) {
      const n = Number(u) || 0;
      if (n <= 0) continue;
      units[id] = (units[id] || 0) + n;
    }
  }

  let closingToBrands = 0;
  if (closing) {
    for (const [id, amt] of Object.entries(closing.revenueByBrand)) {
      const v = Number(amt) || 0;
      if (v <= 0) continue;
      revenue[id] = (revenue[id] || 0) + v;
      closingToBrands = r2(closingToBrands + v);
    }
  }

  const rows = Object.keys(revenue)
    .map((id) => ({
      brandId: id,
      name: brandNameById.get(id) || closing?.brandLabels?.[id] || id.slice(0, 8),
      revenue: r2(revenue[id] || 0),
      units: Math.round((units[id] || 0) * 10) / 10,
      orderCount: orderHit[id] || 0,
      fromOrders: r2((revenue[id] || 0) - (closing?.revenueByBrand?.[id] || 0)),
      fromClosing: r2(closing?.revenueByBrand?.[id] || 0),
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const brandSum = r2(rows.reduce((s, r) => s + r.revenue, 0));
  const panelTotalLikeUi = r2(orderEuroTotal + closingToBrands);

  return {
    rows,
    orderCount: orders.length,
    orderEuroTotal,
    attributedToBrands,
    unbranded,
    multiBrandOrders,
    closingToBrands,
    brandSum,
    panelTotalLikeUi,
    unattributedClosing: closing?.unattributedByChannel || {},
    unattributedClosingSum: r2(
      Object.values(closing?.unattributedByChannel || {}).reduce((s, n) => s + (Number(n) || 0), 0),
    ),
  };
}

async function couch(p) {
  const res = await fetch(`${COUCH}${p}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p}: ${data.reason || data.error || res.status}`);
  return data;
}

async function allDocs(db) {
  const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function splitRulesFromBillingConfig(config) {
  const mode = String(config?.sharedSplitMode || 'majority').trim();
  const sharedSplitMode = mode === 'equal' || mode === 'by_units' ? 'equal' : 'majority';
  return {
    sharedSplitMode,
    monoBrandTakesAll: config?.monoBrandTakesAll !== false,
    orphanMode: String(config?.orphanMode || 'shift_majority'),
    orphanFixedBrandId: String(config?.orphanFixedBrandId || '').trim(),
  };
}

const todayKey = localCalendarDayKey();
console.log(JSON.stringify({ couch: COUCH, todayKey, businesses: { DIS, MOD }, pau: PAU }, null, 2));

const docs = await allDocs(DB);
const brandNameById = new Map();
for (const db of BRAND_DBS) {
  try {
    const rows = await allDocs(db);
    for (const d of rows) {
      if (!d || (d.type && d.type !== 'brand')) continue;
      const id = String(d._id || d.id || '').trim();
      const name = String(d.name || '').trim();
      if (id && name) brandNameById.set(id, name);
    }
  } catch {
    /* db missing */
  }
}

for (const businessId of [DIS, MOD]) {
  const label = businessId === DIS ? 'DISARMINK (Royo del Amor)' : 'Modomio';
  const brands = [];
  for (const [id, name] of brandNameById) {
    // brands filtered later by business docs if present
    void id;
    void name;
  }

  // brands for this business
  const bizBrands = [];
  for (const db of BRAND_DBS) {
    try {
      const rows = await allDocs(db);
      for (const d of rows) {
        if (!d || d.deletedAt) continue;
        if (d.type && d.type !== 'brand') continue;
        const b = bid(d);
        if (b && b !== businessId) continue;
        // some brand dbs store business on brand
        if (!b) continue;
        const id = String(d._id || d.id || '').trim();
        if (!id) continue;
        const active = d.active !== false && d.status !== 'inactive' && !d.archivedAt;
        if (!active) continue;
        bizBrands.push({ id, name: d.name || id, deliveryLineKind: d.deliveryLineKind });
        brandNameById.set(id, d.name || id);
      }
    } catch {
      /* ignore */
    }
  }

  let billing = null;
  for (const d of docs) {
    if (d.type !== 'brand_billing_config') continue;
    if (bid(d) !== businessId && d._id !== `brand-billing-${businessId}`) continue;
    billing = d;
    break;
  }
  // also try get by id
  if (!billing) {
    try {
      billing = await couch(`/${DB}/${encodeURIComponent(`brand-billing-${businessId}`)}`);
    } catch {
      billing = null;
    }
  }

  const rules = splitRulesFromBillingConfig(billing);
  const sessions = docs.filter((d) => {
    if (d.deletedAt) return false;
    if (d.type !== 'tpv_register_session') return false;
    return bid(d) === businessId;
  });

  const orders = docs.filter((d) => {
    if (d.deletedAt) return false;
    if (d.type !== 'delivery_order' && d.type !== 'order') return false;
    if (bid(d) !== businessId) return false;
    if (isCancelled(d) || isRefunded(d)) return false;
    return true;
  });

  console.log(`\n========== ${label} ==========`);
  console.log(
    JSON.stringify(
      {
        businessId,
        brands: bizBrands.map((b) => ({ id: b.id, name: b.name, kind: b.deliveryLineKind || null })),
        billing: billing
          ? {
              id: billing._id,
              sharedSplitMode: billing.sharedSplitMode,
              monoBrandTakesAll: billing.monoBrandTakesAll,
              orphanMode: billing.orphanMode,
            }
          : null,
        rules,
        sessions: sessions.length,
        closedSessions: sessions.filter((s) => s.status === 'closed' || s.closedAt).length,
        ordersActive: orders.length,
      },
      null,
      2,
    ),
  );

  for (const range of ['day', 'month']) {
    const closing = buildClosingBrandOverlay(sessions, (d) => dayKeyInRange(d, range, todayKey));
    const ranged = orders.filter((o) => {
      if (!dayKeyInRange(orderDayKey(o), range, todayKey)) return false;
      if (isOrderReplacedByClosing(closing, orderDayKey(o), normalizeOrderChannel(o.channel))) {
        return false;
      }
      return true;
    });
    const replaced = orders.filter((o) => {
      if (!dayKeyInRange(orderDayKey(o), range, todayKey)) return false;
      return isOrderReplacedByClosing(closing, orderDayKey(o), normalizeOrderChannel(o.channel));
    });

    const result = buildBrandRows(ranged, brandNameById, rules, closing);
    const replacedEuro = r2(replaced.reduce((s, o) => s + orderEuro(o), 0));

    // Sample one multi-brand order for audit
    let sampleMulti = null;
    for (const o of ranged) {
      const att = attributeOrderRevenueByBrand(o, rules);
      const n = Object.keys(att.byBrand).filter((k) => (Number(att.byBrand[k]) || 0) > 0).length;
      if (n >= 2) {
        sampleMulti = {
          id: o._id,
          channel: o.channel,
          day: orderDayKey(o),
          total: orderEuro(o),
          byBrand: Object.fromEntries(
            Object.entries(att.byBrand).map(([id, amt]) => [
              brandNameById.get(id) || id.slice(0, 8),
              r2(amt),
            ]),
          ),
          unbranded: r2(att.unbranded || 0),
        };
        break;
      }
    }

    console.log(`\n--- rango=${range} today=${todayKey} ---`);
    console.log(
      JSON.stringify(
        {
          closingSessionsUsed: closing.sessionsUsed,
          closingHasData: closing.hasData,
          overlaidDays: [...closing.overlaidChannelsByDay.entries()].map(([day, set]) => ({
            day,
            channels: [...set],
          })),
          closingRevenueByBrand: Object.fromEntries(
            Object.entries(closing.revenueByBrand).map(([id, amt]) => [
              brandNameById.get(id) || closing.brandLabels[id] || id.slice(0, 8),
              amt,
            ]),
          ),
          closingRevenueByChannel: closing.revenueByChannel,
          unattributedClosingGap: result.unattributedClosing,
          ordersInRangeKept: result.orderCount,
          ordersReplacedByClosing: replaced.length,
          replacedEuroExcluded: replacedEuro,
          orderEuroKept: result.orderEuroTotal,
          attributedToBrandsFromOrders: result.attributedToBrands,
          unbrandedLeftInOrders: result.unbranded,
          multiBrandOrders: result.multiBrandOrders,
          closingToBrands: result.closingToBrands,
          brandRowsSum: result.brandSum,
          panelTotalLikeUi_orderEuroPlusClosingBrands: result.panelTotalLikeUi,
          shareCheck_brandSum_vs_panelTotal: {
            brandSum: result.brandSum,
            panelTotal: result.panelTotalLikeUi,
            gap: r2(result.panelTotalLikeUi - result.brandSum),
            note:
              'El UI usa total = suma € pedidos + cierre-por-marca; lo unbranded del pedido queda en total pero no en filas de marca.',
          },
          rows: result.rows.map((r) => ({
            name: r.name,
            revenue: r.revenue,
            fromOrders: r.fromOrders,
            fromClosing: r.fromClosing,
            units: r.units,
            orderCount: r.orderCount,
            shareOfPanelTotal:
              result.panelTotalLikeUi > 0
                ? Math.round((r.revenue / result.panelTotalLikeUi) * 1000) / 10
                : 0,
          })),
          sampleMultiBrandOrder: sampleMulti,
          verdictHints: [
            result.unattributedClosingSum > 0.5
              ? `ALERTA: ${result.unattributedClosingSum}€ declarados en cierre por canal sin reparto a marca → se pisan pedidos pero no entran en filas de marca`
              : null,
            Math.abs(result.orderEuroTotal - result.attributedToBrands - result.unbranded) > 1
              ? `ALERTA: descuadre atribución pedidos (euro=${result.orderEuroTotal} brand=${result.attributedToBrands} unbranded=${result.unbranded})`
              : null,
            replaced.length > 0 && result.closingToBrands <= 0
              ? 'ALERTA: hay pedidos pisados por cierre pero closingToBrands=0'
              : null,
          ].filter(Boolean),
        },
        null,
        2,
      ),
    );
  }
}
