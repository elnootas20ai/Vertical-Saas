#!/usr/bin/env node
/**
 * Limpieza admin: sesiones de caja de empresas borradas + PDV delivery duplicados.
 * Soft-delete only. No toca pedidos ni catálogo.
 *
 * En VPS: NODE_ENV=production node scripts/cleanup-stale-pdvs-sessions.mjs [--apply]
 */
import '../config/env.js';

const APPLY = process.argv.includes('--apply');
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const base = String(process.env.COUCHDB_URL || '').replace(/\/+$/, '');
const auth =
  'Basic ' +
  Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const prefix = String(process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || 'bbddsaas').toLowerCase();
const deliveryDb = `${prefix}-delivery`;

async function couch(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`);
  if (data.error) return [];
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function softDelete(db, doc, reason) {
  const now = new Date().toISOString();
  const next = {
    ...doc,
    deletedAt: now,
    updatedAt: now,
    cleanupReason: reason,
    cleanupAt: now,
  };
  if (doc.type === 'tpv_register_session' && doc.status === 'open') {
    next.status = 'closed';
    next.closedAt = now;
    next.closedReason = reason;
  }
  if (!APPLY) {
    console.log(`[dry] soft-delete ${doc.type} ${doc._id} (${doc.name || doc.status || ''}) — ${reason}`);
    return;
  }
  const put = await couch('PUT', `/${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`, next);
  if (put.error) throw new Error(`${doc._id}: ${put.reason || put.error}`);
  console.log(`✓ ${doc.type} ${doc._id}`);
}

function bid(d) {
  return String(d?.business_id || d?.businessId || '').trim();
}

function nameKey(d) {
  return String(d?.name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function main() {
  console.log(APPLY ? '=== APPLY cleanup ===' : '=== DRY RUN (pasa --apply para escribir) ===');

  const businesses = (await allDocs('businesses')).filter(
    (b) => b.type === 'business' && b.owner_user_id === ADMIN,
  );
  const deletedIds = new Set(
    businesses.filter((b) => b.deletedAt).map((b) => b.business_id).filter(Boolean),
  );
  console.log('empresas borradas:', [...deletedIds]);

  const docs = (await allDocs(deliveryDb)).filter((d) => d.user_id === ADMIN && !d.deletedAt);

  const sessions = docs.filter((d) => d.type === 'tpv_register_session');
  const staleSessions = sessions.filter((s) => deletedIds.has(bid(s)));
  console.log(`\nSesiones de empresa borrada: ${staleSessions.length}`);
  for (const s of staleSessions) {
    await softDelete(deliveryDb, s, 'empresa_borrada');
  }

  const pdvs = docs.filter((d) => d.type === 'point_of_sale');
  const groups = new Map();
  for (const p of pdvs) {
    const key = `${nameKey(p)}|${bid(p) || '?'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  let dupCount = 0;
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    // Conservar el más antiguo (createdAt); si empatan, el id más corto/estable
    const sorted = [...list].sort((a, b) => {
      const ca = String(a.createdAt || '');
      const cb = String(b.createdAt || '');
      if (ca && cb && ca !== cb) return ca.localeCompare(cb);
      return String(a._id).localeCompare(String(b._id));
    });
    const keep = sorted[0];
    const drop = sorted.slice(1);
    console.log(`\nDuplicados "${key}": keep ${keep._id}, drop ${drop.length}`);
    for (const p of drop) {
      dupCount += 1;
      await softDelete(deliveryDb, p, `pdv_duplicado_keep_${keep._id}`);
    }
  }

  console.log(`\nResumen: sesiones limpiadas=${staleSessions.length}, PDV dup soft-delete=${dupCount}`);
  if (!APPLY) console.log('Sin cambios. Ejecuta con --apply para aplicar.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
