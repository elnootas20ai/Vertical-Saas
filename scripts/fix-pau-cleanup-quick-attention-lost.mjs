#!/usr/bin/env node
/**
 * DISARMINK / Pau — limpiar fichas CRM basura de atención rápida SIN teléfono.
 *
 * Criterio ESTRICTO (todas deben cumplirse salvo nota):
 *  - tag `quick-attention` O `cliente-perdido` O stats.lostFromQuickAttention
 *  - teléfono vacío o < 9 dígitos
 *  - createdFrom === 'tpv' (si existe)
 *
 * NO toca clientes con teléfono completo ni fichas normales.
 *
 *   node scripts/fix-pau-cleanup-quick-attention-lost.mjs
 *   node scripts/fix-pau-cleanup-quick-attention-lost.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-clients';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MODOMIO = '33821959-ae50-4e52-bfea-ea2b145faeac';
const PAU_USER = '13e49ef6-183a-4afa-a17b-7730917fe685';
const APPLY = process.argv.includes('--apply');

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function phoneDigits(d) {
  return String(d.phone || '').replace(/\D/g, '');
}

function tagsOf(d) {
  return Array.isArray(d.tags) ? d.tags.map((t) => String(t || '').trim().toLowerCase()) : [];
}

function isQuickAttentionJunk(d) {
  if (!d || d.type !== 'client' || d.deletedAt) return false;
  const tags = tagsOf(d);
  const lostFlag = Boolean(d.stats?.lostFromQuickAttention);
  const tagged =
    tags.includes('quick-attention') ||
    tags.includes('cliente-perdido') ||
    lostFlag;
  if (!tagged) return false;

  const digits = phoneDigits(d);
  // Solo basura sin teléfono usable. Si tiene 9+ dígitos, NO tocar.
  if (digits.length >= 9) return false;

  // Preferir createdFrom tpv; si falta pero tiene tags claros de atención rápida, también.
  const from = String(d.stats?.createdFrom || '').toLowerCase();
  if (from && from !== 'tpv' && !lostFlag && !tags.includes('cliente-perdido')) {
    return false;
  }

  // Scope Pau: Disarmink, Modomio o user_id Pau
  const b = bid(d);
  const uid = String(d.user_id || '').trim();
  if (b && b !== DISARMINK && b !== MODOMIO && uid !== PAU_USER) return false;
  if (!b && uid !== PAU_USER) return false;

  return true;
}

const all = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=100000`);
const docs = (all.rows || []).map((r) => r.doc).filter(Boolean);
const junk = docs.filter(isQuickAttentionJunk);

console.log(APPLY ? '=== APPLY soft-delete ===' : '=== DRY (solo listar) ===');
console.log(`Candidatos: ${junk.length}`);
console.log('');

for (const d of junk.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))) {
  console.log({
    id: d._id,
    name: d.name,
    phone: d.phone || '',
    prefix: d.phonePrefix || '',
    tags: d.tags || [],
    createdFrom: d.stats?.createdFrom || null,
    lost: Boolean(d.stats?.lostFromQuickAttention),
    biz: bid(d).slice(0, 8) || '(sin)',
    createdAt: d.createdAt || null,
    notes: String(d.notes || '').slice(0, 80),
  });
}

if (!junk.length) {
  console.log('Nada que limpiar.');
  process.exit(0);
}

if (!APPLY) {
  console.log(`\nDry-run OK. Revisados ${junk.length}. Pasa --apply para soft-delete SOLO estos.`);
  process.exit(0);
}

const now = new Date().toISOString();
let n = 0;
for (const d of junk) {
  const saved = await couch('PUT', `/${DB}/${encodeURIComponent(d._id)}`, {
    ...d,
    deletedAt: now,
    status: 'inactive',
    active: false,
    updatedAt: now,
    notes: `${String(d.notes || '').trim()}\n[soft-delete ${now}] atención rápida sin teléfono (limpieza prod)`.trim(),
  });
  n += 1;
  console.log('deleted', d._id, d.name, saved.rev);
}
console.log(`\nHecho: ${n} fichas soft-delete.`);
