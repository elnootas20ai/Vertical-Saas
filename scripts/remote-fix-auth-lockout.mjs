#!/usr/bin/env node
/**
 * Aplica env de auth/contacto en VPS + desbloquea cuentas con lock activo.
 */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const repo = String(v.REPO_PATH_ON_VPS || '').trim();
const identity = v.SSH_IDENTITY_FILE?.trim();

if (!user || !host || !repo) {
  console.error('Falta deploy/local-values.env');
  process.exit(1);
}

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
test -f .env

set_kv() {
  local k="$1"
  local val="$2"
  if grep -q "^$k=" .env 2>/dev/null; then
    sed -i "s|^$k=.*|$k=$val|" .env
  else
    echo "$k=$val" >> .env
  fi
}

set_kv EMAIL_REPLY_TO hola@vertialapp.com
set_kv PUBLIC_SUPPORT_EMAIL hola@vertialapp.com
set_kv DEFAULT_CONTACT_EMAIL hola@vertialapp.com
set_kv MAX_LOGIN_ATTEMPTS 12
set_kv LOCK_DURATION_MINUTES 2
set_kv LOGIN_RATE_LIMIT_MAX 40
set_kv RECOVER_RATE_LIMIT_MAX 20

echo "=== env relevante ==="
grep -E '^(EMAIL_REPLY_TO|PUBLIC_SUPPORT_EMAIL|DEFAULT_CONTACT_EMAIL|MAX_LOGIN_ATTEMPTS|LOCK_DURATION_MINUTES|LOGIN_RATE_LIMIT_MAX|RECOVER_RATE_LIMIT_MAX|ALERTS_ADMIN_EMAIL)=' .env | sort

docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --force-recreate app
sleep 12
curl -sS http://127.0.0.1:3000/health | head -c 180; echo

echo "=== unlock locked accounts ==="
docker exec deploy-app-1 node scripts/unlock-locked-accounts.mjs --apply
`;

console.log('[fix-auth-lockout] SSH ->', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
