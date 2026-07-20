#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const apply = process.argv.includes('--apply');
const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptB64 = fs
  .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fix-pdv-business-ids.mjs'))
  .toString('base64');

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/fix-pdv-business-ids.mjs
NODE_ENV=production node scripts/fix-pdv-business-ids.mjs ${apply ? '--apply' : ''}
`;

console.log('[remote-pdv]', `${user}@${host}`, apply ? '(apply)' : '(dry)');
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? 1);
