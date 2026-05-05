#!/usr/bin/env node
/**
 * Build + subida de dist/ al VPS.
 * Config: deploy/local-values.env (gitignored)
 *
 * DEPLOY_USER o SSH_USER
 * DEPLOY_HOST o VPS_IP
 * DEPLOY_DIST_PATH (ej. /var/www/vertial/dist)
 *
 * Opcional: SSH_IDENTITY_FILE (ruta a clave privada)
 *
 * Las variables VITE_* en local-values.env se inyectan al proceso de build.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  REPO_ROOT,
  LOCAL_VALUES_PATH,
  loadLocalValues,
  mergedEnvForChild,
} from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(
    `No existe ${LOCAL_VALUES_PATH}\n` +
      'Copia deploy/local-values.template.env → deploy/local-values.env y rellena DEPLOY_*',
  );
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const remotePath = values.DEPLOY_DIST_PATH || values.DIST_PATH_ON_VPS || '/var/www/vertial/dist';

if (!user || !host) {
  console.error(
    'Faltan DEPLOY_USER y DEPLOY_HOST (o SSH_USER y VPS_IP) en deploy/local-values.env',
  );
  process.exit(1);
}

const buildEnv = mergedEnvForChild(process.env, values);

console.log('[deploy:frontend] npm run build (con vars desde deploy/local-values.env para VITE_*)');
const build = spawnSync('npm', ['run', 'build'], {
  cwd: REPO_ROOT,
  env: buildEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const distDir = resolve(REPO_ROOT, 'dist');
if (!existsSync(distDir)) {
  console.error('No se encontró dist/ tras el build.');
  process.exit(1);
}

const target = `${user}@${host}:${remotePath.replace(/\/+$/, '')}/`;

const identity = values.SSH_IDENTITY_FILE?.trim();

console.log('[deploy:frontend] Subiendo dist/ →', target);

const rsyncArgs = ['-avz', '--delete'];
if (identity) {
  rsyncArgs.push('-e', `ssh -i ${identity}`);
}
rsyncArgs.push('dist/', target);

let upload = spawnSync('rsync', rsyncArgs, {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});

if (upload.status === 0) {
  console.log('[deploy:frontend] Listo. Prueba: https://vertialapp.com/health');
  process.exit(0);
}

console.warn('[deploy:frontend] rsync no disponible o falló; probando scp...');

const scpArgs = [];
if (identity) {
  scpArgs.push('-i', identity);
}
scpArgs.push('-r', 'dist/.', target);
upload = spawnSync('scp', scpArgs, {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (upload.status !== 0) {
  console.error(
    '[deploy:frontend] Falló la subida. Instala rsync (Git Bash) o cliente OpenSSH (scp).',
  );
  process.exit(upload.status ?? 1);
}

console.warn(
  '[deploy:frontend] Subido con scp. Si algo “viejo” sigue en el servidor, borra archivos huérfanos en el VPS o usa rsync --delete.',
);
console.log('[deploy:frontend] Listo. Prueba: https://vertialapp.com/health');
process.exit(0);
