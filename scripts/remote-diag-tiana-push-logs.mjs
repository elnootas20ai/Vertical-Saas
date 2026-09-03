#!/usr/bin/env node
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const values = loadLocalValues();
if (!values) {
  console.error(`No existe ${LOCAL_VALUES_PATH}`);
  process.exit(1);
}

const user = values.DEPLOY_USER || values.SSH_USER;
const host = values.DEPLOY_HOST || values.VPS_IP;
const repo = values.REPO_PATH_ON_VPS?.trim();
const identity = values.SSH_IDENTITY_FILE?.trim();

const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
echo '=== logs push/CEO around close ==='
(docker compose logs --since 45m app 2>/dev/null || true) \\
  | grep -E 'CEO_DAILY_DIGEST|sendPush|pushService|APNs|Expo|native-push|Push to|push_token|no device|no tokens' \\
  | tail -n 120

echo '=== push tokens Pau ==='
set -a; [ -f .env ] && . ./.env; set +a
export COUCHDB_URL="\${COUCHDB_URL:-http://127.0.0.1:5984}"
if curl -sf "http://couchdb:5984/" >/dev/null 2>&1; then export COUCHDB_URL="http://couchdb:5984"; fi
AUTH=$(python3 - <<'PY'
import os,base64
u=os.environ.get('COUCHDB_USER','vertialadmin')
p=os.environ.get('COUCHDB_PASSWORD','uriel12345')
print(base64.b64encode(f'{u}:{p}'.encode()).decode())
PY
)
# list dbs with push
curl -sf -H "Authorization: Basic $AUTH" "$COUCHDB_URL/_all_dbs" | head -c 2000; echo
for db in push_subscriptions push-subscriptions native_push device_tokens bbddsaas-push notifications accounts; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Basic $AUTH" "$COUCHDB_URL/$db")
  echo "db $db -> $code"
done
# find docs mentioning pau user
node - <<'NODE'
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(\`\${process.env.COUCHDB_USER || 'vertialadmin'}:\${process.env.COUCHDB_PASSWORD || 'uriel12345'}\`).toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
async function tryDb(db) {
  try {
    const res = await fetch(\`\${COUCH}/\${db}/_all_docs?include_docs=true&limit=5000\`, { headers: { Authorization: AUTH }});
    const data = await res.json();
    if (data.error) return;
    const hits = (data.rows||[]).map(r=>r.doc).filter(Boolean).filter(d => {
      const s = JSON.stringify(d);
      return s.includes(PAU) && /push|expo|apns|fcm|deviceToken|native/i.test(s);
    }).slice(0,8).map(d => ({
      id: d._id,
      keys: Object.keys(d).filter(k => /push|expo|token|device/i.test(k)),
      snippet: JSON.stringify(d).slice(0,300)
    }));
    if (hits.length) console.log(JSON.stringify({ db, hits }, null, 2));
  } catch {}
}
for (const db of ['accounts','push_subscriptions','notifications','users','bbddsaas']) await tryDb(db);
NODE
`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
