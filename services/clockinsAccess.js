import {
  BUSINESSES_DB,
  ensureDatabase,
  getDocument,
} from './couchdb.js';

const ADMIN_ROLES = new Set(['Admin', 'Gerente']);

export function getAuthUserId(req) {
  return String(req.authUser?.userId || req.authUser?.user_id || '').trim();
}

export function getMember(business, userId) {
  if (!business?.members) return null;
  return business.members.find((m) => m.user_id === userId) || null;
}

export function canMutateClockinForMember(business, requesterId, targetMemberId) {
  if (!requesterId || !targetMemberId) return false;
  if (requesterId === targetMemberId) return true;
  const ownerId = String(business?.owner_user_id || '').trim();
  if (ownerId && ownerId === requesterId) return true;
  const member = getMember(business, requesterId);
  return Boolean(member && ADMIN_ROLES.has(member.role));
}

function allBusinessMemberIds(business) {
  const ids = new Set((business.members || []).map((m) => m.user_id).filter(Boolean));
  const ownerId = String(business.owner_user_id || '').trim();
  if (ownerId) ids.add(ownerId);
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

export async function resolveVisibleMemberIds(req, business, orgchart, requesterId) {
  if (!requesterId) return [];

  const member = getMember(business, requesterId);
  const ownerId = String(business.owner_user_id || '').trim();
  const authRole = String(req.authUser?.role || '').trim();
  const isManager =
    (member && ADMIN_ROLES.has(member.role))
    || ownerId === requesterId
    || (authRole === 'Admin' && ownerId === requesterId);

  if (isManager) {
    return allBusinessMemberIds(business);
  }

  if (!member) return [];

  const subordinateIds = getSubordinateIds(business, orgchart, requesterId);
  if (subordinateIds && subordinateIds.length > 0) {
    return [requesterId, ...subordinateIds];
  }

  return [requesterId];
}

export async function loadOrgChartForAccess(req, businessId) {
  try {
    await ensureDatabase(req, BUSINESSES_DB);
    return await getDocument(req, BUSINESSES_DB, `orgchart:${businessId}`);
  } catch {
    return null;
  }
}

/** Mismo local aunque el id sea PDV, centro de trabajo o prefijo wc:. */
export function salesPointRefsSameStore(existingSp, newSp, workCenterId) {
  const a = String(existingSp || '').trim();
  const b = String(newSp || '').trim();
  if (!a || !b) return true;
  if (a === b) return true;
  if (a === `wc:${b}` || b === `wc:${a}`) return true;
  const wc = String(workCenterId || '').trim();
  if (!wc) return false;
  const wcAliases = new Set([wc, `wc:${wc}`]);
  if (wcAliases.has(a) && wcAliases.has(b)) return true;
  // Fichaje antiguo con id de centro + tablet con PDV del mismo centro (o al revés).
  if (wcAliases.has(a) && b && !wcAliases.has(b)) return true;
  if (wcAliases.has(b) && a && !wcAliases.has(a)) return true;
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
    const schedStartMs = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
    if (startMs < schedStartMs) startMs = schedStartMs;
  }
  if (dateStr && scheduledEnd) {
    const [h, m] = scheduledEnd.split(':').map(Number);
    const schedEndMs = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
    if (endMs > schedEndMs) endMs = schedEndMs;
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
