#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();
const scriptName = 'diag-supplier-invoice-email.mjs';
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), scriptName);
const idArgs = identity ? ['-i', identity] : [];

const scp = spawnSync(
  'scp',
  [...idArgs, scriptPath, `${user}@${host}:${repo}/scripts/${scriptName}`],
  { stdio: 'inherit' },
);
if (scp.status !== 0) process.exit(scp.status ?? 1);

const remoteCmd = `
cd '${repo}' && node scripts/${scriptName}
echo '===== CONTAINERS ====='
docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Status}}' 2>/dev/null | head -30
echo '===== LOGS SINV ====='
CID=$(docker ps -q --filter name=backend | head -1)
if [ -z "$CID" ]; then CID=$(docker ps -q --filter name=vertial | head -1); fi
if [ -n "$CID" ]; then
  docker logs --tail 2000 "$CID" 2>&1 | grep -E 'SINV_|supplier_invoice|IDLE|IMAP|imap|Engine idle|polling' | tail -120
else
  echo 'no docker backend container'
  ls -lt logs 2>/dev/null | head -5
  grep -E 'SINV_|IMAP|polling' logs/*.log 2>/dev/null | tail -80
fi
`.trim();

const logs = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=25', ...idArgs, `${user}@${host}`, remoteCmd],
  { stdio: 'inherit' },
);
process.exit(logs.status ?? 1);
