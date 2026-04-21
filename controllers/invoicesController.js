import {
  getInvoicesDbName,
  getFinanceDbName,
  buildInvoiceDocument,
  buildFinanceDocument,
  sanitizeInvoice,
  listInvoicesByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';
import { sendEmail } from '../services/email.js';
import { v4 as uuidv4 } from 'uuid';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureInvoiceOwner(req, userId, invoiceId) {
  const db = getInvoicesDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, invoiceId);
  if (!doc || doc.type !== 'client_invoice' || doc.user_id !== userId) {
    return null;
  }
  return doc;
}

export async function listInvoices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listInvoicesByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeInvoice), req.query);
    return res.json({ ok: true, invoices: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar facturas' });
  }
}

export async function createInvoice(req, res) {
  try {
    const { userId } = req.params;
    const { invoice } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!invoice || typeof invoice !== 'object') return badRequest(res, 'Falta el objeto invoice en el body');
    if (!invoice.clientId) return badRequest(res, 'Falta clientId');
    if (!invoice.clientName?.trim()) return badRequest(res, 'Falta clientName');
    if (!invoice.number?.trim()) return badRequest(res, 'Falta el número de factura');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getInvoicesDbName();
    await ensureDatabase(req, db);
    const doc = buildInvoiceDocument(userId, invoice);
    const saved = await putDocument(req, db, doc._id, doc);

    if (doc.status === 'pending' || doc.status === 'overdue') {
      try {
        await createFinanceEntryForInvoice(req, userId, doc, account);
      } catch { /* non-critical */ }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'invoice',
      action: `Creó factura ${doc.number} para ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: `${doc.number} — ${doc.clientName}`,
      metadata: { total: doc.total, status: doc.status },
    });

    return res.status(201).json({ ok: true, invoice: sanitizeInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear factura' });
  }
}

export async function updateInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const { invoice } = req.body || {};

    if (!invoice || typeof invoice !== 'object') return badRequest(res, 'Faltan datos de la factura');

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getInvoicesDbName();
    const doc = buildInvoiceDocument(userId, { ...existing, ...invoice }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'invoice',
      action: `Actualizó factura ${doc.number} — estado: ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.number} — ${doc.clientName}`,
      metadata: { status: doc.status, total: doc.total },
    });

    return res.json({ ok: true, invoice: sanitizeInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar factura' });
  }
}

export async function removeInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getInvoicesDbName();
    await softDeleteDocument(req, db, invoiceId);

    if (existing.financeMovementId) {
      try {
        const finDb = getFinanceDbName();
        await softDeleteDocument(req, finDb, existing.financeMovementId);
      } catch { /* non-critical */ }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'invoice',
      action: `Eliminó factura ${existing.number}`,
      entityId: existing._id,
      entityLabel: `${existing.number} — ${existing.clientName}`,
      metadata: {},
    });

    return res.json({ ok: true, id: invoiceId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar factura' });
  }
}

// ── Next invoice number ───────────────────────────────────────────────────────

export async function getNextNumber(req, res) {
  try {
    const { userId } = req.params;
    const series = String(req.query.series || 'FAC').trim().toUpperCase();
    if (!userId) return badRequest(res, 'Falta userId');

    const all = await listInvoicesByUser(req, userId);
    const year = new Date().getFullYear();
    const prefix = `${series}-${year}-`;

    let maxSeq = 0;
    for (const inv of all) {
      const num = String(inv.number || '');
      if (num.startsWith(prefix)) {
        const seq = parseInt(num.slice(prefix.length), 10);
        if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }

    const nextSeq = maxSeq + 1;
    const number = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    return res.json({ ok: true, number, sequenceNumber: nextSeq, series, year });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular número' });
  }
}

// ── Send invoice by email ─────────────────────────────────────────────────────

export async function sendInvoice(req, res) {
  try {
    const { userId, invoiceId } = req.params;

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const email = existing.clientEmail || '';
    if (!email) return badRequest(res, 'El cliente no tiene email configurado');

    const issuerName = existing.issuerName || account.companyName || account.fullName || 'Empresa';
    const total = Number(existing.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 });
    const dateStr = new Date(existing.date).toLocaleDateString('es-ES');
    const dueStr = new Date(existing.dueDate).toLocaleDateString('es-ES');

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
        <div style="background:#0f172a;padding:32px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:22px;">${issuerName}</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Factura ${existing.number}</p>
        </div>
        <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#334155;font-size:15px;line-height:1.6;">
            Estimado/a <strong>${existing.clientName}</strong>,
          </p>
          <p style="color:#334155;font-size:15px;line-height:1.6;">
            Le adjuntamos la factura <strong>${existing.number}</strong> correspondiente a los servicios prestados.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;">
            <tr>
              <td style="padding:12px 16px;background:#f8fafc;border-radius:8px 0 0 0;color:#64748b;font-size:13px;">Fecha emisión</td>
              <td style="padding:12px 16px;background:#f8fafc;border-radius:0 8px 0 0;color:#0f172a;font-weight:600;text-align:right;font-size:13px;">${dateStr}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:#64748b;font-size:13px;">Vencimiento</td>
              <td style="padding:12px 16px;color:#0f172a;font-weight:600;text-align:right;font-size:13px;">${dueStr}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;background:#f8fafc;color:#64748b;font-size:13px;">Base imponible</td>
              <td style="padding:12px 16px;background:#f8fafc;color:#0f172a;font-weight:600;text-align:right;font-size:13px;">${Number(existing.amountBase || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:#64748b;font-size:13px;">IVA</td>
              <td style="padding:12px 16px;color:#0f172a;font-weight:600;text-align:right;font-size:13px;">${Number(existing.taxAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
            </tr>
            <tr>
              <td style="padding:16px;background:#0f172a;border-radius:0 0 0 8px;color:#fff;font-size:14px;font-weight:600;">TOTAL</td>
              <td style="padding:16px;background:#0f172a;border-radius:0 0 8px 0;color:#fbbf24;font-size:18px;font-weight:700;text-align:right;">${total} €</td>
            </tr>
          </table>
          <p style="color:#64748b;font-size:13px;line-height:1.5;">
            Si tiene alguna duda, no dude en contactarnos.
          </p>
          <p style="color:#64748b;font-size:13px;margin-top:24px;">
            Atentamente,<br/><strong>${issuerName}</strong>
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: `Factura ${existing.number} — ${issuerName}`,
      html,
    });

    const now = new Date().toISOString();
    const db = getInvoicesDbName();
    const updated = { ...existing, sentAt: now, sentTo: email, updatedAt: now };
    await putDocument(req, db, invoiceId, updated);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'invoice',
      action: `Envió factura ${existing.number} a ${email}`,
      entityId: existing._id,
      entityLabel: `${existing.number} — ${existing.clientName}`,
      metadata: { sentTo: email },
    });

    return res.json({ ok: true, sentAt: now, sentTo: email });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar factura' });
  }
}

// ── Register payment ──────────────────────────────────────────────────────────

export async function registerPayment(req, res) {
  try {
    const { userId, invoiceId } = req.params;
    const { payment } = req.body || {};

    if (!payment || typeof payment !== 'object') return badRequest(res, 'Falta el objeto payment');
    if (!payment.amount || payment.amount <= 0) return badRequest(res, 'El importe debe ser mayor que 0');

    const existing = await ensureInvoiceOwner(req, userId, invoiceId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const newPayment = {
      id: `pay-${uuidv4()}`,
      amount: Number(payment.amount),
      date: String(payment.date || now.slice(0, 10)),
      method: String(payment.method || ''),
      notes: String(payment.notes || ''),
    };

    const payments = [...(existing.payments || []), newPayment];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const newPaid = Number(totalPaid.toFixed(2));

    let newStatus = existing.status;
    if (newPaid >= Number(existing.total || 0)) {
      newStatus = 'paid';
    } else if (newPaid > 0) {
      newStatus = 'partial';
    }

    const db = getInvoicesDbName();
    const doc = buildInvoiceDocument(userId, {
      ...existing,
      payments,
      paid: newPaid,
      status: newStatus,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'invoice',
      action: `Registró cobro de ${newPayment.amount.toFixed(2)}€ en factura ${doc.number}`,
      entityId: doc._id,
      entityLabel: `${doc.number} — ${doc.clientName}`,
      metadata: { paymentAmount: newPayment.amount, totalPaid: newPaid, status: newStatus },
    });

    return res.json({ ok: true, invoice: sanitizeInvoice({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar cobro' });
  }
}

// ── Finance entry helper ──────────────────────────────────────────────────────

async function createFinanceEntryForInvoice(req, userId, invoiceDoc, account) {
  const finDb = getFinanceDbName();
  await ensureDatabase(req, finDb);

  const isPending = invoiceDoc.status === 'pending' || invoiceDoc.status === 'overdue';

  const movement = buildFinanceDocument(userId, {
    type: 'cobro',
    concept: `Factura ${invoiceDoc.number} — ${invoiceDoc.clientName}`,
    category: 'ventas',
    amountBase: invoiceDoc.amountBase || invoiceDoc.total,
    taxRate: invoiceDoc.taxAmount && invoiceDoc.amountBase ? Number(((invoiceDoc.taxAmount / invoiceDoc.amountBase) * 100).toFixed(2)) : 21,
    totalAmount: invoiceDoc.total,
    date: invoiceDoc.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    reference: invoiceDoc.number || invoiceDoc._id,
    companyName: invoiceDoc.clientName,
    payMethod: invoiceDoc.paymentMethod || '',
    notes: `Generado automáticamente desde factura ${invoiceDoc.number}`,
    status: isPending ? 'pending' : 'paid',
    dueDate: invoiceDoc.dueDate || '',
    source: 'invoice',
    sourceRef: invoiceDoc._id,
    linkedInvoiceId: invoiceDoc._id,
    linkedInvoiceType: 'client_invoice',
  });

  const saved = await putDocument(req, finDb, movement._id, movement);

  const invDb = getInvoicesDbName();
  const updated = { ...invoiceDoc, financeMovementId: movement._id, updatedAt: new Date().toISOString() };
  await putDocument(req, invDb, invoiceDoc._id, updated);

  return { ...movement, _rev: saved.rev };
}
