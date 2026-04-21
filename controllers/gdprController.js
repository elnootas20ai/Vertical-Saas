import {
  getGdprConsentsDbName,
  getGdprRequestsDbName,
  buildGdprConsentDocument,
  sanitizeGdprConsent,
  buildGdprRequestDocument,
  sanitizeGdprRequest,
  listGdprConsentsByUser,
  listGdprRequestsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  findAccountByUserId,
  logAccountActivity,
  getAllDocuments,
  getClientsDbName,
  getSalesDbName,
  getLeadsDbName,
  getInvoicesDbName,
  getDocumentsDbName,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ─── Consentimientos ──────────────────────────────────────────────────────────

export async function listConsents(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const consents = await listGdprConsentsByUser(req, userId);
    return res.json({ ok: true, consents: consents.map(sanitizeGdprConsent) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function createConsent(req, res) {
  try {
    const { userId } = req.params;
    const { consent } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!consent || typeof consent !== 'object') return badRequest(res, 'Falta el objeto consent');
    if (!consent.clientName?.trim()) return badRequest(res, 'El nombre del interesado es obligatorio');
    if (!consent.purpose) return badRequest(res, 'La finalidad del tratamiento es obligatoria');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getGdprConsentsDbName();
    await ensureDatabase(req, db);
    const doc = buildGdprConsentDocument(userId, { ...consent, ipAddress: req.ip });
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'gdpr',
      action: `Registró consentimiento RGPD para ${doc.clientName} (${doc.purpose})`,
      entityId: doc._id,
      entityLabel: doc.clientName,
      metadata: { purpose: doc.purpose, granted: doc.granted },
    });

    return res.status(201).json({ ok: true, consent: sanitizeGdprConsent({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function updateConsent(req, res) {
  try {
    const { userId, consentId } = req.params;
    const { consent } = req.body || {};
    if (!consent) return badRequest(res, 'Faltan datos del consentimiento');

    const db = getGdprConsentsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, consentId);
    if (!existing || existing.type !== 'gdpr_consent' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Consentimiento no encontrado' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const doc = buildGdprConsentDocument(userId, { ...existing, ...consent }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'gdpr',
      action: `Actualizó consentimiento RGPD de ${doc.clientName} — ${doc.granted ? 'activo' : 'revocado'}`,
      entityId: doc._id,
      entityLabel: doc.clientName,
      metadata: { granted: doc.granted, revokedAt: doc.revokedAt },
    });

    return res.json({ ok: true, consent: sanitizeGdprConsent({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ─── Solicitudes de derechos RGPD ─────────────────────────────────────────────

export async function listRequests(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const requests = await listGdprRequestsByUser(req, userId);
    return res.json({ ok: true, requests: requests.map(sanitizeGdprRequest) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function createRequest(req, res) {
  try {
    const { userId } = req.params;
    const { request: requestData } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!requestData || typeof requestData !== 'object') return badRequest(res, 'Falta el objeto request');
    if (!requestData.clientName?.trim()) return badRequest(res, 'El nombre del interesado es obligatorio');
    if (!requestData.rightType) return badRequest(res, 'El tipo de derecho RGPD es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getGdprRequestsDbName();
    await ensureDatabase(req, db);
    const doc = buildGdprRequestDocument(userId, requestData);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'gdpr',
      action: `Registró solicitud de derecho RGPD (${doc.rightType}) para ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: doc.clientName,
      metadata: { rightType: doc.rightType, legalDeadline: doc.legalDeadline },
    });

    return res.status(201).json({ ok: true, request: sanitizeGdprRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function updateRequest(req, res) {
  try {
    const { userId, requestId } = req.params;
    const { request: requestData } = req.body || {};
    if (!requestData) return badRequest(res, 'Faltan datos de la solicitud');

    const db = getGdprRequestsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, requestId);
    if (!existing || existing.type !== 'gdpr_request' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const doc = buildGdprRequestDocument(userId, { ...existing, ...requestData }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'gdpr',
      action: `Actualizó solicitud RGPD (${doc.rightType}) — estado: ${doc.status}`,
      entityId: doc._id,
      entityLabel: doc.clientName,
      metadata: { status: doc.status, rightType: doc.rightType },
    });

    return res.json({ ok: true, request: sanitizeGdprRequest({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ─── LEG-02: Derecho al olvido (Art. 17 RGPD) ────────────────────────────────

export async function rightToErasure(req, res) {
  try {
    const { userId } = req.params;
    const { clientId, clientName, reason, confirmText } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!clientId) return badRequest(res, 'Falta clientId');
    if (!clientName?.trim()) return badRequest(res, 'Falta clientName de confirmación');
    if (confirmText !== 'ELIMINAR PERMANENTEMENTE') {
      return badRequest(res, 'Texto de confirmación incorrecto. Escribe exactamente: ELIMINAR PERMANENTEMENTE');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const executedAt = new Date().toISOString();
    const deletionLog = {
      userId,
      clientId,
      clientName,
      reason: String(reason || 'Solicitud de derecho al olvido (Art. 17 RGPD)').trim(),
      executedBy: account.fullName,
      executedAt,
      databases: [],
    };

    const dbsToCheck = [
      { name: getClientsDbName(), docType: 'client', matchById: true },
      { name: getSalesDbName(), docType: 'sale', field: 'clientId' },
      { name: getLeadsDbName(), docType: 'lead', field: 'clientId' },
      { name: getInvoicesDbName(), docType: 'invoice', field: 'clientId' },
      { name: getDocumentsDbName(), docType: 'document', field: 'clientId' },
      { name: getGdprConsentsDbName(), docType: 'gdpr_consent', field: 'clientId' },
    ];

    for (const dbDef of dbsToCheck) {
      try {
        await ensureDatabase(req, dbDef.name);
        const docs = await getAllDocuments(req, dbDef.name);
        let anonymizedCount = 0;

        for (const doc of docs) {
          if (!doc || doc.user_id !== userId) continue;
          const matches = dbDef.matchById ? doc._id === clientId : doc[dbDef.field] === clientId;
          if (!matches) continue;

          const anonymized = {
            ...doc,
            clientName: '[ELIMINADO - RGPD Art. 17]',
            name: doc.type === 'client' ? '[ELIMINADO - RGPD Art. 17]' : doc.name,
            firstName: doc.firstName ? '[ELIMINADO]' : undefined,
            lastName: doc.lastName ? '[ELIMINADO]' : undefined,
            email: '',
            phone: '',
            dni: '',
            address: '',
            city: '',
            postalCode: '',
            notes: '',
            gdprErasedAt: executedAt,
            gdprErasedBy: userId,
            gdprErasureReason: deletionLog.reason,
          };

          Object.keys(anonymized).forEach((k) => {
            if (anonymized[k] === undefined) delete anonymized[k];
          });

          await putDocument(req, dbDef.name, doc._id, anonymized);
          anonymizedCount++;
        }

        deletionLog.databases.push({ db: dbDef.name, type: dbDef.docType, anonymized: anonymizedCount });
      } catch (dbErr) {
        deletionLog.databases.push({ db: dbDef.name, type: dbDef.docType, error: dbErr.message });
      }
    }

    const erasureDoc = buildGdprRequestDocument(userId, {
      clientId,
      clientName,
      rightType: 'erasure',
      status: 'completed',
      description: deletionLog.reason,
      response: `Datos anonimizados en ${deletionLog.databases.filter((d) => !d.error).length} bases de datos`,
      notes: JSON.stringify(deletionLog.databases),
    });
    erasureDoc.status = 'completed';
    erasureDoc.completedAt = executedAt;

    const gdprDb = getGdprRequestsDbName();
    await ensureDatabase(req, gdprDb);
    await putDocument(req, gdprDb, erasureDoc._id, erasureDoc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'gdpr',
      action: `DERECHO AL OLVIDO ejecutado para cliente ${clientName} (ID: ${clientId})`,
      entityId: clientId,
      entityLabel: clientName,
      metadata: { databases: deletionLog.databases, reason: deletionLog.reason },
    });

    return res.json({
      ok: true,
      erasure: deletionLog,
      certificate: {
        id: erasureDoc._id,
        executedAt,
        executedBy: account.fullName,
        clientId,
        clientName,
        affectedDatabases: deletionLog.databases,
        legalBasis: 'Art. 17 RGPD (UE) 2016/679',
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
