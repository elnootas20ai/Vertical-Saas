/**
 * Siembra tareas de «Mi trabajo» según el rol al aceptar invitación.
 * Idempotente: ids fijos `wtask:{biz}:{member}:tpl:{key}`.
 */
import { ensureDatabase, getDocument, putDocument, findBusinessById } from './couchdb.js';
import { getRoleTaskTemplates } from './roleTaskTemplates.js';

function getWorkerTasksDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial';
  return `${String(prefix).toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '')}-worker-tasks`;
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @returns {Promise<{ ok: boolean, created: number, skipped: number, role?: string, reason?: string }>}
 */
export async function applyInviteRoleTasks(req, {
  businessId,
  memberId,
  role,
  businessType: businessTypeHint,
} = {}) {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  const mid = String(memberId || '').trim();
  const roleId = String(role || '').trim();
  if (!bid || !mid || !roleId) {
    return { ok: false, created: 0, skipped: 0, reason: 'missing_args' };
  }

  let businessType = String(businessTypeHint || '').trim();
  if (!businessType) {
    try {
      const business = await findBusinessById(req, bid);
      businessType = String(business?.businessType || business?.business_type || '').trim();
    } catch {
      businessType = '';
    }
  }

  const templates = getRoleTaskTemplates(roleId, businessType);
  if (!templates.length) {
    return { ok: true, created: 0, skipped: 0, role: roleId, reason: 'no_templates' };
  }

  const db = getWorkerTasksDbName();
  await ensureDatabase(req, db);

  const now = new Date().toISOString();
  const dueDate = todayIsoLocal();
  let created = 0;
  let skipped = 0;

  for (const tpl of templates) {
    const key = String(tpl.key || '').trim();
    if (!key) continue;
    const id = `wtask:${bid}:${mid}:tpl:${key}`;
    try {
      const existing = await getDocument(req, db, id);
      if (existing && !existing.deletedAt) {
        skipped += 1;
        continue;
      }
    } catch {
      /* no existe → crear */
    }

    const doc = {
      _id: id,
      type: 'worker_task',
      business_id: bid,
      member_id: mid,
      title: String(tpl.title || '').trim(),
      description: String(tpl.description || '').trim(),
      status: 'pending',
      priority: tpl.priority || 'medium',
      dueDate,
      category: 'role_onboarding',
      templateKey: key,
      roleId,
      timeEntries: [],
      totalSeconds: 0,
      timerRunning: false,
      timerStartedAt: null,
      autoStopAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await putDocument(req, db, id, doc);
      created += 1;
    } catch (err) {
      // Conflicto = ya existe (otra petición en paralelo)
      if (String(err?.status || err?.statusCode || '') === '409' || /conflict/i.test(String(err?.message || ''))) {
        skipped += 1;
      } else {
        console.error('[AUTH] Error creando tarea de rol', id, err?.message || err);
      }
    }
  }

  return { ok: true, created, skipped, role: roleId };
}
