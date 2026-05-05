#!/usr/bin/env node
/**
 * Por SSH: git pull + npm ci + pm2 restart en el VPS.
 * Config en deploy/local-values.env:
 *
 * DEPLOY_USER o SSH_USER
 * DEPLOY_HOST o VPS_IP
 * REPO_PATH_ON_VPS (cd aquí antes de git pull)
 * PM2_BACKEND_NAME
 *
 * Opcional: SSH_IDENTITY_FILE
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
const pm2Name = values.PM2_BACKEND_NAME?.trim();

if (!user || !host || !repo || !pm2Name) {
  console.error(
    'Faltan en deploy/local-values.env: DEPLOY_USER, DEPLOY_HOST, REPO_PATH_ON_VPS, PM2_BACKEND_NAME',
  );
  process.exit(1);
}

const remote = [
  `cd ${sq(repo)}`,
  `git pull`,
  `npm ci --omit=dev`,
  `pm2 restart ${sq(pm2Name)}`,
  `pm2 logs ${sq(pm2Name)} --lines 25 --nostream`,
].join(' && ');

const sshArgs = [];
if (values.SSH_IDENTITY_FILE?.trim()) {
  sshArgs.push('-i', values.SSH_IDENTITY_FILE.trim());
}
sshArgs.push(`${user}@${host}`, remote);

console.log('[deploy:backend] SSH →', `${user}@${host}`, repo);

const r = spawnSync('ssh', sshArgs, {
  stdio: 'inherit',
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log('[deploy:backend] Listo. Prueba: curl -sS https://vertialapp.com/health');

/** Comillas simples remotas (bash). */
function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
