#!/usr/bin/env node
/**
 * SOLO LECTURA — Marca Modomio @ Tiana: Excel Uriel vs Caja1/Caja2 por marca vs total tienda.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MONTH = '2026-08';

/** Exacto Excel Uriel (hoja MM). */
const EXCEL = {
  3: { e: 149.2, t: 288.6, a: 13.18, u: 0, j: 0, g: 0, tot: 450.98, p: 40 },
  4: { e: 78.5, t: 187.49, a: 18.57, u: 51.7, j: 63.24, g: 0, tot: 399.5, p: 25 },
  5: { e: 148.5, t: 289.09, a: 0, u: 0, j: 0, g: 0, tot: 437.59, p: 26 },
  6: { e: 200.86, t: 382.05, a: 282.21, u: 0, j: 120.56, g: 0, tot: 985.68, p: 25 },
  7: { e: 133.85, t: 495.19, a: 95.6, u: 87.78, j: 178.1, g: 0, tot: 990.52, p: 60 },
  8: { e: 70.65, t: 440.88, a: 243.3, u: 93.24, j: 157.45, g: 0, tot: 1005.52, p: 61 },
  9: { e: 472.1, t: 585.99, a: 204.28, u: 113.04, j: 76.95, g: 0, tot: 1452.36, p: 87 },
  10: { e: 31, t: 266.1, a: 87.4, u: 35.49, j: 100.83, g: 0, tot: 520.82, p: 31 },
  11: { e: 81.5, t: 276.59, a: 18.6, u: 17.4, j: 91.4, g: 0, tot: 485.49, p: 29 },
  12: { e: 180.25, t: 279, a: 78.15, u: 23.35, j: 177.08, g: 0, tot: 737.83, p: 44 },
  13: { e: 151.47, t: 344.54, a: 18.76, u: 55.88, j: 54.26, g: 0, tot: 624.91, p: 42 },
  14: { e: 92.89, t: 432.91, a: 47.7, u: 34.89, j: 166.52, g: 0, tot: 774.91, p: 50 },
  15: { e: 60.64, t: 479.67, a: 83.09, u: 0, j: 128.94, g: 0, tot: 752.34, p: 45 },
  16: { e: 111.09, t: 427.35, a: 103.09, u: 150.48, j: 335.03, g: 0, tot: 1127.04, p: 73 },
  17: { e: 67.45, t: 384.14, a: 62.2, u: 57.1, j: 59.7, g: 0, tot: 630.59, p: 37 },
  18: { e: 125.05, t: 304.51, a: 34.19, u: 57, j: 19.65, g: 0, tot: 540.4, p: 29 },
  19: { e: 78.93, t: 308.61, a: 52.38, u: 17, j: 77.85, g: 0, tot: 534.77, p: 35 },
  20: { e: 140.9, t: 387.71, a: 115.54, u: 32.9, j: 80.49, g: 0, tot: 757.54, p: 46 },
  21: { e: 306.46, t: 845.12, a: 140.47, u: 35.9, j: 274.79, g: 0, tot: 1602.74, p: 97 },
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => r2(n).toFixed(2);
const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
const bid = (d) =>
  String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
function dayKey(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
function sessDay(s) {
  return dayKey(s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '');
}
function chTot(s, ch) {
  const a = Number(s.aggregatorClosingTotals?.[ch] || 0);
  if (a > 0) return r2(a);
  return r2(Number(s.summary?.salesByChannel?.[ch] || s.salesByChannel?.[ch] || 0));
}
function isMm(name) {
  const f = fold(name);
  if (/burger|black\s*b|taco/.test(f)) return false;
  return /modomio|\bmm\b|pizza/.test(f);
}
function isBb(name) {
  const f = fold(name);
  return /burger|black\s*b|\bbb\b|taco/.test(f);
}

async function docs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${db} ${res.status}`);
  return ((await res.json()).rows || []).map((r) => r.doc).filter(Boolean);
}

function storeOf(s) {
  const m = s.summary?.salesByMethod || {};
  return {
    e: r2(m.efectivo || 0),
    t: r2(m.tarjeta || 0),
    x: r2((m.bizum || 0) + (m.otro || 0)),
    a: r2(chTot(s, 'flipdish') + chTot(s, 'app')),
    u: r2(chTot(s, 'ubereats')),
    j: r2(chTot(s, 'justeat')),
    g: r2(chTot(s, 'glovo')),
    p: Math.max(0, Math.floor(Number(s.productClosingCounts?.pizza || 0))),
    b: Math.max(0, Math.floor(Number(s.productClosingCounts?.burger || 0))),
  };
}

function brandIds(s) {
  const labels = s.closingBrandLabels || {};
  const ids = new Set([
    ...Object.keys(labels),
    ...Object.keys(s.closingBrandTpvTotals || {}),
  ]);
  for (const map of Object.values(s.aggregatorClosingBrandTotals || {})) {
    for (const id of Object.keys(map || {})) ids.add(id);
  }
  const mm = [];
  const bb = [];
  const other = [];
  for (const id of ids) {
    const lab = labels[id] || id;
    if (isMm(lab) || isMm(id)) mm.push(id);
    else if (isBb(lab) || isBb(id)) bb.push(id);
    else other.push(id);
  }
  return { mm, bb, other, labels };
}

function mmTpv(s, mm) {
  let e = 0;
  let t = 0;
  for (const id of mm) {
    const pay = s.closingBrandTpvTotals?.[id];
    if (!pay) continue;
    e += Number(pay.efectivo || 0);
    t += Number(pay.tarjeta || 0);
  }
  return { e: r2(e), t: r2(t) };
}

function mmCh(s, mm, channels) {
  let sum = 0;
  for (const ch of channels) {
    const map = s.aggregatorClosingBrandTotals?.[ch] || {};
    for (const id of mm) sum += Number(map[id] || 0);
  }
  return r2(sum);
}

function dumpBrandMap(s, ch, labels) {
  const map = s.aggregatorClosingBrandTotals?.[ch] || {};
  const entries = Object.entries(map).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return '(vacío)';
  return entries.map(([id, v]) => `${labels[id] || id.slice(0, 10)}=${fmt(v)}`).join(', ');
}

async function main() {
  console.log(JSON.stringify({ mode: 'READ_ONLY', q: 'MM Tiana marca vs Excel' }));
  const delivery = await docs('bbddsaas-delivery');
  const dayKeys = Object.keys(EXCEL).map((d) => `${MONTH}-${String(d).padStart(2, '0')}`);

  const sessions = delivery.filter((d) => {
    if (!d || d.deletedAt) return false;
    if (d.type !== 'tpv_register_session') return false;
    if (bid(d) !== DIS) return false;
    if (!dayKeys.includes(sessDay(d))) return false;
    const name = `${d.pointOfSaleName || ''} ${d.salesPointName || ''} ${d.name || ''}`;
    return /tiana/i.test(name);
  });
  console.log('sesiones', sessions.length);

  const sum = {
    excel: { e: 0, t: 0, a: 0, u: 0, j: 0, g: 0, tot: 0, p: 0 },
    mm: { e: 0, t: 0, a: 0, u: 0, j: 0, g: 0, tot: 0, p: 0 },
    store: { e: 0, t: 0, a: 0, u: 0, j: 0, g: 0, tot: 0, p: 0 },
  };
  const flags = {
    glovoStoreSinMapa: 0,
    glovoMmEnCajaExcel0: 0,
    caja1Vacia: 0,
    appsBrandVacio: 0,
    mmIdsVacios: 0,
  };

  console.log('\ndía | excel | mmCaja | store | Δ(ex-mm) | gStore | gMM | gExcel | caja1 | brandApps');

  for (const n of Object.keys(EXCEL).map(Number).sort((a, b) => a - b)) {
    const excel = EXCEL[n];
    const day = `${MONTH}-${String(n).padStart(2, '0')}`;
    const list = sessions.filter((s) => sessDay(s) === day);
    const s =
      [...list].sort((a, b) => {
        const A = storeOf(a);
        const B = storeOf(b);
        return B.e + B.t + B.a + B.u + B.j + B.g - (A.e + A.t + A.a + A.u + A.j + A.g);
      })[0] || null;

    for (const k of Object.keys(sum.excel)) sum.excel[k] = r2(sum.excel[k] + (excel[k] || 0));

    if (!s) {
      console.log(String(n).padStart(2), 'SIN SESION');
      continue;
    }

    const store = storeOf(s);
    const { mm, labels } = brandIds(s);
    let mmList = mm;
    if (!mmList.length) {
      flags.mmIdsVacios += 1;
      // fallback: todo lo que no sea burger
      const all = brandIds(s);
      mmList = [...all.other];
    }

    const hasCaja1 = Object.values(s.closingBrandTpvTotals || {}).some(
      (p) => p && (Number(p.efectivo) > 0 || Number(p.tarjeta) > 0),
    );
    const hasBrandApps = Object.values(s.aggregatorClosingBrandTotals || {}).some(
      (m) => m && Object.values(m).some((v) => Number(v) > 0),
    );
    if (!hasCaja1) flags.caja1Vacia += 1;
    if (!hasBrandApps) flags.appsBrandVacio += 1;

    const tpv = mmTpv(s, mmList);
    const mmRow = {
      e: hasCaja1 ? tpv.e : 0,
      t: hasCaja1 ? tpv.t : 0,
      a: mmCh(s, mmList, ['flipdish', 'app']),
      u: mmCh(s, mmList, ['ubereats']),
      j: mmCh(s, mmList, ['justeat']),
      g: mmCh(s, mmList, ['glovo']),
      p: store.p,
    };
    // Si no hay mapa brand apps, el export reparte por uds pizza/(pizza+burger)
    if (!hasBrandApps) {
      const den = store.p + store.b || 1;
      const sh = store.p / den;
      mmRow.a = r2(store.a * sh);
      mmRow.u = r2(store.u * sh);
      mmRow.j = r2(store.j * sh);
      mmRow.g = r2(store.g * sh);
    }
    mmRow.tot = r2(mmRow.e + mmRow.t + mmRow.a + mmRow.u + mmRow.j + mmRow.g);
    store.tot = r2(store.e + store.t + store.x + store.a + store.u + store.j + store.g);

    for (const k of ['e', 't', 'a', 'u', 'j', 'g', 'tot', 'p']) {
      sum.mm[k] = r2(sum.mm[k] + (mmRow[k] || 0));
      sum.store[k] = r2(sum.store[k] + (store[k] || 0));
    }

    if (store.g > 0 && Object.keys(s.aggregatorClosingBrandTotals?.glovo || {}).length === 0) {
      flags.glovoStoreSinMapa += 1;
    }
    if (mmRow.g > 0.009 && excel.g <= 0) flags.glovoMmEnCajaExcel0 += 1;

    console.log(
      [
        String(n).padStart(2),
        fmt(excel.tot),
        fmt(mmRow.tot),
        fmt(store.tot),
        fmt(excel.tot - mmRow.tot),
        fmt(store.g),
        fmt(mmRow.g),
        fmt(excel.g),
        hasCaja1 ? 'Y' : 'N',
        hasBrandApps ? 'Y' : 'N',
      ].join(' | '),
    );

    // Detalle si Glovo store > 0 o hueco grande Excel vs MM
    if (store.g > 0 || Math.abs(excel.tot - mmRow.tot) >= 5) {
      console.log(
        `   MM=${mmList.map((id) => labels[id] || id.slice(0, 8)).join('|') || '∅'} | glovoMap=${dumpBrandMap(s, 'glovo', labels)}`,
      );
      console.log(
        `   Caja1 MM e/t ${fmt(mmRow.e)}/${fmt(mmRow.t)} vs store ${fmt(store.e)}/${fmt(store.t)} | Excel e/t ${fmt(excel.e)}/${fmt(excel.t)}`,
      );
      console.log(
        `   Apps MM a/u/j/g ${fmt(mmRow.a)}/${fmt(mmRow.u)}/${fmt(mmRow.j)}/${fmt(mmRow.g)} | Excel ${fmt(excel.a)}/${fmt(excel.u)}/${fmt(excel.j)}/${fmt(excel.g)} | store ${fmt(store.a)}/${fmt(store.u)}/${fmt(store.j)}/${fmt(store.g)}`,
      );
    }
  }

  console.log('\n=== MES ===');
  console.log('Excel MM', sum.excel);
  console.log('Caja MM (marca)', sum.mm);
  console.log('Store Tiana', sum.store);
  console.log('Excel − CajaMM', {
    e: fmt(sum.excel.e - sum.mm.e),
    t: fmt(sum.excel.t - sum.mm.t),
    a: fmt(sum.excel.a - sum.mm.a),
    u: fmt(sum.excel.u - sum.mm.u),
    j: fmt(sum.excel.j - sum.mm.j),
    g: fmt(sum.excel.g - sum.mm.g),
    tot: fmt(sum.excel.tot - sum.mm.tot),
  });
  console.log('Store − CajaMM (lo que NO es Modomio / no atribuido)', {
    e: fmt(sum.store.e - sum.mm.e),
    t: fmt(sum.store.t - sum.mm.t),
    a: fmt(sum.store.a - sum.mm.a),
    u: fmt(sum.store.u - sum.mm.u),
    j: fmt(sum.store.j - sum.mm.j),
    g: fmt(sum.store.g - sum.mm.g),
    tot: fmt(sum.store.tot - sum.mm.tot),
  });
  console.log('flags', flags);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
