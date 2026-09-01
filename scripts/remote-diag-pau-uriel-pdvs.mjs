#!/usr/bin/env node
/**
 * Solo lectura prod: PDVs / centros con nombre «uriel» en scope Pau / paunipol.
 */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';

const remoteCmd = `
set -e
cd /opt/vertial/Vertial 2>/dev/null || true
if [ -f /opt/vertial/Vertial/.env ]; then set -a; . /opt/vertial/Vertial/.env; set +a; fi
COUCH="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf http://couchdb:5984/ >/dev/null 2>&1; then COUCH=http://couchdb:5984; fi
export COUCH
export COUCH_AUTH_USER="\${COUCHDB_USER:-\${COUCH_USER:-vertialadmin}}"
export COUCH_AUTH_PASS="\${COUCHDB_PASSWORD:-\${COUCH_PASSWORD:-}}"
export PAU='${PAU}'
node <<'NODE'
const couch = process.env.COUCH;
const AUTH = 'Basic ' + Buffer.from(process.env.COUCH_AUTH_USER + ':' + process.env.COUCH_AUTH_PASS).toString('base64');
const PAU = process.env.PAU;

async function all(db) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/_all_docs?include_docs=true&limit=200000', {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const j = await r.json();
  if (j.error) throw new Error(db + ': ' + (j.reason || j.error));
  return (j.rows || []).map((x) => x.doc).filter(Boolean);
}
function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function nameOf(d) {
  return String(d.name || d.nombre || d.title || '').trim();
}
function isPdvOrWc(d) {
  const t = String(d.type || '');
  return (
    t === 'point_of_sale' ||
    t === 'pdv' ||
    t === 'work_center' ||
    t === 'sales_point_center' ||
    Boolean(d.centerType) ||
    Boolean(d.terminalCode || d.tabletCode)
  );
}

const [accounts, businesses, sales, delivery] = await Promise.all([
  all('accounts'),
  all('businesses'),
  all('bbddsaas-sales-points'),
  all('bbddsaas-delivery'),
]);

const pauAcc = accounts.find(
  (a) => a && (a.user_id === PAU || a.userId === PAU || /pau\\.royo|pauroyo/i.test(String(a.email || ''))),
);
console.log('PAU_ACCOUNT', {
  email: pauAcc?.email,
  user_id: pauAcc?.user_id || pauAcc?.userId,
  linkedBusinessId: pauAcc?.linkedBusinessId,
});

const pauBiz = businesses.filter((b) => {
  if (!b || b.deletedAt) return false;
  const owner = String(b.owner_user_id || b.owner_id || b.user_id || '');
  const members = Array.isArray(b.members) ? b.members : [];
  const memberHit = members.some((m) => String(m?.user_id || m?.userId || '') === PAU);
  const name = String(b.name || '');
  return owner === PAU || memberHit || /paunipol|del amor|hoypecamos|modomio|disarmink|pau/i.test(name);
});
console.log(
  'PAU_BUSINESSES',
  pauBiz.map((b) => ({
    id: bid(b) || String(b._id || '').replace(/^business:/, ''),
    name: b.name,
    type: b.businessType,
    owner: b.owner_user_id || b.user_id,
  })),
);
const pauBizIds = new Set(
  pauBiz.map((b) => bid(b) || String(b._id || '').replace(/^business:/, '')).filter(Boolean),
);

const salesAlive = sales.filter((d) => d && !d.deletedAt);
const deliveryAlive = delivery.filter((d) => d && !d.deletedAt);
const pool = [...salesAlive, ...deliveryAlive];

const urielNamed = pool.filter((d) => isPdvOrWc(d) && /uriel/i.test(nameOf(d)));
console.log('URIEL_NAMED_TOTAL', urielNamed.length);

const byBiz = {};
for (const d of urielNamed) {
  const b = bid(d) || '(sin-biz)';
  byBiz[b] = (byBiz[b] || 0) + 1;
}
console.log('URIEL_BY_BUSINESS_ID', byBiz);

const urielOnPau = urielNamed.filter((d) => pauBizIds.has(bid(d)) || String(d.user_id || '') === PAU);
console.log('URIEL_ON_PAU_SCOPE', urielOnPau.length);
console.log(
  'URIEL_ON_PAU_LIST',
  urielOnPau.map((d) => ({
    id: d._id,
    name: nameOf(d),
    business_id: bid(d),
    user_id: d.user_id,
    type: d.type,
    centerType: d.centerType,
    eventsPdvKind: d.eventsPdvKind || null,
    active: d.active !== false,
  })),
);

const pauWc = salesAlive.filter(
  (d) =>
    (d.centerType === 'punto_de_venta' || d.type === 'work_center') &&
    (pauBizIds.has(bid(d)) || String(d.user_id || '') === PAU),
);
const pauPdv = pool.filter(
  (d) =>
    (d.type === 'point_of_sale' || d.type === 'pdv') &&
    (pauBizIds.has(bid(d)) || String(d.user_id || '') === PAU),
);
console.log('PAU_SCOPE_COUNTS', {
  workCenters: pauWc.length,
  pdvs: pauPdv.length,
  namesSample: pauWc.slice(0, 25).map((d) => nameOf(d)),
});

// user_id Pau pero business de otro / sin biz
const pauUserWrongBiz = pool.filter(
  (d) =>
    isPdvOrWc(d) &&
    String(d.user_id || '') === PAU &&
    bid(d) &&
    !pauBizIds.has(bid(d)),
);
console.log('PAU_USER_ID_OTHER_BIZ', pauUserWrongBiz.length, pauUserWrongBiz.slice(0, 15).map((d) => ({
  id: d._id,
  name: nameOf(d),
  business_id: bid(d),
})));
NODE
`;

console.log('[remote-diag-pau-uriel-pdvs] SSH →', `${user}@${host}`);
const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', '-o', 'ServerAliveInterval=5', ...idArgs, `${user}@${host}`, remoteCmd],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
