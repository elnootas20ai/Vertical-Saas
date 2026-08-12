#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const script = process.argv[2] || 'diag-pau-marcas-doublecount.mjs';

const bash = `set -e
cd /opt/vertial/Vertial
set -a
[ -f .env ] && . ./.env
set +a
export COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"
node scripts/${script}
`;
const b64 = Buffer.from(bash, 'utf8').toString('base64');
const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=90', `${user}@${host}`, `echo ${b64} | base64 -d | bash`],
  { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
