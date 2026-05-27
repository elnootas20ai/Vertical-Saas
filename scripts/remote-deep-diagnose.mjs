#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) process.exit(1);

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS || '/opt/vertial/Vertical-Saas';
const identity = values.SSH_IDENTITY_FILE?.trim();

if (!user || !host) process.exit(1);

const bash = `set -e
REPO='${repo.replace(/'/g, "'\\''")}'
echo "=== MEM / DISK ==="
free -h
df -h / /var/lib/docker 2>/dev/null || df -h /
echo
echo "=== DOCKER PS ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
echo
APP_ID=$(docker ps -q --filter name=deploy-app 2>/dev/null | head -1)
if [ -z "$APP_ID" ]; then APP_ID=$(docker ps -q --filter name=app 2>/dev/null | head -1); fi
if [ -n "$APP_ID" ]; then
  echo "=== APP CONTAINER $APP_ID ==="
  docker inspect "$APP_ID" --format 'RestartCount={{.RestartCount}} OOMKilled={{.State.OOMKilled}} Status={{.State.Status}} Started={{.State.StartedAt}}'
  echo
  echo "=== APP LOGS (last 100) ==="
  docker logs "$APP_ID" --tail 100 2>&1
fi
echo
echo "=== OOM dmesg ==="
dmesg -T 2>/dev/null | grep -iE 'killed process|out of memory' | tail -20 || true
echo
echo "=== METRICS ==="
curl -sS http://127.0.0.1:3000/metrics 2>/dev/null | head -c 1500 || echo metrics_fail
echo
echo
echo "=== HEALTH ==="
curl -sS http://127.0.0.1:3000/health 2>/dev/null | head -c 800 || echo health_fail
echo
echo
echo "=== .env heap (grep only) ==="
grep -E 'NODE_MAX|NODE_OPTIONS|COUCHDB' "$REPO/.env" 2>/dev/null | sed 's/PASSWORD=.*/PASSWORD=***/' || echo no_env
`;

console.log('[deep-diagnose]', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? 1);
