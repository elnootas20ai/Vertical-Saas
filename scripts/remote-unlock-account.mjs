#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Uso: node scripts/remote-unlock-account.mjs <email>');
  process.exit(1);
}

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const repo = String(v.REPO_PATH_ON_VPS || '').trim();
const identity = v.SSH_IDENTITY_FILE?.trim();
const esc = email.replace(/'/g, `'\\''`);

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
docker exec deploy-app-1 node scripts/unlock-account.mjs '${esc}'
`;

console.log('[unlock]', email, '→', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
