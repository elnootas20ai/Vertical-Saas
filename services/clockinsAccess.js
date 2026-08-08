import {
  BUSINESSES_DB,
  ensureDatabase,
  getDocument,
  listAccounts,
} from './couchdb.js';
import { isManagerRole } from './managerRoles.js';

export function normalizeClockinUserId(id) {
  return String(id || '').trim().replace(/^account:/, '');
}

export function getAuthUserId(req) {
  return normalizeClockinUserId(req.authUser?.userId || req.authUser?.user_id || '');
}

export function getMember(business, userId) {
  if (!business?.members) return null;
  const uid = normalizeClockinUserId(userId);
  return business.members.find((m) => normalizeClockinUserId(m.user_id) === uid) || null;
}

export function canMutateClockinForMember(business, requesterId, targetMemberId) {
  const req = normalizeClockinUserId(requesterId);
  const tgt = normalizeClockinUserId(targetMemberId);
  if (!req || !tgt) return false;
  if (req === tgt) return true;
  const ownerId = normalizeClockinUserId(business?.owner_user_id);
  if (ownerId && ownerId === req) return true;
  const member = getMember(business, req);
  return Boolean(member && isManagerRole(member.role));
}

/** TPV tablet / gerente en tienda: fichar al equipo en un PDV concreto. */
export function canManageStoreClockin(business, requesterId, targetMemberId, options = {}) {
  if (canMutateClockinForMember(business, requesterId, targetMemberId)) return true;
  const storeTeam = Boolean(options.storeTeamClockin);
  const salesPointId = String(options.salesPointId || '').trim();
  if (!storeTeam || !salesPointId) return false;
  return canAccessStoreClockins(business, requesterId);
}

export function canAccessStoreClockins(business, requesterId) {
  const req = normalizeClockinUserId(requesterId);
  if (!req) return false;
  const ownerId = normalizeClockinUserId(business?.owner_user_id);
  if (ownerId && ownerId === req) return true;
  const member = getMember(business, req);
  if (member && isManagerRole(member.role)) return true;
  for (const m of business?.members || []) {
    if (normalizeClockinUserId(m.user_id) === req && m.status !== 'inactive' && !m.deletedAt) {
      return true;
    }
  }
  return false;
}

function allBusinessMemberIds(business) {
  const ids = new Set(
    (business.members || [])
      .map((m) => normalizeClockinUserId(m.user_id))
      .filter(Boolean),
  );
  const ownerId = normalizeClockinUserId(business.owner_user_id);
  if (ownerId) ids.add(ownerId);
  return Array.from(ids);
}

/** Miembros del negocio + cuentas vinculadas (linkedBusinessId) aunque falten en business.members. */
export async function collectExtendedBusinessTeamIds(req, business) {
  const ids = new Set(allBusinessMemberIds(business));
  const bid = String(business?.business_id || business?.id || '').trim();
  if (!bid) return Array.from(ids);
  try {
    const accounts = await listAccounts(req);
    for (const account of accounts) {
      if (String(account?.linkedBusinessId || '').trim() !== bid) continue;
      const uid = normalizeClockinUserId(account.user_id);
      if (!uid || account.status === 'inactive') continue;
      ids.add(uid);
    }
  } catch {
    /* listAccounts opcional en tests */
  }
  return Array.from(ids);
}

function getSubordinateIds(business, orgchart, userId) {
  if (!orgchart?.nodes?.length || !orgchart?.edges?.length) return null;

  const userNode = orgchart.nodes.find((n) => n.data?.user_id === userId);
  if (!userNode) return null;

  const collected = new Set();
  const queue = [userNode.id];

  while (queue.length) {
    const current = queue.shift();
    const children = orgchart.edges
      .filter((e) => e.source === current)
      .map((e) => e.target);
    for (const childId of children) {
      if (!collected.has(childId)) {
        collected.add(childId);
        queue.push(childId);
      }
    }
  }

  return orgchart.nodes
    .filter((n) => collected.has(n.id) && n.data?.user_id)
    .map((n) => n.data.user_id);
}

export async function resolveVisibleMemberIds(expressReq, business, orgchart, requesterId) {
  const requester = normalizeClockinUserId(requesterId);
  if (!requester) return [];

  const member = getMember(business, requester);
  const ownerId = normalizeClockinUserId(business.owner_user_id);
  const authRole = String(expressReq?.authUser?.role || '').trim();
  const isManager =
    isManagerRole(member?.role)
    || isManagerRole(authRole)
    || (ownerId && ownerId === requester);

  if (isManager) {
    return collectExtendedBusinessTeamIds(expressReq, business);
  }

  // Trabajador sin fila en members (invitado / sync pendiente): siempre ve SUS fichajes.
  if (!member) return [requester];

  const subordinateIds = getSubordinateIds(business, orgchart, requester);
  if (subordinateIds && subordinateIds.length > 0) {
    return [requester, ...subordinateIds.map((id) => normalizeClockinUserId(id)).filter(Boolean)];
  }

  return [requester];
}

export async function loadOrgChartForAccess(req, businessId) {
  try {
    await ensureDatabase(req, BUSINESSES_DB);
    return await getDocument(req, BUSINESSES_DB, `orgchart:${businessId}`);
  } catch {
    return null;
  }
}

/** ¿Puede este miembro fichar en este PDV/centro? (owner y admin sin tienda → cualquiera). */
export function isMemberAssignedToSalesPoint(
  business,
  memberUserId,
  pdvId,
  workCenterId,
  assignmentRef,
  memberRole,
) {
  const uid = normalizeClockinUserId(memberUserId);
  const pdv = String(pdvId || '').trim();
  if (!uid || !pdv) return false;

  const ownerId = normalizeClockinUserId(business?.owner_user_id);
  if (ownerId && ownerId === uid) return true;

  const role = String(memberRole || '').trim();
  const ref = String(assignmentRef || '').trim();
  if (isManagerRole(role) && !ref) return true;
  // Sin tienda en Equipo: no entra en el fichaje de un PDV concreto (TPV por tienda).
  if (!ref) return false;

  const wc = String(workCenterId || '').trim();
  if (
    ref === pdv
    || ref === wc
    || ref === `wc:${wc}`
    || ref === `wc:${pdv}`
    || salesPointRefsSameStore(ref, pdv, wc)
  ) {
    return true;
  }
  return false;
}

export function memberEmploymentSalesPointRef(member, account) {
  return String(
    member?.employment?.salesPointId
    || account?.employment?.salesPointId
    || member?.salesPointId
    || '',
  ).trim();
}

/** Mismo local aunque el id sea PDV, centro de trabajo o prefijo wc:. */
export function salesPointRefsSameStore(existingSp, newSp, workCenterId) {
  const a = String(existingSp || '').trim();
  const b = String(newSp || '').trim();
  // Sin ambos ids no se puede afirmar que sea el mismo local.
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === `wc:${b}` || b === `wc:${a}`) return true;

  const wc = String(workCenterId || '').trim();
  if (!wc) return false;
  const wcAliases = new Set([wc, `wc:${wc}`]);
  const aIsThisWc = wcAliases.has(a);
  const bIsThisWc = wcAliases.has(b);
  if (aIsThisWc && bIsThisWc) return true;

  // Un centro de OTRA tienda nunca es el mismo local (Bug: Pol/Badalona en tablet Tiana).
  const looksLikeWc = (id) => {
    const s = String(id || '').trim();
    return s.startsWith('wc-') || s.startsWith('wc:');
  };
  if ((looksLikeWc(a) && !aIsThisWc) || (looksLikeWc(b) && !bIsThisWc)) {
    return false;
  }

  // Mismo local: centro de esta tienda ↔ PDV de esta tienda.
  if (aIsThisWc && b) return true;
  if (bIsThisWc && a) return true;
  return false;
}

export function deriveClockinStatus(entries) {
  const types = (entries || []).map((e) => e.type);
  if (types.includes('clock_out')) return 'completed';
  const breakStarts = types.filter((t) => t === 'break_start').length;
  const breakEnds = types.filter((t) => t === 'break_end').length;
  if (breakStarts > breakEnds) return 'break';
  return 'active';
}

/** Cierre automático: fin de turno + 10 min (misma regla que el cliente). */
export const AUTO_OUT_GRACE_MS = 10 * 60 * 1000;
/** Sin horario: tope de seguridad 4 h continuas. */
export const SAFETY_CONTINUOUS_MS = 4 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseLocalDateTime(dateStr, hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(`${dateStr}T${pad2(h)}:${pad2(m)}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calendarDayKeyLocal(iso) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso || '').slice(0, 10);
  }
}

function isOvernightSchedule(scheduledStart, scheduledEnd) {
  if (!scheduledStart || !scheduledEnd) return false;
  const [sh, sm] = String(scheduledStart).split(':').map(Number);
  const [eh, em] = String(scheduledEnd).split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return false;
  return eh * 60 + em <= sh * 60 + sm;
}

/**
 * Momento (ms) en que debe cerrarse solo el fichaje (ignora status completed).
 * Con turno: scheduled_end (+1 día si cruza medianoche) + 10 min.
 * Sin turno: 4 h desde la última reanudación (entrada / fin descanso).
 */
export function getAutoClockOutDeadlineMs(record) {
  if (!record) return null;
  const dateStr = String(record.date || '').slice(0, 10);
  const end = dateStr && record.scheduled_end
    ? parseLocalDateTime(dateStr, record.scheduled_end)
    : null;
  const start = dateStr && record.scheduled_start
    ? parseLocalDateTime(dateStr, record.scheduled_start)
    : null;

  if (end) {
    if (start && end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    return end.getTime() + AUTO_OUT_GRACE_MS;
  }

  let lastResume = null;
  for (const e of record.entries || []) {
    // Ignorar clock_out: el deadline es el momento en que debió cerrarse, no tras cerrar.
    if (e.type === 'clock_out') break;
    if (e.type === 'clock_in' || e.type === 'break_end') {
      lastResume = new Date(e.time).getTime();
    }
    if (e.type === 'break_start') {
      lastResume = null;
    }
  }
  if (lastResume == null) return null;
  return lastResume + SAFETY_CONTINUOUS_MS;
}

export function getAutoClockOutAtMs(record, nowMs = Date.now()) {
  if (!record || record.status === 'completed') return null;
  return getAutoClockOutDeadlineMs(record);
}

export function shouldAutoClockOut(record, nowMs = Date.now()) {
  if (!record || record.status === 'completed' || record.status === 'break') return false;
  const at = getAutoClockOutDeadlineMs(record);
  if (at == null) return false;
  return nowMs >= at;
}

/** Salida al día siguiente sin turno noche → cierre tardío erróneo (p. ej. al fichar al día). */
function isStaleNextDayClockOut(entries, scheduledStart, scheduledEnd) {
  const clockIn = (entries || []).find((e) => e.type === 'clock_in');
  const clockOut = (entries || []).find((e) => e.type === 'clock_out');
  if (!clockIn?.time || !clockOut?.time) return false;
  if (isOvernightSchedule(scheduledStart, scheduledEnd)) return false;
  const inDay = calendarDayKeyLocal(clockIn.time);
  const outDay = calendarDayKeyLocal(clockOut.time);
  return Boolean(inDay && outDay && outDay > inDay);
}

export function computeClockinMinutes(entries, scheduledStart, scheduledEnd, dateStr) {
  let totalMinutes = 0;
  let breakMinutes = 0;
  const clockInEntry = (entries || []).find((e) => e.type === 'clock_in');
  const clockOutEntry = (entries || []).find((e) => e.type === 'clock_out');
  if (!clockInEntry) return { totalMinutes: 0, breakMinutes: 0 };

  let startMs = new Date(clockInEntry.time).getTime();
  let endMs = clockOutEntry ? new Date(clockOutEntry.time).getTime() : Date.now();

  if (dateStr && scheduledStart) {
    const [h, m] = scheduledStart.split(':').map(Number);
    const schedStartMs = new Date(`${dateStr}T${pad2(h)}:${pad2(m)}:00`).getTime();
    if (startMs < schedStartMs) startMs = schedStartMs;
  }
  if (dateStr && scheduledEnd) {
    const [h, m] = scheduledEnd.split(':').map(Number);
    let schedEndMs = new Date(`${dateStr}T${pad2(h)}:${pad2(m)}:00`).getTime();
    if (scheduledStart) {
      const [sh, sm] = scheduledStart.split(':').map(Number);
      const schedStartMs = new Date(`${dateStr}T${pad2(sh)}:${pad2(sm)}:00`).getTime();
      if (schedEndMs <= schedStartMs) schedEndMs += 24 * 60 * 60 * 1000;
    }
    if (endMs > schedEndMs) endMs = schedEndMs;
  } else if (isStaleNextDayClockOut(entries, scheduledStart, scheduledEnd)) {
    // Sin horario y salida al día siguiente: no contar ~24 h; tope = auto-cierre (4 h).
    const deadline = getAutoClockOutDeadlineMs({
      date: dateStr,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      entries,
    });
    if (deadline != null && endMs > deadline) endMs = deadline;
  }

  totalMinutes = Math.round(Math.max(0, endMs - startMs) / 60000);

  const breakPairs = [];
  for (const e of entries || []) {
    if (e.type === 'break_start') breakPairs.push({ start: e.time });
    if (e.type === 'break_end' && breakPairs.length > 0) {
      const last = breakPairs[breakPairs.length - 1];
      if (!last.end) last.end = e.time;
    }
  }
  for (const pair of breakPairs) {
    if (pair.start) {
      let bStart = new Date(pair.start).getTime();
      let bEnd = pair.end ? new Date(pair.end).getTime() : Date.now();
      bStart = Math.max(bStart, startMs);
      bEnd = Math.min(bEnd, endMs);
      if (bEnd > bStart) {
        breakMinutes += Math.round((bEnd - bStart) / 60000);
      }
    }
  }

  return { totalMinutes: Math.max(0, totalMinutes - breakMinutes), breakMinutes };
}
