import { listFinanceMovements } from '../../../../lib/financeApi';
import { generateCashFlowReport } from '../../../../lib/financeReportsApi';
import { listTpvRegisterSessionsRequest } from '../../../../lib/deliveryApi';
import { listWorkCentersForDelivery } from '../../../../lib/workCentersApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  type InformeDashboard,
  euro,
  flattenDashboardRows,
  informePeriodLabel,
  resolveInformeDateRange,
  round2,
  dateInRange,
} from './informeTypes';

export async function buildFlujoCajaInforme(
  _id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  ctx.onProgress?.(15, 'Cargando flujo de caja…');
  const year = ctx.period?.year ?? new Date().getFullYear();
  const { from, to } = resolveInformeDateRange(ctx);
  const centerId = ctx.filters?.centerId;
  const periodLabel = ctx.period ? informePeriodLabel(ctx.period) : `${from} → ${to}`;

  const [movements, cf, sessions, centers] = await Promise.all([
    listFinanceMovements(ctx.userId, ctx.businessId),
    generateCashFlowReport(ctx.userId, year, ctx.businessId),
    listTpvRegisterSessionsRequest(ctx.userId, {
      businessId: ctx.businessId,
      lite: true,
      dateFrom: `${from}T00:00:00.000Z`,
    }).catch(() => []),
    listWorkCentersForDelivery(ctx.userId).catch(() => []),
  ]);

  const inPeriod = (m: { date?: string; pointOfSaleId?: string; workCenterId?: string; type: string }) => {
    if (!dateInRange(String(m.date || ''), from, to)) return false;
    if (!centerId) return true;
    return m.pointOfSaleId === centerId || m.workCenterId === centerId;
  };

  const entradas = round2(
    movements.filter((m) => m.type === 'cobro' && inPeriod(m) && m.status !== 'pending')
      .reduce((s, m) => s + Number(m.totalAmount || 0), 0),
  );
  const salidas = round2(
    movements.filter((m) => m.type === 'pago' && inPeriod(m) && m.status !== 'pending')
      .reduce((s, m) => s + Number(m.totalAmount || 0), 0),
  );

  const cobrosPendientes = movements.filter((m) => m.type === 'cobro' && m.status === 'pending');
  const pagosPendientes = movements.filter((m) => m.type === 'pago' && m.status === 'pending');
  const pendingIn = round2(cobrosPendientes.reduce((s, m) => s + Number(m.totalAmount || 0), 0));
  const pendingOut = round2(pagosPendientes.reduce((s, m) => s + Number(m.totalAmount || 0), 0));

  // Saldo: cierre del mes en cash flow report si hay periodo
  const monthCf = ctx.period
    ? cf.months.find((m) => m.month === ctx.period!.month)
    : cf.months[new Date().getMonth()];
  const saldoActual = monthCf ? round2(monthCf.closingBalance) : round2(cf.netCashFlow);

  // Proyección 30d: saldo + cobros pendientes − pagos pendientes (solo vencen en 30d si hay dueDate)
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dueSoon = (due: string) => {
    const d = String(due || '').slice(0, 10);
    if (!d) return true; // sin fecha → contar en proyección
    return d <= iso(in30);
  };
  const projIn = round2(
    cobrosPendientes.filter((m) => dueSoon(m.dueDate)).reduce((s, m) => s + Number(m.totalAmount || 0), 0),
  );
  const projOut = round2(
    pagosPendientes.filter((m) => dueSoon(m.dueDate)).reduce((s, m) => s + Number(m.totalAmount || 0), 0),
  );
  const saldoProyectado = round2(saldoActual + projIn - projOut);

  // Daily net for chart (within period)
  const dayMap = new Map<string, { in: number; out: number }>();
  for (const m of movements) {
    if (!inPeriod(m)) continue;
    if (m.status === 'pending') continue;
    const d = String(m.date).slice(0, 10);
    const b = dayMap.get(d) || { in: 0, out: 0 };
    if (m.type === 'cobro') b.in += Number(m.totalAmount || 0);
    else b.out += Number(m.totalAmount || 0);
    dayMap.set(d, b);
  }
  const days = [...dayMap.keys()].sort();
  let run = 0;
  const chartPoints = days.map((d) => {
    const b = dayMap.get(d)!;
    run = round2(run + b.in - b.out);
    return {
      label: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
      entradas: round2(b.in),
      salidas: round2(b.out),
      saldo: run,
    };
  });

  const overdueCobros = cobrosPendientes.filter((m) => {
    const due = String(m.dueDate || '').slice(0, 10);
    return due && due < iso(today);
  });

  const alerts: NonNullable<InformeDashboard['alerts']> = [];
  if (saldoProyectado < 0) {
    alerts.push({
      id: 'sin-caja',
      severity: 'danger',
      message: `Proyección a 30 días negativa: ${euro(saldoProyectado)} €. Riesgo de quedarte sin caja.`,
    });
  }
  for (const m of overdueCobros.slice(0, 8)) {
    alerts.push({
      id: `venc-${m.id}`,
      severity: 'warning',
      message: `Cobro vencido sin cobrar: ${m.concept || m.companyName || '—'} · ${euro(Number(m.totalAmount))} € · vence ${String(m.dueDate).slice(0, 10)}`,
    });
  }

  // TPV cash tip (optional)
  const closed = sessions.filter((s) => String(s.status || '') === 'closed' || Boolean(s.closedAt));
  const tpvInPeriod = closed.filter((s) => {
    const d = String(s.closedAt || s.openedAt || '').slice(0, 10);
    return d >= from && d <= to;
  });

  const dashboard: InformeDashboard = {
    kpis: [
      { id: 'saldo', label: 'Saldo actual', value: `${euro(saldoActual)} €` },
      { id: 'in', label: 'Entradas periodo', value: `${euro(entradas)} €` },
      { id: 'out', label: 'Salidas periodo', value: `${euro(salidas)} €` },
      {
        id: 'proj',
        label: 'Saldo proyectado 30d',
        value: `${euro(saldoProyectado)} €`,
        tone: saldoProyectado < 0 ? 'negative' : 'neutral',
        hint: `Pend. cobrar ${euro(projIn)} € · pagar ${euro(projOut)} €`,
      },
    ],
    chart: {
      type: 'composed',
      title: 'Entradas / salidas y saldo acumulado',
      points: chartPoints,
      series: [
        { key: 'entradas', label: 'Entradas', color: '#22c55e' },
        { key: 'salidas', label: 'Salidas', color: '#e11d48' },
        { key: 'saldo', label: 'Saldo acum.', color: '#2563eb' },
      ],
    },
    tables: [
      {
        id: 'cobros-pend',
        title: 'Cobros pendientes',
        sortable: true,
        columns: [
          { key: 'Fecha', label: 'Fecha' },
          { key: 'Vence', label: 'Vencimiento' },
          { key: 'Concepto', label: 'Concepto' },
          { key: 'Importe', label: 'Importe', align: 'right', format: 'money' },
        ],
        rows: cobrosPendientes
          .map((m) => ({
            Fecha: String(m.date || '').slice(0, 10),
            Vence: String(m.dueDate || '').slice(0, 10) || '—',
            Concepto: m.concept || m.companyName || '—',
            Importe: round2(Number(m.totalAmount || 0)),
          }))
          .sort((a, b) => String(a.Vence).localeCompare(String(b.Vence))),
      },
      {
        id: 'pagos-pend',
        title: 'Pagos pendientes',
        sortable: true,
        columns: [
          { key: 'Fecha', label: 'Fecha' },
          { key: 'Vence', label: 'Vencimiento' },
          { key: 'Concepto', label: 'Concepto' },
          { key: 'Importe', label: 'Importe', align: 'right', format: 'money' },
        ],
        rows: pagosPendientes.map((m) => ({
          Fecha: String(m.date || '').slice(0, 10),
          Vence: String(m.dueDate || '').slice(0, 10) || '—',
          Concepto: m.concept || m.companyName || '—',
          Importe: round2(Number(m.totalAmount || 0)),
        })),
      },
      {
        id: 'calendario',
        title: 'Calendario de vencimientos (pendientes)',
        sortable: true,
        columns: [
          { key: 'Vence', label: 'Vence' },
          { key: 'Tipo', label: 'Tipo' },
          { key: 'Concepto', label: 'Concepto' },
          { key: 'Importe', label: 'Importe', align: 'right', format: 'money' },
        ],
        rows: [...cobrosPendientes, ...pagosPendientes]
          .map((m) => ({
            Vence: String(m.dueDate || m.date || '').slice(0, 10) || 'Sin fecha',
            Tipo: m.type === 'cobro' ? 'Cobro' : 'Pago',
            Concepto: m.concept || m.companyName || '—',
            Importe: round2(Number(m.totalAmount || 0)),
          }))
          .sort((a, b) => String(a.Vence).localeCompare(String(b.Vence))),
      },
      {
        id: 'tpv',
        title: `Cajón TPV (cierres del periodo · ${tpvInPeriod.length} turnos)`,
        columns: [
          { key: 'Concepto', label: 'Concepto' },
          { key: 'Importe', label: 'Importe', align: 'right', format: 'money' },
        ],
        rows: [
          {
            Concepto: 'Efectivo entradas (cierres)',
            Importe: round2(tpvInPeriod.reduce((s, x) => s + Number(x.summary?.totalCashIn || 0), 0)),
          },
          {
            Concepto: 'Efectivo salidas (cierres)',
            Importe: round2(tpvInPeriod.reduce((s, x) => s + Number(x.summary?.totalCashOut || 0), 0)),
          },
        ],
      },
    ],
    alerts,
    filterOptions: {
      centers: centers.map((c) => ({ id: c._id || c.id, name: c.name })).filter((c) => c.id),
    },
  };

  return {
    rows: flattenDashboardRows(dashboard),
    summary: `Flujo ${periodLabel}: saldo ${euro(saldoActual)} € · entradas ${euro(entradas)} € · salidas ${euro(salidas)} € · proy. 30d ${euro(saldoProyectado)} € · pend. ${euro(pendingIn)}/${euro(pendingOut)} €.`,
    reportTitle: 'Flujo de caja',
    dashboard,
  };
}
