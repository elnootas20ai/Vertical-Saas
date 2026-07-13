#!/usr/bin/env node
/**
 * Renombra /opt/vertial/Vertical-Saas → /opt/vertial/Vertial en el VPS
 * y alinea git remote + servicios.
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
const newRepo = '/opt/vertial/Vertial';
const oldRepo = '/opt/vertial/Vertical-Saas';
const composeFile = 'deploy/docker-compose.scaleway.yml';
const githubRemote = 'https://github.com/elnootas20ai/Vertial.git';

if (!user || !host) {
  console.error('Faltan DEPLOY_USER y DEPLOY_HOST en deploy/local-values.env');
  process.exit(1);
}

const remoteScript = `
set -e
OLD=${sq(oldRepo)}
NEW=${sq(newRepo)}
COMPOSE=${sq(composeFile)}
GITHUB=${sq(githubRemote)}

echo "[vps-rename] Estado actual:"
ls -la /opt/vertial/ 2>/dev/null || { echo "No existe /opt/vertial"; exit 1; }

if [ -d "$NEW" ] && [ ! -d "$OLD" ]; then
  echo "[vps-rename] Ya renombrado: $NEW existe y $OLD no."
elif [ -d "$OLD" ] && [ ! -d "$NEW" ]; then
  echo "[vps-rename] Renombrando $OLD → $NEW ..."
  pm2 stop all 2>/dev/null || true
  if [ -f "$OLD/$COMPOSE" ]; then
    (cd "$OLD" && docker compose -f "$COMPOSE" down 2>/dev/null) || true
  fi
  mv "$OLD" "$NEW"
  echo "[vps-rename] Carpeta renombrada."
elif [ -d "$OLD" ] && [ -d "$NEW" ]; then
  echo "[vps-rename] WARNING: existen ambas carpetas. Usando $NEW."
else
  echo "[vps-rename] ERROR: no se encontró $OLD ni $NEW"
  exit 1
fi

cd "$NEW"
echo "[vps-rename] git remote antes:"
git remote -v || true
git remote set-url origin "$GITHUB" 2>/dev/null || true
echo "[vps-rename] git remote después:"
git remote -v || true

echo "[vps-rename] Referencias Vertical-Saas en nginx:"
grep -r "Vertical-Saas" /etc/nginx/ 2>/dev/null | head -5 || echo "  (ninguna)"

echo "[vps-rename] Reiniciando servicios..."
if [ -f scripts/server-fix-after-pull.sh ]; then
  bash scripts/server-fix-after-pull.sh
elif [ -f "$COMPOSE" ] && command -v docker >/dev/null 2>&1; then
  docker compose -f "$COMPOSE" --env-file .env up -d --build
  pm2 restart all 2>/dev/null || true
else
  pm2 restart all 2>/dev/null || true
fi

echo "[vps-rename] Health checks:"
sleep 3
curl -sS -o /dev/null -w "/live → HTTP %{http_code}\\n" http://127.0.0.1:3000/live || true
curl -sI https://vertialapp.com 2>/dev/null | head -3 || true
echo "[vps-rename] Listo."
`;

const sshArgs = [];
if (values.SSH_IDENTITY_FILE?.trim()) {
  sshArgs.push('-i', values.SSH_IDENTITY_FILE.trim());
}
sshArgs.push('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', `${user}@${host}`, 'bash -s');

console.log('[vps-rename] SSH →', `${user}@${host}`);

const r = spawnSync('ssh', sshArgs, {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: remoteScript.replace(/\r/g, ''),
});

if (r.status !== 0) process.exit(r.status ?? 1);

function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
