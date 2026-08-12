#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'diag-pau-dashboard-marcas.mjs',
);
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/diag-pau-dashboard-marcas.mjs
set -a
[ -f .env ] && . ./.env
set +a
export COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf "http://couchdb:5984/" >/dev/null 2>&1; then
  export COUCHDB_URL="http://couchdb:5984"
fi
echo "COUCH=\$COUCHDB_URL"
ls -la shared/delivery/orderLineRevenueSplit.js || echo MISSING_SPLIT
node scripts/diag-pau-dashboard-marcas.mjs
`;

const b64 = Buffer.from(bash, 'utf8').toString('base64');
const args = ['-o', 'ConnectTimeout=60', '-o', 'ServerAliveInterval=5'];
if (identity) args.push('-i', identity);
args.push(`${user}@${host}`, `echo ${b64} | base64 -d | bash`);

const r = spawnSync('ssh', args, {
  encoding: 'utf8',
  maxBuffer: 80 * 1024 * 1024,
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? (r.error ? 1 : 0));
