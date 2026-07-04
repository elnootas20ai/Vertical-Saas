/**
 * Sincroniza contratos de alquiler y documentos societarios/fiscales con finanzas.
 */
import {
  buildFinanceDocument,
  ensureDatabase,
  getFinanceDbName,
  getAllDocuments,
  putDocument,
} from './couchdb.js';

function normalizeTextParts(ocrData = {}) {
  return [
    ocrData.documentType,
    ocrData.documentTypeLabel,
    ocrData.notes,
    ocrData.emitter,
    ocrData.receiver,
    ocrData.contractDuration,
    ...(ocrData.lines || []).map((l) => l.description || l.itemName || ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isRentalOcrDocument(ocrData = {}) {
  const docType = String(ocrData.documentType || '').trim();
  if (docType === 'contrato_alquiler') return true;
  const text = normalizeTextParts(ocrData);
  return ['alquiler', 'arrendamiento', 'arrendador', 'arrendatario', 'canon', 'renta mensual', 'local comercial']
    .some((kw) => text.includes(kw));
}

export function parseMonthlyRentFromOcr(ocrData = {}) {
  for (const line of ocrData.lines || []) {
    const desc = String(line.description || line.itemName || '').toLowerCase();
    if (/renta|alquiler|canon|mensual/i.test(desc)) {
      const qty = Number(line.quantity || 1) || 1;
      const unit = Number(line.unitPrice || 0);
      const total = Number(line.total || 0);
      const amt = total > 0 ? total : unit * qty;
      if (amt > 0) return amt;
    }
  }
  const total = Number(ocrData.total || 0);
  if (total > 0) return total;
  const subtotal = Number(ocrData.subtotal || 0);
  if (subtotal > 0) return subtotal;
  return 0;
}

/** Renta mensual con IVA 21% incluido en el importe indicado (local comercial). */
export function rentAmountsFromMonthlyTotal(monthlyTotal) {
  const gross = Number(monthlyTotal) || 0;
  if (gross <= 0) return null;
  const amountBase = Number((gross / 1.21).toFixed(2));
  const taxAmount = Number((gross - amountBase).toFixed(2));
  return { amountBase, taxRate: 21, taxAmount, totalAmount: gross };
}

export function resolveDocumentFinanceCategory(ocrData = {}, documentCategory = '') {
  if (isRentalOcrDocument(ocrData)) return 'alquiler';
  const text = normalizeTextParts(ocrData);
  if (/modelo\s*\d{3}|iva|impuesto|hacienda|aeat|retencion|autoliquidacion/.test(text)) return 'impuestos';
  if (/notar|estatutos|constitucion|registro mercantil|iae|cif|escritura de sociedad|capital social/.test(text)) {
    return 'asesoria';
  }
  if (documentCategory === 'financial') return 'impuestos';
  if (documentCategory === 'contracts' && isRentalOcrDocument(ocrData)) return 'alquiler';
  return 'otros_gastos';
}

function scopeFromContext(ctx = {}) {
  return {
    businessId: String(ctx.businessId || ctx.business_id || '').trim(),
    businessName: String(ctx.businessName || ctx.business_name || '').trim(),
    workCenterId: String(ctx.workCenterId || ctx.workCenter_id || ctx.costCenterId || '').trim(),
    workCenterName: String(ctx.workCenterName || ctx.workCenter_name || ctx.costCenterName || '').trim(),
  };
}

function currentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function rentDueDateForMonth(monthKey, contractStartDate) {
  const day = contractStartDate ? new Date(contractStartDate).getDate() : 1;
  const safeDay = Number.isFinite(day) && day >= 1 && day <= 28 ? day : 1;
  const [y, m] = monthKey.split('-').map(Number);
  const due = new Date(y, m - 1, safeDay);
  return due.toISOString().slice(0, 10);
}

async function findMovementByReference(req, userId, reference) {
  const financeDb = getFinanceDbName();
  await ensureDatabase(req, financeDb);
  const all = await getAllDocuments(req, financeDb);
  return all.find(
    (m) =>
      !m.deletedAt &&
      m.user_id === userId &&
      m.reference === reference &&
      (m.type === 'pago' || m.type === 'cobro'),
  ) || null;
}

async function upsertFinanceMovement(req, userId, reference, movementData, existing = null) {
  const financeDb = getFinanceDbName();
  await ensureDatabase(req, financeDb);
  if (existing?.status === 'paid') {
    return { movementId: existing._id, rev: existing._rev, created: false, skipped: true };
  }
  const doc = buildFinanceDocument(userId, movementData, existing || undefined);
  doc.reference = reference;
  const saved = await putDocument(req, financeDb, doc._id, doc);
  return { movementId: doc._id, rev: saved.rev, created: !existing };
}

export async function ensureRentFinanceFromWorkCenter(req, userId, workCenter, scope = {}) {
  if (!userId || !workCenter?._id) return { skipped: true, reason: 'missing_work_center' };
  if (workCenter.ownership !== 'alquiler') return { skipped: true, reason: 'not_rented' };

  const monthly = Number(workCenter.contract?.monthlyPrice || 0);
  const deposit = Number(workCenter.contract?.deposit || 0);
  const amounts = rentAmountsFromMonthlyTotal(monthly);
  const monthKey = currentMonthKey();
  const results = { monthlyMovementId: null, depositMovementId: null, skipped: false };

  const financeScope = {
    ...scopeFromContext({
      ...scope,
      workCenterId: workCenter._id,
      workCenterName: workCenter.name,
      businessId: scope.businessId || workCenter.businessId || workCenter.business_id,
    }),
  };

  if (amounts) {
    const ref = `RENT-${workCenter._id}-${monthKey}`;
    const existing = await findMovementByReference(req, userId, ref);
    const landlord = String(workCenter.contract?.landlord || '').trim();
    const movement = await upsertFinanceMovement(
      req,
      userId,
      ref,
      {
        type: 'pago',
        concept: `Alquiler ${workCenter.name}${landlord ? ` — ${landlord}` : ''} (${monthKey})`,
        category: 'alquiler',
        amountBase: amounts.amountBase,
        taxRate: amounts.taxRate,
        taxAmount: amounts.taxAmount,
        totalAmount: amounts.totalAmount,
        date: `${monthKey}-01`,
        dueDate: rentDueDateForMonth(monthKey, workCenter.contract?.startDate),
        companyName: landlord,
        payMethod: 'transferencia',
        notes: `Contrato local ${workCenter._id}`,
        status: 'pending',
        source: 'rent_contract',
        sourceRef: workCenter._id,
        linkedDocuments: [{ id: workCenter._id, type: 'work_center', name: workCenter.name, url: '' }],
        ...financeScope,
      },
      existing,
    );
    results.monthlyMovementId = movement.movementId;
  }

  if (deposit > 0) {
    const depRef = `RENT-DEP-${workCenter._id}`;
    const existingDep = await findMovementByReference(req, userId, depRef);
    if (!existingDep) {
      const depAmounts = rentAmountsFromMonthlyTotal(deposit) || {
        amountBase: deposit,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: deposit,
      };
      const depMove = await upsertFinanceMovement(req, userId, depRef, {
        type: 'pago',
        concept: `Fianza alquiler ${workCenter.name}`,
        category: 'alquiler',
        amountBase: depAmounts.amountBase,
        taxRate: depAmounts.taxRate,
        taxAmount: depAmounts.taxAmount,
        totalAmount: depAmounts.totalAmount,
        date: workCenter.contract?.startDate || new Date().toISOString().slice(0, 10),
        companyName: String(workCenter.contract?.landlord || '').trim(),
        payMethod: 'transferencia',
        notes: `Fianza contrato ${workCenter._id}`,
        status: 'pending',
        source: 'rent_contract',
        sourceRef: `${workCenter._id}:deposit`,
        linkedDocuments: [{ id: workCenter._id, type: 'work_center', name: workCenter.name, url: '' }],
        ...financeScope,
      });
      results.depositMovementId = depMove.movementId;
    } else {
      results.depositMovementId = existingDep._id;
    }
  }

  return results;
}

export async function ensureFinanceFromDocumentOcr(req, userId, ocrData, options = {}) {
  const {
    documentId = '',
    documentCategory = '',
    workCenterId = '',
    workCenterName = '',
    businessId = '',
    businessName = '',
  } = options;

  const monthlyRent = parseMonthlyRentFromOcr(ocrData);
  const isRental = isRentalOcrDocument(ocrData);
  const grossAmount = monthlyRent || Number(ocrData.total || ocrData.subtotal || 0);
  if (grossAmount <= 0) return { skipped: true, reason: 'no_amount' };

  const category = isRental ? 'alquiler' : resolveDocumentFinanceCategory(ocrData, documentCategory);
  const amounts = category === 'alquiler'
    ? rentAmountsFromMonthlyTotal(grossAmount)
    : {
      amountBase: Number(ocrData.subtotal || grossAmount),
      taxRate: Number(ocrData.taxRate || 0),
      taxAmount: Number(ocrData.taxAmount || 0),
      totalAmount: Number(ocrData.total || grossAmount),
    };

  if (!amounts || amounts.totalAmount <= 0) return { skipped: true, reason: 'invalid_amounts' };

  const ref = documentId
    ? `DOC-OCR-${documentId}`
    : `DOC-OCR-${String(ocrData.documentNumber || ocrData.date || Date.now())}`;

  const existing = await findMovementByReference(req, userId, ref);
  if (existing) return { movementId: existing._id, skipped: true };

  const landlord = String(ocrData.emitter || ocrData.receiver || '').trim();
  const label = String(ocrData.documentTypeLabel || ocrData.documentType || 'Documento').trim();
  const concept = isRental
    ? `Alquiler — ${label}${landlord ? ` (${landlord})` : ''}`
    : `${label}${landlord ? ` — ${landlord}` : ''}`;

  const movement = await upsertFinanceMovement(req, userId, ref, {
    type: 'pago',
    concept,
    category,
    amountBase: amounts.amountBase,
    taxRate: amounts.taxRate,
    taxAmount: amounts.taxAmount || undefined,
    totalAmount: amounts.totalAmount,
    date: ocrData.date || new Date().toISOString().slice(0, 10),
    dueDate: ocrData.dueDate || ocrData.periodEnd || '',
    companyName: landlord,
    payMethod: '',
    notes: ocrData.notes || '',
    status: 'pending',
    source: 'ocr',
    sourceRef: documentId || ref,
    entryMethod: 'ocr',
    linkedDocuments: documentId
      ? [{ id: documentId, type: 'document', name: label, url: '' }]
      : [],
    ...scopeFromContext({
      businessId,
      businessName,
      workCenterId,
      workCenterName,
    }),
  });

  return { movementId: movement.movementId, skipped: false, category };
}
