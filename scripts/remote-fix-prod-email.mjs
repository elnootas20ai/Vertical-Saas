#!/usr/bin/env node
/**
 * Añade SMTP al .env del VPS, reinicia Docker, verifica cuenta y prueba envío.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const setEmailIdx = process.argv.indexOf('--set-email');
const newEmail = setEmailIdx >= 0 ? process.argv[setEmailIdx + 1] : '';

const lookupEmail = args[0] || 'urielarnau4@admin.com';
const testEmail = newEmail || lookupEmail;

const values = loadLocalValues();
const user = values['DEPLOY_' + 'USER'] || values['SSH_' + 'USER'];
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

const example = readFileSync(resolve(__dirname, '../.env.example'), 'utf8');
const smtpBlock = example
  .split('\n')
  .filter((line) => /^(EMAIL_PROVIDER|SMTP_|EMAIL_FROM|EMAIL_REPLY_TO)=/i.test(line.trim()))
  .map((l) => l.trim())
  .filter(Boolean)
  .join('\n');

const verifyScriptB64 = readFileSync(resolve(__dirname, 'verify-account-email.mjs')).toString('base64');
const lookupEsc = lookupEmail.replace(/'/g, `'\\''`);
const testEsc = testEmail.replace(/'/g, `'\\''`);
const setEmailArg = newEmail ? ` --set-email '${newEmail.replace(/'/g, `'\\''`)}'` : '';

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'

echo "${verifyScriptB64}" | base64 -d > scripts/verify-account-email.mjs

if ! grep -q '^EMAIL_PROVIDER=' .env 2>/dev/null; then
  printf '\\n# Email transaccional\\n%s\\n' '${smtpBlock.replace(/'/g, `'\\''`)}' >> .env
  echo "SMTP añadido al .env"
else
  echo "EMAIL_PROVIDER ya configurado"
fi

docker compose -f deploy/docker-compose.scaleway.yml --env-file .env up -d --force-recreate app
echo "Esperando arranque..."
sleep 12

docker exec deploy-app-1 sh -c 'env | grep -E "^(EMAIL_PROVIDER|SMTP_HOST|SMTP_user|EMAIL_FROM)="' || true

NODE_ENV=production COUCHDB_URL=127.0.0.1:5984 node scripts/verify-account-email.mjs '${lookupEsc}'${setEmailArg}

echo "=== Test email a ${testEsc} ==="
NODE_ENV=production node scripts/test-email.mjs '${testEsc}'

echo "=== Resend verificación ==="
curl -sS -X POST http://127.0.0.1:3000/api/auth/resend-verification -H 'Content-Type: application/json' -d '{"email":"${testEsc}"}'
echo
`;

console.log('[remote-fix-prod-email] SSH ->', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
