#!/usr/bin/env node
/** Diag prod: VB64CV Tiana — sesiones y fondo (sin imports TS). */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const CODE = String(process.env.TERMINAL_CODE || 'VB64CV').trim().toUpperCase();

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d?.business_id || d?.businessId || '').replace(/^business:/, '').trim();
}

function sessionMatchesStore(s, pick, pdv, wcId) {
  const pid = String(s.pointOfSaleId || '').trim();
  const refs = new Set([pick, wcId, String(pdv._id || ''), String(pdv.workCenterId || '')].filter(Boolean));
  return !pid || refs.has(pid);
}

const data = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const pdvs = docs.filter((d) => d.type === 'point_of_sale' && !d.deletedAt);
const matchPdv = pdvs.find((p) => String(p.terminalCode || '').trim().toUpperCase() === CODE);
if (!matchPdv) {
  console.log('NO PDV for code', CODE);
  process.exit(1);
}

const userId = String(matchPdv.user_id || '').trim();
const pdvId = String(matchPdv._id || '').trim();
const wcId = String(matchPdv.workCenterId || '').trim();

console.log('=== PDV', CODE, '===');
console.log({ pdvId, wcId, name: matchPdv.name, userId, businessId: bid(matchPdv) });

const regs = docs.filter(
  (d) =>
    (d.type === 'tpv_register_session' || String(d._id || '').startsWith('tpvreg-'))
    && String(d.user_id || '') === userId
    && !d.deletedAt,
);

const forStore = regs.filter((s) => sessionMatchesStore(s, pdvId, matchPdv, wcId));
const opens = forStore.filter((s) => String(s.status) === 'open');
const closed = forStore
  .filter((s) => String(s.status) === 'closed')
  .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')));

console.log('\nOPEN sessions', opens.length);
for (const s of opens) {
  console.log({
    id: s._id,
    pointOfSaleId: s.pointOfSaleId,
    worker: s.workerName,
    terminal: s.terminalName,
    openedAt: s.openedAt,
    business_id: bid(s),
  });
}

console.log('\nLast 5 CLOSED');
for (const s of closed.slice(0, 5)) {
  console.log({
    id: s._id,
    pointOfSaleId: s.pointOfSaleId,
    closedAt: s.closedAt,
    nextDayInitialCash: s.nextDayInitialCash,
    finalCashAmount: s.finalCashAmount,
    worker: s.workerName,
  });
}

const from = new Date();
from.setUTCDate(from.getUTCDate() - 7);
from.setUTCHours(0, 0, 0, 0);
const dateFrom = from.toISOString();
const inWindow = (s) => {
  if (String(s.status) === 'open') return true;
  const ts = String(s.createdAt || s.openedAt || '');
  if (ts >= dateFrom) return true;
  const closedTs = String(s.closedAt || s.updatedAt || '');
  return closedTs >= dateFrom;
};
const lite = forStore.filter(inWindow);
console.log('\n7-day gate window dateFrom', dateFrom);
console.log('sessions in lite window', lite.length, 'open', lite.filter((s) => s.status === 'open').length);
const lastInWindow = closed.filter(inWindow)[0];
console.log('last closed in window', lastInWindow ? {
  closedAt: lastInWindow.closedAt,
  nextDayInitialCash: lastInWindow.nextDayInitialCash,
} : 'NONE — fondo will show 0');
