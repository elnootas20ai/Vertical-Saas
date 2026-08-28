#!/usr/bin/env node
/** Solo lectura: comprueba si el backend desplegado tiene la ruta opening-hint. */
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

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
echo "== git HEAD del backend desplegado =="
git log -1 --format='%h %ci %s' 2>/dev/null || echo "(sin git)"
echo "== ruta opening-hint en el codigo desplegado =="
grep -n "opening-hint" routers/deliveryRouter.js controllers/deliveryController.js 2>/dev/null | head -5 || echo "NO EXISTE opening-hint en el backend desplegado"
echo "== proceso node (uptime) =="
pm2 list 2>/dev/null | head -20 || systemctl status vertial 2>/dev/null | head -10 || true
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
