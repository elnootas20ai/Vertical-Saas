/**
 * Solo lectura: compara Excel (reparto por uds P/B/T) vs Caja 1 real
 * (efectivo/tarjeta atribuidos por marca desde pedidos del turno).
 * Uso VPS: node scripts/diag-pau-excel-vs-caja1.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DB = 'bbddsaas-delivery';
const DAYS = ['2026-08-09', '2026-08-16', '2026-08-07'];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}

function brandIdAliases(brandId) {
  const id = String(brandId || '').trim();
  if (!id) return [];
  const out = new Set([id]);
  const noColon = id.replace(/^brand:/i, '');
  if (noColon) out.add(noColon);
  const bare = noColon.replace(/^brand-/i, '');
  if (bare) {
    out.add(bare);
    out.add(`brand-${bare}`);
    out.add(`brand:${bare}`);
  }
  return [...out];
}

function sheetIdForBrand(brandId, sheets) {
  const aliases = new Set(brandIdAliases(brandId).map((a) => a.toLowerCase()));
  for (const sheet of sheets) {
    const ids = [...(sheet.brandIds || []), sheet.id].map((x) => String(x || '').trim()).filter(Boolean);
    for (const id of ids) {
      for (const alias of brandIdAliases(id)) {
        if (aliases.has(alias.toLowerCase())) return sheet.id;
      }
    }
  }
  return null;
}

function sheetShares(counts, sheets) {
  const keys = new Set();
  for (const s of sheets) for (const c of s.unitColumns || []) keys.add(c.key);
  let total = 0;
  for (const k of keys) total += Math.max(0, Number(counts[k]) || 0);
  const out = {};
  if (total <= 0) {
    for (const s of sheets) out[s.id] = 1 / sheets.length;
    return out;
  }
  for (const s of sheets) {
    let n = 0;
    for (const c of s.unitColumns || []) n += Math.max(0, Number(counts[c.key]) || 0);
    out[s.id] = n / total;
  }
  return out;
}

function lineRev(item) {
  const q = Number(item.quantity || item.qty || 1) || 1;
  const p = Number(item.price || item.unitPrice || item.total || 0) || 0;
  if (item.total != null && Number(item.total) > 0) return Number(item.total);
  return q * p;
}

function attributeOrderByBrand(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const byBrand = {};
  let unbranded = 0;
  let orderTotal = Number(order.totalAmount ?? order.total) || 0;
  let linesSum = 0;
  for (const it of items) {
    const rev = lineRev(it);
    linesSum += rev;
    const ids = Array.isArray(it.brandIds) ? it.brandIds.map((b) => String(b || '').trim()).filter(Boolean) : [];
    if (ids.length === 0) unbranded += rev;
    else {
      const each = rev / ids.length;
      for (const id of ids) byBrand[id] = (byBrand[id] || 0) + each;
    }
  }
  if (orderTotal <= 0) orderTotal = linesSum;
  const attributed = Object.values(byBrand).reduce((s, n) => s + n, 0) + unbranded;
  const scale = attributed > 0 && orderTotal > 0 ? orderTotal / attributed : 1;
  for (const k of Object.keys(byBrand)) byBrand[k] *= scale;
  unbranded *= scale;
  return { byBrand, unbranded, orderTotal };
}

function payMethod(raw) {
  const m = String(raw || '').trim().toLowerCase();
  if (m === 'tarjeta' || m === 'card' || m === 'visa') return 'tarjeta';
  if (m === 'efectivo' || m === 'cash') return 'efectivo';
  return m || 'efectivo';
}

const docs = await allDocs(DB);
let catalog = [];
try { catalog = await allDocs('bbddsaas-catalog'); } catch { /* */ }

const billingCfg = catalog.find((d) => d.type === 'brand_billing_config' && String(d.business_id || '') === DIS);
const sheets = (billingCfg?.sheets || []).filter((s) => (s.unitColumns || []).length > 0);
console.log('sheets', sheets.map((s) => ({ id: s.id, label: s.label, brandIds: s.brandIds })));

const sessions = docs.filter((d) => {
  if (!d || d.type !== 'tpv_register_session' || d.deletedAt) return false;
  if (String(d.status || '').toLowerCase() === 'open') return false;
  const b = bid(d);
  const uid = String(d.user_id || '').trim();
  if (!(uid === PAU || b === DIS)) return false;
  const day = String(d.workDayKey || d.openedAt || '').slice(0, 10);
  return DAYS.includes(day);
});

const orders = docs.filter((d) => d && d.type === 'delivery_order' && !d.deletedAt && bid(d) === DIS);

for (const s of sessions.sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)))) {
  const day = String(s.workDayKey || s.openedAt || '').slice(0, 10);
  const opened = String(s.openedAt || '');
  const closed = String(s.closedAt || opened);
  const pdv = String(s.pointOfSaleId || '');
  const ef = r2(s.summary?.salesByMethod?.efectivo);
  const tj = r2(s.summary?.salesByMethod?.tarjeta);
  const pc = s.productClosingCounts || {};
  const shares = sheetShares({ pizza: pc.pizza || 0, burger: pc.burger || 0, taco: pc.taco || 0 }, sheets);

  // pedidos del turno (ventana + PDV)
  const shiftOrders = orders.filter((o) => {
    const sp = String(o.salesPointId || o.pointOfSaleId || '');
    if (pdv && sp && sp !== pdv) return false;
    const t = String(o.createdAt || o.orderedAt || o.completedAt || o.updatedAt || '');
    if (!t) return false;
    return t >= opened && t <= closed;
  });

  // cash/card by order from txs
  const payByOrder = new Map();
  for (const tx of s.transactions || []) {
    if (tx.type !== 'sale') continue;
    const oid = String(tx.linkedDeliveryOrderId || tx.orderId || '').trim();
    if (!oid) continue;
    const amt = r2(tx.amount);
    const m = payMethod(tx.paymentMethod);
    const prev = payByOrder.get(oid) || { efectivo: 0, tarjeta: 0 };
    if (m === 'efectivo') prev.efectivo = r2(prev.efectivo + amt);
    if (m === 'tarjeta') prev.tarjeta = r2(prev.tarjeta + amt);
    payByOrder.set(oid, prev);
  }

  const caja1BySheet = {};
  for (const sh of sheets) caja1BySheet[sh.id] = { efectivo: 0, tarjeta: 0, revenue: 0 };
  let matchedOrders = 0;
  for (const o of shiftOrders) {
    const oid = String(o._id || o.id || '').trim();
    const pay = payByOrder.get(oid) || { efectivo: 0, tarjeta: 0 };
    if (pay.efectivo + pay.tarjeta <= 0) continue;
    matchedOrders += 1;
    const { byBrand, unbranded, orderTotal } = attributeOrderByBrand(o);
    const payTotal = pay.efectivo + pay.tarjeta;
    const cashRatio = payTotal > 0 ? pay.efectivo / payTotal : 0;
    const cardRatio = payTotal > 0 ? pay.tarjeta / payTotal : 0;
    // absorbe unbranded a partes iguales entre marcas del pedido, si no hay → skip
    const brandKeys = Object.keys(byBrand);
    if (unbranded > 0 && brandKeys.length > 0) {
      const each = unbranded / brandKeys.length;
      for (const k of brandKeys) byBrand[k] += each;
    }
    const scale = orderTotal > 0 ? payTotal / orderTotal : 1;
    for (const [brandId, rev] of Object.entries(byBrand)) {
      const sid = sheetIdForBrand(brandId, sheets);
      if (!sid) continue;
      const v = rev * scale;
      caja1BySheet[sid].revenue = r2(caja1BySheet[sid].revenue + v);
      caja1BySheet[sid].efectivo = r2(caja1BySheet[sid].efectivo + v * cashRatio);
      caja1BySheet[sid].tarjeta = r2(caja1BySheet[sid].tarjeta + v * cardRatio);
    }
  }

  const excelBySheet = {};
  for (const sh of sheets) {
    const share = shares[sh.id] || 0;
    excelBySheet[sh.id] = {
      efectivo: r2(ef * share),
      tarjeta: r2(tj * share),
      share: Math.round(share * 1000) / 10,
    };
  }

  console.log('\n====', day, s.pointOfSaleName, s._id, '====');
  console.log(JSON.stringify({
    sessionCash: ef,
    sessionCard: tj,
    counts: { pizza: pc.pizza || 0, burger: pc.burger || 0, taco: pc.taco || 0 },
    shiftOrders: shiftOrders.length,
    matchedPaidOrders: matchedOrders,
    excelByUnits: Object.fromEntries(sheets.map((sh) => [sh.label, excelBySheet[sh.id]])),
    caja1FromOrders: Object.fromEntries(sheets.map((sh) => [sh.label, caja1BySheet[sh.id]])),
    delta: Object.fromEntries(sheets.map((sh) => [sh.label, {
      efectivo: r2(excelBySheet[sh.id].efectivo - caja1BySheet[sh.id].efectivo),
      tarjeta: r2(excelBySheet[sh.id].tarjeta - caja1BySheet[sh.id].tarjeta),
    }])),
  }, null, 2));
}
