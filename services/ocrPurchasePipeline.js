/**
 * Post-procesado OCR compras: inventario + finanzas.
 */

import {
  buildFinanceDocument,
  ensureDatabase,
  getAllDocuments,
  getCatalogDbName,
  getDocument,
  getFinanceDbName,
  listCatalogItemsByUser,
  putDocument,
} from './couchdb.js';
import { enrichOcrLinesWithCatalog, summarizeCatalogMatches } from './ocrCatalogLineMatcher.js';
import { filterStockInventoryItems } from './stockInventoryScope.js';
import {
  applyPurchaseMovementCost,
  listMovementsByReference,
  recordMovement,
} from './stockMovementService.js';
import logger from './logger.js';
import { convertPurchaseLineToCatalogUnit } from './purchaseUnitService.js';

const fakeReq = { headers: {} };

export async function loadStockCatalogItems(userId, options = {}) {
  const items = await listCatalogItemsByUser(fakeReq, userId);
  const businessId = String(options.businessId || '').replace(/^business:/, '').trim();
  return filterStockInventoryItems(items).filter((item) => {
    if (!businessId) return true;
    const itemBusinessId = String(item.businessId || item.business_id || '')
      .replace(/^business:/, '').trim();
    return !itemBusinessId || itemBusinessId === businessId;
  });
}

export async function enrichOcrLinesForUser(rawLines, userId, supplierId = '', options = {}) {
  const catalogItems = await loadStockCatalogItems(userId, options);
  return enrichOcrLinesWithCatalog(rawLines, catalogItems, { supplierId });
}

function financeScopeFromInvoice(entity = {}) {
  return {
    businessId: String(entity.businessId || entity.business_id || '').trim(),
    businessName: String(entity.businessName || entity.business_name || '').trim(),
    workCenterId: String(entity.workCenterId || entity.costCenterId || '').trim(),
    workCenterName: String(entity.workCenterName || entity.costCenterName || '').trim(),
  };
}

export async function createFinancePagoFromPurchaseInvoice(req, userId, invoice, options = {}) {
  const financeDb = getFinanceDbName();
  await ensureDatabase(req, financeDb);
  const allMvs = await getAllDocuments(req, financeDb);
  const alreadyLinked = allMvs.find(
    (m) => !m.deletedAt && m.sourceRef === invoice._id && m.type === 'pago',
  );
  const invStatus = invoice.status || 'pending';
  const movementData = {
    type: 'pago',
    concept: `Factura ${invoice.invoiceNumber || invoice._id} — ${invoice.supplierName || ''}`.trim(),
    reference: invoice.invoiceNumber || '',
    category: 'compras_stock',
    amountBase: Number(invoice.subtotal || 0),
    taxRate: Number(invoice.taxRate || 21),
    taxAmount: Number(invoice.taxAmount || 0),
    totalAmount: Number(invoice.total || 0),
    date: invoice.date || new Date().toISOString().slice(0, 10),
    payMethod: invoice.payMethod || '',
    companyName: invoice.supplierName || '',
    notes: invoice.notes || '',
    status: invStatus === 'paid' ? 'paid' : 'pending',
    dueDate: invoice.dueDate || '',
    paidAt: invStatus === 'paid' ? (invoice.paidAt || new Date().toISOString()) : '',
    source: options.financeSource || 'ocr',
    sourceRef: invoice._id,
    entryMethod: options.entryMethod || invoice.entryMethod || 'ocr',
    linkedDocuments: [{
      id: invoice._id,
      type: 'purchase_invoice',
      name: invoice.invoiceNumber || invoice._id,
      url: '',
    }],
    ...financeScopeFromInvoice(invoice),
  };

  if (alreadyLinked) {
    const updated = buildFinanceDocument(userId, movementData, alreadyLinked);
    const saved = await putDocument(req, financeDb, updated._id, updated);
    return { movementId: updated._id, skipped: true, updated: true, rev: saved.rev };
  }

  const doc = buildFinanceDocument(userId, movementData);
  const saved = await putDocument(req, financeDb, doc._id, doc);
  return { movementId: doc._id, skipped: false, rev: saved.rev };
}

export async function createFinanceCobroFromClientInvoice(req, userId, invoice) {
  const financeDb = getFinanceDbName();
  await ensureDatabase(req, financeDb);
  const allMvs = await getAllDocuments(req, financeDb);
  const alreadyLinked = allMvs.find(
    (m) => !m.deletedAt && m.sourceRef === invoice._id && m.type === 'cobro',
  );
  if (alreadyLinked) {
    return { movementId: alreadyLinked._id, skipped: true };
  }

  const invStatus = invoice.status || 'pending';
  const movementData = {
    type: 'cobro',
    concept: `Factura ${invoice.number || invoice.invoiceNumber || invoice._id} — ${invoice.clientName || ''}`.trim(),
    reference: invoice.number || invoice.invoiceNumber || '',
    category: 'ventas',
    amountBase: Number(invoice.subtotal || invoice.amountBase || 0),
    taxRate: Number(invoice.taxRate || 21),
    date: invoice.date || new Date().toISOString().slice(0, 10),
    payMethod: invoice.payMethod || '',
    companyName: invoice.clientName || '',
    notes: invoice.notes || '',
    status: invStatus === 'paid' ? 'paid' : 'pending',
    dueDate: invoice.dueDate || '',
    paidAt: invStatus === 'paid' ? (invoice.paidAt || new Date().toISOString()) : '',
    source: 'ocr',
    sourceRef: invoice._id,
    entryMethod: 'ocr',
    linkedDocuments: [{
      id: invoice._id,
      type: 'client_invoice',
      name: invoice.number || invoice.invoiceNumber || invoice._id,
      url: '',
    }],
  };

  const doc = buildFinanceDocument(userId, movementData);
  const saved = await putDocument(req, financeDb, doc._id, doc);
  return { movementId: doc._id, skipped: false, rev: saved.rev };
}

/**
 * Tras crear factura de compra por OCR: recepción stock + pago en finanzas.
 * `applyStock` (default false): solo sube almacén si el usuario elige «Cargar al almacén».
 */
export async function reconcilePurchaseInvoiceFromOcr(req, userId, invoiceDoc, options = {}) {
  const db = getCatalogDbName();
  const lines = Array.isArray(invoiceDoc.lines) ? invoiceDoc.lines : [];
  let stockUpdated = 0;
  let stockUnits = 0;
  let stockFailures = 0;
  let expectedStockLines = 0;
  const now = new Date().toISOString();
  const performedBy = options.performedBy || 'ocr-system';
  const applyStock = options.applyStock === true;
  let warehouseId = String(options.warehouseId || invoiceDoc.warehouseId || '').trim();
  if (applyStock && !warehouseId) {
    try {
      const { resolvePurchaseReceptionWarehouseId } = await import('./storeWarehouseService.js');
      warehouseId = await resolvePurchaseReceptionWarehouseId(req, userId, {
        warehouseId: '',
        salesPointId: options.salesPointId || invoiceDoc.salesPointId || '',
        workCenterId: options.workCenterId || invoiceDoc.workCenterId || invoiceDoc.costCenterId || '',
      });
    } catch (resolveErr) {
      logger.warn({ tag: 'OCR-STOCK', err: resolveErr?.message }, 'No se pudo resolver almacén');
    }
  }

  if (applyStock && invoiceDoc.ocrStockReceivedAt) {
    return {
      stockUpdated: 0,
      stockUnits: 0,
      skipped: true,
      reason: 'already_loaded',
      financeMovementId: invoiceDoc.linkedFinanceId || null,
      financeSkipped: true,
      warehouseId: warehouseId || '',
      ...summarizeCatalogMatches(lines),
    };
  }

  if (applyStock) {
    if (!warehouseId) {
      throw new Error('Selecciona el almacén de la tienda antes de cargar el documento');
    }
    const priorMovements = (await listMovementsByReference(
      req,
      userId,
      invoiceDoc._id,
      'purchase_invoice_ocr',
      { movementTypes: ['purchase_reception'], maxDocs: 2000 },
    )).filter((movement) => movement.applied !== false);
    const receptionMovements = [...priorMovements];
    const appliedByCatalog = new Map();
    const targetByCatalog = new Map();
    for (const movement of priorMovements) {
      const key = String(movement.catalogItemId || '');
      if (!key) continue;
      appliedByCatalog.set(key, (appliedByCatalog.get(key) || 0) + Number(movement.quantity || 0));
    }
    for (const line of lines) {
      const catalogItemId = String(line.catalogItemId || '').trim();
      const sourceQty = Number(line.quantity || 0);
      const sourceUnitCost = Number(line.unitPrice || line.unitCost || 0);
      if (!catalogItemId || sourceQty <= 0) continue;
      expectedStockLines += 1;

      try {
        const catalogItem = await getDocument(req, db, catalogItemId);
        if (
          !catalogItem
          || catalogItem.type !== 'catalog_item'
          || catalogItem.user_id !== userId
        ) {
          throw new Error('Artículo de catálogo no válido');
        }
        const converted = convertPurchaseLineToCatalogUnit(
          sourceQty,
          sourceUnitCost,
          line.unit,
          catalogItem.unit,
        );
        if (!converted) {
          throw new Error(`Unidad incompatible: ${line.unit || '?'} → ${catalogItem.unit || 'ud'}`);
        }
        const targetQty = Math.round(
          ((targetByCatalog.get(catalogItemId) || 0) + converted.quantity) * 1_000_000,
        ) / 1_000_000;
        targetByCatalog.set(catalogItemId, targetQty);
        const alreadyApplied = appliedByCatalog.get(catalogItemId) || 0;
        const delta = targetQty - alreadyApplied;
        if (delta <= 0) continue;
        const movement = await recordMovement(req, userId, {
          catalogItemId,
          movementType: 'purchase_reception',
          quantity: delta,
          unitCost: converted.unitCost,
          warehouseId,
          referenceId: invoiceDoc._id,
          referenceType: 'purchase_invoice_ocr',
          idempotencyKey: `purchase-invoice:${invoiceDoc._id}:${catalogItemId}:${targetQty}`,
          notes: `Recepción - ${invoiceDoc.documentKind === 'albaran' ? 'Albarán' : 'Factura'} ${invoiceDoc.invoiceNumber || invoiceDoc._id.slice(-8)}`,
          performedBy,
        });
        receptionMovements.push(movement);

        stockUpdated += 1;
        stockUnits += delta;
        appliedByCatalog.set(catalogItemId, alreadyApplied + delta);
      } catch (err) {
        stockFailures += 1;
        logger.warn({ tag: 'OCR-STOCK', err: err?.message, catalogItemId }, 'Stock reception failed');
      }
    }
    for (const movement of receptionMovements.sort(
      (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    )) {
      try {
        await applyPurchaseMovementCost(req, userId, movement);
      } catch (error) {
        stockFailures += 1;
        logger.warn(
          { tag: 'OCR-STOCK-COST', err: error?.message, movementId: movement._id },
          'Average cost update failed',
        );
      }
    }
  }
  const stockComplete = applyStock && expectedStockLines > 0 && stockFailures === 0;

  let financeResult = null;
  if (options.createFinance !== false) {
    try {
      financeResult = await createFinancePagoFromPurchaseInvoice(req, userId, invoiceDoc, {
        financeSource: options.financeSource,
        entryMethod: options.entryMethod,
      });
    } catch (err) {
      logger.warn({ tag: 'OCR-FINANCE', err: err?.message }, 'Finance pago creation failed');
    }
  }

  const matchSummary = summarizeCatalogMatches(lines);

  try {
    const invFresh = await getDocument(req, db, invoiceDoc._id);
    const stockPending = applyStock
      ? false
      : Boolean(invFresh.flags?.stockPending !== false);
    await putDocument(req, db, invFresh._id, {
      ...invFresh,
      linkedFinanceId: financeResult?.movementId || invFresh.linkedFinanceId || '',
      warehouseId: warehouseId || invFresh.warehouseId || '',
      ocrStockReceivedAt: stockComplete ? now : invFresh.ocrStockReceivedAt || '',
      ocrStockLinesReceived: stockComplete ? expectedStockLines : (invFresh.ocrStockLinesReceived || 0),
      flags: {
        ...(invFresh.flags || {}),
        stockPending: stockComplete ? false : stockPending,
      },
      updatedAt: now,
    });
  } catch (err) {
    logger.warn({ tag: 'OCR-RECONCILE', err: err?.message }, 'Could not update invoice metadata');
  }

  return {
    stockUpdated,
    stockUnits,
    stockFailures,
    stockComplete,
    warehouseId: warehouseId || '',
    financeMovementId: financeResult?.movementId || null,
    financeSkipped: financeResult?.skipped || false,
    ...matchSummary,
  };
}
