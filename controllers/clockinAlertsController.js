import {
  getClockinsDbName,
  listClockinsByBusiness,
  findBusinessById,
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  BUSINESSES_DB,
} from '../services/couchdb.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['Admin', 'Gerente']);
const WEEKDAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DEFAULT_CONFIG = {
  late_tolerance_minutes: 10,
  max_daily_minutes: 600,
  overtime_weekly_minutes: 2400,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAlertsDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'udar';
  return `${prefix}-clockin-alerts`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

function getSchedulesDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'udar';
  return `${prefix}-schedules`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

function getMember(business, userId) {
  if (!business?.members) return null;
  return business.members.find((m) => m.user_id === userId) || null;
}

function getSubordinateIds(business, orgchart, userId) {
  if (!orgchart?.nodes?.length || !orgchart?.edges?.length) return null;
  const userNode = orgchart.nodes.find((n) => n.data?.user_id === userId);
  if (!userNode) return null;
  const collected = new Set();
  const queue = [userNode.id];
  while (queue.length) {
    const current = queue.shift();
    const children = orgchart.edges.filter((e) => e.source === current).map((e) => e.target);
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
  if (ADMIN_ROLES.has(member.role)) return business.members.map((m) => m.user_id);
  const subordinateIds = getSubordinateIds(business, orgchart, requesterId);
  if (subordinateIds && subordinateIds.length > 0) return [requesterId, ...subordinateIds];
  return [requesterId];
}

async function loadOrgChart(req, businessId) {
  try {
    await ensureDatabase(req, BUSINESSES_DB);
    return await getDocument(req, BUSINESSES_DB, `orgchart:${businessId}`);
  } catch { return null; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function parseSchedMs(dateStr, timeHHMM) {
  const [h, m] = timeHHMM.split(':').map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
}

// ─── Load schedules for a given date ──────────────────────────────────────────

async function loadSchedulesForDate(req, businessId, dateStr) {
  const db = getSchedulesDbName();
  try {
    await ensureDatabase(req, db);
    const docs = await getAllDocuments(req, db);
    const schedules = docs.filter(
      (d) => d?.type === 'schedule' && d?.business_id === businessId && !d?.deletedAt,
    );

    const date = new Date(dateStr);
    const dayName = WEEKDAYS_MAP[date.getDay()];
    const result = {};

    for (const schedule of schedules) {
      const shift = schedule.weekly?.[dayName];
      if (shift?.enabled) {
        result[schedule.member_id] = {
          member_id: schedule.member_id,
          member_name: schedule.member_name,
          start: shift.start,
          end: shift.end,
          breakStart: shift.breakStart,
          breakEnd: shift.breakEnd,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ─── Generate alerts ──────────────────────────────────────────────────────────

export async function generateAlerts(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo administradores y gerentes pueden generar alertas' });
    }

    const date = req.query.date || todayStr();
    const config = business.clockin_config || DEFAULT_CONFIG;
    const lateTolerance = config.late_tolerance_minutes || DEFAULT_CONFIG.late_tolerance_minutes;
    const maxDailyMinutes = config.max_daily_minutes || DEFAULT_CONFIG.max_daily_minutes;

    const schedules = await loadSchedulesForDate(req, businessId, date);
    const clockins = (await listClockinsByBusiness(req, businessId)).filter((r) => r.date === date);

    const clockinsByMember = {};
    for (const c of clockins) {
      clockinsByMember[c.member_id] = c;
    }

    const alertsDb = getAlertsDbName();
    await ensureDatabase(req, alertsDb);

    const existingAlerts = await getAllDocuments(req, alertsDb);
    const existingMap = {};
    for (const a of existingAlerts) {
      if (a?.type === 'clockin_alert' && a?.business_id === businessId && a?.date === date) {
        existingMap[`${a.alert_type}:${a.member_id}`] = a;
      }
    }

    const now = new Date().toISOString();
    const nowMs = Date.now();
    const generated = [];

    for (const [memberId, schedule] of Object.entries(schedules)) {
      const clockin = clockinsByMember[memberId];
      const memberName = schedule.member_name || business.members?.find((m) => m.user_id === memberId)?.fullName || memberId;

      // Alert: no_clockin — should have clocked in but hasn't
      if (!clockin) {
        const scheduledStartMs = parseSchedMs(date, schedule.start);
        const toleranceMs = (lateTolerance + 5) * 60000;
        if (nowMs > scheduledStartMs + toleranceMs) {
          const key = `no_clockin:${memberId}`;
          if (!existingMap[key] || existingMap[key].status === 'resolved') {
            const alertId = `alert:${businessId}:no_clockin:${memberId}:${date}`;
            const alert = {
              _id: alertId,
              ...(existingMap[key]?._rev ? { _rev: existingMap[key]._rev } : {}),
              type: 'clockin_alert',
              business_id: businessId,
              member_id: memberId,
              member_name: memberName,
              alert_type: 'no_clockin',
              severity: 'critical',
              date,
              details: {
                scheduled_start: schedule.start,
                scheduled_end: schedule.end,
              },
              status: 'active',
              createdAt: existingMap[key]?.createdAt || now,
              updatedAt: now,
            };
            await putDocument(req, alertsDb, alertId, alert);
            generated.push(alert);
          }
        }
      }

      if (clockin) {
        const clockInEntry = clockin.entries?.find((e) => e.type === 'clock_in');

        // Alert: late
        if (clockInEntry && schedule.start) {
          const scheduledStartMs = parseSchedMs(date, schedule.start);
          const actualStartMs = new Date(clockInEntry.time).getTime();
          const delayMinutes = Math.round((actualStartMs - scheduledStartMs) / 60000);

          if (delayMinutes > lateTolerance) {
            const key = `late:${memberId}`;
            if (!existingMap[key] || existingMap[key].status === 'resolved') {
              const alertId = `alert:${businessId}:late:${memberId}:${date}`;
              const alert = {
                _id: alertId,
                ...(existingMap[key]?._rev ? { _rev: existingMap[key]._rev } : {}),
                type: 'clockin_alert',
                business_id: businessId,
                member_id: memberId,
                member_name: memberName,
                alert_type: 'late',
                severity: delayMinutes > 30 ? 'critical' : 'warning',
                date,
                details: {
                  scheduled_start: schedule.start,
                  actual_start: clockInEntry.time,
                  delay_minutes: delayMinutes,
                },
                status: 'active',
                createdAt: existingMap[key]?.createdAt || now,
                updatedAt: now,
              };
              await putDocument(req, alertsDb, alertId, alert);
              generated.push(alert);
            }
          }
        }

        // Alert: excess_hours
        if (clockin.totalMinutes > maxDailyMinutes) {
          const key = `excess_hours:${memberId}`;
          if (!existingMap[key] || existingMap[key].status === 'resolved') {
            const alertId = `alert:${businessId}:excess_hours:${memberId}:${date}`;
            const alert = {
              _id: alertId,
              ...(existingMap[key]?._rev ? { _rev: existingMap[key]._rev } : {}),
              type: 'clockin_alert',
              business_id: businessId,
              member_id: memberId,
              member_name: memberName,
              alert_type: 'excess_hours',
              severity: 'warning',
              date,
              details: {
                worked_minutes: clockin.totalMinutes,
                max_minutes: maxDailyMinutes,
              },
              status: 'active',
              createdAt: existingMap[key]?.createdAt || now,
              updatedAt: now,
            };
            await putDocument(req, alertsDb, alertId, alert);
            generated.push(alert);
          }
        }
      }
    }

    // Alert: incomplete — clockins from previous days that are still active
    const allClockins = await listClockinsByBusiness(req, businessId);
    const incompleteClockins = allClockins.filter(
      (r) => r.date < date && (r.status === 'active' || r.status === 'break'),
    );

    for (const inc of incompleteClockins) {
      const key = `incomplete:${inc.member_id}`;
      const dateKey = inc.date;
      const existingInc = existingAlerts.find(
        (a) =>
          a?.type === 'clockin_alert' &&
          a?.business_id === businessId &&
          a?.alert_type === 'incomplete' &&
          a?.member_id === inc.member_id &&
          a?.date === dateKey,
      );

      if (!existingInc || existingInc.status === 'resolved') {
        const memberName = inc.member_name || business.members?.find((m) => m.user_id === inc.member_id)?.fullName || inc.member_id;
        const alertId = `alert:${businessId}:incomplete:${inc.member_id}:${dateKey}`;
        const alert = {
          _id: alertId,
          ...(existingInc?._rev ? { _rev: existingInc._rev } : {}),
          type: 'clockin_alert',
          business_id: businessId,
          member_id: inc.member_id,
          member_name: memberName,
          alert_type: 'incomplete',
          severity: 'critical',
          date: dateKey,
          details: {
            missing_entry: 'clock_out',
            clockin_id: inc._id,
          },
          status: 'active',
          createdAt: existingInc?.createdAt || now,
          updatedAt: now,
        };
        await putDocument(req, alertsDb, alertId, alert);
        generated.push(alert);
      }
    }

    return res.json({ ok: true, generated: generated.length, alerts: generated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar alertas' });
  }
}

// ─── List alerts ──────────────────────────────────────────────────────────────

export async function listAlerts(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const alertsDb = getAlertsDbName();
    await ensureDatabase(req, alertsDb);
    const docs = await getAllDocuments(req, alertsDb);

    let alerts = docs.filter(
      (d) =>
        d?.type === 'clockin_alert' &&
        d?.business_id === businessId &&
        visibleIds.includes(d?.member_id),
    );

    if (req.query.date) alerts = alerts.filter((a) => a.date === req.query.date);
    if (req.query.alert_type) alerts = alerts.filter((a) => a.alert_type === req.query.alert_type);
    if (req.query.status) alerts = alerts.filter((a) => a.status === req.query.status);
    if (req.query.from) alerts = alerts.filter((a) => a.date >= req.query.from);
    if (req.query.to) alerts = alerts.filter((a) => a.date <= req.query.to);

    alerts.sort((a, b) => {
      const sev = { critical: 0, warning: 1 };
      const diff = (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2);
      if (diff !== 0) return diff;
      return b.date.localeCompare(a.date) || a.member_name.localeCompare(b.member_name);
    });

    return res.json({ ok: true, alerts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar alertas' });
  }
}

// ─── Alerts summary (counts) ─────────────────────────────────────────────────

export async function getAlertsSummary(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const orgchart = await loadOrgChart(req, businessId);
    const visibleIds = await resolveVisibleMemberIds(req, business, orgchart, requesterId);

    const alertsDb = getAlertsDbName();
    await ensureDatabase(req, alertsDb);
    const docs = await getAllDocuments(req, alertsDb);

    const date = req.query.date || todayStr();

    const alerts = docs.filter(
      (d) =>
        d?.type === 'clockin_alert' &&
        d?.business_id === businessId &&
        d?.status === 'active' &&
        visibleIds.includes(d?.member_id) &&
        d?.date === date,
    );

    const summary = {
      total: alerts.length,
      no_clockin: alerts.filter((a) => a.alert_type === 'no_clockin').length,
      late: alerts.filter((a) => a.alert_type === 'late').length,
      excess_hours: alerts.filter((a) => a.alert_type === 'excess_hours').length,
      incomplete: alerts.filter((a) => a.alert_type === 'incomplete').length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
    };

    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen' });
  }
}

// ─── Acknowledge alert ────────────────────────────────────────────────────────

export async function acknowledgeAlert(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const requesterId = req.authUser?.user_id;
    if (!requesterId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const member = getMember(business, requesterId);
    if (!member || !ADMIN_ROLES.has(member.role)) {
      return res.status(403).json({ ok: false, error: 'Solo administradores y gerentes pueden gestionar alertas' });
    }

    const { alertId, action } = req.body;
    if (!alertId) return badRequest(res, 'Falta alertId');

    const alertsDb = getAlertsDbName();
    await ensureDatabase(req, alertsDb);

    const doc = await getDocument(req, alertsDb, alertId);
    if (!doc || doc.business_id !== businessId) {
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    }

    const newStatus = action === 'resolve' ? 'resolved' : 'acknowledged';
    doc.status = newStatus;
    doc.acknowledged_by = requesterId;
    doc.updatedAt = new Date().toISOString();

    await putDocument(req, alertsDb, alertId, doc);

    return res.json({ ok: true, alert: doc });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar alerta' });
  }
}
