import {
  getCatalogDbName,
  buildPurchaseInvoiceDocument,
  sanitizePurchaseInvoice,
  listPurchaseInvoicesByUser,
  normalizePurchaseListLimit,
  assignPurchaseInvoiceNumber,
  findDuplicatePurchaseInvoice,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getFinanceDbName,
  buildFinanceDocument,
  sanitizeFinance,
  listPointsOfSaleByUser,
  getDeliveryDbName,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';
import { testImapConnection } from '../services/imapService.js';
import { processIncomingEmails, runOcrOnBuffer } from '../services/supplierInvoiceProcessor.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function publicInvoiceEmailConfig(config = {}) {
  return {
    enabled: Boolean(config.enabled),
    imapSyncFrom: config.imapSyncFrom || '',
    imapCursorUid: Number(config.imapCursorUid || 0),
    imapHost: config.imapHost || '',
    imapPort: Number(config.imapPort || 993),
    imapUser: config.imapUser || '',
    imapPassword: config.imapPassword ? '••••••••' : '',
    imapTls: config.imapTls !== false,
    pollIntervalMinutes: Number(config.pollIntervalMinutes || 5),
    autoCreateFinance: Boolean(config.autoCreateFinance),
    defaultCategory: config.defaultCategory || 'proveedores',
    defaultPaymentTermsDays: Number(config.defaultPaymentTermsDays || 30),
    maxAttachmentSizeMb: Number(config.maxAttachmentSizeMb || 25),
    alertConfig: {
      duplicateEnabled: config.alertConfig?.duplicateEnabled !== false,
      noAttachmentEnabled: config.alertConfig?.noAttachmentEnabled !== false,
      unknownSupplierEnabled: config.alertConfig?.unknownSupplierEnabled !== false,
      ocrFailedEnabled: config.alertConfig?.ocrFailedEnabled !== false,
      overdueEnabled: config.alertConfig?.overdueEnabled !== false,
    },
  };
}

function mergeInvoiceEmailConfig(existing = {}, config = {}) {
  const enablingNow = config.enabled === true && existing.enabled !== true;
  return {
    enabled: config.enabled !== undefined ? Boolean(config.enabled) : existing.enabled,
    imapHost: config.imapHost !== undefined ? String(config.imapHost).trim() : existing.imapHost,
    imapPort: config.imapPort !== undefined ? Number(config.imapPort) : existing.imapPort,
    imapUser: config.imapUser !== undefined ? String(config.imapUser).trim() : existing.imapUser,
    imapPassword: config.imapPassword && config.imapPassword !== '••••••••'
      ? String(config.imapPassword).replace(/\s+/g, '').trim()
      : existing.imapPassword,
    imapTls: config.imapTls !== undefined ? Boolean(config.imapTls) : existing.imapTls,
    imapSyncFrom: config.resetSyncFrom
      ? new Date().toISOString()
      : (existing.imapSyncFrom || (enablingNow || config.enabled ? existing.imapSyncFrom || new Date().toISOString() : existing.imapSyncFrom)),
    imapCursorUid: config.resetSyncFrom ? 0 : (existing.imapCursorUid || 0),
    pollIntervalMinutes: config.pollIntervalMinutes !== undefined
      ? Math.max(1, Number(config.pollIntervalMinutes))
      : existing.pollIntervalMinutes,
    autoCreateFinance: config.autoCreateFinance !== undefined ? Boolean(config.autoCreateFinance) : existing.autoCreateFinance,
    defaultCategory: config.defaultCategory || existing.defaultCategory || 'proveedores',
    defaultPaymentTermsDays: config.defaultPaymentTermsDays !== undefined
      ? Number(config.defaultPaymentTermsDays)
      : existing.defaultPaymentTermsDays,
    maxAttachmentSizeMb: config.maxAttachmentSizeMb !== undefined
      ? Number(config.maxAttachmentSizeMb)
      : existing.maxAttachmentSizeMb,
    alertConfig: {
      ...(existing.alertConfig || {}),
      ...(config.alertConfig || {}),
    },
  };
}

async function loadOwnedPdv(req, userId, pdvId) {
  const id = String(pdvId || '').trim();
  if (!id) return null;
  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, id);
  if (!doc || doc.type !== 'point_of_sale' || doc.deletedAt) return null;
  // Misma regla que el resto del TPV (no solo user_id exacto).
  const { pdvDocMatchesUser } = await import('../services/couchdb.js');
  if (!pdvDocMatchesUser(doc, userId)) return null;
  return doc;
}

async function ensureInvoiceOwner(req, userId, invoiceId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, invoiceId);
  if (!doc || doc.type !== 'purchase_invoice' || doc.user_id !== userId) return null;
  return doc;
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function listSupplierInvoices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    let raw = await listPurchaseInvoicesByUser(req, userId, {
      limit: normalizePurchaseListLimit(req.query?.limit),
    });

    const { status, supplierId, source, from, to } = req.query;
    if (status) raw = raw.filter((inv) => inv.status === status);
    if (supplierId) raw = raw.filter((inv) => inv.supplierId === supplierId);
    if (source) raw = raw.filter((inv) => inv.source === source);
    if (from) raw = raw.filter((inv) => inv.date >= from);
    if (to) raw = raw.filter((inv) => inv.date <= to);

    const { items, meta } = applyQueryOptions(
      raw.map((inv) => sanitizePurchaseInvoice(inv, { forList: true })),
      req.query,
    );
    return res.json({ ok: true, invoices: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar facturas' });
  }
}

// ─── GET ONE ──────────────────────────────────────────────────────────────────

export async function getSupplierInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const doc = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    return res.json({ ok: true, invoice: sanitizePurchaseInvoice(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar factura' });
  }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createSupplierInvoice(req, res) {
  try {
    const { userId } = req.params;
    const { invoice } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!invoice || typeof invoice !== 'object') return badRequest(res, 'Falta el objeto invoice');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const forceDuplicate = Boolean(invoice.forceDuplicate);
    const invoiceNumber = await assignPurchaseInvoiceNumber(req, userId, invoice);
    if (invoiceNumber && !forceDuplicate) {
      const dup = await findDuplicatePurchaseInvoice(req, userId, invoiceNumber, invoice.supplierId || '', invoice.total);
      if (dup) {
        return res.status(409).json({
          ok: false,
          error: `Factura duplicada: ya existe el código ${dup.invoiceNumber}`,
          code: 'DUPLICATE_INVOICE',
          existingInvoice: sanitizePurchaseInvoice(dup),
        });
      }
    }

    const db = getCatalogDbName();
    await ensureDatabase(req, db);
    const doc = buildPurchaseInvoiceDocument(userId, {
      ...invoice,
      invoiceNumber,
      source: invoice.source || 'manual',
      flags: {
        ...(invoice.flags || {}),
        duplicate: forceDuplicate,
        stockPending: invoice.loadToWarehouse ? false : true,
      },
      duplicateWarning: forceDuplicate,
    });
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'supplier_invoice',
      action: `Creó factura proveedor ${doc.invoiceNumber} — ${doc.supplierName}`,
      entityId: doc._id,
      entityLabel: `${doc.invoiceNumber} — ${doc.supplierName}`.trim(),
      metadata: { total: doc.total, status: doc.status, source: doc.source },
    });

    return res.status(201).json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear factura' });
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateSupplierInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const { invoice } = req.body || {};
    if (!invoice || typeof invoice !== 'object') return badRequest(res, 'Faltan datos de la factura');

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    const doc = buildPurchaseInvoiceDocument(userId, { ...existing, ...invoice }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'supplier_invoice',
      action: `Actualizó factura proveedor ${doc.invoiceNumber} → ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.invoiceNumber} — ${doc.supplierName}`.trim(),
      metadata: { total: doc.total, status: doc.status },
    });

    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar factura' });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function removeSupplierInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await softDeleteDocument(req, db, invoiceId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'supplier_invoice',
      action: `Eliminó factura proveedor ${existing.invoiceNumber}`,
      entityId: existing._id,
      entityLabel: `${existing.invoiceNumber} — ${existing.supplierName}`.trim(),
      metadata: {},
    });

    return res.json({ ok: true, id: invoiceId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar factura' });
  }
}

// ─── APPROVE ──────────────────────────────────────────────────────────────────

export async function approveSupplierInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const { reviewNotes } = req.body || {};

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    if (!['pending', 'pending_review', 'corrected'].includes(existing.status)) {
      return badRequest(res, `No se puede aprobar una factura en estado "${existing.status}"`);
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    const doc = buildPurchaseInvoiceDocument(userId, {
      ...existing,
      status: 'approved',
      reviewNotes: reviewNotes || existing.reviewNotes || '',
      reviewedBy: account.fullName || userId,
      reviewedAt: new Date().toISOString(),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'supplier_invoice',
      action: `Aprobó factura proveedor ${doc.invoiceNumber} de ${doc.supplierName}`,
      entityId: doc._id,
      entityLabel: `${doc.invoiceNumber} — ${doc.supplierName}`.trim(),
      metadata: { total: doc.total },
    });

    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aprobar factura' });
  }
}

// ─── REJECT ───────────────────────────────────────────────────────────────────

export async function rejectSupplierInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const { reviewNotes } = req.body || {};

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    const doc = buildPurchaseInvoiceDocument(userId, {
      ...existing,
      status: 'rejected',
      reviewNotes: reviewNotes || '',
      reviewedBy: account.fullName || userId,
      reviewedAt: new Date().toISOString(),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'supplier_invoice',
      action: `Rechazó factura proveedor ${doc.invoiceNumber}`,
      entityId: doc._id,
      entityLabel: `${doc.invoiceNumber} — ${doc.supplierName}`.trim(),
      metadata: { reviewNotes: reviewNotes || '' },
    });

    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al rechazar factura' });
  }
}

// ─── LINK TO FINANCE ──────────────────────────────────────────────────────────

export async function linkToFinance(req, res) {
  try {
    const { userId, invoiceId } = req.params;

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    if (existing.linkedFinanceId) {
      return res.status(409).json({ ok: false, error: 'Esta factura ya tiene un movimiento financiero vinculado', movementId: existing.linkedFinanceId });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const financeDb = getFinanceDbName();
    await ensureDatabase(req, financeDb);

    const movementData = {
      type: 'pago',
      concept: `Factura ${existing.invoiceNumber || invoiceId} — ${existing.supplierName || 'Proveedor'}`.trim(),
      reference: existing.invoiceNumber || '',
      category: existing.proposedCategory || 'proveedores',
      amountBase: Number(existing.subtotal || 0),
      taxRate: Number(existing.taxRate || 21),
      date: existing.date || new Date().toISOString().slice(0, 10),
      payMethod: existing.proposedPayMethod || '',
      companyName: existing.supplierName || '',
      notes: `Generado automáticamente desde factura proveedor ${existing.invoiceNumber}`,
      source: 'supplier_invoice',
      sourceRef: invoiceId,
    };

    const finDoc = buildFinanceDocument(userId, movementData);
    const finSaved = await putDocument(req, financeDb, finDoc._id, finDoc);

    const catalogDb = getCatalogDbName();
    const updated = buildPurchaseInvoiceDocument(userId, {
      ...existing,
      linkedFinanceId: finDoc._id,
      paymentStatus: 'unpaid',
    }, existing);
    const invSaved = await putDocument(req, catalogDb, updated._id, updated);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'supplier_invoice',
      action: `Vinculó factura ${existing.invoiceNumber} a movimiento financiero (${finDoc.totalAmount}€)`,
      entityId: existing._id,
      entityLabel: `${existing.invoiceNumber} — ${existing.supplierName}`.trim(),
      metadata: { financeId: finDoc._id, total: finDoc.totalAmount },
    });

    return res.status(201).json({
      ok: true,
      invoice: sanitizePurchaseInvoice({ ...updated, _rev: invSaved.rev }),
      movement: sanitizeFinance({ ...finDoc, _rev: finSaved.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al vincular con finanzas' });
  }
}

// ─── STATS ────────────────────────────────────────────────────────────────────

export async function supplierInvoiceStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const invoices = (await listPurchaseInvoicesByUser(req, userId)).filter((i) => !i.deletedAt);

    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);

    const stats = {
      totalPendingReview: 0,
      totalApproved: 0,
      totalRejected: 0,
      totalPaid: 0,
      amountPendingPayment: 0,
      amountOverdue: 0,
      amountPaidTotal: 0,
      processedThisMonth: 0,
      fromEmail: 0,
      flagsDuplicate: 0,
      flagsSupplierNotFound: 0,
    };

    for (const inv of invoices) {
      if (inv.status === 'pending_review' || inv.status === 'pending') stats.totalPendingReview++;
      else if (inv.status === 'approved' || inv.status === 'corrected') stats.totalApproved++;
      else if (inv.status === 'rejected') stats.totalRejected++;
      else if (inv.status === 'paid') stats.totalPaid++;

      const total = Number(inv.total || 0);
      if (inv.paymentStatus === 'unpaid' || inv.paymentStatus === 'partial') stats.amountPendingPayment += total;
      if (inv.paymentStatus === 'overdue') stats.amountOverdue += total;
      if (inv.paymentStatus === 'paid') stats.amountPaidTotal += total;

      if ((inv.createdAt || '').startsWith(thisMonth)) stats.processedThisMonth++;
      if (inv.source === 'email') stats.fromEmail++;
      if (inv.flags?.duplicate) stats.flagsDuplicate++;
      if (inv.flags?.supplierNotFound) stats.flagsSupplierNotFound++;
    }

    return res.json({ ok: true, stats });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estadísticas' });
  }
}

// ─── POLL NOW ─────────────────────────────────────────────────────────────────

export async function pollNow(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const pdvId = String(req.body?.pdvId || req.query?.pdvId || '').trim();
    const summary = await processIncomingEmails(userId, undefined, pdvId ? { pdvId } : {});
    return res.json({ ok: true, summary });
  } catch (error) {
    const raw = String(error?.message || error || 'Error al ejecutar polling');
    let friendly = raw;
    if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT|aborted/i.test(raw)) {
      friendly = 'La sincronización tardó demasiado. Marca como leídos los correos viejos (deja solo facturas nuevas) y reintenta.';
    } else if (/authentication|invalid credentials|login failed|auth/i.test(raw)) {
      friendly = 'No se pudo entrar al correo. Revisa la contraseña de aplicación y vuelve a guardar.';
    } else if (/IMAP no configurado/i.test(raw)) {
      friendly = 'IMAP incompleto. Guarda correo, servidor y contraseña de aplicación.';
    }
    return res.status(500).json({ ok: false, error: friendly });
  }
}

// ─── RESCAN OCR ───────────────────────────────────────────────────────────────

export async function rescanInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const attachments = existing.attachments || [];
    if (attachments.length === 0) {
      return badRequest(res, 'La factura no tiene adjuntos para re-escanear');
    }

    const mainAttachment = attachments[0];
    const db = getCatalogDbName();
    const encodedDb = encodeURIComponent(db);
    const encodedId = encodeURIComponent(invoiceId);
    const encodedFilename = encodeURIComponent(mainAttachment.couchAttachmentId || mainAttachment.filename);

    let attBuffer;
    try {
      const { couchRequest } = await import('../services/couchdb.js');
      const attResponse = await couchRequest(req, `/${encodedDb}/${encodedId}/${encodedFilename}`);
      if (!attResponse.ok) throw new Error(`HTTP ${attResponse.status}`);
      attBuffer = Buffer.from(await attResponse.arrayBuffer());
    } catch (err) {
      return res.status(500).json({ ok: false, error: `No se pudo leer el adjunto: ${err.message}` });
    }

    let ocrData;
    try {
      ocrData = await runOcrOnBuffer(attBuffer, mainAttachment.mimeType);
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Error de OCR: ${err.message}` });
    }

    const updates = {};
    if (ocrData.documentNumber && !existing.invoiceNumber) updates.invoiceNumber = ocrData.documentNumber;
    if (ocrData.date && !existing.date) updates.date = ocrData.date;
    if (ocrData.dueDate && !existing.dueDate) updates.dueDate = ocrData.dueDate;
    if (ocrData.lines && (!existing.lines || existing.lines.length === 0)) updates.lines = ocrData.lines;
    if (ocrData.taxRate != null) updates.taxRate = ocrData.taxRate;
    if (ocrData.emitter && !existing.supplierName) updates.supplierName = ocrData.emitter;
    if (ocrData.emitterCIF && !existing.supplierCif) updates.supplierCif = ocrData.emitterCIF;

    const doc = buildPurchaseInvoiceDocument(userId, {
      ...existing,
      ...updates,
      ocrData,
      ocrConfidence: ocrData.confidenceScore >= 70 ? 'high' : 'low',
      flags: { ...existing.flags, ocrFailed: Boolean(ocrData.parseError) },
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, invoice: sanitizePurchaseInvoice({ ...doc, _rev: saved.rev }), ocrData });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al re-escanear factura' });
  }
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

/** Resumen por PDV: conectado / no, sin contraseña. */
export async function listPdvEmailConfigs(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const pdvs = await listPointsOfSaleByUser(req, userId);
    const items = (pdvs || [])
      .filter((p) => p && !p.deletedAt && p.active !== false)
      .map((p) => {
        const cfg = p.supplierInvoiceConfig || {};
        const host = String(cfg.imapHost || '').trim();
        const user = String(cfg.imapUser || '').trim();
        const connected = Boolean(cfg.enabled && host && user && cfg.imapPassword);
        return {
          pdvId: p._id,
          name: p.name || '',
          code: p.code || '',
          workCenterId: p.workCenterId || '',
          businessId: p.businessId || p.business_id || '',
          connected,
          enabled: Boolean(cfg.enabled),
          imapUser: user,
          imapHost: host,
        };
      });

    const legacy = publicInvoiceEmailConfig(account.supplierInvoiceConfig || {});
    const legacyConnected = Boolean(
      legacy.enabled && legacy.imapHost && legacy.imapUser && account.supplierInvoiceConfig?.imapPassword,
    );

    return res.json({
      ok: true,
      pdvs: items,
      legacyAccount: { connected: legacyConnected, config: legacy },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar configs PDV' });
  }
}

export async function getConfig(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const pdvId = String(req.query?.pdvId || '').trim();
    if (pdvId) {
      const pdv = await loadOwnedPdv(req, userId, pdvId);
      if (!pdv) return res.status(404).json({ ok: false, error: 'PDV no encontrado' });
      return res.json({
        ok: true,
        pdvId,
        config: publicInvoiceEmailConfig(pdv.supplierInvoiceConfig || {}),
      });
    }

    // Legado: config a nivel cuenta
    return res.json({
      ok: true,
      config: publicInvoiceEmailConfig(account.supplierInvoiceConfig || {}),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener configuración' });
  }
}

export async function updateConfig(req, res) {
  try {
    const { userId } = req.params;
    const { config, pdvId: bodyPdvId } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!config || typeof config !== 'object') return badRequest(res, 'Falta el objeto config');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const pdvId = String(bodyPdvId || req.query?.pdvId || '').trim();

    if (config.enabled) {
      const { isImapConfigured } = await import('../services/imapService.js');
      let existingPass = '';
      let draftHost = config.imapHost !== undefined ? String(config.imapHost).trim() : '';
      let draftUser = config.imapUser !== undefined ? String(config.imapUser).trim() : '';
      let draftPass = config.imapPassword && config.imapPassword !== '••••••••'
        ? String(config.imapPassword)
        : '';

      if (pdvId) {
        const pdv = await loadOwnedPdv(req, userId, pdvId);
        if (!pdv) return res.status(404).json({ ok: false, error: 'PDV no encontrado' });
        existingPass = String(pdv.supplierInvoiceConfig?.imapPassword || '');
        if (!draftHost) draftHost = String(pdv.supplierInvoiceConfig?.imapHost || '').trim();
        if (!draftUser) draftUser = String(pdv.supplierInvoiceConfig?.imapUser || '').trim();
        if (!draftPass) draftPass = existingPass;
      } else {
        existingPass = String(account.supplierInvoiceConfig?.imapPassword || '');
        if (!draftHost) draftHost = String(account.supplierInvoiceConfig?.imapHost || '').trim();
        if (!draftUser) draftUser = String(account.supplierInvoiceConfig?.imapUser || '').trim();
        if (!draftPass) draftPass = existingPass;
      }

      const hasImap = Boolean(draftHost && draftUser && draftPass);
      if (!hasImap && !isImapConfigured({})) {
        return badRequest(res, 'Configura servidor IMAP o las variables SUPPLIER_INVOICE_IMAP_* en el servidor');
      }
    }

    if (pdvId) {
      const pdv = await loadOwnedPdv(req, userId, pdvId);
      if (!pdv) return res.status(404).json({ ok: false, error: 'PDV no encontrado' });
      const existing = pdv.supplierInvoiceConfig || {};
      const updated = mergeInvoiceEmailConfig(existing, config);

      // Aviso suave: mismo buzón en otro PDV del mismo usuario (no bloquea).
      let duplicatePdvNames = [];
      try {
        const allPdvs = await listPointsOfSaleByUser(req, userId);
        const emailNorm = String(updated.imapUser || '').trim().toLowerCase();
        if (emailNorm && updated.enabled) {
          duplicatePdvNames = (allPdvs || [])
            .filter((p) => p && !p.deletedAt && p._id !== pdvId)
            .filter((p) => {
              const other = p.supplierInvoiceConfig || {};
              return (
                other.enabled
                && String(other.imapUser || '').trim().toLowerCase() === emailNorm
              );
            })
            .map((p) => p.name || p.code || p._id);
        }
      } catch {
        duplicatePdvNames = [];
      }

      const db = getDeliveryDbName();
      pdv.supplierInvoiceConfig = updated;
      pdv.updatedAt = new Date().toISOString();
      await putDocument(req, db, pdv._id, pdv);

      try {
        await logAccountActivity(req, {
          actorUserId: userId,
          actorName: account.fullName,
          targetUserId: userId,
          type: 'supplier_invoice_config',
          action: `Actualizó correo de facturas del PDV ${pdv.name || pdvId}`,
          entityId: pdv._id,
          entityLabel: 'Configuración IMAP PDV',
          metadata: { enabled: updated.enabled, pdvId },
        });
      } catch (logErr) {
        console.warn('[supplierInvoice] logAccountActivity PDV:', logErr?.message || logErr);
      }

      return res.json({
        ok: true,
        pdvId,
        config: publicInvoiceEmailConfig(updated),
        ...(duplicatePdvNames.length
          ? {
              warning: `El mismo correo también está en: ${duplicatePdvNames.join(', ')}`,
              duplicatePdvNames,
            }
          : {}),
      });
    }

    // Legado cuenta
    const existing = account.supplierInvoiceConfig || {};
    const updated = mergeInvoiceEmailConfig(existing, config);
    const { ACCOUNTS_DB } = await import('../services/couchdb.js');
    await ensureDatabase(req, ACCOUNTS_DB);
    const accountDoc = await getDocument(req, ACCOUNTS_DB, account._id);
    accountDoc.supplierInvoiceConfig = updated;
    await putDocument(req, ACCOUNTS_DB, accountDoc._id, accountDoc);

    try {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName,
        targetUserId: userId,
        type: 'supplier_invoice_config',
        action: `Actualizó configuración de facturas proveedor por email`,
        entityId: account._id,
        entityLabel: 'Configuración IMAP',
        metadata: { enabled: updated.enabled },
      });
    } catch (logErr) {
      console.warn('[supplierInvoice] logAccountActivity cuenta:', logErr?.message || logErr);
    }

    return res.json({
      ok: true,
      config: publicInvoiceEmailConfig(updated),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al guardar configuración' });
  }
}

// ─── TEST IMAP ────────────────────────────────────────────────────────────────

export async function testImap(req, res) {
  try {
    const body = req.body || {};
    let overrides = {
      host: body.host,
      port: body.port,
      user: body.user,
      pass: body.pass,
      tls: body.tls,
    };

    const passBlank =
      !String(overrides.pass || '').trim()
      || String(overrides.pass) === '••••••••';
    const userId = String(body.userId || req.params?.userId || '').trim();
    const pdvId = String(body.pdvId || '').trim();
    if (passBlank && userId) {
      if (pdvId) {
        const pdv = await loadOwnedPdv(req, userId, pdvId);
        const saved = pdv?.supplierInvoiceConfig || {};
        overrides = {
          host: overrides.host || saved.imapHost,
          port: overrides.port || saved.imapPort || 993,
          user: overrides.user || saved.imapUser,
          pass: saved.imapPassword || '',
          tls: overrides.tls !== undefined ? overrides.tls : saved.imapTls !== false,
        };
      } else {
        const account = await findAccountByUserId(req, userId);
        const saved = account?.supplierInvoiceConfig || {};
        overrides = {
          host: overrides.host || saved.imapHost,
          port: overrides.port || saved.imapPort || 993,
          user: overrides.user || saved.imapUser,
          pass: saved.imapPassword || '',
          tls: overrides.tls !== undefined ? overrides.tls : saved.imapTls !== false,
        };
      }
    }

    const passClean = String(overrides.pass || '').replace(/\s+/g, '').trim();
    if (!passClean) {
      return res.json({
        ok: false,
        error: 'Falta la contraseña de aplicación. Vuelve a escribirla y guarda antes de probar.',
      });
    }
    overrides.pass = passClean;
    if (overrides.user) overrides.user = String(overrides.user).trim();
    if (overrides.host) overrides.host = String(overrides.host).trim();

    const result = await testImapConnection(overrides);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al probar IMAP' });
  }
}
