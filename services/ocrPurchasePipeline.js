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
import { recordMovement } from './stockMovementService.js';
import logger from './logger.js';

const fakeReq = { headers: {} };

export async function loadStockCatalogItems(userId) {
  const items = await listCatalogItemsByUser(fakeReq, userId);
  return filterStockInventoryItems(items);
}

export async function enrichOcrLinesForUser(rawLines, userId, supplierId = '') {
  const catalogItems = await loadStockCatalogItems(userId);
  return enrichOcrLinesWithCatalog(rawLines, catalogItems, { supplierId });
}

async function updateWeightedCatalogCost(req, userId, catalogItemId, receivedQty, unitCost, prevQtyBeforeReceipt) {
  const db = getCatalogDbName();
  const now = new Date().toISOString();
  const catItem = await getDocument(req, db, catalogItemId);
  if (!catItem || catItem.type !== 'catalog_item' || catItem.user_id !== userId) return;

  const prevQty = Number(prevQtyBeforeReceipt ?? catItem.stockQuantity ?? 0);
  const prevCost = Number(catItem.costPrice || 0);
  const received = Number(receivedQty || 0);
  let newCostPrice = Number(unitCost || 0);

  const newStockQty = prevQty + received;
  if (prevQty > 0 && prevCost > 0 && unitCost > 0 && newStockQty > 0) {
    newCostPrice = Math.round(
      ((prevQty * prevCost + received * Number(unitCost)) / newStockQty) * 100,
    ) / 100;
  }

  const fresh = await getDocument(req, db, catalogItemId);
  await putDocument(req, db, fresh._id, {
    ...fresh,
    costPrice: unitCost > 0 ? newCostPrice : fresh.costPrice,
    lastPurchasePrice: unitCost > 0 ? unitCost : fresh.lastPurchasePrice,
    lastPurchaseDate: now,
    updatedAt: now,
  });
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
  if (alreadyLinked) {
    return { movementId: alreadyLinked._id, skipped: true };
  }

  const invStatus = invoice.status || 'pending';
  const movementData = {
    type: 'pago',
    concept: `Factura ${invoice.invoiceNumber || invoice._id} — ${invoice.supplierName || ''}`.trim(),
    reference: invoice.invoiceNumber || '',
    category: 'compras_stock',
    amountBase: Number(invoice.subtotal || 0),
    taxRate: Number(invoice.taxRate || 21),
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
      logger.warn(
        { tag: 'OCR-STOCK', invoiceId: invoiceDoc._id, userId },
        'Carga almacén sin warehouseId: el stock no se verá por tienda',
      );
    }
    for (const line of lines) {
      const catalogItemId = String(line.catalogItemId || '').trim();
      const qty = Number(line.quantity || 0);
      const unitCost = Number(line.unitPrice || line.unitCost || 0);
      if (!catalogItemId || qty <= 0) continue;

      try {
        const catItemBefore = await getDocument(req, db, catalogItemId);
        const prevQty = Number(catItemBefore?.stockQuantity || 0);

        await recordMovement(req, userId, {
          catalogItemId,
          movementType: 'purchase_reception',
          quantity: qty,
          unitCost,
          warehouseId,
          referenceId: invoiceDoc._id,
          referenceType: 'purchase_invoice_ocr',
          notes: `Recepción - ${invoiceDoc.documentKind === 'albaran' ? 'Albarán' : 'Factura'} ${invoiceDoc.invoiceNumber || invoiceDoc._id.slice(-8)}`,
          performedBy,
        });

        if (unitCost > 0) {
          await updateWeightedCatalogCost(req, userId, catalogItemId, qty, unitCost, prevQty);
        }

        stockUpdated += 1;
        stockUnits += qty;
      } catch (err) {
        logger.warn({ tag: 'OCR-STOCK', err: err?.message, catalogItemId }, 'Stock reception failed');
      }
    }
  }

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
      ocrStockReceivedAt: stockUpdated > 0 ? now : invFresh.ocrStockReceivedAt || '',
      ocrStockLinesReceived: stockUpdated > 0 ? stockUpdated : (invFresh.ocrStockLinesReceived || 0),
      flags: {
        ...(invFresh.flags || {}),
        stockPending: stockUpdated > 0 ? false : stockPending,
      },
      updatedAt: now,
    });
  } catch (err) {
    logger.warn({ tag: 'OCR-RECONCILE', err: err?.message }, 'Could not update invoice metadata');
  }

  return {
    stockUpdated,
    stockUnits,
    warehouseId: warehouseId || '',
    financeMovementId: financeResult?.movementId || null,
    financeSkipped: financeResult?.skipped || false,
    ...matchSummary,
  };
}
