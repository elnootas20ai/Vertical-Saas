#!/usr/bin/env node
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
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fix-disarmink-cervezas-vinos-en-bebidas.mjs',
);
const b64 = fs.readFileSync(scriptPath).toString('base64');
const repo = values.REPO_PATH_ON_VPS?.trim();
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${b64}' | base64 -d > scripts/fix-disarmink-cervezas-vinos-en-bebidas.mjs
node scripts/fix-disarmink-cervezas-vinos-en-bebidas.mjs${APPLY ? ' --apply' : ''}
`;
console.log(APPLY ? '[remote] APPLY' : '[remote] dry');
process.exit(
  sshRunScript(
    values.DEPLOY_USER || values.SSH_USER,
    values.DEPLOY_HOST || values.VPS_IP,
    values.SSH_IDENTITY_FILE?.trim(),
    bash,
  ).status || 0,
);
