#!/usr/bin/env node
/** Prueba POS oficial únicamente en Uber sandbox y guarda evidencia real en ubertest. */
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
const couchAuth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';
const STORE_ID = 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f';

async function getDoc(bid) {
  const r = await fetch(couch + '/bbddsaas-web/webconfig-' + bid, {
    headers: { Authorization: couchAuth, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('GET webconfig ' + r.status);
  return r.json();
}
const wc = await getDoc(BID);
const modBefore = await getDoc(MODOMIO_BID);
const uber = { ...(wc.integrations?.uber || {}) };
if (String(uber.storeId || '') !== STORE_ID) throw new Error('ABORT: store ubertest no coincide');
if (!uber.accessToken) throw new Error('ABORT: ubertest sin token OAuth');

const provisionRes = await fetch(
  'https://test-api.uber.com/v1/eats/stores/' + STORE_ID + '/pos_data',
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + uber.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // Cuerpo mínimo literal del ejemplo oficial de Uber.
    body: JSON.stringify({ pos_integration_enabled: true }),
  },
);
const provisionText = await provisionRes.text();

const tokenBody = new URLSearchParams({
  client_id: process.env.UBER_EATS_CLIENT_ID,
  client_secret: process.env.UBER_EATS_CLIENT_SECRET,
  grant_type: 'client_credentials',
  scope: 'eats.order eats.store eats.store.status.write eats.store.orders.read eats.store.orders.cancel eats.store.orders.restaurantdelivery.status eats.report',
});
const tokenRes = await fetch('https://sandbox-login.uber.com/oauth/v2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: tokenBody,
});
const token = await tokenRes.json();
if (!tokenRes.ok || !token.access_token) throw new Error('No app token');

const posRes = await fetch('https://test-api.uber.com/v1/eats/stores/' + STORE_ID + '/pos_data', {
  headers: { Authorization: 'Bearer ' + token.access_token, Accept: 'application/json' },
});
const posText = await posRes.text();
let posData = {};
try { posData = posText ? JSON.parse(posText) : {}; } catch { posData = { raw: posText }; }
const enabled = Boolean(posData.integration_enabled ?? posData.pos_integration_enabled ?? false);

const now = new Date().toISOString();
uber.posIntegrationEnabled = enabled;
uber.posDataCheckedAt = now;
uber.lastProvisionError = provisionRes.ok ? '' : provisionText.slice(0, 500);
if (enabled) uber.provisionedAt = now;
wc.integrations = { ...(wc.integrations || {}), uber };
wc.updatedAt = now;
const saveRes = await fetch(couch + '/bbddsaas-web/' + encodeURIComponent(wc._id), {
  method: 'PUT',
  headers: { Authorization: couchAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(wc),
});
const saved = await saveRes.json();
if (!saveRes.ok) throw new Error('Save failed ' + JSON.stringify(saved));
const modAfter = await getDoc(MODOMIO_BID);
if (modAfter._rev !== modBefore._rev) throw new Error('ABORT: modomio cambió');

console.log(JSON.stringify({
  provision: { status: provisionRes.status, ok: provisionRes.ok, body: provisionText.slice(0, 500) },
  getPosData: { status: posRes.status, ok: posRes.ok, data: posData },
  integrationEnabled: enabled,
  evidenceSaved: { rev: saved.rev, at: now },
  modomioUntouched: { rev: modAfter._rev },
}, null, 2));
NODE`;

const result = sshRunScript(user, host, identity, bash);
process.exit(result.status ?? (result.error ? 1 : 0));
