#!/usr/bin/env node
/**
 * Arreglo típico cuando Nginx da 500 en estáticos: permisos de dist/.
 * Ejecutar solo si confías en el servidor (root).
 */
import process from 'node:process';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const dist = values.DEPLOY_DIST_PATH || '/opt/vertial/Vertial/dist';
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host) {
  console.error('Faltan DEPLOY_USER y DEPLOY_HOST');
  process.exit(1);
}

const bash = `set -e
DIST=${bashSq(dist)}
echo "Ajustando permisos en \$DIST ..."
chown -R www-data:www-data "$DIST"
find "$DIST" -type d -exec chmod 755 {} \\;
find "$DIST" -type f -exec chmod 644 {} \\;
nginx -t
systemctl reload nginx
echo OK
`;

console.log('[deploy:fix-dist] SSH', `${user}@${host}`, '(chown www-data, chmod 755/644)');
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));

function bashSq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
