#!/usr/bin/env node
/** Prueba real OOS + reposición únicamente en Uber sandbox / ubertest. */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
if (String(process.env.UBER_EATS_ENV || '').toLowerCase() !== 'sandbox') {
  throw new Error('ABORT: UBER_EATS_ENV no es sandbox');
}
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const STORE_ID = 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f';
const ITEM_ID = 'UBER-BURGER';

const body = new URLSearchParams({
  client_id: process.env.UBER_EATS_CLIENT_ID,
  client_secret: process.env.UBER_EATS_CLIENT_SECRET,
  grant_type: 'client_credentials',
  scope: 'eats.order eats.store eats.store.status.write eats.store.orders.read eats.store.orders.cancel eats.store.orders.restaurantdelivery.status eats.report',
});
const tokenRes = await fetch('https://sandbox-login.uber.com/oauth/v2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body,
});
const tokenJson = await tokenRes.json();
if (!tokenRes.ok || !tokenJson.access_token) throw new Error('No app token');

async function update(suspended) {
  const patch = {
    suspension_info: suspended
      ? { suspension: { suspend_until: -1, reason: 'OUT_OF_STOCK' } }
      : { suspension: null },
  };
  const r = await fetch(
    'https://test-api.uber.com/v2/eats/stores/' + STORE_ID + '/menus/items/' + ITEM_ID,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tokenJson.access_token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(patch),
    },
  );
  return { status: r.status, ok: r.ok, body: (await r.text()).slice(0, 300) };
}

const suspend = await update(true);
const restore = await update(false);
if (!suspend.ok || !restore.ok) {
  throw new Error('OOS test failed: ' + JSON.stringify({ suspend, restore }));
}

const wcRes = await fetch(couch + '/bbddsaas-web/webconfig-' + BID, {
  headers: { Authorization: auth, Accept: 'application/json' },
});
const wc = await wcRes.json();
const uber = { ...(wc.integrations?.uber || {}) };
if (String(uber.storeId || '') !== STORE_ID) throw new Error('ABORT: store ubertest no coincide');
const now = new Date().toISOString();
uber.lastMenuItemUpdatedAt = now;
uber.lastMenuItemSuspendedAt = now;
uber.updatedAt = now;
wc.integrations = { ...(wc.integrations || {}), uber };
wc.updatedAt = now;
const put = await fetch(couch + '/bbddsaas-web/' + encodeURIComponent(wc._id), {
  method: 'PUT',
  headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(wc),
});
const saved = await put.json();
if (!put.ok) throw new Error('Save evidence failed ' + JSON.stringify(saved));
console.log(JSON.stringify({ ok: true, itemId: ITEM_ID, suspend, restore, evidenceAt: now, rev: saved.rev }, null, 2));
NODE`;

const result = sshRunScript(user, host, identity, bash);
process.exit(result.status ?? (result.error ? 1 : 0));
