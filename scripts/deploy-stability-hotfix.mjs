#!/usr/bin/env node
/**
 * Copia archivos de estabilidad al VPS y recrea el contenedor app.
 * No requiere git push — útil para hotfixes urgentes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const FILES = [
  'middleware/rateLimiter.js',
  'services/healthService.js',
  'services/sseService.js',
  'index.js',
  'deploy/docker-compose.scaleway.yml',
];

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim() || '/opt/vertial/Vertical-Saas';
const composeFile = values.COMPOSE_FILE?.trim() || 'deploy/docker-compose.scaleway.yml';
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host) process.exit(1);

console.log('[deploy:hotfix-stability]', `${user}@${host}`);

for (const rel of FILES) {
  const local = path.join(root, rel);
  if (!fs.existsSync(local)) {
    console.error('Falta archivo local:', rel);
    process.exit(1);
  }
  const b64 = fs.readFileSync(local).toString('base64');
  const remotePath = `${repo}/${rel}`.replace(/'/g, `'\\''`);
  const cmd = `mkdir -p "$(dirname '${remotePath}')" && echo '${b64}' | base64 -d > '${remotePath}' && echo OK ${rel}`;
  const args = ['-o', 'ConnectTimeout=25'];
  if (identity) args.push('-i', identity);
  args.push(`${user}@${host}`, cmd);
  const r = spawnSync('ssh', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const rebuild = `
set -e
cd '${repo.replace(/'/g, `'\\''`)}'
docker compose -f '${composeFile.replace(/'/g, `'\\''`)}' --env-file .env build app
docker compose -f '${composeFile.replace(/'/g, `'\\''`)}' --env-file .env up -d --wait app
echo "=== health ==="
curl -sS http://127.0.0.1:3000/api/health | head -c 400
echo
curl -sS http://127.0.0.1:3000/metrics | head -c 500
echo
`;

const args2 = ['-o', 'ConnectTimeout=25'];
if (identity) args2.push('-i', identity);
args2.push(`${user}@${host}`, rebuild);
const r2 = spawnSync('ssh', args2, { stdio: 'inherit' });
process.exit(r2.status ?? 1);
