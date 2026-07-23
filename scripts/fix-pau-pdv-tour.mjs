#!/usr/bin/env node
/**
 * Repara tour Pau: enlaza tiendas/PDV a hoypecamos (DISARMINK) y completa paso locations.
 * Uso VPS:
 *   node scripts/fix-pau-pdv-tour.mjs
 *   node scripts/fix-pau-pdv-tour.mjs --apply
 */
import '../config/env.js';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' + Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const APPLY = process.argv.includes('--apply');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU_PDV_IDS = [
  'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6', // BADALONA
  'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7', // MODOMIO TIANA
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const now = new Date().toISOString();
const [sales, delivery, accounts] = await Promise.all([
  allDocs('bbddsaas-sales-points'),
  allDocs('bbddsaas-delivery'),
  allDocs('accounts'),
]);

const pauPdvs = delivery.filter((d) => PAU_PDV_IDS.includes(d._id));
const wcIds = [...new Set(pauPdvs.map((p) => String(p.workCenterId || '').trim()).filter(Boolean))];
const pauWcs = sales.filter((d) => wcIds.includes(d._id) || (String(d.user_id) === PAU && !d.deletedAt));

console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
console.log(
  'PDVs Pau',
  pauPdvs.map((p) => ({
    id: p._id,
    name: p.name,
    business_id: bid(p) || null,
    workCenterId: p.workCenterId,
    active: p.active,
  })),
);
console.log(
  'WCs encontrados',
  pauWcs.map((w) => ({
    id: w._id,
    name: w.name,
    type: w.type,
    centerType: w.centerType,
    business_id: bid(w) || null,
    user_id: w.user_id,
    active: w.active,
  })),
);

// Si faltan WCs en sales-points, crear desde PDV (mismo id workCenterId).
const missingWcIds = wcIds.filter((id) => !sales.some((d) => d._id === id));
console.log('WCs faltantes en sales-points', missingWcIds);

const patches = [];

for (const pdv of pauPdvs) {
  const next = {
    ...pdv,
    business_id: DISARMINK,
    businessId: DISARMINK,
    user_id: PAU,
    active: pdv.active !== false,
    updatedAt: now,
  };
  const changed =
    bid(pdv) !== DISARMINK ||
    String(pdv.businessId || '').replace(/^business:/, '') !== DISARMINK ||
    String(pdv.user_id) !== PAU;
  if (changed) {
    patches.push({ db: 'bbddsaas-delivery', doc: next, reason: 'pdv→DISARMINK' });
  }
}

for (const wc of pauWcs) {
  const next = {
    ...wc,
    business_id: DISARMINK,
    businessId: DISARMINK,
    user_id: PAU,
    active: wc.active !== false,
    centerType: wc.centerType || 'punto_de_venta',
    type: wc.type || 'sales_point',
    updatedAt: now,
  };
  const changed =
    bid(wc) !== DISARMINK ||
    String(wc.user_id) !== PAU ||
    !wc.centerType;
  if (changed) {
    patches.push({ db: 'bbddsaas-sales-points', doc: next, reason: 'wc→DISARMINK' });
  }
}

for (const wcId of missingWcIds) {
  const pdv = pauPdvs.find((p) => String(p.workCenterId) === wcId);
  if (!pdv) continue;
  const created = {
    _id: wcId,
    type: 'sales_point',
    centerType: 'punto_de_venta',
    name: pdv.name || 'Tienda',
    active: true,
    user_id: PAU,
    business_id: DISARMINK,
    businessId: DISARMINK,
    createdAt: now,
    updatedAt: now,
  };
  patches.push({ db: 'bbddsaas-sales-points', doc: created, reason: 'crear WC desde PDV' });
}

// Completar paso locations del setup_progress
const setup = accounts.find((d) => d._id === `setup_progress:${PAU}`);
if (setup) {
  const steps = Array.isArray(setup.steps) ? setup.steps.map((s) => ({ ...s })) : [];
  let changed = false;
  for (const step of steps) {
    if (step.key === 'locations' && !step.completed) {
      step.completed = true;
      step.completedAt = now;
      step.skipped = false;
      step.metadata = { ...(step.metadata || {}), fixedBy: 'fix-pau-pdv-tour', at: now };
      changed = true;
    }
  }
  const allRequiredDone = steps.filter((s) => s.required).every((s) => s.completed || s.skipped);
  const nextSetup = {
    ...setup,
    steps,
    business_id: DISARMINK,
    updatedAt: now,
    overallCompleted: allRequiredDone ? true : Boolean(setup.overallCompleted),
    overallCompletedAt: allRequiredDone ? setup.overallCompletedAt || now : setup.overallCompletedAt || null,
  };
  if (changed || bid(setup) !== DISARMINK) {
    patches.push({ db: 'accounts', doc: nextSetup, reason: 'setup_progress locations done' });
  }
}

console.log(
  'PATCHES',
  patches.map((p) => ({ db: p.db, id: p.doc._id, reason: p.reason })),
);

if (!APPLY) {
  console.log('Dry-run OK. Ejecuta con --apply para guardar.');
  process.exit(0);
}

for (const p of patches) {
  const saved = await couch('PUT', `/${encodeURIComponent(p.db)}/${encodeURIComponent(p.doc._id)}`, p.doc);
  console.log('SAVED', p.db, p.doc._id, saved.rev || saved.ok);
}

console.log('Listo. Pau debe ver tienda+PDV en hoypecamos y el paso locations completado.');
