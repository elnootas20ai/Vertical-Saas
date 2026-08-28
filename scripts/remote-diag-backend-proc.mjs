#!/usr/bin/env node
/** Solo lectura: como corre el backend y desde cuando (para saber si cargo la ruta nueva). */
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

const bash = `set +e
echo "== docker containers =="
docker ps --format '{{.Names}} | {{.Image}} | up: {{.Status}}' 2>/dev/null || echo "(sin docker o sin permiso)"
echo "== procesos node =="
ps -eo pid,lstart,cmd | grep -E "node|pm2" | grep -v grep | head -10
echo "== dentro del contenedor backend (si existe): opening-hint =="
for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
  hit=$(docker exec "$c" sh -c 'grep -l "opening-hint" /app/routers/deliveryRouter.js /usr/src/app/routers/deliveryRouter.js 2>/dev/null' 2>/dev/null)
  if [ -n "$hit" ]; then echo "$c: TIENE opening-hint ($hit)"; fi
done
echo "== fecha del fichero desplegado =="
ls -la '${repo.replace(/'/g, `'\\''`)}/routers/deliveryRouter.js'
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
