#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const UID = '05ea1c8c-3cfd-4057-8629-1e44f703051f';
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
async function all(db) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/_all_docs?include_docs=true&limit=200000', {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  const j = await r.json();
  return (j.rows || []).map(x => x.doc).filter(Boolean);
}
async function get(db, id) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(id), {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
}
const sales = await all('bbddsaas-sales-points');
const delivery = await all('bbddsaas-delivery');
const brandsDb = (await (await fetch(couch + '/_all_dbs', { headers: { Authorization: auth } })).json())
  .find(d => /brand/i.test(d)) || 'bbddsaas-brands';
let brands = [];
try { brands = await all(brandsDb); } catch { brands = []; }

const byUserSales = sales.filter(d => !d.deletedAt && String(d.user_id) === UID);
const byBizSales = sales.filter(d => !d.deletedAt && (String(d.business_id||d.businessId) === BID));
const byUserPdv = delivery.filter(d => !d.deletedAt && d.type === 'point_of_sale' && String(d.user_id) === UID);
const byBizPdv = delivery.filter(d => !d.deletedAt && d.type === 'point_of_sale' && String(d.business_id||d.businessId) === BID);
const nameHit = [...sales, ...delivery, ...brands].filter(d => !d.deletedAt && /modomio|tiana/i.test(JSON.stringify({
  name: d.name, storeName: d.storeName, label: d.label, title: d.title
})));

console.log('SALES_BY_USER', byUserSales.map(d => ({ id: d._id, name: d.name, biz: d.business_id||d.businessId })));
console.log('SALES_BY_BIZ', byBizSales.map(d => ({ id: d._id, name: d.name, user: d.user_id })));
console.log('PDV_BY_USER', byUserPdv.map(d => ({ id: d._id, name: d.name, biz: d.business_id||d.businessId })));
console.log('PDV_BY_BIZ', byBizPdv.map(d => ({ id: d._id, name: d.name, user: d.user_id })));
console.log('NAME_HITS_COUNT', nameHit.length);
console.log('NAME_HITS_SAMPLE', nameHit.slice(0, 15).map(d => ({
  db: d.type, id: d._id, name: d.name, user: d.user_id, biz: d.business_id||d.businessId
})));

const wc = await get('bbddsaas-web', 'webconfig-' + BID);
const uber = wc?.integrations?.uber || null;
console.log('UBER_INTEGRATION', uber ? {
  oauth: Boolean(uber.oauth),
  enabled: Boolean(uber.enabled),
  storeId: uber.storeId || null,
  storeName: uber.storeName || null,
  hasAccessToken: Boolean(uber.accessToken),
  connectedAt: uber.connectedAt || null,
  env: uber.env || null,
  scope: uber.scope || null,
} : null);

// Brands for owner
const brandsForUser = brands.filter(d => !d.deletedAt && (String(d.user_id) === UID || String(d.business_id||d.businessId) === BID));
console.log('BRANDS_UBERTEST', brandsForUser.map(d => ({ id: d._id, name: d.name, user: d.user_id, biz: d.business_id||d.businessId })));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
