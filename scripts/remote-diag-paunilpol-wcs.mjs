#!/usr/bin/env node
/** Solo lectura: work centers de los PDV «boda uriel» + todos Evento· en Pau. */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];
const WC_IDS = [
  'wc-9722309a-d814-43c1-8857-f744b336b721',
  'wc-41a3c035-66d5-423b-a020-1c4c4741a9d8',
  'wc-7cd6d26f-c976-423f-8dc1-b4a0a48d7235',
];
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const PAUNILPOL = '7ec4e689-f1d6-4149-86b2-bf582ebc2c0c';

const remoteCmd = `
set -e
ENVF=/opt/vertial/Vertial/.env
set -a; . "\$ENVF"; set +a
COUCH="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf http://couchdb:5984/ >/dev/null 2>&1; then COUCH=http://couchdb:5984; fi
export COUCH
export COUCH_AUTH_USER="\$COUCHDB_USER"
export COUCH_AUTH_PASS="\$COUCHDB_PASSWORD"
export PAU='${PAU}'
export PAUNILPOL='${PAUNILPOL}'
export WC_IDS='${WC_IDS.join(',')}'
node <<'NODE'
const couch = process.env.COUCH;
const AUTH = 'Basic ' + Buffer.from(process.env.COUCH_AUTH_USER + ':' + process.env.COUCH_AUTH_PASS).toString('base64');
const PAU = process.env.PAU;
const PAUNILPOL = process.env.PAUNILPOL;
const WC_IDS = process.env.WC_IDS.split(',');

async function get(db, id) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(id), {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const j = await r.json();
  if (j.error) return { _id: id, error: j.error, reason: j.reason };
  return j;
}
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
  return String(d.name || '').trim();
}

const wcDocs = [];
for (const id of WC_IDS) {
  wcDocs.push(await get('bbddsaas-sales-points', id));
}
console.log('LINKED_WCS', JSON.stringify(wcDocs.map((d) => ({
  id: d._id,
  error: d.error || null,
  name: nameOf(d),
  type: d.type,
  centerType: d.centerType,
  business_id: bid(d),
  user_id: d.user_id,
  eventsPdvKind: d.eventsPdvKind,
  linkedEventId: d.linkedEventId,
  deletedAt: d.deletedAt || null,
  active: d.active,
})), null, 2));

const sales = await all('bbddsaas-sales-points');
const eventoWcs = sales.filter(
  (d) =>
    d &&
    !d.deletedAt &&
    (d.centerType === 'punto_de_venta' || d.type === 'work_center') &&
    (/^Evento\\s*·/i.test(nameOf(d)) || /uriel/i.test(nameOf(d))),
);
console.log('EVENTO_WC_TOTAL', eventoWcs.length);
const byBiz = {};
for (const d of eventoWcs) {
  const b = bid(d) || '(sin-biz)';
  byBiz[b] = byBiz[b] || [];
  byBiz[b].push(nameOf(d));
}
console.log('EVENTO_WC_BY_BIZ', Object.fromEntries(Object.entries(byBiz).map(([k, v]) => [k, { n: v.length, names: [...new Set(v)].slice(0, 10) }])));

const pauEvento = eventoWcs.filter((d) => bid(d) === PAUNILPOL || String(d.user_id) === PAU || !bid(d));
console.log('PAU_OR_ORPHAN_EVENTO_WC', pauEvento.length);
console.log(JSON.stringify(pauEvento.map((d) => ({
  id: d._id,
  name: nameOf(d),
  business_id: bid(d) || null,
  user_id: d.user_id,
  kind: d.eventsPdvKind || null,
  linked: d.linkedEventId || null,
})), null, 2));

// PDVs with user Pau named Evento
const delivery = await all('bbddsaas-delivery');
const eventPdvs = [...sales, ...delivery].filter(
  (d) =>
    d &&
    !d.deletedAt &&
    (d.type === 'point_of_sale' || d.type === 'pdv') &&
    (/^Evento\\s*·/i.test(nameOf(d)) || /uriel/i.test(nameOf(d))),
);
console.log('EVENTO_PDV_TOTAL', eventPdvs.length);
console.log('EVENTO_PDV_BY_BIZ', eventPdvs.reduce((acc, d) => {
  const b = bid(d) || '(sin-biz)';
  acc[b] = (acc[b] || 0) + 1;
  return acc;
}, {}));
NODE
`;

const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
