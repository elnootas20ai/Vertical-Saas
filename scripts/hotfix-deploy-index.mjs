#!/usr/bin/env node
/** Sube index.js al VPS y reconstruye el contenedor app (hotfix sin git push). */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadLocalValues, REPO_ROOT } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) process.exit(1);

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const composeFile = values.COMPOSE_FILE?.trim() || 'deploy/docker-compose.scaleway.yml';
const composeService = values.COMPOSE_SERVICE?.trim() || 'app';

if (!user || !host || !repo) {
  console.error('Faltan DEPLOY_USER, DEPLOY_HOST o REPO_PATH_ON_VPS');
  process.exit(1);
}

const localIndex = resolve(REPO_ROOT, 'index.js');
const remoteIndex = `${user}@${host}:${repo}/index.js`;

const scpArgs = [];
if (identity) scpArgs.push('-i', identity);
scpArgs.push(localIndex, remoteIndex);

console.log('[hotfix] SCP index.js →', remoteIndex);
const scp = spawnSync('scp', scpArgs, { stdio: 'inherit' });
if (scp.status !== 0) process.exit(scp.status ?? 1);

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
docker compose -f '${composeFile.replace(/'/g, `'\\''`)}' --env-file .env build '${composeService.replace(/'/g, `'\\''`)}'
docker compose -f '${composeFile.replace(/'/g, `'\\''`)}' --env-file .env up -d --wait '${composeService.replace(/'/g, `'\\''`)}'
echo "[hotfix] health:"
curl -s http://127.0.0.1:3000/live
echo
`;

const sshArgs = ['-o', 'BatchMode=yes'];
if (identity) sshArgs.push('-i', identity);
sshArgs.push(`${user}@${host}`, 'bash -s');

console.log('[hotfix] Rebuild docker app on VPS...');
const ssh = spawnSync('ssh', sshArgs, { stdio: ['pipe', 'inherit', 'inherit'], input: bash });
process.exit(ssh.status ?? 1);
