import {
  getFinanceDbName,
  buildTaxObligationDocument,
  sanitizeTaxObligation,
  listTaxObligationsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { v4 as uuidv4 } from 'uuid';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureObligationOwner(req, userId, obligationId) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, obligationId);
  if (!doc || doc.type !== 'tax_obligation' || doc.user_id !== userId || doc.deletedAt) {
    return null;
  }
  return doc;
}

export async function listObligations(req, res) {
  try {
    const { userId } = req.params;
    const { year } = req.query;
    if (!userId) return badRequest(res, 'Falta userId');

    const raw = await listTaxObligationsByUser(req, userId, year);
    return res.json({ ok: true, obligations: raw.map(sanitizeTaxObligation).filter(Boolean) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar obligaciones' });
  }
}

export async function createObligation(req, res) {
  try {
    const { userId } = req.params;
    const { obligation } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!obligation || typeof obligation !== 'object') return badRequest(res, 'Falta el objeto obligation');
    if (!obligation.model) return badRequest(res, 'El modelo fiscal es obligatorio');
    if (!obligation.dueDate) return badRequest(res, 'La fecha de vencimiento es obligatoria');

    const db = getFinanceDbName();
    await ensureDatabase(req, db);
    const doc = buildTaxObligationDocument(userId, obligation);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, obligation: sanitizeTaxObligation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear obligación' });
  }
}

export async function updateObligation(req, res) {
  try {
    const { userId, obligationId } = req.params;
    const { obligation } = req.body || {};

    if (!obligation || typeof obligation !== 'object') return badRequest(res, 'Faltan datos');

    const existing = await ensureObligationOwner(req, userId, obligationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Obligación no encontrada' });

    const db = getFinanceDbName();
    const doc = buildTaxObligationDocument(userId, { ...existing, ...obligation }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, obligation: sanitizeTaxObligation({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar obligación' });
  }
}

export async function removeObligation(req, res) {
  try {
    const { userId, obligationId } = req.params;

    const existing = await ensureObligationOwner(req, userId, obligationId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Obligación no encontrada' });

    const db = getFinanceDbName();
    await softDeleteDocument(req, db, obligationId);

    return res.json({ ok: true, id: obligationId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar obligación' });
  }
}

const FISCAL_CALENDAR_ES = [
  { model: 'modelo_303', name: 'Modelo 303 — IVA', periods: ['Q1','Q2','Q3','Q4'], dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-30' } },
  { model: 'modelo_111', name: 'Modelo 111 — Retenciones IRPF', periods: ['Q1','Q2','Q3','Q4'], dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-20' } },
  { model: 'modelo_115', name: 'Modelo 115 — Retenciones alquiler', periods: ['Q1','Q2','Q3','Q4'], dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-20' } },
  { model: 'modelo_130', name: 'Modelo 130 — Pago fraccionado IRPF', periods: ['Q1','Q2','Q3','Q4'], dueDates: { Q1: '04-20', Q2: '07-20', Q3: '10-20', Q4: '01-30' } },
  { model: 'modelo_390', name: 'Modelo 390 — Resumen anual IVA', periods: ['annual'], dueDates: { annual: '01-30' } },
  { model: 'modelo_190', name: 'Modelo 190 — Resumen anual retenciones', periods: ['annual'], dueDates: { annual: '01-31' } },
  { model: 'modelo_200', name: 'Modelo 200 — Impuesto de Sociedades', periods: ['annual'], dueDates: { annual: '07-25' } },
  { model: 'modelo_347', name: 'Modelo 347 — Operaciones con terceros', periods: ['annual'], dueDates: { annual: '02-28' } },
];

const PERIOD_LABELS = { Q1: '1T', Q2: '2T', Q3: '3T', Q4: '4T', annual: 'Anual' };

export async function generateFromPresets(req, res) {
  try {
    const { userId } = req.params;
    const { year, isAutonomo = true } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!year) return badRequest(res, 'Falta el año');

    const db = getFinanceDbName();
    await ensureDatabase(req, db);

    const existing = await listTaxObligationsByUser(req, userId, year);
    const existingKeys = new Set(existing.map((o) => `${o.model}:${o.period}`));

    const created = [];

    for (const preset of FISCAL_CALENDAR_ES) {
      if (preset.model === 'modelo_130' && !isAutonomo) continue;
      if (preset.model === 'modelo_200' && isAutonomo) continue;

      for (const period of preset.periods) {
        const dueDateMmDd = preset.dueDates[period];
        if (!dueDateMmDd) continue;

        const isNextYear = period === 'Q4' && dueDateMmDd.startsWith('01');
        const y = isNextYear ? Number(year) + 1 : Number(year);
        const dueDate = `${y}-${dueDateMmDd}`;
        const periodKey = period === 'annual' ? String(year) : `${year}-${period}`;
        const dedupKey = `${preset.model}:${periodKey}`;

        if (existingKeys.has(dedupKey)) continue;

        const periodLabel = period === 'annual' ? `Anual ${year}` : `${PERIOD_LABELS[period]} ${year}`;

        const doc = buildTaxObligationDocument(userId, {
          model: preset.model,
          modelName: preset.name,
          period: periodKey,
          periodLabel,
          dueDate,
          notes: '',
          reminderDaysBefore: 7,
        });

        const saved = await putDocument(req, db, doc._id, doc);
        created.push(sanitizeTaxObligation({ ...doc, _rev: saved.rev }));
      }
    }

    return res.status(201).json({ ok: true, obligations: created.filter(Boolean), created: created.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar calendario' });
  }
}
