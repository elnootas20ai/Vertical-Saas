import {
  getOpportunitiesDbName,
  buildOpportunityDocument,
  sanitizeOpportunity,
  listOpportunitiesByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getLeadsDbName,
  getClientsDbName,
  buildClientDocument,
  sanitizeLead,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureOpportunityOwner(req, userId, oppId) {
  const db = getOpportunitiesDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, oppId);
  if (!doc || doc.type !== 'opportunity' || doc.user_id !== userId) return null;
  return doc;
}

// ─── LIST ───────────────────────────────────────────────────────────────────

export async function listOpportunities(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    let raw = await listOpportunitiesByUser(req, userId);

    const { responsible, commercialStatus, vehicleId, clientId, scope } = req.query;
    if (scope === 'mine' && req.query.currentUserId) {
      raw = raw.filter((o) => o.responsible === req.query.currentUserId);
    }
    if (responsible) raw = raw.filter((o) => o.responsible === responsible);
    if (commercialStatus) raw = raw.filter((o) => o.commercialStatus === commercialStatus);
    if (vehicleId) raw = raw.filter((o) => o.vehicleId === vehicleId);
    if (clientId) raw = raw.filter((o) => o.clientId === clientId || o.leadId === clientId);

    const { items, meta } = applyQueryOptions(raw.map(sanitizeOpportunity), req.query);
    return res.json({ ok: true, opportunities: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar oportunidades' });
  }
}

// ─── STATS ──────────────────────────────────────────────────────────────────

export async function getOpportunityStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    let opps = await listOpportunitiesByUser(req, userId);

    const { scope, currentUserId } = req.query;
    if (scope === 'mine' && currentUserId) {
      opps = opps.filter((o) => o.responsible === currentUserId);
    }

    const terminal = ['won', 'lost'];
    const active = opps.filter((o) => !terminal.includes(o.commercialStatus));
    const won = opps.filter((o) => o.commercialStatus === 'won');
    const lost = opps.filter((o) => o.commercialStatus === 'lost');

    const byStage = {};
    for (const o of opps) {
      if (!byStage[o.commercialStatus]) byStage[o.commercialStatus] = { count: 0, value: 0 };
      byStage[o.commercialStatus].count++;
      byStage[o.commercialStatus].value += Number(o.budget || 0);
    }

    const pipelineValue = active.reduce((sum, o) => sum + Number(o.budget || 0), 0);
    const conversionRate = opps.length > 0 ? Math.round((won.length / opps.length) * 100) : 0;

    let avgCloseTimeDays = 0;
    if (won.length > 0) {
      const totalDays = won.reduce((sum, o) => {
        const created = new Date(o.createdAt).getTime();
        const lastChange = (o.stageHistory || [])
          .filter((h) => h.to === 'won')
          .map((h) => new Date(h.at).getTime())
          .pop() || Date.now();
        return sum + Math.max(0, (lastChange - created) / 86400000);
      }, 0);
      avgCloseTimeDays = Math.round(totalDays / won.length);
    }

    const reserved = opps.filter((o) => o.commercialStatus === 'reserved');

    return res.json({
      ok: true,
      stats: {
        total: opps.length,
        active: active.length,
        won: won.length,
        lost: lost.length,
        reserved: reserved.length,
        pipelineValue,
        conversionRate,
        avgCloseTimeDays,
        byStage,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular estadísticas' });
  }
}

// ─── DETAIL ─────────────────────────────────────────────────────────────────

export async function getOpportunityDetail(req, res) {
  try {
    const { userId, opportunityId } = req.params;
    const existing = await ensureOpportunityOwner(req, userId, opportunityId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });

    return res.json({ ok: true, opportunity: sanitizeOpportunity(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar oportunidad' });
  }
}

// ─── CREATE ─────────────────────────────────────────────────────────────────

export async function createOpportunity(req, res) {
  try {
    const { userId } = req.params;
    const { opportunity } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!opportunity || typeof opportunity !== 'object') return badRequest(res, 'Falta el objeto opportunity');
    if (!opportunity.vehicleId) return badRequest(res, 'Falta vehicleId');
    if (!opportunity.leadId && !opportunity.clientId) return badRequest(res, 'Falta leadId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getOpportunitiesDbName();
    await ensureDatabase(req, db);
    const doc = buildOpportunityDocument(userId, opportunity);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'opportunity',
      action: `Creó oportunidad ${doc.vehicleName} para ${opportunity.clientId ? 'cliente' : 'lead'}`,
      entityId: doc._id,
      entityLabel: doc.vehicleName,
      metadata: { commercialStatus: doc.commercialStatus, vehicleId: doc.vehicleId },
    });

    return res.status(201).json({ ok: true, opportunity: sanitizeOpportunity({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear oportunidad' });
  }
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

export async function updateOpportunity(req, res) {
  try {
    const { userId, opportunityId } = req.params;
    const { opportunity } = req.body || {};

    if (!opportunity || typeof opportunity !== 'object') return badRequest(res, 'Faltan datos de la oportunidad');

    const existing = await ensureOpportunityOwner(req, userId, opportunityId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const merged = { ...existing, ...opportunity, _changedBy: account.fullName || userId };
    const db = getOpportunitiesDbName();
    const doc = buildOpportunityDocument(userId, merged, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'opportunity',
      action: `Actualizó oportunidad ${doc.vehicleName} → ${doc.commercialStatus}`,
      entityId: doc._id,
      entityLabel: doc.vehicleName,
      metadata: { commercialStatus: doc.commercialStatus },
    });

    return res.json({ ok: true, opportunity: sanitizeOpportunity({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar oportunidad' });
  }
}

// ─── CHANGE STAGE ───────────────────────────────────────────────────────────

export async function changeOpportunityStage(req, res) {
  try {
    const { userId, opportunityId } = req.params;
    const { commercialStatus, lostReason } = req.body || {};

    if (!commercialStatus) return badRequest(res, 'Falta commercialStatus');

    const existing = await ensureOpportunityOwner(req, userId, opportunityId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const updates = { commercialStatus, _changedBy: account.fullName || userId };
    if (lostReason) updates.lostReason = lostReason;

    const db = getOpportunitiesDbName();
    const doc = buildOpportunityDocument(userId, { ...existing, ...updates }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    // Auto-convert lead → client when reaching 'quoted' or 'negotiation' and no clientId
    if (['quoted', 'negotiation'].includes(commercialStatus) && doc.leadId && !doc.clientId) {
      try {
        await autoConvertLeadToClient(req, userId, doc, account);
      } catch (_) { /* best effort */ }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'opportunity',
      action: `Movió oportunidad ${doc.vehicleName} a ${commercialStatus}`,
      entityId: doc._id,
      entityLabel: doc.vehicleName,
      metadata: { from: existing.commercialStatus, to: commercialStatus },
    });

    return res.json({ ok: true, opportunity: sanitizeOpportunity({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cambiar etapa' });
  }
}

// ─── UPDATE NEXT ACTION ─────────────────────────────────────────────────────

export async function updateNextAction(req, res) {
  try {
    const { userId, opportunityId } = req.params;
    const { nextAction } = req.body || {};

    const existing = await ensureOpportunityOwner(req, userId, opportunityId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });

    const db = getOpportunitiesDbName();
    const doc = buildOpportunityDocument(userId, { ...existing, nextAction }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, opportunity: sanitizeOpportunity({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar próxima acción' });
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function removeOpportunity(req, res) {
  try {
    const { userId, opportunityId } = req.params;

    const existing = await ensureOpportunityOwner(req, userId, opportunityId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getOpportunitiesDbName();
    await softDeleteDocument(req, db, opportunityId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'opportunity',
      action: `Eliminó oportunidad ${existing.vehicleName}`,
      entityId: existing._id,
      entityLabel: existing.vehicleName,
      metadata: {},
    });

    return res.json({ ok: true, id: opportunityId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar oportunidad' });
  }
}

// ─── ACTIVITY FEED ──────────────────────────────────────────────────────────

export async function getOpportunityActivity(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const opps = await listOpportunitiesByUser(req, userId);

    const { scope, currentUserId } = req.query;
    const filtered = (scope === 'mine' && currentUserId)
      ? opps.filter((o) => o.responsible === currentUserId)
      : opps;

    const events = [];

    for (const opp of filtered) {
      for (const h of (opp.stageHistory || [])) {
        events.push({
          type: 'stage_change',
          opportunityId: opp._id,
          vehicleName: opp.vehicleName,
          description: `${h.by || 'Sistema'} movió a ${h.to}`,
          from: h.from,
          to: h.to,
          actor: h.by || 'Sistema',
          date: h.at,
        });
      }

      for (const inter of (opp.interactions || [])) {
        events.push({
          type: 'interaction',
          opportunityId: opp._id,
          vehicleName: opp.vehicleName,
          description: inter.title || inter.description || '',
          interactionType: inter.type,
          actor: inter.user || 'Sistema',
          date: inter.date,
        });
      }

      events.push({
        type: 'opportunity_created',
        opportunityId: opp._id,
        vehicleName: opp.vehicleName,
        description: `Oportunidad creada para ${opp.vehicleName}`,
        actor: opp.responsibleName || opp.responsible || 'Sistema',
        date: opp.createdAt,
      });
    }

    events.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const limit = Math.min(Number(req.query.limit || 50), 200);
    return res.json({ ok: true, events: events.slice(0, limit) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar actividad' });
  }
}

// ─── TEAM STATS (manager only) ──────────────────────────────────────────────

export async function getTeamStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const opps = await listOpportunitiesByUser(req, userId);

    const byResponsible = {};
    for (const opp of opps) {
      const key = opp.responsible || 'Sin asignar';
      if (!byResponsible[key]) {
        byResponsible[key] = {
          responsible: key,
          responsibleName: opp.responsibleName || key,
          active: 0,
          won: 0,
          lost: 0,
          pipelineValue: 0,
          totalValue: 0,
        };
      }
      const entry = byResponsible[key];
      if (opp.commercialStatus === 'won') {
        entry.won++;
        entry.totalValue += Number(opp.budget || 0);
      } else if (opp.commercialStatus === 'lost') {
        entry.lost++;
      } else {
        entry.active++;
        entry.pipelineValue += Number(opp.budget || 0);
      }
    }

    const team = Object.values(byResponsible).map((m) => ({
      ...m,
      conversionRate: (m.won + m.lost) > 0 ? Math.round((m.won / (m.won + m.lost)) * 100) : 0,
    }));

    team.sort((a, b) => b.won - a.won);

    return res.json({ ok: true, team });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular estadísticas de equipo' });
  }
}

// ─── AUTO-CONVERT LEAD → CLIENT ─────────────────────────────────────────────

async function autoConvertLeadToClient(req, userId, opportunity, account) {
  const leadsDb = getLeadsDbName();
  const lead = await getDocument(req, leadsDb, opportunity.leadId);
  if (!lead || lead.type !== 'lead' || lead.user_id !== userId) return;
  if (lead.convertedToClientId) return;

  const clientsDb = getClientsDbName();
  await ensureDatabase(req, clientsDb);

  const clientDoc = buildClientDocument(userId, {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    notes: lead.notes,
    responsible: opportunity.responsible,
    tags: lead.tags,
    commercialStatus: 'active',
  });
  const savedClient = await putDocument(req, clientsDb, clientDoc._id, clientDoc);

  const now = new Date().toISOString();
  const updatedLead = {
    ...lead,
    convertedAt: now,
    convertedToClientId: clientDoc._id,
    convertedToClientName: clientDoc.name,
  };
  await putDocument(req, leadsDb, lead._id, updatedLead);

  const oppDb = getOpportunitiesDbName();
  const oppUpdated = { ...opportunity, clientId: clientDoc._id };
  await putDocument(req, oppDb, opportunity._id, oppUpdated);

  await logAccountActivity(req, {
    actorUserId: userId,
    actorName: account.fullName || 'Sistema',
    targetUserId: userId,
    type: 'lead_conversion',
    action: `Lead "${lead.name}" convertido automáticamente a cliente`,
    entityId: clientDoc._id,
    entityLabel: clientDoc.name,
    metadata: { leadId: lead._id, opportunityId: opportunity._id },
  });
}
