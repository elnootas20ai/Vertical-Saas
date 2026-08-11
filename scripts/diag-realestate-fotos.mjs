#!/usr/bin/env node
/** Solo lectura: estado de fotos en propiedades inmobiliaria. */
import dotenv from 'dotenv';

dotenv.config();

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER;
const pass = process.env.COUCHDB_PASSWORD;
if (!user || !pass) {
  console.error('Faltan COUCHDB_USER / COUCHDB_PASSWORD');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const prefix = String(process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || 'vertial')
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, '');

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return res.json();
}

const allDbs = await couch('/_all_dbs');
const candidates = allDbs.filter((d) => /realestate|real-estate|inmob/i.test(d));
const expected = `${prefix}-realestate`;
console.log('PREFIX_ENV', process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || '(none)');
console.log('EXPECTED', expected);
console.log('CANDIDATE_DBS', candidates);
console.log('ALL_DB_SAMPLE', allDbs.filter((d) => /saas|vertial|bbdd/i.test(d)).slice(0, 40));

let dbName = candidates.find((d) => d === expected) || candidates.find((d) => d.includes('realestate')) || candidates[0] || '';
if (!dbName) {
  const prefixDbs = allDbs.filter((d) => d.startsWith(`${prefix}-`) || /saas|vertial/i.test(d));
  for (const d of prefixDbs) {
    try {
      const data = await couch(`/${encodeURIComponent(d)}/_all_docs?include_docs=true&limit=300`);
      const hit = (data.rows || []).some((r) => r.doc?.type === 're_property');
      if (hit) {
        dbName = d;
        console.log('FOUND_RE_PROPERTY_IN', d);
        break;
      }
    } catch {
      /* ignore */
    }
  }
}
if (!dbName) {
  console.log('NO_REALESTATE_DB');
  process.exit(0);
}
console.log('USING_DB', dbName);

const info = await couch(`/${encodeURIComponent(dbName)}`);
console.log('DB', dbName, 'docs≈', info.doc_count);

const data = await couch(`/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
const props = (data.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && d.type === 're_property' && !d.deletedAt);

let withFotos = 0;
let withAtt = 0;
let orphanRefs = 0;
let dataUrlFotos = 0;
let emptyFotos = 0;

for (const d of props) {
  const fotos = Array.isArray(d.fotos) ? d.fotos : [];
  const attKeys = Object.keys(d._attachments || {});
  if (!fotos.length) emptyFotos += 1;
  else withFotos += 1;
  if (attKeys.length) withAtt += 1;
  for (const f of fotos) {
    const s = String(f || '');
    if (/^data:image\//i.test(s)) {
      dataUrlFotos += 1;
      continue;
    }
    let name = s;
    if (s.startsWith('att:')) name = s.slice(4);
    else if (s.includes('/foto/')) name = decodeURIComponent(s.split('/foto/').pop().split('?')[0]);
    if (name && !attKeys.includes(name) && !/^data:/.test(s)) orphanRefs += 1;
  }
}

console.log(JSON.stringify({
  properties: props.length,
  withFotosField: withFotos,
  emptyFotosField: emptyFotos,
  withAttachments: withAtt,
  orphanAttRefs: orphanRefs,
  inlineDataUrlEntries: dataUrlFotos,
}, null, 2));

console.log('--- SAMPLE (max 12) ---');
for (const d of props.slice(0, 12)) {
  const fotos = Array.isArray(d.fotos) ? d.fotos : [];
  const attKeys = Object.keys(d._attachments || {});
  console.log(JSON.stringify({
    id: d._id,
    user_id: d.user_id,
    ref: d.referencia,
    dir: String(d.direccion || '').slice(0, 40),
    fotosCount: fotos.length,
    fotosSample: fotos.slice(0, 2).map((f) => {
      const s = String(f || '');
      if (s.startsWith('data:')) return `dataUrl(len=${s.length})`;
      return s.slice(0, 80);
    }),
    attKeys: attKeys.slice(0, 5),
    attCount: attKeys.length,
  }));
}
