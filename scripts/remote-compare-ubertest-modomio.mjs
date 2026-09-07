#!/usr/bin/env node
/**
 * Compara ubertest vs modomio (Pauroyo) en prod — solo lectura.
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

async function find(db, selector, limit = 20) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/_find', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ selector, limit }),
  });
  const j = await r.json();
  return j.docs || [];
}
async function get(db, id) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/' + encodeURIComponent(id), {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(db + '/' + id + ' ' + r.status);
  return r.json();
}

function uberSummary(wc) {
  const u = wc?.integrations?.uber || null;
  if (!u) return null;
  return {
    enabled: u.enabled ?? null,
    oauth: u.oauth ?? null,
    storeId: u.storeId || null,
    storeName: u.storeName || null,
    provisionedAt: u.provisionedAt || null,
    menuPushedAt: u.menuPushedAt || null,
    menuItemCount: u.menuItemCount ?? null,
    lastStoreStatus: u.lastStoreStatus || null,
    hasAccessToken: Boolean(u.accessToken),
    hasRefreshToken: Boolean(u.refreshToken),
    env: u.env || null,
    connectedAt: u.connectedAt || null,
    updatedAt: u.updatedAt || null,
    disconnectedAt: u.disconnectedAt || null,
  };
}

const UBERTEST_BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const UBERTEST_UID = '05ea1c8c-3cfd-4057-8629-1e44f703051f';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';

const ubertestAcc = (await find('accounts', { type: 'account', email: 'ubertest@vertial.com' })).find((a) => !a.deletedAt);
const ubertestBiz = await get('businesses', 'business:' + UBERTEST_BID);
const ubertestWc = await get('bbddsaas-web', 'webconfig-' + UBERTEST_BID);
const ubertestCats = await find('bbddsaas-catalog', { type: 'catalog_item', user_id: UBERTEST_UID }, 20);

const modomioBiz = await get('businesses', 'business:' + MODOMIO_BID);
const modomioWc = await get('bbddsaas-web', 'webconfig-' + MODOMIO_BID);
// also any webconfig with that business_id
const modomioWcs = await find('bbddsaas-web', { type: 'web_config', business_id: MODOMIO_BID }, 10);

const out = {
  ubertest: {
    account: ubertestAcc ? {
      email: ubertestAcc.email,
      linkedBusinessId: ubertestAcc.linkedBusinessId,
      deletedAt: ubertestAcc.deletedAt || null,
      updatedAt: ubertestAcc.updatedAt || null,
    } : null,
    business: ubertestBiz ? {
      business_id: ubertestBiz.business_id,
      name: ubertestBiz.name,
      businessType: ubertestBiz.businessType,
      deletedAt: ubertestBiz.deletedAt || null,
    } : null,
    uber: uberSummary(ubertestWc),
    catalogSkus: ubertestCats.filter((d) => !d.deletedAt).map((d) => d.sku),
  },
  modomio: {
    business: modomioBiz ? {
      business_id: modomioBiz.business_id,
      name: modomioBiz.name,
      owner: modomioBiz.owner_user_id,
      businessType: modomioBiz.businessType,
      deletedAt: modomioBiz.deletedAt || null,
      updatedAt: modomioBiz.updatedAt || null,
    } : null,
    webconfigs: (modomioWcs.length ? modomioWcs : (modomioWc ? [modomioWc] : [])).map((wc) => ({
      id: wc._id,
      rev: wc._rev,
      business_id: wc.business_id,
      updatedAt: wc.updatedAt || null,
      uber: uberSummary(wc),
    })),
  },
};

console.log(JSON.stringify(out, null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
