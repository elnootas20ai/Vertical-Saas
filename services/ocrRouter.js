/**
 * OCR Router - Orquesta el flujo completo de procesamiento OCR:
 * scan -> classify -> match entities -> validate -> propose -> route -> archive
 */

import {
  buildOcrLogDocument,
  buildOcrProposalDocument,
  buildDocumentRecord,
  buildFinanceDocument,
  buildPurchaseInvoiceDocument,
  buildInvoiceDocument,
  ensureDatabase,
  putDocument,
  getOcrLogsDbName,
  getDocumentsDbName,
  findOcrLogByHash,
  findOcrLogByFingerprint,
  findDuplicatePurchaseInvoice,
  assignPurchaseInvoiceNumber,
  sanitizeOcrLog,
  sanitizeOcrProposal,
} from './couchdb.js';
import { classifyDocument, shouldAutoApprove } from './ocrClassifier.js';
import { matchEntities } from './ocrEntityMatcher.js';
import { validateOcrData, generateOcrFingerprint } from './ocrValidator.js';
import { enrichOcrLinesForUser, reconcilePurchaseInvoiceFromOcr, createFinanceCobroFromClientInvoice } from './ocrPurchasePipeline.js';
import { ensureFinanceFromDocumentOcr, isRentalOcrDocument } from './rentFinanceSync.js';
import { summarizeCatalogMatches } from './ocrCatalogLineMatcher.js';
import logger from './logger.js';

const fakeReq = { headers: {} };

// ---- Duplicate check ----

export async function checkDuplicate(sourceHash, ocrData, userId) {
  const result = { isDuplicate: false, duplicateType: null, original: null };

  if (sourceHash) {
    const existing = await findOcrLogByHash(fakeReq, userId, sourceHash);
    if (existing) {
      result.isDuplicate = true;
      result.duplicateType = 'exact';
      result.original = {
        logId: existing._id,
        documentType: existing.detectedDocumentType,
        routedTo: existing.routedTo,
        processedAt: existing.createdAt,
      };
      return result;
    }
  }

  // Mismo código de factura/albarán ya registrado en compras
  const invoiceNumber = String(ocrData?.documentNumber || '').trim();
  if (invoiceNumber && userId) {
    const dupInv = await findDuplicatePurchaseInvoice(fakeReq, userId, invoiceNumber, '', null);
    if (dupInv) {
      result.isDuplicate = true;
      result.duplicateType = 'invoice_number';
      result.original = {
        logId: dupInv._id,
        invoiceId: dupInv._id,
        invoiceNumber: dupInv.invoiceNumber,
        documentType: dupInv.documentKind || 'factura_proveedor',
        routedTo: 'compras',
        processedAt: dupInv.createdAt,
      };
      return result;
    }
  }

  if (ocrData) {
    const fingerprint = await generateOcrFingerprint(ocrData);
    if (fingerprint) {
      const existing = await findOcrLogByFingerprint(fakeReq, userId, fingerprint);
      if (existing) {
        result.isDuplicate = true;
        result.duplicateType = 'data_match';
        result.original = {
          logId: existing._id,
          documentType: existing.detectedDocumentType,
          routedTo: existing.routedTo,
          processedAt: existing.createdAt,
        };
      }
    }
  }

  return result;
}

// ---- Proposal field builder ----

async function buildProposalFieldsAsync(ocrData, destination, entityMatch, userId) {
  const fields = {};
  const docType = ocrData?.documentType || 'otro';
  const conf = ocrData?.confidenceScore || 50;

  function f(name, value, confidence, source) {
    fields[name] = { value, confidence: confidence ?? conf, source: source || 'ocr' };
  }

  f('date', ocrData.date);
  f('documentNumber', ocrData.documentNumber);
  f('notes', ocrData.notes);

  if (destination.module === 'compras' || docType === 'factura_proveedor' || docType === 'albaran') {
    f('supplierName', ocrData.emitter);
    const supplierId = entityMatch?.matchType === 'supplier' && entityMatch.matchedEntity
      ? entityMatch.matchedEntity._id
      : '';
    if (supplierId) {
      f('supplierId', supplierId, entityMatch.confidence, 'matched');
      f('supplierName', entityMatch.matchedEntity.name, entityMatch.confidence, 'matched');
    }
    f('invoiceNumber', ocrData.documentNumber);
    const enrichedLines = userId
      ? await enrichOcrLinesForUser(ocrData.lines || [], userId, supplierId)
      : (ocrData.lines || []);
    f('lines', enrichedLines);
    const matchSummary = summarizeCatalogMatches(enrichedLines);
    f('catalogMatchSummary', matchSummary, 100, 'auto');
    f('subtotal', ocrData.subtotal);
    f('taxRate', ocrData.taxRate);
    f('taxAmount', ocrData.taxAmount);
    f('total', ocrData.total);
  }

  if (destination.module === 'finanzas') {
    if (docType === 'factura_cliente') {
      if (entityMatch?.matchType === 'client' && entityMatch.matchedEntity) {
        f('clientId', entityMatch.matchedEntity._id, entityMatch.confidence, 'matched');
        f('clientName', entityMatch.matchedEntity.name, entityMatch.confidence, 'matched');
      } else {
        f('clientName', ocrData.receiver);
      }
      f('number', ocrData.documentNumber);
      f('lines', ocrData.lines);
      f('total', ocrData.total);
    } else {
      f('companyName', ocrData.emitter);
      var concept = (ocrData.lines && ocrData.lines[0] && ocrData.lines[0].description) || ocrData.documentTypeLabel || '';
      f('concept', concept);
      f('amountBase', ocrData.subtotal || ocrData.total);
      f('taxRate', ocrData.taxRate || 0);
      f('totalAmount', ocrData.total);
      if (destination.expenseCategory) {
        const slug = destination.expenseCategory.category === 'Alquiler' ? 'alquiler' : destination.expenseCategory.category;
        f('category', slug, 70, 'auto');
        f('categoryIcon', destination.expenseCategory.categoryIcon, 70, 'auto');
        f('categoryColor', destination.expenseCategory.categoryColor, 70, 'auto');
      }
    }
  }

  if (destination.module === 'nominas' || destination.module === 'equipo') {
    if (entityMatch?.matchType === 'worker' && entityMatch.matchedEntity) {
      f('worker_id', entityMatch.matchedEntity._id, entityMatch.confidence, 'matched');
      f('worker_name', entityMatch.matchedEntity.name, entityMatch.confidence, 'matched');
    } else {
      f('worker_name', ocrData.workerName);
    }
    f('documentType', destination.payrollType || 'otro');
    var period = ocrData.periodStart && ocrData.periodEnd
      ? ocrData.periodStart + ' - ' + ocrData.periodEnd
      : ocrData.periodStart || '';
    f('period', period);
    var workerLabel = ocrData.workerName || 'Trabajador';
    var typeLabel = destination.payrollType || docType;
    f('name', typeLabel + ' - ' + workerLabel + (ocrData.periodStart ? ' (' + ocrData.periodStart + ')' : ''));
  }

  if (destination.module === 'documentacion') {
    if (entityMatch?.matchType === 'client' && entityMatch.matchedEntity) {
      f('clientId', entityMatch.matchedEntity._id, entityMatch.confidence, 'matched');
      f('clientName', entityMatch.matchedEntity.name, entityMatch.confidence, 'matched');
    }
    f('name', ocrData.documentTypeLabel || ocrData.documentNumber || 'Documento OCR');
    f('category', destination.documentCategory || 'other');
  }

  return fields;
}

// ---- Execute a proposal: create the document in the destination DB ----

export async function executeProposal(proposal, userId) {
  const dest = proposal.destination;
  if (!dest) throw new Error('Proposal has no destination');

  const fields = {};
  for (const [key, val] of Object.entries(proposal.fields || {})) {
    fields[key] = val?.value !== undefined ? val.value : val;
  }

  const now = new Date().toISOString();
  let createdDoc = null;
  const db = dest.database;

  await ensureDatabase(fakeReq, db);

  switch (dest.action) {
    case 'create_purchase_invoice':
    case 'create_delivery_note': {
      const docKind = dest.action === 'create_delivery_note'
        ? 'albaran'
        : (proposal.ocrData?.documentType || 'factura_proveedor');
      const invoiceNumber = await assignPurchaseInvoiceNumber(fakeReq, userId, {
        invoiceNumber: fields.invoiceNumber || fields.documentNumber || proposal.ocrData?.documentNumber || '',
        documentKind: docKind,
        ocrData: proposal.ocrData,
      });
      if (invoiceNumber && !proposal.forceDuplicate) {
        const dupInv = await findDuplicatePurchaseInvoice(fakeReq, userId, invoiceNumber, fields.supplierId || '', null);
        if (dupInv) {
          const err = new Error(`Factura duplicada: ya existe el código ${dupInv.invoiceNumber}`);
          err.code = 'DUPLICATE_INVOICE';
          err.existingInvoiceId = dupInv._id;
          throw err;
        }
      }
      const loadToWarehouse = fields.loadToWarehouse === true
        || String(fields.loadToWarehouse || '').toLowerCase() === 'true';
      createdDoc = buildPurchaseInvoiceDocument(userId, {
        ...fields,
        invoiceNumber,
        documentKind: docKind,
        entryMethod: 'ocr',
        ocrData: proposal.ocrData,
        ocrImageBase64: proposal.sourceImageBase64 || '',
        ocrProcessedAt: now,
        ocrConfidence: proposal.ocrData?.confidenceScore || 0,
        flags: { stockPending: !loadToWarehouse },
      });
      createdDoc.__loadToWarehouse = loadToWarehouse;
      break;
    }
    case 'create_client_invoice':
    case 'create_quote': {
      createdDoc = buildInvoiceDocument(userId, {
        ...fields,
        entryMethod: 'ocr',
        ocrData: proposal.ocrData,
        ocrProcessedAt: now,
        ocrConfidence: proposal.ocrData?.confidenceScore || 0,
      });
      break;
    }
    case 'create_expense':
    case 'create_receipt': {
      const rawCategory = String(fields.category || '').trim();
      const categorySlug = rawCategory === 'Alquiler' ? 'alquiler' : rawCategory || 'otros_gastos';
      createdDoc = buildFinanceDocument(userId, {
        ...fields,
        type: dest.financeType || 'pago',
        category: categorySlug,
        entryMethod: 'ocr',
        ocrData: proposal.ocrData,
        ocrProcessedAt: now,
        ocrConfidence: proposal.ocrData?.confidenceScore || 0,
      });
      break;
    }
    case 'create_payroll':
    case 'create_labor_contract':
    case 'create_labor_certificate':
    case 'create_sick_leave': {
      const { v4: uuidv4 } = await import('uuid');
      var id = 'payroll-' + uuidv4();
      createdDoc = {
        _id: id,
        type: 'payroll',
        id: id,
        worker_id: fields.worker_id || '',
        worker_name: fields.worker_name || '',
        documentType: fields.documentType || dest.payrollType || 'otro',
        name: fields.name || 'Documento laboral OCR',
        period: fields.period || '',
        uploadedBy: userId,
        entryMethod: 'ocr',
        ocrData: proposal.ocrData,
        ocrProcessedAt: now,
        ocrConfidence: proposal.ocrData?.confidenceScore || 0,
        createdAt: now,
        updatedAt: now,
      };
      break;
    }
    default: {
      createdDoc = buildDocumentRecord(userId, {
        ...fields,
        name: fields.name || 'Documento OCR',
        category: fields.category || dest.documentCategory || 'other',
        entryMethod: 'ocr',
        ocrData: proposal.ocrData,
        ocrImageBase64: proposal.sourceImageBase64 || '',
        ocrProcessedAt: now,
        ocrConfidence: proposal.ocrData?.confidenceScore || 0,
        linkedModule: dest.module,
      });
      break;
    }
  }

  if (createdDoc) {
    const result = await putDocument(fakeReq, db, createdDoc._id, createdDoc);
    logger.info({ tag: 'OCR-ROUTE', action: dest.action, docId: createdDoc._id, db: db }, 'Document created via OCR');

    let sideEffects = null;

    if (dest.action === 'create_purchase_invoice' || dest.action === 'create_delivery_note') {
      try {
        const { rememberSupplierProductAliasesFromLines } = await import('./supplierProductAliasService.js');
        await rememberSupplierProductAliasesFromLines(
          fakeReq,
          userId,
          createdDoc.supplierId || fields.supplierId || '',
          createdDoc.lines || fields.lines || [],
        );
      } catch (aliasErr) {
        logger.warn({ tag: 'OCR-ALIAS', err: aliasErr?.message }, 'No se pudieron guardar aliases proveedor');
      }
      sideEffects = await reconcilePurchaseInvoiceFromOcr(fakeReq, userId, createdDoc, {
        performedBy: 'ocr-system',
        applyStock: Boolean(createdDoc.__loadToWarehouse),
        createFinance: true,
      });
      delete createdDoc.__loadToWarehouse;
    }

    if (dest.action === 'create_client_invoice') {
      try {
        const financeResult = await createFinanceCobroFromClientInvoice(fakeReq, userId, createdDoc);
        sideEffects = { financeMovementId: financeResult.movementId, financeSkipped: financeResult.skipped };
      } catch (err) {
        logger.warn({ tag: 'OCR-FINANCE', err: err?.message }, 'Client invoice finance cobro failed');
      }
    }

    if (
      dest.action === 'create_commercial_contract'
      || dest.action === 'create_rental_contract'
      || (dest.action === 'archive_document' && proposal.ocrData?.total > 0)
    ) {
      const ocrData = proposal.ocrData || {};
      const shouldSyncFinance = isRentalOcrDocument(ocrData)
        || Number(ocrData.total || ocrData.subtotal || 0) > 0;
      if (shouldSyncFinance) {
        try {
          const financeResult = await ensureFinanceFromDocumentOcr(fakeReq, userId, ocrData, {
            documentId: createdDoc._id,
            documentCategory: fields.category || dest.documentCategory || '',
            workCenterId: fields.workCenterId || fields.costCenterId || '',
            workCenterName: fields.workCenterName || fields.costCenterName || '',
            businessId: fields.businessId || '',
            businessName: fields.businessName || '',
          });
          sideEffects = { ...(sideEffects || {}), ...financeResult };
        } catch (err) {
          logger.warn({ tag: 'OCR-RENT-FINANCE', err: err?.message }, 'Document finance sync failed');
        }
      }
    }

    return { documentId: createdDoc._id, database: db, rev: result.rev, sideEffects };
  }

  throw new Error('Unhandled action: ' + dest.action);
}

// ---- Full OCR processing pipeline ----

export async function processOcrResult(params) {
  var ocrData = params.ocrData;
  var userId = params.userId;
  var sourceFileName = params.sourceFileName;
  var sourceMimeType = params.sourceMimeType;
  var sourceSize = params.sourceSize;
  var sourceHash = params.sourceHash;
  var sourceImageBase64 = params.sourceImageBase64;
  var processingTimeMs = params.processingTimeMs;
  var tokensUsed = params.tokensUsed;
  var model = params.model;
  var forceDuplicate = params.forceDuplicate;

  const logsDb = getOcrLogsDbName();
  await ensureDatabase(fakeReq, logsDb);

  // 1. Duplicate check
  const dup = await checkDuplicate(sourceHash, ocrData, userId);
  if (dup.isDuplicate && !forceDuplicate) {
    const log = buildOcrLogDocument(userId, {
      sourceFileName: sourceFileName,
      sourceMimeType: sourceMimeType,
      sourceSize: sourceSize,
      sourceHash: sourceHash,
      detectedDocumentType: ocrData?.documentType || 'otro',
      confidence: ocrData?.confidenceScore || 0,
      ocrData: ocrData,
      processingTimeMs: processingTimeMs,
      tokensUsed: tokensUsed,
      model: model,
      isDuplicate: true,
      duplicateOf: dup.original?.logId,
      status: 'duplicate',
    });
    await putDocument(fakeReq, logsDb, log._id, log);

    return {
      status: 'duplicate',
      duplicate: dup,
      log: sanitizeOcrLog(log),
      proposal: null,
    };
  }

  // 2. Classify
  const destination = classifyDocument(ocrData);

  // 3. Match entities
  const entityMatches = await matchEntities(ocrData, userId);
  const primaryEntity = entityMatches[0] || null;

  // 4. Validate
  const validation = validateOcrData(ocrData);

  // 5. Generate fingerprint
  const ocrFingerprint = await generateOcrFingerprint(ocrData);

  // 6. Build proposal
  const proposalFields = await buildProposalFieldsAsync(ocrData, destination, primaryEntity, userId);
  const autoApproved = shouldAutoApprove(ocrData, entityMatches, validation);

  const proposal = buildOcrProposalDocument(userId, {
    destination: destination,
    fields: proposalFields,
    entity: primaryEntity ? {
      type: primaryEntity.matchType,
      id: primaryEntity.matchedEntity?._id || '',
      name: primaryEntity.matchedEntity?.name || '',
      confidence: primaryEntity.confidence,
    } : null,
    warnings: validation.warnings,
    status: autoApproved ? 'auto_approved' : 'pending_review',
    autoApproved: autoApproved,
    sourceFileName: sourceFileName,
    sourceImageBase64: sourceImageBase64 || '',
    ocrData: ocrData,
    forceDuplicate: Boolean(forceDuplicate),
  });

  await putDocument(fakeReq, logsDb, proposal._id, proposal);

  // 7. Build log
  const log = buildOcrLogDocument(userId, {
    sourceFileName: sourceFileName,
    sourceMimeType: sourceMimeType,
    sourceSize: sourceSize,
    sourceHash: sourceHash,
    ocrFingerprint: ocrFingerprint,
    detectedDocumentType: ocrData?.documentType || 'otro',
    confidence: ocrData?.confidenceScore || 0,
    ocrData: ocrData,
    processingTimeMs: processingTimeMs,
    tokensUsed: tokensUsed,
    model: model,
    matchedEntities: entityMatches.map(function (m) {
      return { type: m.matchType, id: m.matchedEntity?._id, name: m.matchedEntity?.name, confidence: m.confidence };
    }),
    warnings: validation.warnings,
    errors: validation.errors,
    status: autoApproved ? 'auto_approved' : 'pending_review',
    proposalId: proposal._id,
  });
  await putDocument(fakeReq, logsDb, log._id, log);

  // 8. If auto-approved, execute immediately
  var routeResult = null;
  if (autoApproved) {
    try {
      routeResult = await executeProposal(proposal, userId);
      var updatedLog = Object.assign({}, log, {
        routedTo: { module: destination.module, database: destination.database, documentId: routeResult.documentId, action: destination.action },
        status: 'completed',
      });
      await putDocument(fakeReq, logsDb, log._id, updatedLog);

      var updatedProposal = Object.assign({}, proposal, {
        status: 'auto_approved',
        createdDocumentId: routeResult.documentId,
        createdDocumentDb: routeResult.database,
        approvedAt: new Date().toISOString(),
      });
      await putDocument(fakeReq, logsDb, proposal._id, updatedProposal);
    } catch (err) {
      logger.error({ tag: 'OCR-ROUTE', error: err.message, proposalId: proposal._id }, 'Auto-route failed');
      routeResult = null;
    }
  }

  return {
    status: autoApproved ? 'auto_approved' : 'pending_review',
    log: sanitizeOcrLog(log),
    proposal: sanitizeOcrProposal(proposal),
    destination: destination,
    entityMatches: entityMatches,
    validation: validation,
    routeResult: routeResult,
    duplicate: null,
  };
}
