import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getLeadsDbName,
  listLeadsByUser,
  sanitizeLead,
  buildLeadDocument,
} from '../services/couchdb.js';

export const WORKFLOWS_DB = 'crm-workflows';
export const WORKFLOW_RUNS_DB = 'crm-workflow-runs';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ─── Build & Sanitize ─────────────────────────────────────────────────────────

function buildWorkflowDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || data.id || `wf-${uuidv4()}`;
  return {
    _id: id,
    _rev: existing?._rev,
    type: 'workflow',
    id,
    user_id: userId,
    name: String(data.name || '').trim(),
    description: String(data.description || '').trim(),
    enabled: data.enabled !== false,
    entityType: data.entityType === 'client' ? 'client' : 'lead',
    // Trigger
    trigger: {
      type: data.trigger?.type || 'no_contact_days',
      days: Number(data.trigger?.days || 3),
      status: data.trigger?.status || '',
    },
    // Actions (ordered list)
    actions: Array.isArray(data.actions)
      ? data.actions.map((a, i) => ({
          id: a.id || `act-${uuidv4()}`,
          order: i,
          type: a.type || 'send_email',
          delayDays: Number(a.delayDays || 0),
          emailTemplate: a.emailTemplate || '',
          emailSubject: a.emailSubject || '',
          taskTitle: a.taskTitle || '',
          taskAssignTo: a.taskAssignTo || '',
          changeStatus: a.changeStatus || '',
          addTag: a.addTag || '',
        }))
      : [],
    runCount: Number(existing?.runCount || 0),
    lastRunAt: existing?.lastRunAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function sanitizeWorkflow(doc) {
  if (!doc) return null;
  return {
    _rev: doc._rev,
    type: 'workflow',
    id: doc._id,
    user_id: doc.user_id || '',
    name: doc.name || '',
    description: doc.description || '',
    enabled: doc.enabled !== false,
    entityType: doc.entityType || 'lead',
    trigger: doc.trigger || { type: 'no_contact_days', days: 3 },
    actions: Array.isArray(doc.actions) ? doc.actions : [],
    runCount: Number(doc.runCount || 0),
    lastRunAt: doc.lastRunAt || null,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listWorkflows(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await ensureDatabase(req, WORKFLOWS_DB);
    const docs = await getAllDocuments(req, WORKFLOWS_DB);
    const workflows = docs
      .filter((d) => d?.type === 'workflow' && !d?.deletedAt && d?.user_id === userId)
      .map(sanitizeWorkflow);

    return res.json({ ok: true, workflows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function createWorkflow(req, res) {
  try {
    const { userId } = req.params;
    const { workflow } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!workflow?.name?.trim()) return badRequest(res, 'El nombre del workflow es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, WORKFLOWS_DB);
    const doc = buildWorkflowDocument(userId, workflow);
    const saved = await putDocument(req, WORKFLOWS_DB, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'workflow',
      action: `Creó workflow "${doc.name}"`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { trigger: doc.trigger?.type },
    });

    return res.status(201).json({ ok: true, workflow: sanitizeWorkflow({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function updateWorkflow(req, res) {
  try {
    const { userId, workflowId } = req.params;
    const { workflow } = req.body || {};
    if (!workflow) return badRequest(res, 'Faltan datos del workflow');

    await ensureDatabase(req, WORKFLOWS_DB);
    const existing = await getDocument(req, WORKFLOWS_DB, workflowId);
    if (!existing || existing.type !== 'workflow' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Workflow no encontrado' });
    }

    const doc = buildWorkflowDocument(userId, { ...existing, ...workflow }, existing);
    const saved = await putDocument(req, WORKFLOWS_DB, doc._id, doc);

    return res.json({ ok: true, workflow: sanitizeWorkflow({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function deleteWorkflow(req, res) {
  try {
    const { userId, workflowId } = req.params;

    await ensureDatabase(req, WORKFLOWS_DB);
    const existing = await getDocument(req, WORKFLOWS_DB, workflowId);
    if (!existing || existing.type !== 'workflow' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Workflow no encontrado' });
    }

    await softDeleteDocument(req, WORKFLOWS_DB, workflowId);
    return res.json({ ok: true, id: workflowId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ─── Workflow Engine ──────────────────────────────────────────────────────────

/**
 * Returns true if lead has had no contact in the last N days.
 */
function leadHasNoContactSince(lead, days) {
  const referenceDate = lead.lastContact
    ? (typeof lead.lastContact === 'string' ? new Date(lead.lastContact) : lead.lastContact)
    : new Date(lead.createdAt || lead.updatedAt);

  if (!referenceDate || isNaN(referenceDate.getTime())) return false;
  const daysSince = (Date.now() - referenceDate.getTime()) / 86400000;
  return daysSince >= days;
}

function buildRunKey(workflowId, entityId) {
  return `run-${workflowId}-${entityId}`;
}

async function hasActionBeenExecuted(req, workflowId, entityId, actionId) {
  await ensureDatabase(req, WORKFLOW_RUNS_DB);
  const runKey = buildRunKey(workflowId, entityId);
  const doc = await getDocument(req, WORKFLOW_RUNS_DB, runKey);
  return doc?.completedActions?.includes(actionId) || false;
}

async function markActionExecuted(req, workflowId, entityId, actionId) {
  await ensureDatabase(req, WORKFLOW_RUNS_DB);
  const runKey = buildRunKey(workflowId, entityId);
  const existing = await getDocument(req, WORKFLOW_RUNS_DB, runKey);
  const completed = Array.isArray(existing?.completedActions) ? existing.completedActions : [];
  if (!completed.includes(actionId)) completed.push(actionId);
  await putDocument(req, WORKFLOW_RUNS_DB, runKey, {
    _id: runKey,
    _rev: existing?._rev,
    type: 'workflow_run',
    workflowId,
    entityId,
    completedActions: completed,
    lastUpdated: new Date().toISOString(),
  });
}

async function executeAction(req, action, lead, userId) {
  const leadsDb = getLeadsDbName();

  if (action.type === 'send_email' && lead.email) {
    // Call internal email endpoint if available
    try {
      const apiBase = `http://localhost:${process.env.PORT || 3001}`;
      await fetch(`${apiBase}/api/email/appointment-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.email,
          name: lead.name,
          appointmentDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
          subject: action.emailSubject || 'Te echamos de menos',
          template: action.emailTemplate || 'follow_up',
        }),
      });
    } catch {
      // Non-fatal: log but continue
    }
  }

  if (action.type === 'add_task') {
    // Add a task interaction to the lead
    const updatedLead = {
      ...lead,
      interactions: [
        ...(lead.interactions || []),
        {
          id: `wf-task-${uuidv4()}`,
          type: 'task',
          title: action.taskTitle || 'Tarea de seguimiento',
          description: `Tarea creada automáticamente por workflow. Asignada a: ${action.taskAssignTo || 'Sin asignar'}`,
          date: new Date().toISOString(),
          user: 'Sistema (Workflow)',
        },
      ],
    };
    const doc = buildLeadDocument(userId, updatedLead, lead);
    await putDocument(req, leadsDb, doc._id, doc);
  }

  if (action.type === 'change_status' && action.changeStatus) {
    const updatedLead = { ...lead, status: action.changeStatus };
    const doc = buildLeadDocument(userId, updatedLead, lead);
    await putDocument(req, leadsDb, doc._id, doc);
  }

  if (action.type === 'add_tag' && action.addTag) {
    const tags = [...new Set([...(lead.tags || []), action.addTag])];
    const updatedLead = { ...lead, tags };
    const doc = buildLeadDocument(userId, updatedLead, lead);
    await putDocument(req, leadsDb, doc._id, doc);
  }
}

/**
 * Runs all enabled workflows for a user. Called by the cron scheduler.
 */
export async function runWorkflowsForUser(req, userId) {
  await ensureDatabase(req, WORKFLOWS_DB);
  const allWorkflows = await getAllDocuments(req, WORKFLOWS_DB);
  const workflows = allWorkflows.filter(
    (d) => d?.type === 'workflow' && !d?.deletedAt && d?.user_id === userId && d?.enabled !== false,
  );

  if (!workflows.length) return;

  const leads = await listLeadsByUser(req, userId);

  for (const workflow of workflows) {
    const { trigger, actions } = workflow;
    if (!Array.isArray(actions) || !actions.length) continue;

    let matchingLeads = leads;

    if (trigger?.type === 'no_contact_days') {
      matchingLeads = leads.filter(
        (l) => l.status !== 'won' && l.status !== 'lost' && leadHasNoContactSince(l, trigger.days || 3),
      );
    } else if (trigger?.type === 'status_is' && trigger.status) {
      matchingLeads = leads.filter((l) => l.status === trigger.status);
    }

    for (const lead of matchingLeads) {
      for (const action of actions.sort((a, b) => a.order - b.order)) {
        // Check if action was already executed for this lead
        const alreadyDone = await hasActionBeenExecuted(req, workflow._id, lead._id, action.id);
        if (alreadyDone) continue;

        // Check delay
        const baseDate = lead.lastContact
          ? new Date(lead.lastContact)
          : new Date(lead.createdAt || lead.updatedAt);
        const daysSince = (Date.now() - baseDate.getTime()) / 86400000;

        const actionDue = daysSince >= (trigger.days || 3) + (action.delayDays || 0);
        if (!actionDue) continue;

        try {
          await executeAction(req, action, lead, userId);
          await markActionExecuted(req, workflow._id, lead._id, action.id);
        } catch {
          // Non-fatal
        }
      }
    }

    // Update run stats
    const updatedWf = {
      ...workflow,
      runCount: (workflow.runCount || 0) + 1,
      lastRunAt: new Date().toISOString(),
    };
    await putDocument(req, WORKFLOWS_DB, workflow._id, updatedWf).catch(() => null);
  }
}

export async function triggerWorkflowRun(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    await runWorkflowsForUser(req, userId);
    return res.json({ ok: true, message: 'Workflows ejecutados correctamente' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
