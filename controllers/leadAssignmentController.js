/**
 * C-08: Reglas de reasignación automática de leads
 * C-09: SLA de respuesta a leads con alertas
 *
 * Dos sub-sistemas independientes pero relacionados:
 *  1. Reglas de reasignación → si el comercial asignado lleva X horas inactivo
 *     (sin interacciones), el lead se reasigna automáticamente según la regla.
 *  2. SLA → si un lead nuevo lleva más de X horas sin ningún contacto,
 *     se crea una notificación de alerta.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  getLeadsDbName,
  listLeadsByUser,
  buildLeadDocument,
} from '../services/couchdb.js';

const ASSIGNMENT_RULES_DB = 'crm-assignment-rules';
const SLA_CONFIG_DB = 'crm-sla-config';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ─── Reglas de reasignación ──────────────────────────────────────────────────

export async function listAssignmentRules(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, ASSIGNMENT_RULES_DB);
    const docs = await getAllDocuments(req, ASSIGNMENT_RULES_DB);
    const rules = docs
      .filter((d) => d?.type === 'assignment_rule' && d?.user_id === userId && !d?.deletedAt)
      .map((d) => ({
        id: d._id,
        name: d.name || '',
        inactiveHours: Number(d.inactiveHours || 24),
        fromUser: d.fromUser || '',
        toUser: d.toUser || '',
        toStrategy: d.toStrategy || 'specific', // 'specific' | 'roundrobin' | 'leastload'
        enabled: d.enabled !== false,
        createdAt: d.createdAt || '',
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ ok: true, rules });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando reglas' });
  }
}

export async function createAssignmentRule(req, res) {
  try {
    const { userId } = req.params;
    const { rule } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!rule?.name?.trim()) return badRequest(res, 'El nombre de la regla es obligatorio');
    if (!rule?.inactiveHours || Number(rule.inactiveHours) < 1) {
      return badRequest(res, 'inactiveHours debe ser >= 1');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, ASSIGNMENT_RULES_DB);
    const now = new Date().toISOString();
    const id = `rule-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'assignment_rule',
      user_id: userId,
      name: rule.name.trim(),
      inactiveHours: Number(rule.inactiveHours),
      fromUser: rule.fromUser?.trim() || '',
      toUser: rule.toUser?.trim() || '',
      toStrategy: rule.toStrategy || 'specific',
      enabled: rule.enabled !== false,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await putDocument(req, ASSIGNMENT_RULES_DB, id, doc);
    return res.status(201).json({ ok: true, rule: { ...doc, id, _rev: saved.rev } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error creando regla' });
  }
}

export async function updateAssignmentRule(req, res) {
  try {
    const { userId, ruleId } = req.params;
    const { rule } = req.body || {};

    await ensureDatabase(req, ASSIGNMENT_RULES_DB);
    const existing = await getDocument(req, ASSIGNMENT_RULES_DB, ruleId);
    if (!existing || existing.type !== 'assignment_rule' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Regla no encontrada' });
    }

    const updatedDoc = {
      ...existing,
      name: rule.name?.trim() || existing.name,
      inactiveHours: rule.inactiveHours ? Number(rule.inactiveHours) : existing.inactiveHours,
      fromUser: rule.fromUser?.trim() ?? existing.fromUser,
      toUser: rule.toUser?.trim() ?? existing.toUser,
      toStrategy: rule.toStrategy || existing.toStrategy,
      enabled: rule.enabled !== undefined ? rule.enabled : existing.enabled,
      updatedAt: new Date().toISOString(),
    };

    const saved = await putDocument(req, ASSIGNMENT_RULES_DB, ruleId, updatedDoc);
    return res.json({ ok: true, rule: { ...updatedDoc, id: ruleId, _rev: saved.rev } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error actualizando regla' });
  }
}

export async function deleteAssignmentRule(req, res) {
  try {
    const { userId, ruleId } = req.params;

    await ensureDatabase(req, ASSIGNMENT_RULES_DB);
    const existing = await getDocument(req, ASSIGNMENT_RULES_DB, ruleId);
    if (!existing || existing.type !== 'assignment_rule' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Regla no encontrada' });
    }

    await softDeleteDocument(req, ASSIGNMENT_RULES_DB, ruleId);
    return res.json({ ok: true, id: ruleId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error eliminando regla' });
  }
}

// ─── SLA Config ──────────────────────────────────────────────────────────────

export async function getSlaConfig(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureDatabase(req, SLA_CONFIG_DB);
    const docs = await getAllDocuments(req, SLA_CONFIG_DB);
    const config = docs.find((d) => d?.type === 'sla_config' && d?.user_id === userId);

    const defaultConfig = {
      enabled: false,
      maxResponseHours: 4,
      alertAfterHours: 2,
      applyToStatuses: ['new'],
      escalationUser: '',
    };

    return res.json({ ok: true, sla: config ? { ...defaultConfig, ...config, id: config._id } : defaultConfig });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando SLA' });
  }
}

export async function saveSlaConfig(req, res) {
  try {
    const { userId } = req.params;
    const { sla } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!sla || typeof sla !== 'object') return badRequest(res, 'Falta el objeto sla');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, SLA_CONFIG_DB);
    const docs = await getAllDocuments(req, SLA_CONFIG_DB);
    const existing = docs.find((d) => d?.type === 'sla_config' && d?.user_id === userId);

    const id = existing?._id || `sla-config-${userId}`;
    const now = new Date().toISOString();
    const doc = {
      _id: id,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      type: 'sla_config',
      user_id: userId,
      enabled: sla.enabled !== undefined ? Boolean(sla.enabled) : false,
      maxResponseHours: Number(sla.maxResponseHours) || 4,
      alertAfterHours: Number(sla.alertAfterHours) || 2,
      applyToStatuses: Array.isArray(sla.applyToStatuses) ? sla.applyToStatuses : ['new'],
      escalationUser: sla.escalationUser?.trim() || '',
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    };

    const saved = await putDocument(req, SLA_CONFIG_DB, id, doc);
    return res.json({ ok: true, sla: { ...doc, id, _rev: saved.rev } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error guardando SLA' });
  }
}

// ─── Engine: ejecutado desde el scheduler ────────────────────────────────────

/**
 * Ejecuta reglas de reasignación + SLA para un usuario.
 * Se llama desde el scheduler periódico en index.js.
 * @param {object} fakeReq - objeto con headers vacíos para llamadas a couchdb
 * @param {string} userId
 * @param {object} notificationsDb - nombre de la DB de notificaciones
 */
export async function runLeadEngineForUser(fakeReq, userId, { NOTIFICATIONS_DB }) {
  const now = new Date();

  // ── Reasignación automática ──────────────────────────────────────────────
  await ensureDatabase(fakeReq, ASSIGNMENT_RULES_DB);
  const ruleDocs = await getAllDocuments(fakeReq, ASSIGNMENT_RULES_DB);
  const activeRules = ruleDocs.filter(
    (d) => d?.type === 'assignment_rule' && d?.user_id === userId && !d?.deletedAt && d?.enabled !== false,
  );

  if (activeRules.length > 0) {
    const leadsDb = getLeadsDbName();
    await ensureDatabase(fakeReq, leadsDb);
    const leads = await listLeadsByUser(fakeReq, userId);

    for (const rule of activeRules) {
      const thresholdMs = rule.inactiveHours * 3600000;
      for (const lead of leads) {
        if (lead.deletedAt || lead.status === 'won' || lead.status === 'lost') continue;
        if (rule.fromUser && lead.responsible !== rule.fromUser) continue;

        const lastActivity = lead.lastContact
          ? new Date(lead.lastContact).getTime()
          : new Date(lead.createdAt || 0).getTime();

        if (now.getTime() - lastActivity < thresholdMs) continue;
        if (lead.responsible === rule.toUser) continue;

        // Reassign
        const updatedLead = buildLeadDocument(userId, {
          ...lead,
          responsible: rule.toUser,
          interactions: [
            ...(Array.isArray(lead.interactions) ? lead.interactions : []),
            {
              id: `interaction-${uuidv4()}`,
              type: 'note',
              title: 'Reasignación automática',
              description: `Lead reasignado de "${lead.responsible}" a "${rule.toUser}" por regla: "${rule.name}" (inactividad > ${rule.inactiveHours}h)`,
              date: now.toISOString(),
              user: 'Sistema',
            },
          ],
        }, lead);

        await putDocument(fakeReq, leadsDb, lead._id, updatedLead).catch(() => null);

        // Notificación
        const notifId = `notif:reassign:${lead._id}:${now.toISOString().slice(0, 10)}`;
        await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
        await putDocument(fakeReq, NOTIFICATIONS_DB, notifId, {
          _id: notifId,
          type: 'notification',
          user_id: userId,
          level: 'info',
          category: 'lead_reassigned',
          title: 'Lead reasignado automáticamente',
          message: `"${lead.name}" fue reasignado a "${rule.toUser}" (inactividad > ${rule.inactiveHours}h)`,
          entityId: lead._id,
          entityType: 'lead',
          route: `/saas/clients/${lead._id}`,
          read: false,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }).catch(() => null);
      }
    }
  }

  // ── SLA: leads sin contactar ─────────────────────────────────────────────
  await ensureDatabase(fakeReq, SLA_CONFIG_DB);
  const slaDocs = await getAllDocuments(fakeReq, SLA_CONFIG_DB);
  const slaConfig = slaDocs.find((d) => d?.type === 'sla_config' && d?.user_id === userId);

  if (!slaConfig?.enabled) return;

  const alertThresholdMs = slaConfig.alertAfterHours * 3600000;
  const applyToStatuses = Array.isArray(slaConfig.applyToStatuses) ? slaConfig.applyToStatuses : ['new'];

  const leadsDb = getLeadsDbName();
  await ensureDatabase(fakeReq, leadsDb);
  const leads = await listLeadsByUser(fakeReq, userId);

  for (const lead of leads) {
    if (lead.deletedAt || !applyToStatuses.includes(lead.status)) continue;

    const lastContact = lead.lastContact
      ? new Date(lead.lastContact).getTime()
      : new Date(lead.createdAt || 0).getTime();

    const hoursWithoutContact = (now.getTime() - lastContact) / 3600000;
    if (hoursWithoutContact < slaConfig.alertAfterHours) continue;

    // Prevent duplicate SLA alerts on same day
    const slaAlertId = `notif:sla:${lead._id}:${now.toISOString().slice(0, 10)}`;
    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const existingAlert = await getDocument(fakeReq, NOTIFICATIONS_DB, slaAlertId).catch(() => null);
    if (existingAlert) continue;

    await putDocument(fakeReq, NOTIFICATIONS_DB, slaAlertId, {
      _id: slaAlertId,
      type: 'notification',
      user_id: userId,
      level: 'warning',
      category: 'sla_breach',
      title: 'SLA de respuesta incumplido',
      message: `"${lead.name}" lleva ${Math.round(hoursWithoutContact)}h sin ser contactado (SLA: ${slaConfig.alertAfterHours}h)`,
      entityId: lead._id,
      entityType: 'lead',
      route: `/saas/clients/${lead._id}`,
      read: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      slaMeta: {
        hoursWithoutContact: Math.round(hoursWithoutContact),
        maxResponseHours: slaConfig.maxResponseHours,
        responsible: lead.responsible,
      },
    }).catch(() => null);
  }
}
