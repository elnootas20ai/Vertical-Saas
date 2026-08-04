#!/usr/bin/env node
/** Sube dist/ ya construido (sin rebuild ni smoke). */
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalValues, REPO_ROOT } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) process.exit(1);
const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const remotePath = (values.DEPLOY_DIST_PATH || '/var/www/vertial/dist').replace(/\/+$/, '');
const identity = values.SSH_IDENTITY_FILE?.trim();
const target = `${user}@${host}:${remotePath}/`;

const html = readFileSync(resolve(REPO_ROOT, 'dist/index.html'), 'utf8');
const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
if (!m) {
  console.error('No bundle en dist/index.html');
  process.exit(1);
}
const fileName = m[1];
const bytes = statSync(resolve(REPO_ROOT, 'dist/assets', fileName)).size;
if (bytes < 500_000) {
  console.error('Bundle demasiado pequeño');
  process.exit(1);
}
console.log(`[upload-dist] ${fileName} (${Math.round(bytes / 1024 / 1024)} MB) → ${target}`);

const rsyncArgs = ['-avz', '--delete'];
if (identity) rsyncArgs.push('-e', `ssh -i ${identity}`);
rsyncArgs.push('dist/', target);
let upload = spawnSync('rsync', rsyncArgs, { cwd: REPO_ROOT, stdio: 'inherit' });
if (upload.status !== 0) {
  console.warn('[upload-dist] rsync falló; scp...');
  const scpArgs = [];
  if (identity) scpArgs.push('-i', identity);
  scpArgs.push('-r', 'dist/.', target);
  upload = spawnSync('scp', scpArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
if (upload.status !== 0) process.exit(upload.status ?? 1);

const verify = `set -e
DIST='${remotePath.replace(/'/g, `'\\''`)}'
F="$DIST/assets/${fileName}"
test -f "$F"
echo "[verify] $(stat -c%s "$F" 2>/dev/null || stat -f%z "$F") bytes"
`;
const sshArgs = ['-o', 'BatchMode=yes'];
if (identity) sshArgs.push('-i', identity);
sshArgs.push(`${user}@${host}`, verify);
const v = spawnSync('ssh', sshArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
if (v.status !== 0) process.exit(v.status ?? 1);
console.log('[upload-dist] Listo');
