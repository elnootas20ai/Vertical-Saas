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
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const STORE_ID = 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f';
const wc = await (await fetch(couch + '/bbddsaas-web/webconfig-' + BID, { headers: { Authorization: auth } })).json();
const uber = wc.integrations?.uber || {};
const env = String(process.env.UBER_EATS_ENV || 'sandbox').toLowerCase();
const base = (env === 'production' || env === 'prod') ? 'https://api.uber.com' : 'https://test-api.uber.com';
const tokenUrl = (env === 'production' || env === 'prod') ? 'https://login.uber.com/oauth/v2/token' : 'https://sandbox-login.uber.com/oauth/v2/token';

async function appToken() {
  const body = new URLSearchParams({
    client_id: process.env.UBER_EATS_CLIENT_ID,
    client_secret: process.env.UBER_EATS_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'eats.order eats.store eats.store.status.write eats.store.orders.read eats.store.orders.cancel eats.store.orders.restaurantdelivery.status eats.report',
  });
  const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  return (await r.json()).access_token;
}
async function call(token, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, body: t.slice(0, 500) };
}
const app = await appToken();
const userTok = String(uber.accessToken || '');
const out = {
  saved: {
    storeId: uber.storeId,
    storeName: uber.storeName,
    menuPushedAt: uber.menuPushedAt,
    menuItemCount: uber.menuItemCount,
    provisionedAt: uber.provisionedAt || null,
  },
};
out.patchUser = await call(userTok, 'PATCH', '/v1/eats/stores/' + STORE_ID + '/pos_data', {
  integration_enabled: true,
  is_order_manager: true,
  integrator_store_id: BID,
});
out.statusEatsPaused = await call(app, 'POST', '/v1/eats/store/' + STORE_ID + '/status', { status: 'PAUSED', reason: 'cert test' });
out.getPos = await call(app, 'GET', '/v1/eats/stores/' + STORE_ID + '/pos_data');
out.getStatus = await call(app, 'GET', '/v1/eats/store/' + STORE_ID + '/status');
console.log(JSON.stringify(out, null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
