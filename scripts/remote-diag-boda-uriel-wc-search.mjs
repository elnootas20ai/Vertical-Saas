#!/usr/bin/env node
/** Solo lectura: buscar WCs huérfanos / borrados de boda uriel. */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];

const remoteCmd = `
set -a; . /opt/vertial/Vertial/.env; set +a
COUCH="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf http://couchdb:5984/ >/dev/null 2>&1; then COUCH=http://couchdb:5984; fi
export COUCH COUCH_AUTH_USER="\$COUCHDB_USER" COUCH_AUTH_PASS="\$COUCHDB_PASSWORD"
node <<'NODE'
const couch = process.env.COUCH;
const AUTH = 'Basic ' + Buffer.from(process.env.COUCH_AUTH_USER + ':' + process.env.COUCH_AUTH_PASS).toString('base64');
const ids = [
  'wc-9722309a-d814-43c1-8857-f744b336b721',
  'wc-41a3c035-66d5-423b-a020-1c4c4741a9d8',
  'wc-7cd6d26f-c976-423f-8dc1-b4a0a48d7235',
];
async function all(db) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/_all_docs?include_docs=true&limit=200000', {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return (await r.json()).rows.map((x) => x.doc).filter(Boolean);
}
const dbs = await (await fetch(couch + '/_all_dbs', { headers: { Authorization: AUTH } })).json();
const candidates = dbs.filter((d) => /sales|work|delivery|center/i.test(d));
console.log('CANDIDATE_DBS', candidates);
for (const db of candidates) {
  const docs = await all(db);
  const hits = docs.filter((d) => d && (ids.includes(d._id) || /boda uriel|Evento · boda/i.test(String(d.name || ''))));
  if (hits.length) {
    console.log('HITS', db, hits.length);
    console.log(JSON.stringify(hits.map((d) => ({
      id: d._id,
      name: d.name,
      type: d.type,
      centerType: d.centerType,
      deletedAt: d.deletedAt || null,
      business_id: d.business_id || d.businessId || null,
      user_id: d.user_id,
      eventsPdvKind: d.eventsPdvKind,
    })), null, 2));
  }
}
// Count all PDVs for Pau user
const sales = await all('bbddsaas-sales-points');
const delivery = await all('bbddsaas-delivery');
const pauPdvs = [...sales, ...delivery].filter((d) => d && !d.deletedAt && (d.type === 'point_of_sale' || d.type === 'pdv') && String(d.user_id) === '13e49ef6-183a-4afa-a17b-7730917fe685');
console.log('ALL_PAU_USER_PDVS', pauPdvs.length);
console.log(pauPdvs.map((d) => d.name).join(' | '));
NODE
`;

spawnSync('ssh', ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd], { stdio: 'inherit' });
