import {
  getLeadsDbName,
  buildLeadDocument,
  sanitizeLead,
  listLeadsByUser,
  findDuplicateLeads,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';
import { computeLeadScore } from '../services/leadScoring.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureLeadOwner(req, userId, leadId) {
  const db = getLeadsDbName();
  await ensureDatabase(req, db);
  const lead = await getDocument(req, db, leadId);
  if (!lead || lead.type !== 'lead' || lead.user_id !== userId) {
    return null;
  }
  return lead;
}

export async function listLeads(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listLeadsByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeLead), req.query);
    return res.json({ ok: true, leads: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar leads' });
  }
}

export async function createLead(req, res) {
  try {
    const { userId } = req.params;
    const { lead } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!lead || typeof lead !== 'object') return badRequest(res, 'Falta el objeto lead en el body');
    if (!lead.name?.trim()) return badRequest(res, 'El nombre del lead es obligatorio');
    if (!lead.phone?.trim()) return badRequest(res, 'El teléfono del lead es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLeadsDbName();
    await ensureDatabase(req, db);
    const doc = buildLeadDocument(userId, lead);
    // C-02: scoring automático en servidor
    const { total: score } = computeLeadScore(doc);
    doc.score = score;
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'lead',
      action: `Creó lead ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { source: doc.source, status: doc.status },
    });

    const duplicates = await findDuplicateLeads(req, userId, doc).catch(() => []);
    return res.status(201).json({ ok: true, lead: sanitizeLead({ ...doc, _rev: saved.rev }), duplicates });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear lead' });
  }
}

export async function updateLead(req, res) {
  try {
    const { userId, leadId } = req.params;
    const { lead } = req.body || {};

    if (!lead || typeof lead !== 'object') return badRequest(res, 'Faltan datos del lead');

    const existing = await ensureLeadOwner(req, userId, leadId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Lead no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLeadsDbName();
    const doc = buildLeadDocument(userId, { ...existing, ...lead }, existing);
    // C-02: scoring automático al actualizar
    const { total: score } = computeLeadScore(doc);
    doc.score = score;
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'lead',
      action: `Actualizó lead ${doc.name} — estado: ${doc.status}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, lead: sanitizeLead({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar lead' });
  }
}

export async function getLeadAttribution(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const leads = await listLeadsByUser(req, userId);

    const bySource = {};
    const byCampaign = {};
    const byMedium = {};
    const monthlyTrend = {};

    for (const lead of leads) {
      const source = lead.utm_source || lead.source || 'directo';
      const campaign = lead.utm_campaign || '';
      const medium = lead.utm_medium || '';
      const month = String(lead.createdAt || '').slice(0, 7);

      bySource[source] = (bySource[source] || 0) + 1;
      if (campaign) byCampaign[campaign] = (byCampaign[campaign] || 0) + 1;
      if (medium) byMedium[medium] = (byMedium[medium] || 0) + 1;
      if (month) {
        if (!monthlyTrend[month]) monthlyTrend[month] = {};
        monthlyTrend[month][source] = (monthlyTrend[month][source] || 0) + 1;
      }
    }

    const wonBySource = {};
    for (const lead of leads.filter((l) => l.status === 'won')) {
      const source = lead.utm_source || lead.source || 'directo';
      wonBySource[source] = (wonBySource[source] || 0) + 1;
    }

    const conversionBySource = {};
    for (const [src, total] of Object.entries(bySource)) {
      const won = wonBySource[src] || 0;
      conversionBySource[src] = total > 0 ? Number(((won / total) * 100).toFixed(1)) : 0;
    }

    return res.json({
      ok: true,
      attribution: {
        total: leads.length,
        bySource,
        byCampaign,
        byMedium,
        monthlyTrend,
        conversionBySource,
        wonBySource,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error calculando atribución' });
  }
}

export async function checkLeadDuplicates(req, res) {
  try {
    const { userId } = req.params;
    const { lead } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!lead || typeof lead !== 'object') return badRequest(res, 'Falta el objeto lead');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const duplicates = await findDuplicateLeads(req, userId, lead);
    return res.json({ ok: true, duplicates });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar duplicados' });
  }
}

export async function bulkCreateLeads(req, res) {
  try {
    const { userId } = req.params;
    const { leads } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(leads) || leads.length === 0) {
      return badRequest(res, 'Se esperaba un array de leads en leads[]');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLeadsDbName();
    await ensureDatabase(req, db);

    const created = [];
    const errors = [];

    for (const lead of leads) {
      try {
        if (!lead.name?.trim() || !lead.phone?.trim()) {
          errors.push({ lead, error: 'Nombre y teléfono son obligatorios' });
          continue;
        }
        const doc = buildLeadDocument(userId, lead);
        const { total: score } = computeLeadScore(doc);
        doc.score = score;
        const saved = await putDocument(req, db, doc._id, doc);
        created.push(sanitizeLead({ ...doc, _rev: saved.rev }));
      } catch (err) {
        errors.push({ lead, error: err.message });
      }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'lead',
      action: `Importación masiva: ${created.length} leads creados`,
      entityId: userId,
      entityLabel: 'Importación masiva leads',
      metadata: { created: created.length, errors: errors.length },
    });

    return res.status(201).json({ ok: true, leads: created, errors, total: created.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en importación masiva de leads' });
  }
}

export async function recalculateLeadScores(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLeadsDbName();
    await ensureDatabase(req, db);
    const leads = await listLeadsByUser(req, userId);

    let updated = 0;
    for (const lead of leads) {
      if (lead.deletedAt) continue;
      const { total: score } = computeLeadScore(lead);
      if (lead.score !== score) {
        const updatedDoc = { ...lead, score, updatedAt: new Date().toISOString() };
        await putDocument(req, db, lead._id, updatedDoc).catch(() => null);
        updated++;
      }
    }

    return res.json({ ok: true, total: leads.length, updated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error recalculando scores' });
  }
}

export async function mergeLead(req, res) {
  try {
    const { userId } = req.params;
    const { keepId, deleteId } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!keepId || !deleteId) return badRequest(res, 'Faltan keepId y deleteId');
    if (keepId === deleteId) return badRequest(res, 'keepId y deleteId deben ser distintos');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLeadsDbName();
    await ensureDatabase(req, db);

    const [keepLead, deleteLead] = await Promise.all([
      getDocument(req, db, keepId),
      getDocument(req, db, deleteId),
    ]);

    if (!keepLead || keepLead.type !== 'lead' || keepLead.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Lead a conservar no encontrado' });
    }
    if (!deleteLead || deleteLead.type !== 'lead' || deleteLead.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Lead a eliminar no encontrado' });
    }

    // Merge interactions from both leads
    const mergedInteractions = [
      ...(Array.isArray(keepLead.interactions) ? keepLead.interactions : []),
      ...(Array.isArray(deleteLead.interactions) ? deleteLead.interactions : []),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Merge tags (union)
    const mergedTags = [...new Set([
      ...(Array.isArray(keepLead.tags) ? keepLead.tags : []),
      ...(Array.isArray(deleteLead.tags) ? deleteLead.tags : []),
    ])];

    // Keep the most complete data (fill empty fields from deleted record)
    const mergedDoc = {
      ...keepLead,
      email: keepLead.email || deleteLead.email || '',
      budget: keepLead.budget || deleteLead.budget || '',
      vehicleInterest: keepLead.vehicleInterest || deleteLead.vehicleInterest || '',
      notes: [keepLead.notes, deleteLead.notes].filter(Boolean).join('\n\n') || '',
      interactions: mergedInteractions,
      tags: mergedTags,
      mergedFrom: deleteId,
      updatedAt: new Date().toISOString(),
    };
    const { total: score } = computeLeadScore(mergedDoc);
    mergedDoc.score = score;

    await putDocument(req, db, keepId, mergedDoc);
    await softDeleteDocument(req, db, deleteId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'lead',
      action: `Fusionó leads: conservó ${keepLead.name}, eliminó ${deleteLead.name}`,
      entityId: keepId,
      entityLabel: keepLead.name,
      metadata: { mergedFrom: deleteId },
    });

    return res.json({ ok: true, lead: sanitizeLead({ ...mergedDoc }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error fusionando leads' });
  }
}

export async function removeLead(req, res) {
  try {
    const { userId, leadId } = req.params;

    const existing = await ensureLeadOwner(req, userId, leadId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Lead no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getLeadsDbName();
    await softDeleteDocument(req, db, leadId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'lead',
      action: `Eliminó lead ${existing.name}`,
      entityId: existing._id,
      entityLabel: existing.name,
      metadata: {},
    });

    return res.json({ ok: true, id: leadId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar lead' });
  }
}
