#!/usr/bin/env node
/**
 * SOLO LECTURA — Uber Tiana jueves 2026-08-06 (cierre + pedidos).
 */
import { createRequire } from 'node:module';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DAY = '2026-08-06';
const SESSION_ID = 'tpvreg-77af2a2f-212e-432c-9e1c-fbc3c911ad9a';
const DB = 'bbddsaas-delivery';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function madridDayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function sessionWorkDayKey(session) {
  const raw =
    session?.workDayKey ||
    session?.businessDayKey ||
    session?.openedAt ||
    session?.createdAt ||
    '';
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return String(raw).slice(0, 10);
  return madridDayKey(dt);
}

function foldDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return madridDayKey(d);
}

function normCh(ch) {
  const c = String(ch || '').toLowerCase().trim();
  if (c === 'uber' || c === 'uber_eats' || c === 'uber-eats') return 'ubereats';
  return c;
}

async function getDoc(id) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(DB)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) throw new Error(`get ${id}: ${res.status}`);
  return res.json();
}

async function allDocs() {
  const res = await fetch(`${COUCH}/${encodeURIComponent(DB)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) throw new Error(`all_docs: ${res.status}`);
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  console.log(JSON.stringify({ mode: 'READ_ONLY', day: DAY, focus: 'Tiana Uber' }, null, 2));

  const session = await getDoc(SESSION_ID);
  const totals = session.aggregatorClosingTotals || {};
  const brands = session.aggregatorClosingBrandTotals || {};
  const unpaid = session.aggregatorUnpaidTotals || session.appsUnpaidTotals || null;
  const food = session.productClosingCounts || {};
  const labels = session.closingBrandLabels || {};

  console.log('\n=== SESION TIANA', SESSION_ID, '===');
  console.log({
    pdv: session.pointOfSaleName,
    pdvId: session.pointOfSaleId,
    status: session.status,
    workDay: sessionWorkDayKey(session),
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    workerName: session.workerName,
  });
  console.log('aggregatorClosingTotals:', totals);
  console.log('Uber €:', r2(totals.ubereats));
  console.log('Uber por marca:', brands.ubereats || {});
  for (const [id, amt] of Object.entries(brands.ubereats || {})) {
    console.log('  brand', id, labels[id] || '(sin label)', '→', r2(amt), '€');
  }
  console.log('food byChannel Uber:', food.byChannel?.ubereats || null);
  console.log('food top-level:', {
    pizza: food.pizza,
    burger: food.burger,
    taco: food.taco,
  });
  if (unpaid) console.log('unpaid/apps extras:', unpaid);

  const keys = Object.keys(session).filter((k) => /uber|aggregat|app|glovo|just/i.test(k));
  console.log('keys relacionadas:', keys);

  const docs = await allDocs();
  const tianaOrders = docs.filter((d) => {
    if (!d || (d.type !== 'delivery_order' && d.type !== 'order')) return false;
    if (bid(d) !== DIS) return false;
    const pdv = String(d.salesPointId || d.pointOfSaleId || '');
    const name = String(d.salesPointName || d.pointOfSaleName || '').toLowerCase();
    const isTiana =
      pdv === String(session.pointOfSaleId || '') ||
      name.includes('tiana') ||
      name.includes('modomio');
    if (!isTiana) return false;
    const day = foldDay(d.deliveredAt) || foldDay(d.createdAt) || '';
    return day === DAY;
  });

  const uberOrders = tianaOrders.filter((o) => normCh(o.channel) === 'ubereats');
  const allCh = {};
  for (const o of tianaOrders) {
    const ch = normCh(o.channel) || 'tpv';
    allCh[ch] = (allCh[ch] || 0) + 1;
  }

  console.log('\n=== PEDIDOS TIANA ese día ===');
  console.log({ total: tianaOrders.length, byChannel: allCh, uberCount: uberOrders.length });
  console.log(
    'Uber pedidos:',
    uberOrders.map((o) => ({
      n: o.orderNumber,
      status: o.status,
      total: o.totalAmount,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      paymentStatus: o.paymentStatus,
    })),
  );

  const badSessions = docs.filter(
    (d) =>
      d?.type === 'tpv_register_session' &&
      bid(d) === DIS &&
      sessionWorkDayKey(d) === DAY &&
      String(d.pointOfSaleName || '').toLowerCase().includes('badalona'),
  );
  for (const s of badSessions) {
    console.log('\n=== BADALONA mismo día (contraste) ===');
    console.log({
      id: s._id,
      pdv: s.pointOfSaleName,
      uber: r2(s.aggregatorClosingTotals?.ubereats),
      totals: s.aggregatorClosingTotals,
      foodUber: s.productClosingCounts?.byChannel?.ubereats,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
