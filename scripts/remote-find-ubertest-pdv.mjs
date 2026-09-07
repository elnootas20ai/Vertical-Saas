#!/usr/bin/env node
import { loadLocalValues } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const v = loadLocalValues();
const user = v.DEPLOY_USER || v.SSH_USER;
const host = v.DEPLOY_HOST || v.VPS_IP;
const identity = v.SSH_IDENTITY_FILE?.trim();
const repo = v.REPO_PATH_ON_VPS?.trim();

const bash = `set -a; . ${repo}/.env; set +a
node <<'NODE'
const couch = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const auth = 'Basic ' + Buffer.from(process.env.COUCHDB_USER + ':' + process.env.COUCHDB_PASSWORD).toString('base64');
const ids = ['pdv-uber-test-34fad5b6', 'store-uber-test-34fad5b6', 'wc-uber-test-34fad5b6'];
const dbs = ['bbddsaas-sales-points', 'bbddsaas-delivery', 'bbddsaas'];
const out = { byId: [], find: [] };
for (const db of dbs) {
  for (const id of ids) {
    const r = await fetch(couch + '/' + db + '/' + encodeURIComponent(id), { headers: { Authorization: auth } });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 120) }; }
    out.byId.push({
      db, id, status: r.status,
      name: j.name || null,
      type: j.type || null,
      business_id: j.business_id || null,
      user_id: j.user_id || null,
    });
  }
}
const find = await fetch(couch + '/bbddsaas-sales-points/_find', {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    selector: { type: 'point_of_sale', user_id: '05ea1c8c-3cfd-4057-8629-1e44f703051f' },
    limit: 30,
  }),
});
const fj = await find.json();
out.find = (fj.docs || []).map((d) => ({
  id: d._id, name: d.name, business_id: d.business_id, user_id: d.user_id, active: d.active,
}));
console.log(JSON.stringify(out, null, 2));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
