#!/usr/bin/env node
/**
 * Alinea DEPLOY_DIST_PATH en deploy/local-values.env con la ruta que nginx sirve.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LOCAL_VALUES_PATH } from './deploy-env.mjs';

const NGINX_DIST = '/opt/vertial/Vertial/dist';
const REPO_ON_VPS = '/opt/vertial/Vertial';
const OLD_DIST = '/var/www/vertial/dist';
const OLD_REPO_SUFFIX = '/opt/vertial/Vertical-Saas';

if (!existsSync(LOCAL_VALUES_PATH)) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

let raw = readFileSync(LOCAL_VALUES_PATH, 'utf-8');
let changed = false;

if (!raw.includes(`DEPLOY_DIST_PATH=${NGINX_DIST}`)) {
  if (raw.includes(`DEPLOY_DIST_PATH=${OLD_DIST}`)) {
    raw = raw.replace(`DEPLOY_DIST_PATH=${OLD_DIST}`, `DEPLOY_DIST_PATH=${NGINX_DIST}`);
  } else if (/^DEPLOY_DIST_PATH=/m.test(raw)) {
    raw = raw.replace(/^DEPLOY_DIST_PATH=.*$/m, `DEPLOY_DIST_PATH=${NGINX_DIST}`);
  } else {
    raw += `\nDEPLOY_DIST_PATH=${NGINX_DIST}\n`;
  }
  changed = true;
}

if (!raw.includes(`REPO_PATH_ON_VPS=${REPO_ON_VPS}`)) {
  if (raw.includes(`REPO_PATH_ON_VPS=${OLD_REPO_SUFFIX}`)) {
    raw = raw.replace(`REPO_PATH_ON_VPS=${OLD_REPO_SUFFIX}`, `REPO_PATH_ON_VPS=${REPO_ON_VPS}`);
  } else if (/^REPO_PATH_ON_VPS=/m.test(raw)) {
    raw = raw.replace(/^REPO_PATH_ON_VPS=.*$/m, `REPO_PATH_ON_VPS=${REPO_ON_VPS}`);
  } else {
    raw += `\nREPO_PATH_ON_VPS=${REPO_ON_VPS}\n`;
  }
  changed = true;
}

if (!changed) {
  console.log('[fix-deploy-path] Ya apunta a', NGINX_DIST, 'y', REPO_ON_VPS);
  process.exit(0);
}

writeFileSync(LOCAL_VALUES_PATH, raw, 'utf-8');
console.log('[fix-deploy-path] Actualizado DEPLOY_DIST_PATH →', NGINX_DIST);
console.log('[fix-deploy-path] Actualizado REPO_PATH_ON_VPS →', REPO_ON_VPS);
