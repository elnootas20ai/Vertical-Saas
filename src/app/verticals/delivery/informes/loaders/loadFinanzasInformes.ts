import { listFinanceMovements } from '../../../../lib/financeApi';
import {
  generateProfitAndLoss,
  generateCashFlowReport,
} from '../../../../lib/financeReportsApi';
import { computeCoreEbitdaForMonth, computeEbitdaMonthly } from '../../../../lib/ebitdaMetrics';
import {
  listTpvRegisterSessionsRequest,
} from '../../../../lib/deliveryApi';
import { fetchDeliveryTiendas as fetchTiendasReport } from '../../../../lib/deliveryReportsApi';
import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import {
  type InformeBuildResult,
  type InformeLoadCtx,
  euro,
  round2,
  yearNow,
  monthKeyNow,
  lastDaysRange,
  emptyResult,
} from './informeTypes';

export async function loadFinanzasInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('finanzas-')) return null;
  ctx.onProgress?.(15, 'Cargando finanzas…');
  const year = yearNow();
  const movements = await listFinanceMovements(ctx.userId, ctx.businessId);

  if (id === 'finanzas-ingresos') {
    const cobros = movements.filter((m) => m.type === 'cobro');
    const byCat = new Map<string, { count: number; total: number }>();
    for (const m of cobros) {
      const k = m.category || 'Sin categoría';
      const prev = byCat.get(k) || { count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number(m.totalAmount || 0);
      byCat.set(k, prev);
    }
    const rows = [...byCat.entries()]
      .map(([Categoria, v]) => ({
        Categoria: Categoria,
        Movimientos: v.count,
        Total: round2(v.total),
      }))
      .sort((a, b) => b.Total - a.Total);
    const total = rows.reduce((s, r) => s + r.Total, 0);
    return {
      rows,
      summary: `Ingresos (cobros) por categoría. Total ${euro(total)} € · ${cobros.length} movimientos.`,
    };
  }

  if (id === 'finanzas-gastos') {
    const pagos = movements.filter((m) => m.type === 'pago');
    const byCat = new Map<string, { count: number; total: number }>();
    for (const m of pagos) {
      const k = m.category || 'Sin categoría';
      const prev = byCat.get(k) || { count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number(m.totalAmount || 0);
      byCat.set(k, prev);
    }
    const rows = [...byCat.entries()]
      .map(([Categoria, v]) => ({
        Categoria: Categoria,
        Movimientos: v.count,
        Total: round2(v.total),
      }))
      .sort((a, b) => b.Total - a.Total);
    const total = rows.reduce((s, r) => s + r.Total, 0);
    return {
      rows,
      summary: `Gastos (pagos) por categoría. Total ${euro(total)} € · ${pagos.length} movimientos.`,
    };
  }

  if (id === 'finanzas-margen' || id === 'finanzas-cuenta-resultados') {
    ctx.onProgress?.(40, 'Calculando cuenta de resultados…');
    const pnl = await generateProfitAndLoss(ctx.userId, year);
    const rows = pnl.months.map((m) => ({
      Mes: m.label,
      Ingresos: m.income,
      Gastos: m.expenses,
      Resultado: m.netProfit,
      MargenPct: m.income > 0 ? round2((m.netProfit / m.income) * 100) : 0,
    }));
    return {
      rows,
      summary: `P&L ${year}: ingresos ${euro(pnl.totalIncome)} € · gastos ${euro(pnl.totalExpenses)} € · neto ${euro(pnl.totalNetProfit)} €.`,
    };
  }

  if (id === 'finanzas-flujo-caja') {
    ctx.onProgress?.(40, 'Calculando flujo de caja…');
    const cf = await generateCashFlowReport(ctx.userId, year);
    const rows = cf.months.map((m) => ({
      Mes: m.label,
      Apertura: m.openingBalance,
      Entradas: m.income,
      Salidas: m.expenses,
      Cierre: m.closingBalance,
    }));
    return {
      rows,
      summary: `Flujo ${year}: entradas ${euro(cf.totalInflow)} € · salidas ${euro(cf.totalOutflow)} € · neto ${euro(cf.netCashFlow)} €.`,
    };
  }

  if (id === 'finanzas-resultado-ytd') {
    const pnl = await generateProfitAndLoss(ctx.userId, year);
    const month = new Date().getMonth(); // 0-11
    const ytd = pnl.months.slice(0, month + 1);
    const income = round2(ytd.reduce((s, m) => s + m.income, 0));
    const expenses = round2(ytd.reduce((s, m) => s + m.expenses, 0));
    const rows = ytd.map((m) => ({
      Mes: m.label,
      Ingresos: m.income,
      Gastos: m.expenses,
      Resultado: m.netProfit,
    }));
    rows.push({
      Mes: 'YTD',
      Ingresos: income,
      Gastos: expenses,
      Resultado: round2(income - expenses),
    });
    return {
      rows,
      summary: `Resultado acumulado ${year} (YTD): neto ${euro(income - expenses)} €.`,
    };
  }

  if (id === 'finanzas-presupuesto-vs-real') {
    const pnl = await generateProfitAndLoss(ctx.userId, year);
    const month = new Date().getMonth();
    const past = pnl.months.slice(0, Math.max(1, month));
    const avgIncome = past.length
      ? past.reduce((s, m) => s + m.income, 0) / past.length
      : 0;
    const avgExpense = past.length
      ? past.reduce((s, m) => s + m.expenses, 0) / past.length
      : 0;
    const rows = pnl.months.slice(0, month + 1).map((m) => ({
      Mes: m.label,
      IngresosReal: m.income,
      IngresosObjetivo: round2(avgIncome),
      DesvIngresosPct: avgIncome > 0 ? round2(((m.income - avgIncome) / avgIncome) * 100) : 0,
      GastosReal: m.expenses,
      GastosObjetivo: round2(avgExpense),
      DesvGastosPct: avgExpense > 0 ? round2(((m.expenses - avgExpense) / avgExpense) * 100) : 0,
    }));
    return {
      rows,
      summary: 'Objetivo = media mensual YTD (sin presupuesto formal). Desviación real vs media interna.',
    };
  }

  if (id === 'finanzas-rentabilidad-centro') {
    ctx.onProgress?.(40, 'Cargando rentabilidad por tienda…');
    const { from, to } = lastDaysRange(30);
    try {
      const tiendas = await fetchTiendasReport(ctx.userId, { from, to });
      const rows = (tiendas.tiendas || []).map((t: any) => ({
        Tienda: t.nombre || t.name || t.id,
        Pedidos: t.pedidos ?? 0,
        Entregados: t.entregados ?? 0,
        Ingresos: round2(t.ingresos || 0),
        TicketMedio: round2(t.ticketMedio || 0),
        Incidencias: t.incidencias ?? 0,
      }));
      const total = rows.reduce((s, r) => s + Number(r.Ingresos), 0);
      return {
        rows,
        summary: `Rentabilidad operativa por PDV (últimos 30 días). Ingresos ${euro(total)} €.`,
      };
    } catch {
      return emptyResult('No se pudieron cargar tiendas para rentabilidad por centro.');
    }
  }

  if (id === 'finanzas-ebitda') {
    ctx.onProgress?.(40, 'Calculando EBITDA…');
    const monthly = computeEbitdaMonthly(movements, year);
    const snap = computeCoreEbitdaForMonth(movements, monthKeyNow());
    const rows = monthly.months.map((m) => ({
      Mes: m.label || m.monthKey,
      Ingresos: round2(m.income),
      COGS: round2(m.cogs),
      Opex: round2(m.opex),
      EBITDA: round2(m.ebitda),
      MargenPct: round2(m.ebitdaMargin),
    }));
    return {
      rows,
      summary: `EBITDA mes actual ${euro(snap.ebitda)} € (margen ${snap.ebitdaMargin.toFixed(1)}%). Año ${year}.`,
    };
  }

  if (id === 'finanzas-caja') {
    ctx.onProgress?.(40, 'Cargando arqueos TPV…');
    const { from } = lastDaysRange(60);
    const sessions = await listTpvRegisterSessionsRequest(ctx.userId, {
      businessId: ctx.businessId,
      lite: true,
      dateFrom: from,
    });
    const rows = sessions.map((s: any) => ({
      Fecha: s.openedAt || s.createdAt || s.date || '',
      Tienda: s.salesPointName || s.salesPointId || '',
      Estado: s.status || '',
      Esperado: round2(s.expectedCash ?? s.expected ?? 0),
      Contado: round2(s.countedCash ?? s.actualCash ?? s.closingCash ?? 0),
      Diferencia: round2(
        s.difference
        ?? ((Number(s.countedCash ?? s.actualCash ?? 0) - Number(s.expectedCash ?? 0)) || 0),
      ),
      Responsable: s.openedByName || s.closedByName || '',
    }));
    const diffs = rows.filter((r) => Math.abs(Number(r.Diferencia)) > 0.01).length;
    return {
      rows,
      summary: `Arqueos TPV (60 días). ${sessions.length} sesiones · ${diffs} con diferencia.`,
    };
  }

  return null;
}
