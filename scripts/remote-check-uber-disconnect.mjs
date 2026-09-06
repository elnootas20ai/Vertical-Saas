#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `
grep -n 'disconnectUberEats' '${repo}/controllers/uberEatsController.js' | head -5
grep -n 'disconnect' '${repo}/routers/uberEatsRouter.js'
ls -la '${repo}/controllers/uberEatsController.js' | awk '{print $5,$6,$7,$8,$9}'
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? 1);
