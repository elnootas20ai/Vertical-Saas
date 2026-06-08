/**
 * Repara sesiones de caja TPV duplicadas o huérfanas.
 *
 * Por cada tienda (PDV):
 * - Deja como máximo UNA sesión abierta (la más reciente).
 * - Cierra el resto con nota de mantenimiento.
 * - Cierra sesiones abiertas de días anteriores.
 *
 * Uso:
 *   node scripts/repair-tpv-register-sessions.mjs
 *   node scripts/repair-tpv-register-sessions.mjs --apply
 *   node scripts/repair-tpv-register-sessions.mjs --apply --user-id=UUID
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
  getAllDocuments,
  putDocument,
  autoCloseTpvRegisterSessionDocument,
  calcTpvRegisterExpectedCash,
} = await import('../services/couchdb.js');

const today = new Date().toISOString().slice(0, 10);

function groupKey(session) {
  return `${session.user_id || ''}::${String(session.pointOfSaleId || '').trim() || '__no_pdv__'}`;
}

async function main() {
  const db = getDeliveryDbName();
  const docs = await getAllDocuments(req, db);
  let sessions = docs.filter((d) => d?.type === 'tpv_register_session' && !d?.deletedAt);
  if (TARGET_USER) {
    sessions = sessions.filter((s) => s.user_id === TARGET_USER);
  }

  const open = sessions.filter((s) => s.status === 'open');
  const byGroup = new Map();
  for (const s of open) {
    const key = groupKey(s);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(s);
  }

  const toClose = [];
  for (const [, group] of byGroup) {
    const sorted = [...group].sort((a, b) =>
      String(b.openedAt || '').localeCompare(String(a.openedAt || '')),
    );
    const keeper = sorted[0];
    for (const s of sorted.slice(1)) {
      toClose.push({
        session: s,
        reason: `Cierre automático: sesión duplicada (se mantiene ${keeper._id})`,
      });
    }
    const openDay = String(keeper.openedAt || '').slice(0, 10);
    if (openDay && openDay < today) {
      toClose.push({
        session: keeper,
        reason: `Cierre automático: jornada ${openDay} (hoy ${today})`,
      });
    }
  }

  console.log(`Sesiones abiertas: ${open.length}`);
  console.log(`A cerrar: ${toClose.length}`);
  for (const item of toClose) {
    const s = item.session;
    const expected = calcTpvRegisterExpectedCash(s);
    console.log(
      `  - ${s._id} | ${s.pointOfSaleName || '—'} | ${s.workerName || '—'} | abierta ${s.openedAt} | esperado ${expected.toFixed(2)}€`,
    );
    console.log(`    → ${item.reason}`);
  }

  if (!APPLY) {
    console.log('\nModo simulación. Ejecuta con --apply para aplicar cambios.');
    return;
  }

  let closed = 0;
  for (const item of toClose) {
    const closedDoc = autoCloseTpvRegisterSessionDocument(
      item.session.user_id,
      item.session,
      item.reason,
      'Mantenimiento',
    );
    await putDocument(req, db, closedDoc._id, closedDoc);
    closed += 1;
  }

  const remaining = (await getAllDocuments(req, db)).filter(
    (d) =>
      d?.type === 'tpv_register_session' &&
      !d?.deletedAt &&
      d.status === 'open' &&
      (!TARGET_USER || d.user_id === TARGET_USER),
  );
  console.log(`\nCerradas: ${closed}. Abiertas restantes: ${remaining.length}`);
  for (const s of remaining) {
    console.log(`  ✓ ${s.pointOfSaleName || s.pointOfSaleId} — ${s.openedAt}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
