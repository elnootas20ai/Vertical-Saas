#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';
const v = loadLocalValues();
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diag-validate-4-sheets.mjs');
const bash = `set -e\ncd '${v.REPO_PATH_ON_VPS.trim().replace(/'/g, `'\\''`)}'\necho '${fs.readFileSync(scriptPath).toString('base64')}' | base64 -d > scripts/diag-validate-4-sheets.mjs\nset -a; [ -f .env ] && . ./.env; set +a\nexport COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"\nexport COUCHDB_USER="\${COUCHDB_USER:-\${COUCH_USER:-}}"\nexport COUCHDB_PASSWORD="\${COUCHDB_PASSWORD:-\${COUCH_PASSWORD:-}}"\nnode scripts/diag-validate-4-sheets.mjs\n`;
process.exit((sshRunScript(v.DEPLOY_USER || v.SSH_USER, v.DEPLOY_HOST || v.VPS_IP, v.SSH_IDENTITY_FILE?.trim(), bash).status) ?? 1);
