import '../config/env.js';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`;
const prefix = (process.env.VITE_COUCHDB_DB || 'vertial').toLowerCase();
const clockDb = `${prefix}-clockins`;

async function get(db) {
  const r = await fetch(`${BASE}/${db}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  return r.json();
}

const biz = await get('businesses');
const businesses = biz.rows.map((r) => r.doc).filter((d) => d?.type === 'business' && !d.deletedAt);
console.log('BUSINESSES:');
for (const b of businesses) {
  console.log(`- ${b.name} (${b.business_id})`);
  for (const m of b.members || []) {
    console.log(`    ${m.fullName || m.email || m.user_id} · ${m.role}`);
  }
  if (b.owner_user_id) console.log(`    owner: ${b.owner_user_id}`);
}

const clk = await get(clockDb);
const recs = clk.rows.map((r) => r.doc).filter((d) => d?.type === 'clockin' && !d.deletedAt);
console.log('\nCLOCKINS:', recs.length);
for (const r of recs.slice(0, 15)) {
  console.log(`  ${r.date} | ${r.member_name} | ${r.status} | ${r.totalMinutes}m | biz=${r.business_id?.slice(0, 8)}`);
}
