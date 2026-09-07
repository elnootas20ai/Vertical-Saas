#!/usr/bin/env node
/**
 * Enlaza store sandbox + PDV existente en ubertest (solo ese business).
 * APPLY=1 para escribir.
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
const PDV_ID = 'pdv-uber-test-34fad5b6';
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';

const bash = `set -a; . ${repo}/.env; set +a
export UBER_TEST_APPLY='${APPLY ? '1' : '0'}'
export UBER_TEST_STORE_ID='${STORE_ID.replace(/'/g, `'\\''`)}'
export UBER_TEST_STORE_LABEL='${STORE_LABEL.replace(/'/g, `'\\''`)}'
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const MODOMIO_BID = '33821959-ae50-4e52-bfea-ea2b145faeac';
const PDV_ID = 'pdv-uber-test-34fad5b6';
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

const pdv = await couchJson('GET', '/bbddsaas-delivery/' + encodeURIComponent(PDV_ID));
const salesPoint = await couchJson('GET', '/bbddsaas-sales-points/' + encodeURIComponent('wc-uber-test-34fad5b6'));
const wc = await couchJson('GET', '/bbddsaas-web/webconfig-' + BID);
const modBefore = await couchJson('GET', '/bbddsaas-web/webconfig-' + MODOMIO_BID);
const uber = { ...(wc.integrations?.uber || {}) };

const out = {
  apply: APPLY,
  pdv: { id: pdv._id, name: pdv.name, business_id: pdv.business_id },
  salesPointDoc: { id: salesPoint._id, name: salesPoint.name, type: salesPoint.type },
  uberBefore: {
    storeId: uber.storeId || null,
    storeName: uber.storeName || null,
    salesPointId: uber.salesPointId || null,
    oauth: Boolean(uber.oauth),
  },
};

if (!APPLY) {
  out.hint = 'Dry-run OK. UBER_TEST_APPLY=1 para guardar.';
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (String(pdv.business_id) !== BID) throw new Error('PDV no pertenece a ubertest');
if (!uber.accessToken && !uber.oauth) throw new Error('Sin OAuth en ubertest');

uber.enabled = true;
uber.oauth = true;
uber.storeId = STORE_ID;
uber.storeName = STORE_LABEL;
uber.salesPointId = PDV_ID;
uber.env = 'sandbox';
uber.updatedAt = new Date().toISOString();
uber.cleanNote = '';
delete uber.cleanedAt;

wc.integrations = { ...(wc.integrations || {}), uber };
wc.updatedAt = uber.updatedAt;
const saved = await couchJson('PUT', '/bbddsaas-web/' + encodeURIComponent(wc._id), wc);
const modAfter = await couchJson('GET', '/bbddsaas-web/webconfig-' + MODOMIO_BID);
if (modAfter._rev !== modBefore._rev) throw new Error('ABORT: modomio cambió');

out.ubertestSaved = {
  rev: saved.rev,
  storeId: uber.storeId,
  storeName: uber.storeName,
  salesPointId: uber.salesPointId,
  salesPointName: pdv.name,
};
out.modomioUntouched = { rev: modAfter._rev };
console.log(JSON.stringify(out, null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
