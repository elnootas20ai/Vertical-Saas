#!/usr/bin/env node
/**
 * Solo lectura: sesiones tpv_register_session Modomio / Tiana (arqueo ~172 / 181).
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const MODOMIO = '33821959-ae50-4e52-bfea-ea2b145faeac';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function isCash(pm) {
  return String(pm || '').trim().toLowerCase() === 'efectivo';
}

function summarize(session) {
  const txs = session.transactions || [];
  const cashSales = txs
    .filter((t) => t.type === 'sale' && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const staff = txs
    .filter((t) => t.type === 'staff_consumption' && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashReturns = txs
    .filter((t) => t.type === 'return' && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashIn = txs.filter((t) => t.type === 'cash_in').reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashOut = txs
    .filter((t) => t.type === 'cash_out' || t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cardSales = txs
    .filter((t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === 'tarjeta')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expected = money(
    Number(session.initialCashAmount || 0) + cashSales + staff - cashReturns + cashIn - cashOut,
  );
  return {
    fondo: money(session.initialCashAmount),
    cashSales: money(cashSales),
    staff: money(staff),
    cashReturns: money(cashReturns),
    cashIn: money(cashIn),
    cashOut: money(cashOut),
    cardSales: money(cardSales),
    expected,
    dayCashLikeUi: money(cashSales),
  };
}

const data = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const regs = docs.filter(
  (d) =>
    d.type === 'tpv_register_session' ||
    String(d._id || '').startsWith('tpvreg-'),
);
console.log('register sessions', regs.length);

const ranked = regs
  .map((d) => {
    const s = summarize(d);
    const name = String(d.salesPointName || d.pointOfSaleName || d.terminalName || d.storeName || '');
    const score =
      (bid(d) === MODOMIO ? 10 : 0) +
      (/tiana/i.test(name) ? 5 : 0) +
      (/modomio/i.test(name) ? 3 : 0) +
      (Math.abs(s.expected - 172.05) < 0.05 ? 20 : 0) +
      (Math.abs(s.cashSales - 181.05) < 0.05 ? 20 : 0) +
      (d.status === 'open' ? 2 : 0);
    return { d, s, name, score };
  })
  .filter((x) => x.score >= 10 || bid(x.d) === MODOMIO)
  .sort((a, b) => b.score - a.score || new Date(b.d.openedAt || 0) - new Date(a.d.openedAt || 0));

console.log('candidates', ranked.length);
for (const { d, s, name, score } of ranked.slice(0, 15)) {
  const outs = (d.transactions || []).filter((t) => t.type === 'cash_out' || t.type === 'expense');
  const ins = (d.transactions || []).filter((t) => t.type === 'cash_in');
  const voided = d.voidedCashMovements || [];
  console.log('\n=== score', score, d._id);
  console.log({
    name,
    status: d.status,
    openedAt: d.openedAt,
    closedAt: d.closedAt,
    worker: d.workerName,
    salesPointId: d.salesPointId || d.pointOfSaleId,
    bid: bid(d),
    terminal: d.terminalName,
  });
  console.log('math', s);
  console.log(
    'outs',
    outs.map((t) => ({
      amount: t.amount,
      desc: t.description,
      date: t.date,
      by: t.workerName || t.createdByName,
    })),
  );
  console.log(
    'ins',
    ins.map((t) => ({ amount: t.amount, desc: t.description, date: t.date })),
  );
  console.log(
    'voided',
    voided.map((v) => ({
      type: v.type,
      amount: v.amount,
      reason: v.voidReason || v.reason,
      voidedAt: v.voidedAt,
    })),
  );
  console.log({
    expectedCash: d.expectedCash,
    actualCash: d.actualCash,
    difference: d.difference,
    closingNotes: d.closingNotes,
  });
}
