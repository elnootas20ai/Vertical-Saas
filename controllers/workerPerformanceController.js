import {
  getSalesDbName,
  getLeadsDbName,
  getClockinsDbName,
  ensureDatabase,
  getAllDocuments,
  findBusinessById,
  BUSINESSES_DB,
  getDocument,
} from '../services/couchdb.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['Admin', 'Gerente']);

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function toStartOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateRange(from, to) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return null;
  return {
    from: toStartOfDay(fromDate),
    to: new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999),
  };
}

function computePreviousPeriod(from, to) {
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: toStartOfDay(prevFrom), to: prevTo };
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function isCompletedSale(sale) {
  const stage = String(sale.stage || '').toLowerCase();
  return stage === 'sold' || stage === 'delivered';
}

function getCommissionsDbName() {
  const prefix = process.env.VITE_COUCHDB_DB || 'vertial';
  return `${prefix}-commissions`.toLowerCase().replace(/[^a-z0-9_$()+-]+/g, '-').replace(/^-+|-+$/g, '');
}

function diffDays(a, b) {
  return Math.max(0, Math.round(Math.abs(a - b) / 86_400_000));
}

// ─── Resolve business members ────────────────────────────────────────────────

function buildMemberMap(business) {
  const map = {};
  for (const m of business.members || []) {
    map[m.user_id] = {
      user_id: m.user_id,
      fullName: m.fullName || '',
      role: m.role || 'Usuario',
      email: m.email || '',
      phone: m.phone || '',
      avatar: m.avatar || '',
    };
  }
  return map;
}

function matchResponsible(responsible, member, responsibleId) {
  if (!member) return false;
  const uid = String(member.user_id || '').toLowerCase();
  if (responsibleId && String(responsibleId).trim().toLowerCase() === uid) return true;
  if (!responsible) return false;
  const r = String(responsible).trim().toLowerCase();
  const name = String(member.fullName || '').toLowerCase();
  return r === uid || r === name;
}

// ─── Main endpoint ───────────────────────────────────────────────────────────

export async function getWorkerPerformance(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { from, to, businessId, workerId } = req.query;

    const range = parseDateRange(from, to);
    if (!range) return badRequest(res, 'Rango de fechas inválido');
    const prevRange = computePreviousPeriod(range.from, range.to);

    let business = null;
    if (businessId) {
      business = await findBusinessById(req, businessId);
    }

    const memberMap = business ? buildMemberMap(business) : {};
    const memberList = Object.values(memberMap);

    // ── Fetch data from all DBs in parallel ──

    const salesDb = getSalesDbName();
    const leadsDb = getLeadsDbName();
    const clockinsDb = getClockinsDbName();
    const commissionsDb = getCommissionsDbName();

    await Promise.all([
      ensureDatabase(req, salesDb),
      ensureDatabase(req, leadsDb),
      ensureDatabase(req, clockinsDb),
      ensureDatabase(req, commissionsDb).catch(() => {}),
    ]);

    const [allSales, allLeads, allClockins, allCommissions] = await Promise.all([
      getAllDocuments(req, salesDb).then((docs) =>
        docs.filter((d) => d?.type === 'sale' && !d?.deletedAt && d?.user_id === userId),
      ),
      getAllDocuments(req, leadsDb).then((docs) =>
        docs.filter((d) => d?.type === 'lead' && !d?.deletedAt && d?.user_id === userId),
      ),
      businessId
        ? getAllDocuments(req, clockinsDb).then((docs) =>
            docs.filter((d) => d?.type === 'clockin' && !d?.deletedAt && d?.business_id === businessId),
          )
        : Promise.resolve([]),
      getAllDocuments(req, commissionsDb)
        .then((docs) =>
          docs.filter((d) => d?.type === 'commission_record' && !d?.deletedAt && d?.user_id === userId),
        )
        .catch(() => []),
    ]);

    // ── Helper: filter by date ──
    const inRange = (dateStr, r) => {
      const d = new Date(dateStr);
      return d >= r.from && d <= r.to;
    };

    // ── Per-worker aggregation ──
    const workers = [];

    const targetMembers = workerId
      ? memberList.filter((m) => m.user_id === workerId)
      : memberList;

    for (const member of targetMembers) {
      const mySales = allSales.filter((s) => matchResponsible(s.responsible, member, s.responsibleId));
      const myLeads = allLeads.filter((l) => matchResponsible(l.responsible, member, l.responsibleId));
      const myClockins = allClockins.filter((c) => c.member_id === member.user_id);
      const myCommissions = allCommissions.filter(
        (c) => c.agentId === member.user_id || matchResponsible(c.agentName, member),
      );

      // Sales in current range
      const salesInRange = mySales.filter(
        (s) => isCompletedSale(s) && inRange(s.createdAt || s.updatedAt, range),
      );
      const salesInPrev = mySales.filter(
        (s) => isCompletedSale(s) && inRange(s.createdAt || s.updatedAt, prevRange),
      );

      const ventasCerradas = salesInRange.length;
      const ingresosTotales = salesInRange.reduce((sum, s) => sum + Number(s.totalPrice || 0), 0);
      const margenTotal = salesInRange.reduce(
        (sum, s) => sum + (Number(s.totalPrice || 0) - Number(s.purchasePrice || 0)),
        0,
      );
      const ticketMedio = ventasCerradas > 0 ? Math.round(ingresosTotales / ventasCerradas) : 0;

      const reservasActivas = mySales.filter(
        (s) => String(s.stage).toLowerCase() === 'reserved',
      ).length;
      const entregasRealizadas = salesInRange.filter(
        (s) => String(s.stage).toLowerCase() === 'delivered',
      ).length;
      const entregasPendientes = mySales.filter(
        (s) => String(s.stage).toLowerCase() === 'sold' && !s.deliveredAt,
      ).length;

      // Leads in current range
      const leadsInRange = myLeads.filter((l) => inRange(l.createdAt || l.updatedAt, range));
      const leadsAsignados = leadsInRange.length;
      const leadsSinGestionar = leadsInRange.filter(
        (l) =>
          l.status === 'new' &&
          (!Array.isArray(l.interactions) || l.interactions.length === 0),
      ).length;
      const leadsConvertidos = leadsInRange.filter((l) => l.status === 'won').length;
      const ratioConversion =
        leadsAsignados > 0 ? Math.round((leadsConvertidos / leadsAsignados) * 1000) / 10 : 0;

      // Average close time (won leads)
      const wonLeads = leadsInRange.filter((l) => l.status === 'won' && l.convertedAt && l.createdAt);
      const tiempoMedioCierreDias =
        wonLeads.length > 0
          ? Math.round(
              wonLeads.reduce(
                (sum, l) => sum + diffDays(new Date(l.convertedAt), new Date(l.createdAt)),
                0,
              ) / wonLeads.length,
            )
          : 0;

      // Commissions in range
      const commsInRange = myCommissions.filter((c) => inRange(c.createdAt, range));
      const comisionesGeneradas = commsInRange.reduce(
        (sum, c) => sum + Number(c.commissionAmount || 0),
        0,
      );
      const comisionesPendientes = commsInRange
        .filter((c) => c.status !== 'paid' && c.status !== 'cancelled')
        .reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0);
      const comisionesPagadas = commsInRange
        .filter((c) => c.status === 'paid')
        .reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0);

      // Clockins in range
      const clockinsInRange = myClockins.filter(
        (c) => c.date && c.date >= range.from.toISOString().slice(0, 10) && c.date <= range.to.toISOString().slice(0, 10),
      );
      const horasTrabajadas = clockinsInRange.reduce(
        (sum, c) => sum + Number(c.totalMinutes || 0) / 60,
        0,
      );
      const diasTrabajados = new Set(clockinsInRange.map((c) => c.date)).size;
      const ventasPorHora = horasTrabajadas > 0 ? Math.round((ventasCerradas / horasTrabajadas) * 100) / 100 : 0;

      // Active today
      const today = new Date().toISOString().slice(0, 10);
      const todayClockin = myClockins.find((c) => c.date === today);
      let estado = 'inactivo';
      if (todayClockin) {
        if (todayClockin.status === 'active') estado = 'fichado';
        else if (todayClockin.status === 'break') estado = 'descanso';
        else if (todayClockin.status === 'completed') estado = 'activo';
      }

      // Pending tasks
      const tareasPendientes =
        leadsSinGestionar +
        entregasPendientes +
        mySales.filter((s) => String(s.stage).toLowerCase() === 'documentation').length;

      const tareasCompletadas =
        entregasRealizadas +
        leadsConvertidos;

      // Trends vs previous period
      const prevVentas = salesInPrev.length;
      const prevIngresos = salesInPrev.reduce((sum, s) => sum + Number(s.totalPrice || 0), 0);
      const leadsInPrev = myLeads.filter((l) => inRange(l.createdAt || l.updatedAt, prevRange));
      const prevConvertidos = leadsInPrev.filter((l) => l.status === 'won').length;
      const prevTotal = leadsInPrev.length;
      const prevConversion = prevTotal > 0 ? Math.round((prevConvertidos / prevTotal) * 1000) / 10 : 0;

      // Documents (from business member data if available)
      const documentosVigentes = 0;
      const documentosPendientes = 0;
      const documentosCaducados = 0;

      workers.push({
        workerId: member.user_id,
        nombre: member.fullName,
        avatar: (member.fullName || '')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
        rol: member.role,
        email: member.email,
        telefono: member.phone,
        estado,
        ventasCerradas,
        ingresosTotales: Math.round(ingresosTotales * 100) / 100,
        margenTotal: Math.round(margenTotal * 100) / 100,
        ticketMedio,
        reservasActivas,
        entregasRealizadas,
        entregasPendientes,
        leadsAsignados,
        leadsSinGestionar,
        leadsConvertidos,
        ratioConversion,
        tiempoMedioCierreDias,
        comisionesGeneradas: Math.round(comisionesGeneradas * 100) / 100,
        comisionesPendientes: Math.round(comisionesPendientes * 100) / 100,
        comisionesPagadas: Math.round(comisionesPagadas * 100) / 100,
        horasTrabajadas: Math.round(horasTrabajadas * 10) / 10,
        diasTrabajados,
        ventasPorHora,
        tareasCompletadas,
        tareasPendientes,
        documentosVigentes,
        documentosPendientes,
        documentosCaducados,
        tendenciaVentas: pctChange(ventasCerradas, prevVentas),
        tendenciaIngresos: pctChange(ingresosTotales, prevIngresos),
        tendenciaConversion: pctChange(ratioConversion, prevConversion),
      });
    }

    // ── Team summary ──
    const teamSummary = {
      totalComerciales: workers.length,
      comercialesActivos: workers.filter((w) => w.estado !== 'inactivo').length,
      ventasEquipo: workers.reduce((s, w) => s + w.ventasCerradas, 0),
      ingresosTotales: Math.round(workers.reduce((s, w) => s + w.ingresosTotales, 0) * 100) / 100,
      margenEquipo: Math.round(workers.reduce((s, w) => s + w.margenTotal, 0) * 100) / 100,
      ticketMedioEquipo:
        workers.reduce((s, w) => s + w.ventasCerradas, 0) > 0
          ? Math.round(
              workers.reduce((s, w) => s + w.ingresosTotales, 0) /
                workers.reduce((s, w) => s + w.ventasCerradas, 0),
            )
          : 0,
      ratioConversionEquipo:
        workers.reduce((s, w) => s + w.leadsAsignados, 0) > 0
          ? Math.round(
              (workers.reduce((s, w) => s + w.leadsConvertidos, 0) /
                workers.reduce((s, w) => s + w.leadsAsignados, 0)) *
                1000,
            ) / 10
          : 0,
      tiempoMedioCierreEquipo:
        workers.filter((w) => w.tiempoMedioCierreDias > 0).length > 0
          ? Math.round(
              workers.reduce((s, w) => s + w.tiempoMedioCierreDias, 0) /
                workers.filter((w) => w.tiempoMedioCierreDias > 0).length,
            )
          : 0,
      comisionesTotales: Math.round(workers.reduce((s, w) => s + w.comisionesGeneradas, 0) * 100) / 100,
      horasTotales: Math.round(workers.reduce((s, w) => s + w.horasTrabajadas, 0) * 10) / 10,
      leadsTotal: workers.reduce((s, w) => s + w.leadsAsignados, 0),
      leadsSinGestionar: workers.reduce((s, w) => s + w.leadsSinGestionar, 0),
      entregasPendientes: workers.reduce((s, w) => s + w.entregasPendientes, 0),
    };

    // ── Alerts ──
    const alerts = [];
    const UNMANAGED_HOURS = 48;

    for (const w of workers) {
      if (w.leadsSinGestionar > 0) {
        alerts.push({
          id: `alert-lead-${w.workerId}`,
          tipo: 'lead_sin_gestionar',
          severity: 'critical',
          workerId: w.workerId,
          workerName: w.nombre,
          mensaje: `${w.nombre} tiene ${w.leadsSinGestionar} lead(s) sin gestionar`,
          ruta: '/saas/crm/clientes?tab=leads',
          timestamp: new Date().toISOString(),
        });
      }

      if (w.estado === 'inactivo' && w.ventasCerradas === 0 && w.leadsConvertidos === 0) {
        alerts.push({
          id: `alert-inactive-${w.workerId}`,
          tipo: 'sin_actividad',
          severity: 'warning',
          workerId: w.workerId,
          workerName: w.nombre,
          mensaje: `${w.nombre} no registra actividad comercial en el período`,
          ruta: `/saas/team/${w.workerId}`,
          timestamp: new Date().toISOString(),
        });
      }

      if (
        w.leadsAsignados >= 5 &&
        teamSummary.ratioConversionEquipo > 0 &&
        w.ratioConversion < teamSummary.ratioConversionEquipo * 0.5
      ) {
        alerts.push({
          id: `alert-lowconv-${w.workerId}`,
          tipo: 'baja_conversion',
          severity: 'warning',
          workerId: w.workerId,
          workerName: w.nombre,
          mensaje: `${w.nombre} tiene un ratio del ${w.ratioConversion}% (media equipo: ${teamSummary.ratioConversionEquipo}%)`,
          ruta: `/saas/vertical/compraventa/trabajadores`,
          timestamp: new Date().toISOString(),
        });
      }

      if (w.tareasPendientes > 10) {
        alerts.push({
          id: `alert-excess-${w.workerId}`,
          tipo: 'exceso_pendientes',
          severity: 'warning',
          workerId: w.workerId,
          workerName: w.nombre,
          mensaje: `${w.nombre} tiene ${w.tareasPendientes} tareas pendientes acumuladas`,
          ruta: `/saas/vertical/compraventa/trabajadores`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    alerts.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

    return res.json({
      ok: true,
      workers: workers.sort((a, b) => b.ingresosTotales - a.ingresosTotales),
      teamSummary,
      alerts,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error calculando rendimiento de trabajadores',
    });
  }
}
