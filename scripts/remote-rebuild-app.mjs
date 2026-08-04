#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const v = loadLocalValues();
const id = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS;
const args = ['-o', 'BatchMode=yes'];
if (id) args.push('-i', id);
const remote = [
  `cd ${JSON.stringify(repo)}`,
  'ls -la services/verifactuIssueService.js',
  'docker compose -f deploy/docker-compose.scaleway.yml --env-file .env build app',
  'docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d app',
  'sleep 8',
  'curl -sS -o /dev/null -w live:%{http_code}\\\\n http://127.0.0.1:3000/live || true',
  'docker ps --format "{{.Names}} {{.Status}}"',
  'docker logs deploy-app-1 --tail 30 2>&1 | tail -30',
].join(' && ');
args.push(`${v.DEPLOY_USER}@${v.DEPLOY_HOST}`, remote);
const r = spawnSync('ssh', args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
