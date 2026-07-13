#!/usr/bin/env node
import process from 'node:process';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const dist = values.DEPLOY_DIST_PATH || '/opt/vertial/Vertial/dist';
const identity = values.SSH_IDENTITY_FILE?.trim();

const bash = `set -e
DIST='${String(dist).replace(/'/g, `'\\''`)}'
echo "=== assets files ==="
ls -la "$DIST/assets" 2>/dev/null | head -25 || echo NO_ASSETS_DIR
echo
echo "=== test main js ==="
test -f "$DIST/assets/index-B8Z0LpFa.js" && echo FILE_EXISTS || echo FILE_MISSING
echo
echo "=== curl local asset via nginx ==="
curl -sI -H 'Host: vertialapp.com' http://127.0.0.1/assets/index-B8Z0LpFa.js | head -8
echo
echo "=== curl external ==="
curl -sI https://vertialapp.com/assets/index-B8Z0LpFa.js | head -8
`;

console.log('[check-assets] SSH', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
