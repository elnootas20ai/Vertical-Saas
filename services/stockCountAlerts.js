/**
 * Alertas de revisión de stock — trabajador cuenta, gerente/CEO recibe aviso.
 */

import { findAccountByUserId } from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import { buildPurchaseListFromStockCount } from './stockPurchaseListService.js';

async function resolveAccountDisplayName(req, userId) {
  if (!userId) return 'Trabajador';
  try {
    const acc = await findAccountByUserId(req, userId);
    const name = String(acc?.fullName || acc?.firstName || '').trim();
    if (name) return name;
    const email = String(acc?.email || '').trim();
    if (email) return email.split('@')[0];
  } catch {
    /* ignore */
  }
  return 'Trabajador';
}

function isWorkerActor(actorId, ownerUserId) {
  const actor = String(actorId || '').trim();
  const owner = String(ownerUserId || '').trim();
  if (!actor) return false;
  if (!owner) return true;
  return actor !== owner;
}

/** Aviso al gerente cuando un trabajador marca una línea (dedup = progreso). */
export async function notifyStockLineReviewed(req, account, stockCount, line) {
  const businessId = String(account?.linkedBusinessId || '').trim();
  const ownerUserId = String(account?.user_id || stockCount.user_id || '').trim();
  const actorId = String(line?.countedBy || '').trim();
  if (!businessId || !actorId || !isWorkerActor(actorId, ownerUserId)) return null;

  const lines = stockCount.lines || [];
  const reviewed = lines.filter((l) => l.countedStock !== null).length;
  const total = lines.length;
  const workerName = await resolveAccountDisplayName(req, actorId);
  const hasDiff = line.difference !== null && line.difference !== 0;

  return emitGlobalAlert({
    businessId,
    userId: ownerUserId,
    source: 'stock',
    ruleId: 'stock_count_worker_progress',
    category: 'stock_count_worker_progress',
    priority: hasDiff ? 'high' : 'medium',
    level: hasDiff ? 'warning' : 'info',
    title: 'Trabajador revisando stock',
    message: `${workerName} contó ${line.catalogItemName} (${reviewed}/${total} productos${hasDiff ? ', con diferencia' : ''}).`,
    entityId: stockCount._id,
    entityType: 'stock_count',
    route: '/saas/catalog?tab=stock',
    dedupKey: `stock-count-worker-${stockCount._id}`,
    metadata: {
      countId: stockCount._id,
      workerId: actorId,
      workerName,
      reviewed,
      total,
      lastItemId: line.catalogItemId,
      lastItemName: line.catalogItemName,
      lastDifference: line.difference,
    },
  });
}

/** Lista de compra sugerida tras cerrar revisión. */
export async function notifyStockPurchaseListReady(req, account, stockCount, catalogItems = []) {
  const businessId = String(account?.linkedBusinessId || '').trim();
  const ownerUserId = String(account?.user_id || stockCount.user_id || '').trim();
  if (!businessId) return null;

  const purchaseList = buildPurchaseListFromStockCount(stockCount, catalogItems);
  if (purchaseList.itemCount === 0) return null;

  const completedBy = String(stockCount.completedBy || '').trim();
  const closerName = completedBy
    ? await resolveAccountDisplayName(req, completedBy)
    : 'Equipo';

  return emitGlobalAlert({
    businessId,
    userId: ownerUserId,
    source: 'stock',
    ruleId: 'stock_purchase_list_ready',
    category: 'stock_purchase_list_ready',
    priority: 'high',
    level: 'alert',
    title: 'Lista de compra tras inventario',
    message: `${purchaseList.itemCount} producto(s) sugieren pedido tras "${stockCount.name}" (cerrada por ${closerName}). Valor est. ${purchaseList.totalEstimated.toFixed(2)} €.`,
    entityId: stockCount._id,
    entityType: 'stock_count',
    route: `/saas/catalog?tab=purchase-orders&fromCount=${encodeURIComponent(stockCount._id)}`,
    dedupKey: `stock-purchase-list-${stockCount._id}`,
    metadata: {
      countId: stockCount._id,
      itemCount: purchaseList.itemCount,
      totalEstimated: purchaseList.totalEstimated,
      supplierCount: purchaseList.supplierGroups.length,
      purchaseListReady: true,
    },
  });
}

/** Resumen al cerrar revisión. */
export async function notifyStockCountCompleted(req, account, stockCount) {
  const businessId = String(account?.linkedBusinessId || '').trim();
  const ownerUserId = String(account?.user_id || stockCount.user_id || '').trim();
  if (!businessId) return null;

  const lines = stockCount.lines || [];
  const withDiff = lines.filter((l) => l.difference !== null && l.difference !== 0);
  const completedBy = String(stockCount.completedBy || '').trim();
  const closerName = completedBy
    ? await resolveAccountDisplayName(req, completedBy)
    : 'Equipo';

  return emitGlobalAlert({
    businessId,
    userId: ownerUserId,
    source: 'stock',
    ruleId: 'stock_count_completed',
    category: 'stock_count_completed',
    priority: withDiff.length > 0 ? 'high' : 'medium',
    level: withDiff.length > 0 ? 'alert' : 'success',
    title: 'Revisión de stock cerrada',
    message: `"${stockCount.name}" cerrada por ${closerName}. ${lines.length} productos revisados${withDiff.length > 0 ? `, ${withDiff.length} con diferencia` : ', todo cuadró'}.`,
    entityId: stockCount._id,
    entityType: 'stock_count',
    route: '/saas/catalog?tab=stock',
    dedupKey: `stock-count-completed-${stockCount._id}`,
    metadata: {
      countId: stockCount._id,
      completedBy,
      closerName,
      discrepancyCount: withDiff.length,
      totalDifferenceValue: stockCount.totalDifferenceValue,
    },
  });
}
