#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const apply = process.argv.includes('--apply');
const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const name = 'send-pol-affiliate-code-email.mjs';
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), name);
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');
const repo = values.REPO_PATH_ON_VPS?.trim();
const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/${name}
set -a; [ -f .env ] && . ./.env; set +a
export NODE_ENV=production
export COUCHDB_URL=\${COUCHDB_URL:-http://127.0.0.1:5984}
curl -sf http://couchdb:5984/ >/dev/null 2>&1 && export COUCHDB_URL=http://couchdb:5984
node scripts/${name} ${apply ? '--apply' : ''}
`;
console.log('[remote]', apply ? '(apply)' : '(dry-run)');
const r = sshRunScript(
  values.DEPLOY_USER || values.SSH_USER,
  values.DEPLOY_HOST || values.VPS_IP,
  values.SSH_IDENTITY_FILE?.trim(),
  bash,
);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? (r.error ? 1 : 0));
