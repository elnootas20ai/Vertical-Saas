#!/usr/bin/env node
/**
 * Elimina cuentas en el VPS de producción vía SSH.
 * Uso: node scripts/remote-delete-accounts.mjs email1@example.com [email2 ...]
 */
import process from 'node:process';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const emails = process.argv.slice(2).filter(Boolean);
if (!emails.length) {
  console.error('Uso: node scripts/remote-delete-accounts.mjs email1@example.com [email2 ...]');
  process.exit(1);
}

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host || !repo) {
  console.error('Faltan DEPLOY_USER, DEPLOY_HOST o REPO_PATH_ON_VPS en deploy/local-values.env');
  process.exit(1);
}

const emailArgs = emails.map((e) => `'${String(e).replace(/'/g, `'\\''`)}'`).join(' ');

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
echo "=== Cuentas antes ==="
NODE_ENV=production node scripts/delete-test-accounts.mjs --list || true
echo
echo "=== Eliminando: ${emailArgs} ==="
NODE_ENV=production node scripts/delete-test-accounts.mjs ${emailArgs}
echo
echo "=== Cuentas después ==="
NODE_ENV=production node scripts/delete-test-accounts.mjs --list || true
`;

console.log('[remote-delete-accounts] SSH →', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
