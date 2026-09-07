#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const bash = `set -a; . ${v.REPO_PATH_ON_VPS}/.env; set +a
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const UID = '05ea1c8c-3cfd-4057-8629-1e44f703051f';
async function get(db, id) {
  const r = await fetch(couch + '/' + db + '/' + encodeURIComponent(id), { headers: { Authorization: auth } });
  return { status: r.status, doc: await r.json() };
}
async function find(db, selector) {
  const r = await fetch(couch + '/' + db + '/_find', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector, limit: 50 }),
  });
  return (await r.json()).docs || [];
}
const pdv = await get('bbddsaas-delivery', 'pdv-uber-test-34fad5b6');
const wc = await get('bbddsaas-sales-points', 'wc-uber-test-34fad5b6');
const wcs = await find('bbddsaas-sales-points', { type: 'sales_point', user_id: UID });
const pdvs = await find('bbddsaas-delivery', { type: 'point_of_sale', user_id: UID });
const web = await get('bbddsaas-web', 'webconfig-' + BID);
const u = web.doc.integrations?.uber || {};
// Fix display name to Vertial PDV name (no merchant label)
if (u.storeId && u.salesPointId === 'pdv-uber-test-34fad5b6') {
  u.storeName = 'Uber Test PDV';
  u.updatedAt = new Date().toISOString();
  web.doc.integrations = { ...web.doc.integrations, uber: u };
  web.doc.updatedAt = u.updatedAt;
  const put = await fetch(couch + '/bbddsaas-web/' + encodeURIComponent(web.doc._id), {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(web.doc),
  });
  const pj = await put.json();
  console.log(JSON.stringify({
    renamed: put.ok,
    rev: pj.rev,
    pdv: { id: pdv.doc._id, name: pdv.doc.name, workCenterId: pdv.doc.workCenterId, business_id: pdv.doc.business_id },
    wc: { id: wc.doc._id, name: wc.doc.name, business_id: wc.doc.business_id },
    salesPointsForUser: wcs.filter(d=>!d.deletedAt).map(d=>({id:d._id,name:d.name,business_id:d.business_id})),
    pdvsForUser: pdvs.filter(d=>!d.deletedAt).map(d=>({id:d._id,name:d.name,workCenterId:d.workCenterId,business_id:d.business_id})),
    uber: { storeId: u.storeId, storeName: u.storeName, salesPointId: u.salesPointId },
  }, null, 2));
} else {
  console.log(JSON.stringify({ skip: true, uber: { storeId: u.storeId, salesPointId: u.salesPointId } }, null, 2));
}
NODE`;
const r = sshRunScript(v.DEPLOY_USER || v.SSH_USER, v.DEPLOY_HOST || v.VPS_IP, v.SSH_IDENTITY_FILE?.trim(), bash);
process.exit(r.status ?? 1);
