import {
  fetchClockinStats,
  fetchAbsenteeism,
  fetchPerformance,
  fetchLaborCost,
  listClockins,
} from '../../../../lib/clockinsApi';
import {
  listStaffConsumptionsRequest,
} from '../../../../lib/deliveryApi';
import { fetchDeliveryReportKpis as fetchKpis } from '../../../../lib/deliveryReportsApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  round2,
  lastDaysRange,
  emptyResult,
  monthKeyNow,
} from './informeTypes';

export async function loadEquipoInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('equipo-')) return null;
  if (!ctx.businessId) {
    return emptyResult('Selecciona un negocio para informes de equipo (hace falta businessId).');
  }

  const { from, to } = lastDaysRange(30);
  ctx.onProgress?.(20, 'Cargando equipo…');

  if (id === 'equipo-fichajes') {
    // Últimos 14 días día a día (API de listado es por fecha).
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      try {
        const day = await listClockins(ctx.businessId, { date, recordsOnly: true });
        for (const c of day) {
          rows.push({
            Fecha: c.date || date,
            Trabajador: (c as any).member_name || (c as any).memberName || c.member_id || '',
            Entrada: (c as any).clock_in || (c as any).entries?.[0]?.time || '',
            Salida: (c as any).clock_out || '',
            Minutos: (c as any).worked_minutes ?? (c as any).total_minutes ?? '',
          });
        }
      } catch { /* skip day */ }
    }
    return {
      rows,
      summary: `Fichajes (14 días): ${rows.length} registros.`,
    };
  }

  if (id === 'equipo-horas') {
    const stats = await fetchClockinStats(ctx.businessId, { from, to });
    const rows = (stats.byMember || []).map((m) => ({
      Trabajador: m.member_name || m.member_id,
      Horas: round2(m.totalMinutes / 60),
      Minutos: m.totalMinutes,
      Sesiones: m.sessions,
      Rol: m.role || '',
    }));
    const totalH = round2((stats.summary?.totalMinutes || 0) / 60);
    return {
      rows,
      summary: `Horas trabajadas 30d: ${totalH} h · ${stats.summary?.uniqueMembers || rows.length} personas.`,
    };
  }

  if (id === 'equipo-asistencia') {
    const abs = await fetchAbsenteeism(ctx.businessId, { from, to });
    const rows = (abs.report || []).map((d) => ({
      Fecha: d.date,
      Esperados: d.expected?.length || 0,
      Presentes: d.present?.length || 0,
      Ausentes: d.absent?.length || 0,
      TasaAbsentismoPct: round2(d.rate || 0),
    }));
    return {
      rows: rows.length
        ? rows
        : [
            { Concepto: 'Días', Valor: abs.summary?.totalDays ?? 0 },
            { Concepto: 'Esperados', Valor: abs.summary?.totalExpected ?? 0 },
            { Concepto: 'Presentes', Valor: abs.summary?.totalPresent ?? 0 },
            { Concepto: 'Ausentes', Valor: abs.summary?.totalAbsent ?? 0 },
            { Concepto: 'Tasa %', Valor: round2(abs.summary?.overallRate || 0) },
          ],
      summary: `Asistencia / absentismo ${from} → ${to}. Tasa global ${round2(abs.summary?.overallRate || 0)}%.`,
    };
  }

  if (id === 'equipo-consumos') {
    const month = monthKeyNow();
    const data = await listStaffConsumptionsRequest(ctx.userId, { month });
    const rows = (data.items || []).map((c: any) => ({
      Fecha: c.createdAt || c.date || '',
      Trabajador: c.workerName || c.workerId || '',
      Articulo: c.itemName || c.catalogItemName || c.catalogItemId || '',
      Cantidad: c.quantity ?? 1,
      Importe: round2(c.total || c.amount || 0),
      Pago: c.paymentMode || '',
    }));
    return {
      rows,
      summary: `Consumos internos ${month}: ${data.summary?.count || rows.length} · total ${euro(data.summary?.total || 0)} €.`,
    };
  }

  if (id === 'equipo-productividad' || id === 'equipo-ventas-trabajador') {
    const perf = await fetchPerformance(ctx.businessId, { from, to });
    const rows = (perf || []).map((m) => ({
      Trabajador: m.member_name || m.member_id,
      Horas: round2(m.hoursWorked || 0),
      Ventas: round2(m.salesAmount || 0),
      Tickets: m.salesCount || 0,
      VentasPorHora: m.hoursWorked > 0 ? round2(m.salesAmount / m.hoursWorked) : 0,
      Rol: m.role || '',
    }));
    return {
      rows,
      summary: `Productividad / ventas por trabajador (${from} → ${to}).`,
    };
  }

  if (id === 'equipo-rendimiento-depto') {
    const stats = await fetchClockinStats(ctx.businessId, { from, to });
    const rows = (stats.byRole || []).map((r) => ({
      Departamento: r.role,
      Horas: round2(r.totalMinutes / 60),
      Personas: r.memberCount,
      Sesiones: r.sessions,
    }));
    return {
      rows,
      summary: 'Horas por departamento/rol (30 días).',
    };
  }

  if (id === 'equipo-coste-hora') {
    const labor = await fetchLaborCost(ctx.businessId, { from, to });
    const rows = (labor.members || []).map((m) => ({
      Trabajador: m.member_name || m.member_id,
      Horas: round2(m.worked_hours || 0),
      CosteHora: round2(m.hourly_employer_cost || 0),
      CosteTotal: round2(m.actual_employer_cost || 0),
      Rol: m.role || '',
    }));
    return {
      rows,
      summary: `Coste laboral 30d: total ${euro(labor.summary?.actual_employer_cost || 0)} € · ${labor.summary?.members_with_salary || 0} con sueldo.`,
    };
  }

  if (id === 'equipo-impacto-resultados') {
    ctx.onProgress?.(45, 'Cruzando coste laboral y ventas…');
    const [labor, kpis] = await Promise.all([
      fetchLaborCost(ctx.businessId, { from, to }),
      fetchKpis(ctx.userId, { from, to }, ctx.signal),
    ]);
    const ventas = Number(kpis.kpis?.ventasPeriodo?.total || 0);
    const coste = Number(labor.summary?.actual_employer_cost || 0);
    const rows = [
      { Concepto: 'Ventas periodo (delivery)', Valor: round2(ventas) },
      { Concepto: 'Coste laboral', Valor: round2(coste) },
      { Concepto: 'Impacto neto (ventas - coste)', Valor: round2(ventas - coste) },
      {
        Concepto: 'Coste laboral / ventas %',
        Valor: ventas > 0 ? round2((coste / ventas) * 100) : 0,
      },
    ];
    return {
      rows,
      summary: `Impacto equipo en resultados 30d: ventas ${euro(ventas)} € vs coste ${euro(coste)} €.`,
    };
  }

  return null;
}
