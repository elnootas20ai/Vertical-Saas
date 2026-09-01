#!/usr/bin/env node
/** Solo lectura: todos los PDV/WC de PAUNILPOL SL. */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();
const idArgs = identity ? ['-i', identity] : [];
const BIZ = '7ec4e689-f1d6-4149-86b2-bf582ebc2c0c';

const remoteCmd = `
set -e
ENVF=""
for f in /opt/vertial/Vertial/.env /root/Vertial/.env /opt/vertial/.env; do
  if [ -f "\$f" ]; then ENVF="\$f"; break; fi
done
if [ -n "\$ENVF" ]; then set -a; . "\$ENVF"; set +a; fi
COUCH="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf http://couchdb:5984/ >/dev/null 2>&1; then COUCH=http://couchdb:5984; fi
export COUCH
export COUCH_AUTH_USER="\${COUCHDB_USER:-\${COUCH_USER:-vertialadmin}}"
export COUCH_AUTH_PASS="\${COUCHDB_PASSWORD:-\${COUCH_PASSWORD:-}}"
export BIZ='${BIZ}'
echo "ENVF=\$ENVF COUCH=\$COUCH USER=\$COUCH_AUTH_USER"
node <<'NODE'
const couch = process.env.COUCH;
const AUTH = 'Basic ' + Buffer.from(process.env.COUCH_AUTH_USER + ':' + process.env.COUCH_AUTH_PASS).toString('base64');
const BIZ = process.env.BIZ;
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
const [sales, delivery] = await Promise.all([all('bbddsaas-sales-points'), all('bbddsaas-delivery')]);
const pool = [...sales, ...delivery].filter((d) => d && !d.deletedAt && bid(d) === BIZ);
const wcs = pool.filter((d) => d.centerType === 'punto_de_venta' || d.type === 'work_center');
const pdvs = pool.filter((d) => d.type === 'point_of_sale' || d.type === 'pdv');
const nameCounts = {};
for (const d of [...wcs, ...pdvs]) {
  const n = nameOf(d) || '(sin nombre)';
  nameCounts[n] = (nameCounts[n] || 0) + 1;
}
console.log(JSON.stringify({
  wc: wcs.length,
  pdv: pdvs.length,
  nameCounts,
  wcs: wcs.map((d) => ({
    id: d._id,
    name: nameOf(d),
    kind: d.eventsPdvKind || null,
    linked: d.linkedEventId || null,
    active: d.active !== false,
  })),
  pdvs: pdvs.map((d) => ({
    id: d._id,
    name: nameOf(d),
    wc: d.workCenterId || null,
    code: d.terminalCode || d.tabletCode || null,
    active: d.active !== false,
  })),
}, null, 2));
NODE
`;

const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
