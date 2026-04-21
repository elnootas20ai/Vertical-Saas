import { Router } from 'express';
import {
  getLeadsDbName,
  buildLeadDocument,
  sanitizeLead,
  ensureDatabase,
  putDocument,
  findAccountByUserId,
} from '../services/couchdb.js';

const embedRouter = Router();

/**
 * POST /api/embed/:dealerId/lead
 * Endpoint público (sin autenticación) para crear leads desde formularios embebibles.
 * El dealerId es el userId del concesionario obtenido desde la URL del widget.
 */
embedRouter.post('/:dealerId/lead', async (req, res) => {
  try {
    const { dealerId } = req.params;
    const {
      name, phone, email, vehicleInterest, budget, notes, consent,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      referrer, landing_page,
    } = req.body || {};

    if (!dealerId) return res.status(400).json({ ok: false, error: 'dealerId requerido' });
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
    if (!phone?.trim()) return res.status(400).json({ ok: false, error: 'El teléfono es obligatorio' });
    if (!consent) return res.status(400).json({ ok: false, error: 'Debes aceptar la política de privacidad' });

    const account = await findAccountByUserId(req, dealerId);
    if (!account) return res.status(404).json({ ok: false, error: 'Concesionario no encontrado' });

    const db = getLeadsDbName();
    await ensureDatabase(req, db);

    const doc = buildLeadDocument(dealerId, {
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || '',
      vehicleInterest: vehicleInterest?.trim() || '',
      budget: budget?.trim() || '',
      notes: notes?.trim() || '',
      source: utm_source ? `${utm_source}${utm_medium ? `/${utm_medium}` : ''}` : 'web_form',
      status: 'new',
      utm_source: utm_source?.trim() || '',
      utm_medium: utm_medium?.trim() || '',
      utm_campaign: utm_campaign?.trim() || '',
      utm_content: utm_content?.trim() || '',
      utm_term: utm_term?.trim() || '',
      referrer: referrer?.trim() || '',
      landing_page: landing_page?.trim() || '',
    });

    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({
      ok: true,
      leadId: doc._id,
      lead: sanitizeLead({ ...doc, _rev: saved.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar el formulario' });
  }
});

/**
 * GET /api/embed/:dealerId/info
 * Devuelve información pública del concesionario para mostrar en el widget.
 */
embedRouter.get('/:dealerId/info', async (req, res) => {
  try {
    const { dealerId } = req.params;
    const account = await findAccountByUserId(req, dealerId);
    if (!account) return res.status(404).json({ ok: false, error: 'No encontrado' });

    return res.json({
      ok: true,
      dealer: {
        name: account.businessName || account.fullName || 'Concesionario',
        logo: account.logo || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export { embedRouter };
