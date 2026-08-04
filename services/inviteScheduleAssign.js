/**
 * Asigna un horario desde una plantilla al aceptar una invitación de equipo.
 * No lanza errores al llamador: fallos se registran y se omiten para no bloquear el alta.
 * Aplica la plantilla a la semana actual y a las 3 siguientes (1 mes operativo).
 */
import { ensureDatabase, getAllDocuments, getDocument, putDocument } from './couchdb.js';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKS_AHEAD = 4;

function getSchedulesDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'vertial';
  return `${prefix}-schedules`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Lunes en calendario local (misma lógica que el front schedulesApi.getMonday). */
function getMonday(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

export function computeWeeklyHours(weekly) {
  let total = 0;
  for (const day of WEEKDAYS) {
    const s = weekly?.[day];
    if (!s?.enabled) continue;
    const [sh, sm] = String(s.start || '09:00').split(':').map(Number);
    const [eh, em] = String(s.end || '17:00').split(':').map(Number);
    const [bsh, bsm] = String(s.breakStart || '13:00').split(':').map(Number);
    const [beh, bem] = String(s.breakEnd || '14:00').split(':').map(Number);
    const work = eh * 60 + em - (sh * 60 + sm);
    const brk = beh * 60 + bem - (bsh * 60 + bsm);
    total += Math.max(0, work - Math.max(0, brk));
  }
  return Math.round((total / 60) * 100) / 100;
}

/** Inferir jornada laboral a partir de horas semanales del horario. */
export function inferWorkdayFromWeeklyHours(hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return '';
  if (h >= 35) return 'completa';
  if (h >= 18) return 'media';
  return 'parcial';
}

async function findExistingSchedule(req, db, bid, mid, weekStart) {
  const id = `schedule:${bid}:${mid}:${weekStart}`;
  try {
    const doc = await getDocument(req, db, id);
    if (doc && !doc.deletedAt) return doc;
  } catch {
    /* noop */
  }
  try {
    const docs = await getAllDocuments(req, db);
    return docs.find(
      (d) =>
        d?.type === 'schedule'
        && d?.business_id === bid
        && d?.member_id === mid
        && d?.week_start === weekStart
        && !d?.deletedAt,
    ) || null;
  } catch {
    return null;
  }
}

/**
 * Lee plantilla de turnos y devuelve horas/jornada (para la invitación, sin crear schedules).
 * @returns {Promise<{ ok: boolean, weeklyHours?: number, workday?: string, weekly?: object, reason?: string }>}
 */
export async function getShiftTemplateMeta(req, businessId, templateId) {
  const bid = String(businessId || '').trim();
  const tid = String(templateId || '').trim();
  if (!bid || !tid) return { ok: false, reason: 'missing' };

  try {
    const db = getSchedulesDbName();
    await ensureDatabase(req, db);
    let template = null;
    try {
      template = await getDocument(req, db, tid);
    } catch {
      template = null;
    }
    if (!template || template.type !== 'shift_template' || template.business_id !== bid || template.deletedAt) {
      return { ok: false, reason: 'template_not_found' };
    }
    if (!template.weekly || typeof template.weekly !== 'object') {
      return { ok: false, reason: 'template_invalid' };
    }
    const weeklyHours = Number(template.weeklyHours) > 0
      ? Number(template.weeklyHours)
      : computeWeeklyHours(template.weekly);
    return {
      ok: true,
      weeklyHours,
      workday: inferWorkdayFromWeeklyHours(weeklyHours),
      weekly: template.weekly,
    };
  } catch (err) {
    console.error('[AUTH] No se pudo leer plantilla de horario:', err?.message || err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * @returns {Promise<{ applied: boolean, weeks?: number, weeklyHours?: number, workday?: string, reason?: string }>}
 */
export async function applyInviteScheduleTemplate(req, {
  businessId,
  memberId,
  memberName,
  templateId,
  workCenterId = '',
  workCenterName = '',
}) {
  const bid = String(businessId || '').trim();
  const mid = String(memberId || '').trim();
  const tid = String(templateId || '').trim();
  if (!bid || !mid || !tid) return { applied: false, reason: 'missing' };

  try {
    const db = getSchedulesDbName();
    await ensureDatabase(req, db);

    let template = null;
    try {
      template = await getDocument(req, db, tid);
    } catch {
      template = null;
    }
    if (!template || template.type !== 'shift_template' || template.business_id !== bid || template.deletedAt) {
      return { applied: false, reason: 'template_not_found' };
    }
    if (!template.weekly || typeof template.weekly !== 'object') {
      return { applied: false, reason: 'template_invalid' };
    }

    const weeklyHours = computeWeeklyHours(template.weekly);
    const workday = inferWorkdayFromWeeklyHours(weeklyHours);
    const now = new Date().toISOString();
    const wcId = String(workCenterId || '').trim();
    const baseMonday = getMonday();
    let weeksApplied = 0;

    for (let i = 0; i < WEEKS_AHEAD; i += 1) {
      const weekStart = addDaysIso(baseMonday, i * 7);
      const existing = await findExistingSchedule(req, db, bid, mid, weekStart);
      const id = `schedule:${bid}:${mid}:${weekStart}`;
      const doc = {
        _id: existing?._id || id,
        ...(existing?._rev ? { _rev: existing._rev } : {}),
        type: 'schedule',
        business_id: bid,
        member_id: mid,
        member_name: String(memberName || '').trim() || mid,
        week_start: weekStart,
        ...(wcId
          ? {
            work_center_id: wcId,
            work_center_name: String(workCenterName || '').trim(),
          }
          : {}),
        weekly: template.weekly,
        weeklyHours,
        template_id: tid,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await putDocument(req, db, doc._id, doc);
      weeksApplied += 1;
    }

    return {
      applied: weeksApplied > 0,
      weeks: weeksApplied,
      weeklyHours,
      workday,
    };
  } catch (err) {
    console.error('[AUTH] No se pudo asignar horario desde plantilla de invitación:', err?.message || err);
    return { applied: false, reason: 'error' };
  }
}
