import { v4 as uuidv4 } from 'uuid';
import { getDocument, putDocument, INVOICES_DB } from './couchdb.js';
import logger from './logger.js';

function formatInputDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function buildSubscriptionInvoiceNumber(date = new Date()) {
  const year = date.getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `VT-${year}-${seq}`;
}

/**
 * Registra factura de suscripción Vertial tras cobro MONEI (idempotente por paymentId).
 * amountCents: importe en céntimos (MONEI).
 */
export async function recordSubscriptionPaymentInvoice(
  req,
  {
    userId,
    paymentId,
    amountCents,
    planId = '',
    planName = '',
    billingMode = 'monthly',
    description = '',
    paymentMethod = 'monei',
  },
) {
  if (!userId || !paymentId) return null;

  const docId = `invoice:monei:${paymentId}`;
  try {
    const existing = await getDocument(req, INVOICES_DB, docId);
    if (existing?.type === 'invoice') {
      return existing;
    }
  } catch {
    /* crear nuevo */
  }

  const now = new Date().toISOString();
  const amount = Number(amountCents || 0) / 100;
  const label =
    description.trim() ||
    `Suscripción ${planName || planId || 'Vertial'} (${billingMode === 'annual' ? 'anual' : 'mensual'}) — MONEI`;

  const document = {
    _id: docId,
    type: 'invoice',
    id: docId,
    user_id: userId,
    number: buildSubscriptionInvoiceNumber(),
    description: label,
    date: formatInputDate(),
    dueDate: formatInputDate(),
    amount,
    status: 'paid',
    planId: planId || '',
    planName: planName || '',
    paidAt: now,
    paymentMethod,
    moneiPaymentId: paymentId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await putDocument(req, INVOICES_DB, docId, document);
    logger.info({ userId, paymentId, amount }, '[MONEI] Factura de suscripción registrada');
    return document;
  } catch (error) {
    logger.warn({ userId, paymentId, err: error?.message }, '[MONEI] No se pudo registrar factura de suscripción');
    return null;
  }
}
