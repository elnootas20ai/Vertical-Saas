/**
 * Elimina (soft-delete) PDV huérfanos: sin centro o con centro ya borrado.
 * Son los que no aparecen en Ajustes → Tienda pero seguían en CouchDB.
 *
 * Uso:
 *   node scripts/prune-orphan-pdvs.mjs
 *   node scripts/prune-orphan-pdvs.mjs --apply
 *   node scripts/prune-orphan-pdvs.mjs --apply --user-id=UUID
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const APPLY = process.argv.includes('--apply');
const userIdArg = process.argv.find((a) => a.startsWith('--user-id='));
const TARGET_USER = userIdArg ? userIdArg.split('=')[1]?.trim() : '';

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const {
  getDeliveryDbName,
  listPointsOfSaleByUser,
  listActiveWorkCenterIds,
  findOrphanPointsOfSale,
  softDeleteDocument,
} = await import('../services/couchdb.js');

async function main() {
  const db = getDeliveryDbName();
  const workCenterIds = await listActiveWorkCenterIds(req);

  let pdvs = await listPointsOfSaleByUser(req, TARGET_USER || null);
  if (TARGET_USER) {
    pdvs = pdvs.filter((p) => p.user_id === TARGET_USER);
  }

  const orphans = findOrphanPointsOfSale(pdvs, workCenterIds);

  if (orphans.length === 0) {
    console.log('No hay PDV huérfanos.');
    return;
  }

  console.log(`${APPLY ? 'Eliminando' : 'Encontrados'} ${orphans.length} PDV huérfano(s):`);
  for (const p of orphans) {
    const wc = String(p.workCenterId || '').trim() || '—';
    console.log(
      `  - ${p._id} | ${p.name || 'sin nombre'} | código ${p.code || '—'} | workCenterId=${wc} | creado ${p.createdAt || '?'}`,
    );
  }

  if (!APPLY) {
    console.log('\nSimulación. Ejecuta con --apply para marcarlos como eliminados.');
    return;
  }

  for (const p of orphans) {
    await softDeleteDocument(req, db, p._id);
    console.log(`  ✓ eliminado ${p._id}`);
  }
  console.log('Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
