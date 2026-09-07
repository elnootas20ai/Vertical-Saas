#!/usr/bin/env node
/**
 * Solo sandbox. Probe pos_data con app token (+/- provisioning) y user token ubertest.
 * Si APPLY=1 y provision OK → guarda provisionedAt SOLO en webconfig ubertest.
 * No toca modomio/Pauroyo.
 */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const APPLY = String(process.env.UBER_POS_APPLY || '0').trim() === '1';
const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `set -a; . ${repo}/.env; set +a
export UBER_POS_APPLY='${APPLY ? '1' : '0'}'
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const STORE_ID = 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f';
const APPLY = process.env.UBER_POS_APPLY === '1';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';

const env = String(process.env.UBER_EATS_ENV || 'sandbox').toLowerCase();
const base = (env === 'production' || env === 'prod') ? 'https://api.uber.com' : 'https://test-api.uber.com';
const tokenUrl = (env === 'production' || env === 'prod')
  ? 'https://login.uber.com/oauth/v2/token'
  : 'https://sandbox-login.uber.com/oauth/v2/token';

if (base.includes('api.uber.com') && !base.includes('test-api')) {
  throw new Error('ABORT: entorno production — no ejecutar probe de cert aquí');
}

async function getAppToken(scope) {
  const body = new URLSearchParams({
    client_id: process.env.UBER_EATS_CLIENT_ID,
    client_secret: process.env.UBER_EATS_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope,
  });
  const r = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const j = await r.json();
  return {
    status: r.status,
    ok: r.ok && Boolean(j.access_token),
    scopeReturned: j.scope || null,
    error: j.error_description || j.error || null,
    token: j.access_token || null,
  };
}

async function call(token, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let data = null;
  try { data = t ? JSON.parse(t) : null; } catch { data = { raw: t.slice(0, 400) }; }
  return { status: r.status, ok: r.ok || r.status === 204, data, text: t.slice(0, 500) };
}

const SCOPE_NORMAL = [
  'eats.order',
  'eats.store',
  'eats.store.status.write',
  'eats.store.orders.read',
  'eats.store.orders.cancel',
  'eats.store.orders.restaurantdelivery.status',
  'eats.report',
].join(' ');

const SCOPE_WITH_PROV = SCOPE_NORMAL + ' eats.pos_provisioning';

const out = {
  meta: { env, apiBase: base, storeId: STORE_ID, apply: APPLY, note: 'solo sandbox / ubertest' },
  tokens: {},
  calls: {},
};

out.tokens.appNormal = await getAppToken(SCOPE_NORMAL);
out.tokens.appWithProv = await getAppToken(SCOPE_WITH_PROV);
out.tokens.appProvOnly = await getAppToken('eats.pos_provisioning');

const wc = await (await fetch(couch + '/bbddsaas-web/webconfig-' + BID, {
  headers: { Authorization: auth },
})).json();
const uber = wc.integrations?.uber || {};
const userTok = String(uber.accessToken || '').trim();
out.tokens.user = {
  hasToken: Boolean(userTok),
  scopeSaved: uber.scope || null,
  expiresAt: uber.expiresAt || null,
  storeId: uber.storeId || null,
  storeName: uber.storeName || null,
  menuPushedAt: uber.menuPushedAt || null,
};

const appTok = out.tokens.appWithProv.ok
  ? out.tokens.appWithProv.token
  : (out.tokens.appNormal.ok ? out.tokens.appNormal.token : null);

if (appTok) {
  out.calls.getPosApp = await call(appTok, 'GET', '/v1/eats/stores/' + STORE_ID + '/pos_data');
  out.calls.listStoresApp = await call(appTok, 'GET', '/v1/eats/stores?limit=5');
}

if (userTok) {
  out.calls.getPosUser = await call(userTok, 'GET', '/v1/eats/stores/' + STORE_ID + '/pos_data');
  out.calls.listStoresUser = await call(userTok, 'GET', '/v1/eats/stores?limit=5');
}

const provisionBody = {
  is_order_manager: true,
  integrator_store_id: BID,
  store_configuration_data: JSON.stringify({
    vertialBusinessId: BID,
    partner: 'vertial',
    purpose: 'uber-cert-test',
  }),
};

const patchBody = {
  integration_enabled: true,
  is_order_manager: true,
  integrator_store_id: BID,
};

async function tryProvision(label, token) {
  if (!token) return { skipped: true };
  const post = await call(token, 'POST', '/v1/eats/stores/' + STORE_ID + '/pos_data', provisionBody);
  if (post.ok) return { method: 'POST', ...post };
  const patch = await call(token, 'PATCH', '/v1/eats/stores/' + STORE_ID + '/pos_data', patchBody);
  return { method: 'POST_then_PATCH', post, patch };
}

if (!APPLY) {
  out.hint = 'Dry-run. Reejecuta con UBER_POS_APPLY=1 para intentar POST/PATCH pos_data.';
  // Solo probes de lectura ya hechos; no write
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

out.provision = {};
if (userTok) {
  out.provision.user = await tryProvision('user', userTok);
}
if (out.tokens.appWithProv.ok) {
  out.provision.appWithProv = await tryProvision('appWithProv', out.tokens.appWithProv.token);
}
if (out.tokens.appProvOnly.ok) {
  out.provision.appProvOnly = await tryProvision('appProvOnly', out.tokens.appProvOnly.token);
}
if (!out.tokens.appWithProv.ok && out.tokens.appNormal.ok) {
  out.provision.appNormal = await tryProvision('appNormal', out.tokens.appNormal.token);
}

const checkTok = out.tokens.appWithProv.token || out.tokens.appNormal.token || userTok;
if (checkTok) {
  out.calls.getPosAfter = await call(checkTok, 'GET', '/v1/eats/stores/' + STORE_ID + '/pos_data');
}

const provisionOk = Boolean(
  out.provision.user?.ok
  || out.provision.user?.patch?.ok
  || out.provision.appWithProv?.ok
  || out.provision.appWithProv?.patch?.ok
  || out.provision.appProvOnly?.ok
  || out.provision.appProvOnly?.patch?.ok
  || out.calls.getPosAfter?.data?.integration_enabled
  || out.calls.getPosAfter?.data?.pos_integration_enabled
);

if (provisionOk) {
  const now = new Date().toISOString();
  const next = {
    ...wc,
    integrations: {
      ...(wc.integrations || {}),
      uber: {
        ...uber,
        enabled: true,
        provisionedAt: now,
        updatedAt: now,
      },
    },
    updatedAt: now,
  };
  const put = await fetch(couch + '/bbddsaas-web/webconfig-' + BID, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(next),
  });
  const saved = await put.json();
  out.ubertestSaved = { ok: put.ok, rev: saved.rev, provisionedAt: now };
}

const mod = await (await fetch(couch + '/bbddsaas-web/webconfig-' + MODOMIO_BID, {
  headers: { Authorization: auth },
})).json();
out.modomioVerify = {
  rev: mod._rev,
  updatedAt: mod.updatedAt || null,
  uberStoreId: mod.integrations?.uber?.storeId || null,
  note: 'no tocado',
};

console.log(JSON.stringify(out, null, 2));
NODE`;

console.log('[uber-pos-probe] APPLY=', APPLY, 'host=', host);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
