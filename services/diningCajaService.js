/**
 * Registra cobros de mesa (dining_order) en la sesión TPV abierta.
 * No crea delivery_order sintético.
 */
import {
  getDeliveryDbName,
  putDocument,
  findAccountByUserId,
  listTpvRegisterSessionsByUser,
  findOpenTpvRegisterSessionForPointOfSale,
  buildTpvRegisterSessionDocument,
  sanitizeTpvRegisterSession,
  normalizeTpvPaymentMethod,
} from './couchdb.js';
import { broadcastToUser, broadcastToBusiness } from './sseService.js';
import logger from './logger.js';

function broadcastTpvSessionLive(account, ownerUserId, sessionDoc) {
  const sanitized = sanitizeTpvRegisterSession(sessionDoc);
  broadcastToUser(ownerUserId, 'tpv_session_updated', sanitized);
  // Preferir empresa de la sesión (multi-empresa); account.business_id puede ser otra.
  const businessId = String(
    sessionDoc?.business_id || sessionDoc?.businessId || account?.business_id || account?.businessId || '',
  ).replace(/^business:/, '').trim();
  if (businessId) {
    try {
      broadcastToBusiness(businessId, 'tpv_session_updated', sanitized);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @returns {{ status: string, message?: string, session?: object }}
 */
export async function registerDiningSaleInTpvSession(req, userId, {
  pdvId,
  diningOrder,
  amount,
  paymentMethod,
  registeredBy,
  description,
  paymentId,
  tip = 0,
}) {
  const pointId = String(pdvId || '').trim();
  if (!pointId) {
    return { status: 'no_pdv', message: 'Falta el punto de venta para registrar en caja.' };
  }
  const orderId = String(diningOrder?._id || diningOrder?.id || '').trim();
  if (!orderId) {
    return { status: 'error', message: 'Falta la cuenta de mesa.' };
  }
  const toRegister = Math.round(Number(amount || 0) * 100) / 100;
  if (!(toRegister > 0.001)) {
    return { status: 'already_registered', message: 'Importe no válido para caja.' };
  }

  const db = getDeliveryDbName();
  const maxAttempts = 5;
  let lastOpenSession = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const allSessions = await listTpvRegisterSessionsByUser(req, userId);
    const openSession = findOpenTpvRegisterSessionForPointOfSale(allSessions, pointId);
    if (!openSession) {
      return {
        status: 'no_open_session',
        message: 'No hay caja abierta en esta tienda. Abre la caja para que el cobro quede registrado.',
      };
    }
    lastOpenSession = openSession;

    // Idempotencia por paymentId (reintentos del mismo tramo).
    const payKey = String(paymentId || '').trim();
    if (payKey) {
      const already = (openSession.transactions || []).some(
        (t) => t.type === 'sale'
          && String(t.linkedDiningOrderId || t.orderId || '') === orderId
          && String(t.diningPaymentId || '') === payKey,
      );
      if (already) {
        return { status: 'already_registered', message: 'Este cobro ya estaba en caja.', session: sanitizeTpvRegisterSession(openSession) };
      }
    }

    const now = new Date().toISOString();
    const tableLabel = diningOrder.tableName
      || (diningOrder.tableNumber != null ? `Mesa ${diningOrder.tableNumber}` : 'Sala');
    const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const finalTx = {
      id: txId,
      type: 'sale',
      amount: toRegister,
      tip: Math.round(Number(tip || 0) * 100) / 100,
      paymentMethod: normalizeTpvPaymentMethod(paymentMethod || 'efectivo'),
      description: description
        || `Sala · ${tableLabel}${diningOrder.clientName ? ` · ${diningOrder.clientName}` : ''}`.trim(),
      registeredBy: registeredBy || 'Sistema',
      orderId,
      orderNumber: `MESA-${diningOrder.tableNumber || '?'}`,
      linkedDiningOrderId: orderId,
      linkedDeliveryOrderId: '',
      channel: 'sala',
      diningPaymentId: payKey || undefined,
      date: now,
    };

    const updatedTxs = [...(openSession.transactions || []), finalTx];
    const salesByChannel = {};
    for (const t of updatedTxs) {
      if (t.type === 'sale' && t.channel) {
        salesByChannel[t.channel] = (salesByChannel[t.channel] || 0) + Number(t.amount || 0);
      }
    }
    const linkedOrderIds = [...(openSession.linkedOrderIds || [])];
    if (!linkedOrderIds.includes(orderId)) linkedOrderIds.push(orderId);

    const sessionDoc = buildTpvRegisterSessionDocument(userId, {
      ...openSession,
      transactions: updatedTxs,
      salesByChannel,
      linkedOrderIds,
    }, openSession);

    try {
      const saved = await putDocument(req, db, sessionDoc._id, sessionDoc);
      const account = await findAccountByUserId(req, userId);
      const sanitized = sanitizeTpvRegisterSession({ ...sessionDoc, _rev: saved.rev });
      broadcastTpvSessionLive(account, userId, sanitized);
      return { status: 'registered', session: sanitized };
    } catch (err) {
      const isConflict = /conflict|409/i.test(String(err?.message || ''));
      if (!isConflict || attempt === maxAttempts - 1) {
        logger.error({ tag: 'DINING_CAJA', orderId, err: err?.message, attempt }, 'Error registrando cobro mesa en caja');
        return {
          status: 'error',
          message: err?.message || 'No se pudo registrar el cobro en caja.',
        };
      }
    }
  }

  return {
    status: 'error',
    message: lastOpenSession
      ? 'No se pudo registrar en caja tras varios intentos.'
      : 'No hay caja abierta en esta tienda.',
  };
}
