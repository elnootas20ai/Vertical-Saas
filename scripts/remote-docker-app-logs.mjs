#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { spawnSync } from 'node:child_process';

const v = loadLocalValues();
const id = v.SSH_IDENTITY_FILE?.trim();
const args = ['-o', 'BatchMode=yes'];
if (id) args.push('-i', id);
args.push(
  `${v.DEPLOY_USER}@${v.DEPLOY_HOST}`,
  'docker ps -a --format "table {{.Names}}\t{{.Status}}"; echo ---; docker logs deploy-app-1 --tail 100 2>&1',
);
spawnSync('ssh', args, { stdio: 'inherit', shell: true });
