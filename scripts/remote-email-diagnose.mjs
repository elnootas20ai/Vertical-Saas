#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
const user = values['DEPLOY_' + 'USER'] || values['SSH_' + 'USER'];
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
echo "=== Email config (masked) ==="
grep -E '^(EMAIL_|RESEND_|SMTP_|APP_URL)=' .env 2>/dev/null | sed -E 's/(PASSWORD|PASS|API_KEY)=.*/\\1=***MASKED***/' || echo "no .env"
echo
echo "=== Docker app logs: email/auth (last 100) ==="
docker logs deploy-app-1 2>&1 | grep -iE 'EMAIL|AUTH_REGISTER|AUTH_RESEND|verify|Resend|SMTP|urielarnau4' | tail -n 100 || true
echo
echo "=== Docker container env (email, masked) ==="
docker exec deploy-app-1 sh -c 'env | grep -E "^(EMAIL_|RESEND_|SMTP_|APP_URL|NODE_ENV)=" | sed -E "s/(PASSWORD|PASS|API_KEY)=.*/\\1=***MASKED***/"' 2>/dev/null || echo "docker exec failed"
echo
echo "=== All uriel* accounts ==="
NODE_ENV=production node scripts/delete-test-accounts.mjs --list 2>/dev/null | grep -i uriel || true
echo
echo "=== Test resend API (internal) ==="
curl -sS -X POST http://127.0.0.1:3000/api/auth/resend-verification -H 'Content-Type: application/json' -d '{"email":"urielarnau4@gmail.com"}' || true
echo
curl -sS -X POST http://127.0.0.1:3000/api/auth/resend-verification -H 'Content-Type: application/json' -d '{"email":"urielarnau4@admin.com"}' || true
echo
`;

console.log('[remote-email-diagnose] SSH ->', `${user}@${host}`);
const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
