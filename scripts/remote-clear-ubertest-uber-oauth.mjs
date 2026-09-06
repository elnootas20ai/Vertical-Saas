#!/usr/bin/env node
/** Limpia OAuth Uber de la cuenta ubertest (solo esa empresa). */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();
const BID = '34fad5b6-728b-4f6d-b2b3-b280190f574b';

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const id = 'webconfig-${BID}';
const r = await fetch(couch + '/bbddsaas-web/' + encodeURIComponent(id), {
  headers: { Authorization: auth, Accept: 'application/json' },
});
if (!r.ok) { console.error('NO_CONFIG', r.status); process.exit(1); }
const doc = await r.json();
const uber = { ...(doc.integrations?.uber || {}) };
doc.integrations = {
  ...(doc.integrations || {}),
  uber: {
    ...uber,
    enabled: false,
    oauth: false,
    accessToken: '',
    refreshToken: '',
    tokenType: '',
    scope: '',
    expiresAt: '',
    connectedAt: '',
    storeId: '',
    storeName: '',
    provisionedAt: '',
    menuPushedAt: '',
    menuItemCount: 0,
    disconnectedAt: new Date().toISOString(),
  },
};
doc.updatedAt = new Date().toISOString();
const put = await fetch(couch + '/bbddsaas-web/' + encodeURIComponent(id), {
  method: 'PUT',
  headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(doc),
});
const out = await put.json();
console.log(put.ok ? 'CLEARED_UBER_OAUTH' : 'FAIL', out.ok || out.error || out.reason || put.status);
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
