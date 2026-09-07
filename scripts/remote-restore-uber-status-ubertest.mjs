#!/usr/bin/env node
/**
 * 1) Restaura status ONLINE en Uber API (revertir pausa de cert).
 * 2) Actualiza solo ubertest webconfig lastStoreStatus.
 * NO toca webconfig de modomio.
 */
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
const STORE_ID = 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f';
const UBERTEST_BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';

const env = String(process.env.UBER_EATS_ENV || 'sandbox').toLowerCase();
const base = (env === 'production' || env === 'prod') ? 'https://api.uber.com' : 'https://test-api.uber.com';
const tokenUrl = (env === 'production' || env === 'prod')
  ? 'https://login.uber.com/oauth/v2/token'
  : 'https://sandbox-login.uber.com/oauth/v2/token';

async function appToken() {
  const body = new URLSearchParams({
    client_id: process.env.UBER_EATS_CLIENT_ID,
    client_secret: process.env.UBER_EATS_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'eats.order eats.store eats.store.status.write eats.store.orders.read eats.store.orders.cancel eats.store.orders.restaurantdelivery.status eats.report',
  });
  const r = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('no app token ' + JSON.stringify(j));
  return j.access_token;
}

async function uber(token, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { status: r.status, ok: r.ok || r.status === 204, data, text: text.slice(0, 300) };
}

async function getDoc(db, id) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(id), {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('get ' + id + ' ' + r.status);
  return r.json();
}
async function putDoc(db, doc) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(doc._id), {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(doc),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('put ' + doc._id + ' ' + JSON.stringify(j));
  return j;
}

const out = {};
const token = await appToken();

out.beforeStatus = await uber(token, 'GET', '/v1/eats/store/' + STORE_ID + '/status');
out.setOnline = await uber(token, 'POST', '/v1/eats/store/' + STORE_ID + '/status', {
  status: 'ONLINE',
  reason: 'Restore after Vertial cert probe — keep merchant available',
});
out.afterStatus = await uber(token, 'GET', '/v1/eats/store/' + STORE_ID + '/status');

// Update ONLY ubertest
const wc = await getDoc('bbddsaas-web', 'webconfig-' + UBERTEST_BID);
const uberCfg = { ...(wc.integrations?.uber || {}) };
uberCfg.lastStoreStatus = String(out.afterStatus.data?.status || 'ONLINE');
uberCfg.lastStoreStatusAt = new Date().toISOString();
uberCfg.updatedAt = new Date().toISOString();
wc.integrations = { ...(wc.integrations || {}), uber: uberCfg };
wc.updatedAt = uberCfg.updatedAt;
const saved = await putDoc('bbddsaas-web', wc);
out.ubertestSaved = {
  rev: saved.rev,
  storeId: uberCfg.storeId,
  storeName: uberCfg.storeName,
  menuPushedAt: uberCfg.menuPushedAt,
  menuItemCount: uberCfg.menuItemCount,
  lastStoreStatus: uberCfg.lastStoreStatus,
};

// Verify modomio untouched
const mod = await getDoc('bbddsaas-web', 'webconfig-' + MODOMIO_BID);
out.modomioVerify = {
  id: mod._id,
  rev: mod._rev,
  updatedAt: mod.updatedAt || null,
  uberStoreId: mod.integrations?.uber?.storeId || null,
  uberMenuPushedAt: mod.integrations?.uber?.menuPushedAt || null,
  uberConnectedAt: mod.integrations?.uber?.connectedAt || null,
  note: 'Si rev sigue 1-e4a75eda... no lo tocamos',
};

console.log(JSON.stringify(out, null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
