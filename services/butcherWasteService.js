/**
 * Butcher Waste Service — Lógica de negocio para merma y pérdidas de carnicería.
 *
 * Gestiona: registro de merma, integración con stock y finanzas,
 * revisión/aprobación, reporting avanzado y alertas en tiempo real.
 */

import {
  getButcherDbName,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  getCatalogDbName,
  buildButcherWasteDocument,
  sanitizeButcherWaste,
  listButcherWasteByUser,
  listButcherBatchesByUser,
  buildFinanceDocument,
  getFinanceDbName,
} from './couchdb.js';
import { recordMovement } from './stockMovementService.js';
import { emitGlobalAlert, fakeReq } from './alertEmitter.js';
import logger from './logger.js';
import { v4 as uuidv4 } from 'uuid';

const TAG = 'BUTCHER_WASTE_SERVICE';

export const VALID_WASTE_TYPES = ['hueso', 'grasa', 'recortes', 'caducado', 'rotura', 'perdida_manual'];
export const WASTE_TYPE_LABELS = {
  hueso: 'Hueso', grasa: 'Grasa', recortes: 'Recortes',
  caducado: 'Caducado', rotura: 'Rotura', perdida_manual: 'Pérdida manual',
};
export const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

// ---------------------------------------------------------------------------
// registerWaste — Registrar merma con integración stock + finanzas + alertas
// ---------------------------------------------------------------------------

export async function registerWaste(req, userId, wasteData) {
  const catalogItemId = wasteData.catalogItemId || wasteData.productId || '';
  if (!catalogItemId && !wasteData.productName) throw new Error('productId, catalogItemId o productName es obligatorio');
  const wasteKg = Number(wasteData.wasteKg);
  if (!wasteKg || wasteKg <= 0) throw new Error('wasteKg debe ser mayor que 0');
  const wasteType = VALID_WASTE_TYPES.includes(wasteData.wasteType) ? wasteData.wasteType : 'perdida_manual';

  let catalogItem = null;
  if (catalogItemId) {
    try {
      catalogItem = await getDocument(req, getCatalogDbName(), catalogItemId);
      if (!catalogItem || catalogItem.type !== 'catalog_item') catalogItem = null;
    } catch { /* producto no en catálogo */ }

    if (!catalogItem) {
      try {
        catalogItem = await getDocument(req, getButcherDbName(), catalogItemId);
      } catch { /* tampoco en butcher DB */ }
    }
  }

  const costPrice = Number(wasteData.costPriceAtTime || catalogItem?.costPrice || 0);
  const estimatedCost = Math.round(wasteKg * costPrice * 100) / 100;
  const severity = estimatedCost > 50 ? 'high' : estimatedCost > 20 ? 'medium' : 'low';

  const enrichedData = {
    ...wasteData,
    wasteType,
    catalogItemId,
    catalogItemName: wasteData.catalogItemName || catalogItem?.name || wasteData.productName || '',
    productId: wasteData.productId || catalogItemId,
    productName: wasteData.productName || catalogItem?.name || '',
    estimatedCost,
    costPriceAtTime: costPrice,
    severity,
  };

  const doc = buildButcherWasteDocument(userId, enrichedData);
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  let saved = await putDocument(req, db, doc._id, doc);
  saved = { ...doc, _id: saved?.id || doc._id, _rev: saved?.rev || doc._rev };

  // Baja FEFO (bt_lote) si viene lotId / batchId de ops
  const opsLotId = String(wasteData.opsLotId || wasteData.lotId || '').trim()
    || (String(wasteData.batchId || '').startsWith('btl-') ? String(wasteData.batchId) : '');
  if (opsLotId) {
    try {
      const { applyLotWaste } = await import('./butcherStockPipeline.js');
      await applyLotWaste(req, userId, {
        lotId: opsLotId,
        wasteKg,
        markExpired: wasteType === 'caducado',
      });
    } catch (err) {
      logger.warn({ tag: TAG, err: err?.message, opsLotId }, 'Error aplicando merma FEFO bt_lote');
    }
  }

  // Movimiento de stock (salida por merma)
  let stockMovementId = '';
  if (catalogItem) {
    try {
      const movement = await recordMovement(req, userId, {
        catalogItemId,
        movementType: 'waste',
        quantity: wasteKg,
        unitCost: costPrice,
        reason: `Merma: ${WASTE_TYPE_LABELS[wasteType] || wasteType}`,
        notes: wasteData.notes || '',
        wasteRecordId: saved._id,
      });
      stockMovementId = movement?._id || '';
    } catch (err) {
      logger.warn({ tag: TAG, err: err?.message, wasteId: saved._id }, 'Error registrando movimiento de stock por merma');
    }
  }

  // Movimiento financiero (gasto por merma)
  let financeMovementId = '';
  if (estimatedCost > 0) {
    try {
      const finDb = getFinanceDbName();
      await ensureDatabase(req, finDb);
      const finDoc = buildFinanceDocument(userId, {
        type: 'pago',
        companyName: 'Merma interna',
        concept: `Merma: ${enrichedData.catalogItemName || enrichedData.productName} — ${wasteKg} kg`,
        category: 'merma',
        amountBase: estimatedCost,
        date: doc.date,
        payMethod: 'interno',
        status: 'paid',
        paidAt: new Date().toISOString(),
        source: 'butcher_waste',
        sourceRef: saved._id,
        notes: `Tipo: ${WASTE_TYPE_LABELS[wasteType] || wasteType}. ${wasteData.notes || ''}`.trim(),
      });
      const savedFin = await putDocument(req, finDb, finDoc);
      financeMovementId = savedFin?._id || '';
    } catch (err) {
      logger.warn({ tag: TAG, err: err?.message, wasteId: saved._id }, 'Error registrando movimiento financiero por merma');
    }
  }

  // Actualizar waste doc con IDs de movimientos vinculados
  if (stockMovementId || financeMovementId) {
    try {
      const updated = { ...saved, stockMovementId, financeMovementId, updatedAt: new Date().toISOString() };
      saved = await putDocument(req, db, updated);
    } catch (err) {
      logger.warn({ tag: TAG, err: err?.message }, 'Error actualizando waste doc con IDs de movimientos');
    }
  }

  // Evaluar alertas en tiempo real
  try {
    const allWaste = await listButcherWasteByUser(req, userId);
    const batches = await listButcherBatchesByUser(req, userId);
    await evaluateWasteAlerts(req, userId, saved, allWaste, batches);
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error evaluando alertas de merma');
  }

  return sanitizeButcherWaste(saved);
}

// ---------------------------------------------------------------------------
// reviewWaste — Revisar/aprobar/rechazar un registro de merma
// ---------------------------------------------------------------------------

export async function reviewWaste(req, userId, wasteId, reviewData) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);

  let existing;
  try {
    existing = await getDocument(req, db, wasteId);
  } catch {
    throw new Error('Registro de merma no encontrado');
  }
  if (!existing || existing.type !== 'butcher_waste') throw new Error('Registro de merma no encontrado');
  if (existing.user_id !== userId) throw new Error('No tiene permisos para revisar este registro');

  const reviewStatus = VALID_REVIEW_STATUSES.includes(reviewData.reviewStatus) ? reviewData.reviewStatus : existing.reviewStatus;
  const now = new Date().toISOString();
  const updated = {
    ...existing,
    reviewStatus,
    reviewedBy: String(reviewData.reviewedBy || userId),
    reviewedByName: String(reviewData.reviewedByName || ''),
    reviewNotes: String(reviewData.reviewNotes || ''),
    reviewedAt: now,
    updatedAt: now,
  };

  const saved = await putDocument(req, db, updated);
  return sanitizeButcherWaste(saved);
}

// ---------------------------------------------------------------------------
// getWasteSummary — Resumen de merma por periodo
// ---------------------------------------------------------------------------

export async function getWasteSummary(req, userId, dateFrom, dateTo) {
  const today = new Date().toISOString().slice(0, 10);
  const from = dateFrom || today;
  const to = dateTo || today;

  const records = await listButcherWasteByUser(req, userId, from, to);
  const batches = await listButcherBatchesByUser(req, userId);

  const totalRecords = records.length;
  const totalKg = records.reduce((sum, r) => sum + Number(r.wasteKg || 0), 0);
  const totalCost = records.reduce((sum, r) => sum + Number(r.estimatedCost || 0), 0);

  // Por tipo de merma
  const byWasteType = {};
  for (const r of records) {
    const t = r.wasteType || 'perdida_manual';
    if (!byWasteType[t]) byWasteType[t] = { wasteType: t, label: WASTE_TYPE_LABELS[t] || t, totalKg: 0, totalCost: 0, count: 0 };
    byWasteType[t].totalKg += Number(r.wasteKg || 0);
    byWasteType[t].totalCost += Number(r.estimatedCost || 0);
    byWasteType[t].count += 1;
  }

  // Por producto (top 10)
  const byProductMap = {};
  for (const r of records) {
    const key = r.catalogItemId || r.productId || 'unknown';
    if (!byProductMap[key]) byProductMap[key] = { productId: key, productName: r.catalogItemName || r.productName || '', totalKg: 0, totalCost: 0, count: 0 };
    byProductMap[key].totalKg += Number(r.wasteKg || 0);
    byProductMap[key].totalCost += Number(r.estimatedCost || 0);
    byProductMap[key].count += 1;
  }
  const byProduct = Object.values(byProductMap).sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);

  // Por trabajador
  const byWorkerMap = {};
  for (const r of records) {
    const key = r.registeredBy || 'unknown';
    if (!byWorkerMap[key]) byWorkerMap[key] = { workerId: key, workerName: r.registeredByName || '', totalKg: 0, totalCost: 0, count: 0 };
    byWorkerMap[key].totalKg += Number(r.wasteKg || 0);
    byWorkerMap[key].totalCost += Number(r.estimatedCost || 0);
    byWorkerMap[key].count += 1;
  }
  const byWorker = Object.values(byWorkerMap).sort((a, b) => b.totalCost - a.totalCost);

  // Tendencia diaria
  const dailyMap = {};
  for (const r of records) {
    const d = r.date || 'unknown';
    if (!dailyMap[d]) dailyMap[d] = { date: d, totalKg: 0, totalCost: 0, count: 0 };
    dailyMap[d].totalKg += Number(r.wasteKg || 0);
    dailyMap[d].totalCost += Number(r.estimatedCost || 0);
    dailyMap[d].count += 1;
  }
  const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Porcentaje de merma vs recepción
  const totalReceptionKg = batches.filter((b) => b.status === 'active').reduce((sum, b) => sum + Number(b.receptionWeightKg || 0), 0);
  const wastePct = totalReceptionKg > 0 ? Math.round((totalKg / totalReceptionKg) * 1000) / 10 : 0;

  return {
    dateFrom: from, dateTo: to,
    totalRecords,
    totalKg: Math.round(totalKg * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalReceptionKg: Math.round(totalReceptionKg * 100) / 100,
    wastePct,
    byWasteType: Object.values(byWasteType),
    byProduct,
    byWorker,
    dailyTrend,
  };
}

// ---------------------------------------------------------------------------
// getWasteRate — Tasa de merma para un producto específico
// ---------------------------------------------------------------------------

export async function getWasteRate(req, userId, catalogItemId, dateFrom, dateTo) {
  const today = new Date().toISOString().slice(0, 10);
  const from = dateFrom || today;
  const to = dateTo || today;

  const records = await listButcherWasteByUser(req, userId, from, to, { catalogItemId });
  const batches = await listButcherBatchesByUser(req, userId);

  const productBatches = batches.filter((b) => (b.productId === catalogItemId || b.catalogItemId === catalogItemId) && b.status === 'active');
  const totalWasteKg = records.reduce((sum, r) => sum + Number(r.wasteKg || 0), 0);
  const totalWasteCost = records.reduce((sum, r) => sum + Number(r.estimatedCost || 0), 0);
  const totalReceptionKg = productBatches.reduce((sum, b) => sum + Number(b.receptionWeightKg || 0), 0);
  const wasteRate = totalReceptionKg > 0 ? Math.round((totalWasteKg / totalReceptionKg) * 1000) / 10 : 0;

  return {
    catalogItemId, dateFrom: from, dateTo: to,
    totalWasteKg: Math.round(totalWasteKg * 100) / 100,
    totalWasteCost: Math.round(totalWasteCost * 100) / 100,
    totalReceptionKg: Math.round(totalReceptionKg * 100) / 100,
    wasteRate,
    recordCount: records.length,
    batchCount: productBatches.length,
  };
}

// ---------------------------------------------------------------------------
// getWasteReporting — Reporting avanzado con comparativa de periodos
// ---------------------------------------------------------------------------

export async function getWasteReporting(req, userId, period = 'month') {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let dateFrom, prevFrom, prevTo;

  if (period === 'day') {
    dateFrom = today;
    const prev = new Date(now); prev.setDate(prev.getDate() - 1);
    prevFrom = prevTo = prev.toISOString().slice(0, 10);
  } else if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    dateFrom = d.toISOString().slice(0, 10);
    const pEnd = new Date(d); pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd); pStart.setDate(pStart.getDate() - 6);
    prevFrom = pStart.toISOString().slice(0, 10);
    prevTo = pEnd.toISOString().slice(0, 10);
  } else if (period === 'quarter') {
    const d = new Date(now); d.setDate(d.getDate() - 89);
    dateFrom = d.toISOString().slice(0, 10);
    const pEnd = new Date(d); pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd); pStart.setDate(pStart.getDate() - 89);
    prevFrom = pStart.toISOString().slice(0, 10);
    prevTo = pEnd.toISOString().slice(0, 10);
  } else {
    const d = new Date(now); d.setDate(d.getDate() - 29);
    dateFrom = d.toISOString().slice(0, 10);
    const pEnd = new Date(d); pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd); pStart.setDate(pStart.getDate() - 29);
    prevFrom = pStart.toISOString().slice(0, 10);
    prevTo = pEnd.toISOString().slice(0, 10);
  }

  const [currentSummary, prevSummary] = await Promise.all([
    getWasteSummary(req, userId, dateFrom, today),
    getWasteSummary(req, userId, prevFrom, prevTo),
  ]);

  const kgChange = prevSummary.totalKg > 0
    ? Math.round(((currentSummary.totalKg - prevSummary.totalKg) / prevSummary.totalKg) * 1000) / 10 : 0;
  const costChange = prevSummary.totalCost > 0
    ? Math.round(((currentSummary.totalCost - prevSummary.totalCost) / prevSummary.totalCost) * 1000) / 10 : 0;

  return {
    period, dateFrom, dateTo: today,
    summary: {
      totalRecords: currentSummary.totalRecords,
      totalKg: currentSummary.totalKg,
      totalCost: currentSummary.totalCost,
      wastePct: currentSummary.wastePct,
    },
    dailyBreakdown: currentSummary.dailyTrend,
    topProducts: currentSummary.byProduct,
    byWorker: currentSummary.byWorker,
    byWasteType: currentSummary.byWasteType,
    trend: {
      previousPeriod: { dateFrom: prevFrom, dateTo: prevTo, totalKg: prevSummary.totalKg, totalCost: prevSummary.totalCost },
      kgChangePercent: kgChange,
      costChangePercent: costChange,
      direction: kgChange > 0 ? 'up' : kgChange < 0 ? 'down' : 'stable',
    },
  };
}

// ---------------------------------------------------------------------------
// evaluateWasteAlerts — Evaluar alertas en tiempo real tras registrar merma
// ---------------------------------------------------------------------------

export async function evaluateWasteAlerts(req, userId, wasteRecord, allWaste, batches) {
  const alerts = [];

  // 1. Merma de alto coste
  if (Number(wasteRecord.estimatedCost || 0) > 50) {
    try {
      const a = await emitGlobalAlert({
        businessId: wasteRecord.business_id || '',
        userId,
        source: 'carniceria',
        ruleId: 'butcher_waste_high',
        category: 'butcher_waste_high',
        dedupKey: `bwaste-high-${wasteRecord._id}`,
        level: 'alert',
        title: 'Merma de alto coste',
        message: `Registro de merma de ${Number(wasteRecord.wasteKg).toFixed(1)} kg con coste estimado de ${Number(wasteRecord.estimatedCost).toFixed(2)} €. Producto: ${wasteRecord.catalogItemName || wasteRecord.productName || 'N/A'}.`,
        entityId: wasteRecord._id,
        entityType: 'butcher_waste',
        route: '/saas/butcher-inventory',
        metadata: { wasteId: wasteRecord._id, estimatedCost: wasteRecord.estimatedCost, wasteKg: wasteRecord.wasteKg, productName: wasteRecord.catalogItemName || wasteRecord.productName },
        audience: ['manager'],
        tag: TAG,
      });
      if (a) alerts.push(a);
    } catch (err) {
      logger.warn({ tag: TAG, err: err?.message }, 'Error emitiendo alerta de merma alta');
    }
  }

  // 2. Merma repetida (mismo producto 3+ veces en 7 días)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const productId = wasteRecord.catalogItemId || wasteRecord.productId;
  if (productId) {
    const recentSameProduct = allWaste.filter(
      (r) => (r.catalogItemId === productId || r.productId === productId) && r.date >= sevenDaysAgo,
    );
    if (recentSameProduct.length >= 3) {
      try {
        const a = await emitGlobalAlert({
          businessId: wasteRecord.business_id || '',
          userId,
          source: 'carniceria',
          ruleId: 'butcher_waste_repeated',
          category: 'butcher_waste_repeated',
          dedupKey: `bwaste-repeated-${productId}-${sevenDaysAgo}`,
          level: 'warning',
          title: 'Merma repetida en producto',
          message: `El producto "${wasteRecord.catalogItemName || wasteRecord.productName || productId}" tiene ${recentSameProduct.length} registros de merma en los últimos 7 días. Revisar causa raíz.`,
          entityId: productId,
          entityType: 'butcher_waste',
          route: '/saas/butcher-inventory',
          metadata: { productId, occurrences: recentSameProduct.length, period: '7d' },
          audience: ['manager'],
          tag: TAG,
        });
        if (a) alerts.push(a);
      } catch (err) {
        logger.warn({ tag: TAG, err: err?.message }, 'Error emitiendo alerta de merma repetida');
      }
    }
  }

  // 3. Producto caducado
  if (wasteRecord.wasteType === 'caducado') {
    try {
      const a = await emitGlobalAlert({
        businessId: wasteRecord.business_id || '',
        userId,
        source: 'carniceria',
        ruleId: 'butcher_waste_expired_product',
        category: 'butcher_waste_expired_product',
        dedupKey: `bwaste-expired-${wasteRecord._id}`,
        level: 'alert',
        title: 'Producto caducado desechado',
        message: `Se ha registrado merma por caducidad: ${Number(wasteRecord.wasteKg).toFixed(1)} kg de "${wasteRecord.catalogItemName || wasteRecord.productName || 'N/A'}". Coste: ${Number(wasteRecord.estimatedCost).toFixed(2)} €.`,
        entityId: wasteRecord._id,
        entityType: 'butcher_waste',
        route: '/saas/butcher-traceability',
        metadata: { wasteId: wasteRecord._id, productName: wasteRecord.catalogItemName || wasteRecord.productName, wasteKg: wasteRecord.wasteKg, estimatedCost: wasteRecord.estimatedCost },
        audience: ['manager'],
        tag: TAG,
      });
      if (a) alerts.push(a);
    } catch (err) {
      logger.warn({ tag: TAG, err: err?.message }, 'Error emitiendo alerta de producto caducado');
    }
  }

  // 4. Pérdida de lote (>15% de merma sobre peso de recepción)
  if (wasteRecord.batchId && batches) {
    const batch = batches.find((b) => b._id === wasteRecord.batchId || b.batchNumber === wasteRecord.batchId);
    if (batch && Number(batch.receptionWeightKg || 0) > 0) {
      const batchWaste = allWaste
        .filter((r) => r.batchId === wasteRecord.batchId)
        .reduce((sum, r) => sum + Number(r.wasteKg || 0), 0);
      const batchLossPct = (batchWaste / Number(batch.receptionWeightKg)) * 100;

      if (batchLossPct > 15) {
        try {
          const a = await emitGlobalAlert({
            businessId: wasteRecord.business_id || '',
            userId,
            source: 'carniceria',
            ruleId: 'butcher_waste_batch_loss',
            category: 'butcher_waste_batch_loss',
            dedupKey: `bwaste-batchloss-${wasteRecord.batchId}`,
            level: 'alert',
            title: 'Pérdida elevada en lote',
            message: `Lote ${batch.batchNumber || wasteRecord.batchId}: merma acumulada de ${batchWaste.toFixed(1)} kg (${batchLossPct.toFixed(1)}% de recepción). Supera el umbral del 15%.`,
            entityId: wasteRecord.batchId,
            entityType: 'butcher_batch',
            route: '/saas/butcher-traceability',
            metadata: { batchId: wasteRecord.batchId, batchNumber: batch.batchNumber, totalWasteKg: batchWaste, receptionKg: batch.receptionWeightKg, lossPct: Math.round(batchLossPct * 10) / 10 },
            audience: ['manager'],
            tag: TAG,
          });
          if (a) alerts.push(a);
        } catch (err) {
          logger.warn({ tag: TAG, err: err?.message }, 'Error emitiendo alerta de pérdida de lote');
        }
      }
    }
  }

  return alerts.filter(Boolean);
}
