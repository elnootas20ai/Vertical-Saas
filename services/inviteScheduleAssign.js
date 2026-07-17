/**
 * Asigna un horario desde una plantilla al aceptar una invitación de equipo.
 * No lanza errores al llamador: fallos se registran y se omiten para no bloquear el alta.
 */
import { ensureDatabase, getAllDocuments, getDocument, putDocument } from './couchdb.js';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getSchedulesDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'vertial';
  return `${prefix}-schedules`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function computeWeeklyHours(weekly) {
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

/**
 * @returns {Promise<{ applied: boolean, reason?: string }>}
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

    const weekStart = getMonday();
    const id = `schedule:${bid}:${mid}:${weekStart}`;
    let existing = null;
    try {
      existing = await getDocument(req, db, id);
    } catch {
      existing = null;
    }
    if (!existing) {
      try {
        const docs = await getAllDocuments(req, db);
        existing = docs.find(
          (d) =>
            d?.type === 'schedule'
            && d?.business_id === bid
            && d?.member_id === mid
            && d?.week_start === weekStart
            && !d?.deletedAt,
        ) || null;
      } catch {
        existing = null;
      }
    }

    const now = new Date().toISOString();
    const wcId = String(workCenterId || '').trim();
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
      weeklyHours: computeWeeklyHours(template.weekly),
      template_id: tid,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await putDocument(req, db, doc._id, doc);
    return { applied: true };
  } catch (err) {
    console.error('[AUTH] No se pudo asignar horario desde plantilla de invitación:', err?.message || err);
    return { applied: false, reason: 'error' };
  }
}
