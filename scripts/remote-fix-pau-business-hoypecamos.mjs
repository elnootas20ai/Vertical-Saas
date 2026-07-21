#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const dry = process.argv.includes('--dry');
const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fix-pau-business-hoypecamos.mjs');
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');
const repo = values.REPO_PATH_ON_VPS?.trim();
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/fix-pau-business-hoypecamos.mjs
node scripts/fix-pau-business-hoypecamos.mjs ${dry ? '' : '--apply'}
`;
console.log('[remote]', dry ? '(dry)' : '(apply)');
const r = sshRunScript(
  values.DEPLOY_USER || values.SSH_USER,
  values.DEPLOY_HOST || values.VPS_IP,
  values.SSH_IDENTITY_FILE?.trim(),
  bash,
);
process.exit(r.status ?? (r.error ? 1 : 0));
