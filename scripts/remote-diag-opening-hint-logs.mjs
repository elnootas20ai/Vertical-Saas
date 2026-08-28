#!/usr/bin/env node
/** Solo lectura: peticiones recientes a opening-hint y tpv-sessions en logs de prod. */
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();

const bash = `set +e
echo "== nginx access: opening-hint (ultimas 30) =="
grep "opening-hint" /var/log/nginx/access.log 2>/dev/null | tail -30
echo "== nginx access: tpv-sessions GET (ultimas 20) =="
grep "GET /api/delivery/tpv-sessions" /var/log/nginx/access.log 2>/dev/null | tail -20
echo "== docker logs app: opening-hint (ultimas 20) =="
docker logs deploy-app-1 --since 4h 2>&1 | grep -i "opening-hint" | tail -20
echo "== docker logs app: errores recientes (ultimas 15) =="
docker logs deploy-app-1 --since 4h 2>&1 | grep -iE "error|401|403" | tail -15
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
