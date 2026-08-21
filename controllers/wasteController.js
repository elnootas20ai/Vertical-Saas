import {
  getCatalogDbName,
  findAccountByUserId,
  ensureDatabase,
  getDocument,
  putDocument,
} from '../services/couchdb.js';
import {
  buildWasteRecordDocument,
  sanitizeWasteRecord,
  listWasteRecordsByUser,
} from '../services/wasteModel.js';
import { recordMovement } from '../services/stockMovementService.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function listWaste(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    let records = await listWasteRecordsByUser(req, userId);
    records = records.map(sanitizeWasteRecord);

    const { wasteType, catalogItemId, warehouseId, reviewStatus, severity, dateFrom, dateTo } = req.query;
    if (wasteType) records = records.filter(r => r.wasteType === wasteType);
    if (catalogItemId) records = records.filter(r => r.catalogItemId === catalogItemId);
    if (warehouseId) records = records.filter(r => r.warehouseId === warehouseId);
    if (reviewStatus) records = records.filter(r => r.reviewStatus === reviewStatus);
    if (severity) records = records.filter(r => r.severity === severity);
    if (dateFrom) records = records.filter(r => r.createdAt >= dateFrom);
    if (dateTo) records = records.filter(r => r.createdAt <= dateTo);

    return res.json({ ok: true, records });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar mermas' });
  }
}

export async function recordWaste(req, res) {
  try {
    const { userId } = req.params;
    const { waste } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!waste || typeof waste !== 'object') return badRequest(res, 'Falta el objeto waste en el body');
    if (!waste.catalogItemId) return badRequest(res, 'Falta catalogItemId');
    if (!waste.quantity || waste.quantity <= 0) return badRequest(res, 'La cantidad debe ser mayor que 0');
    if (!waste.wasteType) return badRequest(res, 'Falta el tipo de merma (wasteType)');
    if (!waste.notes?.trim()) return badRequest(res, 'Las notas son obligatorias para registrar merma');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const catItem = await getDocument(req, db, waste.catalogItemId);
    if (!catItem || catItem.type !== 'catalog_item') {
      return res.status(404).json({ ok: false, error: 'Articulo no encontrado' });
    }

    const estimatedCost = Math.round(Math.abs(waste.quantity) * Number(catItem.costPrice || 0) * 100) / 100;

    const doc = buildWasteRecordDocument(userId, {
      ...waste,
      catalogItemName: catItem.name || waste.catalogItemName || '',
      unit: waste.unit || catItem.unit || 'ud',
      estimatedCost,
    });
    const saved = await putDocument(req, db, doc._id, doc);

    await recordMovement(req, userId, {
      catalogItemId: waste.catalogItemId,
      movementType: 'waste',
      quantity: Math.abs(waste.quantity),
      warehouseId: waste.warehouseId || '',
      referenceId: doc._id,
      referenceType: 'waste_record',
      performedBy: waste.reportedBy || userId,
      unitCost: Number(catItem.costPrice || 0),
      wasteRecordId: doc._id,
      notes: `Merma: ${waste.wasteType} — ${waste.notes || ''}`,
    });

    try {
      const { notifyMermaRegisteredCeo } = await import('../services/mermaNotifications.js');
      const qty = Math.abs(Number(waste.quantity) || 0);
      const explicitBase = Number(
        waste.baseQuantity ?? waste.producedQuantity ?? waste.totalUnits ?? waste.baseQty,
      );
      const stockBase = Number(catItem.stockQuantity);
      const baseQuantity = Number.isFinite(explicitBase) && explicitBase > 0
        ? explicitBase
        : (Number.isFinite(stockBase) && stockBase > 0 ? stockBase : 0);

      await notifyMermaRegisteredCeo(req, {
        dataUserId: userId,
        businessId: waste.businessId || waste.business_id || '',
        wasteId: doc._id,
        productName: catItem.name || waste.catalogItemName || 'Producto',
        quantity: qty,
        unit: String(waste.unit || catItem.unit || 'ud'),
        baseQuantity,
        estimatedCost,
        wasteTypeLabel: String(waste.wasteType || ''),
        reportedByName: String(waste.reportedByName || ''),
        route: '/saas/catalog',
      });
    } catch {
      /* best-effort */
    }

    return res.status(201).json({ ok: true, record: sanitizeWasteRecord({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al registrar merma' });
  }
}

export async function reviewWaste(req, res) {
  try {
    const { userId, wasteId } = req.params;
    const { reviewStatus, reviewNotes, reviewedBy } = req.body || {};

    if (!userId || !wasteId) return badRequest(res, 'Falta userId o wasteId');
    if (!reviewStatus) return badRequest(res, 'Falta reviewStatus');

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const existing = await getDocument(req, db, wasteId);
    if (!existing || existing.type !== 'waste_record' || existing.user_id !== userId || existing.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Merma no encontrada' });
    }

    const doc = buildWasteRecordDocument(userId, {
      ...existing,
      reviewStatus,
      reviewNotes: reviewNotes || existing.reviewNotes,
      reviewedBy: reviewedBy || userId,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, record: sanitizeWasteRecord({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al revisar merma' });
  }
}

export async function getWasteSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    let records = await listWasteRecordsByUser(req, userId);
    records = records.map(sanitizeWasteRecord);

    const { dateFrom, dateTo } = req.query;
    if (dateFrom) records = records.filter(r => r.createdAt >= dateFrom);
    if (dateTo) records = records.filter(r => r.createdAt <= dateTo);

    const byType = {};
    const byItem = {};
    const byWarehouse = {};
    let totalCost = 0;
    let totalQuantity = 0;

    for (const r of records) {
      totalCost += r.estimatedCost;
      totalQuantity += r.quantity;

      byType[r.wasteType] = (byType[r.wasteType] || 0) + r.estimatedCost;

      if (!byItem[r.catalogItemId]) {
        byItem[r.catalogItemId] = { name: r.catalogItemName, totalCost: 0, totalQuantity: 0, count: 0 };
      }
      byItem[r.catalogItemId].totalCost += r.estimatedCost;
      byItem[r.catalogItemId].totalQuantity += r.quantity;
      byItem[r.catalogItemId].count++;

      if (r.warehouseId) {
        if (!byWarehouse[r.warehouseId]) {
          byWarehouse[r.warehouseId] = { name: r.warehouseName, totalCost: 0, count: 0 };
        }
        byWarehouse[r.warehouseId].totalCost += r.estimatedCost;
        byWarehouse[r.warehouseId].count++;
      }
    }

    const topItems = Object.entries(byItem)
      .map(([id, data]) => ({ catalogItemId: id, ...data }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    return res.json({
      ok: true,
      summary: {
        totalRecords: records.length,
        totalCost: Math.round(totalCost * 100) / 100,
        totalQuantity,
        byType,
        topItems,
        byWarehouse: Object.entries(byWarehouse).map(([id, data]) => ({ warehouseId: id, ...data })),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener resumen de mermas' });
  }
}

export async function getWasteRate(req, res) {
  try {
    const { userId, catalogItemId } = req.params;
    if (!userId || !catalogItemId) return badRequest(res, 'Falta userId o catalogItemId');

    let records = await listWasteRecordsByUser(req, userId);
    records = records.filter(r => r.catalogItemId === catalogItemId);

    const { dateFrom, dateTo } = req.query;
    if (dateFrom) records = records.filter(r => r.createdAt >= dateFrom);
    if (dateTo) records = records.filter(r => r.createdAt <= dateTo);

    const totalWaste = records.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const totalCost = records.reduce((sum, r) => sum + Number(r.estimatedCost || 0), 0);

    return res.json({
      ok: true,
      rate: {
        catalogItemId,
        totalWaste,
        totalCost: Math.round(totalCost * 100) / 100,
        recordCount: records.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al calcular tasa de merma' });
  }
}
