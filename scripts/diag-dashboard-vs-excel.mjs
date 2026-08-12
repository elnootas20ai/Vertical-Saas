#!/usr/bin/env node
/**
 * SOLO LECTURA — ¿Dashboard tienda1/tienda2 cuadra como el Excel Uriel?
 * Compara por día/PDV:
 *   Excel = salesByMethod (efectivo/tpv/x) + aggregatorClosingTotals (apps)
 *   Pulse = pedidos (efectivo/tpv/x) + aggregatorClosingTotals (apps)  ← lo que pinta PortfolioOpsPulse
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DAYS = ['2026-08-06', '2026-08-07'];
const DB = 'bbddsaas-delivery';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function madridDayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
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
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return String(raw).slice(0, 10);
  return madridDayKey(dt);
}

function foldDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return madridDayKey(d);
}

function channelTotal(session, channel) {
  const fromAgg = Number(session.aggregatorClosingTotals?.[channel] || 0);
  if (fromAgg > 0) return r2(fromAgg);
  const fromSummary = Number(session.summary?.salesByChannel?.[channel] || 0);
  const fromSession = Number(session.salesByChannel?.[channel] || 0);
  return r2(fromAgg || fromSummary || fromSession);
}

function excelFromSession(session) {
  let method = session.summary?.salesByMethod;
  const methodTotal = method
    ? Number(method.efectivo || 0)
      + Number(method.tarjeta || 0)
      + Number(method.bizum || 0)
      + Number(method.online || 0)
      + Number(method.otro || 0)
    : 0;
  if ((!method || methodTotal <= 0) && Array.isArray(session.transactions) && session.transactions.length) {
    // sin rebuild completo: cae a summary vacío
    method = method || {};
  }
  method = method || {};
  const efectivo = r2(method.efectivo || 0);
  const tpv = r2(method.tarjeta || 0);
  const x = r2((method.bizum || 0) + (method.otro || 0));
  let app = r2(channelTotal(session, 'flipdish') + channelTotal(session, 'app'));
  const uber = r2(channelTotal(session, 'ubereats'));
  const justEat = r2(channelTotal(session, 'justeat'));
  const glovo = r2(channelTotal(session, 'glovo'));
  // online del método local va a App en Excel Uriel sessionToUrielAmounts? No — online está en method pero
  // sessionToUrielAmounts NO suma online a app; solo bizum+otro → x. online se pierde en Excel?
  // Re-read: total = efectivo + tpv + b + app + uber + justEat + glovo — online NOT included!
  const total = r2(efectivo + tpv + x + app + uber + justEat + glovo);
  return {
    efectivo,
    tpv,
    x,
    app,
    uber,
    justEat,
    glovo,
    total,
    foodTop: {
      pizza: Math.max(0, Math.floor(Number(session.productClosingCounts?.pizza || 0))),
      burger: Math.max(0, Math.floor(Number(session.productClosingCounts?.burger || 0))),
      taco: Math.max(0, Math.floor(Number(session.productClosingCounts?.taco || 0))),
    },
    onlineIgnored: r2(method.online || 0),
  };
}

function isRevenueOrder(o) {
  const st = String(o.status || '').toLowerCase();
  if (/cancel/.test(st)) return false;
  if (o.refunded || o.isRefunded) return false;
  const pay = String(o.paymentStatus || '').toLowerCase();
  // shouldSyncDeliveryOrderIncome approx: paid / cobrado
  if (pay === 'unpaid' || pay === 'pending' || pay === 'failed') return false;
  if (o.cancelledAt) return false;
  return true;
}

function orderIncome(o) {
  const n = Number(o.totalAmount ?? o.total ?? o.amount ?? 0);
  return r2(n);
}

function addToChannels(acc, amount, channel, paymentMethod) {
  const amt = r2(amount);
  if (amt <= 0) return;
  const ch = String(channel || '').toLowerCase().trim();
  if (ch === 'glovo') {
    acc.glovo = r2(acc.glovo + amt);
    return;
  }
  if (ch === 'justeat' || ch === 'just_eat' || ch === 'just-eat') {
    acc.justEat = r2(acc.justEat + amt);
    return;
  }
  if (ch === 'ubereats' || ch === 'uber' || ch === 'uber_eats') {
    acc.uber = r2(acc.uber + amt);
    return;
  }
  if (ch === 'flipdish' || ch === 'app') {
    acc.app = r2(acc.app + amt);
    return;
  }
  const pm = String(paymentMethod || '').toLowerCase().trim();
  if (pm === 'efectivo' || pm === 'cash') {
    acc.efectivo = r2(acc.efectivo + amt);
    return;
  }
  if (pm === 'bizum' || pm === 'otro') {
    acc.x = r2(acc.x + amt);
    return;
  }
  if (pm === 'online') {
    acc.app = r2(acc.app + amt);
    return;
  }
  acc.tpv = r2(acc.tpv + amt);
}

function emptyCh() {
  return { efectivo: 0, tpv: 0, x: 0, app: 0, uber: 0, justEat: 0, glovo: 0 };
}

function chTotal(c) {
  return r2(c.efectivo + c.tpv + c.x + c.app + c.uber + c.justEat + c.glovo);
}

async function allDocs() {
  const res = await fetch(`${COUCH}/${encodeURIComponent(DB)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) throw new Error(`all_docs: ${res.status}`);
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}

function diffCh(a, b) {
  const keys = ['efectivo', 'tpv', 'x', 'app', 'uber', 'justEat', 'glovo', 'total'];
  const out = {};
  for (const k of keys) {
    const d = r2((a[k] || 0) - (b[k] || 0));
    if (Math.abs(d) >= 0.01) out[k] = d;
  }
  return out;
}

async function main() {
  console.log(JSON.stringify({ mode: 'READ_ONLY', focus: 'Pulse vs Excel Uriel', days: DAYS }, null, 2));
  const docs = await allDocs();

  const sessions = docs.filter(
    (d) =>
      d?.type === 'tpv_register_session' &&
      bid(d) === DIS &&
      String(d.status || '').toLowerCase() !== 'open' &&
      DAYS.includes(sessionWorkDayKey(d)),
  );

  const orders = docs.filter((d) => {
    if (!d || (d.type !== 'delivery_order' && d.type !== 'order')) return false;
    if (bid(d) !== DIS) return false;
    return true;
  });

  // PDVs relevantes
  const pdvMap = new Map();
  for (const s of sessions) {
    const id = String(s.pointOfSaleId || '');
    if (!id) continue;
    if (!pdvMap.has(id)) pdvMap.set(id, String(s.pointOfSaleName || id));
  }

  for (const day of DAYS) {
    console.log(`\n================ ${day} ================`);
    const daySessions = sessions.filter((s) => sessionWorkDayKey(s) === day);
    let sumExcel = 0;
    let sumPulse = 0;
    let sumExcelFood = { pizza: 0, burger: 0, taco: 0 };
    let sumPulseFood = { pizza: 0, burger: 0, taco: 0 };

    const rows = [];
    for (const [pdvId, pdvName] of [...pdvMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))) {
      const sess = daySessions.filter((s) => String(s.pointOfSaleId) === pdvId);
      if (sess.length === 0) continue;

      // Excel: sum sessions
      const excel = emptyCh();
      let excelTotal = 0;
      let foodTop = { pizza: 0, burger: 0, taco: 0 };
      let onlineIgnored = 0;
      for (const s of sess) {
        const e = excelFromSession(s);
        for (const k of Object.keys(excel)) excel[k] = r2(excel[k] + e[k]);
        excelTotal = r2(excelTotal + e.total);
        foodTop.pizza += e.foodTop.pizza;
        foodTop.burger += e.foodTop.burger;
        foodTop.taco += e.foodTop.taco;
        onlineIgnored = r2(onlineIgnored + e.onlineIgnored);
      }
      excel.total = excelTotal;

      // Pulse: orders local + closing apps
      const pdvOrders = orders.filter((o) => {
        if (!isRevenueOrder(o)) return false;
        if (String(o.salesPointId || o.pointOfSaleId || '') !== pdvId) return false;
        const when = o.paidAt || o.deliveredAt || o.updatedAt || o.createdAt;
        return foldDay(when) === day;
      });

      const base = emptyCh();
      for (const o of pdvOrders) addToChannels(base, orderIncome(o), o.channel, o.paymentMethod);

      // closing apps overlay (same as aggregatorChannelsFromClosingSessions)
      let hasAgg = false;
      let glovo = 0;
      let uber = 0;
      let justEat = 0;
      let app = 0;
      for (const s of sess) {
        if (
          s.aggregatorClosingTotals &&
          Object.values(s.aggregatorClosingTotals).some((v) => Number(v) > 0)
        ) {
          hasAgg = true;
        }
        glovo += channelTotal(s, 'glovo');
        uber += channelTotal(s, 'ubereats');
        justEat += channelTotal(s, 'justeat');
        app += channelTotal(s, 'flipdish') + channelTotal(s, 'app');
      }
      const pulse = { ...base };
      if (hasAgg || glovo || uber || justEat || app) {
        pulse.glovo = r2(glovo);
        pulse.uber = r2(uber);
        pulse.justEat = r2(justEat);
        pulse.app = r2(app);
      }
      pulse.total = chTotal(pulse);

      // food pulse = from orders only (approx pizza/burger/taco keywords)
      const foodOrders = { pizza: 0, burger: 0, taco: 0 };
      for (const o of pdvOrders) {
        for (const it of o.items || o.lines || []) {
          const name = String(it.name || it.title || it.productName || '').toLowerCase();
          const qty = Math.max(0, Math.floor(Number(it.quantity || it.qty || 1)));
          if (/pizza/.test(name)) foodOrders.pizza += qty;
          else if (/burger|hamburg/.test(name)) foodOrders.burger += qty;
          else if (/taco/.test(name)) foodOrders.taco += qty;
        }
      }

      const d = diffCh(pulse, excel);
      rows.push({
        pdv: pdvName,
        sessions: sess.length,
        ordersKept: pdvOrders.length,
        excel,
        pulse,
        diffPulseMinusExcel: d,
        foodExcelTop: foodTop,
        foodPulseOrdersApprox: foodOrders,
        onlineInMethodNotInExcelTotal: onlineIgnored,
      });

      sumExcel = r2(sumExcel + excel.total);
      sumPulse = r2(sumPulse + pulse.total);
      sumExcelFood.pizza += foodTop.pizza;
      sumExcelFood.burger += foodTop.burger;
      sumExcelFood.taco += foodTop.taco;
      sumPulseFood.pizza += foodOrders.pizza;
      sumPulseFood.burger += foodOrders.burger;
      sumPulseFood.taco += foodOrders.taco;
    }

    for (const r of rows) {
      console.log('\n---', r.pdv, '---');
      console.log('Excel €:', r.excel);
      console.log('Pulse € (dashboard tienda):', r.pulse);
      console.log('Δ Pulse−Excel:', Object.keys(r.diffPulseMinusExcel).length ? r.diffPulseMinusExcel : 'OK (0)');
      console.log('Food Excel (cierre top):', r.foodExcelTop);
      console.log('Food Pulse (pedidos approx):', r.foodPulseOrdersApprox);
      if (r.onlineInMethodNotInExcelTotal)
        console.log('Nota: online en método (Excel no lo suma al total):', r.onlineInMethodNotInExcelTotal);
    }

    console.log('\n>>> TOTALES DÍA', day);
    console.log({
      excelStoresSum: sumExcel,
      pulseStoresSum: sumPulse,
      delta: r2(sumPulse - sumExcel),
      foodExcel: sumExcelFood,
      foodPulseApprox: sumPulseFood,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
