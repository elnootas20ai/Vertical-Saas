#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const apply = process.argv.includes('--apply');
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fix-disarmink-carta-fija.mjs');
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/fix-disarmink-carta-fija.mjs
node scripts/fix-disarmink-carta-fija.mjs ${apply ? '--apply' : ''}
`;
console.log('[remote]', apply ? 'APPLY' : 'dry-run', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
