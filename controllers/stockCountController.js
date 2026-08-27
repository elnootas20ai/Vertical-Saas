import {
  getCatalogDbName,
  listCatalogItemsByUser,
  findAccountByUserId,
  ensureDatabase,
  getDocument,
  putDocument,
} from '../services/couchdb.js';
import {
  buildStockCountDocument,
  sanitizeStockCount,
  listStockCountsByUser,
} from '../services/stockCountModel.js';
import { recordMovement } from '../services/stockMovementService.js';
import { emitGlobalAlert } from '../services/alertEmitter.js';
import { filterStockInventoryItems } from '../services/stockInventoryScope.js';
import {
  notifyStockLineReviewed,
  notifyStockCountCompleted,
  notifyStockPurchaseListReady,
} from '../services/stockCountAlerts.js';
import {
  buildPurchaseListFromStockCount,
  createPurchaseOrdersFromStockList,
} from '../services/stockPurchaseListService.js';
import { quantityForWarehouse } from '../shared/stock/warehouseStockQty.js';

async function applyCountAdjustments(req, userId, existing) {
  const lines = existing.lines || [];
  let adjustmentCount = 0;

  for (const line of lines) {
    if (line.difference === null || line.difference === 0) continue;

    const movementType = line.difference > 0 ? 'adjustment_in' : 'adjustment_out';
    await recordMovement(req, userId, {
      catalogItemId: line.catalogItemId,
      movementType,
      quantity: Math.abs(line.difference),
      warehouseId: existing.warehouseId || '',
      referenceId: existing._id,
      referenceType: 'stock_count',
      performedBy: userId,
      unitCost: line.costPrice || 0,
      notes: `Ajuste por inventario fisico "${existing.name}" — Diferencia: ${line.difference > 0 ? '+' : ''}${line.difference} ${line.unit}`,
    });
    adjustmentCount++;
  }

  return adjustmentCount;
}

async function notifyStockCountDiscrepancies(account, existing) {
  const businessId = String(account?.linkedBusinessId || '').trim();
  const userId = String(account?.user_id || existing.user_id || '').trim();
  const lines = existing.lines || [];
  const withDiff = lines.filter((l) => l.difference !== null && l.difference !== 0);
  if (withDiff.length === 0) return;

  const missingLines = withDiff.filter((l) => l.difference < 0);
  const surplusLines = withDiff.filter((l) => l.difference > 0);

  await emitGlobalAlert({
    businessId,
    userId,
    source: 'stock',
    ruleId: 'stock_inventory_discrepancy',
    category: 'stock_inventory_discrepancy',
    priority: missingLines.length > 0 ? 'high' : 'medium',
    level: missingLines.length > 0 ? 'alert' : 'warning',
    title: 'Inventario con diferencias',
    message: `"${existing.name}": ${withDiff.length} producto(s) con diferencia (${missingLines.length} faltan, ${surplusLines.length} sobran). Stock corregido.`,
    entityId: existing._id,
    entityType: 'stock_count',
    route: '/saas/catalog?tab=stock',
    dedupKey: `stock-count-summary-${existing._id}`,
    metadata: {
      countId: existing._id,
      warehouseName: existing.warehouseName || '',
      discrepancyCount: withDiff.length,
      missingCount: missingLines.length,
      totalDifferenceValue: existing.totalDifferenceValue,
    },
  });

  for (const line of missingLines) {
    const counted = Number(line.countedStock ?? 0);
    const minStock = Number(line.minStock ?? 0);
    if (counted <= 0) {
      await emitGlobalAlert({
        businessId,
        userId,
        source: 'stock',
        ruleId: 'out_of_stock',
        category: 'out_of_stock',
        priority: 'high',
        level: 'alert',
        title: 'Producto agotado tras inventario',
        message: `${line.catalogItemName}: contado 0 ${line.unit} (sistema tenía ${line.theoreticalStock}).`,
        entityId: line.catalogItemId,
        entityType: 'catalog_item',
        route: '/saas/catalog?tab=stock',
        dedupKey: `stock-count-oos-${existing._id}-${line.catalogItemId}`,
        metadata: { countId: existing._id, sku: line.sku, difference: line.difference },
      });
    } else if (minStock > 0 && counted <= minStock) {
      await emitGlobalAlert({
        businessId,
        userId,
        source: 'stock',
        ruleId: 'low_stock',
        category: 'low_stock',
        priority: 'high',
        level: 'warning',
        title: 'Stock bajo tras inventario',
        message: `${line.catalogItemName}: quedan ${counted} ${line.unit} (mínimo ${minStock}).`,
        entityId: line.catalogItemId,
        entityType: 'catalog_item',
        route: '/saas/catalog?tab=stock',
        dedupKey: `stock-count-low-${existing._id}-${line.catalogItemId}`,
        metadata: { countId: existing._id, sku: line.sku, countedStock: counted, minStock },
      });
    } else {
      await emitGlobalAlert({
        businessId,
        userId,
        source: 'stock',
        ruleId: 'stock_inventory_discrepancy',
        category: 'stock_inventory_discrepancy',
        priority: 'high',
        level: 'alert',
        title: 'Faltan unidades en inventario',
        message: `${line.catalogItemName}: sistema ${line.theoreticalStock} → contado ${counted} ${line.unit} (${line.difference} ${line.unit}).`,
        entityId: line.catalogItemId,
        entityType: 'catalog_item',
        route: '/saas/catalog?tab=stock',
        dedupKey: `stock-count-miss-${existing._id}-${line.catalogItemId}`,
        metadata: { countId: existing._id, sku: line.sku, difference: line.difference },
      });
    }
  }
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureCountOwner(req, userId, countId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, countId);
  if (!doc || doc.type !== 'stock_count' || doc.user_id !== userId || doc.deletedAt) return null;
  return doc;
}

export async function listStockCounts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const counts = await listStockCountsByUser(req, userId);
    return res.json({ ok: true, counts: counts.map(sanitizeStockCount) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al listar inventarios' });
  }
}

export async function createStockCount(req, res) {
  try {
    const { userId } = req.params;
    const { stockCount } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!stockCount || typeof stockCount !== 'object') return badRequest(res, 'Falta el objeto stockCount');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const catalogItems = await listCatalogItemsByUser(req, userId);
    const warehouseId = String(stockCount.warehouseId || '').trim();
    let itemsToCount = filterStockInventoryItems(catalogItems).filter(
      (item) => quantityForWarehouse(item, warehouseId) > 0,
    );

    if (stockCount.countType === 'partial' && Array.isArray(stockCount.filterCategories) && stockCount.filterCategories.length > 0) {
      itemsToCount = itemsToCount.filter(item => stockCount.filterCategories.includes(item.stockCategory || 'other'));
    }

    if (itemsToCount.length === 0) {
      return badRequest(res, 'No hay productos con stock cargado para revisar. Carga el stock inicial primero.');
    }

    const lines = itemsToCount.map(item => ({
      catalogItemId: item._id,
      catalogItemName: item.name || '',
      sku: item.sku || '',
      stockCategory: item.stockCategory || 'other',
      unit: item.unit || 'ud',
      costPrice: Number(item.costPrice || 0),
      minStock: Number(item.minStock || 0),
      theoreticalStock: quantityForWarehouse(item, warehouseId),
      countedStock: null,
      notes: '',
      countedBy: '',
      countedAt: null,
    }));

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const doc = buildStockCountDocument(userId, {
      ...stockCount,
      lines,
      status: 'draft',
      startedAt: new Date().toISOString(),
      startedBy: userId,
    });
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, stockCount: sanitizeStockCount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear inventario' });
  }
}

export async function getStockCount(req, res) {
  try {
    const { userId, countId } = req.params;
    if (!userId || !countId) return badRequest(res, 'Falta userId o countId');

    const existing = await ensureCountOwner(req, userId, countId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });

    return res.json({ ok: true, stockCount: sanitizeStockCount(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener inventario' });
  }
}

export async function updateCountLine(req, res) {
  try {
    const { userId, countId } = req.params;
    const lineIdx = Number(req.params.lineIdx);
    const { countedStock, notes, countedBy } = req.body || {};

    if (!userId || !countId) return badRequest(res, 'Falta userId o countId');
    if (isNaN(lineIdx) || lineIdx < 0) return badRequest(res, 'lineIdx invalido');
    if (countedStock === undefined || countedStock === null) return badRequest(res, 'Falta countedStock');

    const existing = await ensureCountOwner(req, userId, countId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return badRequest(res, 'No se puede modificar un inventario completado o cancelado');
    }

    const lines = [...(existing.lines || [])];
    if (lineIdx >= lines.length) return badRequest(res, 'Indice de linea fuera de rango');

    lines[lineIdx] = {
      ...lines[lineIdx],
      countedStock: Number(countedStock),
      notes: notes || lines[lineIdx].notes || '',
      countedBy: countedBy || userId,
      countedAt: new Date().toISOString(),
    };

    const newStatus = existing.status === 'draft' ? 'in_progress' : existing.status;
    const db = getCatalogDbName();
    const doc = buildStockCountDocument(userId, { ...existing, lines, status: newStatus }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeStockCount({ ...doc, _rev: saved.rev });

    const account = await findAccountByUserId(req, userId);
    if (account) {
      await notifyStockLineReviewed(req, account, sanitized, lines[lineIdx]).catch(() => null);
    }

    return res.json({ ok: true, stockCount: sanitized });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar linea' });
  }
}

export async function completeStockCount(req, res) {
  try {
    const { userId, countId } = req.params;
    if (!userId || !countId) return badRequest(res, 'Falta userId o countId');

    const existing = await ensureCountOwner(req, userId, countId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });
    if (existing.status === 'completed') return badRequest(res, 'El inventario ya esta completado');

    const lines = existing.lines || [];
    const pending = lines.filter((l) => l.countedStock === null || l.countedStock === undefined);
    if (pending.length > 0) {
      return badRequest(res, `Faltan ${pending.length} producto(s) por revisar antes de cerrar`);
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    let doc = buildStockCountDocument(userId, {
      ...existing,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedBy: userId,
    }, existing);

    let adjustmentCount = 0;
    if (!doc.adjustmentsGenerated) {
      adjustmentCount = await applyCountAdjustments(req, userId, doc);
      doc = buildStockCountDocument(userId, { ...doc, adjustmentsGenerated: true }, doc);
    }

    const saved = await putDocument(req, db, doc._id, doc);
    const sanitized = sanitizeStockCount({ ...doc, _rev: saved.rev });

    await notifyStockCountDiscrepancies(account, sanitized);
    await notifyStockCountCompleted(req, account, sanitized).catch(() => null);

    const catalogItems = filterStockInventoryItems(await listCatalogItemsByUser(req, userId));
    const purchaseList = buildPurchaseListFromStockCount(sanitized, catalogItems);
    await notifyStockPurchaseListReady(req, account, sanitized, catalogItems).catch(() => null);

    return res.json({
      ok: true,
      adjustmentsCreated: adjustmentCount,
      stockCount: sanitized,
      purchaseList,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al completar inventario' });
  }
}

export async function getStockCountPurchaseList(req, res) {
  try {
    const { userId, countId } = req.params;
    if (!userId || !countId) return badRequest(res, 'Falta userId o countId');

    const existing = await ensureCountOwner(req, userId, countId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });

    const catalogItems = filterStockInventoryItems(await listCatalogItemsByUser(req, userId));
    const purchaseList = buildPurchaseListFromStockCount(existing, catalogItems);

    return res.json({ ok: true, purchaseList });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al generar lista de compra' });
  }
}

export async function createPurchaseOrdersFromStockCount(req, res) {
  try {
    const { userId, countId } = req.params;
    if (!userId || !countId) return badRequest(res, 'Falta userId o countId');

    const existing = await ensureCountOwner(req, userId, countId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });

    const result = await createPurchaseOrdersFromStockList(req, userId, countId, existing);
    if (result.pending) {
      return res.status(501).json({ ok: false, pending: true, message: result.message, created: 0, orders: [] });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear pedidos' });
  }
}

export async function generateAdjustments(req, res) {
  try {
    const { userId, countId } = req.params;
    if (!userId || !countId) return badRequest(res, 'Falta userId o countId');

    const existing = await ensureCountOwner(req, userId, countId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Inventario no encontrado' });
    if (existing.status !== 'completed') return badRequest(res, 'El inventario debe estar completado');
    if (existing.adjustmentsGenerated) return badRequest(res, 'Los ajustes ya fueron generados');

    const adjustmentCount = await applyCountAdjustments(req, userId, existing);

    const db = getCatalogDbName();
    const doc = buildStockCountDocument(userId, {
      ...existing,
      adjustmentsGenerated: true,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({
      ok: true,
      adjustmentsCreated: adjustmentCount,
      stockCount: sanitizeStockCount({ ...doc, _rev: saved.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al generar ajustes' });
  }
}
