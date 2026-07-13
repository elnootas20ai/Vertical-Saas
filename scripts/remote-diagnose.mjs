#!/usr/bin/env node
/**
 * Diagnóstico remoto por SSH (lee deploy/local-values.env).
 */
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

if (!user || !host) {
  console.error('Faltan DEPLOY_USER y DEPLOY_HOST en deploy/local-values.env');
  process.exit(1);
}

const bash = `set -e
DIST=${bashSq(dist)}
echo "=== ls \$DIST ==="
ls -la "$DIST" | head -n 35 || true
echo
echo "=== index.html ==="
test -f "$DIST/index.html" && echo OK || echo FALTA_index.html
echo
echo "=== nginx -t ==="
nginx -t 2>&1 || true
echo
echo "=== tail nginx error.log ==="
tail -n 80 /var/log/nginx/error.log 2>/dev/null || true
echo
echo "=== backend :3000 /health ==="
curl -sSI http://127.0.0.1:3000/health | head -n 18 || true
`;

console.log('[deploy:diagnose] SSH', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));

function bashSq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
