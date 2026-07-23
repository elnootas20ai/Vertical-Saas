import {
  getClockinsDbName,
  getSalesDbName,
  listClockinsByBusiness,
  listSalesByUser,
  findBusinessById,
  findAccountByUserId,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  BUSINESSES_DB,
  buildNotificationDocument,
  normalizeNotificationPreferences,
  saveNotification,
  sanitizeNotification,
} from '../services/couchdb.js';
import { broadcastToUser } from '../services/sseService.js';
import { sendPushToUser } from '../services/pushService.js';
import {
  canMutateClockinForMember,
  canManageStoreClockin,
  canAccessStoreClockins,
  computeClockinMinutes,
  deriveClockinStatus,
  normalizeClockinUserId,
  resolveVisibleMemberIds,
  salesPointRefsSameStore,
  isMemberAssignedToSalesPoint,
  memberEmploymentSalesPointRef,
} from '../services/clockinsAccess.js';
import { isBusinessTeamMember } from '../services/businessAccess.js';
import { isManagerRole } from '../services/managerRoles.js';
import {
  computeLaborCostBreakdown,
  computePeriodLaborCost,
} from '../services/laborCost.js';
import { getApprovedVacationBlockingClockin, getApprovedVacationBlockingWork, getApprovedVacationBlockingWorkBatch, buildWorkBlockedMemberIdSet, isApprovedLeaveBlockingWorkDoc } from '../services/vacationClockinGate.js';

const WEEKDAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Día civil en zona ES (YYYY-MM-DD). Evita el desfase UTC a medianoche. */
function calendarDayKeyMadrid(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isOpenClockinRecord(record) {
  if (!record) return false;
  const entries = Array.isArray(record.entries) ? record.entries : [];
  if (entries.some((e) => e?.type === 'clock_out')) return false;
  const status = record.status || deriveClockinStatus(entries);
  return status !== 'completed';
}

function clockinLocalDayKey(record) {
  const clockInIso = (record?.entries || []).find((e) => e?.type === 'clock_in')?.time;
  if (clockInIso) {
    try {
      return calendarDayKeyMadrid(new Date(clockInIso));
    } catch {
      /* fall through */
    }
  }
  return String(record?.date || '').slice(0, 10);
}

async function autoCloseOpenClockin(req, clockinsDb, openDoc, nowIso) {
  let entries = [...(openDoc.entries || [])];
  const status = deriveClockinStatus(entries);
  if (status === 'break') {
    entries = [...entries, { type: 'break_end', time: nowIso }];
  }
  entries = [...entries, { type: 'clock_out', time: nowIso }];
  const { totalMinutes, breakMinutes } = computeClockinMinutes(
    entries,
    openDoc.scheduled_start,
    openDoc.scheduled_end,
    openDoc.date,
  );
  const closed = {
    ...openDoc,
    entries,
    totalMinutes,
    breakMinutes,
    status: 'completed',
    updatedAt: nowIso,
  };
  await putDocument(req, clockinsDb, openDoc._id, closed);
  return closed;
}

function getSchedulesDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'vertial';
  return `${prefix}-schedules`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuthUserId(req) {
  return normalizeClockinUserId(req.authUser?.userId || req.authUser?.user_id || '');
}

/** Compara member_id de fichajes con el set visible (ids normalizados). */
function isMemberVisible(visibleIds, memberId) {
  const mid = normalizeClockinUserId(memberId);
  if (!mid || !Array.isArray(visibleIds) || visibleIds.length === 0) return false;
  if (visibleIds.includes(mid)) return true;
  return visibleIds.some((id) => normalizeClockinUserId(id) === mid);
}

function getMember(business, userId) {
  if (!business?.members) return null;
  const uid = normalizeClockinUserId(userId);
  return business.members.find((m) => normalizeClockinUserId(m.user_id) === uid) || null;
}

function allBusinessMemberIds(business) {
  const ids = new Set(
    (business.members || []).map((m) => normalizeClockinUserId(m.user_id)).filter(Boolean),
  );
  const ownerId = normalizeClockinUserId(business.owner_user_id);
  if (ownerId) ids.add(ownerId);
  return Array.from(ids);
}

async function loadOrgChart(req, businessId) {
  try {
    await ensureDatabase(req, BUSINESSES_DB);
    return await getDocument(req, BUSINESSES_DB, `orgchart:${businessId}`);
  } catch {
    return null;
  }
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function buildMemberMap(business) {
  const map = {};
  for (const m of business.members || []) {
    map[m.user_id] = { fullName: m.fullName, role: m.role, email: m.email, branch_id: m.branch_id };
  }
  const ownerId = String(business.owner_user_id || '').trim();
  if (ownerId && !map[ownerId]) {
    map[ownerId] = {
      fullName: business.name ? `${business.name} (titular)` : 'Titular',
      role: 'Admin',
      email: business.email || '',
      branch_id: '',
    };
  }
  return map;
}

function displayNameFromAccount(account) {
  if (!account) return '';
  return String(
    account.fullName
    || [account.firstName, account.lastName].filter(Boolean).join(' ')
    || account.email
    || '',
  ).trim();
}

/** Nombre legible para UI; nunca devolver el UUID crudo. */
function resolveMemberLabel(memberMap, memberId, storedName = '') {
  const info = memberMap[memberId] || {};
  const stored = String(storedName || '').trim();
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored);
  if (stored && !looksLikeUuid) return stored;
  return info.fullName || info.email || 'Sin nombre';
}

async function enrichMemberMap(req, business, extraUserIds = []) {
  const map = buildMemberMap(business);
  const ids = [
    ...new Set([
      ...allBusinessMemberIds(business),
      ...extraUserIds.map((id) => normalizeClockinUserId(id)).filter(Boolean),
    ]),
  ];
  await Promise.all(
    ids.map(async (userId) => {
      if (map[userId]?.fullName?.trim()) return;
      try {
        const account = await findAccountByUserId(req, userId);
        const name = displayNameFromAccount(account);
        if (!map[userId]) {
          map[userId] = { fullName: '', role: 'Usuario', email: '', branch_id: '' };
        }
        if (name) map[userId].fullName = name;
        if (account?.email && !map[userId].email) map[userId].email = String(account.email).trim();
        if (account?.role && map[userId].role === 'Usuario') map[userId].role = account.role;
      } catch {
        /* cuenta no encontrada */
      }
    }),
  );
  for (const userId of ids) {
    if (!map[userId]) map[userId] = { fullName: '', role: 'Usuario', email: '', branch_id: '' };
    if (!map[userId].fullName?.trim()) {
      map[userId].fullName = map[userId].email || 'Sin nombre';
    }
  }
  return map;
}

function isDemoTeamMember(memberMap, memberId, memberRow = null) {
  const info = memberMap[memberId] || {};
  const name = String(memberRow?.fullName || info.fullName || '').trim();
  // Solo cuentas demo de nombre; @test.local puede ser trabajador real del local.
  if (/^demo(\s|$)/i.test(name)) return true;
  return false;
}

/** Miembros reales del business (no cuentas demo / test). */
function listRealTeamMemberIds(business, visibleIds, memberMap) {
  const ids = new Set();
  for (const m of business.members || []) {
    const uid = String(m?.user_id || '').trim();
    if (!uid || !visibleIds.includes(uid)) continue;
    if (m.status === 'inactive' || m.deletedAt) continue;
    if (isDemoTeamMember(memberMap, uid, m)) continue;
    ids.add(uid);
  }
  const ownerId = String(business.owner_user_id || '').trim();
  if (ownerId && visibleIds.includes(ownerId) && !isDemoTeamMember(memberMap, ownerId)) {
    ids.add(ownerId);
  }
  for (const uid of visibleIds) {
    const normalized = normalizeClockinUserId(uid);
    if (!normalized || ids.has(normalized)) continue;
    if (isDemoTeamMember(memberMap, normalized)) continue;
    ids.add(normalized);
  }
  return Array.from(ids);
}

function recordMatchesStoreFilter(r, salesPointFilter, workCenterFilter) {
  const sp = String(r.sales_point_id || '').trim();
  if (!sp) return false;
  if (salesPointFilter && (sp === salesPointFilter || sp === `wc:${salesPointFilter}` || salesPointRefsSameStore(sp, salesPointFilter, workCenterFilter))) {
    return true;
  }
  if (workCenterFilter && (sp === workCenterFilter || sp === `wc:${workCenterFilter}` || salesPointRefsSameStore(sp, workCenterFilter, workCenterFilter))) {
    return true;
  }
  return false;
}

function dedupeClockinDocumentsById(records) {
  const byId = new Map();
  for (const r of records) {
    const id = String(r._id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || String(r.updatedAt || '') > String(prev.updatedAt || '')) {
      byId.set(id, r);
    }
  }
  return Array.from(byId.values());
}

function clockInSortTime(record) {
  return record?.entries?.find((e) => e.type === 'clock_in')?.time
    || record?.createdAt
    || '';
}

function buildTeamDayClockins({
  teamIds,
  records,
  dateFilter,
  scheduleDocs,
  businessId,
  memberMap,
  enrichRecord,
}) {
  const byMember = new Map();
  for (const r of records) {
    const mid = normalizeClockinUserId(r.member_id);
    if (!mid) continue;
    if (!byMember.has(mid)) byMember.set(mid, []);
    byMember.get(mid).push(r);
  }
  for (const list of byMember.values()) {
    list.sort((a, b) => clockInSortTime(a).localeCompare(clockInSortTime(b)));
  }

  const enriched = [];
  for (const mid of teamIds) {
    const shift = resolveMemberShiftForDate(scheduleDocs, mid, dateFilter);
    const sessions = byMember.get(mid) || [];
    if (sessions.length === 0) {
      const info = memberMap[mid] || {};
      enriched.push({
        _id: `teamday:${dateFilter}:${mid}`,
        type: 'clockin',
        business_id: businessId,
        member_id: mid,
        member_name: resolveMemberLabel(memberMap, mid),
        date: dateFilter,
        entries: [],
        totalMinutes: 0,
        breakMinutes: 0,
        status: 'offline',
        notes: '',
        scheduled_start: shift?.start,
        scheduled_end: shift?.end,
        member_role: info.role || 'Usuario',
        member_email: info.email || '',
        roster_placeholder: true,
      });
      continue;
    }
    sessions.forEach((rec, idx) => {
      enriched.push(attachScheduleToRecord(enrichRecord({
        ...rec,
        session_index: idx + 1,
        same_day_sessions: sessions.length,
      }), shift));
    });
  }

  enriched.sort((a, b) => {
    if (Boolean(a.roster_placeholder) !== Boolean(b.roster_placeholder)) {
      return a.roster_placeholder ? 1 : -1;
    }
    const byName = (a.member_name || '').localeCompare(b.member_name || '', 'es');
    if (byName !== 0) return byName;
    return (a.session_index || 1) - (b.session_index || 1);
  });

  return enriched;
}

function resolveMemberShiftForDate(scheduleDocs, memberId, dateStr) {
  const targetMs = new Date(`${dateStr}T00:00:00`).getTime();
  const weekday = WEEKDAYS_MAP[new Date(`${dateStr}T00:00:00`).getDay()];
  let best = null;
  let bestWs = -Infinity;
  for (const doc of scheduleDocs) {
    if (doc.type !== 'schedule' || doc.member_id !== memberId) continue;
    const ws = new Date(`${doc.week_start}T00:00:00`).getTime();
    if (Number.isNaN(ws) || ws > targetMs) continue;
    if (ws >= bestWs) {
      bestWs = ws;
      best = doc;
    }
  }
  const shift = best?.weekly?.[weekday];
  if (!shift?.enabled) return null;
  return { start: shift.start, end: shift.end };
}

function attachScheduleToRecord(record, shift) {
  if (!shift) return record;
  return {
    ...record,
    scheduled_start: record.scheduled_start || shift.start,
    scheduled_end: record.scheduled_end || shift.end,
  };
}

// ─── List clockins (role-aware) ───────────────────────────────────────────────

export async function listClockins(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const dateFilter = req.query.date ? String(req.query.date).slice(0, 10) : null;
    const memberIdFilter = req.query.memberId ? String(req.query.memberId) : null;

    let records = await listClockinsByBusiness(req, businessId);

    if (dateFilter) {
      records = records.filter((r) => r.date === dateFilter);
    }
    if (memberIdFilter) {
      const mid = normalizeClockinUserId(memberIdFilter);
      records = records.filter((r) => normalizeClockinUserId(r.member_id) === mid);
    }

    const salesPointFilter = req.query.salesPointId ? String(req.query.salesPointId).trim() : null;
    const workCenterFilter = req.query.workCenterId ? String(req.query.workCenterId).trim() : null;
    const storeScope = String(req.query.storeScope || '') === '1';

    if (storeScope && (salesPointFilter || workCenterFilter)) {
      if (!canAccessStoreClockins(business, requesterId)) {
        return res.status(403).json({ ok: false, error: 'No autorizado para fichajes de tienda' });
      }
    }

    if (salesPointFilter || workCenterFilter) {
      records = records.filter((r) => {
        if (storeScope) {
          return recordMatchesStoreFilter(r, salesPointFilter, workCenterFilter);
        }
        const sp = String(r.sales_point_id || '').trim();
        if (!sp) return false;
        if (salesPointFilter && (sp === salesPointFilter || sp === `wc:${salesPointFilter}`)) return true;
        if (workCenterFilter && (sp === workCenterFilter || sp === `wc:${workCenterFilter}`)) return true;
        return false;
      });
    }

    // TPV en tienda: con storeScope cualquier miembro del negocio ve fichajes de ese PDV.
    if (!storeScope || (!salesPointFilter && !workCenterFilter)) {
      records = records.filter((r) => isMemberVisible(visibleIds, r.member_id));
    }
    records = dedupeClockinDocumentsById(records);

    const memberMap = await enrichMemberMap(req, business, visibleIds);
    const enrichRecord = (r) => ({
      ...r,
      member_role: memberMap[r.member_id]?.role || r.member_role || 'Usuario',
      member_email: memberMap[r.member_id]?.email || r.member_email || '',
      member_name: resolveMemberLabel(memberMap, r.member_id, r.member_name),
    });

    const recordsOnly = String(req.query.recordsOnly || '') === '1';

    // Vista del día: una fila por miembro (sin fichar) o una fila por cada turno fichado.
    if (dateFilter && !memberIdFilter && !recordsOnly) {
      const scheduleDocs = await loadScheduleDocs(req, businessId);
      const teamIds = listRealTeamMemberIds(business, visibleIds, memberMap);
      const enriched = buildTeamDayClockins({
        teamIds,
        records,
        dateFilter,
        scheduleDocs,
        businessId,
        memberMap,
        enrichRecord,
      });

      return res.json({ ok: true, clockins: enriched });
    }

    const enriched = records.map(enrichRecord);
    enriched.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      const nameCmp = (a.member_name || '').localeCompare(b.member_name || '', 'es');
      if (nameCmp !== 0) return nameCmp;
      return clockInSortTime(a).localeCompare(clockInSortTime(b));
    });

    return res.json({ ok: true, clockins: enriched });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar fichajes' });
  }
}

// ─── Active now ───────────────────────────────────────────────────────────────

export async function listActiveNow(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const today = new Date().toISOString().slice(0, 10);
    const records = await listClockinsByBusiness(req, businessId);

    const active = records
      .filter(
        (r) =>
          r.date === today &&
          (r.status === 'active' || r.status === 'break') &&
          isMemberVisible(visibleIds, r.member_id),
      );

    const memberMap = await enrichMemberMap(req, business);
    const enriched = active.map((r) => ({
      member_id: r.member_id,
      member_name: resolveMemberLabel(memberMap, r.member_id, r.member_name),
      member_role: memberMap[r.member_id]?.role || 'Usuario',
      status: r.status,
      clock_in: r.entries?.find((e) => e.type === 'clock_in')?.time || null,
      totalMinutes: r.totalMinutes,
    }));

    return res.json({ ok: true, active: enriched });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener usuarios activos' });
  }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getStats(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const { from, to, period } = req.query;
    let records = await listClockinsByBusiness(req, businessId);
    records = records.filter((r) => isMemberVisible(visibleIds, r.member_id));

    if (from) records = records.filter((r) => r.date >= from);
    if (to) records = records.filter((r) => r.date <= to);

    const memberMap = buildMemberMap(business);

    const byMember = {};
    const byDate = {};
    const byRole = {};
    let totalMinutes = 0;
    let totalBreakMinutes = 0;
    let completedCount = 0;

    for (const r of records) {
      const mid = r.member_id;
      const role = memberMap[mid]?.role || 'Usuario';

      if (!byMember[mid]) {
        byMember[mid] = {
          member_id: mid,
          member_name: r.member_name || memberMap[mid]?.fullName || mid,
          role,
          totalMinutes: 0,
          breakMinutes: 0,
          sessions: 0,
          avgMinutes: 0,
        };
      }
      byMember[mid].totalMinutes += r.totalMinutes || 0;
      byMember[mid].breakMinutes += r.breakMinutes || 0;
      byMember[mid].sessions += 1;

      if (!byDate[r.date]) byDate[r.date] = { date: r.date, totalMinutes: 0, sessions: 0 };
      byDate[r.date].totalMinutes += r.totalMinutes || 0;
      byDate[r.date].sessions += 1;

      if (!byRole[role]) byRole[role] = { role, totalMinutes: 0, sessions: 0, members: new Set() };
      byRole[role].totalMinutes += r.totalMinutes || 0;
      byRole[role].sessions += 1;
      byRole[role].members.add(mid);

      totalMinutes += r.totalMinutes || 0;
      totalBreakMinutes += r.breakMinutes || 0;
      if (r.status === 'completed') completedCount += 1;
    }

    for (const mid of Object.keys(byMember)) {
      byMember[mid].avgMinutes = byMember[mid].sessions > 0
        ? Math.round(byMember[mid].totalMinutes / byMember[mid].sessions)
        : 0;
    }

    const roleStats = Object.values(byRole).map((r) => ({
      role: r.role,
      totalMinutes: r.totalMinutes,
      sessions: r.sessions,
      memberCount: r.members.size,
    }));

    const dateStats = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    const weeklyAgg = {};
    for (const ds of dateStats) {
      const d = new Date(ds.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const weekKey = weekStart.toISOString().slice(0, 10);
      if (!weeklyAgg[weekKey]) weeklyAgg[weekKey] = { week: weekKey, totalMinutes: 0, sessions: 0 };
      weeklyAgg[weekKey].totalMinutes += ds.totalMinutes;
      weeklyAgg[weekKey].sessions += ds.sessions;
    }

    const monthlyAgg = {};
    for (const ds of dateStats) {
      const monthKey = ds.date.slice(0, 7);
      if (!monthlyAgg[monthKey]) monthlyAgg[monthKey] = { month: monthKey, totalMinutes: 0, sessions: 0 };
      monthlyAgg[monthKey].totalMinutes += ds.totalMinutes;
      monthlyAgg[monthKey].sessions += ds.sessions;
    }

    return res.json({
      ok: true,
      stats: {
        summary: {
          totalMinutes,
          totalBreakMinutes,
          totalSessions: records.length,
          completedSessions: completedCount,
          uniqueMembers: Object.keys(byMember).length,
          avgMinutesPerSession: records.length > 0 ? Math.round(totalMinutes / records.length) : 0,
        },
        byMember: Object.values(byMember),
        byDate: dateStats,
        byWeek: Object.values(weeklyAgg),
        byMonth: Object.values(monthlyAgg),
        byRole: roleStats,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular estadísticas' });
  }
}

// ─── Performance: cross-reference clockins with sales ─────────────────────────

export async function getPerformance(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !isManagerRole(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes y administradores pueden ver rendimiento' });
    }

    const { from, to } = req.query;

    let clockinRecords = await listClockinsByBusiness(req, businessId);
    if (from) clockinRecords = clockinRecords.filter((r) => r.date >= from);
    if (to) clockinRecords = clockinRecords.filter((r) => r.date <= to);

    const memberMap = buildMemberMap(business);
    const memberIds = business.members.map((m) => m.user_id);

    const salesByMember = {};
    try {
      const salesDb = getSalesDbName();
      await ensureDatabase(req, salesDb);
      const allSales = await getAllDocuments(req, salesDb);
      const filteredSales = allSales.filter(
        (s) => s?.type === 'sale' && !s?.deletedAt && memberIds.includes(s?.user_id),
      );
      for (const sale of filteredSales) {
        const saleDate = (sale.createdAt || '').slice(0, 10);
        if (from && saleDate < from) continue;
        if (to && saleDate > to) continue;
        if (!salesByMember[sale.user_id]) {
          salesByMember[sale.user_id] = { count: 0, totalAmount: 0 };
        }
        salesByMember[sale.user_id].count += 1;
        salesByMember[sale.user_id].totalAmount += Number(sale.totalPrice || 0);
      }
    } catch {
      // sales DB may not exist for all business types
    }

    const performance = [];
    const clockinsByMember = {};
    for (const r of clockinRecords) {
      if (!clockinsByMember[r.member_id]) clockinsByMember[r.member_id] = { totalMinutes: 0, sessions: 0 };
      clockinsByMember[r.member_id].totalMinutes += r.totalMinutes || 0;
      clockinsByMember[r.member_id].sessions += 1;
    }

    for (const mid of memberIds) {
      const clockinData = clockinsByMember[mid] || { totalMinutes: 0, sessions: 0 };
      const salesData = salesByMember[mid] || { count: 0, totalAmount: 0 };
      const hoursWorked = clockinData.totalMinutes / 60;

      performance.push({
        member_id: mid,
        member_name: memberMap[mid]?.fullName || mid,
        role: memberMap[mid]?.role || 'Usuario',
        hoursWorked: Math.round(hoursWorked * 100) / 100,
        sessions: clockinData.sessions,
        salesCount: salesData.count,
        salesAmount: salesData.totalAmount,
        salesPerHour: hoursWorked > 0 ? Math.round((salesData.count / hoursWorked) * 100) / 100 : 0,
        revenuePerHour: hoursWorked > 0 ? Math.round((salesData.totalAmount / hoursWorked) * 100) / 100 : 0,
      });
    }

    performance.sort((a, b) => b.revenuePerHour - a.revenuePerHour);

    return res.json({ ok: true, performance });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular rendimiento' });
  }
}

// ─── Labor cost (fichajes × coste hora empresa) ───────────────────────────────

export async function getLaborCost(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !isManagerRole(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes y administradores pueden ver coste laboral' });
    }

    const { from, to } = req.query;
    if (!from || !to) return badRequest(res, 'Se requieren parámetros from y to (YYYY-MM-DD)');

    let clockinRecords = await listClockinsByBusiness(req, businessId);
    clockinRecords = clockinRecords.filter((r) => r.date >= from && r.date <= to);

    const memberMap = buildMemberMap(business);
    const memberIds = business.members.map((m) => m.user_id);
    const clockinsByMember = {};
    for (const r of clockinRecords) {
      if (!clockinsByMember[r.member_id]) clockinsByMember[r.member_id] = 0;
      clockinsByMember[r.member_id] += r.totalMinutes || 0;
    }

    const members = [];
    let teamActualEmployerCost = 0;
    let teamActualGrossCost = 0;
    let membersWithSalary = 0;

    for (const mid of memberIds) {
      const workedMinutes = clockinsByMember[mid] || 0;
      let employment = {};
      try {
        const account = await findAccountByUserId(req, mid);
        employment = account?.employment || {};
      } catch {
        employment = {};
      }

      const laborCost = computePeriodLaborCost(employment, workedMinutes);
      const monthlyBreakdown = computeLaborCostBreakdown(employment);
      if (monthlyBreakdown) membersWithSalary += 1;
      if (laborCost) {
        teamActualEmployerCost += laborCost.actualEmployerCost;
        teamActualGrossCost += laborCost.actualGrossCost;
      }

      members.push({
        member_id: mid,
        member_name: memberMap[mid]?.fullName || mid,
        role: memberMap[mid]?.role || 'Usuario',
        worked_minutes: workedMinutes,
        worked_hours: Math.round((workedMinutes / 60) * 100) / 100,
        contract_type: employment.contractType || '',
        workday: employment.workday || '',
        salary_text: employment.salary || '',
        gross_monthly: monthlyBreakdown?.grossMonthly ?? null,
        social_security_monthly: monthlyBreakdown?.socialSecurityCost ?? null,
        other_costs_monthly: monthlyBreakdown?.otherCosts ?? null,
        total_monthly_employer: monthlyBreakdown?.totalMonthlyEmployerCost ?? null,
        hourly_employer_cost: monthlyBreakdown?.hourlyEmployerCost ?? null,
        actual_gross_cost: laborCost?.actualGrossCost ?? null,
        actual_employer_cost: laborCost?.actualEmployerCost ?? null,
        has_salary_data: Boolean(monthlyBreakdown),
        cost_currency: monthlyBreakdown?.costCurrency || 'EUR',
      });
    }

    members.sort((a, b) => (b.actual_employer_cost || 0) - (a.actual_employer_cost || 0));

    return res.json({
      ok: true,
      period: { from, to },
      summary: {
        actual_employer_cost: Math.round(teamActualEmployerCost * 100) / 100,
        actual_gross_cost: Math.round(teamActualGrossCost * 100) / 100,
        members_with_salary: membersWithSalary,
        members_total: memberIds.length,
        cost_currency: 'EUR',
      },
      members,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular coste laboral' });
  }
}

// ─── Adjust clockin entry (managers only) ─────────────────────────────────────

export async function adjustClockinEntry(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !isManagerRole(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes y administradores pueden ajustar fichajes' });
    }

    const { clockinId, entryIndex, newTime } = req.body;
    if (!clockinId || entryIndex === undefined || !newTime) {
      return badRequest(res, 'Faltan parámetros: clockinId, entryIndex, newTime');
    }

    const clockinsDb = getClockinsDbName();
    await ensureDatabase(req, clockinsDb);
    const doc = await getDocument(req, clockinsDb, clockinId);
    if (!doc || doc.business_id !== businessId) {
      return res.status(404).json({ ok: false, error: 'Fichaje no encontrado' });
    }

    if (entryIndex < 0 || entryIndex >= (doc.entries || []).length) {
      return badRequest(res, 'Índice de entrada inválido');
    }

    doc.entries[entryIndex].time = newTime;

    let totalMinutes = 0;
    let breakMinutes = 0;
    const clockInEntry = doc.entries.find((e) => e.type === 'clock_in');
    const clockOutEntry = doc.entries.find((e) => e.type === 'clock_out');
    if (clockInEntry) {
      let startMs = new Date(clockInEntry.time).getTime();
      let endMs = clockOutEntry ? new Date(clockOutEntry.time).getTime() : Date.now();

      if (doc.date && doc.scheduled_start) {
        const [sh, sm] = doc.scheduled_start.split(':').map(Number);
        const schedStartMs = new Date(`${doc.date}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`).getTime();
        if (startMs < schedStartMs) startMs = schedStartMs;
      }
      if (doc.date && doc.scheduled_end) {
        const [eh, em] = doc.scheduled_end.split(':').map(Number);
        const schedEndMs = new Date(`${doc.date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`).getTime();
        if (endMs > schedEndMs) endMs = schedEndMs;
      }

      totalMinutes = Math.round(Math.max(0, endMs - startMs) / 60000);

      const breakPairs = [];
      for (const e of doc.entries) {
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
    }
    doc.totalMinutes = Math.max(0, totalMinutes - breakMinutes);
    doc.breakMinutes = breakMinutes;
    doc.updatedAt = new Date().toISOString();

    await putDocument(req, clockinsDb, clockinId, doc);

    return res.json({ ok: true, clockin: doc });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al ajustar fichaje' });
  }
}

// ─── Check-in / entries (API segura, sustituye escritura directa Couch) ───────

const VALID_ENTRY_TYPES = new Set(['clock_in', 'break_start', 'break_end', 'clock_out']);

async function resolveMemberStoreAssignment(req, business, memberUserId) {
  const member = getMember(business, memberUserId);
  let ref = memberEmploymentSalesPointRef(member, null);
  if (!ref) {
    try {
      const account = await findAccountByUserId(req, memberUserId);
      ref = memberEmploymentSalesPointRef(member, account);
    } catch {
      /* cuenta no encontrada */
    }
  }
  return {
    ref,
    role: String(member?.role || '').trim(),
  };
}

async function assertMemberCanClockAtStore(req, res, business, memberUserId, pdvId, workCenterId) {
  const sp = String(pdvId || '').trim();
  if (!sp) return true;
  const { ref, role } = await resolveMemberStoreAssignment(req, business, memberUserId);
  if (!isMemberAssignedToSalesPoint(business, memberUserId, sp, workCenterId, ref, role)) {
    res.status(403).json({
      ok: false,
      error: 'Este trabajador no está asignado a esta tienda',
    });
    return false;
  }
  return true;
}

export async function checkInMember(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const {
      memberId,
      memberName,
      sales_point_id: salesPointId,
      sales_point_name: salesPointName,
      work_center_id: workCenterId,
      device_type: deviceType,
      geo,
      store_team_clockin: storeTeamClockin,
    } = req.body || {};

    const targetMemberId = normalizeClockinUserId(memberId);
    if (!targetMemberId) return badRequest(res, 'Falta memberId');
    if (!isBusinessTeamMember(business, targetMemberId)) {
      return res.status(404).json({
        ok: false,
        error: 'Este trabajador no pertenece al equipo de esta empresa',
      });
    }

    const sp = String(salesPointId || '').trim();
    const isStoreTeamClockin = storeTeamClockin === true || storeTeamClockin === 'true';

    if (!canManageStoreClockin(business, requesterId, targetMemberId, {
      storeTeamClockin: isStoreTeamClockin,
      salesPointId: sp,
    })) {
      return res.status(403).json({ ok: false, error: 'No puedes fichar por otro trabajador' });
    }

    const wc = String(workCenterId || '').trim();
    if (!(await assertMemberCanClockAtStore(req, res, business, targetMemberId, sp, wc))) {
      return;
    }

    const vacationGate = await getApprovedVacationBlockingWork(req, businessId, targetMemberId);
    if (vacationGate.blocked) {
      return res.status(409).json({
        ok: false,
        error: vacationGate.message || 'No puedes fichar: tienes vacaciones o baja aprobadas hoy',
        code: 'VACATION_BLOCK',
      });
    }

    const date = calendarDayKeyMadrid();
    const now = new Date().toISOString();
    const clockinsDb = getClockinsDbName();
    await ensureDatabase(req, clockinsDb);

    const existingRecords = await listClockinsByBusiness(req, businessId);
    const openClockin = existingRecords.find((r) => {
      if (normalizeClockinUserId(r.member_id) !== targetMemberId) return false;
      return isOpenClockinRecord(r);
    });

    if (openClockin) {
      const openLocalDay = clockinLocalDayKey(openClockin);
      // Jornada de otro día (p. ej. sin finalizar anoche): cerrar y permitir fichar de nuevo.
      if (openLocalDay && openLocalDay < date) {
        await autoCloseOpenClockin(req, clockinsDb, openClockin, now);
      } else {
        const sp = String(salesPointId || '').trim();
        const spName = String(salesPointName || '').trim();
        const wc = String(workCenterId || '').trim();
        const existingSp = String(openClockin.sales_point_id || '').trim();
        let doc = openClockin;
        if (sp && !existingSp) {
          doc = {
            ...openClockin,
            sales_point_id: sp,
            sales_point_name: spName || openClockin.sales_point_name,
            updatedAt: now,
          };
          await putDocument(req, clockinsDb, openClockin._id, doc);
        } else if (sp && existingSp && !salesPointRefsSameStore(existingSp, sp, wc)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya tienes un fichaje activo hoy en otra tienda',
          });
        } else if (sp && existingSp && sp !== existingSp && salesPointRefsSameStore(existingSp, sp, wc)) {
          doc = {
            ...openClockin,
            sales_point_id: sp,
            sales_point_name: spName || openClockin.sales_point_name,
            updatedAt: now,
          };
          await putDocument(req, clockinsDb, openClockin._id, doc);
        }
        return res.json({ ok: true, clockin: doc, alreadyActive: true });
      }
    }

    const id = `clockin:${businessId}:${targetMemberId}:${date}:${Date.now()}`;
    const entry = { type: 'clock_in', time: now, geo: geo || undefined };
    const doc = {
      _id: id,
      type: 'clockin',
      business_id: businessId,
      member_id: targetMemberId,
      member_name: String(memberName || '').trim() || 'Trabajador',
      date,
      entries: [entry],
      totalMinutes: 0,
      breakMinutes: 0,
      status: 'active',
      notes: '',
      device_type: deviceType || undefined,
      geo: geo || undefined,
      sales_point_id: salesPointId ? String(salesPointId).trim() : undefined,
      sales_point_name: salesPointName ? String(salesPointName).trim() : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await putDocument(req, clockinsDb, id, doc);
    return res.status(201).json({ ok: true, clockin: doc });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al fichar entrada' });
  }
}

/** Estado de bloqueo por vacaciones/baja (fichaje, TPV, operativa). */
export async function getMemberWorkBlock(req, res) {
  try {
    const { businessId, memberId } = req.params;
    if (!businessId || !memberId) return badRequest(res, 'Faltan businessId o memberId');
    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    const gate = await getApprovedVacationBlockingWork(req, businessId, memberId);
    return res.json({
      ok: true,
      blocked: Boolean(gate.blocked),
      code: gate.code || null,
      message: gate.message || null,
      startDate: gate.vacation?.startDate || null,
      endDate: gate.vacation?.endDate || null,
      leaveType: gate.vacation?.leaveType || null,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al comprobar bloqueo' });
  }
}

/** Varios miembros (listado TPV). Query: ?memberIds=id1,id2 */
export async function getMembersWorkBlocks(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    const raw = String(req.query.memberIds || '').trim();
    const memberIds = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : (business.members || []).map((m) => m.user_id).filter(Boolean);
    const blocks = await getApprovedVacationBlockingWorkBatch(req, businessId, memberIds);
    return res.json({ ok: true, blocks });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al comprobar bloqueos' });
  }
}

export async function appendClockinEntry(req, res) {
  try {
    const { businessId, recordId } = req.params;
    if (!businessId || !recordId) return badRequest(res, 'Faltan parámetros');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const { entryType, geo, store_team_clockin: storeTeamClockin } = req.body || {};
    if (!VALID_ENTRY_TYPES.has(entryType) || entryType === 'clock_in') {
      return badRequest(res, 'entryType inválido');
    }

    const clockinsDb = getClockinsDbName();
    await ensureDatabase(req, clockinsDb);
    const doc = await getDocument(req, clockinsDb, recordId);
    if (!doc || doc.business_id !== businessId) {
      return res.status(404).json({ ok: false, error: 'Fichaje no encontrado' });
    }

    const isStoreTeamClockin = storeTeamClockin === true || storeTeamClockin === 'true';
    const sp = String(doc.sales_point_id || '').trim();

    if (!canManageStoreClockin(business, requesterId, doc.member_id, {
      storeTeamClockin: isStoreTeamClockin,
      salesPointId: sp,
    })) {
      return res.status(403).json({ ok: false, error: 'No puedes modificar este fichaje' });
    }

    if (sp && !(await assertMemberCanClockAtStore(req, res, business, doc.member_id, sp, ''))) {
      return;
    }

    // No reanudar jornada ni seguir operando si está de vacaciones/baja aprobada
    if (entryType === 'break_end' || entryType === 'break_start') {
      const vacationGate = await getApprovedVacationBlockingWork(req, businessId, doc.member_id);
      if (vacationGate.blocked) {
        return res.status(409).json({
          ok: false,
          error: vacationGate.message || 'No puedes operar: tienes vacaciones o baja aprobadas hoy',
          code: 'VACATION_BLOCK',
        });
      }
    }

    const now = new Date().toISOString();
    const entries = [...(doc.entries || []), { type: entryType, time: now, geo: geo || undefined }];
    const { totalMinutes, breakMinutes } = computeClockinMinutes(
      entries,
      doc.scheduled_start,
      doc.scheduled_end,
      doc.date,
    );
    const updated = {
      ...doc,
      entries,
      totalMinutes,
      breakMinutes,
      status: deriveClockinStatus(entries),
      updatedAt: now,
    };

    await putDocument(req, clockinsDb, recordId, updated);
    return res.json({ ok: true, clockin: updated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar fichaje' });
  }
}

// ─── Org hierarchy view: who reports to whom + their clock status ─────────────

export async function getOrgClockStatus(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const today = new Date().toISOString().slice(0, 10);
    const records = await listClockinsByBusiness(req, businessId);
    const todayRecords = records.filter((r) => r.date === today);

    const statusMap = {};
    for (const r of todayRecords) {
      statusMap[r.member_id] = {
        status: r.status,
        clock_in: r.entries?.find((e) => e.type === 'clock_in')?.time || null,
        clock_out: r.entries?.find((e) => e.type === 'clock_out')?.time || null,
        totalMinutes: r.totalMinutes,
      };
    }

    const memberMap = buildMemberMap(business);
    const nodes = (orgchart?.nodes || [])
      .filter((n) => n.data?.user_id && isMemberVisible(visibleIds, n.data.user_id))
      .map((n) => ({
        id: n.id,
        user_id: n.data.user_id,
        label: n.data.label || memberMap[n.data.user_id]?.fullName || '',
        role: n.data.role || memberMap[n.data.user_id]?.role || 'Usuario',
        clock: statusMap[n.data.user_id] || { status: 'offline', clock_in: null, clock_out: null, totalMinutes: 0 },
      }));

    const edges = (orgchart?.edges || []).filter((e) => {
      const sourceNode = orgchart.nodes?.find((n) => n.id === e.source);
      const targetNode = orgchart.nodes?.find((n) => n.id === e.target);
      return (
        sourceNode?.data?.user_id && isMemberVisible(visibleIds, sourceNode.data.user_id) &&
        targetNode?.data?.user_id && isMemberVisible(visibleIds, targetNode.data.user_id)
      );
    });

    return res.json({ ok: true, nodes, edges });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estado del organigrama' });
  }
}

// ─── Absenteeism report ───────────────────────────────────────────────────────

async function loadSchedulesForDateRange(req, businessId, from, to) {
  const db = getSchedulesDbName();
  try {
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    return docs.filter(
      (d) => d?.type === 'schedule' && d?.business_id === businessId && !d?.deletedAt,
    );
  } catch {
    return [];
  }
}

export async function getAbsenteeism(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !isManagerRole(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes y administradores pueden ver absentismo' });
    }

    const { from, to } = req.query;
    const fromDate = from || new Date().toISOString().slice(0, 10);
    const toDate = to || fromDate;

    const schedules = await loadSchedulesForDateRange(req, businessId, fromDate, toDate);
    let clockins = await listClockinsByBusiness(req, businessId);
    clockins = clockins.filter((r) => r.date >= fromDate && r.date <= toDate);
    const vacationDocs = await loadVacationDocs(req, businessId);

    const clockinsByDate = {};
    for (const c of clockins) {
      if (!clockinsByDate[c.date]) clockinsByDate[c.date] = {};
      clockinsByDate[c.date][c.member_id] = c;
    }

    const memberMap = buildMemberMap(business);
    const report = [];
    let totalExpected = 0;
    let totalAbsent = 0;

    const current = new Date(fromDate);
    const end = new Date(toDate);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const dayName = WEEKDAYS_MAP[current.getDay()];
      const dayRecords = clockinsByDate[dateStr] || {};
      const onLeave = buildWorkBlockedMemberIdSet(vacationDocs, businessId, dateStr);

      const expected = [];
      const present = [];
      const absent = [];
      const onLeaveList = [];

      for (const schedule of schedules) {
        const shift = schedule.weekly?.[dayName];
        if (!shift?.enabled) continue;

        const mid = schedule.member_id;
        const info = {
          member_id: mid,
          member_name: schedule.member_name || memberMap[mid]?.fullName || mid,
          scheduled_start: shift.start,
          scheduled_end: shift.end,
        };

        // Vacaciones/baja aprobadas: no cuentan como esperado ni como absentismo.
        if (onLeave.has(String(mid || '').trim())) {
          onLeaveList.push(info);
          continue;
        }

        expected.push(info);

        if (dayRecords[mid]) {
          const ci = dayRecords[mid].entries?.find((e) => e.type === 'clock_in');
          const co = dayRecords[mid].entries?.find((e) => e.type === 'clock_out');
          present.push({
            member_id: mid,
            member_name: info.member_name,
            clock_in: ci?.time || null,
            clock_out: co?.time || null,
          });
        } else {
          absent.push(info);
        }
      }

      totalExpected += expected.length;
      totalAbsent += absent.length;

      if (expected.length > 0 || onLeaveList.length > 0) {
        report.push({
          date: dateStr,
          expected,
          present,
          absent,
          onLeave: onLeaveList,
          rate: expected.length > 0 ? Math.round((absent.length / expected.length) * 10000) / 100 : 0,
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return res.json({
      ok: true,
      report,
      summary: {
        totalDays: report.length,
        totalExpected,
        totalPresent: totalExpected - totalAbsent,
        totalAbsent,
        overallRate: totalExpected > 0 ? Math.round((totalAbsent / totalExpected) * 10000) / 100 : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular absentismo' });
  }
}

// ─── Overtime report ──────────────────────────────────────────────────────────

export async function getOvertime(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const { from, to, memberId } = req.query;
    const fromDate = from || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    const schedules = await loadSchedulesForDateRange(req, businessId, fromDate, toDate);
    let clockins = await listClockinsByBusiness(req, businessId);
    clockins = clockins.filter(
      (r) => r.date >= fromDate && r.date <= toDate && isMemberVisible(visibleIds, r.member_id),
    );
    if (memberId) clockins = clockins.filter((r) => r.member_id === memberId);

    const schedulesByMember = {};
    for (const s of schedules) {
      schedulesByMember[s.member_id] = s;
    }

    const memberMap = buildMemberMap(business);
    const memberData = {};

    const current = new Date(fromDate);
    const end = new Date(toDate);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const dayName = WEEKDAYS_MAP[current.getDay()];
      const dayClockins = clockins.filter((r) => r.date === dateStr);

      for (const c of dayClockins) {
        const mid = c.member_id;
        if (!memberData[mid]) {
          memberData[mid] = {
            member_id: mid,
            member_name: c.member_name || memberMap[mid]?.fullName || mid,
            role: memberMap[mid]?.role || 'Usuario',
            period: { from: fromDate, to: toDate },
            scheduled_minutes: 0,
            worked_minutes: 0,
            overtime_minutes: 0,
            daily_breakdown: [],
          };
        }

        const schedule = schedulesByMember[mid];
        const shift = schedule?.weekly?.[dayName];
        let scheduledMinutes = 0;

        if (shift?.enabled) {
          const [sh, sm] = shift.start.split(':').map(Number);
          const [eh, em] = shift.end.split(':').map(Number);
          const [bsh, bsm] = (shift.breakStart || '13:00').split(':').map(Number);
          const [beh, bem] = (shift.breakEnd || '14:00').split(':').map(Number);
          const work = (eh * 60 + em) - (sh * 60 + sm);
          const brk = (beh * 60 + bem) - (bsh * 60 + bsm);
          scheduledMinutes = Math.max(0, work - Math.max(0, brk));
        }

        const worked = c.totalMinutes || 0;
        const overtime = Math.max(0, worked - scheduledMinutes);

        memberData[mid].scheduled_minutes += scheduledMinutes;
        memberData[mid].worked_minutes += worked;
        memberData[mid].overtime_minutes += overtime;
        memberData[mid].daily_breakdown.push({
          date: dateStr,
          scheduled: scheduledMinutes,
          worked,
          overtime,
        });
      }

      current.setDate(current.getDate() + 1);
    }

    const report = Object.values(memberData).sort((a, b) => b.overtime_minutes - a.overtime_minutes);

    return res.json({
      ok: true,
      report,
      summary: {
        totalOvertime: report.reduce((s, r) => s + r.overtime_minutes, 0),
        totalWorked: report.reduce((s, r) => s + r.worked_minutes, 0),
        totalScheduled: report.reduce((s, r) => s + r.scheduled_minutes, 0),
        membersWithOvertime: report.filter((r) => r.overtime_minutes > 0).length,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular horas extra' });
  }
}

// ─── Payroll summary ──────────────────────────────────────────────────────────

export async function getPayrollSummary(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !isManagerRole(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes y administradores pueden ver resumen de nóminas' });
    }

    const period = req.query.period;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return badRequest(res, 'Se requiere parámetro period (YYYY-MM)');
    }

    const [year, month] = period.split('-').map(Number);
    const fromDate = `${period}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${period}-${String(lastDay).padStart(2, '0')}`;

    const schedules = await loadSchedulesForDateRange(req, businessId, fromDate, toDate);
    let clockins = await listClockinsByBusiness(req, businessId);
    clockins = clockins.filter((r) => r.date >= fromDate && r.date <= toDate);
    const vacationDocs = await loadVacationDocs(req, businessId);

    const schedulesByMember = {};
    for (const s of schedules) schedulesByMember[s.member_id] = s;

    const memberMap = buildMemberMap(business);
    const memberIds = business.members.map((m) => m.user_id);
    const summaries = [];

    async function loadMemberEmployment(memberId) {
      try {
        const account = await findAccountByUserId(req, memberId);
        return account?.employment || {};
      } catch {
        return {};
      }
    }

    for (const mid of memberIds) {
      const memberClockins = clockins.filter((r) => r.member_id === mid);
      const schedule = schedulesByMember[mid];

      let totalWorked = 0;
      let totalBreak = 0;
      let totalOvertime = 0;
      let lateCount = 0;
      let totalLateMinutes = 0;
      const daysWorked = new Set();
      const daysScheduled = new Set();
      const dailyDetail = [];

      const current = new Date(fromDate);
      const end = new Date(toDate);
      while (current <= end) {
        const dateStr = current.toISOString().slice(0, 10);
        const dayName = WEEKDAYS_MAP[current.getDay()];
        const shift = schedule?.weekly?.[dayName];
        const onLeave = vacationDocs.some((v) =>
          isApprovedLeaveBlockingWorkDoc(v, businessId, mid, dateStr),
        );

        if (shift?.enabled && !onLeave) daysScheduled.add(dateStr);

        const clockin = memberClockins.find((r) => r.date === dateStr);
        if (clockin && !onLeave) {
          daysWorked.add(dateStr);
          const worked = clockin.totalMinutes || 0;
          const brk = clockin.breakMinutes || 0;
          totalWorked += worked;
          totalBreak += brk;

          let scheduledMinutes = 0;
          if (shift?.enabled) {
            const [sh, sm] = shift.start.split(':').map(Number);
            const [eh, em] = shift.end.split(':').map(Number);
            const [bsh, bsm] = (shift.breakStart || '13:00').split(':').map(Number);
            const [beh, bem] = (shift.breakEnd || '14:00').split(':').map(Number);
            scheduledMinutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - Math.max(0, (beh * 60 + bem) - (bsh * 60 + bsm)));
          }

          const overtime = Math.max(0, worked - scheduledMinutes);
          totalOvertime += overtime;

          let isLate = false;
          let lateMinutes = 0;
          const ciEntry = clockin.entries?.find((e) => e.type === 'clock_in');
          if (ciEntry && shift?.enabled) {
            const scheduledMs = new Date(`${dateStr}T${shift.start}:00`).getTime();
            const actualMs = new Date(ciEntry.time).getTime();
            lateMinutes = Math.round((actualMs - scheduledMs) / 60000);
            if (lateMinutes > 10) {
              isLate = true;
              lateCount++;
              totalLateMinutes += lateMinutes;
            }
          }

          const coEntry = clockin.entries?.find((e) => e.type === 'clock_out');
          dailyDetail.push({
            date: dateStr,
            clock_in: ciEntry?.time || null,
            clock_out: coEntry?.time || null,
            worked_minutes: worked,
            break_minutes: brk,
            overtime_minutes: overtime,
            is_late: isLate,
            late_minutes: Math.max(0, lateMinutes),
          });
        }

        current.setDate(current.getDate() + 1);
      }

      const employment = await loadMemberEmployment(mid);
      const laborCost = computePeriodLaborCost(employment, totalWorked);
      const monthlyBreakdown = computeLaborCostBreakdown(employment);

      summaries.push({
        member_id: mid,
        member_name: memberMap[mid]?.fullName || mid,
        role: memberMap[mid]?.role || 'Usuario',
        period,
        total_worked_minutes: totalWorked,
        total_break_minutes: totalBreak,
        total_overtime_minutes: totalOvertime,
        total_sessions: memberClockins.length,
        days_worked: daysWorked.size,
        days_absent: Math.max(0, daysScheduled.size - daysWorked.size),
        late_count: lateCount,
        total_late_minutes: totalLateMinutes,
        daily_detail: dailyDetail,
        labor_cost: laborCost ? {
          gross_monthly: monthlyBreakdown?.grossMonthly ?? null,
          social_security_monthly: monthlyBreakdown?.socialSecurityCost ?? null,
          total_monthly_employer: monthlyBreakdown?.totalMonthlyEmployerCost ?? null,
          hourly_employer_cost: monthlyBreakdown?.hourlyEmployerCost ?? null,
          worked_hours: laborCost.workedHours,
          actual_gross_cost: laborCost.actualGrossCost,
          actual_employer_cost: laborCost.actualEmployerCost,
          has_salary_data: Boolean(monthlyBreakdown),
          cost_currency: monthlyBreakdown?.costCurrency || 'EUR',
        } : {
          gross_monthly: null,
          social_security_monthly: null,
          total_monthly_employer: null,
          hourly_employer_cost: null,
          worked_hours: Math.round((totalWorked / 60) * 100) / 100,
          actual_gross_cost: null,
          actual_employer_cost: null,
          has_salary_data: false,
          cost_currency: 'EUR',
        },
      });
    }

    const teamLaborTotal = summaries.reduce(
      (sum, s) => sum + (s.labor_cost?.actual_employer_cost || 0),
      0,
    );

    return res.json({
      ok: true,
      summaries,
      team_labor_cost: {
        actual_employer_cost: Math.round(teamLaborTotal * 100) / 100,
        members_with_salary: summaries.filter((s) => s.labor_cost?.has_salary_data).length,
        members_total: summaries.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar resumen de nóminas' });
  }
}

// ─── Export clockins (CSV / JSON) ─────────────────────────────────────────────

export async function exportClockins(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const { from, to, memberId, format } = req.query;
    let records = await listClockinsByBusiness(req, businessId);
    records = records.filter((r) => isMemberVisible(visibleIds, r.member_id));
    if (from) records = records.filter((r) => r.date >= from);
    if (to) records = records.filter((r) => r.date <= to);
    if (memberId) records = records.filter((r) => r.member_id === memberId);

    const memberMap = buildMemberMap(business);

    if (format === 'csv') {
      const header = 'Fecha,Miembro,Rol,Entrada,Salida,Descanso (min),Trabajado (min),Estado\n';
      const rows = records.map((r) => {
        const ci = r.entries?.find((e) => e.type === 'clock_in');
        const co = r.entries?.find((e) => e.type === 'clock_out');
        const role = memberMap[r.member_id]?.role || 'Usuario';
        return `${r.date},"${r.member_name}","${role}",${ci?.time || ''},${co?.time || ''},${r.breakMinutes},${r.totalMinutes},${r.status}`;
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="fichajes_${from || 'all'}_${to || 'all'}.csv"`);
      return res.send(header + rows.join('\n'));
    }

    const enriched = records.map((r) => ({
      ...r,
      member_role: memberMap[r.member_id]?.role || 'Usuario',
    }));

    return res.json({ ok: true, records: enriched });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al exportar fichajes' });
  }
}

// ─── Cross-check: fichajes vs horarios vs vacaciones ─────────────────────────

function getVacationsDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'vertial';
  return `${prefix}-vacations`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function crossCheck(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !isManagerRole(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo Admin/Gerente puede ver cross-check' });
    }

    const { from, to } = req.query;
    if (!from || !to) return badRequest(res, 'Parámetros from y to requeridos');

    const [clockins, scheduleDocs, vacationDocs] = await Promise.all([
      listClockinsByBusiness(req, businessId),
      loadScheduleDocs(req, businessId),
      loadVacationDocs(req, businessId),
    ]);

    const rangeClockIns = clockins.filter((c) => c.date >= from && c.date <= to);
    const approvedVacations = vacationDocs.filter(
      (v) => v.type === 'vacation_request' && v.status === 'approved' && v.business_id === businessId,
    );
    const companyHolidays = scheduleDocs.filter(
      (d) => d.type === 'company_holiday' && d.business_id === businessId,
    );
    const schedules = scheduleDocs.filter(
      (d) => d.type === 'schedule' && d.business_id === businessId,
    );

    const anomalies = [];

    for (const c of rangeClockIns) {
      const vacOnDate = approvedVacations.find(
        (v) => v.member_id === c.member_id && c.date >= v.startDate && c.date <= v.endDate,
      );
      if (vacOnDate) {
        anomalies.push({
          type: 'clockin_during_vacation',
          member_id: c.member_id,
          member_name: c.member_name,
          date: c.date,
          detail: `Fichaje registrado pero tiene vacaciones aprobadas (${vacOnDate.startDate} → ${vacOnDate.endDate})`,
        });
      }

      const holidayMatch = companyHolidays.find((h) => {
        if (h.recurring) return h.date.slice(5) === c.date.slice(5);
        return h.date === c.date;
      });
      if (holidayMatch) {
        anomalies.push({
          type: 'clockin_on_holiday',
          member_id: c.member_id,
          member_name: c.member_name,
          date: c.date,
          detail: `Fichaje registrado en día festivo (${holidayMatch.name})`,
        });
      }
    }

    const dates = [];
    const cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    for (const schedule of schedules) {
      for (const date of dates) {
        const dayOfWeek = new Date(date + 'T00:00:00').getDay();
        const weekday = WEEKDAYS_MAP[dayOfWeek];
        const shift = schedule.weekly?.[weekday];
        if (!shift?.enabled) continue;

        const onVacation = approvedVacations.some(
          (v) => v.member_id === schedule.member_id && date >= v.startDate && date <= v.endDate,
        );
        if (onVacation) continue;

        const hasClockin = rangeClockIns.some(
          (c) => c.member_id === schedule.member_id && c.date === date,
        );
        if (!hasClockin) {
          anomalies.push({
            type: 'no_clockin_scheduled',
            member_id: schedule.member_id,
            member_name: schedule.member_name,
            date,
            detail: `Turno ${shift.start}-${shift.end} asignado pero no fichó`,
          });
        }
      }
    }

    return res.json({ ok: true, anomalies });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en cross-check' });
  }
}

async function loadScheduleDocs(req, businessId) {
  const db = getSchedulesDbName();
  try {
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    return docs.filter((d) => d?.business_id === businessId && !d?.deletedAt);
  } catch {
    return [];
  }
}

// ─── Resumen diario ────────────────────────────────────────────────────────────

/**
 * GET /api/clockins/:businessId/daily-summary?date=YYYY-MM-DD
 *
 * Devuelve un resumen del día solicitado (por defecto hoy en hora local del
 * servidor). Pensado para mostrar en el dashboard del gerente:
 *  - `scheduled`: trabajadores con turno asignado ese día
 *  - `clocked`: cuántos llegaron a fichar entrada
 *  - `noShow`: scheduled − clocked
 *  - `onTime` / `late` / `earlyEntry`: desglose de las entradas
 *  - `completed`: cuántos ya cerraron salida
 *  - `totalWorkedMinutes`: suma de minutos trabajados del día
 *  - `avgLateMinutes`: media de minutos de retraso entre los que llegaron tarde
 *
 * Respeta la visibilidad por orgchart: solo cuenta a la gente que el solicitante
 * puede ver según su rol y posición jerárquica.
 */
export async function getDailySummary(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const date = (req.query?.date ? String(req.query.date) : new Date().toISOString()).slice(0, 10);
    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);
    const memberMap = await enrichMemberMap(req, business);
    const vacationDocs = await loadVacationDocs(req, businessId);
    const onLeaveIds = buildWorkBlockedMemberIdSet(vacationDocs, businessId, date);

    // Trabajadores con turno habilitado para el día solicitado.
    const schedules = await loadScheduleDocs(req, businessId);
    const targetTime = new Date(`${date}T00:00:00`).getTime();
    const weekday = WEEKDAYS_BY_INDEX[new Date(`${date}T00:00:00`).getDay()];

    const scheduledByMember = new Map();
    for (const doc of schedules) {
      if (!isMemberVisible(visibleIds, doc.member_id)) continue;
      const ws = new Date(`${doc.week_start}T00:00:00`).getTime();
      if (Number.isNaN(ws) || ws > targetTime) continue;
      const existing = scheduledByMember.get(doc.member_id);
      if (!existing || ws > new Date(`${existing.week_start}T00:00:00`).getTime()) {
        scheduledByMember.set(doc.member_id, doc);
      }
    }
    const scheduledIds = [];
    for (const [memberId, doc] of scheduledByMember) {
      if (!doc.weekly?.[weekday]?.enabled) continue;
      // Vacaciones/baja: no cuentan como turno esperado ni como no-show.
      if (onLeaveIds.has(String(memberId || '').trim())) continue;
      scheduledIds.push(memberId);
    }

    // Fichajes del día (solo visibles).
    const allClockins = await listClockinsByBusiness(req, businessId);
    const dayClockins = allClockins.filter(
      (r) => r.date === date && isMemberVisible(visibleIds, r.member_id),
    );

    let onTime = 0;
    let late = 0;
    let earlyEntry = 0;
    let completed = 0;
    let totalWorkedMinutes = 0;
    let totalLateMinutes = 0;
    let lateCount = 0;
    const offenders = [];

    for (const rec of dayClockins) {
      if (onLeaveIds.has(String(rec.member_id || '').trim())) continue;
      const entry = (rec.entries || []).find((e) => e.type === 'clock_in');
      if (!entry) continue;
      const shift = scheduledByMember.get(rec.member_id)?.weekly?.[weekday];
      const scheduledMs = shift?.enabled ? scheduleTimeToEpoch(date, shift.start) : null;
      const actualMs = new Date(entry.time).getTime();
      const diffMin = scheduledMs ? Math.round((actualMs - scheduledMs) / 60000) : 0;

      if (scheduledMs && diffMin <= -CLOCKIN_THRESHOLDS_MIN.EARLY_ENTRY) {
        earlyEntry += 1;
      } else if (diffMin >= CLOCKIN_THRESHOLDS_MIN.LATE) {
        late += 1;
        totalLateMinutes += diffMin;
        lateCount += 1;
        offenders.push({
          memberId: rec.member_id,
          memberName: resolveMemberLabel(memberMap, rec.member_id, rec.member_name),
          lateMinutes: diffMin,
        });
      } else {
        onTime += 1;
      }

      if (rec.status === 'completed') completed += 1;
      totalWorkedMinutes += rec.totalMinutes || 0;
    }

    const clockedIds = new Set(
      dayClockins
        .filter((r) => !onLeaveIds.has(String(r.member_id || '').trim()))
        .map((r) => r.member_id),
    );
    const noShow = scheduledIds.filter((id) => !clockedIds.has(id));

    return res.json({
      ok: true,
      date,
      scheduled: scheduledIds.length,
      clocked: clockedIds.size,
      onLeave: onLeaveIds.size,
      noShow: noShow.length,
      noShowMembers: noShow.map((id) => ({
        memberId: id,
        memberName: resolveMemberLabel(memberMap, id),
        role: memberMap[id]?.role || '',
      })),
      onTime,
      late,
      earlyEntry,
      completed,
      totalWorkedMinutes,
      avgLateMinutes: lateCount > 0 ? Math.round(totalLateMinutes / lateCount) : 0,
      lateMembers: offenders
        .sort((a, b) => b.lateMinutes - a.lateMinutes)
        .slice(0, 5),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error generando el resumen diario',
    });
  }
}

// ─── Clockin notifications: notify managers when a worker clocks ──────────────

/**
 * Umbrales (en minutos) que disparan las reglas de horario.
 *
 * - LATE: entrada después del inicio del turno → warning "llegó tarde"
 * - EARLY_ENTRY: entrada mucho antes del turno → info de aviso
 * - EARLY_EXIT: salida antes de fin de turno → warning "se fue antes"
 * - LATE_EXIT: salida muy posterior al fin de turno → info (horas extra)
 * - LONG_BREAK: duración del descanso > previsto + margen → warning
 *
 * Si no hay schedule asignado al trabajador, ninguna de estas reglas se aplica
 * y la notificación se emite como info neutra.
 */
const CLOCKIN_THRESHOLDS_MIN = {
  LATE: 5,
  EARLY_ENTRY: 30,
  EARLY_EXIT: 10,
  LATE_EXIT: 30,
  LONG_BREAK: 15,
};

const CLOCKIN_EVENT_LABELS = {
  clock_in: { verb: 'fichó entrada' },
  clock_out: { verb: 'fichó salida' },
  break_start: { verb: 'inició un descanso' },
  break_end: { verb: 'volvió del descanso' },
};

/** Convierte una hora "HH:MM" + fecha YYYY-MM-DD en ms epoch hora local. */
function scheduleTimeToEpoch(date, timeHHMM) {
  if (!date || !timeHHMM) return null;
  const [h, m] = String(timeHHMM).split(':').map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const dt = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  return dt.getTime();
}

const WEEKDAYS_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Devuelve el turno asignado al trabajador para la fecha del fichaje, leyendo
 * el documento de schedule que cubra esa semana. Devuelve null si no hay turno
 * (libre, sin schedule, día sin enabled, etc.).
 */
async function getMemberShiftForDate(req, businessId, memberId, isoDate) {
  if (!isoDate) return null;
  const docs = await loadScheduleDocs(req, businessId);
  if (!docs.length) return null;
  const target = String(isoDate).slice(0, 10);
  const sameMember = docs.filter((d) => d.member_id === memberId);
  if (!sameMember.length) return null;

  // Elegimos el schedule cuyo week_start es el lunes ≤ target más reciente.
  const targetTime = new Date(`${target}T00:00:00`).getTime();
  let candidate = null;
  for (const d of sameMember) {
    const ws = new Date(`${d.week_start}T00:00:00`).getTime();
    if (Number.isNaN(ws) || ws > targetTime) continue;
    if (!candidate || ws > new Date(`${candidate.week_start}T00:00:00`).getTime()) {
      candidate = d;
    }
  }
  if (!candidate) return null;

  const weekday = WEEKDAYS_BY_INDEX[new Date(`${target}T00:00:00`).getDay()];
  const shift = candidate.weekly?.[weekday];
  if (!shift?.enabled) return null;
  return shift;
}

/** Formatea un timestamp ISO como HH:MM en hora local (es-ES). */
function formatTimeEs(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

/** Convierte minutos en cadena legible: 65 → "1h 05m". */
function formatMinutesEs(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Mapea un `flag` (sub-evento producido por las reglas de horario) a la clave
 * de preferencia personal que decide si debe llegar al gerente. Si el gerente
 * tiene la categoría desactivada, no recibe la notificación.
 *
 * Defaults a `true` si el flag no está mapeado (más vale notificar que perder
 * eventos importantes).
 */
function shouldNotifyForFlag(flag, clockinPrefs) {
  if (!clockinPrefs || typeof clockinPrefs !== 'object') return true;
  switch (flag) {
    case 'clock_in':
      return clockinPrefs.onEntry !== false;
    case 'clock_in_late':
      return clockinPrefs.onLate !== false;
    case 'clock_in_early':
      return clockinPrefs.onEarlyEntry === true;
    case 'clock_out':
    case 'clock_out_late':
      return clockinPrefs.onExit !== false;
    case 'clock_out_early':
      return clockinPrefs.onEarlyExit !== false;
    case 'break_start':
    case 'break_end':
      return clockinPrefs.onBreaks === true;
    case 'break_long':
      return clockinPrefs.onLongBreak !== false;
    default:
      return true;
  }
}

/**
 * Resuelve a quién hay que avisar cuando un trabajador ficha:
 * Admin/Gerente del negocio + el owner (excluyendo al propio fichador).
 * Devuelve una lista única de user_ids.
 */
function resolveClockinNotificationRecipients(business, memberId) {
  const recipients = new Set();
  if (business?.owner_user_id && business.owner_user_id !== memberId) {
    recipients.add(business.owner_user_id);
  }
  for (const m of business?.members || []) {
    if (!m.user_id || m.user_id === memberId) continue;
    if (isManagerRole(m.role)) recipients.add(m.user_id);
  }
  return Array.from(recipients);
}

/**
 * Endpoint POST /api/clockins/:businessId/notify
 *
 * Body: { memberId, memberName, eventType, time, device?, lateMinutes?, workedMinutes? }
 *
 * Notifica al equipo de gestión (Admin/Gerente + owner) que un trabajador ha
 * fichado. Si la entrada llega tarde se eleva el nivel a `warning`. La salida
 * lleva los minutos trabajados. El descanso y la vuelta de descanso son `info`
 * discretos. Cada notificación enlaza al detalle del trabajador en la pestaña
 * de fichajes para que el gerente pueda revisar.
 */
export async function notifyClockinEvent(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = getAuthUserId(req);
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const {
      memberId,
      memberName,
      eventType,
      time,
      device = '',
      lateMinutes = 0,
      workedMinutes = 0,
      hasGeo = false,
    } = req.body || {};

    if (!memberId || !eventType) {
      return badRequest(res, 'memberId y eventType son obligatorios');
    }
    if (!CLOCKIN_EVENT_LABELS[eventType]) {
      return badRequest(res, 'eventType inválido');
    }
    // Solo el propio trabajador puede emitir su evento de fichaje.
    if (memberId !== requesterId) {
      return res.status(403).json({ ok: false, error: 'Solo puedes notificar tus propios fichajes.' });
    }

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    // El trabajador tiene que ser miembro del business.
    const member = getMember(business, memberId);
    if (!member) {
      return res.status(403).json({ ok: false, error: 'No eres miembro de este equipo.' });
    }

    const recipients = resolveClockinNotificationRecipients(business, memberId);
    if (recipients.length === 0) {
      return res.json({ ok: true, recipients: 0 });
    }

    const displayName = String(memberName || member.fullName || 'Un trabajador').trim();
    const eventTime = time || new Date().toISOString();
    const displayTime = formatTimeEs(eventTime) || formatTimeEs(new Date().toISOString());
    const labels = CLOCKIN_EVENT_LABELS[eventType];
    const isoDate = String(eventTime).slice(0, 10);
    const shift = await getMemberShiftForDate(req, businessId, memberId, isoDate);

    // ── Aplicar reglas de horario ────────────────────────────────────────────
    // `flag` identifica la sub-regla disparada y sirve para filtrar destinatarios
    // según las preferencias del gerente (entradas tarde, descansos largos, etc.)
    let level = 'info';
    let title = `${displayName} ${labels.verb}`;
    let message = `Registrado a las ${displayTime}.`;
    let flag = eventType;

    if (eventType === 'clock_in') {
      const actualMs = new Date(eventTime).getTime();
      const scheduledMs = shift ? scheduleTimeToEpoch(isoDate, shift.start) : null;
      const diffMin = scheduledMs ? Math.round((actualMs - scheduledMs) / 60000) : 0;

      // Si el cliente envía lateMinutes lo respetamos; si no, lo derivamos.
      const reportedLate = Math.max(0, Math.round(Number(lateMinutes) || 0));
      const effectiveLate = reportedLate || Math.max(0, diffMin);

      if (effectiveLate >= CLOCKIN_THRESHOLDS_MIN.LATE) {
        flag = 'clock_in_late';
        level = 'warning';
        title = `${displayName} llegó tarde`;
        message = `Fichó entrada a las ${displayTime} (${effectiveLate} min de retraso).`;
      } else if (scheduledMs && diffMin <= -CLOCKIN_THRESHOLDS_MIN.EARLY_ENTRY) {
        flag = 'clock_in_early';
        title = `${displayName} fichó entrada anticipada`;
        message = `Entró ${Math.abs(diffMin)} min antes del turno (${displayTime}).`;
      } else {
        title = `${displayName} fichó entrada`;
        message = `Fichaje de entrada registrado a las ${displayTime}.`;
      }
    } else if (eventType === 'clock_out') {
      const actualMs = new Date(eventTime).getTime();
      const scheduledMs = shift ? scheduleTimeToEpoch(isoDate, shift.end) : null;
      const diffMin = scheduledMs ? Math.round((actualMs - scheduledMs) / 60000) : 0;
      const worked = Math.max(0, Math.round(Number(workedMinutes) || 0));
      const workedTail = worked > 0 ? ` · ${formatMinutesEs(worked)} trabajadas` : '';

      if (scheduledMs && diffMin <= -CLOCKIN_THRESHOLDS_MIN.EARLY_EXIT) {
        flag = 'clock_out_early';
        level = 'warning';
        title = `${displayName} salió antes`;
        message = `Fichó salida ${Math.abs(diffMin)} min antes del turno (${displayTime})${workedTail}.`;
      } else if (scheduledMs && diffMin >= CLOCKIN_THRESHOLDS_MIN.LATE_EXIT) {
        flag = 'clock_out_late';
        level = 'success';
        title = `${displayName} terminó tarde`;
        message = `Salió ${diffMin} min después del turno (${displayTime})${workedTail}.`;
      } else {
        flag = 'clock_out';
        level = 'success';
        title = `${displayName} fichó salida`;
        message = `Fichó salida a las ${displayTime}${workedTail}.`;
      }
    } else if (eventType === 'break_start') {
      flag = 'break_start';
      title = `${displayName} inició un descanso`;
      message = `Pausa iniciada a las ${displayTime}.`;
    } else if (eventType === 'break_end') {
      const breakMin = Math.max(0, Math.round(Number(req.body?.breakMinutes) || 0));
      const expected = (() => {
        if (!shift?.breakStart || !shift?.breakEnd) return 0;
        const s = scheduleTimeToEpoch(isoDate, shift.breakStart);
        const e = scheduleTimeToEpoch(isoDate, shift.breakEnd);
        if (!s || !e || e < s) return 0;
        return Math.round((e - s) / 60000);
      })();
      const tolerance = expected > 0 ? expected + CLOCKIN_THRESHOLDS_MIN.LONG_BREAK : 60 + CLOCKIN_THRESHOLDS_MIN.LONG_BREAK;
      if (breakMin > 0 && breakMin > tolerance) {
        flag = 'break_long';
        level = 'warning';
        title = `${displayName} hizo un descanso largo`;
        message = `Descanso de ${formatMinutesEs(breakMin)} (volvió a las ${displayTime}).`;
      } else {
        flag = 'break_end';
        title = `${displayName} volvió del descanso`;
        const tail = breakMin > 0 ? ` tras ${formatMinutesEs(breakMin)}` : '';
        message = `De vuelta a las ${displayTime}${tail}.`;
      }
    }

    const route = `/saas/clockins?memberId=${encodeURIComponent(memberId)}`;
    const metadata = {
      businessId,
      memberId,
      memberName: displayName,
      eventType,
      flag,
      time: eventTime,
      device: device || '',
      hasGeo: Boolean(hasGeo),
      lateMinutes: Math.max(0, Math.round(Number(lateMinutes) || 0)),
      workedMinutes: Math.max(0, Math.round(Number(workedMinutes) || 0)),
    };

    // Filtrar destinatarios según sus preferencias personales.
    // Cada gerente decide si quiere recibir cada categoría: entradas, retrasos,
    // entradas anticipadas, salidas (puntual o tardía), salidas anticipadas,
    // descansos normales o descansos largos.
    const filteredRecipients = [];
    for (const userId of recipients) {
      try {
        const account = await findAccountByUserId(req, userId);
        const prefs = normalizeNotificationPreferences(account?.notificationPreferences).clockin;
        if (shouldNotifyForFlag(flag, prefs)) {
          filteredRecipients.push(userId);
        }
      } catch (prefErr) {
        // Si no se puede leer la preferencia (cuenta corrupta, BD caída) seguimos
        // notificando para no perder eventos importantes.
        console.warn('[Clockin notify] no se pudieron leer preferencias de', userId, prefErr?.message);
        filteredRecipients.push(userId);
      }
    }

    let createdCount = 0;
    for (const userId of filteredRecipients) {
      try {
        const doc = buildNotificationDocument({
          userId,
          level,
          category: 'clockin',
          title,
          message,
          entityId: memberId,
          entityType: 'team',
          route,
          metadata,
          read: false,
        });
        const saved = await saveNotification(req, doc);
        const sanitized = sanitizeNotification(saved);
        try {
          broadcastToUser(userId, 'notification', sanitized);
        } catch (sseErr) {
          console.warn('[Clockin notify] SSE error:', sseErr?.message);
        }
        sendPushToUser(req, userId, {
          title: sanitized.title,
          body: sanitized.message,
          data: { route: sanitized.route, notificationId: sanitized.id },
        }).catch((pushErr) => console.warn('[Clockin notify] Push error:', pushErr?.message));
        createdCount += 1;
      } catch (notifyErr) {
        console.error('[Clockin notify] error creando notificación:', notifyErr?.message);
      }
    }

    return res.json({ ok: true, recipients: createdCount });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error notificando fichaje',
    });
  }
}

async function loadVacationDocs(req, businessId) {
  const db = getVacationsDbName();
  try {
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    return docs.filter((d) => d?.business_id === businessId && !d?.deletedAt);
  } catch {
    return [];
  }
}
