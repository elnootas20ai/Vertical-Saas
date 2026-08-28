#!/usr/bin/env node
/** SOLO LECTURA — Badalona 21/22/23 ago: qué hay guardado en el cierre vs Excel MM */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || process.env.COUCH_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DAYS = ['2026-08-21', '2026-08-22', '2026-08-23'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function dayKeyOpened(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
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

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);

  for (const day of DAYS) {
    // TODAS las sesiones DIS del día (todas las tiendas) para no equivocarnos de PDV
    const list = docs.filter(
      (d) =>
        d?.type === 'tpv_register_session'
        && bid(d) === DIS
        && dayKeyOpened(d.openedAt) === day,
    );
    console.log(`\n================= ${day} · ${list.length} sesiones DIS =================`);
    for (const s of list) {
      const m = s.summary?.salesByMethod || {};
      const p = s.productClosingCounts || {};
      console.log('--- id:', s._id);
      console.log('pdv:', s.pointOfSaleName, '| pdvId:', s.pointOfSaleId, '| status:', s.status);
      console.log('opened:', s.openedAt, '→ closed:', s.closedAt);
      console.log(
        'STORE  ef:', r2(m.efectivo),
        '| visa:', r2(m.tarjeta),
        '| bizum+otro:', r2((m.bizum || 0) + (m.otro || 0)),
        '| totalSales:', r2(s.summary?.totalSales),
      );
      console.log(
        'APPS   flip:', chTot(s, 'flipdish'), '+app:', chTot(s, 'app'),
        '| uber:', chTot(s, 'ubereats'),
        '| je:', chTot(s, 'justeat'),
        '| glovo:', chTot(s, 'glovo'),
      );
      console.log('UDS    pizza:', p.pizza, '| burger:', p.burger, '| taco:', p.taco);
      console.log('CAJA1 guardada (closingBrandTpvTotals):', JSON.stringify(s.closingBrandTpvTotals ?? null));
      console.log('labels:', JSON.stringify(s.closingBrandLabels ?? null));
      console.log('sheetIds:', JSON.stringify(s.closingBrandSheetIds ?? null));
      const brandApps = s.aggregatorClosingBrandTotals || {};
      for (const ch of ['glovo', 'justeat', 'ubereats', 'flipdish', 'app']) {
        const map = brandApps[ch];
        if (!map || !Object.keys(map).length) continue;
        console.log('APPS×marca', ch, JSON.stringify(map));
      }
      // Transacciones de venta (para saber si hay txs con las que recalcular)
      const txs = Array.isArray(s.transactions) ? s.transactions.filter((t) => t?.type === 'sale') : [];
      let txEf = 0; let txTj = 0;
      for (const t of txs) {
        const amt = r2(t.amount);
        const method = String(t.paymentMethod || '').toLowerCase();
        if (/efectivo|cash/.test(method)) txEf = r2(txEf + amt);
        else if (/tarjeta|card|visa/.test(method)) txTj = r2(txTj + amt);
      }
      console.log('TXS sale:', txs.length, '| ef:', txEf, '| tj:', txTj);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
