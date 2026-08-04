/**
 * Reposición automática carnicería: bt_catalog bajo mínimo → draft purchase entry.
 */

import {
  ensureDatabase,
  getAllDocuments,
  putDocument,
  buildButcherPurchaseEntryDocument,
  listButcherPurchaseEntriesByUser,
} from './couchdb.js';
import { getButcherOpsDbName } from './butcherStockPipeline.js';
import { getButcherDbName } from './butcherShop.js';
import logger from './logger.js';

const TAG = 'BUTCHER_AUTO_REORDER';

export async function runButcherAutoReorderForUser(req, userId) {
  if (!userId) return { created: 0 };
  const opsDb = getButcherOpsDbName();
  await ensureDatabase(req, opsDb);
  const docs = await getAllDocuments(req, opsDb);
  const low = docs.filter((d) =>
    d
    && d.type === 'bt_catalog'
    && !d.deletedAt
    && d.user_id === userId
    && !d.bloqueado
    && Number(d.stockMinimo || 0) > 0
    && Number(d.stock || 0) <= Number(d.stockMinimo || 0),
  );

  if (!low.length) return { created: 0 };

  const entries = await listButcherPurchaseEntriesByUser(req, userId).catch(() => []);
  const existing = entries.filter((e) => e.status === 'draft');
  let created = 0;
  const butcherDb = getButcherDbName();
  await ensureDatabase(req, butcherDb);

  for (const p of low) {
    const already = existing.some((e) =>
      e.productId === p._id
      || String(e.productName || '').toLowerCase() === String(p.nombre || '').toLowerCase(),
    );
    if (already) continue;

    const need = Math.max(
      Number(p.stockMinimo || 0) * 2 - Number(p.stock || 0),
      Number(p.stockMinimo || 1),
    );
    const qty = Math.round(need * 1000) / 1000;
    const cost = Number(p.costePorKg || 0);
    const entry = buildButcherPurchaseEntryDocument(userId, {
      productId: p._id,
      productName: p.nombre,
      quantityReceived: qty,
      unit: 'kg',
      costPerUnit: cost,
      totalCost: Math.round(qty * cost * 100) / 100,
      status: 'draft',
      notes: 'Auto-reposición por stock bajo',
      entryDate: new Date().toISOString().slice(0, 10),
      source: 'auto_reorder',
    });
    await putDocument(req, butcherDb, entry._id, entry);
    created += 1;
  }

  if (created > 0) {
    logger.info({ tag: TAG, userId, created }, 'Drafts de compra auto creados');
  }
  return { created };
}
