import {
  getDocumentsDbName, ensureDatabase, getAllDocuments,
  getDocument, putDocument, addSignatureEvent, buildDocumentRecord,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';

const fakeReq = { headers: {} };

async function fetchSigReqs(statuses) {
  const db = getDocumentsDbName();
  try {
    await ensureDatabase(fakeReq, db);
    const docs = await getAllDocuments(fakeReq, db);
    return docs.filter((d) => d?.type === 'signature_request' && !d?.deletedAt && statuses.includes(d.status));
  } catch { return []; }
}

function notify(userId, title, message, route, entityId) {
  broadcastToUser(userId, 'notification', { title, message, route });
  sendPushToUser(fakeReq, userId, { title, body: message, data: { route, entityId } }).catch(() => null);
}

async function syncDocExpired(sigReq) {
  if (!sigReq.documentId) return;
  const db = getDocumentsDbName();
  try {
    const doc = await getDocument(fakeReq, db, sigReq.documentId);
    if (!doc || doc.type !== 'document') return;
    const updated = buildDocumentRecord(doc.user_id, { ...doc, status: 'expired' }, doc);
    await putDocument(fakeReq, db, updated._id, updated);
  } catch { /* non-critical */ }
}

export async function expireOverdueRequests() {
  const now = new Date();
  const pending = await fetchSigReqs(['pending', 'partially_signed']);
  let count = 0;

  for (const sr of pending) {
    if (!sr.expiresAt) continue;
    const exp = new Date(sr.expiresAt);
    if (Number.isNaN(exp.getTime()) || exp > now) continue;

    try {
      const db = getDocumentsDbName();
      const ts = now.toISOString();
      const signers = sr.signers.map((s) =>
        s.role === 'signer' && s.status === 'pending' ? { ...s, status: 'expired' } : s,
      );
      const events = addSignatureEvent(sr, {
        action: 'expired', actorName: 'Sistema',
        details: 'La solicitud ha expirado sin completar todas las firmas', timestamp: ts,
      });
      await putDocument(fakeReq, db, sr._id, { ...sr, status: 'expired', signers, events, updatedAt: ts });
      await syncDocExpired(sr);
      notify(sr.user_id, 'Firma caducada: ' + sr.documentName,
        sr.documentName + ' ha caducado sin completar todas las firmas',
        '/saas/documents?signature=' + sr._id, sr._id);
      count++;
    } catch (err) {
      logger.warn({ tag: 'SIG_AUTO', err: err?.message, id: sr._id }, 'Error expirando solicitud');
    }
  }
  if (count > 0) logger.info({ tag: 'SIG_AUTO', expired: count }, 'Solicitudes expiradas');
  return count;
}

export async function sendScheduledReminders() {
  const now = new Date();
  const pending = await fetchSigReqs(['pending', 'partially_signed']);
  let count = 0;

  for (const sr of pending) {
    if (!sr.reminderEnabled) continue;
    const interval = (sr.reminderIntervalDays || 3) * 86_400_000;
    const last = sr.lastReminderAt ? new Date(sr.lastReminderAt) : null;
    const sent = sr.events?.find((e) => e.action === 'sent');
    const base = last || (sent ? new Date(sent.timestamp) : new Date(sr.createdAt));
    if (now.getTime() - base.getTime() < interval) continue;

    const ps = sr.signers.filter((s) => s.role === 'signer' && s.status === 'pending');
    if (ps.length === 0) continue;

    try {
      const db = getDocumentsDbName();
      const ts = now.toISOString();
      const events = addSignatureEvent(sr, {
        action: 'reminder_sent', actorName: 'Sistema',
        details: 'Recordatorio enviado a ' + ps.length + ' firmante(s): ' + ps.map((s) => s.name).join(', '),
        timestamp: ts,
      });
      await putDocument(fakeReq, db, sr._id, { ...sr, lastReminderAt: ts, events, updatedAt: ts });
      notify(sr.user_id, 'Recordatorio: ' + sr.documentName,
        'Recordatorio enviado a ' + ps.length + ' firmante(s) pendiente(s)',
        '/saas/documents?signature=' + sr._id, sr._id);
      count++;
    } catch (err) {
      logger.warn({ tag: 'SIG_AUTO', err: err?.message, id: sr._id }, 'Error enviando recordatorio');
    }
  }
  if (count > 0) logger.info({ tag: 'SIG_AUTO', reminders: count }, 'Recordatorios enviados');
  return count;
}
