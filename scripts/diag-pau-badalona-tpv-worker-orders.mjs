#!/usr/bin/env node
/**
 * Solo lectura: Badalona Pau — clockin Pol, cajas, pedidos completados hoy, tablet codes.
 */
import '../config/env.js';

const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const POL = 'ad18303c-393a-468e-8c01-0cb8d0af5f9e';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BAD = /badalona/i;

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

function todayMadrid() {
  return madridDay(new Date().toISOString());
}

async function allDocs(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=250000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function tryDb(names) {
  for (const db of names) {
    try {
      return { db, docs: await allDocs(db) };
    } catch {
      /* */
    }
  }
  return { db: null, docs: [] };
}

function bidOf(d) {
  return String(d.businessId || d.business_id || d.user_id || '')
    .replace(/^business:/, '')
    .trim();
}

function isPau(d) {
  const b = bidOf(d);
  return b === BID || b === PAU || String(d.user_id || '') === PAU;
}

async function main() {
  const today = todayMadrid();
  console.log({ BASE, today, BID });

  // 1) Full clockin Pol
  const clock = await tryDb([`${prefix}-clockins`, 'clockins']);
  const polClock = clock.docs.filter(
    (d) =>
      String(d.userId || d.user_id || d.workerId || '') === POL &&
      (madridDay(d.date) === today || madridDay(d.createdAt) === today),
  );
  console.log(`\n=== Clockins Pol hoy (${polClock.length}) db=${clock.db} ===`);
  for (const c of polClock) {
    console.log(JSON.stringify(c, null, 2));
  }

  // 2) All Pau clockins today
  const pauClock = clock.docs.filter(
    (d) =>
      isPau(d) &&
      (madridDay(d.date) === today ||
        madridDay(d.createdAt) === today ||
        madridDay(d.entries?.[0]?.time) === today),
  );
  console.log(`\n=== Todos clockins Pau hoy (${pauClock.length}) ===`);
  for (const c of pauClock) {
    console.log(
      JSON.stringify({
        _id: c._id,
        status: c.status,
        userId: c.userId || c.user_id,
        workerName: c.workerName || c.fullName,
        workCenterId: c.workCenterId,
        salesPointId: c.salesPointId || c.pdvId,
        siteName: c.workCenterName || c.pdvName || c.siteName,
        store_team_clockin: c.store_team_clockin || c.meta?.store_team_clockin,
        entries: (c.entries || []).map((e) => ({ type: e.type, time: e.time })),
      }),
    );
  }

  // 3) Register sessions Pau
  const regs = await tryDb([
    `${prefix}-tpv-register-sessions`,
    'tpv-register-sessions',
    `${prefix}-register-sessions`,
    'register-sessions',
    `${prefix}-tpv_registers`,
    'tpv_registers',
  ]);
  // Also search all dbs for type
  const dbsRes = await fetch(`${BASE}/_all_dbs`, { headers: { Authorization: AUTH } });
  const allDbs = await dbsRes.json();
  const regLike = (allDbs || []).filter((n) => /register|tpv|caja|session/i.test(n));
  console.log('\n=== DBs register-like ===', regLike);

  let regDocs = regs.docs;
  let regDb = regs.db;
  if (!regDocs.length) {
    for (const db of regLike) {
      try {
        const docs = await allDocs(db);
        const hits = docs.filter(
          (d) =>
            isPau(d) &&
            (d.type === 'tpv_register_session' ||
              d.type === 'register_session' ||
              d.docType === 'tpv_register_session' ||
              d.pointOfSaleId ||
              d.openedAt),
        );
        if (hits.length) {
          regDocs = hits;
          regDb = db;
          break;
        }
      } catch {
        /* */
      }
    }
  }

  const regToday = regDocs.filter(
    (d) =>
      isPau(d) &&
      (madridDay(d.openedAt) === today ||
        madridDay(d.createdAt) === today ||
        madridDay(d.closedAt) === today ||
        d.status === 'open'),
  );
  console.log(`\n=== Register sessions Pau hoy/open (${regToday.length}) db=${regDb} ===`);
  for (const r of regToday.slice(0, 30)) {
    console.log(
      JSON.stringify({
        _id: r._id,
        type: r.type,
        status: r.status,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
        pointOfSaleId: r.pointOfSaleId || r.salesPointId || r.pdvId,
        openedBy: r.openedBy || r.userId,
        workerName: r.workerName,
        businessId: bidOf(r),
      }),
    );
  }

  // 4) Sales points Badalona full
  const sp = await tryDb([`${prefix}-sales-points`, 'sales-points']);
  const bad = sp.docs.filter((d) => isPau(d) && BAD.test(String(d.name || '')));
  console.log(`\n=== PDV Badalona Pau full (${bad.length}) ===`);
  for (const p of bad) {
    console.log(
      JSON.stringify(
        {
          _id: p._id,
          id: p.id,
          name: p.name,
          active: p.active,
          tabletCode: p.tabletCode || p.tablet_code || p.codigoTablet || p.tpvTabletCode,
          keys: Object.keys(p).filter((k) => /tablet|codigo|code|pdv|sales/i.test(k)),
          businessId: bidOf(p),
          workCenterId: p.workCenterId,
        },
        null,
        2,
      ),
    );
  }

  // 5) Delivery orders today Badalona / Pau
  const ord = await tryDb([
    `${prefix}-delivery-orders`,
    'delivery-orders',
    `${prefix}-orders`,
    'orders',
  ]);
  const badIds = new Set(bad.map((p) => p._id).concat(bad.map((p) => p.id)).filter(Boolean));
  const ordersToday = ord.docs.filter((d) => {
    if (!d || d.deletedAt) return false;
    const day =
      madridDay(d.completedAt) ||
      madridDay(d.updatedAt) ||
      madridDay(d.createdAt) ||
      madridDay(d.orderedAt);
    if (day !== today) return false;
    if (!isPau(d) && String(d.user_id || '') !== PAU && bidOf(d) !== BID) {
      // also match by sales point
      const spid = String(d.salesPointId || d.pointOfSaleId || d.pdvId || '');
      if (!badIds.has(spid)) return false;
    }
    const spid = String(d.salesPointId || d.pointOfSaleId || d.pdvId || '');
    const name = String(d.storeName || d.pdvName || d.salesPointName || '');
    return badIds.has(spid) || BAD.test(name) || isPau(d);
  });

  const byStatus = {};
  for (const o of ordersToday) {
    const st = String(o.status || o.orderStatus || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  console.log(`\n=== Pedidos hoy Pau/Badalona (${ordersToday.length}) db=${ord.db} ===`);
  console.log('byStatus', byStatus);

  const completed = ordersToday.filter((o) =>
    /complet|delivered|done|cerrad|paid|cobrad/i.test(String(o.status || '')),
  );
  console.log(`Completados-ish: ${completed.length}`);
  for (const o of completed.slice(-15)) {
    console.log(
      JSON.stringify({
        _id: o._id,
        status: o.status,
        salesPointId: o.salesPointId || o.pointOfSaleId,
        total: o.total ?? o.grandTotal ?? o.amount,
        completedAt: o.completedAt || o.updatedAt,
        channel: o.channel || o.source || o.platform,
        orderNumber: o.orderNumber || o.ticketNumber || o.code,
      }),
    );
  }

  // Recent any Pau orders (last 20 updated)
  const pauOrders = ord.docs
    .filter((d) => isPau(d) || badIds.has(String(d.salesPointId || '')))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 20);
  console.log(`\n=== Últimos 20 pedidos Pau (cualquier día) ===`);
  for (const o of pauOrders) {
    console.log(
      JSON.stringify({
        _id: o._id,
        status: o.status,
        salesPointId: o.salesPointId || o.pointOfSaleId,
        updatedAt: o.updatedAt,
        createdAt: o.createdAt,
        total: o.total ?? o.grandTotal,
      }),
    );
  }

  console.log('\nDONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
