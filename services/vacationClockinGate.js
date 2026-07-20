/**
 * Bloqueo operativo si el trabajador tiene vacaciones (u otro leave de descanso) aprobadas hoy.
 * Usado en fichaje, TPV (abrir caja / vender), alertas (no-show / absentismo) y resto de operativa.
 */
import {
  ensureDatabase,
  getAllDocuments,
} from './couchdb.js';

export const WORK_BLOCKING_LEAVE_TYPES = ['vacation', 'other', 'sick'];

function getVacationsDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial';
  return `${prefix}-vacations`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function dayKey(isoOrDate) {
  if (!isoOrDate) return '';
  if (typeof isoOrDate === 'string') return isoOrDate.slice(0, 10);
  try {
    return new Date(isoOrDate).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function normalizeBusinessId(businessId) {
  return String(businessId || '').replace(/^business:/, '').trim();
}

function normalizeMemberId(memberId) {
  return String(memberId || '').trim();
}

/** ¿Este doc de vacaciones bloquea trabajo ese día? (sin I/O). */
export function isApprovedLeaveBlockingWorkDoc(doc, businessId, memberId, dateIso = new Date()) {
  if (!doc || doc.type !== 'vacation_request' || doc.deletedAt) return false;
  if (String(doc.status || '') !== 'approved') return false;
  const leave = String(doc.leaveType || 'vacation');
  if (!WORK_BLOCKING_LEAVE_TYPES.includes(leave)) return false;
  const bid = normalizeBusinessId(businessId);
  const mid = normalizeMemberId(memberId);
  if (bid && normalizeBusinessId(doc.business_id) !== bid) return false;
  if (mid && normalizeMemberId(doc.member_id) !== mid) return false;
  const day = dayKey(dateIso);
  const start = dayKey(doc.startDate);
  const end = dayKey(doc.endDate);
  return Boolean(day && start && end && day >= start && day <= end);
}

/**
 * IDs de miembros con baja/vacaciones aprobadas en `dateIso`.
 * @param {object[]} vacationDocs
 * @param {string} businessId
 * @param {string|Date} [dateIso]
 * @returns {Set<string>}
 */
export function buildWorkBlockedMemberIdSet(vacationDocs, businessId, dateIso = new Date()) {
  const day = dayKey(dateIso);
  const bid = normalizeBusinessId(businessId);
  const set = new Set();
  if (!day) return set;
  for (const d of vacationDocs || []) {
    if (!d || d.type !== 'vacation_request' || d.deletedAt) continue;
    if (String(d.status || '') !== 'approved') continue;
    if (bid && normalizeBusinessId(d.business_id) !== bid) continue;
    const leave = String(d.leaveType || 'vacation');
    if (!WORK_BLOCKING_LEAVE_TYPES.includes(leave)) continue;
    const start = dayKey(d.startDate);
    const end = dayKey(d.endDate);
    if (!(start && end && day >= start && day <= end)) continue;
    const mid = normalizeMemberId(d.member_id);
    if (mid) set.add(mid);
  }
  return set;
}

/**
 * @returns {{ blocked: boolean, vacation?: object, message?: string, code?: string }}
 */
export async function getApprovedVacationBlockingWork(req, businessId, memberId, dateIso = new Date()) {
  const day = dayKey(dateIso);
  const bid = normalizeBusinessId(businessId);
  const mid = normalizeMemberId(memberId);
  if (!bid || !mid || !day) return { blocked: false };

  try {
    const db = getVacationsDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const hit = (docs || []).find((d) => isApprovedLeaveBlockingWorkDoc(d, bid, mid, day));

    if (!hit) return { blocked: false };

    const leave = String(hit.leaveType || 'vacation');
    const leaveLabel = leave === 'sick' ? 'baja / enfermedad' : 'vacaciones';
    return {
      blocked: true,
      vacation: hit,
      code: 'VACATION_BLOCK',
      message: `No puedes operar hoy: tienes ${leaveLabel} aprobadas del ${dayKey(hit.startDate)} al ${dayKey(hit.endDate)}.`,
    };
  } catch {
    return { blocked: false };
  }
}

/** Alias histórico (fichaje). */
export async function getApprovedVacationBlockingClockin(req, businessId, memberId, dateIso = new Date()) {
  return getApprovedVacationBlockingWork(req, businessId, memberId, dateIso);
}

/**
 * Varios miembros de una vez (TPV / listados).
 * @returns {Record<string, { blocked: boolean, message?: string, code?: string }>}
 */
export async function getApprovedVacationBlockingWorkBatch(req, businessId, memberIds, dateIso = new Date()) {
  const day = dayKey(dateIso);
  const bid = normalizeBusinessId(businessId);
  const ids = [...new Set((memberIds || []).map(normalizeMemberId).filter(Boolean))];
  const empty = {};
  for (const id of ids) empty[id] = { blocked: false };
  if (!bid || !day || ids.length === 0) return empty;

  try {
    const db = getVacationsDbName();
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const blocked = buildWorkBlockedMemberIdSet(docs, bid, day);
    const result = { ...empty };

    for (const mid of ids) {
      if (!blocked.has(mid)) continue;
      const hit = (docs || []).find((d) => isApprovedLeaveBlockingWorkDoc(d, bid, mid, day));
      const start = dayKey(hit?.startDate);
      const end = dayKey(hit?.endDate);
      const leave = String(hit?.leaveType || 'vacation');
      const leaveLabel = leave === 'sick' ? 'baja / enfermedad' : 'vacaciones';
      result[mid] = {
        blocked: true,
        code: 'VACATION_BLOCK',
        message: `De vacaciones/baja del ${start} al ${end} (${leaveLabel}).`,
      };
    }
    return result;
  } catch {
    return empty;
  }
}

export function getVacationsDatabaseName() {
  return getVacationsDbName();
}
