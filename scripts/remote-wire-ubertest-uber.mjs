#!/usr/bin/env node
/**
 * Diagnóstico + cableado Uber en cuenta ubertest (SOLO ese business_id).
 * No toca el negocio modomio/Pauroyo.
 */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const APPLY = String(process.env.UBER_TEST_APPLY || '0').trim() === '1';
const STORE_ID = String(process.env.UBER_TEST_STORE_ID || 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f').trim();
const STORE_LABEL = String(process.env.UBER_TEST_STORE_LABEL || 'Uber Sandbox Cert Store').trim();
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const UID = '05ea1c8c-3cfd-4057-8629-1e44f703051f';
const WC_ID = `webconfig-${BID}`;

const bash = `set -a; . ${repo}/.env; set +a
export UBER_TEST_APPLY='${APPLY ? '1' : '0'}'
export UBER_TEST_STORE_ID='${STORE_ID.replace(/'/g, `'\\''`)}'
export UBER_TEST_STORE_LABEL='${STORE_LABEL.replace(/'/g, `'\\''`)}'
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const UID = '05ea1c8c-3cfd-4057-8629-1e44f703051f';
const WC_ID = 'webconfig-' + BID;
const APPLY = process.env.UBER_TEST_APPLY === '1';
const STORE_ID = process.env.UBER_TEST_STORE_ID;
const STORE_LABEL = process.env.UBER_TEST_STORE_LABEL;

async function couchJson(method, path, body) {
  const res = await fetch(couch + path, {
    method,
    headers: {
      Authorization: auth,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(method + ' ' + path + ' -> ' + res.status + ' ' + text.slice(0, 300));
  return data;
}

function uberBase() {
  const env = String(process.env.UBER_EATS_ENV || 'sandbox').toLowerCase();
  return (env === 'production' || env === 'prod') ? 'https://api.uber.com' : 'https://test-api.uber.com';
}
function uberTokenUrl() {
  const env = String(process.env.UBER_EATS_ENV || 'sandbox').toLowerCase();
  return (env === 'production' || env === 'prod')
    ? 'https://login.uber.com/oauth/v2/token'
    : 'https://sandbox-login.uber.com/oauth/v2/token';
}

async function getAppToken() {
  const body = new URLSearchParams({
    client_id: process.env.UBER_EATS_CLIENT_ID,
    client_secret: process.env.UBER_EATS_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'eats.order eats.store eats.store.status.write eats.store.orders.read eats.store.orders.cancel eats.store.orders.restaurantdelivery.status eats.report',
  });
  const res = await fetch(uberTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('app token: ' + JSON.stringify(data));
  return data.access_token;
}

async function uberFetch(token, method, path, body) {
  const res = await fetch(uberBase() + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }
  return { status: res.status, ok: res.ok || res.status === 204, data, text: text.slice(0, 400) };
}

const out = { apply: APPLY, businessId: BID, steps: [] };

// 1) Catalog
const cat = await couchJson('POST', '/bbddsaas-catalog/_find', {
  selector: { type: 'catalog_item', user_id: UID },
  limit: 50,
  fields: ['_id', 'sku', 'name', 'active', 'unitPrice'],
});
out.catalogBefore = (cat.docs || []).map((d) => ({ sku: d.sku, name: d.name, active: d.active }));

const seedItems = [
  { sku: 'UBER-BURGER', name: 'Burger Test', category: 'Comidas', unitPrice: 9.5 },
  { sku: 'UBER-PIZZA', name: 'Pizza Test', category: 'Comidas', unitPrice: 11 },
  { sku: 'UBER-COLA', name: 'Cola Test', category: 'Bebidas', unitPrice: 2.5 },
  { sku: 'UBER-FRIES', name: 'Patatas Test', category: 'Extras', unitPrice: 3.5 },
];

if (APPLY && out.catalogBefore.length < 4) {
  const now = new Date().toISOString();
  for (const item of seedItems) {
    const id = 'catitem-uber-test-' + item.sku.toLowerCase();
    let existing = null;
    try { existing = await couchJson('GET', '/bbddsaas-catalog/' + encodeURIComponent(id)); } catch { existing = null; }
    await couchJson('PUT', '/bbddsaas-catalog/' + encodeURIComponent(id), {
      _id: id,
      _rev: existing?._rev,
      type: 'catalog_item',
      id,
      sku: item.sku,
      user_id: UID,
      business_id: BID,
      module: 'catalog',
      itemType: 'product',
      vertical: 'delivery',
      name: item.name,
      description: item.name + ' (Uber TEST)',
      category: item.category,
      unitPrice: item.unitPrice,
      costPrice: Math.round(item.unitPrice * 0.4 * 100) / 100,
      taxRate: 10,
      stockQuantity: 100,
      minStock: 0,
      unit: 'ud',
      active: true,
      available: true,
      webVisible: true,
      salesChannels: [
        { channelId: 'ubereats', channelName: 'Uber Eats', customPrice: null },
        { channelId: 'tpv', channelName: 'TPV', customPrice: null },
      ],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: null,
    });
  }
  out.steps.push({ seedCatalog: 'ok', count: seedItems.length });
}

// 2) Tokens
const wc = await couchJson('GET', '/bbddsaas-web/' + encodeURIComponent(WC_ID));
const uber = wc.integrations?.uber || {};
out.oauth = {
  enabled: uber.enabled,
  oauth: uber.oauth,
  storeId: uber.storeId || null,
  expiresAt: uber.expiresAt || null,
  scope: uber.scope || null,
  hasAccessToken: Boolean(uber.accessToken),
  hasRefreshToken: Boolean(uber.refreshToken),
};

const appToken = await getAppToken();
const userToken = String(uber.accessToken || '').trim();

const listApp = await uberFetch(appToken, 'GET', '/v1/eats/stores?limit=20');
out.listStoresApp = { status: listApp.status, summary: listApp.data?.stores?.map((s) => s.store_id || s.id) || listApp.text };

let listUser = null;
if (userToken) {
  listUser = await uberFetch(userToken, 'GET', '/v1/eats/stores?limit=20');
  out.listStoresUser = { status: listUser.status, ok: listUser.ok, text: listUser.ok ? 'ok' : listUser.text };
}

const posGet = await uberFetch(appToken, 'GET', '/v1/eats/stores/' + encodeURIComponent(STORE_ID) + '/pos_data');
out.posDataBefore = { status: posGet.status, data: posGet.data };

if (!APPLY) {
  out.hint = 'Dry-run. Reejecuta con UBER_TEST_APPLY=1 para provision + menú + guardar en ubertest.';
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// 3) Provision pos_data — intenta user token, luego app token
const provisionBody = {
  is_order_manager: true,
  integrator_store_id: BID,
  store_configuration_data: JSON.stringify({ vertialBusinessId: BID, partner: 'vertial', purpose: 'uber-cert-test' }),
};
let provision = null;
if (userToken) {
  provision = await uberFetch(userToken, 'POST', '/v1/eats/stores/' + encodeURIComponent(STORE_ID) + '/pos_data', provisionBody);
  out.steps.push({ provisionUser: { status: provision.status, ok: provision.ok, text: provision.text } });
}
if (!provision?.ok) {
  provision = await uberFetch(appToken, 'POST', '/v1/eats/stores/' + encodeURIComponent(STORE_ID) + '/pos_data', provisionBody);
  out.steps.push({ provisionApp: { status: provision.status, ok: provision.ok, text: provision.text } });
}

const posAfter = await uberFetch(appToken, 'GET', '/v1/eats/stores/' + encodeURIComponent(STORE_ID) + '/pos_data');
out.posDataAfter = { status: posAfter.status, data: posAfter.data };

// 4) Menu upload from catalog
const cat2 = await couchJson('POST', '/bbddsaas-catalog/_find', {
  selector: { type: 'catalog_item', user_id: UID },
  limit: 50,
});
const products = (cat2.docs || []).filter((d) => d.active !== false && !d.deletedAt);
function ml(text) {
  const value = String(text || 'Item');
  return { translations: { es_es: value, en_us: value } };
}
const categoriesMap = new Map();
for (const p of products) {
  const catName = String(p.category || 'general');
  if (!categoriesMap.has(catName)) categoriesMap.set(catName, []);
  categoriesMap.get(catName).push(p);
}
const categoryIds = [];
const categories = [];
const items = [];
for (const [catName, list] of categoriesMap.entries()) {
  const catId = ('cat-' + catName).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 64);
  categoryIds.push(catId);
  categories.push({
    id: catId,
    title: ml(catName),
    entities: list.map((p) => ({ id: String(p.sku || p.id), type: 'ITEM' })),
  });
  for (const p of list) {
    items.push({
      id: String(p.sku || p.id),
      title: ml(p.name),
      price_info: { price: Math.round(Number(p.unitPrice || 0) * 100) },
      tax_info: { tax_rate: 0.1 },
      dish_info: { classifications: { alcoholic_items: 0 } },
    });
  }
}
const menu = {
  menus: [{
    id: 'vertial-main',
    title: ml(STORE_LABEL),
    service_availability: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((day_of_week) => ({
      day_of_week,
      time_periods: [{ start_time: '00:00', end_time: '23:59' }],
    })),
    category_ids: categoryIds,
  }],
  categories,
  items,
  modifier_groups: [],
  display_options: {},
};
const menuPut = await uberFetch(appToken, 'PUT', '/v2/eats/stores/' + encodeURIComponent(STORE_ID) + '/menus', menu);
out.steps.push({ menuUpload: { status: menuPut.status, ok: menuPut.ok, items: items.length, text: menuPut.text } });

// 5) Store status — PAUSED (cert write OK, sin abrir el local en Uber)
const statusSet = await uberFetch(appToken, 'POST', '/v1/delivery/store/' + encodeURIComponent(STORE_ID) + '/update-store-status', {
  status: 'PAUSED',
  reason: 'Vertial Uber certification test (keep paused)',
});
out.steps.push({ setStatus: { status: statusSet.status, ok: statusSet.ok, text: statusSet.text } });
const statusGet = await uberFetch(appToken, 'GET', '/v1/delivery/store/' + encodeURIComponent(STORE_ID) + '/status');
out.storeStatus = { status: statusGet.status, data: statusGet.data };

// 6) Save ONLY on ubertest webconfig (never modomio business)
const now = new Date().toISOString();
const next = {
  ...wc,
  integrations: {
    ...(wc.integrations || {}),
    uber: {
      ...(uber || {}),
      enabled: true,
      oauth: true,
      env: String(process.env.UBER_EATS_ENV || 'sandbox'),
      storeId: STORE_ID,
      storeName: STORE_LABEL,
      provisionedAt: provision?.ok ? now : (uber.provisionedAt || ''),
      menuPushedAt: menuPut.ok ? now : (uber.menuPushedAt || ''),
      menuItemCount: menuPut.ok ? items.length : (uber.menuItemCount || 0),
      lastStoreStatus: statusGet.data?.status || uber.lastStoreStatus || '',
      lastStoreStatusAt: now,
      updatedAt: now,
    },
  },
  updatedAt: now,
};
const saved = await couchJson('PUT', '/bbddsaas-web/' + encodeURIComponent(WC_ID), next);
out.steps.push({ saveWebconfig: { ok: true, rev: saved.rev, storeName: STORE_LABEL, storeId: STORE_ID } });

console.log(JSON.stringify(out, null, 2));
NODE`;

console.log('[wire-ubertest] APPLY=', APPLY, 'host=', host);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
