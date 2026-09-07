#!/usr/bin/env node
/**
 * Limpia SOLO ubertest: quita storeId Modomio y datos de cert.
 * NO toca webconfig de modomio/Pauroyo.
 * NO llama APIs Uber de escritura sobre la store.
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
const UBERTEST_BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';
const BAD_STORE = 'fd69b9bc-a5f8-57a1-9344-ef1927f3444f';

async function get(db, id) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(id), {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('GET ' + id + ' ' + r.status);
  return r.json();
}
async function put(db, doc) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(doc._id), {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(doc),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('PUT ' + doc._id + ' ' + JSON.stringify(j));
  return j;
}

const beforeMod = await get('bbddsaas-web', 'webconfig-' + MODOMIO_BID);
const modRevBefore = beforeMod._rev;

const wc = await get('bbddsaas-web', 'webconfig-' + UBERTEST_BID);
const uber = { ...(wc.integrations?.uber || {}) };
const before = {
  storeId: uber.storeId || null,
  storeName: uber.storeName || null,
  menuPushedAt: uber.menuPushedAt || null,
  menuItemCount: uber.menuItemCount ?? null,
  provisionedAt: uber.provisionedAt || null,
  lastStoreStatus: uber.lastStoreStatus || null,
};

// Limpieza limpia: sin store Modomio, sin menú cert, sin status de esa store.
// Mantenemos oauth/tokens por si reconectan; si el storeId era el malo, fuera.
delete uber.storeId;
delete uber.storeName;
delete uber.menuPushedAt;
delete uber.menuItemCount;
delete uber.provisionedAt;
delete uber.lastStoreStatus;
delete uber.lastStoreStatusAt;
delete uber.deprovisionedAt;
uber.enabled = Boolean(uber.oauth || uber.accessToken);
uber.storeId = '';
uber.storeName = '';
uber.cleanedAt = new Date().toISOString();
uber.cleanNote = 'Unlinked Modomio/Tiana store from ubertest — waiting dedicated TIENDA UBER TEST';
uber.updatedAt = uber.cleanedAt;

wc.integrations = { ...(wc.integrations || {}), uber };
wc.updatedAt = uber.cleanedAt;
const saved = await put('bbddsaas-web', wc);

const afterMod = await get('bbddsaas-web', 'webconfig-' + MODOMIO_BID);
if (afterMod._rev !== modRevBefore) {
  throw new Error('ABORT logic: modomio rev changed unexpectedly');
}

console.log(JSON.stringify({
  ok: true,
  ubertest: {
    rev: saved.rev,
    before,
    after: {
      storeId: uber.storeId,
      storeName: uber.storeName,
      oauth: uber.oauth || null,
      hasAccessToken: Boolean(uber.accessToken),
      cleanedAt: uber.cleanedAt,
    },
    note: 'Vertial limpio. Uber API puede seguir listando Modomio hasta que Uber desvincule esa store de la Test App.',
  },
  modomioUntouched: {
    rev: afterMod._rev,
    storeId: afterMod.integrations?.uber?.storeId || null,
    updatedAt: afterMod.updatedAt || null,
  },
  badStoreIdWas: BAD_STORE,
}, null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
