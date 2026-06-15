#!/usr/bin/env node
/**
 * Alinea DEPLOY_DIST_PATH en deploy/local-values.env con la ruta que nginx sirve.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LOCAL_VALUES_PATH } from './deploy-env.mjs';

const NGINX_DIST = '/opt/vertial/Vertical-Saas/dist';
const OLD_DIST = '/var/www/vertial/dist';

if (!existsSync(LOCAL_VALUES_PATH)) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

let raw = readFileSync(LOCAL_VALUES_PATH, 'utf-8');
if (raw.includes(`DEPLOY_DIST_PATH=${NGINX_DIST}`)) {
  console.log('[fix-deploy-path] Ya apunta a', NGINX_DIST);
  process.exit(0);
}

if (raw.includes(`DEPLOY_DIST_PATH=${OLD_DIST}`)) {
  raw = raw.replace(`DEPLOY_DIST_PATH=${OLD_DIST}`, `DEPLOY_DIST_PATH=${NGINX_DIST}`);
} else if (/^DEPLOY_DIST_PATH=/m.test(raw)) {
  raw = raw.replace(/^DEPLOY_DIST_PATH=.*$/m, `DEPLOY_DIST_PATH=${NGINX_DIST}`);
} else {
  raw += `\nDEPLOY_DIST_PATH=${NGINX_DIST}\n`;
}

writeFileSync(LOCAL_VALUES_PATH, raw, 'utf-8');
console.log('[fix-deploy-path] Actualizado DEPLOY_DIST_PATH →', NGINX_DIST);
