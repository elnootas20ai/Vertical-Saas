#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diag-pau-excel-vs-caja1.mjs');
const idArgs = identity ? ['-i', identity] : [];

const scp = spawnSync(
  'scp',
  [...idArgs, scriptPath, `${user}@${host}:${repo}/scripts/diag-pau-excel-vs-caja1.mjs`],
  { stdio: 'inherit' },
);
if (scp.status !== 0) {
  console.error('scp fallo', scp.error || scp.status);
  process.exit(1);
}

const run = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, `cd '${repo}' && node scripts/diag-pau-excel-vs-caja1.mjs`],
  { stdio: 'inherit' },
);
process.exit(run.status ?? (run.error ? 1 : 0));
