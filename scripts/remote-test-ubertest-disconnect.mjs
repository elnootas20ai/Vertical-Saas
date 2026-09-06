#!/usr/bin/env node
/**
 * Login ubertest + POST disconnect + leer estado.
 * Uso: node scripts/remote-test-ubertest-disconnect.mjs
 */
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();
const email = 'ubertest@vertial.com';
const pass = process.env.UBER_TEST_PASSWORD || 'UberTestVertial2026!';
const bid = '34fad5b6-728b-4f6d-b2b3-b280190f574b';

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
const email = ${JSON.stringify(email)};
const pass = ${JSON.stringify(pass)};
const bid = ${JSON.stringify(bid)};
const base = 'https://vertialapp.com';

async function main() {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const loginBody = await login.json().catch(() => ({}));
  console.log('LOGIN', login.status, loginBody.ok, loginBody.error || loginBody.code || '');
  const token = loginBody.token || loginBody.accessToken || loginBody.jwt || '';
  if (!token) {
    console.log('LOGIN_BODY_KEYS', Object.keys(loginBody));
    process.exit(1);
  }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: 'Bearer ' + token,
  };
  const before = await fetch(base + '/api/web/integrations/' + encodeURIComponent(bid), { headers });
  const beforeJ = await before.json().catch(() => ({}));
  console.log('BEFORE', before.status, {
    oauth: beforeJ.integrations?.uber?.oauth,
    enabled: beforeJ.integrations?.uber?.enabled,
    storeName: beforeJ.integrations?.uber?.storeName,
  });

  const disc = await fetch(base + '/api/uber-eats/disconnect', {
    method: 'POST',
    headers,
    body: JSON.stringify({ businessId: bid }),
  });
  const discJ = await disc.json().catch(() => ({}));
  console.log('DISCONNECT', disc.status, {
    ok: discJ.ok,
    disconnected: discJ.disconnected,
    error: discJ.error,
    oauth: discJ.integrations?.uber?.oauth,
    enabled: discJ.integrations?.uber?.enabled,
  });

  const after = await fetch(base + '/api/web/integrations/' + encodeURIComponent(bid), { headers });
  const afterJ = await after.json().catch(() => ({}));
  console.log('AFTER', after.status, {
    oauth: afterJ.integrations?.uber?.oauth,
    enabled: afterJ.integrations?.uber?.enabled,
    storeName: afterJ.integrations?.uber?.storeName,
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? 1);
