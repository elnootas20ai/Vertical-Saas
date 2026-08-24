import { listTpvRegisterSessionsRequest } from '../../../../lib/deliveryApi';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  CAJA_DIFF_THRESHOLD_EUR,
  euro,
  flattenDashboardRows,
  informePeriodLabel,
  resolveInformeDateRange,
  round2,
} from './informeTypes';

export async function buildCajaDiferenciasInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(30, 'Cargando arqueos TPV…');
  const { from, to } = resolveInformeDateRange(ctx);
  const periodLabel = ctx.period ? informePeriodLabel(ctx.period) : `${from} → ${to}`;
  const employeeFilter = ctx.filters?.employee;
  const centerId = ctx.filters?.centerId;

  const [sessions, centers] = await Promise.all([
    listTpvRegisterSessionsRequest(ctx.userId, {
      businessId: ctx.businessId,
      lite: true,
      dateFrom: `${from}T00:00:00.000Z`,
    }),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const inRange = sessions.filter((s: any) => {
    const d = String(s.closedAt || s.openedAt || s.createdAt || '').slice(0, 10);
    if (d < from || d > to) return false;
    if (centerId) {
      const sid = String(s.pointOfSaleId || s.salesPointId || s.workCenterId || '');
      if (sid !== centerId) return false;
    }
    return true;
  });

  const rows = inRange
    .map((s: any) => {
      const expected = round2(s.expectedCash ?? s.summary?.expectedCash ?? 0);
      const counted = round2(s.finalCashAmount ?? s.countedCash ?? s.summary?.countedCash ?? 0);
      const diff = round2(s.difference ?? counted - expected);
      const employee = String(s.workerName || s.openedByName || s.closedByName || '—');
      return {
        Fecha: String(s.closedAt || s.openedAt || '').slice(0, 10),
        Turno: String(s._id || s.id || '').slice(-8),
        Empleado: employee,
        CajaTeorica: expected,
        CajaReal: counted,
        Diferencia: diff,
        Tienda: s.pointOfSaleName || s.salesPointName || '',
      };
    })
    .filter((r) => !employeeFilter || r.Empleado === employeeFilter);

  const totalDiff = round2(rows.reduce((s, r) => s + Number(r.Diferencia), 0));
  const withDiff = rows.filter((r) => Math.abs(Number(r.Diferencia)) > 0.009).length;
  const overThreshold = rows.filter((r) => Math.abs(Number(r.Diferencia)) >= CAJA_DIFF_THRESHOLD_EUR);
  const employees = [...new Set(rows.map((r) => r.Empleado).filter((e) => e && e !== '—'))];

  // Pattern by employee
  const byEmp = new Map<string, { count: number; abs: number }>();
  for (const r of rows) {
    if (Math.abs(Number(r.Diferencia)) < 0.009) continue;
    const prev = byEmp.get(r.Empleado) || { count: 0, abs: 0 };
    prev.count += 1;
    prev.abs += Math.abs(Number(r.Diferencia));
    byEmp.set(r.Empleado, prev);
  }
  const empPattern = [...byEmp.entries()]
    .map(([Empleado, v]) => ({
      Empleado,
      Descuadres: v.count,
      AbsTotal: round2(v.abs),
    }))
    .sort((a, b) => b.Descuadres - a.Descuadres);

  const dashboard = {
    kpis: [
      {
        id: 'diff-total',
        label: 'Diferencia total periodo',
        value: `${euro(totalDiff)} €`,
        tone: Math.abs(totalDiff) >= CAJA_DIFF_THRESHOLD_EUR ? 'warning' as const : 'neutral' as const,
      },
      {
        id: 'arqueos',
        label: 'Arqueos con descuadre',
        value: String(withDiff),
        hint: `${rows.length} turnos`,
      },
      {
        id: 'umbral',
        label: `Sobre umbral (±${CAJA_DIFF_THRESHOLD_EUR} €)`,
        value: String(overThreshold.length),
      },
      {
        id: 'abs',
        label: 'Descuadre absoluto acum.',
        value: `${euro(round2(rows.reduce((s, r) => s + Math.abs(Number(r.Diferencia)), 0)))} €`,
      },
    ],
    chart: {
      type: 'bar' as const,
      title: 'Diferencias por turno (absoluto)',
      points: rows
        .filter((r) => Math.abs(Number(r.Diferencia)) > 0.009)
        .slice(0, 20)
        .map((r) => ({
          label: `${String(r.Fecha).slice(8, 10)}/${String(r.Fecha).slice(5, 7)}`,
          diff: Math.abs(Number(r.Diferencia)),
        })),
      series: [{ key: 'diff', label: '|Dif.| €', color: '#e11d48' }],
    },
    tables: [
      {
        id: 'arqueos',
        title: 'Arqueos del periodo',
        sortable: true,
        columns: [
          { key: 'Fecha', label: 'Fecha' },
          { key: 'Turno', label: 'Turno' },
          { key: 'Empleado', label: 'Empleado' },
          { key: 'CajaTeorica', label: 'Caja teórica', align: 'right' as const, format: 'money' as const },
          { key: 'CajaReal', label: 'Caja real', align: 'right' as const, format: 'money' as const },
          { key: 'Diferencia', label: 'Diferencia', align: 'right' as const, format: 'money' as const },
        ],
        rows,
      },
      ...(empPattern.length
        ? [{
            id: 'patron',
            title: 'Patrón por empleado (descuadres)',
            sortable: true,
            columns: [
              { key: 'Empleado', label: 'Empleado' },
              { key: 'Descuadres', label: 'Nº', align: 'right' as const, format: 'number' as const },
              { key: 'AbsTotal', label: 'Abs. total', align: 'right' as const, format: 'money' as const },
            ],
            rows: empPattern,
          }]
        : []),
    ],
    alerts: [
      ...overThreshold.slice(0, 6).map((r, i) => ({
        id: `diff-${i}`,
        severity: 'warning' as const,
        message: `${r.Fecha} · ${r.Empleado} · ${r.Tienda}: ${euro(Number(r.Diferencia))} € (umbral ±${CAJA_DIFF_THRESHOLD_EUR} €)`,
      })),
      {
        id: 'billetes',
        severity: 'info' as const,
        message: 'Detalle de billetes/monedas no disponible en los arqueos actuales (no se inventa).',
      },
    ],
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
      employees,
    },
  };

  return {
    rows: flattenDashboardRows(dashboard),
    summary: `Caja · ${periodLabel}: ${rows.length} arqueos · ${withDiff} descuadres · umbral ±${CAJA_DIFF_THRESHOLD_EUR} €.`,
    reportTitle: 'Caja y diferencias',
    dashboard,
  };
}
