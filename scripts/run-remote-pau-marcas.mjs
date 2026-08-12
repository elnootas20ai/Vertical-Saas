#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim() || '/opt/vertial/Vertial';

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
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
const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=90', '-o', 'ServerAliveInterval=5', `${user}@${host}`, `echo ${b64} | base64 -d | bash`],
  { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.error) console.error(r.error);
process.exit(r.status ?? 1);
