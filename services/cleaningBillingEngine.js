import { v4 as uuidv4 } from 'uuid';
import {
  getInvoicesDbName,
  getCleaningDbName,
  getCleaningContractsDbName,
  getFinanceDbName,
  buildInvoiceDocument,
  sanitizeInvoice,
  buildFinanceDocument,
  buildCleaningContractDocument,
  buildCleaningServiceDocument,
  ensureDatabase,
  getAllDocuments,
  putDocument,
  findAccountByUserId,
  logAccountActivity,
} from './couchdb.js';

function getNextSequenceNumber(invoices) {
  const year = new Date().getFullYear();
  const yearInvoices = invoices.filter(
    (inv) => inv.number && inv.number.includes(String(year)),
  );
  let max = 0;
  for (const inv of yearInvoices) {
    const match = inv.number.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max + 1;
}

function buildInvoiceNumber(sequence, year) {
  const y = year || new Date().getFullYear();
  return `FAC-${y}-${String(sequence).padStart(4, '0')}`;
}

// ─── Generate invoices from completed services ────────────────────────────────

export async function generateInvoicesFromCompletedServices(req, userId) {
  const cleaningDb = getCleaningDbName();
  const invoiceDb = getInvoicesDbName();
  await ensureDatabase(req, cleaningDb);
  await ensureDatabase(req, invoiceDb);

  const allDocs = await getAllDocuments(req, cleaningDb);
  const unbilledServices = allDocs.filter(
    (doc) =>
      doc?.type === 'cleaning_service' &&
      !doc?.deletedAt &&
      doc?.user_id === userId &&
      doc?.status === 'completed' &&
      (!doc?.billingStatus || doc?.billingStatus === 'unbilled'),
  );

  if (unbilledServices.length === 0) return [];

  const grouped = {};
  for (const svc of unbilledServices) {
    const key = svc.clientId || svc.clientName || 'sin-cliente';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(svc);
  }

  const existingInvoices = await getAllDocuments(req, invoiceDb);
  const userInvoices = existingInvoices.filter(
    (d) => d?.type === 'client_invoice' && !d?.deletedAt && d?.user_id === userId,
  );
  let sequence = getNextSequenceNumber(userInvoices);

  const account = await findAccountByUserId(req, userId);
  const created = [];

  for (const [, services] of Object.entries(grouped)) {
    const first = services[0];
    const lines = services.map((svc, i) => ({
      id: `line-${i}`,
      description: `${svc.cleaningType || 'Limpieza'} — ${svc.address || svc.clientName || ''}${svc.date ? ` (${svc.date})` : ''}`,
      serviceId: svc._id,
      quantity: 1,
      unitPrice: Number(svc.price || 0),
      discountPercent: 0,
      taxRate: 21,
      lineTotal: Number(svc.price || 0),
    }));

    const number = buildInvoiceNumber(sequence++);
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const invoiceData = {
      clientId: first.clientId || '',
      clientName: first.clientName || '',
      clientEmail: first.clientEmail || '',
      clientNif: '',
      clientAddress: first.address || '',
      number,
      series: 'FAC',
      sequenceNumber: sequence - 1,
      date: now.toISOString(),
      dueDate: dueDate.toISOString().slice(0, 10),
      lines,
      status: 'pending',
      serviceIds: services.map((s) => s._id),
      origin: 'auto_service',
      vertical: 'cleaning',
      periodStart: services.reduce((min, s) => (!min || s.date < min ? s.date : min), ''),
      periodEnd: services.reduce((max, s) => (!max || s.date > max ? s.date : max), ''),
    };

    const doc = buildInvoiceDocument(userId, invoiceData);
    const saved = await putDocument(req, invoiceDb, doc._id, doc);
    created.push(sanitizeInvoice({ ...doc, _rev: saved.rev }));

    for (const svc of services) {
      const updatedSvc = buildCleaningServiceDocument(userId, {
        ...svc,
        billingStatus: 'billed',
        invoiceId: doc._id,
        lastInvoiceDate: now.toISOString().slice(0, 10),
      }, svc);
      await putDocument(req, cleaningDb, updatedSvc._id, updatedSvc);
    }

    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName || 'Sistema',
        targetUserId: userId,
        type: 'invoice',
        action: `Generó factura automática ${number} desde ${services.length} servicio(s) — ${first.clientName}`,
        entityId: doc._id,
        entityLabel: `${number} — ${first.clientName}`,
        metadata: { total: doc.total, origin: 'auto_service', servicesCount: services.length },
      });
    }
  }

  return created;
}

// ─── Generate invoices from active contracts ──────────────────────────────────

export async function generateInvoicesFromContracts(req, userId) {
  const contractsDb = getCleaningContractsDbName();
  const invoiceDb = getInvoicesDbName();
  await ensureDatabase(req, contractsDb);
  await ensureDatabase(req, invoiceDb);

  const allContracts = await getAllDocuments(req, contractsDb);
  const today = new Date().toISOString().slice(0, 10);

  const dueContracts = allContracts.filter(
    (doc) =>
      doc?.type === 'cleaning_contract' &&
      !doc?.deletedAt &&
      doc?.user_id === userId &&
      doc?.status === 'active' &&
      doc?.nextInvoiceDate &&
      doc.nextInvoiceDate <= today,
  );

  if (dueContracts.length === 0) return [];

  const existingInvoices = await getAllDocuments(req, invoiceDb);
  const userInvoices = existingInvoices.filter(
    (d) => d?.type === 'client_invoice' && !d?.deletedAt && d?.user_id === userId,
  );
  let sequence = getNextSequenceNumber(userInvoices);

  const account = await findAccountByUserId(req, userId);
  const created = [];

  for (const contract of dueContracts) {
    const lines = (contract.services || []).map((svc, i) => {
      const freqLabel = svc.frequency === 'weekly' ? '/sem' : svc.frequency === 'biweekly' ? '/quin' : '/mes';
      return {
        id: `line-${i}`,
        description: `${svc.description || svc.cleaningType || 'Servicio'}${freqLabel}`,
        serviceId: svc.serviceTemplateId || '',
        quantity: Number(svc.quantity || 1),
        unitPrice: Number(svc.unitPrice || 0),
        discountPercent: 0,
        taxRate: Number(contract.taxRate || 21),
        lineTotal: Number(svc.unitPrice || 0) * Number(svc.quantity || 1),
      };
    });

    const number = buildInvoiceNumber(sequence++);
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const periodStart = contract.nextInvoiceDate;
    const periodEndDate = new Date(periodStart);
    if (contract.billingFrequency === 'weekly') {
      periodEndDate.setDate(periodEndDate.getDate() + 6);
    } else {
      periodEndDate.setMonth(periodEndDate.getMonth() + 1);
      periodEndDate.setDate(periodEndDate.getDate() - 1);
    }

    const invoiceData = {
      clientId: contract.clientId || '',
      clientName: contract.clientName || '',
      clientEmail: contract.clientEmail || '',
      clientNif: contract.clientNif || '',
      clientAddress: contract.clientAddress || '',
      number,
      series: 'FAC',
      sequenceNumber: sequence - 1,
      date: now.toISOString(),
      dueDate: dueDate.toISOString().slice(0, 10),
      lines,
      status: 'pending',
      contractId: contract._id,
      origin: 'auto_contract',
      vertical: 'cleaning',
      recurrence: contract.billingFrequency === 'weekly' ? 'weekly' : 'monthly',
      periodStart,
      periodEnd: periodEndDate.toISOString().slice(0, 10),
      paymentMethod: contract.paymentMethod || '',
    };

    const doc = buildInvoiceDocument(userId, invoiceData);
    const saved = await putDocument(req, invoiceDb, doc._id, doc);
    created.push(sanitizeInvoice({ ...doc, _rev: saved.rev }));

    const nextDate = new Date(periodEndDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const updatedContract = buildCleaningContractDocument(userId, {
      ...contract,
      lastInvoiceDate: today,
      nextInvoiceDate: nextDate.toISOString().slice(0, 10),
    }, contract);
    await putDocument(req, contractsDb, updatedContract._id, updatedContract);

    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId,
        actorName: account.fullName || 'Sistema',
        targetUserId: userId,
        type: 'invoice',
        action: `Generó factura automática ${number} desde contrato ${contract.contractNumber} — ${contract.clientName}`,
        entityId: doc._id,
        entityLabel: `${number} — ${contract.clientName}`,
        metadata: { total: doc.total, origin: 'auto_contract', contractNumber: contract.contractNumber },
      });
    }
  }

  return created;
}

// ─── Generate pending finance entry ───────────────────────────────────────────

export async function generatePendingFinanceEntry(req, userId, invoice) {
  const financeDb = getFinanceDbName();
  await ensureDatabase(req, financeDb);

  const movement = buildFinanceDocument(userId, {
    type: 'cobro',
    concept: `Factura ${invoice.number} — ${invoice.clientName}`,
    category: 'Servicio limpieza',
    categoryIcon: '🧹',
    categoryColor: '#10b981',
    amountBase: invoice.subtotal || invoice.amountBase || invoice.total,
    taxRate: invoice.lines?.length ? invoice.lines[0].taxRate : 21,
    date: invoice.date ? invoice.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    payMethod: invoice.paymentMethod || '',
    status: 'pending',
    dueDate: invoice.dueDate || '',
    source: 'cleaning_invoice',
    sourceRef: invoice.id || invoice._id || '',
    notes: `Generado automáticamente desde factura ${invoice.number}`,
  });

  const saved = await putDocument(req, financeDb, movement._id, movement);

  const invoiceDb = getInvoicesDbName();
  const invoiceDoc = buildInvoiceDocument(userId, {
    ...invoice,
    linkedFinanceId: movement._id,
  }, invoice);
  await putDocument(req, invoiceDb, invoiceDoc._id, invoiceDoc);

  return movement._id;
}

// ─── Mark overdue invoices ────────────────────────────────────────────────────

export async function markOverdueInvoices(req, userId) {
  const invoiceDb = getInvoicesDbName();
  await ensureDatabase(req, invoiceDb);

  const allDocs = await getAllDocuments(req, invoiceDb);
  const today = new Date().toISOString().slice(0, 10);

  const pendingInvoices = allDocs.filter(
    (doc) =>
      doc?.type === 'client_invoice' &&
      !doc?.deletedAt &&
      doc?.user_id === userId &&
      doc?.status === 'pending' &&
      doc?.dueDate &&
      doc.dueDate.slice(0, 10) < today,
  );

  const updated = [];
  for (const inv of pendingInvoices) {
    const doc = buildInvoiceDocument(userId, { ...inv, status: 'overdue' }, inv);
    const saved = await putDocument(req, invoiceDb, doc._id, doc);
    updated.push(sanitizeInvoice({ ...doc, _rev: saved.rev }));
  }

  return updated;
}

// ─── Full billing cycle ───────────────────────────────────────────────────────

export async function runCleaningBillingCycle(req, userId) {
  const invoicesFromServices = await generateInvoicesFromCompletedServices(req, userId);
  const invoicesFromContracts = await generateInvoicesFromContracts(req, userId);

  let financeEntries = 0;
  for (const inv of [...invoicesFromServices, ...invoicesFromContracts]) {
    try {
      await generatePendingFinanceEntry(req, userId, inv);
      financeEntries++;
    } catch (_) { /* non-critical */ }
  }

  const overdueMarked = await markOverdueInvoices(req, userId);

  return {
    invoicesFromServices,
    invoicesFromContracts,
    financeEntries,
    overdueMarked: overdueMarked.length,
  };
}
