#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error('No deploy/local-values.env');
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE?.trim();

const remoteScript = `
set +e
echo "=== nginx test ==="
nginx -t 2>&1

echo "=== dist listing ==="
ls -la /var/www/vertial/dist/ 2>/dev/null | head -20

echo "=== nginx dist (live) ==="
head -15 /opt/vertial/Vertical-Saas/dist/index.html 2>/dev/null || true
ls -la /opt/vertial/Vertical-Saas/dist/assets/index-*.js 2>/dev/null | tail -5

echo "=== assets js files ==="
ls -la /var/www/vertial/dist/assets/index-*.js 2>/dev/null

echo "=== nginx error tail ==="
tail -n 40 /var/log/nginx/error.log 2>/dev/null

echo "=== nginx access 5xx tail ==="
grep ' 5[0-9][0-9] ' /var/log/nginx/access.log 2>/dev/null | tail -n 20

echo "=== docker ps ==="
docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null

echo "=== deploy-app-1 logs ==="
docker logs --tail 120 deploy-app-1 2>&1

echo "=== deploy-app-1 restart info ==="
docker inspect deploy-app-1 --format 'restarts={{.RestartCount}} started={{.State.StartedAt}} status={{.State.Status}}' 2>&1

echo "=== health local ==="
curl -s http://127.0.0.1:3000/health 2>&1 | head -c 400
echo ""

echo "=== nginx sites ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null
head -80 /etc/nginx/sites-enabled/default 2>/dev/null || head -80 /etc/nginx/sites-enabled/vertial* 2>/dev/null || true
`;

const sshArgs = ['-o', 'BatchMode=yes'];
if (identity) sshArgs.push('-i', identity);
sshArgs.push(`${user}@${host}`, 'bash -s');

const r = spawnSync('ssh', sshArgs, {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: remoteScript,
});

process.exit(r.status ?? 0);
