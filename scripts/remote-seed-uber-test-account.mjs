#!/usr/bin/env node
/**
 * Crea la cuenta Uber TEST en CouchDB de producción (VPS vía SSH).
 * Uso: node scripts/remote-seed-uber-test-account.mjs
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SEED_REL = 'scripts/seed-uber-test-account.mjs';

const values = loadLocalValues();
if (!values) {
  console.error('No existe deploy/local-values.env');
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host || !repo) {
  console.error('Faltan DEPLOY_USER, DEPLOY_HOST o REPO_PATH_ON_VPS');
  process.exit(1);
}

const scpArgs = ['-o', 'ConnectTimeout=25'];
if (identity) scpArgs.push('-i', identity);
scpArgs.push(resolve(REPO_ROOT, SEED_REL), `${user}@${host}:${repo}/${SEED_REL}`);

console.log('[remote-seed-uber] Subiendo script…');
const scp = spawnSync('scp', scpArgs, { stdio: 'inherit' });
if (scp.status !== 0) {
  process.exit(scp.status ?? 1);
}

const email = String(process.env.UBER_TEST_EMAIL || 'ubertest@vertial.com').trim();
const pass = String(process.env.UBER_TEST_PASSWORD || '').trim();
const passEnv = pass ? `UBER_TEST_PASSWORD='${pass.replace(/'/g, `'\\''`)}' ` : '';

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
echo "=== seed-uber-test-account (producción) ==="
NODE_ENV=production COUCHDB_URL=http://127.0.0.1:5984 UBER_TEST_EMAIL='${email.replace(/'/g, `'\\''`)}' ${passEnv}UBER_TEST_RECREATE=1 node scripts/seed-uber-test-account.mjs
`;

console.log('[remote-seed-uber] SSH ->', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
