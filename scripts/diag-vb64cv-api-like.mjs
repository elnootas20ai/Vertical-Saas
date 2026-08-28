#!/usr/bin/env node
/** Simula API del gate: sesiones Tiana VB64CV con filtro businessId (lite 7d). */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const OWNER = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PDV = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';
const WC = 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

// replicate opsLite + business filter like backend
const from = new Date();
from.setUTCDate(from.getUTCDate() - 7);
from.setUTCHours(0, 0, 0, 0);
const dateFrom = from.toISOString();

const data = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const all = (data.rows || []).map((r) => r.doc).filter(Boolean);
const regs = all.filter(
  (d) => d.type === 'tpv_register_session' && d.user_id === OWNER && !d.deletedAt,
);

const pdvs = all.filter((d) => d.type === 'point_of_sale' && !d.deletedAt);
const scopedIds = new Set();
for (const p of pdvs) {
  const pb = String(p.business_id || p.businessId || '').replace(/^business:/, '').trim();
  if (pb === BIZ) {
    if (p._id) scopedIds.add(p._id);
    if (p.workCenterId) scopedIds.add(p.workCenterId);
  }
}

const inWindow = (s) => {
  if (s.status === 'open') return true;
  const ts = String(s.createdAt || s.openedAt || '');
  if (ts >= dateFrom) return true;
  const closedTs = String(s.closedAt || s.updatedAt || '');
  return closedTs >= dateFrom;
};

let sessions = regs.filter(inWindow);
sessions = sessions.filter((s) => {
  const pid = String(s.pointOfSaleId || '').trim();
  return !pid || scopedIds.has(pid);
});
sessions = sessions.filter((s) => {
  const pid = String(s.pointOfSaleId || '').trim();
  return pid === PDV || pid === WC;
});

console.log('scopedIds', [...scopedIds].filter((id) => id.includes('934') || id.includes('ffdee')));
console.log('API-like sessions for Tiana', sessions.length);
for (const s of sessions) {
  console.log({
    id: s._id,
    status: s.status,
    pointOfSaleId: s.pointOfSaleId,
    worker: s.workerName,
    nextDayInitialCash: s.nextDayInitialCash,
    closedAt: s.closedAt,
  });
}
