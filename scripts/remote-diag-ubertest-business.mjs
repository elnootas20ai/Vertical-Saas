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
async function find(db, selector) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/_find', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ selector, limit: 50 }),
  });
  const j = await r.json();
  return j.docs || [];
}
const email = 'ubertest@vertial.com';
const accounts = await find('accounts', { type: 'account', email });
console.log('ACCOUNTS', accounts.map(a => ({
  id: a._id,
  user_id: a.user_id,
  email: a.email,
  deletedAt: a.deletedAt || null,
  linkedBusinessId: a.linkedBusinessId || null,
  companyName: a.companyName || null,
  fullName: a.fullName || null,
})));
for (const a of accounts) {
  if (a.deletedAt) continue;
  const owned = await find('businesses', { type: 'business', owner_user_id: a.user_id });
  const memberOf = await find('businesses', { type: 'business', 'members.email': email });
  console.log('OWNED', owned.map(b => ({
    business_id: b.business_id,
    name: b.name,
    businessType: b.businessType,
    deletedAt: b.deletedAt || null,
  })));
  console.log('MEMBER_OF', memberOf.map(b => ({
    business_id: b.business_id,
    name: b.name,
    businessType: b.businessType,
    deletedAt: b.deletedAt || null,
    owner: b.owner_user_id,
  })));
  // web_config integrations uber
  const configs = await find('bbddsaas-web', { type: 'web_config', business_id: a.linkedBusinessId || '___none___' });
  // also by user patterns
  const allCfg = await find('bbddsaas-web', { type: 'web_config' });
  const related = allCfg.filter(c => String(c.business_id||'') === String(a.linkedBusinessId||'') || String(c.user_id||'') === String(a.user_id||''));
  console.log('WEB_CONFIGS', related.map(c => ({
    id: c._id,
    business_id: c.business_id,
    uberStore: c.integrations?.uber?.storeName || null,
    uberStoreId: c.integrations?.uber?.storeId || null,
    uberOauth: Boolean(c.integrations?.uber?.oauth),
  })));
}
// search modomio
const mods = await find('businesses', { type: 'business', name: { $regex: '(?i)modomio|tiana' } });
console.log('MODOMIO_LIKE', mods.filter(b => !b.deletedAt).slice(0, 10).map(b => ({
  business_id: b.business_id,
  name: b.name,
  owner: b.owner_user_id,
  type: b.businessType,
})));
NODE`;

const r = sshRunScript(user, host, identity, bash);
process.exit(r.status ?? (r.error ? 1 : 0));
