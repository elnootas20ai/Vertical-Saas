import crypto from 'node:crypto';
import {
  couchRequest,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  buildNotificationDocument,
  buildInvoiceDocument,
  getInvoicesDbName,
  listInvoicesByUser,
  saveNotification,
  findAccountByUserId,
} from '../services/couchdb.js';
import { broadcastToUser } from '../services/sseService.js';
import { sendPushToUser } from '../services/pushService.js';
import { sendEmail } from '../services/email.js';
import logger from '../services/logger.js';

function getQuotesDbName() {
  return (process.env.VITE_COUCHDB_DB || 'vertial') + '-quotes';
}

function getAppBaseUrl() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
}

async function findQuoteByToken(req, token) {
  const db = getQuotesDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.find(
    (doc) => doc?.type === 'quote' && doc?.approvalToken === token && !doc?.deletedAt,
  ) || null;
}

async function notifyQuoteAction(req, quote, action) {
  const userId = quote.user_id;
  if (!userId) return;

  const account = await findAccountByUserId(req, userId);
  if (!account) return;

  const isAccepted = action === 'accepted';
  const notification = buildNotificationDocument({
    userId,
    level: isAccepted ? 'success' : 'warning',
    category: 'quotes',
    title: isAccepted
      ? `Presupuesto ${quote.number} aceptado`
      : `Presupuesto ${quote.number} rechazado`,
    message: isAccepted
      ? `${quote.clientName} ha aceptado el presupuesto ${quote.number} por ${quote.total.toFixed(2)} €`
      : `${quote.clientName} ha rechazado el presupuesto ${quote.number}`,
    entityId: quote._id,
    entityType: 'quote',
    route: '/saas/quotes',
    metadata: { quoteNumber: quote.number, clientName: quote.clientName, action },
  });

  const saved = await saveNotification(req, notification);
  broadcastToUser(userId, 'notification', saved);
  sendPushToUser(req, userId, {
    title: notification.title,
    body: notification.message,
    data: { route: '/saas/quotes', notificationId: saved._id },
  }).catch((err) => logger.warn({ tag: 'QUOTE_PUSH', err: err?.message }, 'Error enviando push'));
}

function generateSignatureHash(quoteId, clientName, timestamp) {
  return crypto
    .createHash('sha256')
    .update(`${quoteId}:${clientName}:${timestamp}:accept`)
    .digest('hex')
    .slice(0, 16);
}

// ─── Public endpoints (no auth required) ─────────────────────────────────────

export async function acceptQuote(req, res) {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string' || token.length < 10) {
      return res.status(400).json({ ok: false, error: 'Token inválido o ausente' });
    }

    const quote = await findQuoteByToken(req, token);
    if (!quote) {
      return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado o token inválido' });
    }

    if (quote.status === 'approved') {
      return res.json({ ok: true, alreadyProcessed: true, status: 'approved', quote: sanitizePublicQuote(quote) });
    }
    if (quote.status === 'rejected') {
      return res.status(409).json({ ok: false, error: 'Este presupuesto ya fue rechazado', status: 'rejected' });
    }
    if (quote.status !== 'sent' && quote.status !== 'draft') {
      return res.status(409).json({ ok: false, error: `El presupuesto está en estado "${quote.status}" y no puede aceptarse`, status: quote.status });
    }

    const now = new Date().toISOString();
    const signatureHash = generateSignatureHash(quote._id, quote.clientName, now);

    const updated = {
      ...quote,
      status: 'approved',
      approvedAt: now,
      approvedBy: quote.clientName || 'Cliente (email)',
      signature: {
        type: 'digital_simple',
        hash: signatureHash,
        method: 'email_link',
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || '',
        timestamp: now,
      },
      updatedAt: now,
    };

    const db = getQuotesDbName();
    const result = await putDocument(req, db, quote._id, updated);

    await notifyQuoteAction(req, { ...updated, _rev: result.rev }, 'accepted');

    let generatedInvoiceId = null;
    try {
      generatedInvoiceId = await autoCreateInvoiceFromQuote(req, quote);
      if (generatedInvoiceId) {
        const quoteDb = getQuotesDbName();
        const latestQuote = await getDocument(req, quoteDb, quote._id);
        await putDocument(req, quoteDb, quote._id, {
          ...latestQuote,
          convertedToInvoiceId: generatedInvoiceId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.warn({ tag: 'QUOTE_AUTO_INVOICE', err: err?.message, quoteId: quote._id }, 'No se pudo crear factura automatica');
    }

    logger.info({ tag: 'QUOTE_ACCEPT', quoteId: quote._id, number: quote.number, invoiceId: generatedInvoiceId }, 'Presupuesto aceptado por email');

    return res.json({
      ok: true,
      status: 'approved',
      quote: sanitizePublicQuote({ ...updated, _rev: result.rev }),
      generatedInvoiceId,
    });
  } catch (error) {
    logger.error({ tag: 'QUOTE_ACCEPT', err: error?.message }, 'Error al aceptar presupuesto');
    return res.status(500).json({ ok: false, error: 'Error al procesar la aceptación' });
  }
}

export async function rejectQuote(req, res) {
  try {
    const { token } = req.query;
    const { reason } = req.body || {};

    if (!token || typeof token !== 'string' || token.length < 10) {
      return res.status(400).json({ ok: false, error: 'Token inválido o ausente' });
    }

    const quote = await findQuoteByToken(req, token);
    if (!quote) {
      return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado o token inválido' });
    }

    if (quote.status === 'rejected') {
      return res.json({ ok: true, alreadyProcessed: true, status: 'rejected', quote: sanitizePublicQuote(quote) });
    }
    if (quote.status === 'approved') {
      return res.status(409).json({ ok: false, error: 'Este presupuesto ya fue aceptado', status: 'approved' });
    }
    if (quote.status !== 'sent' && quote.status !== 'draft') {
      return res.status(409).json({ ok: false, error: `El presupuesto está en estado "${quote.status}" y no puede rechazarse`, status: quote.status });
    }

    const now = new Date().toISOString();
    const updated = {
      ...quote,
      status: 'rejected',
      rejectedAt: now,
      rejectionReason: reason ? String(reason).slice(0, 500) : undefined,
      updatedAt: now,
    };

    const db = getQuotesDbName();
    const result = await putDocument(req, db, quote._id, updated);

    await notifyQuoteAction(req, { ...updated, _rev: result.rev }, 'rejected');

    logger.info({ tag: 'QUOTE_REJECT', quoteId: quote._id, number: quote.number }, 'Presupuesto rechazado por email');

    return res.json({
      ok: true,
      status: 'rejected',
      quote: sanitizePublicQuote({ ...updated, _rev: result.rev }),
    });
  } catch (error) {
    logger.error({ tag: 'QUOTE_REJECT', err: error?.message }, 'Error al rechazar presupuesto');
    return res.status(500).json({ ok: false, error: 'Error al procesar el rechazo' });
  }
}

export async function getPublicQuote(req, res) {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string' || token.length < 10) {
      return res.status(400).json({ ok: false, error: 'Token inválido o ausente' });
    }

    const quote = await findQuoteByToken(req, token);
    if (!quote) {
      return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    }

    return res.json({ ok: true, quote: sanitizePublicQuote(quote) });
  } catch (error) {
    logger.error({ tag: 'QUOTE_PUBLIC', err: error?.message }, 'Error al obtener presupuesto público');
    return res.status(500).json({ ok: false, error: 'Error al cargar el presupuesto' });
  }
}

// ─── Authenticated endpoint: send quote by email ─────────────────────────────

export async function sendQuoteByEmail(req, res) {
  try {
    const { quoteId } = req.params;
    if (!quoteId) {
      return res.status(400).json({ ok: false, error: 'Falta quoteId' });
    }

    const db = getQuotesDbName();
    await ensureDatabase(req, db);
    const quote = await getDocument(req, db, quoteId);

    if (!quote || quote.type !== 'quote') {
      return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    }

    if (!quote.clientEmail) {
      return res.status(400).json({ ok: false, error: 'El presupuesto no tiene email del cliente' });
    }

    if (!quote.approvalToken) {
      quote.approvalToken = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    }

    const now = new Date().toISOString();
    const updated = { ...quote, status: 'sent', sentAt: now, updatedAt: now };
    const result = await putDocument(req, db, quote._id, updated);

    const baseUrl = getAppBaseUrl();
    const acceptUrl = `${baseUrl}/quote/respond?token=${encodeURIComponent(quote.approvalToken)}&action=accept`;
    const rejectUrl = `${baseUrl}/quote/respond?token=${encodeURIComponent(quote.approvalToken)}&action=reject`;

    const { subject, html } = buildQuoteEmailHtml({
      quote: updated,
      acceptUrl,
      rejectUrl,
      companyName: quote.companyName || '',
    });

    await sendEmail({ to: quote.clientEmail, subject, html });

    logger.info({ tag: 'QUOTE_SEND', quoteId: quote._id, to: quote.clientEmail }, 'Presupuesto enviado por email');

    return res.json({
      ok: true,
      quote: { ...updated, _rev: result.rev },
      emailSent: true,
    });
  } catch (error) {
    logger.error({ tag: 'QUOTE_SEND', err: error?.message }, 'Error al enviar presupuesto por email');
    return res.status(500).json({ ok: false, error: error?.message || 'Error al enviar el presupuesto' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizePublicQuote(quote) {
  return {
    number: quote.number,
    status: quote.status,
    clientName: quote.clientName,
    companyName: quote.companyName || '',
    companyAddress: quote.companyAddress || '',
    companyCif: quote.companyCif || '',
    lines: (quote.lines || []).map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      taxRate: l.taxRate,
      lineTotal: l.lineTotal,
    })),
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    taxAmount: quote.taxAmount,
    total: quote.total,
    validUntil: quote.validUntil,
    notes: quote.notes || '',
    paymentMethod: quote.paymentMethod || '',
    vehicleName: quote.vehicleName || '',
    vehiclePlate: quote.vehiclePlate || '',
    entityLabel: quote.entityLabel || '',
    entityPlateLabel: quote.entityPlateLabel || '',
    approvedAt: quote.approvedAt || null,
    rejectedAt: quote.rejectedAt || null,
    signature: quote.signature || null,
    createdAt: quote.createdAt,
  };
}

function buildQuoteEmailHtml({ quote, acceptUrl, rejectUrl, companyName }) {
  const validDate = new Date(quote.validUntil).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const linesHtml = (quote.lines || [])
    .map(
      (l) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${l.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;text-align:center;">${l.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;text-align:right;">${l.unitPrice.toFixed(2)} €</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;text-align:right;">${l.lineTotal.toFixed(2)} €</td>
      </tr>`,
    )
    .join('');

  const senderName = companyName || 'Vertial';

  return {
    subject: `Presupuesto ${quote.number} · ${senderName}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Header -->
        <tr><td style="background:#000;padding:24px 32px;">
          <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">${senderName}</span>
          <span style="color:#9ca3af;font-size:14px;float:right;line-height:28px;">Presupuesto ${quote.number}</span>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:32px 32px 16px;">
          <h2 style="margin:0 0 8px;color:#111;font-size:22px;">Hola, ${quote.clientName}</h2>
          <p style="color:#555;margin:0;line-height:1.6;font-size:15px;">
            Te enviamos el presupuesto solicitado. Puedes revisarlo a continuación y aceptarlo o rechazarlo directamente.
          </p>
        </td></tr>

        ${quote.vehicleName ? `
        <tr><td style="padding:0 32px 16px;">
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;">
            <span style="color:#0369a1;font-size:13px;font-weight:600;">${quote.entityLabel || 'Referencia'}:</span>
            <span style="color:#0c4a6e;font-size:14px;margin-left:8px;">${quote.vehicleName}${quote.vehiclePlate ? ` · ${quote.vehiclePlate}` : ''}</span>
          </div>
        </td></tr>` : ''}

        <!-- Lines table -->
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Concepto</th>
              <th style="padding:10px 12px;text-align:center;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Cant.</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Precio</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Total</th>
            </tr>
            ${linesHtml}
          </table>
        </td></tr>

        <!-- Totals -->
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#6b7280;font-size:14px;">Subtotal</td>
              <td style="padding:4px 0;color:#374151;font-size:14px;text-align:right;">${quote.subtotal.toFixed(2)} €</td>
            </tr>
            ${quote.discountAmount > 0 ? `
            <tr>
              <td style="padding:4px 0;color:#059669;font-size:14px;">Descuento</td>
              <td style="padding:4px 0;color:#059669;font-size:14px;text-align:right;">-${quote.discountAmount.toFixed(2)} €</td>
            </tr>` : ''}
            <tr>
              <td style="padding:4px 0;color:#6b7280;font-size:14px;">IVA</td>
              <td style="padding:4px 0;color:#374151;font-size:14px;text-align:right;">${quote.taxAmount.toFixed(2)} €</td>
            </tr>
            <tr>
              <td style="padding:12px 0 4px;color:#111;font-size:18px;font-weight:700;border-top:2px solid #111;">TOTAL</td>
              <td style="padding:12px 0 4px;color:#111;font-size:18px;font-weight:700;text-align:right;border-top:2px solid #111;">${quote.total.toFixed(2)} €</td>
            </tr>
          </table>
        </td></tr>

        ${quote.notes ? `
        <tr><td style="padding:0 32px 24px;">
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;">
            <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">📝 Notas</p>
            <p style="margin:6px 0 0;color:#78350f;font-size:14px;line-height:1.5;">${quote.notes}</p>
          </div>
        </td></tr>` : ''}

        <!-- Validity -->
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;color:#6b7280;font-size:13px;">
            ⏱ Presupuesto válido hasta: <strong style="color:#374151;">${validDate}</strong>
          </p>
        </td></tr>

        <!-- Action buttons -->
        <tr><td style="padding:0 32px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center" style="padding-right:8px;" width="50%">
                <a href="${acceptUrl}"
                   style="display:block;background:#059669;color:#fff;padding:16px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;text-align:center;">
                  ✅ Aceptar presupuesto
                </a>
              </td>
              <td align="center" style="padding-left:8px;" width="50%">
                <a href="${rejectUrl}"
                   style="display:block;background:#dc2626;color:#fff;padding:16px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;text-align:center;">
                  ❌ Rechazar presupuesto
                </a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            ${senderName} · Este presupuesto fue generado automáticamente.
            Si tiene alguna duda, responda directamente a este email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// ── Auto-create invoice from accepted quote ──────────────────────────────────

async function autoCreateInvoiceFromQuote(req, quote) {
  if (!quote.user_id) return null;

  const account = await findAccountByUserId(req, quote.user_id);
  const autoInvoice = account?.invoiceConfig?.autoInvoiceOnQuoteAccept;
  if (autoInvoice === false) return null;

  const lines = Array.isArray(quote.lines) ? quote.lines.map((l) => ({
    id: l.id || `line-${Date.now()}`,
    description: String(l.description || ''),
    quantity: Number(l.quantity || 1),
    unitPrice: Number(l.unitPrice || 0),
    discountPercent: Number(l.discountPercent || 0),
    taxRate: Number(l.taxRate || 21),
    lineTotal: Number(l.lineTotal || 0),
  })) : [];

  const all = await listInvoicesByUser(req, quote.user_id);
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;
  let maxSeq = 0;
  for (const inv of all) {
    const num = String(inv.number || '');
    if (num.startsWith(prefix)) {
      const seq = parseInt(num.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  const nextNumber = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoiceData = {
    clientId: quote.clientId || '',
    clientName: quote.clientName || '',
    clientNif: quote.clientDni || '',
    clientEmail: quote.clientEmail || '',
    number: nextNumber,
    series: 'FAC',
    sequenceNumber: maxSeq + 1,
    date: new Date().toISOString(),
    dueDate: dueDate.toISOString(),
    lines,
    status: 'pending',
    paymentMethod: quote.paymentMethod || '',
    notes: `Generada automaticamente desde presupuesto ${quote.number || quote._id}`,
    sourceType: 'quote',
    sourceQuoteId: quote._id,
  };

  const db = getInvoicesDbName();
  await ensureDatabase(req, db);
  const doc = buildInvoiceDocument(quote.user_id, invoiceData);
  await putDocument(req, db, doc._id, doc);

  logger.info({ tag: 'AUTO_INVOICE', quoteId: quote._id, invoiceId: doc._id, number: nextNumber }, 'Factura creada automaticamente desde presupuesto');

  return doc._id;
}
