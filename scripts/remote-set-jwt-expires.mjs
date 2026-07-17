#!/usr/bin/env node
/**
 * Pone JWT_EXPIRES_IN=8h en el .env del VPS y recrea el contenedor app.
 * Uso: node scripts/remote-set-jwt-expires.mjs
 */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) process.exit(1);

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const composeFile = values.COMPOSE_FILE?.trim() || 'deploy/docker-compose.scaleway.yml';

if (!user || !host || !repo) {
  console.error('Faltan DEPLOY_USER, DEPLOY_HOST, REPO_PATH_ON_VPS en deploy/local-values.env');
  process.exit(1);
}

const bash = `
set -e
cd ${JSON.stringify(repo)}
test -f .env || { echo "Falta .env en $PWD"; exit 1; }

if grep -q '^JWT_EXPIRES_IN=' .env 2>/dev/null; then
  sed -i 's|^JWT_EXPIRES_IN=.*|JWT_EXPIRES_IN=8h|' .env
  echo "JWT_EXPIRES_IN actualizado a 8h"
else
  printf '\\n# Auth session (TPV)\\nJWT_EXPIRES_IN=8h\\n' >> .env
  echo "JWT_EXPIRES_IN=8h añadido al .env"
fi

grep '^JWT_EXPIRES_IN=' .env || true

echo "Recreando contenedor app con nuevo env..."
docker compose -f ${JSON.stringify(composeFile)} --env-file .env up -d --force-recreate app

echo "Esperando health..."
sleep 4
docker compose -f ${JSON.stringify(composeFile)} --env-file .env ps app || true
docker exec deploy-app-1 sh -c 'echo JWT_EXPIRES_IN=$JWT_EXPIRES_IN' 2>/dev/null || true
echo "OK"
`;

console.log(`[remote-set-jwt] ${user}@${host}:${repo}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? 1);
