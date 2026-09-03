/**
 * Solo lectura — cierre/estado caja TIANA (hoy + ayer Madrid).
 * Uso VPS: node scripts/diag-tiana-caja-hoy.mjs
 */
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
const TIANA = /tiana/i;

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function madridDayKey(iso) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso || Date.now()));
  } catch {
    return String(iso || '').slice(0, 10);
  }
}

function sessionDay(s) {
  const raw = s.closedAt || s.openedAt || s.createdAt;
  return madridDayKey(raw);
}

function sumMap(m) {
  return money(Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0));
}

function isCash(pm) {
  return String(pm || '').trim().toLowerCase() === 'efectivo';
}

function summarizeTx(session) {
  const txs = session.transactions || [];
  const cashSales = txs
    .filter((t) => t.type === 'sale' && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cardSales = txs
    .filter((t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === 'tarjeta')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const bizum = txs
    .filter((t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === 'bizum')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashIn = txs.filter((t) => t.type === 'cash_in').reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashOut = txs
    .filter((t) => t.type === 'cash_out' || t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashReturns = txs
    .filter((t) => t.type === 'return' && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expected = money(
    Number(session.initialCashAmount || 0) + cashSales - cashReturns + cashIn - cashOut,
  );
  return {
    cashSales: money(cashSales),
    cardSales: money(cardSales),
    bizum: money(bizum),
    cashIn: money(cashIn),
    cashOut: money(cashOut),
    expected,
  };
}

function isTiana(d) {
  const name = String(
    d.pointOfSaleName || d.salesPointName || d.pdvName || d.terminalName || d.storeName || '',
  );
  const id = String(d.pointOfSaleId || d.salesPointId || d._id || '');
  return TIANA.test(name) || TIANA.test(id);
}

const today = madridDayKey();
const yesterdayDate = new Date();
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterday = madridDayKey(yesterdayDate.toISOString());

const data = await couch(`/${DB}/_all_docs?include_docs=true`);
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);

const sessions = docs
  .filter((d) => {
    if (d.deletedAt) return false;
    if (d.type !== 'tpv_register_session' && !String(d._id || '').startsWith('tpvreg-')) return false;
    const b = bid(d);
    const uid = String(d.user_id || '').trim();
    if (!(uid === PAU || b === DIS || b === MOD || isTiana(d))) return false;
    return isTiana(d);
  })
  .sort((a, b) =>
    String(b.openedAt || b.createdAt || '').localeCompare(String(a.openedAt || a.createdAt || '')),
  );

const focus = sessions.filter((s) => {
  const day = sessionDay(s);
  return day === today || day === yesterday || s.status === 'open';
});

console.log(
  JSON.stringify(
    {
      mode: 'READ_ONLY',
      madridToday: today,
      yesterday,
      tianaTotal: sessions.length,
      focusCount: focus.length,
      openNow: sessions.filter((s) => s.status === 'open').length,
    },
    null,
    2,
  ),
);

for (const s of focus.slice(0, 8)) {
  const sum = s.summary || {};
  const methods = sum.salesByMethod || {};
  const tx = summarizeTx(s);
  const aggT = s.aggregatorClosingTotals || {};
  const aggC = s.aggregatorClosingCash || {};
  const aggCard = s.aggregatorClosingCard || {};
  const counts = s.productClosingCounts || {};
  const outs = (s.transactions || [])
    .filter((t) => t.type === 'cash_out' || t.type === 'expense')
    .map((t) => ({
      amount: money(t.amount),
      desc: t.description || t.notes || '',
      by: t.workerName || t.createdByName || '',
      at: t.date || t.createdAt || '',
    }));
  const counted = money(s.finalCashAmount ?? sum.countedCash ?? s.countedCash);
  const expectedDoc = money(s.expectedCash ?? sum.expectedCash ?? tx.expected);
  const enLocal = money(
    s.nextDayInitialCash != null && s.nextDayInitialCash !== ''
      ? s.nextDayInitialCash
      : counted,
  );

  console.log('\n==========');
  console.log(
    JSON.stringify(
      {
        id: s._id,
        day: sessionDay(s),
        name: s.pointOfSaleName || s.salesPointName || s.pdvName || null,
        status: s.status || (s.closedAt ? 'closed' : 'open'),
        worker: s.workerName || s.openedByName || null,
        openedAt: s.openedAt,
        closedAt: s.closedAt || null,
        biz: bid(s) === DIS ? 'DISARMINK' : bid(s) === MOD ? 'Modomio' : bid(s) || null,
        fondo: money(s.initialCashAmount),
        summaryMethods: {
          efectivo: money(methods.efectivo),
          tarjeta: money(methods.tarjeta),
          bizum: money(methods.bizum),
          totalSales: money(sum.totalSales),
        },
        txMath: tx,
        expectedCash: expectedDoc,
        countedCash: counted,
        difference: money(s.difference ?? counted - expectedDoc),
        enLocal,
        retirado: money(Math.max(0, counted - enLocal)),
        productCounts: {
          pizza: Number(counts.pizza || 0),
          burger: Number(counts.burger || 0),
          taco: Number(counts.taco || 0),
        },
        apps: {
          totals: aggT,
          cash: aggC,
          card: aggCard,
          cashSum: sumMap(aggC),
          cardSum: sumMap(aggCard),
          totSum: sumMap(aggT),
        },
        cashOuts: outs,
        closingNotes: String(s.closingNotes || s.notes || '').trim() || null,
        txCount: Array.isArray(s.transactions) ? s.transactions.length : 0,
        pendingValidation: Boolean(s.pendingManagerValidation || s.needsValidation),
      },
      null,
      2,
    ),
  );
}

if (!focus.length) {
  console.log('\nSin sesiones Tiana hoy/ayer/open. Últimas 5 Tiana:');
  for (const s of sessions.slice(0, 5)) {
    console.log({
      id: s._id,
      day: sessionDay(s),
      name: s.pointOfSaleName || s.salesPointName,
      status: s.status,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
    });
  }
}
