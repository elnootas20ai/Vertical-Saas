#!/usr/bin/env node
/**
 * Sube el script al VPS y lo ejecuta dentro del contenedor app (Couch de prod).
 *
 * Uso:
 *   node scripts/remote-set-saas-admin-security.mjs
 *
 * Lee (en este orden): argv / env del proceso / defaults.
 * No imprime la contraseña.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = String(values.REPO_PATH_ON_VPS || '').trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const container = String(values.DEPLOY_APP_CONTAINER || 'deploy-app-1').trim();

const email = String(process.env.SAAS_LOGIN_EMAIL || process.argv[2] || 'uriel@admin.com')
  .trim()
  .toLowerCase();
const password = String(process.env.SAAS_LOGIN_PASSWORD || process.argv[3] || '').trim();
const otpEmail = String(
  process.env.ADMIN_LOGIN_OTP_EMAIL || process.argv[4] || 'elnootas2.0@gmail.com',
)
  .trim()
  .toLowerCase();

if (!password || password.length < 8) {
  console.error('Pasa SAAS_LOGIN_PASSWORD (env) o como 3er argumento.');
  process.exit(1);
}

const scriptName = 'set-saas-admin-security.mjs';
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), scriptName);
const b64 = fs.readFileSync(scriptPath).toString('base64');

const esc = (s) => String(s).replace(/'/g, `'\\''`);
const bash = `set -e
cd '${esc(repo)}'
mkdir -p scripts
echo '${b64}' | base64 -d > scripts/${scriptName}
# El contenedor no siempre monta el repo host → copiar dentro de /app
docker exec ${esc(container)} mkdir -p /app/scripts
docker cp scripts/${scriptName} ${esc(container)}:/app/scripts/${scriptName}
docker exec \\
  -e SAAS_LOGIN_EMAIL='${esc(email)}' \\
  -e SAAS_LOGIN_PASSWORD='${esc(password)}' \\
  -e ADMIN_LOGIN_OTP_EMAIL='${esc(otpEmail)}' \\
  ${esc(container)} node /app/scripts/${scriptName}
`;

console.log('[remote-admin-security]', email, 'otp→', otpEmail, '→', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
