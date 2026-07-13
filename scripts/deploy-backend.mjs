#!/usr/bin/env node
/**
 * Por SSH al VPS:
 *   git pull → docker compose build → docker compose up -d → health check.
 *
 * Detecta automáticamente el modo de despliegue:
 *   - DOCKER (recomendado): si existe deploy/docker-compose.scaleway.yml en el repo
 *     remoto, hace `docker compose up -d --build app`. Es el modo del servidor actual
 *     (Scaleway / 187.33.155.178). No usa pm2 ni npm en el host (suelen no estar
 *     instalados).
 *   - PM2 (legacy): si no encuentra docker compose, cae al flujo antiguo
 *     `npm ci + pm2 restart` por compatibilidad con despliegues tradicionales.
 *
 * Config en deploy/local-values.env:
 *   DEPLOY_USER  (alias: SSH_USER)
 *   DEPLOY_HOST  (alias: VPS_IP)
 *   REPO_PATH_ON_VPS   p.ej. /opt/vertial/Vertial
 *   COMPOSE_FILE       (opcional) ruta relativa al repo del compose; por defecto
 *                       deploy/docker-compose.scaleway.yml
 *   COMPOSE_SERVICE    (opcional) servicio a recrear; por defecto "app"
 *   PM2_BACKEND_NAME   (solo modo PM2)
 *   SSH_IDENTITY_FILE  (opcional)
 *
 * Variables opcionales que fuerzan modo:
 *   DEPLOY_MODE=docker  → fuerza docker compose
 *   DEPLOY_MODE=pm2     → fuerza pm2
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { LOCAL_VALUES_PATH, loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const composeFile = values.COMPOSE_FILE?.trim() || 'deploy/docker-compose.scaleway.yml';
const composeService = values.COMPOSE_SERVICE?.trim() || 'app';
const pm2Name = values.PM2_BACKEND_NAME?.trim();
const forcedMode = String(values.DEPLOY_MODE || '').trim().toLowerCase();

if (!user || !host || !repo) {
  console.error('Faltan en deploy/local-values.env: DEPLOY_USER, DEPLOY_HOST, REPO_PATH_ON_VPS');
  process.exit(1);
}

// Script bash remoto: detecta modo, hace pull, rebuild/restart y comprueba salud.
// Se pasa por stdin a `bash -s` para evitar problemas de escapado entre shells.
const remoteScript = `
set -e
cd ${sq(repo)}

echo "[deploy:backend] HEAD antes: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
echo "[deploy:backend] git fetch + reset --hard origin (servidor = repo remoto)"
git fetch origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git reset --hard "origin/$BRANCH"
echo "[deploy:backend] HEAD ahora: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

MODE="${forcedMode}"
if [ -z "$MODE" ]; then
  if command -v docker >/dev/null 2>&1 && [ -f ${sq(composeFile)} ]; then
    MODE=docker
  elif command -v pm2 >/dev/null 2>&1; then
    MODE=pm2
  else
    MODE=docker
  fi
fi
echo "[deploy:backend] modo: $MODE"

if [ "$MODE" = "docker" ]; then
  if [ ! -f .env ]; then
    echo "[deploy:backend] WARNING: no existe .env en ${repo}; docker compose puede no inyectar variables."
  fi
  docker compose -f ${sq(composeFile)} --env-file .env build ${sq(composeService)}
  docker compose -f ${sq(composeFile)} --env-file .env up -d --wait ${sq(composeService)}
  echo "[deploy:backend] docker ps:"
  docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}'
else
  npm ci --omit=dev
  pm2 restart ${sq(pm2Name || 'vertial-backend')}
  pm2 logs ${sq(pm2Name || 'vertial-backend')} --lines 25 --nostream
fi

echo "[deploy:backend] health:"
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/live || echo 000)
  echo "  intento $i → /live → HTTP $CODE"
  if [ "$CODE" = "200" ]; then break; fi
done

if [ -f .env ] && grep -qE '^SAAS_LOGIN_EMAIL=.+' .env && grep -qE '^SAAS_LOGIN_PASSWORD=.+' .env; then
  echo "[deploy:backend] smoke:saas (post-deploy)..."
  set -a && . ./.env && set +a
  export VERIFY_API_BASE="\${VERIFY_API_BASE:-http://127.0.0.1:3000}"
  if ! node scripts/smoke-saas.mjs; then
    echo "[deploy:backend] WARNING: smoke:saas falló — backend ya está live (/live OK). Revisa Couch/tiendas si hace falta."
  fi
else
  echo "[deploy:backend] smoke:saas omitido (SAAS_LOGIN_* no configurado en .env del VPS)"
fi
`;

const sshArgs = [];
if (values.SSH_IDENTITY_FILE?.trim()) {
  sshArgs.push('-i', values.SSH_IDENTITY_FILE.trim());
}
sshArgs.push('-o', 'BatchMode=yes', `${user}@${host}`, 'bash -s');

console.log('[deploy:backend] SSH →', `${user}@${host}`, repo);

const r = spawnSync('ssh', sshArgs, {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: remoteScript.replace(/\r/g, ''),
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log('[deploy:backend] Listo. Prueba: curl -sS https://vertialapp.com/health');

/** Comillas simples remotas (bash). */
function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
