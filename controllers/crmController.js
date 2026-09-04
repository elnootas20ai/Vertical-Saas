import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  listClientsByUser,
  listLeadsByUser,
  listOpportunitiesByUser,
} from '../services/couchdb.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../services/logger.js';

function getQuotesDbName() {
  const prefix = String(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-quotes`;
}

function getRemindersDbName() {
  return (process.env.VITE_COUCHDB_DB || 'vertial') + '-crm-reminders';
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ─── CRM ALERTS ───────────────────────────────────────────────────────────────

export async function getCrmAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const [leads, clients, quoteDocs, opportunities] = await Promise.all([
      listLeadsByUser(req, userId),
      listClientsByUser(req, userId),
      ensureDatabase(req, getQuotesDbName())
        .then(() => getAllDocuments(req, getQuotesDbName()))
        .catch(() => []),
      listOpportunitiesByUser(req, userId).catch(() => []),
    ]);

    const now = Date.now();
    const DAY_MS = 86400000;

    const uncontactedLeads = leads.filter((l) => {
      if (l.status === 'won' || l.status === 'lost') return false;
      const lastContact = l.lastContact ? new Date(l.lastContact).getTime() : 0;
      const created = new Date(l.createdAt || 0).getTime();
      const reference = lastContact || created;
      return (now - reference) > 3 * DAY_MS;
    }).map((l) => ({
      id: l._id,
      type: 'uncontacted_lead',
      severity: 'warning',
      name: l.name || '',
      phone: l.phone || '',
      status: l.status,
      daysSinceContact: Math.floor((now - (l.lastContact ? new Date(l.lastContact).getTime() : new Date(l.createdAt || 0).getTime())) / DAY_MS),
      createdAt: l.createdAt,
    }));

    const userQuotes = quoteDocs.filter(
      (q) => q?.type === 'quote' && !q?.deletedAt && q?.user_id === userId,
    );
    const pendingQuotes = userQuotes.filter((q) => {
      const status = String(q.status || '').toLowerCase();
      if (status !== 'pending' && status !== 'sent' && status !== 'draft') return false;
      const created = new Date(q.createdAt || 0).getTime();
      return (now - created) > 7 * DAY_MS;
    }).map((q) => ({
      id: q._id,
      type: 'pending_quote',
      severity: 'info',
      clientName: q.clientName || q.client?.name || '',
      clientId: q.clientId || '',
      total: Number(q.total || 0),
      status: q.status,
      daysPending: Math.floor((now - new Date(q.createdAt || 0).getTime()) / DAY_MS),
      createdAt: q.createdAt,
    }));

    const inactiveClients = clients.filter((c) => {
      const lastActivity = c.updatedAt || c.createdAt;
      if (!lastActivity) return true;
      return (now - new Date(lastActivity).getTime()) > 90 * DAY_MS;
    }).map((c) => ({
      id: c._id,
      type: 'inactive_client',
      severity: 'low',
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      daysSinceActivity: Math.floor((now - new Date(c.updatedAt || c.createdAt || 0).getTime()) / DAY_MS),
      commercialStatus: c.commercialStatus || 'active',
      lastActivity: c.updatedAt || c.createdAt,
    }));

    // ─── Alertas de oportunidades (compraventa) ─────────────────────────
    const terminalStatuses = ['won', 'lost'];

    const opportunityNoFollowup = opportunities.filter((o) => {
      if (terminalStatuses.includes(o.commercialStatus)) return false;
      const ref = o.lastContact ? new Date(o.lastContact).getTime() : new Date(o.updatedAt || o.createdAt || 0).getTime();
      return (now - ref) > 2 * DAY_MS;
    }).map((o) => ({
      id: o._id,
      type: 'opportunity_no_followup',
      severity: 'warning',
      name: o.vehicleName || '',
      vehicleId: o.vehicleId || '',
      responsible: o.responsible || '',
      commercialStatus: o.commercialStatus,
      daysSinceContact: Math.floor((now - new Date(o.lastContact || o.updatedAt || o.createdAt || 0).getTime()) / DAY_MS),
      createdAt: o.createdAt,
    }));

    const interestedNoResponse = opportunities.filter((o) => {
      if (!['contacted', 'test_drive'].includes(o.commercialStatus)) return false;
      const ref = o.lastContact ? new Date(o.lastContact).getTime() : new Date(o.updatedAt || o.createdAt || 0).getTime();
      return (now - ref) > 3 * DAY_MS;
    }).map((o) => ({
      id: o._id,
      type: 'interested_no_response',
      severity: 'warning',
      name: o.vehicleName || '',
      vehicleId: o.vehicleId || '',
      responsible: o.responsible || '',
      commercialStatus: o.commercialStatus,
      daysSinceContact: Math.floor((now - new Date(o.lastContact || o.updatedAt || o.createdAt || 0).getTime()) / DAY_MS),
      createdAt: o.createdAt,
    }));

    const staleReservations = opportunities.filter((o) => {
      if (o.commercialStatus !== 'reserved') return false;
      const stageEntry = (o.stageHistory || []).filter((h) => h.to === 'reserved').pop();
      const reservedAt = stageEntry ? new Date(stageEntry.at).getTime() : new Date(o.updatedAt || o.createdAt || 0).getTime();
      return (now - reservedAt) > 5 * DAY_MS;
    }).map((o) => ({
      id: o._id,
      type: 'stale_reservation',
      severity: 'warning',
      name: o.vehicleName || '',
      vehicleId: o.vehicleId || '',
      responsible: o.responsible || '',
      daysSinceReserved: Math.floor((now - new Date(o.updatedAt || o.createdAt || 0).getTime()) / DAY_MS),
      createdAt: o.createdAt,
    }));

    const oppVehicleIds = new Set(opportunities.map((o) => o.vehicleId).filter(Boolean));
    const leadsNoOpportunity = leads.filter((l) => {
      if (l.status === 'won' || l.status === 'lost') return false;
      if (!l.vehicleInterestId) return false;
      if (oppVehicleIds.has(l.vehicleInterestId)) return false;
      const created = new Date(l.createdAt || 0).getTime();
      return (now - created) > 1 * DAY_MS;
    }).map((l) => ({
      id: l._id,
      type: 'lead_no_opportunity',
      severity: 'info',
      name: l.name || '',
      vehicleInterest: l.vehicleInterest || '',
      vehicleInterestId: l.vehicleInterestId || '',
      daysSinceCreated: Math.floor((now - new Date(l.createdAt || 0).getTime()) / DAY_MS),
      createdAt: l.createdAt,
    }));

    const alerts = [
      ...uncontactedLeads,
      ...opportunityNoFollowup,
      ...interestedNoResponse,
      ...staleReservations,
      ...pendingQuotes,
      ...leadsNoOpportunity,
      ...inactiveClients,
    ].sort((a, b) => {
      const severity = { warning: 0, info: 1, low: 2 };
      return (severity[a.severity] ?? 3) - (severity[b.severity] ?? 3);
    });

    return res.json({
      ok: true,
      alerts,
      summary: {
        uncontactedLeads: uncontactedLeads.length,
        pendingQuotes: pendingQuotes.length,
        inactiveClients: inactiveClients.length,
        opportunitiesNoFollowup: opportunityNoFollowup.length,
        interestedNoResponse: interestedNoResponse.length,
        staleReservations: staleReservations.length,
        leadsNoOpportunity: leadsNoOpportunity.length,
        total: alerts.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'CRM alerts error');
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener alertas CRM' });
  }
}

// ─── CLIENT LINKED QUOTES ─────────────────────────────────────────────────────

export async function getClientQuotes(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const quotesDb = getQuotesDbName();
    await ensureDatabase(req, quotesDb);
    const docs = await getAllDocuments(req, quotesDb);

    const clientQuotes = docs
      .filter((q) =>
        q?.type === 'quote' &&
        !q?.deletedAt &&
        q?.user_id === userId &&
        q?.clientId === clientId,
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((q) => ({
        id: q._id,
        number: q.number || '',
        title: q.title || q.concept || '',
        clientName: q.clientName || '',
        clientId: q.clientId || '',
        status: q.status || 'draft',
        total: Number(q.total || 0),
        tax: Number(q.tax || 0),
        subtotal: Number(q.subtotal || 0),
        validUntil: q.validUntil || '',
        items: Array.isArray(q.items) ? q.items.length : 0,
        createdAt: q.createdAt || '',
        updatedAt: q.updatedAt || '',
      }));

    return res.json({ ok: true, quotes: clientQuotes });
  } catch (error) {
    logger.error({ err: error }, 'Client quotes error');
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener presupuestos del cliente' });
  }
}

// ─── COMMERCIAL REMINDERS ─────────────────────────────────────────────────────

export async function listReminders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getRemindersDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);

    const reminders = docs
      .filter((d) => d?.type === 'crm_reminder' && !d?.deletedAt && d?.user_id === userId)
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
      .map(sanitizeReminder);

    return res.json({ ok: true, reminders });
  } catch (error) {
    logger.error({ err: error }, 'List reminders error');
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar recordatorios' });
  }
}

export async function createReminder(req, res) {
  try {
    const { userId } = req.params;
    const { reminder } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!reminder || typeof reminder !== 'object') return badRequest(res, 'Falta el objeto reminder');
    if (!reminder.title?.trim()) return badRequest(res, 'El título es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getRemindersDbName();
    await ensureDatabase(req, db);

    const now = new Date().toISOString();
    const doc = {
      _id: `crm-reminder-${uuidv4()}`,
      type: 'crm_reminder',
      user_id: userId,
      title: String(reminder.title || '').trim(),
      description: String(reminder.description || '').trim(),
      entityType: ['lead', 'client', 'quote'].includes(reminder.entityType) ? reminder.entityType : 'client',
      entityId: String(reminder.entityId || '').trim(),
      entityName: String(reminder.entityName || '').trim(),
      dueDate: String(reminder.dueDate || now.slice(0, 10)),
      priority: ['low', 'medium', 'high'].includes(reminder.priority) ? reminder.priority : 'medium',
      completed: false,
      assignedTo: String(reminder.assignedTo || account.fullName || '').trim(),
      createdAt: now,
      updatedAt: now,
    };

    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, reminder: sanitizeReminder({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    logger.error({ err: error }, 'Create reminder error');
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear recordatorio' });
  }
}

export async function updateReminder(req, res) {
  try {
    const { userId, reminderId } = req.params;
    const { reminder } = req.body || {};

    if (!userId || !reminderId) return badRequest(res, 'Falta userId o reminderId');
    if (!reminder || typeof reminder !== 'object') return badRequest(res, 'Faltan datos del recordatorio');

    const db = getRemindersDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, reminderId);
    if (!existing || existing.type !== 'crm_reminder' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Recordatorio no encontrado' });
    }

    const updated = {
      ...existing,
      title: reminder.title != null ? String(reminder.title).trim() : existing.title,
      description: reminder.description != null ? String(reminder.description).trim() : existing.description,
      dueDate: reminder.dueDate || existing.dueDate,
      priority: ['low', 'medium', 'high'].includes(reminder.priority) ? reminder.priority : existing.priority,
      completed: reminder.completed != null ? Boolean(reminder.completed) : existing.completed,
      assignedTo: reminder.assignedTo != null ? String(reminder.assignedTo).trim() : existing.assignedTo,
      updatedAt: new Date().toISOString(),
    };

    const saved = await putDocument(req, db, updated._id, updated);
    return res.json({ ok: true, reminder: sanitizeReminder({ ...updated, _rev: saved.rev }) });
  } catch (error) {
    logger.error({ err: error }, 'Update reminder error');
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar recordatorio' });
  }
}

export async function deleteReminder(req, res) {
  try {
    const { userId, reminderId } = req.params;
    if (!userId || !reminderId) return badRequest(res, 'Falta userId o reminderId');

    const db = getRemindersDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, reminderId);
    if (!existing || existing.type !== 'crm_reminder' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Recordatorio no encontrado' });
    }

    await softDeleteDocument(req, db, reminderId);
    return res.json({ ok: true, id: reminderId });
  } catch (error) {
    logger.error({ err: error }, 'Delete reminder error');
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar recordatorio' });
  }
}

function sanitizeReminder(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    _rev: doc._rev,
    type: 'crm_reminder',
    user_id: doc.user_id || '',
    title: doc.title || '',
    description: doc.description || '',
    entityType: doc.entityType || 'client',
    entityId: doc.entityId || '',
    entityName: doc.entityName || '',
    dueDate: doc.dueDate || '',
    priority: doc.priority || 'medium',
    completed: Boolean(doc.completed),
    assignedTo: doc.assignedTo || '',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}
