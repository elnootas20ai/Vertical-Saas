#!/usr/bin/env node
/**
 * SOLO LECTURA — Valida lógica export 4 hojas vs cierres prod.
 * MM TIANA · BB TIANA · MM BADALONA · BB BDN
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER || process.env.COUCH_USER}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD}`).toString('base64');

const MM = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';
const BB = 'brand-e99413ea-59df-4382-8a06-1d56fac890e0';

const SHEETS = [
  { title: 'MM TIANA', store: /tiana/i, brand: MM, sheetId: 'modomio' },
  { title: 'BB TIANA', store: /tiana/i, brand: BB, sheetId: 'blackburger' },
  { title: 'MM BADALONA', store: /badalona|\bbdn\b/i, brand: MM, sheetId: 'modomio' },
  { title: 'BB BDN', store: /badalona|\bbdn\b/i, brand: BB, sheetId: 'blackburger' },
];

const CHANNELS = [
  { key: 'justEat', ch: 'justeat' },
  { key: 'uber', ch: 'ubereats' },
  { key: 'glovo', ch: 'glovo' },
  { key: 'flipdish', ch: 'flipdish', also: ['app'] },
];

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function day(s) {
  const d = new Date(s.workDayKey || s.businessDayKey || s.openedAt || '');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function matchesStore(s, re) {
  const name = `${s.pointOfSaleName || ''} ${s.salesPointName || ''}`;
  return re.test(name) || re.test(String(s.pointOfSaleId || ''));
}

function brandChannelAmt(s, brandId, ch, also = []) {
  let sum = 0;
  for (const c of [ch, ...also]) {
    const map = s.aggregatorClosingBrandTotals?.[c];
    if (!map) continue;
    for (const [id, raw] of Object.entries(map)) {
      if (id === brandId || id.includes(brandId.replace('brand-', ''))) {
        sum += Number(raw) || 0;
      }
    }
  }
  return r2(sum);
}

function hasBrandApps(s) {
  const maps = s.aggregatorClosingBrandTotals;
  if (!maps) return false;
  for (const per of Object.values(maps)) {
    if (!per) continue;
    for (const v of Object.values(per)) if (Number(v) > 0) return true;
  }
  return false;
}

function caja1Brand(s, brandId) {
  const pay = s.closingBrandTpvTotals?.[brandId];
  if (!pay) return null;
  const ef = r2(pay.efectivo);
  const tj = r2(pay.tarjeta);
  if (ef <= 0 && tj <= 0) return null;
  return { efectivo: ef, tarjeta: tj };
}

function unitShare(s) {
  const p = Math.max(0, Number(s.productClosingCounts?.pizza) || 0);
  const b = Math.max(0, Number(s.productClosingCounts?.burger) || 0);
  const t = Math.max(0, Number(s.productClosingCounts?.taco) || 0);
  const total = p + b; // tacos en hoja burger vía config típica
  if (total <= 0) return { mm: 0.5, bb: 0.5, p, b, t };
  return { mm: p / total, bb: (b + t) / total, p, b, t };
}

function expectedVertial(s, brandId, sheet) {
  const c1 = caja1Brand(s, brandId);
  if (c1) return { ...c1, source: 'Caja1' };
  const m = s.summary?.salesByMethod || {};
  const ef = r2(m.efectivo || 0);
  const tj = r2(m.tarjeta || 0);
  const biz = r2((m.bizum || 0) + (m.otro || 0));
  const sh = sheet.brand === MM ? unitShare(s).mm : unitShare(s).bb;
  return {
    efectivo: r2(ef * sh),
    tarjeta: r2(tj * sh),
    bizum: r2(biz * sh),
    source: 'uds%',
  };
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  return (await res.json()).rows.map((r) => r.doc).filter(Boolean);
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) =>
  d?.type?.includes('tpv_register') && !d.deletedAt && d.status !== 'open',
);

console.log(JSON.stringify({ mode: 'VALIDATE_4_SHEETS', sessions: sessions.length }, null, 2));

for (const sheet of SHEETS) {
  const storeSessions = sessions.filter((s) => matchesStore(s, sheet.store));
  let withCaja1 = 0;
  let withApps = 0;
  let sampleDays = [];

  for (const s of storeSessions) {
    if (caja1Brand(s, sheet.brand)) withCaja1 += 1;
    if (hasBrandApps(s)) withApps += 1;
  }

  // últimos 3 días con actividad para esta hoja
  const active = storeSessions
    .map((s) => {
      const v = expectedVertial(s, sheet.brand, sheet);
      const apps = {};
      let appsSum = 0;
      for (const c of CHANNELS) {
        const amt = brandChannelAmt(s, sheet.brand, c.ch, c.also || []);
        apps[c.key] = amt;
        appsSum = r2(appsSum + amt);
      }
      const total = r2(v.efectivo + v.tarjeta + v.bizum + appsSum);
      const has = total > 0 || v.efectivo > 0 || v.tarjeta > 0 || appsSum > 0;
      return { day: day(s), v, apps, appsSum, total, has, c1: caja1Brand(s, sheet.brand) };
    })
    .filter((r) => r.has)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 3);

  console.log(`\n========== ${sheet.title} ==========`);
  console.log({ cierres: storeSessions.length, conCaja1Marca: withCaja1, conAppsMarca: withApps });
  for (const r of active) {
    console.log(`  ${r.day} | Vertial(${r.v.source}): ef ${r.v.efectivo} visa ${r.v.tarjeta} | JE ${r.apps.justEat} U ${r.apps.uber} G ${r.apps.glovo} F ${r.apps.flipdish} | TOTAL ${r.total}`);
    if (r.c1) {
      console.log(`    Caja1 guardada: ef ${r.c1.efectivo} tj ${r.c1.tarjeta}`);
    }
  }
}

console.log('\n=== REGLAS (lo que debe hacer el Excel) ===');
console.log('1. VERTIAL ef+visa = Total MM/BB Caja1 si existe; si no, % pizzas/burgers del Vertial tienda');
console.log('2. Integradores = Total MM/BB por canal en Caja2 (solo lo guardado)');
console.log('3. Sin repartir restos ni mezclar marcas');
console.log('4. MM TIANA/BADALONA = marca Modomio · BB TIANA/BDN = Black Burger');
