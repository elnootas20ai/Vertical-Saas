#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadLocalValues } from './deploy-env.mjs';

const apply = process.argv.includes('--apply');
const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const localScript = readFileSync(new URL('./fix-tiana-dup-card-tx.mjs', import.meta.url), 'utf8');
const scriptB64 = Buffer.from(localScript, 'utf8').toString('base64');
const applyFlag = apply ? ' --apply' : '';
const bash = `set -e
cd /opt/vertial/Vertial
set -a
[ -f .env ] && . ./.env
set +a
echo '${scriptB64}' | base64 -d > /tmp/fix-tiana-dup-card-tx.mjs
node /tmp/fix-tiana-dup-card-tx.mjs${applyFlag}
`;
const b64 = Buffer.from(bash, 'utf8').toString('base64');
const r = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=90', `${user}@${host}`, `echo ${b64} | base64 -d | bash`],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
