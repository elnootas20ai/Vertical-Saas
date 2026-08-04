#!/usr/bin/env node
/** Emergencia: sube verifactuIssueService.js al VPS y recrea el contenedor app. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalValues, REPO_ROOT } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) process.exit(1);
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const local = resolve(REPO_ROOT, 'services/verifactuIssueService.js');
if (!existsSync(local)) {
  console.error('Falta services/verifactuIssueService.js en local');
  process.exit(1);
}

const remote = `${user}@${host}:${repo}/services/verifactuIssueService.js`;
const scpArgs = [];
if (identity) scpArgs.push('-i', identity);
scpArgs.push(local, remote);
console.log('[fix] scp →', remote);
let r = spawnSync('scp', scpArgs, { cwd: REPO_ROOT, stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
test -f services/verifactuIssueService.js
docker compose -f deploy/docker-compose.scaleway.yml --env-file .env build app
docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --wait app
curl -sS -o /dev/null -w 'live:%{http_code}\\n' http://127.0.0.1:3000/live || true
docker ps --format 'table {{.Names}}\t{{.Status}}'
`;
const sshArgs = ['-o', 'BatchMode=yes'];
if (identity) sshArgs.push('-i', identity);
sshArgs.push(`${user}@${host}`, bash);
r = spawnSync('ssh', sshArgs, { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
