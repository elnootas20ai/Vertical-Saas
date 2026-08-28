#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';
const values = loadLocalValues();
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diag-aug07-compare.mjs');
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');
const bash = `set -e\ncd '${repo.replace(/'/g, `'\\''`)}'\necho '${scriptB64}' | base64 -d > scripts/diag-aug07-compare.mjs\nset -a; [ -f .env ] && . ./.env; set +a\nexport COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"\nexport COUCHDB_USER="\${COUCHDB_USER:-\${COUCH_USER:-}}"\nexport COUCHDB_PASSWORD="\${COUCHDB_PASSWORD:-\${COUCH_PASSWORD:-}}"\nnode scripts/diag-aug07-compare.mjs\n`;
process.exit((sshRunScript(user, host, identity, bash).status) ?? 1);
