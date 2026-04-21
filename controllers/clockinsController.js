import {
  getClockinsDbName,
  getSalesDbName,
  listClockinsByBusiness,
  listSalesByUser,
  findBusinessById,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  BUSINESSES_DB,
} from '../services/couchdb.js';

const WEEKDAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getSchedulesDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'udar';
  return `${prefix}-schedules`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['Admin', 'Gerente']);

function getMember(business, userId) {
  if (!business?.members) return null;
  return business.members.find((m) => m.user_id === userId) || null;
}

function getSubordinateIds(business, orgchart, userId) {
  if (!orgchart?.nodes?.length || !orgchart?.edges?.length) return null;

  const userNode = orgchart.nodes.find(
    (n) => n.data?.user_id === userId,
  );
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

async function resolveVisibleMemberIds(req, business, orgchart, requesterId) {
  const member = getMember(business, requesterId);
  if (!member) return [];

  if (ADMIN_ROLES.has(member.role)) {
    return business.members.map((m) => m.user_id);
  }

  const subordinateIds = getSubordinateIds(business, orgchart, requesterId);
  if (subordinateIds && subordinateIds.length > 0) {
    return [requesterId, ...subordinateIds];
  }

  return [requesterId];
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
  return map;
}

// ─── List clockins (role-aware) ───────────────────────────────────────────────

export async function listClockins(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    let records = await listClockinsByBusiness(req, businessId);

    if (req.query.date) {
      records = records.filter((r) => r.date === req.query.date);
    }
    if (req.query.memberId) {
      records = records.filter((r) => r.member_id === req.query.memberId);
    }

    records = records.filter((r) => visibleIds.includes(r.member_id));

    const memberMap = buildMemberMap(business);
    const enriched = records.map((r) => ({
      ...r,
      member_role: memberMap[r.member_id]?.role || 'Usuario',
      member_email: memberMap[r.member_id]?.email || '',
    }));

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

    const requesterId = req.authUser?.user_id;
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
          visibleIds.includes(r.member_id),
      );

    const memberMap = buildMemberMap(business);
    const enriched = active.map((r) => ({
      member_id: r.member_id,
      member_name: r.member_name,
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

    const requesterId = req.authUser?.user_id;
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const { from, to, period } = req.query;
    let records = await listClockinsByBusiness(req, businessId);
    records = records.filter((r) => visibleIds.includes(r.member_id));

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

    const requesterId = req.authUser?.user_id;
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
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

// ─── Adjust clockin entry (managers only) ─────────────────────────────────────

export async function adjustClockinEntry(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
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

// ─── Org hierarchy view: who reports to whom + their clock status ─────────────

export async function getOrgClockStatus(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
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
      .filter((n) => n.data?.user_id && visibleIds.includes(n.data.user_id))
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
        sourceNode?.data?.user_id && visibleIds.includes(sourceNode.data.user_id) &&
        targetNode?.data?.user_id && visibleIds.includes(targetNode.data.user_id)
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

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo gerentes y administradores pueden ver absentismo' });
    }

    const { from, to } = req.query;
    const fromDate = from || new Date().toISOString().slice(0, 10);
    const toDate = to || fromDate;

    const schedules = await loadSchedulesForDateRange(req, businessId, fromDate, toDate);
    let clockins = await listClockinsByBusiness(req, businessId);
    clockins = clockins.filter((r) => r.date >= fromDate && r.date <= toDate);

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

      const expected = [];
      const present = [];
      const absent = [];

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

      if (expected.length > 0) {
        report.push({
          date: dateStr,
          expected,
          present,
          absent,
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

    const requesterId = req.authUser?.user_id;
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
      (r) => r.date >= fromDate && r.date <= toDate && visibleIds.includes(r.member_id),
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

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
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

    const schedulesByMember = {};
    for (const s of schedules) schedulesByMember[s.member_id] = s;

    const memberMap = buildMemberMap(business);
    const memberIds = business.members.map((m) => m.user_id);
    const summaries = [];

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

        if (shift?.enabled) daysScheduled.add(dateStr);

        const clockin = memberClockins.find((r) => r.date === dateStr);
        if (clockin) {
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
      });
    }

    return res.json({ ok: true, summaries });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar resumen de nóminas' });
  }
}

// ─── Export clockins (CSV / JSON) ─────────────────────────────────────────────

export async function exportClockins(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const { from, to, memberId, format } = req.query;
    let records = await listClockinsByBusiness(req, businessId);
    records = records.filter((r) => visibleIds.includes(r.member_id));
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
  const prefix = process.env.VITE_COUCHDB_DB || 'udar';
  return `${prefix}-vacations`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function crossCheck(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
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
