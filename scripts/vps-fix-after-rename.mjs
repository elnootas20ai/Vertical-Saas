#!/usr/bin/env node
/** Corrige nginx + reinicia servicios tras renombrar carpeta en VPS. */
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
const repo = '/opt/vertial/Vertial';

const remoteScript = `
set -e
NEW=${sq(repo)}
echo "[vps-fix] nginx: Vertical-Saas -> Vertial"
for f in /etc/nginx/sites-enabled/vertial /etc/nginx/sites-available/vertial; do
  if [ -f "$f" ]; then
    sed -i 's|/opt/vertial/Vertical-Saas|/opt/vertial/Vertial|g' "$f"
    echo "  $f → $(grep -E '^\s*root' "$f" | head -1)"
  fi
done
nginx -t
systemctl reload nginx
echo "[vps-fix] servicios en $NEW"
cd "$NEW"
export REPO_PATH="$NEW"
if [ -f scripts/server-fix-after-pull.sh ]; then
  bash scripts/server-fix-after-pull.sh
elif [ -f deploy/docker-compose.scaleway.yml ] && command -v docker >/dev/null 2>&1; then
  docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --build
fi
sleep 3
curl -sS -o /dev/null -w "[vps-fix] /live HTTP %{http_code}\\n" http://127.0.0.1:3000/live || true
curl -sI https://vertialapp.com 2>/dev/null | head -5 || true
echo "[vps-fix] Listo."
`;

const sshArgs = [];
if (values.SSH_IDENTITY_FILE?.trim()) {
  sshArgs.push('-i', values.SSH_IDENTITY_FILE.trim());
}
sshArgs.push('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', `${user}@${host}`, 'bash -s');

console.log('[vps-fix] SSH →', `${user}@${host}`);

const r = spawnSync('ssh', sshArgs, {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: remoteScript.replace(/\r/g, ''),
});

if (r.status !== 0) process.exit(r.status ?? 1);

function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
