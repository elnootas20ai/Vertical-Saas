import * as cacheService from '../services/cache.js';
import {
  VEHICLES_DB,
  buildFiscalConsultationDocument,
  sanitizeFiscalConsultation,
  listFiscalConsultationsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  logAccountActivity,
} from '../services/couchdb.js';

function badRequest(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

export async function listFiscalConsultations(req, res) {
  try {
    const { userId } = req.params;
    const businessId = String(req.query.businessId || '').trim() || null;
    const docs = await listFiscalConsultationsByUser(req, userId, businessId);
    const items = docs.map(sanitizeFiscalConsultation).filter(Boolean);
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function createFiscalConsultation(req, res) {
  try {
    const { userId } = req.params;
    const data = req.body || {};
    if (!data.form || typeof data.form !== 'object') {
      return badRequest(res, 'form es obligatorio');
    }

    await ensureDatabase(req, VEHICLES_DB);
    const doc = buildFiscalConsultationDocument(
      userId,
      {
        vehicleId: data.vehicleId,
        acquisitionId: data.acquisitionId,
        form: data.form,
        result: data.result || {},
        summary: data.summary || {},
      },
      null,
      data.businessId,
    );

    await putDocument(req, VEHICLES_DB, doc._id, doc);
    cacheService.invalidateByPrefix('compraventa');

    await logAccountActivity(req, userId, {
      action: 'create_fiscal_consultation',
      resource: 'fiscal_consultation',
      resourceId: doc._id,
      details: data.summary?.vehicleLabel || 'Consulta fiscal compraventa',
    }).catch(() => {});

    return res.status(201).json({ ok: true, item: sanitizeFiscalConsultation(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function deleteFiscalConsultation(req, res) {
  try {
    const { userId, id } = req.params;
    await ensureDatabase(req, VEHICLES_DB);
    const doc = await getDocument(req, VEHICLES_DB, id);
    if (!doc || doc.type !== 'fiscal_consultation' || doc.deletedAt || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Consulta no encontrada' });
    }

    await softDeleteDocument(req, VEHICLES_DB, id);
    cacheService.invalidateByPrefix('compraventa');
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
