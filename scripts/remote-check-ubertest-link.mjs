#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const bash = `set -a; . ${v.REPO_PATH_ON_VPS}/.env; set +a
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const bid = '34fad5b6-728b-4f6d-b2b3-b280190f574b';
const r = await fetch(couch + '/bbddsaas-web/webconfig-' + bid, { headers: { Authorization: auth } });
const c = await r.json();
const u = c.integrations?.uber || {};
console.log(JSON.stringify({
  storeId: u.storeId,
  storeName: u.storeName,
  salesPointId: u.salesPointId,
  oauth: u.oauth,
  menuPushedAt: u.menuPushedAt || null,
  lastStoreStatus: u.lastStoreStatus || null,
}, null, 2));
NODE`;
const r = sshRunScript(v.DEPLOY_USER || v.SSH_USER, v.DEPLOY_HOST || v.VPS_IP, v.SSH_IDENTITY_FILE?.trim(), bash);
process.exit(r.status ?? 1);
