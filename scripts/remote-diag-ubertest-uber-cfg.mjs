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
const id = 'webconfig-34fad5b6-728b-4f6d-b2b3-b280190f574b';
const bid = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const r = await fetch(couch + '/bbddsaas-web/' + encodeURIComponent(id), { headers: { Authorization: auth, Accept: 'application/json' } });
const c = await r.json();
const u = c.integrations?.uber || {};
console.log(JSON.stringify({
  _id: c._id,
  business_id: c.business_id,
  uber: {
    enabled: u.enabled,
    oauth: u.oauth,
    storeId: u.storeId || null,
    storeName: u.storeName || null,
    provisionedAt: u.provisionedAt || null,
    menuPushedAt: u.menuPushedAt || null,
    menuItemCount: u.menuItemCount || 0,
    hasAccessToken: Boolean(u.accessToken),
    accessTokenLen: String(u.accessToken || '').length,
    hasRefreshToken: Boolean(u.refreshToken),
    env: u.env || null,
    lastStoreStatus: u.lastStoreStatus || null,
  }
}, null, 2));
const cat = await fetch(couch + '/bbddsaas-catalog/_find', {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    selector: { business_id: bid, type: 'product' },
    limit: 20,
    fields: ['_id', 'name', 'sku', 'active', 'unitPrice'],
  }),
});
const cj = await cat.json();
console.log('PRODUCTS', JSON.stringify(cj.docs || [], null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
