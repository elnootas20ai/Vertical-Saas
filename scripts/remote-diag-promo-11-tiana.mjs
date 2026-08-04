/**
 * Solo lectura: promo 11€ L-J y PDVs Badalona/Tiana (Pau / DISARMINK).
 */
import { spawnSync } from 'node:child_process';
import { loadLocalValues } from './deploy-env.mjs';

const values = loadLocalValues() || {};
const user = values.DEPLOY_USER || values.SSH_USER || 'root';
const host = values.DEPLOY_HOST || values.VPS_IP;
const identity = values.SSH_IDENTITY_FILE;

const remote = `
set -e
cd /opt/vertial/Vertial 2>/dev/null || cd /opt/vertial/Vertical-Saas 2>/dev/null || true
source .env 2>/dev/null || true
COUCH="\${COUCHDB_URL:-http://127.0.0.1:5984}"
# Dentro de docker compose a veces couch es hostname couchdb
if curl -sf "http://couchdb:5984/" >/dev/null 2>&1; then COUCH="http://couchdb:5984"; fi
AUTH="\${COUCHDB_USER}:\${COUCHDB_PASSWORD}"
DB_PROMO=\$(curl -s -u "\$AUTH" "\$COUCH/_all_dbs" | tr ',' '\\n' | tr -d '[]"' | grep -i promo | head -1)
DB_CAT=\$(curl -s -u "\$AUTH" "\$COUCH/_all_dbs" | tr ',' '\\n' | tr -d '[]"' | grep -E 'catalog|bbddsaas-catalog' | head -1)
DB_SP=\$(curl -s -u "\$AUTH" "\$COUCH/_all_dbs" | tr ',' '\\n' | tr -d '[]"' | grep -E 'sales-points|sales_points|bbddsaas-sales' | head -5)
echo "COUCH=\$COUCH"
echo "DB_PROMO=\$DB_PROMO"
echo "DBS_SP=\$DB_SP"
node <<'NODE'
const auth = process.env.AUTH;
const couch = process.env.COUCH;
async function allDocs(db) {
  const r = await fetch(couch + '/' + encodeURIComponent(db) + '/_all_docs?include_docs=true', {
    headers: { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') },
  });
  const j = await r.json();
  return (j.rows || []).map((x) => x.doc).filter(Boolean);
}
const dbs = await (await fetch(couch + '/_all_dbs', {
  headers: { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') },
})).json();
const promoDbs = dbs.filter((d) => /promo/i.test(d));
const spDbs = dbs.filter((d) => /sales-?point|pdv/i.test(d) || d === 'bbddsaas-sales-points' || d === 'urielsaas-sales-points' || d === 'vertial-sales-points');
console.log(JSON.stringify({ promoDbs, spDbs: spDbs.slice(0, 20) }, null, 2));
for (const db of promoDbs) {
  const docs = await allDocs(db);
  const promos = docs.filter((d) => d.type === 'promotion' && !d.deletedAt);
  const hit = promos.filter((p) =>
    /11/.test(String(p.fixedUnitPrice || p.discountValue || ''))
    || /11/.test(String(p.name || ''))
    || /lunes|jueves|l-j|lj|básic|basic|pizza/i.test(String(p.name || '') + String(p.description || ''))
  );
  console.log('---', db, 'promos', promos.length, 'hits', hit.length);
  for (const p of hit.length ? hit : promos.slice(0, 15)) {
    console.log(JSON.stringify({
      db,
      id: p._id,
      name: p.name,
      status: p.status,
      promoType: p.promoType || p.typeKey,
      fixedUnitPrice: p.fixedUnitPrice,
      discountValue: p.discountValue,
      weekdays: p.weekdays,
      applyMode: p.applyMode,
      salesPointIds: p.salesPointIds,
      excludeSalesPointIds: p.excludeSalesPointIds,
      businessId: p.businessId || p.business_id,
      user_id: p.user_id,
      productMatch: p.productMatch,
      startDate: p.startDate,
      endDate: p.endDate,
    }, null, 2));
  }
}
for (const db of spDbs) {
  const docs = await allDocs(db);
  const pdvs = docs.filter((d) => (d.type === 'point_of_sale' || d.type === 'sales_point' || d.pointOfSale) && !d.deletedAt);
  const named = docs.filter((d) => /tiana|badalona|modomio/i.test(String(d.name || d.pointOfSaleName || '')));
  if (named.length === 0) continue;
  console.log('--- PDV db', db, 'named', named.length);
  for (const d of named) {
    console.log(JSON.stringify({
      db,
      id: d._id,
      type: d.type,
      name: d.name,
      active: d.active,
      business_id: d.business_id || d.businessId,
      user_id: d.user_id,
      deletedAt: d.deletedAt || null,
    }));
  }
}
NODE
`.replace(/\$\{/g, '\\${');

# Fix: pass env via ssh
const script = `
export AUTH="$(grep -E '^COUCHDB_USER=' /opt/vertial/Vertial/.env 2>/dev/null | cut -d= -f2-):$(grep -E '^COUCHDB_PASSWORD=' /opt/vertial/Vertial/.env 2>/dev/null | cut -d= -f2-)"
# Prefer docker network
if docker exec deploy-couchdb-1 curl -sf http://127.0.0.1:5984/ >/dev/null 2>&1; then
  export COUCH=http://127.0.0.1:5984
  docker exec -e AUTH -e COUCH deploy-app-1 node -e '
const auth=process.env.AUTH; const couch="http://couchdb:5984";
async function allDocs(db){const r=await fetch(couch+"/"+encodeURIComponent(db)+"/_all_docs?include_docs=true",{headers:{Authorization:"Basic "+Buffer.from(auth).toString("base64")}});const j=await r.json();return (j.rows||[]).map(x=>x.doc).filter(Boolean);}
(async()=>{
const dbs=await (await fetch(couch+"/_all_dbs",{headers:{Authorization:"Basic "+Buffer.from(auth).toString("base64")}})).json();
const promoDbs=dbs.filter(d=>/promo/i.test(d));
const spDbs=dbs.filter(d=>/sales-?point/i.test(d)||/sales_points/i.test(d));
console.log(JSON.stringify({promoDbs,spDbs},null,2));
for (const db of promoDbs){
  const docs=await allDocs(db);
  const promos=docs.filter(d=>d.type==="promotion"&&!d.deletedAt);
  const hit=promos.filter(p=>/11/.test(String(p.fixedUnitPrice||p.discountValue||""))||/11|lunes|jueves|l-j|pizza|b[aá]sic/i.test(String(p.name||"")+" "+String(p.description||"")));
  console.log("---",db,"promos",promos.length,"hits",hit.length);
  for (const p of (hit.length?hit:promos)) {
    console.log(JSON.stringify({id:p._id,name:p.name,status:p.status,promoType:p.promoType||p.typeKey,fixedUnitPrice:p.fixedUnitPrice,discountValue:p.discountValue,weekdays:p.weekdays,applyMode:p.applyMode,salesPointIds:p.salesPointIds,excludeSalesPointIds:p.excludeSalesPointIds,user_id:p.user_id,productMatch:p.productMatch,startDate:p.startDate,endDate:p.endDate},null,2));
  }
}
for (const db of spDbs){
  const docs=await allDocs(db);
  const named=docs.filter(d=>/tiana|badalona|modomio/i.test(String(d.name||""))&&!d.deletedAt);
  if(!named.length) continue;
  console.log("---PDV",db,named.length);
  for (const d of named) console.log(JSON.stringify({id:d._id,type:d.type,name:d.name,active:d.active,business_id:d.business_id||d.businessId,user_id:d.user_id}));
}
})().catch(e=>{console.error(e);process.exit(1);});
'
else
  echo "no docker couch"
fi
`;

const args = ['-o', 'ConnectTimeout=20', `${user}@${host}`, script];
if (identity) args.unshift('-i', identity);
const r = spawnSync('ssh', args, { encoding: 'utf8', shell: false });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
