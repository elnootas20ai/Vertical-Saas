#!/usr/bin/env node
/** SOLO LECTURA — días 20–23 ago: store vs Caja1 vs reparto MM */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || process.env.COUCH_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DAYS = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function dayKey(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
function chTot(s, ch) {
  const a = Number(s.aggregatorClosingTotals?.[ch] || 0);
  if (a > 0) return r2(a);
  return r2(Number(s.summary?.salesByChannel?.[ch] || 0));
}
function storeAmounts(s) {
  const m = s.summary?.salesByMethod || {};
  const efectivo = r2(m.efectivo || 0);
  const tpv = r2(m.tarjeta || 0);
  const x = r2((m.bizum || 0) + (m.otro || 0));
  const flip = r2(chTot(s, 'flipdish') + chTot(s, 'app'));
  const uber = chTot(s, 'ubereats');
  const je = chTot(s, 'justeat');
  const glovo = chTot(s, 'glovo');
  const total = r2(efectivo + tpv + x + flip + uber + je + glovo);
  const pizza = Math.max(0, Math.floor(Number(s.productClosingCounts?.pizza || 0)));
  const burger = Math.max(0, Math.floor(Number(s.productClosingCounts?.burger || 0)));
  return { efectivo, tpv, x, flip, uber, je, glovo, total, pizza, burger };
}
function sumCaja1(map) {
  let e = 0;
  let t = 0;
  for (const pay of Object.values(map || {})) {
    if (!pay) continue;
    e += Number(pay.efectivo) || 0;
    t += Number(pay.tarjeta) || 0;
  }
  return { e: r2(e), t: r2(t), tot: r2(e + t) };
}
function caja1Suspicious(s, st) {
  const c1 = sumCaja1(s.closingBrandTpvTotals);
  const u = st.pizza + st.burger;
  if (u <= 0 || c1.tot <= 0) return false;
  if (Math.abs(c1.tot - u) > 0.02) return false;
  if (st.pizza > 0 && Math.abs(c1.e - st.pizza) > 0.02) return false;
  if (st.burger > 0 && Math.abs(c1.t - st.burger) > 0.02) return false;
  return true;
}
function unitSplitMm(st) {
  const den = st.pizza + st.burger || 1;
  const sh = st.pizza / den;
  return {
    ef: r2(st.efectivo * sh),
    x: r2(st.x * sh),
    visa: r2(st.tpv * sh),
    pizza: st.pizza,
    share: r2(sh),
  };
}
function mmFromCaja1(s, labels) {
  const map = s.closingBrandTpvTotals || {};
  let ef = 0;
  let tj = 0;
  for (const [brandId, pay] of Object.entries(map)) {
    const name = String(labels[brandId] || brandId).toLowerCase();
    if (/burger|black|taco/.test(name)) continue;
    if (/modomio|pizza|\bmm\b/.test(name) || !/burger/.test(name)) {
      ef += Number(pay.efectivo) || 0;
      tj += Number(pay.tarjeta) || 0;
    }
  }
  return { ef: r2(ef), visa: r2(tj) };
}

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);

  for (const day of DAYS) {
    const list = docs.filter(
      (d) =>
        d?.type === 'tpv_register_session'
        && bid(d) === DIS
        && dayKey(d) === day
        && /tiana/i.test(`${d.pointOfSaleName || ''} ${d.salesPointName || ''}`),
    );
    console.log(`\n======== ${day} (${list.length}) ========`);
    for (const s of list) {
      const st = storeAmounts(s);
      const c1 = sumCaja1(s.closingBrandTpvTotals);
      const sus = caja1Suspicious(s, st);
      const unit = unitSplitMm(st);
      const mmC1 = mmFromCaja1(s, s.closingBrandLabels || {});
      const excelEf = sus ? unit.ef + unit.x : mmC1.ef; // prod sin fix usa caja1
      const excelVisa = sus ? unit.visa : mmC1.visa;
      console.log(JSON.stringify({
        id: String(s._id).slice(0, 20),
        pdv: s.pointOfSaleName,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        workDayKey: s.workDayKey,
        businessDayKey: s.businessDayKey,
        openDay: dayKey({ openedAt: s.openedAt }),
        closeDay: dayKey({ openedAt: s.closedAt }),
        storeEf: st.efectivo,
        storeVisa: st.tpv,
        storeX: st.x,
        storeTotal: st.total,
        pizza: st.pizza,
        burger: st.burger,
        caja1: s.closingBrandTpvTotals,
        caja1Sum: c1,
        caja1Suspicious: sus,
        mmFromCaja1: mmC1,
        mmUnitSplit: { ef: unit.ef + unit.x, visa: unit.visa, share: unit.share },
        prodExcelMm: { ef: excelEf, visa: excelVisa },
        userExcelRef: day === '2026-08-22' ? { ef: 174.3, visa: 361.78, pizza: 46 } : day === '2026-08-23' ? { ef: 46.5, visa: 229.24, pizza: 40 } : null,
      }, null, 2));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
