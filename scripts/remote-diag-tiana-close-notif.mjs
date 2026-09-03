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
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diag-tiana-close-notif.mjs');
const scriptB64 = fs.readFileSync(scriptPath).toString('base64');

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${scriptB64}' | base64 -d > scripts/diag-tiana-close-notif.mjs
set -a
[ -f .env ] && . ./.env
set +a
export COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf "http://couchdb:5984/" >/dev/null 2>&1; then
  export COUCHDB_URL="http://couchdb:5984"
fi
node scripts/diag-tiana-close-notif.mjs
echo '--- LOGS ---'
# App container logs around close
(docker compose logs --since 30m app 2>/dev/null || docker logs --since 30m \$(docker ps --format '{{.Names}}' | grep -E 'app|api|vertial' | head -1) 2>/dev/null || true) \\
  | grep -E 'CEO_DAILY_DIGEST|TPV close notify|push|Cierre unificado|43c5fa0f' \\
  | tail -n 80 || true
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
