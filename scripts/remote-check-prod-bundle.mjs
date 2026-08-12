#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS;

const bash = `set -e
cd '${String(repo).replace(/'/g, `'\\''`)}'
echo '=== HEAD ==='
git rev-parse --short HEAD
git log -1 --pretty='%h %s %ci'
echo '=== dist index.html ==='
grep -oE 'assets/index-[A-Za-z0-9_-]+\\.js' dist/index.html | head -5
echo '=== dist mtimes ==='
ls -lt dist/index.html dist/sw.js 2>/dev/null
ls -lt dist/assets/index-*.js 2>/dev/null | head -6
echo '=== nginx site? ==='
curl -sI https://127.0.0.1/ 2>/dev/null | head -8 || true
curl -sI http://127.0.0.1/ 2>/dev/null | head -8 || true
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
