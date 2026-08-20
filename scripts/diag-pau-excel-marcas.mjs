/**
 * Solo lectura: auditoría del Excel de marcas (cierres) de Pau.
 * Replica la matemática de cajaFacturacionExcelExport y busca descuadres:
 *  - marcas declaradas al cierre que no mapean a ninguna hoja (fallos de marcas)
 *  - devoluciones no restadas (Excel bruto vs Caja neta)
 *  - pagos online/otro que se caen de las columnas
 *  - posible doble conteo (venta TPV con canal app + total declarado en Caja 2)
 *  - cierres sin conteo P/B/T (reparto 50/50 del efectivo/visa)
 *  - suma de hojas ≠ total del cierre
 * Uso VPS: node scripts/diag-pau-excel-marcas.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MOD = '33821959-ae50-4e52-bfea-ea2b145faeac';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DB = 'bbddsaas-delivery';
const MONTHS = ['2026-06', '2026-07', '2026-08'];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error} ${data.reason || ''}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}

// ── réplicas de la lógica del Excel ──────────────────────────────
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

function foldLabel(raw) {
  return String(raw || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
function compactName(raw) {
  return foldLabel(raw).replace(/[^a-z0-9]+/g, '');
}

function sheetIdForClosingBrand(brandId, sheets, labels) {
  const aliases = new Set(brandIdAliases(brandId).map((a) => a.toLowerCase()));
  if (aliases.size === 0) return null;
  for (const sheet of sheets) {
    const ids = [...(sheet.brandIds || []), sheet.id].map((x) => String(x || '').trim()).filter(Boolean);
    for (const id of ids) {
      for (const alias of brandIdAliases(id)) {
        if (aliases.has(alias.toLowerCase())) return sheet.id;
      }
    }
  }
  const nameFold = compactName((labels || {})[brandId] || '');
  if (!nameFold) return null;
  for (const sheet of sheets) {
    if (compactName(sheet.label || sheet.id) === nameFold) return sheet.id;
  }
  return null;
}

const APP_GROUPS = { app: ['flipdish', 'app'], uber: ['ubereats'], justEat: ['justeat'], glovo: ['glovo'] };

function normMethod(raw) {
  const pm = String(raw || '').trim().toLowerCase();
  if (pm === 'otros') return 'otro';
  if (['efectivo', 'tarjeta', 'bizum', 'online', 'otro'].includes(pm)) return pm;
  return 'efectivo';
}

function buildSummary(session) {
  const txs = session.transactions || [];
  const sales = txs.filter((t) => t.type === 'sale');
  const byMethod = { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 };
  const byChannel = {};
  for (const t of sales) {
    byMethod[normMethod(t.paymentMethod)] += Number(t.amount || 0);
    if (t.channel) byChannel[t.channel] = (byChannel[t.channel] || 0) + Number(t.amount || 0);
  }
  const returnsByMethod = { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 };
  for (const t of txs) {
    if (t.type !== 'return') continue;
    returnsByMethod[normMethod(t.paymentMethod)] += Number(t.amount || 0);
  }
  return { byMethod, byChannel, returnsByMethod };
}

function channelTotal(session, computed, channel) {
  const fromAgg = Number(session.aggregatorClosingTotals?.[channel] || 0);
  if (fromAgg > 0) return r2(fromAgg);
  const map = session.aggregatorClosingBrandTotals?.[channel];
  let fromBrands = 0;
  if (map && typeof map === 'object') {
    for (const v of Object.values(map)) fromBrands += Number(v) || 0;
  }
  fromBrands = r2(fromBrands);
  if (fromBrands > 0) return fromBrands;
  const fromSummary = Number(session.summary?.salesByChannel?.[channel] || 0)
    || Number(computed.byChannel[channel] || 0)
    || Number(session.salesByChannel?.[channel] || 0);
  return r2(fromSummary);
}

function sessionToCajaAmounts(session) {
  const computed = buildSummary(session);
  let method = session.summary?.salesByMethod;
  const methodTotal = method
    ? Number(method.efectivo || 0) + Number(method.tarjeta || 0) + Number(method.bizum || 0)
      + Number(method.online || 0) + Number(method.otro || 0)
    : 0;
  if (methodTotal <= 0 && (session.transactions || []).length > 0) method = computed.byMethod;
  method = method || { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 };
  const efectivo = r2(method.efectivo);
  const tpv = r2(method.tarjeta);
  const x = r2(Number(method.bizum || 0) + Number(method.otro || 0));
  const justEat = channelTotal(session, computed, 'justeat');
  const uber = channelTotal(session, computed, 'ubereats');
  const glovo = channelTotal(session, computed, 'glovo');
  const app = r2(channelTotal(session, computed, 'flipdish') + channelTotal(session, computed, 'app'));
  const total = r2(efectivo + tpv + x + app + uber + justEat + glovo);
  const pc = session.productClosingCounts || {};
  return {
    efectivo, tpv, x, app, uber, justEat, glovo, total,
    counts: {
      pizza: Math.max(0, Math.floor(Number(pc.pizza || 0))),
      burger: Math.max(0, Math.floor(Number(pc.burger || 0))),
      taco: Math.max(0, Math.floor(Number(pc.taco || 0))),
    },
    method,
    computed,
  };
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

function splitSession(session, sheets) {
  const a = sessionToCajaAmounts(session);
  const shares = sheetShares(a.counts, sheets);
  const labels = session.closingBrandLabels || {};

  // ¿hay totales por marca declarados y mapeables?
  let anyMappable = false;
  let anyDeclared = false;
  const unmapped = [];
  for (const [ch, perBrand] of Object.entries(session.aggregatorClosingBrandTotals || {})) {
    if (!perBrand || typeof perBrand !== 'object') continue;
    for (const [brandId, raw] of Object.entries(perBrand)) {
      if (Number(raw) <= 0) continue;
      anyDeclared = true;
      const sid = sheetIdForClosingBrand(brandId, sheets, labels);
      if (sid) anyMappable = true;
      else unmapped.push({ ch, brandId, label: labels[brandId] || '', amt: r2(raw) });
    }
  }

  const perSheet = {};
  for (const sheet of sheets) {
    const share = shares[sheet.id] ?? 0;
    const base = {
      efectivo: r2(a.efectivo * share),
      tpv: r2(a.tpv * share),
      x: r2(a.x * share),
    };
    let apps = {
      app: r2(a.app * share), uber: r2(a.uber * share),
      justEat: r2(a.justEat * share), glovo: r2(a.glovo * share),
    };
    if (anyDeclared && anyMappable) {
      apps = { app: 0, uber: 0, justEat: 0, glovo: 0 };
      for (const key of Object.keys(APP_GROUPS)) {
        const channels = APP_GROUPS[key];
        const chAmt = r2(channels.reduce((s, ch) => s + channelTotal(session, a.computed, ch), 0));
        const attributed = {};
        let attributedSum = 0;
        for (const ch of channels) {
          const map = session.aggregatorClosingBrandTotals?.[ch] || {};
          for (const [brandId, raw] of Object.entries(map)) {
            const amt = r2(raw);
            if (amt <= 0) continue;
            const sid = sheetIdForClosingBrand(brandId, sheets, labels);
            if (!sid) continue;
            attributed[sid] = r2((attributed[sid] || 0) + amt);
            attributedSum = r2(attributedSum + amt);
          }
        }
        let value = attributed[sheet.id] || 0;
        if (attributedSum <= 0) value = r2(chAmt * share);
        else {
          const leftover = r2(chAmt - attributedSum);
          if (leftover >= 0.01) value = r2(value + leftover * share);
        }
        apps[key] = value;
      }
    }
    perSheet[sheet.id] = r2(base.efectivo + base.tpv + base.x + apps.app + apps.uber + apps.justEat + apps.glovo);
  }
  return { amounts: a, shares, perSheet, unmapped, anyDeclared, anyMappable };
}

// ── carga de datos ───────────────────────────────────────────────
const docs = await allDocs(DB);
let catalogDocs = [];
try {
  catalogDocs = await allDocs('bbddsaas-catalog');
} catch (e) {
  console.log('catalog DB error:', e.message);
}
const brands = catalogDocs.filter((d) => d.type === 'brand' && !d.deletedAt);
const billingCfgs = catalogDocs.filter((d) => d.type === 'brand_billing_config');
const sessions = docs.filter((d) => {
  if (d.deletedAt || d.type !== 'tpv_register_session') return false;
  const b = bid(d);
  const uid = String(d.user_id || '').trim();
  if (!(uid === PAU || b === DIS || b === MOD)) return false;
  if (String(d.status || '').toLowerCase() === 'open') return false;
  const day = String(d.workDayKey || d.openedAt || d.closedAt || '').slice(0, 7);
  return MONTHS.includes(day);
});

const sessionBizIds = [...new Set(sessions.map((s) => bid(s)).filter(Boolean))];
console.log(JSON.stringify({
  sessions: sessions.length,
  sessionBizIds,
  brands: brands.filter((b) => sessionBizIds.includes(bid(b)) || [DIS, MOD].includes(bid(b))).map((b) => ({
    id: b._id, biz: bid(b),
    name: b.name, kind: b.deliveryLineKind, active: b.active !== false, isDefault: b.isDefault === true,
  })),
  billingCfgs: billingCfgs
    .filter((c) => sessionBizIds.includes(String(c.business_id || '').trim()) || [DIS, MOD].includes(String(c.business_id || '').trim()))
    .map((c) => ({
      id: c._id, biz: String(c.business_id || ''),
      sheets: (c.sheets || []).map((s) => ({ id: s.id, label: s.label, brandIds: s.brandIds, units: (s.unitColumns || []).map((u) => u.key) })),
    })),
}, null, 2));

// hojas por negocio (config guardada; sin config → aviso)
function sheetsForBusiness(businessId) {
  const cfg = billingCfgs.find((c) => String(c.business_id || '').trim() === businessId);
  const withUnits = (cfg?.sheets || []).filter((s) => (s.unitColumns || []).length > 0);
  if (withUnits.length > 0) return { sheets: withUnits, source: 'config' };
  return {
    sheets: [
      { id: 'modomio', label: 'MODOMIO', brandIds: [], unitColumns: [{ key: 'pizza' }] },
      { id: 'blackburger', label: 'BLACK BURGER', brandIds: [], unitColumns: [{ key: 'burger' }, { key: 'taco' }] },
    ],
    source: 'legacy-fallback',
  };
}

// ── auditoría por sesión ─────────────────────────────────────────
const monthAgg = new Map(); // ym → { bySheet, unsplitTotal, efectivo, tpv }
const issues = [];
for (const s of sessions.sort((a, b) => String(a.closedAt || '').localeCompare(String(b.closedAt || '')))) {
  const businessId = bid(s);
  const { sheets, source } = sheetsForBusiness(businessId);
  const { amounts, shares, perSheet, unmapped, anyDeclared, anyMappable } = splitSession(s, sheets);
  const dayKey = String(s.workDayKey || s.openedAt || '').slice(0, 10);
  const ym = dayKey.slice(0, 7);

  const flags = [];
  const ret = amounts.computed.returnsByMethod;
  if (r2(ret.efectivo + ret.tarjeta + ret.bizum + ret.otro) > 0) {
    flags.push(`devoluciones no restadas en Excel: efectivo ${r2(ret.efectivo)} tarjeta ${r2(ret.tarjeta)}`);
  }
  if (r2(amounts.method.online) > 0) flags.push(`pagos ONLINE fuera de columnas: ${r2(amounts.method.online)}`);
  if (r2(amounts.method.otro) > 0) flags.push(`pagos OTRO en columna X: ${r2(amounts.method.otro)}`);

  // doble conteo: tx TPV con canal app pagadas efectivo/tarjeta + total declarado
  for (const ch of ['glovo', 'ubereats', 'justeat', 'flipdish', 'app']) {
    const declared = Number(s.aggregatorClosingTotals?.[ch] || 0);
    let txLocalPaid = 0;
    for (const t of s.transactions || []) {
      if (t.type !== 'sale' || t.channel !== ch) continue;
      const m = normMethod(t.paymentMethod);
      if (m === 'efectivo' || m === 'tarjeta' || m === 'bizum' || m === 'otro') txLocalPaid += Number(t.amount || 0);
    }
    txLocalPaid = r2(txLocalPaid);
    if (declared > 0 && txLocalPaid > 0) {
      flags.push(`POSIBLE DOBLE CONTEO ${ch}: declarado ${r2(declared)} + tx locales ${txLocalPaid} en efectivo/tarjeta`);
    }
  }

  const money = r2(amounts.efectivo + amounts.tpv + amounts.x);
  const totalUnits = amounts.counts.pizza + amounts.counts.burger + amounts.counts.taco;
  if (money > 0 && totalUnits === 0) flags.push(`sin conteo P/B/T → reparto a partes iguales de ${money}`);
  if (anyDeclared && !anyMappable) flags.push('marcas declaradas NO mapean a ninguna hoja → apps repartidas por unidades');
  for (const u of unmapped) flags.push(`marca sin hoja: ${u.brandId} (${u.label || 'sin nombre'}) ${u.amt} en ${u.ch}`);

  const sheetsSum = r2(Object.values(perSheet).reduce((a, n) => a + n, 0));
  if (Math.abs(sheetsSum - amounts.total) > 0.02) {
    flags.push(`SUMA HOJAS ${sheetsSum} != TOTAL ${amounts.total} (delta ${r2(sheetsSum - amounts.total)})`);
  }

  // total Excel vs total UI de caja (neto devoluciones)
  const uiEfectivo = r2(Math.max(0, amounts.efectivo - ret.efectivo));
  const uiTarjeta = r2(Math.max(0, amounts.tpv - ret.tarjeta));
  const uiTotal = r2(uiEfectivo + uiTarjeta + amounts.x + amounts.app + amounts.uber + amounts.justEat + amounts.glovo);
  if (Math.abs(uiTotal - amounts.total) > 0.02) {
    flags.push(`Excel TOTAL ${amounts.total} vs UI neta ${uiTotal} (delta ${r2(amounts.total - uiTotal)})`);
  }

  if (flags.length > 0) {
    issues.push({
      day: dayKey, id: s._id, pdv: s.pointOfSaleName || s.pointOfSaleId,
      biz: businessId === DIS ? 'DIS' : businessId === MOD ? 'MOD' : businessId,
      sheetsSource: source,
      total: amounts.total,
      shares: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, Math.round(v * 1000) / 10])),
      perSheet,
      flags,
    });
  }

  let agg = monthAgg.get(ym);
  if (!agg) {
    agg = { unsplit: 0, efectivo: 0, tpv: 0, x: 0, app: 0, uber: 0, justEat: 0, glovo: 0, bySheet: {} };
    monthAgg.set(ym, agg);
  }
  agg.unsplit = r2(agg.unsplit + amounts.total);
  for (const k of ['efectivo', 'tpv', 'x', 'app', 'uber', 'justEat', 'glovo']) agg[k] = r2(agg[k] + amounts[k]);
  for (const [sid, v] of Object.entries(perSheet)) agg.bySheet[sid] = r2((agg.bySheet[sid] || 0) + v);
}

console.log('\n===== TOTALES POR MES (réplica Excel) =====');
for (const [ym, agg] of [...monthAgg.entries()].sort()) {
  console.log(JSON.stringify({ ym, ...agg }, null, 2));
}

console.log(`\n===== SESIONES CON AVISOS (${issues.length}) =====`);
for (const it of issues) console.log(JSON.stringify(it));

// ── detalle agosto día a día por hoja (como el Excel del cliente) ──
console.log('\n===== AGOSTO DIA A DIA (por hoja y tienda) =====');
const augSessions = sessions.filter((s) => String(s.openedAt || s.closedAt || '').slice(0, 7) === '2026-08');
const dayRows = new Map(); // `${store}|${day}` → per sheet columns
function storeKey(s) {
  const n = String(s.pointOfSaleName || '').toLowerCase();
  if (n.includes('tiana')) return 'TIANA';
  if (n.includes('badalona') || n.includes('bdn')) return 'BADALONA';
  return s.pointOfSaleName || s.pointOfSaleId || '?';
}
for (const s of augSessions) {
  const businessId = bid(s);
  const { sheets } = sheetsForBusiness(businessId);
  const a = sessionToCajaAmounts(s);
  const shares = sheetShares(a.counts, sheets);
  const labels = s.closingBrandLabels || {};
  const day = String(s.openedAt || s.closedAt || '').slice(0, 10);
  const store = storeKey(s);

  // aviso por canal: total declarado vs suma por marca
  for (const ch of ['glovo', 'ubereats', 'justeat', 'flipdish', 'app']) {
    const declared = r2(s.aggregatorClosingTotals?.[ch] || 0);
    const map = s.aggregatorClosingBrandTotals?.[ch] || {};
    const brandSum = r2(Object.values(map).reduce((x, n) => x + (Number(n) || 0), 0));
    if (declared > 0 && brandSum > 0 && Math.abs(declared - brandSum) > 0.02) {
      console.log(`AVISO ${day} ${store}: canal ${ch} declarado ${declared} pero por marca suman ${brandSum} (delta ${r2(declared - brandSum)})`);
    }
  }

  for (const sheet of sheets) {
    const share = shares[sheet.id] ?? 0;
    const key = `${store}|${day}|${sheet.label}`;
    const row = dayRows.get(key) || { efectivo: 0, tpv: 0, x: 0, app: 0, uber: 0, justEat: 0, glovo: 0, total: 0, uds: 0 };
    row.efectivo = r2(row.efectivo + a.efectivo * share);
    row.tpv = r2(row.tpv + a.tpv * share);
    row.x = r2(row.x + a.x * share);
    // apps por marca declarada
    let anyMappable = false;
    for (const [ch2, perBrand] of Object.entries(s.aggregatorClosingBrandTotals || {})) {
      void ch2;
      for (const [brandId, raw] of Object.entries(perBrand || {})) {
        if (Number(raw) > 0 && sheetIdForClosingBrand(brandId, sheets, labels)) anyMappable = true;
      }
    }
    for (const key2 of Object.keys(APP_GROUPS)) {
      const channels = APP_GROUPS[key2];
      const chAmt = r2(channels.reduce((x, ch) => x + channelTotal(s, a.computed, ch), 0));
      let value = r2(chAmt * share);
      if (anyMappable) {
        const attributed = {};
        let attributedSum = 0;
        for (const ch of channels) {
          const map = s.aggregatorClosingBrandTotals?.[ch] || {};
          for (const [brandId, raw] of Object.entries(map)) {
            const amt = r2(raw);
            if (amt <= 0) continue;
            const sid = sheetIdForClosingBrand(brandId, sheets, labels);
            if (!sid) continue;
            attributed[sid] = r2((attributed[sid] || 0) + amt);
            attributedSum = r2(attributedSum + amt);
          }
        }
        value = attributed[sheet.id] || 0;
        if (attributedSum <= 0) value = r2(chAmt * share);
        else {
          const leftover = r2(chAmt - attributedSum);
          if (leftover >= 0.01) value = r2(value + leftover * share);
        }
      }
      row[key2] = r2(row[key2] + value);
    }
    row.total = r2(row.efectivo + row.tpv + row.x + row.app + row.uber + row.justEat + row.glovo);
    const unitKeys = (sheet.unitColumns || []).map((c) => c.key);
    row.uds += unitKeys.reduce((x, k) => x + (a.counts[k] || 0), 0);
    dayRows.set(key, row);
  }
}
for (const [key, row] of [...dayRows.entries()].sort()) {
  if (row.total === 0 && row.uds === 0) continue;
  console.log(`${key} :: EFECTIVO ${row.efectivo} | TPV ${row.tpv} | X ${row.x} | App ${row.app} | UBER ${row.uber} | JUST ${row.justEat} | GLOVO ${row.glovo} | TOTAL ${row.total} | uds ${row.uds}`);
}
