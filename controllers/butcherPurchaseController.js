import {
  getButcherDbName, ensureDatabase, getAllDocuments, putDocument, getDocument,
  buildButcherPurchaseEntryDocument, sanitizeButcherPurchaseEntry, listButcherPurchaseEntriesByUser,
  buildButcherBatchDocument, sanitizeButcherBatch, listButcherBatchesByUser,
  listButcherProductsByUser, sanitizeButcherProduct,
  findAccountByUserId, logAccountActivity,
  getCatalogDbName, listSuppliersByUser, sanitizeSupplier,
  getFinanceDbName, buildFinanceDocument,
  getDocumentsDbName, buildDocumentRecord,
  listPurchaseInvoicesByUser, sanitizePurchaseInvoice,
} from '../services/couchdb.js';
import { applyPurchaseStockIncrease } from '../services/butcherStockPipeline.js';
import { formatBatchCodePrefix, nextBatchCode } from '../services/butcherMath.js';
import logger from '../services/logger.js';

async function generateBatchCode(req, userId, entryDate, animalType) {
  const prefix = formatBatchCodePrefix(entryDate, animalType);
  const batches = await listButcherBatchesByUser(req, userId);
  const codes = batches.map((b) => b.batchNumber || b.batchCode).filter(Boolean);
  return nextBatchCode(prefix, codes);
}

function bad(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureEntryOwner(req, userId, entryId) {
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, entryId);
  if (!doc || doc.type !== 'butcher_purchase_entry' || doc.user_id !== userId || doc.deletedAt) return null;
  return doc;
}

// ─── List purchase entries ──────────────────────────────────────────────────

export async function listPurchaseEntries(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { supplierId, productId, status, dateFrom, dateTo, warehouseId, hasInvoice } = req.query || {};
    const filters = {};
    if (supplierId) filters.supplierId = supplierId;
    if (productId) filters.productId = productId;
    if (status) filters.status = status;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (warehouseId) filters.warehouseId = warehouseId;
    if (hasInvoice !== undefined) filters.hasInvoice = hasInvoice;

    const entries = await listButcherPurchaseEntriesByUser(req, userId, filters);
    return res.json({ ok: true, entries: entries.map(sanitizeButcherPurchaseEntry) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error listando entradas de compra' });
  }
}

// ─── Create purchase entry ──────────────────────────────────────────────────

export async function createPurchaseEntry(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const body = req.body || {};
    if (!body.supplierId && !body.supplierName) return bad(res, 'Proveedor es obligatorio');
    if (!body.productId && !body.productName) return bad(res, 'Producto es obligatorio');
    if (!body.quantityReceived || Number(body.quantityReceived) <= 0) return bad(res, 'Cantidad recibida debe ser mayor que 0');
    if (!body.costPerUnit || Number(body.costPerUnit) <= 0) return bad(res, 'Coste por unidad debe ser mayor que 0');

    const doc = buildButcherPurchaseEntryDocument(userId, body);
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const saved = await putDocument(req, db, doc);
    return res.status(201).json({ ok: true, entry: sanitizeButcherPurchaseEntry(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error creando entrada de compra' });
  }
}

// ─── Update purchase entry ──────────────────────────────────────────────────

export async function updatePurchaseEntry(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    if (existing.status !== 'draft') return bad(res, 'Solo se pueden editar entradas en borrador');

    const doc = buildButcherPurchaseEntryDocument(userId, req.body || {}, existing);
    const db = getButcherDbName();
    const saved = await putDocument(req, db, doc);
    return res.json({ ok: true, entry: sanitizeButcherPurchaseEntry(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error actualizando entrada' });
  }
}

// ─── Delete purchase entry ──────────────────────────────────────────────────

export async function deletePurchaseEntry(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });

    const db = getButcherDbName();
    await putDocument(req, db, { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error eliminando entrada' });
  }
}

// ─── Confirm purchase entry (trigger automations) ───────────────────────────

export async function confirmPurchaseEntry(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    if (existing.status !== 'draft') return bad(res, 'Solo se pueden confirmar entradas en borrador');

    const db = getButcherDbName();
    const now = new Date().toISOString();

    // 1. Update product stock and cost
    let productDoc = null;
    let previousAvgCost = 0;
    let newAvgCost = 0;
    let costAnomaly = false;
    let costAnomalyPct = 0;

    if (existing.productId) {
      try {
        productDoc = await getDocument(req, db, existing.productId);
      } catch (_) { /* product may not exist */ }

      if (productDoc && productDoc.type === 'butcher_product' && productDoc.user_id === userId) {
        const prevStock = Number(productDoc.stockKg || 0);
        const prevCost = Number(productDoc.costPerKg || 0);
        const receivedQty = Number(existing.quantityReceived || 0);
        const entryCost = Number(existing.costPerUnit || 0);
        const newStock = prevStock + receivedQty;

        previousAvgCost = prevCost;
        newAvgCost = newStock > 0
          ? ((prevStock * prevCost) + (receivedQty * entryCost)) / newStock
          : entryCost;
        newAvgCost = Math.round(newAvgCost * 100) / 100;

        if (prevCost > 0) {
          const deviation = Math.abs(entryCost - prevCost) / prevCost;
          if (deviation > 0.20) {
            costAnomaly = true;
            costAnomalyPct = Math.round(deviation * 100);
          }
        }

        const costHistory = Array.isArray(productDoc.costHistory) ? [...productDoc.costHistory] : [];
        costHistory.push({
          date: existing.entryDate, cost: entryCost,
          supplierId: existing.supplierId, supplierName: existing.supplierName,
          quantity: receivedQty, entryId: existing._id,
        });
        if (costHistory.length > 50) costHistory.splice(0, costHistory.length - 50);

        await putDocument(req, db, {
          ...productDoc,
          stockKg: newStock,
          costPerKg: newAvgCost,
          lastPurchaseDate: existing.entryDate,
          lastPurchasePrice: entryCost,
          lastSupplierId: existing.supplierId,
          lastSupplierName: existing.supplierName,
          costHistory,
          updatedAt: now,
        });
      }
    }

    // 2. Generate batch if needed
    let batchId = existing.batchId;
    let batchCode = existing.batchCode;
    if (!batchId) {
      const generatedCode = await generateBatchCode(req, userId, existing.entryDate, existing.animalType);
      const batchDoc = buildButcherBatchDocument(userId, {
        business_id: existing.business_id,
        productId: existing.productId,
        productName: existing.productName,
        batchNumber: generatedCode,
        origin: existing.origin,
        slaughterhouse: existing.slaughterhouse,
        healthGuide: existing.healthGuideNumber,
        receptionDate: existing.entryDate,
        expirationDate: existing.expirationDate,
        receptionWeightKg: existing.quantityReceived,
        currentWeightKg: existing.quantityReceived,
        temperature: existing.temperatureOnArrival,
        zone: existing.zone,
        purchaseOrderId: existing.purchaseOrderId,
        status: 'active',
        healthStatus: 'approved',
      });
      const savedBatch = await putDocument(req, db, batchDoc);
      batchId = savedBatch._id;
      batchCode = generatedCode;
    } else {
      try {
        const existingBatch = await getDocument(req, db, batchId);
        if (existingBatch && existingBatch.type === 'butcher_batch') {
          const newWeight = Number(existingBatch.currentWeightKg || 0) + Number(existing.quantityReceived || 0);
          await putDocument(req, db, {
            ...existingBatch,
            currentWeightKg: newWeight,
            receptionWeightKg: Number(existingBatch.receptionWeightKg || 0) + Number(existing.quantityReceived || 0),
            updatedAt: now,
          });
        }
      } catch (_) { /* batch may have been deleted */ }
    }

    // 3. Sync stock + lote al catálogo TPV (bt_catalog / bt_lote) — canónico FEFO
    let opsLotId = null;
    try {
      const sync = await applyPurchaseStockIncrease(req, userId, {
        productId: existing.catalogProductId || existing.productId,
        productName: existing.productName,
        qtyKg: existing.quantityReceived,
        costPerKg: existing.costPerUnit,
        loteCode: batchCode,
        expirationDate: existing.expirationDate,
        supplierName: existing.supplierName,
        legacyBatchId: batchId,
      });
      opsLotId = sync?.lotId || null;
      if (opsLotId && batchId) {
        try {
          const batchDoc = await getDocument(req, db, batchId);
          if (batchDoc && batchDoc.type === 'butcher_batch') {
            await putDocument(req, db, {
              ...batchDoc,
              opsLotId,
              updatedAt: now,
            });
          }
        } catch { /* optional link */ }
      }
    } catch (syncErr) {
      logger.warn({ tag: 'BUTCHER_PURCHASE_CONFIRM', err: syncErr?.message }, 'Sync catálogo ops falló (no bloquea confirmación)');
    }

    // 4. Update entry status
    const updatedEntry = buildButcherPurchaseEntryDocument(userId, {
      ...existing,
      status: 'confirmed',
      confirmedBy: userId,
      confirmedAt: now,
      batchId,
      batchCode,
      opsLotId,
      previousAvgCost,
      newAvgCost,
      costAnomaly,
      costAnomalyPct,
    }, existing);
    const savedEntry = await putDocument(req, db, updatedEntry);

    const account = await findAccountByUserId(req, userId).catch(() => null);
    logAccountActivity(req, {
      actorUserId: userId, actorName: account?.fullName || '', targetUserId: userId,
      type: 'butcher_purchase', action: `Confirmó entrada de ${existing.quantityReceived}${existing.unit} de ${existing.productName}`,
      entityId: savedEntry._id, entityLabel: batchCode || existing.productName,
      metadata: { supplierId: existing.supplierId, supplierName: existing.supplierName, totalCost: existing.totalCost },
    }).catch(() => null);

    return res.json({ ok: true, entry: sanitizeButcherPurchaseEntry(savedEntry) });
  } catch (error) {
    logger.error({ tag: 'BUTCHER_PURCHASE_CONFIRM', err: error?.message }, 'Error confirmando entrada');
    return res.status(500).json({ ok: false, error: error?.message || 'Error confirmando entrada' });
  }
}

// ─── Validate purchase entry (manager only) ─────────────────────────────────

export async function validatePurchaseEntry(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    if (existing.status !== 'confirmed') return bad(res, 'Solo se pueden validar entradas confirmadas');

    const now = new Date().toISOString();
    const doc = buildButcherPurchaseEntryDocument(userId, {
      ...existing,
      status: 'validated',
      validatedBy: userId,
      validatedAt: now,
    }, existing);
    const db = getButcherDbName();
    const saved = await putDocument(req, db, doc);
    return res.json({ ok: true, entry: sanitizeButcherPurchaseEntry(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error validando entrada' });
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getPurchaseEntryStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { dateFrom, dateTo } = req.query || {};

    const entries = await listButcherPurchaseEntriesByUser(req, userId, { dateFrom, dateTo });
    const confirmed = entries.filter((e) => e.status !== 'draft');

    const totalCost = confirmed.reduce((s, e) => s + Number(e.totalCost || 0), 0);
    const totalKg = confirmed.reduce((s, e) => s + Number(e.quantityReceived || 0), 0);
    const avgCostPerKg = totalKg > 0 ? Math.round((totalCost / totalKg) * 100) / 100 : 0;
    const entriesCount = confirmed.length;
    const pendingValidation = entries.filter((e) => e.status === 'confirmed').length;
    const withoutInvoice = confirmed.filter((e) => !e.invoiceId).length;
    const costAnomalies = confirmed.filter((e) => e.costAnomaly).length;
    const incomplete = confirmed.filter((e) => !e.isComplete).length;

    const bySupplier = {};
    for (const e of confirmed) {
      const key = e.supplierId || e.supplierName || 'Sin proveedor';
      if (!bySupplier[key]) bySupplier[key] = { name: e.supplierName || key, total: 0, kg: 0, count: 0 };
      bySupplier[key].total += Number(e.totalCost || 0);
      bySupplier[key].kg += Number(e.quantityReceived || 0);
      bySupplier[key].count += 1;
    }

    const byProduct = {};
    for (const e of confirmed) {
      const key = e.productId || e.productName || 'Sin producto';
      if (!byProduct[key]) byProduct[key] = { name: e.productName || key, total: 0, kg: 0, count: 0, lastCost: 0 };
      byProduct[key].total += Number(e.totalCost || 0);
      byProduct[key].kg += Number(e.quantityReceived || 0);
      byProduct[key].count += 1;
      byProduct[key].lastCost = Number(e.costPerUnit || 0);
    }

    return res.json({
      ok: true,
      stats: {
        totalCost, totalKg, avgCostPerKg, entriesCount,
        pendingValidation, withoutInvoice, costAnomalies, incomplete,
        bySupplier: Object.values(bySupplier).sort((a, b) => b.total - a.total),
        byProduct: Object.values(byProduct).sort((a, b) => b.total - a.total),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error calculando estadísticas' });
  }
}

// ─── Generate batch code preview ────────────────────────────────────────────

export async function previewBatchCode(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { entryDate, animalType } = req.query || {};
    const code = await generateBatchCode(req, userId, entryDate, animalType);
    return res.json({ ok: true, batchCode: code });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error generando código de lote' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CC-09 · OCR — Pre-fill entry from scanned invoice
// ═══════════════════════════════════════════════════════════════════════════

export async function createFromOcr(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const { ocrData } = req.body || {};
    if (!ocrData) return bad(res, 'ocrData es obligatorio');

    const lines = Array.isArray(ocrData.lines) ? ocrData.lines : [];
    const supplierName = ocrData.supplierName || ocrData.emisor || '';
    const supplierCif = ocrData.cif || ocrData.nif || '';
    const invoiceNumber = ocrData.invoiceNumber || ocrData.numero_factura || '';
    const invoiceDate = ocrData.date || ocrData.fecha || '';

    let supplierId = '';
    if (supplierCif || supplierName) {
      try {
        const suppliers = await listSuppliersByUser(req, userId);
        const match = suppliers.find((s) =>
          (supplierCif && s.cif && s.cif.replace(/[\s-]/g, '').toUpperCase() === supplierCif.replace(/[\s-]/g, '').toUpperCase())
          || (supplierName && s.name && s.name.toLowerCase().includes(supplierName.toLowerCase()))
        );
        if (match) supplierId = match._id;
      } catch { /* non-critical */ }
    }

    const entries = [];
    if (lines.length > 0) {
      for (const line of lines) {
        const entry = buildButcherPurchaseEntryDocument(userId, {
          supplierId,
          supplierName,
          supplierCif,
          productName: line.description || line.concepto || line.name || '',
          quantityPurchased: Number(line.quantity || line.cantidad || 0),
          quantityReceived: Number(line.quantity || line.cantidad || 0),
          unit: line.unit || 'kg',
          costPerUnit: Number(line.unitPrice || line.precioUnitario || 0),
          totalCost: Number(line.total || line.importe || 0),
          entryDate: invoiceDate || new Date().toISOString().slice(0, 10),
          purchaseDate: invoiceDate,
          invoiceNumber,
          ocrData: line,
          notes: `Creado desde OCR: ${invoiceNumber}`,
        });
        const db = getButcherDbName();
        await ensureDatabase(req, db);
        const saved = await putDocument(req, db, entry);
        entries.push(sanitizeButcherPurchaseEntry(saved));
      }
    } else {
      const entry = buildButcherPurchaseEntryDocument(userId, {
        supplierId,
        supplierName,
        supplierCif,
        entryDate: invoiceDate || new Date().toISOString().slice(0, 10),
        purchaseDate: invoiceDate,
        invoiceNumber,
        totalCost: Number(ocrData.total || 0),
        ocrData,
        notes: `Creado desde OCR: ${invoiceNumber}`,
      });
      const db = getButcherDbName();
      await ensureDatabase(req, db);
      const saved = await putDocument(req, db, entry);
      entries.push(sanitizeButcherPurchaseEntry(saved));
    }

    return res.status(201).json({ ok: true, entries, matched: { supplierId, supplierName } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error procesando OCR' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CC-10 · Link invoice to purchase entry
// ═══════════════════════════════════════════════════════════════════════════

export async function linkInvoice(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });

    const { invoiceId, invoiceNumber } = req.body || {};
    if (!invoiceId && !invoiceNumber) return bad(res, 'invoiceId o invoiceNumber es obligatorio');

    const db = getButcherDbName();
    const now = new Date().toISOString();
    const updated = { ...existing, invoiceId: invoiceId || existing.invoiceId, invoiceNumber: invoiceNumber || existing.invoiceNumber, updatedAt: now };
    const saved = await putDocument(req, db, updated);
    return res.json({ ok: true, entry: sanitizeButcherPurchaseEntry(saved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error vinculando factura' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CC-10 · Archive document & link to entry
// ═══════════════════════════════════════════════════════════════════════════

export async function attachDocument(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });

    const { documentId, title, fileUrl, mimeType, content } = req.body || {};

    const bDb = getButcherDbName();
    const docDb = getDocumentsDbName();
    const now = new Date().toISOString();
    let docId = documentId;

    if (!docId) {
      await ensureDatabase(req, docDb);
      const docRecord = buildDocumentRecord(userId, {
        title: title || `Doc compra ${existing.productName} ${existing.entryDate}`,
        category: 'compra_mercancia',
        subcategory: 'albaran',
        fileUrl: fileUrl || '',
        mimeType: mimeType || '',
        content: content || '',
        linkedEntityId: entryId,
        linkedEntityType: 'butcher_purchase_entry',
        archived: true,
      });
      const savedDoc = await putDocument(req, docDb, docRecord);
      docId = savedDoc._id;
    }

    const docIds = Array.isArray(existing.documentIds) ? [...existing.documentIds] : [];
    if (!docIds.includes(docId)) docIds.push(docId);

    const updated = { ...existing, documentIds: docIds, updatedAt: now };
    const saved = await putDocument(req, bDb, updated);
    return res.json({ ok: true, entry: sanitizeButcherPurchaseEntry(saved), documentId: docId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error adjuntando documento' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CC-12 · Create finance movement (pago) from confirmed entry
// ═══════════════════════════════════════════════════════════════════════════

export async function createFinanceFromEntry(req, res) {
  try {
    const { userId, entryId } = req.params;
    if (!userId || !entryId) return bad(res, 'Faltan userId o entryId');

    const existing = await ensureEntryOwner(req, userId, entryId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    if (existing.status === 'draft') return bad(res, 'La entrada debe estar confirmada');

    const finDb = getFinanceDbName();
    await ensureDatabase(req, finDb);

    const finDoc = buildFinanceDocument(userId, {
      type: 'pago',
      concept: `Compra mercancía: ${existing.productName} (${existing.quantityReceived}${existing.unit})`,
      amount: existing.totalCost,
      category: 'materiales',
      subcategory: 'compras_mercancia',
      date: existing.entryDate,
      supplierId: existing.supplierId,
      supplierName: existing.supplierName,
      source: 'butcher_purchase',
      sourceRef: existing._id,
      invoiceRef: existing.invoiceNumber || '',
      status: 'pending',
      notes: `Auto-generado desde entrada ${existing.batchCode || existing._id}`,
    });
    const savedFin = await putDocument(req, finDb, finDoc);

    const bDb = getButcherDbName();
    const updated = { ...existing, linkedFinanceId: savedFin._id, updatedAt: new Date().toISOString() };
    await putDocument(req, bDb, updated);

    return res.json({ ok: true, financeId: savedFin._id, financeDoc: savedFin });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error creando movimiento financiero' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CC-12 · Lookup helpers for autocomplete (suppliers + products)
// ═══════════════════════════════════════════════════════════════════════════

export async function searchSuppliers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const q = String(req.query.q || '').toLowerCase();
    const suppliers = await listSuppliersByUser(req, userId);
    const filtered = q
      ? suppliers.filter((s) => s.name?.toLowerCase().includes(q) || s.cif?.toLowerCase().includes(q)).slice(0, 20)
      : suppliers.slice(0, 50);
    return res.json({ ok: true, suppliers: filtered.map(sanitizeSupplier) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error buscando proveedores' });
  }
}

export async function searchProducts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const q = String(req.query.q || '').toLowerCase();
    const products = await listButcherProductsByUser(req, userId);
    const filtered = q
      ? products.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 20)
      : products.slice(0, 50);
    return res.json({ ok: true, products: filtered.map(sanitizeButcherProduct) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error buscando productos' });
  }
}

export async function searchInvoices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const q = String(req.query.q || '').toLowerCase();
    const invoices = await listPurchaseInvoicesByUser(req, userId);
    const filtered = q
      ? invoices.filter((i) => i.invoiceNumber?.toLowerCase().includes(q) || i.supplierName?.toLowerCase().includes(q)).slice(0, 20)
      : invoices.slice(0, 20);
    return res.json({ ok: true, invoices: filtered.map(sanitizePurchaseInvoice) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Error buscando facturas' });
  }
}
