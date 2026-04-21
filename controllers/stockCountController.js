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
    let itemsToCount = catalogItems.filter(item => item.active);

    if (stockCount.countType === 'partial' && Array.isArray(stockCount.filterCategories) && stockCount.filterCategories.length > 0) {
      itemsToCount = itemsToCount.filter(item => stockCount.filterCategories.includes(item.stockCategory || 'other'));
    }

    const lines = itemsToCount.map(item => ({
      catalogItemId: item._id,
      catalogItemName: item.name || '',
      sku: item.sku || '',
      stockCategory: item.stockCategory || 'other',
      unit: item.unit || 'ud',
      costPrice: Number(item.costPrice || 0),
      theoreticalStock: Number(item.stockQuantity || 0),
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

    return res.json({ ok: true, stockCount: sanitizeStockCount({ ...doc, _rev: saved.rev }) });
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

    const db = getCatalogDbName();
    const doc = buildStockCountDocument(userId, {
      ...existing,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedBy: userId,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, stockCount: sanitizeStockCount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al completar inventario' });
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
