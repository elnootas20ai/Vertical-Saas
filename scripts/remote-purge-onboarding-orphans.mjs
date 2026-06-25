#!/usr/bin/env node
/**
 * Ejecuta purge-onboarding-orphans en el VPS de produccion via SSH.
 * Uso: node scripts/remote-purge-onboarding-orphans.mjs [--apply]
 */
import process from 'node:process';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const apply = process.argv.includes('--apply');
const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values['DEPLOY_' + 'USER'] || values['SSH_' + 'USER'];
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host || !repo) {
  console.error('Faltan DEPLOY_user, DEPLOY_HOST o REPO_PATH_ON_VPS en deploy/local-values.env');
  process.exit(1);
}

const applyFlag = apply ? ' --apply' : '';
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
echo "=== purge-onboarding-orphans ==="
ALLOW_REMOTE_PURGE=1 NODE_ENV=production node scripts/purge-onboarding-orphans.mjs${applyFlag}
`;

console.log('[remote-purge] SSH ->', `${user}@${host}`, apply ? '(apply)' : '(dry-run)');
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
