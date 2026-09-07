/**
 * Solo lectura: detalle login mati.vertial@gmail.com
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const EMAIL = 'mati.vertial@gmail.com';
const UID = '79e28923-5db1-498d-b340-6871232bf5e4';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const acc = await couch(`/accounts/account:${UID}`);
const keys = Object.keys(acc).filter((k) => !k.startsWith('_')).sort();
const sensitive = new Set(['passwordHash', 'password', 'password_hash', 'refreshTokens', 'sessions']);
const safe = {};
for (const k of keys) {
  if (sensitive.has(k)) {
    safe[k] = acc[k] ? `[present:${typeof acc[k]}]` : null;
    continue;
  }
  const v = acc[k];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    safe[k] = Object.fromEntries(
      Object.entries(v).slice(0, 40).map(([kk, vv]) => [
        kk,
        sensitive.has(kk) ? '[redacted]' : vv,
      ]),
    );
  } else if (Array.isArray(v) && v.length > 20) {
    safe[k] = `[array:${v.length}]`;
  } else {
    safe[k] = v;
  }
}
console.log('account_fields', JSON.stringify(safe, null, 2));

// businesses owned / member
const bizDbCandidates = ['bbddsaas-business', 'businesses', 'bbddsaas'];
const dbs = await couch('/_all_dbs');
const bizDbs = (dbs || []).filter((n) => /business|saas|account/i.test(n));
console.log('dbs_sample', bizDbs.slice(0, 40));

async function scanBiz(db) {
  try {
    const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`);
    if (data.error) return { db, error: data.error };
    const hits = [];
    for (const row of data.rows || []) {
      const d = row.doc;
      if (!d) continue;
      const owner = String(d.owner_user_id || d.ownerUserId || d.user_id || '').trim();
      const members = d.members || [];
      const isMember = members.some((m) => String(m.user_id || m.userId || '') === UID);
      if (owner === UID || isMember || String(d.business_id || '').includes(UID)) {
        hits.push({
          id: d._id,
          type: d.type,
          name: d.name,
          businessType: d.businessType,
          owner,
          deletedAt: d.deletedAt || null,
          memberCount: members.length,
        });
      }
    }
    return { db, hits };
  } catch (e) {
    return { db, error: String(e.message || e) };
  }
}

for (const db of ['bbddsaas-businesses', 'bbddsaas', 'accounts']) {
  // skip
}
const likely = (dbs || []).filter((n) => /business/i.test(n) || n.includes('bbddsaas'));
const results = [];
for (const db of likely.slice(0, 15)) {
  const r = await scanBiz(db);
  if (r.hits?.length || r.error) results.push(r);
}
console.log('business_hits', JSON.stringify(results, null, 2));

// find by email index-ish
const allAcc = await couch('/accounts/_all_docs?include_docs=true');
const sameEmail = (allAcc.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && String(d.email || '').toLowerCase() === EMAIL)
  .map((d) => ({ id: d._id, deleted: Boolean(d._deleted), emailVerified: d.emailVerified }));
console.log('same_email_docs', JSON.stringify(sameEmail, null, 2));
