#!/usr/bin/env node
/**
 * Sube y ejecuta apply-pau-ingredients-from-menu en el VPS (solo ingredients).
 * Uso:
 *   node scripts/remote-apply-pau-ingredients-from-menu.mjs
 *   node scripts/remote-apply-pau-ingredients-from-menu.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const APPLY = process.argv.includes('--apply');
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
  console.error('Faltan DEPLOY_*');
  process.exit(1);
}

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'apply-pau-ingredients-from-menu.mjs');
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');
const flag = APPLY ? ' --apply' : '';

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/apply-pau-ingredients-from-menu.mjs
node scripts/apply-pau-ingredients-from-menu.mjs${flag}
`;

console.log(`[remote] ${APPLY ? 'APPLY' : 'DRY-RUN'} ingredientes Pau → ${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
