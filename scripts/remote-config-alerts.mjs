#!/usr/bin/env node
/**
 * Ajusta variables de alertas/correo en el .env del VPS (sin tocar SMTP_PASS).
 * Uso: node scripts/remote-config-alerts.mjs
 */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const ADMIN_EMAIL = 'elnootas2.0@gmail.com';

const values = loadLocalValues();
if (!values) process.exit(1);

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host || !repo) {
  console.error('Faltan DEPLOY_USER, DEPLOY_HOST, REPO_PATH_ON_VPS en deploy/local-values.env');
  process.exit(1);
}

const vars = {
  EMAIL_FROM_NAME: 'Vertial',
  EMAIL_REPLY_TO: ADMIN_EMAIL,
  ALERTS_ADMIN_EMAIL: ADMIN_EMAIL,
  BUG_REPORT_EMAIL: ADMIN_EMAIL,
  AFFILIATE_EMAIL: ADMIN_EMAIL,
  DEFAULT_CONTACT_EMAIL: 'hola@vertialapp.com',
  ALERTS_ADMIN_ENABLED: 'true',
  ALERT_RSS_MB: '1500',
  ALERT_HEAP_MB: '1100',
  ALERT_DISK_FREE_GB: '3',
  ALERT_5XX_THRESHOLD: '15',
  ALERT_BACKUP_MAX_AGE_HOURS: '26',
};

const setLines = Object.entries(vars)
  .map(([k, v]) => {
    const esc = String(v).replace(/'/g, `'\\''`);
    return `if grep -q '^${k}=' .env 2>/dev/null; then
  sed -i 's|^${k}=.*|${k}=${esc}|' .env
else
  echo '${k}=${esc}' >> .env
fi`;
  })
  .join('\n');

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
test -f .env || { echo "Falta .env en $PWD"; exit 1; }

if ! grep -q '^# --- Alertas Vertial ---' .env 2>/dev/null; then
  echo '' >> .env
  echo '# --- Alertas Vertial (remote-config-alerts) ---' >> .env
fi

${setLines}

echo "=== Variables alertas (sin secretos) ==="
grep -E '^(EMAIL_FROM_NAME|EMAIL_REPLY_TO|ALERTS_|BUG_|AFFILIATE_|DEFAULT_CONTACT|ALERT_RSS|ALERT_HEAP|ALERT_DISK|ALERT_5XX|ALERT_BACKUP)=' .env | sort

docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --force-recreate app
sleep 12
curl -sS http://127.0.0.1:3000/health | head -c 200; echo
echo "=== Test alerta admin (SMTP) ==="
docker exec deploy-app-1 node scripts/test-email.mjs '${ADMIN_EMAIL.replace(/'/g, `'\\''`)}'
`;

console.log('[remote-config-alerts] SSH ->', `${user}@${host}`, '→', ADMIN_EMAIL);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
