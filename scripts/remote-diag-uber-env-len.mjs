#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
const id = String(process.env.UBER_EATS_CLIENT_ID || '').trim();
const sec = String(process.env.UBER_EATS_CLIENT_SECRET || '').trim();
console.log('prod CLIENT_ID len=' + id.length);
console.log('prod SECRET len=' + sec.length);
console.log('prod ENV=' + String(process.env.UBER_EATS_ENV || ''));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
