import jwt from 'jsonwebtoken';
import {
  getDocumentsDbName,
  buildSignatureRequest,
  sanitizeSignatureRequest,
  addSignatureEvent,
  recalcSignatureStatus,
  listSignatureRequestsByUser,
  listSignatureRequestsByDocument,
  listSignatureRequestsByEntity,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  buildDocumentRecord,
  sanitizeDocumentRecord,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';
import { broadcastToUser } from '../services/sseService.js';
import { sendPushToUser } from '../services/pushService.js';
import logger from '../services/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vertial-dev-secret-change-in-production';
const APP_URL = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function signSignerToken(requestId, signerId, email, expiresAt) {
  const exp = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : undefined;
  return jwt.sign({ requestId, signerId, email, purpose: 'signature' }, JWT_SECRET, {
    ...(exp ? { expiresIn: exp - Math.floor(Date.now() / 1000) } : { expiresIn: '30d' }),
  });
}

function verifySignerToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== 'signature') throw new Error('Token inválido');
  return payload;
}

async function getSignatureRequestOwned(req, userId, requestId) {
  const db = getDocumentsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, requestId);
  if (!doc || doc.type !== 'signature_request' || doc.user_id !== userId || doc.deletedAt) return null;
  return doc;
}

function syncDocumentStatus(signatureStatus) {
  const map = {
    draft: null,
    pending: 'pending_signature',
    partially_signed: 'pending_signature',
    completed: 'signed',
    rejected: 'rejected',
    expired: 'expired',
    cancelled: null,
  };
  return map[signatureStatus] ?? null;
}

async function updateLinkedDocument(req, sigReq) {
  if (!sigReq.documentId) return;
  const newStatus = syncDocumentStatus(sigReq.status);
  if (!newStatus) return;

  const db = getDocumentsDbName();
  try {
    const doc = await getDocument(req, db, sigReq.documentId);
    if (!doc || doc.type !== 'document') return;

    const updates = { status: newStatus };
    if (sigReq.status === 'completed') {
      updates.signedAt = sigReq.completedAt || new Date().toISOString();
    }
    const updated = buildDocumentRecord(doc.user_id, { ...doc, ...updates }, doc);
    await putDocument(req, db, updated._id, updated);
  } catch (err) {
    logger.warn({ tag: 'SIGNATURE', err: err?.message }, 'Error sincronizando estado del documento');
  }
}

function notifyOwner(req, userId, title, message, requestId, route) {
  broadcastToUser(userId, 'notification', { title, message, route });
  sendPushToUser(req, userId, {
    title,
    body: message,
    data: { route, entityId: requestId },
  }).catch(() => null);
}

// ─── LIST ────────────────────────────────────────────────────────────────────

export async function listSignatureRequests(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { status, documentId, entityType, entityId } = req.query;

    let docs;
    if (documentId) {
      docs = await listSignatureRequestsByDocument(req, userId, documentId);
    } else if (entityType && entityId) {
      docs = await listSignatureRequestsByEntity(req, userId, entityType, entityId);
    } else {
      docs = await listSignatureRequestsByUser(req, userId);
    }

    if (status) docs = docs.filter((d) => d.status === status);

    const { items, meta } = applyQueryOptions(docs.map(sanitizeSignatureRequest), req.query);
    return res.json({ ok: true, signatureRequests: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar solicitudes de firma' });
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function getSignatureRequest(req, res) {
  try {
    const { userId, requestId } = req.params;
    const doc = await getSignatureRequestOwned(req, userId, requestId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

    return res.json({ ok: true, signatureRequest: sanitizeSignatureRequest(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener solicitud' });
  }
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createSignatureRequest(req, res) {
  try {
    const { userId } = req.params;
    const { signatureRequest: data } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!data || typeof data !== 'object') return badRequest(res, 'Falta el objeto signatureRequest en el body');
    if (!data.documentId?.trim()) return badRequest(res, 'El documentId es obligatorio');
    if (!Array.isArray(data.signers) || data.signers.length === 0) return badRequest(res, 'Se necesita al menos un firmante');

    const hasSignerWithoutEmail = data.signers.some((s) => s.role !== 'cc' && !s.email?.trim());
    if (hasSignerWithoutEmail) return badRequest(res, 'Todos los firmantes necesitan email');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getDocumentsDbName();
    await ensureDatabase(req, db);

    const sourceDoc = await getDocument(req, db, data.documentId);
    if (!sourceDoc || sourceDoc.type !== 'document' || sourceDoc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }

    const now = new Date().toISOString();
    const doc = buildSignatureRequest(userId, {
      ...data,
      documentName: data.documentName || sourceDoc.name,
      sourceFileUrl: data.sourceFileUrl || sourceDoc.fileUrl,
      sourceFileName: data.sourceFileName || sourceDoc.name,
      sourceMimeType: data.sourceMimeType || sourceDoc.mimeType,
      sourceFileSize: data.sourceFileSize || sourceDoc.fileSize,
      status: 'draft',
      createdBy: userId,
      createdByName: account.fullName || '',
      events: [{
        action: 'created',
        actorName: account.fullName || '',
        actorEmail: account.email || '',
        details: `Solicitud de firma creada por ${account.fullName || 'usuario'}`,
        timestamp: now,
      }],
    });

    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'signature',
      action: `Creó solicitud de firma para "${doc.documentName}"`,
      entityId: doc._id,
      entityLabel: doc.documentName,
      metadata: { status: doc.status, signersCount: doc.signers.length },
    });

    return res.status(201).json({ ok: true, signatureRequest: sanitizeSignatureRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear solicitud de firma' });
  }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export async function updateSignatureRequest(req, res) {
  try {
    const { userId, requestId } = req.params;
    const { signatureRequest: data } = req.body || {};

    if (!data || typeof data !== 'object') return badRequest(res, 'Faltan datos');

    const existing = await getSignatureRequestOwned(req, userId, requestId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

    if (existing.status !== 'draft') {
      return badRequest(res, 'Solo se pueden editar solicitudes en borrador');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const doc = buildSignatureRequest(userId, { ...existing, ...data, status: 'draft' }, existing);
    const db = getDocumentsDbName();
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, signatureRequest: sanitizeSignatureRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar solicitud' });
  }
}

// ─── CANCEL ──────────────────────────────────────────────────────────────────

export async function cancelSignatureRequest(req, res) {
  try {
    const { userId, requestId } = req.params;
    const { reason } = req.body || {};

    const existing = await getSignatureRequestOwned(req, userId, requestId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

    if (['completed', 'cancelled'].includes(existing.status)) {
      return badRequest(res, `No se puede cancelar una solicitud en estado "${existing.status}"`);
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const events = addSignatureEvent(existing, {
      action: 'cancelled',
      actorName: account.fullName || '',
      actorEmail: account.email || '',
      details: reason ? `Cancelada: ${reason}` : `Cancelada por ${account.fullName || 'usuario'}`,
      timestamp: now,
    });

    const doc = buildSignatureRequest(userId, {
      ...existing,
      status: 'cancelled',
      cancelledAt: now,
      events,
    }, existing);

    const db = getDocumentsDbName();
    const saved = await putDocument(req, db, doc._id, doc);

    await updateLinkedDocument(req, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'signature',
      action: `Canceló solicitud de firma "${doc.documentName}"`,
      entityId: doc._id,
      entityLabel: doc.documentName,
      metadata: { reason: reason || '' },
    });

    return res.json({ ok: true, signatureRequest: sanitizeSignatureRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar solicitud' });
  }
}

// ─── SEND ────────────────────────────────────────────────────────────────────

export async function sendSignatureRequest(req, res) {
  try {
    const { userId, requestId } = req.params;

    const existing = await getSignatureRequestOwned(req, userId, requestId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

    if (existing.status !== 'draft') {
      return badRequest(res, 'Solo se pueden enviar solicitudes en borrador');
    }

    if (!existing.signers || existing.signers.length === 0) {
      return badRequest(res, 'La solicitud no tiene firmantes');
    }

    const requiredSigners = existing.signers.filter((s) => s.role === 'signer');
    if (requiredSigners.length === 0) {
      return badRequest(res, 'Se necesita al menos un firmante con rol "signer"');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const now = new Date().toISOString();
    const signerLinks = {};

    for (const signer of existing.signers) {
      if (signer.role === 'cc') continue;
      const token = signSignerToken(existing._id, signer.id, signer.email, existing.expiresAt);
      signerLinks[signer.id] = `${APP_URL}/sign/${token}`;
    }

    const events = addSignatureEvent(existing, {
      action: 'sent',
      actorName: account.fullName || '',
      actorEmail: account.email || '',
      details: `Documento enviado a ${existing.signers.length} firmante(s)`,
      timestamp: now,
    });

    const doc = buildSignatureRequest(userId, {
      ...existing,
      status: 'pending',
      events,
    }, existing);

    const db = getDocumentsDbName();
    const saved = await putDocument(req, db, doc._id, doc);

    await updateLinkedDocument(req, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'signature',
      action: `Envió a firma "${doc.documentName}" a ${doc.signers.length} firmante(s)`,
      entityId: doc._id,
      entityLabel: doc.documentName,
      metadata: { signersCount: doc.signers.length, status: 'pending' },
    });

    return res.json({
      ok: true,
      signatureRequest: sanitizeSignatureRequest({ ...doc, _rev: saved.rev }),
      signerLinks,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar solicitud de firma' });
  }
}

// ─── REMIND ──────────────────────────────────────────────────────────────────

export async function sendReminder(req, res) {
  try {
    const { userId, requestId } = req.params;

    const existing = await getSignatureRequestOwned(req, userId, requestId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

    if (!['pending', 'partially_signed'].includes(existing.status)) {
      return badRequest(res, 'Solo se pueden recordar solicitudes pendientes');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const pendingSigners = existing.signers.filter((s) => s.role === 'signer' && s.status === 'pending');
    if (pendingSigners.length === 0) return badRequest(res, 'No hay firmantes pendientes');

    const now = new Date().toISOString();
    const events = addSignatureEvent(existing, {
      action: 'reminder_sent',
      actorName: account.fullName || '',
      details: `Recordatorio enviado a ${pendingSigners.length} firmante(s): ${pendingSigners.map((s) => s.name).join(', ')}`,
      timestamp: now,
    });

    const doc = buildSignatureRequest(userId, {
      ...existing,
      lastReminderAt: now,
      events,
    }, existing);

    const db = getDocumentsDbName();
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({
      ok: true,
      signatureRequest: sanitizeSignatureRequest({ ...doc, _rev: saved.rev }),
      reminded: pendingSigners.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar recordatorio' });
  }
}

// ─── RESEND TO SIGNER ────────────────────────────────────────────────────────

export async function resendToSigner(req, res) {
  try {
    const { userId, requestId, signerId } = req.params;

    const existing = await getSignatureRequestOwned(req, userId, requestId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });

    if (!['pending', 'partially_signed'].includes(existing.status)) {
      return badRequest(res, 'La solicitud no está en estado pendiente');
    }

    const signer = existing.signers.find((s) => s.id === signerId);
    if (!signer) return res.status(404).json({ ok: false, error: 'Firmante no encontrado' });

    if (signer.status === 'signed') return badRequest(res, 'El firmante ya firmó');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const token = signSignerToken(existing._id, signer.id, signer.email, existing.expiresAt);
    const signerLink = `${APP_URL}/sign/${token}`;

    const now = new Date().toISOString();
    const events = addSignatureEvent(existing, {
      action: 'reminder_sent',
      actorName: account.fullName || '',
      signerId: signer.id,
      details: `Reenvío a ${signer.name} (${signer.email})`,
      timestamp: now,
    });

    const doc = buildSignatureRequest(userId, { ...existing, events }, existing);
    const db = getDocumentsDbName();
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({
      ok: true,
      signatureRequest: sanitizeSignatureRequest({ ...doc, _rev: saved.rev }),
      signerLink,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reenviar' });
  }
}

// ─── PUBLIC: VIEW DOCUMENT ───────────────────────────────────────────────────

export async function viewSignaturePublic(req, res) {
  try {
    const { token } = req.params;
    let payload;
    try {
      payload = verifySignerToken(token);
    } catch {
      return res.status(401).json({ ok: false, error: 'Enlace inválido o expirado' });
    }

    const { requestId, signerId, email } = payload;
    const db = getDocumentsDbName();
    await ensureDatabase(req, db);
    const sigReq = await getDocument(req, db, requestId);

    if (!sigReq || sigReq.type !== 'signature_request' || sigReq.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    }

    if (['cancelled', 'expired'].includes(sigReq.status)) {
      return res.status(410).json({ ok: false, error: `La solicitud está ${sigReq.status === 'cancelled' ? 'cancelada' : 'caducada'}` });
    }

    const signer = sigReq.signers.find((s) => s.id === signerId && s.email === email);
    if (!signer) return res.status(404).json({ ok: false, error: 'Firmante no encontrado' });

    if (signer.status === 'pending') {
      const now = new Date().toISOString();
      signer.status = 'viewed';
      signer.viewedAt = now;

      const events = addSignatureEvent(sigReq, {
        action: 'viewed',
        actorName: signer.name,
        actorEmail: signer.email,
        signerId: signer.id,
        details: `${signer.name} abrió el documento`,
        timestamp: now,
      });

      const updated = { ...sigReq, signers: sigReq.signers, events, updatedAt: now };
      await putDocument(req, db, updated._id, updated);
    }

    let documentContent = null;
    if (sigReq.documentId) {
      try {
        const doc = await getDocument(req, db, sigReq.documentId);
        if (doc && doc.type === 'document') {
          documentContent = {
            name: doc.name,
            content: doc.content || '',
            fileUrl: doc.fileUrl || '',
            mimeType: doc.mimeType || '',
          };
        }
      } catch { /* doc may not exist */ }
    }

    return res.json({
      ok: true,
      request: {
        id: sigReq._id,
        documentName: sigReq.documentName,
        message: sigReq.message || '',
        expiresAt: sigReq.expiresAt,
        status: sigReq.status,
        createdByName: sigReq.createdByName,
        sourceFileUrl: sigReq.sourceFileUrl,
        sourceFileName: sigReq.sourceFileName,
        sourceMimeType: sigReq.sourceMimeType,
      },
      signer: {
        id: signer.id,
        name: signer.name,
        email: signer.email,
        role: signer.role,
        status: signer.status,
      },
      document: documentContent,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar documento' });
  }
}

// ─── PUBLIC: ACCEPT SIGNATURE ────────────────────────────────────────────────

export async function acceptSignaturePublic(req, res) {
  try {
    const { token } = req.params;
    let payload;
    try {
      payload = verifySignerToken(token);
    } catch {
      return res.status(401).json({ ok: false, error: 'Enlace inválido o expirado' });
    }

    const { requestId, signerId, email } = payload;
    const { signatureImageData } = req.body || {};

    const db = getDocumentsDbName();
    await ensureDatabase(req, db);
    const sigReq = await getDocument(req, db, requestId);

    if (!sigReq || sigReq.type !== 'signature_request' || sigReq.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    }

    if (!['pending', 'partially_signed'].includes(sigReq.status)) {
      return res.status(410).json({ ok: false, error: 'La solicitud ya no acepta firmas' });
    }

    const signerIdx = sigReq.signers.findIndex((s) => s.id === signerId && s.email === email);
    if (signerIdx === -1) return res.status(404).json({ ok: false, error: 'Firmante no encontrado' });

    const signer = sigReq.signers[signerIdx];
    if (signer.status === 'signed') return badRequest(res, 'Ya has firmado este documento');
    if (signer.status === 'rejected') return badRequest(res, 'Ya rechazaste este documento');

    if (sigReq.signingOrder === 'sequential') {
      const requiredBefore = sigReq.signers
        .filter((s) => s.role === 'signer' && s.order < signer.order);
      const allPreviousSigned = requiredBefore.every((s) => s.status === 'signed');
      if (!allPreviousSigned) return badRequest(res, 'Hay firmantes anteriores que aún no han firmado');
    }

    const now = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    signer.status = 'signed';
    signer.signedAt = now;
    signer.ipAddress = String(ip).split(',')[0].trim();
    signer.userAgent = ua;
    if (signatureImageData) signer.signatureImageUrl = signatureImageData;

    sigReq.signers[signerIdx] = signer;
    const newStatus = recalcSignatureStatus(sigReq.signers);

    const events = addSignatureEvent(sigReq, {
      action: 'signed',
      actorName: signer.name,
      actorEmail: signer.email,
      signerId: signer.id,
      details: `${signer.name} firmó el documento`,
      timestamp: now,
      metadata: { ip: signer.ipAddress },
    });

    const updates = {
      ...sigReq,
      status: newStatus,
      signers: sigReq.signers,
      events,
      updatedAt: now,
    };

    if (newStatus === 'completed') {
      updates.completedAt = now;
      events.push({
        id: `evt-${Date.now()}`,
        timestamp: now,
        action: 'completed',
        actorName: 'Sistema',
        actorEmail: '',
        signerId: '',
        details: 'Todos los firmantes han firmado — documento completado',
        metadata: {},
      });
      updates.events = events;
    }

    const saved = await putDocument(req, db, updates._id, updates);
    await updateLinkedDocument(req, updates);

    notifyOwner(req, sigReq.user_id,
      newStatus === 'completed'
        ? `Firma completada: ${sigReq.documentName}`
        : `${signer.name} firmó: ${sigReq.documentName}`,
      newStatus === 'completed'
        ? `Todos los firmantes han firmado "${sigReq.documentName}"`
        : `${signer.name} ha firmado "${sigReq.documentName}"`,
      sigReq._id,
      `/saas/documents?signature=${sigReq._id}`,
    );

    return res.json({
      ok: true,
      status: newStatus,
      signer: { id: signer.id, name: signer.name, status: 'signed', signedAt: now },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar firma' });
  }
}

// ─── PUBLIC: REJECT SIGNATURE ────────────────────────────────────────────────

export async function rejectSignaturePublic(req, res) {
  try {
    const { token } = req.params;
    let payload;
    try {
      payload = verifySignerToken(token);
    } catch {
      return res.status(401).json({ ok: false, error: 'Enlace inválido o expirado' });
    }

    const { requestId, signerId, email } = payload;
    const { reason } = req.body || {};

    if (!reason?.trim()) return badRequest(res, 'El motivo de rechazo es obligatorio');

    const db = getDocumentsDbName();
    await ensureDatabase(req, db);
    const sigReq = await getDocument(req, db, requestId);

    if (!sigReq || sigReq.type !== 'signature_request' || sigReq.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    }

    if (!['pending', 'partially_signed'].includes(sigReq.status)) {
      return res.status(410).json({ ok: false, error: 'La solicitud ya no acepta acciones' });
    }

    const signerIdx = sigReq.signers.findIndex((s) => s.id === signerId && s.email === email);
    if (signerIdx === -1) return res.status(404).json({ ok: false, error: 'Firmante no encontrado' });

    const signer = sigReq.signers[signerIdx];
    if (signer.status === 'signed') return badRequest(res, 'Ya firmaste este documento');
    if (signer.status === 'rejected') return badRequest(res, 'Ya rechazaste este documento');

    const now = new Date().toISOString();
    signer.status = 'rejected';
    signer.rejectedAt = now;
    signer.rejectionReason = reason.trim();
    signer.ipAddress = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    signer.userAgent = req.headers['user-agent'] || '';

    sigReq.signers[signerIdx] = signer;

    const events = addSignatureEvent(sigReq, {
      action: 'rejected',
      actorName: signer.name,
      actorEmail: signer.email,
      signerId: signer.id,
      details: `${signer.name} rechazó: "${reason.trim()}"`,
      timestamp: now,
    });

    const updates = {
      ...sigReq,
      status: 'rejected',
      signers: sigReq.signers,
      events,
      updatedAt: now,
    };

    const saved = await putDocument(req, db, updates._id, updates);
    await updateLinkedDocument(req, updates);

    notifyOwner(req, sigReq.user_id,
      `Firma rechazada: ${sigReq.documentName}`,
      `${signer.name} rechazó firmar "${sigReq.documentName}": "${reason.trim()}"`,
      sigReq._id,
      `/saas/documents?signature=${sigReq._id}`,
    );

    return res.json({
      ok: true,
      status: 'rejected',
      signer: { id: signer.id, name: signer.name, status: 'rejected', reason: reason.trim() },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al rechazar firma' });
  }
}
