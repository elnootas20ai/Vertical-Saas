#!/usr/bin/env node
/**
 * Solo lectura: fichajes hoy Badalona / Pau (Disarmink / HoyPecamos).
 * Remoto: node scripts/remote-run-script.mjs diag-pau-badalona-clockins-today.mjs
 */
import '../config/env.js';

const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773'; // Disarmink / HoyPecamos (Pau)
const BADALONA = /badalona/i;
const PAU_HINT = /pau|royo|hoypecamos|disarmink/i;

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw || '127.0.0.1:5984'}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(
  `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64')}`;
const prefix = (process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial').toLowerCase();

function madridDay(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function madridTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function todayMadrid() {
  return madridDay(new Date().toISOString());
}

async function allDocs(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=200000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function tryAllDocs(candidates) {
  for (const db of candidates) {
    try {
      const docs = await allDocs(db);
      return { db, docs };
    } catch {
      /* next */
    }
  }
  return { db: null, docs: [] };
}

function bizIdsOf(doc) {
  return [
    doc.businessId,
    doc.business_id,
    doc.linkedBusinessId,
    doc.user_id,
  ]
    .map((x) => String(x || '').replace(/^business:/, '').trim())
    .filter(Boolean);
}

function isPauBiz(id) {
  return String(id || '').replace(/^business:/, '') === BID;
}

async function main() {
  const today = todayMadrid();
  console.log(`Couch: ${BASE}`);
  console.log(`Hoy Madrid: ${today}`);
  console.log(`Business Pau: ${BID}\n`);

  const accounts = await allDocs('accounts');
  const workers = accounts.filter(
    (a) =>
      a?.type === 'account' &&
      !a.deletedAt &&
      (isPauBiz(a.linkedBusinessId) ||
        isPauBiz(a.invitedBy) ||
        PAU_HINT.test(String(a.email || '')) ||
        PAU_HINT.test(String(a.fullName || a.name || ''))),
  );
  const byUser = new Map();
  for (const a of workers) {
    if (a.user_id) byUser.set(a.user_id, a);
  }
  console.log(`=== Cuentas Pau-related (${workers.length}) ===`);
  for (const a of workers.slice(0, 40)) {
    console.log(
      JSON.stringify({
        email: a.email,
        name: a.fullName || a.name,
        user_id: a.user_id,
        accountType: a.accountType,
        linkedBusinessId: a.linkedBusinessId,
        inviteStatus: a.inviteStatus,
        landingPage: a.landingPage,
      }),
    );
  }

  const wc = await tryAllDocs([`${prefix}-work-centers`, 'work-centers']);
  const sp = await tryAllDocs([`${prefix}-sales-points`, 'sales-points']);
  const badCenters = wc.docs.filter(
    (d) =>
      !d.deletedAt &&
      BADALONA.test(String(d.name || d.label || '')) &&
      bizIdsOf(d).some(isPauBiz),
  );
  const badPdvs = sp.docs.filter(
    (d) =>
      !d.deletedAt &&
      (BADALONA.test(String(d.name || d.label || '')) ||
        badCenters.some(
          (c) =>
            String(d.workCenterId || d.work_center_id || '') === String(c._id || c.id || '') ||
            String(d.salesPointId || d.id || '') === String(c.salesPointId || ''),
        )) &&
      (bizIdsOf(d).some(isPauBiz) || BADALONA.test(String(d.name || ''))),
  );

  console.log(`\n=== Work centers Badalona Pau (${badCenters.length}) db=${wc.db} ===`);
  for (const c of badCenters) {
    console.log(
      JSON.stringify({
        _id: c._id,
        name: c.name,
        businessId: c.businessId || c.business_id,
        active: c.active,
        salesPointId: c.salesPointId,
      }),
    );
  }
  console.log(`\n=== PDVs Badalona-ish (${badPdvs.length}) db=${sp.db} ===`);
  for (const p of badPdvs.slice(0, 20)) {
    console.log(
      JSON.stringify({
        _id: p._id,
        id: p.id,
        name: p.name,
        businessId: p.businessId || p.business_id,
        workCenterId: p.workCenterId,
        active: p.active,
        tabletCode: p.tabletCode || p.tablet_code || p.codigoTablet || null,
      }),
    );
  }

  const clockDb = await tryAllDocs([`${prefix}-clockins`, 'clockins', `${prefix}-clock_ins`, 'clock_ins']);
  const todayClock = clockDb.docs.filter((d) => {
    if (!d || d.deletedAt) return false;
    const day =
      madridDay(d.date) ||
      madridDay(d.clockInAt) ||
      madridDay(d.createdAt) ||
      madridDay(d.entries?.[0]?.time);
    if (day !== today) return false;
    const ids = bizIdsOf(d);
    const userOk = byUser.has(d.userId || d.user_id) || byUser.has(d.workerId);
    const bizOk = ids.some(isPauBiz) || String(d.user_id || '').includes(BID);
    const site =
      String(d.workCenterName || d.siteName || d.locationName || d.pdvName || d.storeName || '');
    const siteId = String(d.workCenterId || d.salesPointId || d.pdvId || d.locationId || '');
    const badOk =
      BADALONA.test(site) ||
      badCenters.some((c) => String(c._id) === siteId || String(c.id) === siteId) ||
      badPdvs.some((p) => String(p._id) === siteId || String(p.id) === siteId);
    return (bizOk || userOk) && (badOk || bizOk);
  });

  console.log(`\n=== Clockins hoy Pau/Badalona (${todayClock.length}) db=${clockDb.db} ===`);
  const sorted = [...todayClock].sort((a, b) =>
    String(a.updatedAt || a.createdAt || '').localeCompare(String(b.updatedAt || b.createdAt || '')),
  );
  for (const c of sorted) {
    const uid = c.userId || c.user_id || c.workerId;
    const acc = byUser.get(uid);
    const entries = Array.isArray(c.entries) ? c.entries : [];
    const clockIn = entries.find((e) => e.type === 'clock_in' || e.type === 'in');
    const clockOut = [...entries].reverse().find((e) => e.type === 'clock_out' || e.type === 'out');
    console.log(
      JSON.stringify({
        _id: c._id,
        status: c.status,
        date: c.date,
        user: acc?.fullName || acc?.name || acc?.email || uid,
        email: acc?.email,
        site: c.workCenterName || c.siteName || c.pdvName || c.locationName || c.storeName,
        workCenterId: c.workCenterId,
        salesPointId: c.salesPointId || c.pdvId,
        clockIn: madridTime(clockIn?.time || c.clockInAt),
        clockOut: clockOut ? madridTime(clockOut.time) : null,
        lastEntry: entries.length ? entries[entries.length - 1]?.type : null,
        device: c.device || c.source || c.client || null,
        updatedAt: c.updatedAt,
      }),
    );
  }

  // Sessions / register open Badalona
  const reg = await tryAllDocs([
    `${prefix}-tpv-registers`,
    'tpv-registers',
    `${prefix}-register-sessions`,
    'register-sessions',
  ]);
  const openRegs = reg.docs.filter((d) => {
    if (!d || d.deletedAt) return false;
    const open = d.status === 'open' || d.open === true || (!d.closedAt && d.openedAt);
    if (!open) return false;
    const ids = bizIdsOf(d);
    const site = String(d.pdvName || d.storeName || d.workCenterName || d.name || '');
    const siteId = String(d.salesPointId || d.pdvId || d.workCenterId || '');
    const badOk =
      BADALONA.test(site) ||
      badPdvs.some((p) => String(p._id) === siteId || String(p.id) === siteId) ||
      badCenters.some((c) => String(c._id) === siteId || String(c.id) === siteId);
    return ids.some(isPauBiz) && (badOk || BADALONA.test(site));
  });
  console.log(`\n=== Cajas abiertas Badalona Pau (${openRegs.length}) db=${reg.db} ===`);
  for (const r of openRegs.slice(0, 15)) {
    console.log(
      JSON.stringify({
        _id: r._id,
        status: r.status,
        openedAt: r.openedAt,
        openedBy: r.openedBy || r.userId,
        salesPointId: r.salesPointId || r.pdvId,
        name: r.pdvName || r.storeName || r.name,
      }),
    );
  }

  // Active open clockins (no clock out)
  const stillIn = todayClock.filter((c) => {
    const st = String(c.status || '').toLowerCase();
    if (st === 'active' || st === 'open' || st === 'break') return true;
    const entries = Array.isArray(c.entries) ? c.entries : [];
    const last = entries[entries.length - 1];
    return last && (last.type === 'clock_in' || last.type === 'break_end' || last.type === 'in');
  });
  console.log(`\n=== Aún fichados (sin salida) hoy: ${stillIn.length} ===`);
  for (const c of stillIn) {
    const uid = c.userId || c.user_id || c.workerId;
    const acc = byUser.get(uid);
    console.log(`  • ${acc?.fullName || acc?.email || uid} @ ${c.workCenterName || c.pdvName || '?'}`);
  }

  console.log('\nDONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
