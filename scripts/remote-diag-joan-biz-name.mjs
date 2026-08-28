#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

const inner = `
const COUCH = process.env.COUCHDB_URL;
const AUTH = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const owner = '13e49ef6-183a-4afa-a17b-7730917fe685';
async function couch(p) {
  const r = await fetch(COUCH + p, { headers: { Authorization: AUTH } });
  return r.json();
}
const d = await couch('/accounts/account:' + owner);
console.log(JSON.stringify({
  email: d.email,
  name: d.fullName || d.name,
  businessName: d.businessName || d.companyName || null,
}, null, 2));
for (const path of ['/bbddsaas/business:' + BID, '/businesses/business:' + BID]) {
  const dd = await couch(path);
  if (!dd.error) console.log('biz', path, JSON.stringify({ name: dd.name, businessName: dd.businessName }, null, 2));
}
`;

const innerB64 = Buffer.from(inner, 'utf8').toString('base64');
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
set -a; [ -f .env ] && . ./.env; set +a
export COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"
curl -sf http://couchdb:5984/ >/dev/null 2>&1 && export COUCHDB_URL=http://couchdb:5984
export COUCHDB_USER="\${COUCHDB_USER:-\${COUCH_USER:-}}"
export COUCHDB_PASSWORD="\${COUCHDB_PASSWORD:-\${COUCH_PASSWORD:-}}"
echo '${innerB64}' | base64 -d > /tmp/joan-biz.mjs
node /tmp/joan-biz.mjs
echo "=== docker lines with jotebe4@ ==="
docker logs deploy-app-1 2>&1 | grep -F 'jotebe4' | tail -n 50 || true
`;

console.log('[remote] joan business + email log');
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
