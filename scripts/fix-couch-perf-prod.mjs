#!/usr/bin/env node
/**
 * Aplica en el VPS: Couch solo localhost + log level warning.
 * No toca datos ni recrea la app salvo health check.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const values = loadLocalValues();
if (!values) {
  console.error('Falta deploy/local-values.env');
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim() || '/opt/vertial/Vertial';
const identity = values.SSH_IDENTITY_FILE?.trim();
const composeFile = 'deploy/docker-compose.scaleway.yml';
const logIni = readFileSync(join(root, 'deploy/couchdb-local.d/vertial-log.ini'), 'utf8');
const logIniB64 = Buffer.from(logIni, 'utf8').toString('base64');

const bash = `set -e
cd ${JSON.stringify(repo)}
echo "[fix-couch-perf] repo $(pwd)"

# 1) Compose: Couch solo localhost (app sigue por red Docker couchdb:5984)
if grep -q '"5984:5984"' ${JSON.stringify(composeFile)}; then
  sed -i 's/"5984:5984"/"127.0.0.1:5984:5984"/' ${JSON.stringify(composeFile)}
  echo "[fix-couch-perf] compose ports -> 127.0.0.1:5984"
else
  echo "[fix-couch-perf] compose ports ya en localhost"
fi

# 2) Log level warning dentro del volumen Couch (menos CPU/disco)
mkdir -p deploy/couchdb-local.d
echo ${JSON.stringify(logIniB64)} | base64 -d > deploy/couchdb-local.d/vertial-log.ini
CID=$(docker ps -q --filter name=couchdb | head -n1)
if [ -z "$CID" ]; then echo "ERROR: contenedor couchdb no encontrado"; exit 1; fi
docker cp deploy/couchdb-local.d/vertial-log.ini "$CID:/opt/couchdb/etc/local.d/vertial-log.ini"
echo "[fix-couch-perf] vertial-log.ini copiado al contenedor"

# 3) Recrear solo Couch (volumen de datos intacto)
docker compose -f ${JSON.stringify(composeFile)} --env-file .env up -d couchdb
echo "[fix-couch-perf] esperando healthy..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 15 16 17 18 19 20; do
  sleep 2
  H=$(docker inspect "$CID" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo unknown)
  echo "  couch health=$H"
  if [ "$H" = "healthy" ] || [ "$H" = "none" ]; then break; fi
done

# 4) App sigue viva
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/live || echo 000)
echo "[fix-couch-perf] app /live -> HTTP $CODE"
if [ "$CODE" != "200" ]; then echo "WARN: app no responde 200"; fi

echo "[fix-couch-perf] puerto publico couch:"
docker port $(docker ps -q --filter name=couchdb | head -n1) 5984 2>/dev/null || true

echo "[fix-couch-perf] latencia couch desde app"
docker exec deploy-app-1 node --input-type=module -e '
const base=(process.env.COUCHDB_URL||"http://couchdb:5984").replace(/\\/+$/,"");
const auth="Basic "+Buffer.from((process.env.COUCHDB_USER||"")+":"+(process.env.COUCHDB_PASSWORD||"")).toString("base64");
const t=Date.now();
const r=await fetch(base+"/_up",{headers:{Authorization:auth}});
console.log("couch_up_ms", Date.now()-t, "status", r.status, (await r.text()).slice(0,40));
' 2>/dev/null || true

echo "[fix-couch-perf] DONE"
`;

console.log('[fix-couch-perf] SSH', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
