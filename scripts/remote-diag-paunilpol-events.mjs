#!/usr/bin/env node
/** Solo lectura: eventos «uriel» + PDVs huérfanos PAUNILPOL. */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const PAUNILPOL = '7ec4e689-f1d6-4149-86b2-bf582ebc2c0c';

const remoteCmd = `
set -e
set -a; . /opt/vertial/Vertial/.env; set +a
COUCH="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf http://couchdb:5984/ >/dev/null 2>&1; then COUCH=http://couchdb:5984; fi
export COUCH COUCH_AUTH_USER="\$COUCHDB_USER" COUCH_AUTH_PASS="\$COUCHDB_PASSWORD"
export PAU='${PAU}' PAUNILPOL='${PAUNILPOL}'
node <<'NODE'
const couch = process.env.COUCH;
const AUTH = 'Basic ' + Buffer.from(process.env.COUCH_AUTH_USER + ':' + process.env.COUCH_AUTH_PASS).toString('base64');
const PAU = process.env.PAU;
const PAUNILPOL = process.env.PAUNILPOL;
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
  return String(d.name || d.nombre || '').trim();
}

const dbs = await (await fetch(couch + '/_all_dbs', { headers: { Authorization: AUTH } })).json();
const eventDbs = dbs.filter((d) => /event/i.test(d));
console.log('EVENT_DBS', eventDbs);

let events = [];
for (const db of eventDbs.slice(0, 8)) {
  try {
    const docs = await all(db);
    const hits = docs.filter(
      (d) =>
        d &&
        !d.deletedAt &&
        (String(d.user_id) === PAU || bid(d) === PAUNILPOL || /uriel/i.test(nameOf(d))),
    );
    if (hits.length) {
      console.log('DB', db, 'hits', hits.length);
      events.push(...hits.map((d) => ({ db, id: d._id, type: d.type, name: nameOf(d), estado: d.estado, portablePdvId: d.portablePdvId, portableWorkCenterId: d.portableWorkCenterId, business: bid(d), user: d.user_id })));
    }
  } catch (e) {
    console.log('DB_FAIL', db, String(e.message || e));
  }
}
console.log('EVENTS_URIEL_OR_PAU', JSON.stringify(events.slice(0, 40), null, 2));

const sales = await all('bbddsaas-sales-points');
const delivery = await all('bbddsaas-delivery');
const pdvs = [...sales, ...delivery].filter(
  (d) => d && !d.deletedAt && (d.type === 'point_of_sale' || d.type === 'pdv') && (bid(d) === PAUNILPOL || String(d.user_id) === PAU),
);
console.log('PAU_PDVS_DETAIL', JSON.stringify(pdvs.map((d) => ({
  id: d._id,
  name: nameOf(d),
  business_id: bid(d),
  user_id: d.user_id,
  wc: d.workCenterId,
  code: d.terminalCode || d.tabletCode,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
})), null, 2));
NODE
`;

const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
