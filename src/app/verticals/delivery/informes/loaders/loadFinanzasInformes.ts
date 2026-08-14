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
    ctx.onProgress?.(25, 'Cargando flujo contable…');
    const year = yearNow();
    const cf = await generateCashFlowReport(ctx.userId, year);

    ctx.onProgress?.(45, 'Cargando cajas TPV e integradores…');
    const dateFrom = `${year}-01-01T00:00:00.000Z`;
    const sessions = await listTpvRegisterSessionsRequest(ctx.userId, {
      businessId: ctx.businessId,
      lite: true,
      dateFrom,
    }).catch(() => [] as Awaited<ReturnType<typeof listTpvRegisterSessionsRequest>>);

    const closed = sessions.filter((s) => String(s.status || '') === 'closed' || Boolean(s.closedAt));

    const monthKeyFromIso = (iso: string) => {
      const raw = String(iso || '').trim();
      if (!raw) return '';
      // Prefer Madrid calendar day for grouping
      try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw.slice(0, 7);
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Madrid',
          year: 'numeric',
          month: '2-digit',
        }).formatToParts(d);
        const y = parts.find((p) => p.type === 'year')?.value;
        const m = parts.find((p) => p.type === 'month')?.value;
        return y && m ? `${y}-${m}` : raw.slice(0, 7);
      } catch {
        return raw.slice(0, 7);
      }
    };

    const MONTH_LABELS = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    type MonthBucket = {
      key: string;
      label: string;
      cashIn: number;
      cashOut: number;
      tpvSales: number;
      appsTotal: number;
      appsUnpaidCash: number;
      expectedCash: number;
      countedCash: number;
      diffAbs: number;
      turns: number;
      turnsWithDiff: number;
    };

    const byMonth = new Map<string, MonthBucket>();
    const ensureMonth = (key: string): MonthBucket => {
      let b = byMonth.get(key);
      if (b) return b;
      const mi = Number(key.slice(5, 7)) - 1;
      b = {
        key,
        label: MONTH_LABELS[mi] || key,
        cashIn: 0,
        cashOut: 0,
        tpvSales: 0,
        appsTotal: 0,
        appsUnpaidCash: 0,
        expectedCash: 0,
        countedCash: 0,
        diffAbs: 0,
        turns: 0,
        turnsWithDiff: 0,
      };
      byMonth.set(key, b);
      return b;
    };

    type StoreBucket = {
      name: string;
      cashIn: number;
      cashOut: number;
      tpvSales: number;
      appsTotal: number;
      appsUnpaidCash: number;
      expectedCash: number;
      countedCash: number;
      diff: number;
      turns: number;
      turnsWithDiff: number;
    };
    const byStore = new Map<string, StoreBucket>();

    for (const s of closed) {
      const mk = monthKeyFromIso(String(s.closedAt || s.openedAt || ''));
      if (!mk.startsWith(String(year))) continue;
      const bucket = ensureMonth(mk);
      const sum = s.summary || ({} as any);
      const cashIn = Number(sum.totalCashIn || 0);
      const cashOut = Number(sum.totalCashOut || 0);
      const tpvSales = Number(sum.totalSales || 0);
      const appsMap = s.aggregatorClosingTotals || {};
      const appsTotal = Object.values(appsMap).reduce((a: number, n) => a + (Number(n) || 0), 0);
      const unpaidCashMap = s.aggregatorClosingCash || {};
      const appsUnpaidCash = Object.values(unpaidCashMap).reduce((a: number, n) => a + (Number(n) || 0), 0);
      const expected = Number(s.expectedCash ?? sum.expectedCash ?? 0);
      const counted = Number(s.finalCashAmount ?? s.countedCash ?? sum.countedCash ?? 0);
      const diff = Number(s.difference ?? counted - expected);

      bucket.cashIn += cashIn;
      bucket.cashOut += cashOut;
      bucket.tpvSales += tpvSales;
      bucket.appsTotal += appsTotal;
      bucket.appsUnpaidCash += appsUnpaidCash;
      bucket.expectedCash += expected;
      bucket.countedCash += counted;
      bucket.diffAbs += Math.abs(diff);
      bucket.turns += 1;
      if (Math.abs(diff) > 0.009) bucket.turnsWithDiff += 1;

      const storeName = String(s.pointOfSaleName || s.pointOfSaleId || 'Sin tienda').trim() || 'Sin tienda';
      const st = byStore.get(storeName) || {
        name: storeName,
        cashIn: 0,
        cashOut: 0,
        tpvSales: 0,
        appsTotal: 0,
        appsUnpaidCash: 0,
        expectedCash: 0,
        countedCash: 0,
        diff: 0,
        turns: 0,
        turnsWithDiff: 0,
      };
      st.cashIn += cashIn;
      st.cashOut += cashOut;
      st.tpvSales += tpvSales;
      st.appsTotal += appsTotal;
      st.appsUnpaidCash += appsUnpaidCash;
      st.expectedCash += expected;
      st.countedCash += counted;
      st.diff += diff;
      st.turns += 1;
      if (Math.abs(diff) > 0.009) st.turnsWithDiff += 1;
      byStore.set(storeName, st);
    }

    for (const b of byMonth.values()) {
      b.cashIn = round2(b.cashIn);
      b.cashOut = round2(b.cashOut);
      b.tpvSales = round2(b.tpvSales);
      b.appsTotal = round2(b.appsTotal);
      b.appsUnpaidCash = round2(b.appsUnpaidCash);
      b.expectedCash = round2(b.expectedCash);
      b.countedCash = round2(b.countedCash);
      b.diffAbs = round2(b.diffAbs);
    }

    const pagos = movements.filter((m) => m.type === 'pago' && String(m.date || '').startsWith(String(year)));
    const cobros = movements.filter((m) => m.type === 'cobro' && String(m.date || '').startsWith(String(year)));
    const byPayCat = new Map<string, number>();
    for (const m of pagos) {
      const k = m.category || 'Sin categoría';
      byPayCat.set(k, round2((byPayCat.get(k) || 0) + Number(m.totalAmount || 0)));
    }
    const byCobroCat = new Map<string, number>();
    for (const m of cobros) {
      const k = m.category || 'Sin categoría';
      byCobroCat.set(k, round2((byCobroCat.get(k) || 0) + Number(m.totalAmount || 0)));
    }

    const rows: Record<string, unknown>[] = [];
    let orden = 0;
    const push = (row: Record<string, unknown>) => {
      orden += 1;
      rows.push({ Orden: orden, ...row });
    };

    // ── 1) Resumen ejecutivo ──────────────────────────────────────────────
    const tpvCashInYear = round2([...byMonth.values()].reduce((s, b) => s + b.cashIn, 0));
    const tpvCashOutYear = round2([...byMonth.values()].reduce((s, b) => s + b.cashOut, 0));
    const appsYear = round2([...byMonth.values()].reduce((s, b) => s + b.appsTotal, 0));
    const unpaidCashYear = round2([...byMonth.values()].reduce((s, b) => s + b.appsUnpaidCash, 0));
    const turnsYear = [...byMonth.values()].reduce((s, b) => s + b.turns, 0);
    const turnsDiffYear = [...byMonth.values()].reduce((s, b) => s + b.turnsWithDiff, 0);

    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Entradas contables (cobros)',
      Entradas: round2(cf.totalInflow),
      Salidas: 0,
      Neto: round2(cf.totalInflow),
      Saldo: '',
      Notas: `${cobros.length} cobros registrados en finanzas`,
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Salidas contables (pagos)',
      Entradas: 0,
      Salidas: round2(cf.totalOutflow),
      Neto: round2(-cf.totalOutflow),
      Saldo: '',
      Notas: `${pagos.length} pagos registrados en finanzas`,
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Neto contable del año',
      Entradas: round2(cf.totalInflow),
      Salidas: round2(cf.totalOutflow),
      Neto: round2(cf.netCashFlow),
      Saldo: '',
      Notas: 'Cobros − pagos (libro de finanzas)',
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Cajón TPV · entradas de efectivo',
      Entradas: tpvCashInYear,
      Salidas: 0,
      Neto: tpvCashInYear,
      Saldo: '',
      Notas: `${turnsYear} turnos cerrados`,
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Cajón TPV · salidas de efectivo',
      Entradas: 0,
      Salidas: tpvCashOutYear,
      Neto: round2(-tpvCashOutYear),
      Saldo: '',
      Notas: 'Salidas registradas en turnos de caja',
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Apps / integradores (declarado al cierre)',
      Entradas: appsYear,
      Salidas: 0,
      Neto: appsYear,
      Saldo: '',
      Notas: 'Glovo+Uber+Just+Flipdish (hecho en app). No es cajón físico salvo «no pagado».',
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Apps no pagado en efectivo → cajón',
      Entradas: unpaidCashYear,
      Salidas: 0,
      Neto: unpaidCashYear,
      Saldo: '',
      Notas: 'Parte de apps que sí suma al arqueo de efectivo',
    });
    push({
      Seccion: '01 · Resumen ejecutivo',
      Periodo: String(year),
      Tienda: '—',
      Concepto: 'Descuadres de caja',
      Entradas: 0,
      Salidas: 0,
      Neto: 0,
      Saldo: '',
      Notas: `${turnsDiffYear} de ${turnsYear} turnos con diferencia ≠ 0`,
    });

    // ── 2) Flujo contable mes a mes ───────────────────────────────────────
    for (const m of cf.months) {
      if (m.income === 0 && m.expenses === 0 && m.openingBalance === 0 && m.closingBalance === 0) {
        // still include months with activity earlier; skip empty future months after current
        const nowM = new Date().getMonth() + 1;
        if (m.month > nowM && year === yearNow()) continue;
      }
      push({
        Seccion: '02 · Flujo contable (mes)',
        Periodo: `${m.label} ${year}`,
        Tienda: '—',
        Concepto: 'Saldo apertura → cierre',
        Entradas: m.income,
        Salidas: m.expenses,
        Neto: round2(m.income - m.expenses),
        Saldo: m.closingBalance,
        Notas: `Apertura ${euro(m.openingBalance)} € · Cierre ${euro(m.closingBalance)} €`,
      });
    }

    // ── 3) Cajón TPV + apps por mes ───────────────────────────────────────
    const monthKeys = [...byMonth.keys()].sort();
    for (const key of monthKeys) {
      const b = byMonth.get(key)!;
      push({
        Seccion: '03 · Cajón TPV e integradores (mes)',
        Periodo: `${b.label} ${year}`,
        Tienda: 'Todas',
        Concepto: 'Movimiento de cajón (entradas − salidas)',
        Entradas: b.cashIn,
        Salidas: b.cashOut,
        Neto: round2(b.cashIn - b.cashOut),
        Saldo: '',
        Notas: `${b.turns} turnos · TPV ventas ${euro(b.tpvSales)} €`,
      });
      push({
        Seccion: '03 · Cajón TPV e integradores (mes)',
        Periodo: `${b.label} ${year}`,
        Tienda: 'Todas',
        Concepto: 'Apps declaradas (Caja 2)',
        Entradas: b.appsTotal,
        Salidas: 0,
        Neto: b.appsTotal,
        Saldo: '',
        Notas: `No pagado efectivo apps ${euro(b.appsUnpaidCash)} € · Esperado cajón ${euro(b.expectedCash)} € · Contado ${euro(b.countedCash)} €`,
      });
      push({
        Seccion: '03 · Cajón TPV e integradores (mes)',
        Periodo: `${b.label} ${year}`,
        Tienda: 'Todas',
        Concepto: 'Total operativo mes (TPV ventas + apps)',
        Entradas: round2(b.tpvSales + b.appsTotal),
        Salidas: 0,
        Neto: round2(b.tpvSales + b.appsTotal),
        Saldo: '',
        Notas: `TPV ${euro(b.tpvSales)} € + Apps ${euro(b.appsTotal)} € · Descuadre abs. ${euro(b.diffAbs)} €`,
      });
    }

    // ── 4) Por tienda ─────────────────────────────────────────────────────
    const stores = [...byStore.values()].sort((a, b) => (b.tpvSales + b.appsTotal) - (a.tpvSales + a.appsTotal));
    for (const st of stores) {
      push({
        Seccion: '04 · Por tienda (cierres del año)',
        Periodo: String(year),
        Tienda: st.name,
        Concepto: 'TPV + apps + cajón',
        Entradas: round2(st.cashIn + st.appsTotal),
        Salidas: round2(st.cashOut),
        Neto: round2(st.tpvSales + st.appsTotal),
        Saldo: '',
        Notas: `Turnos ${st.turns} · TPV ${euro(st.tpvSales)} € · Apps ${euro(st.appsTotal)} € · Dif. acumulada ${euro(st.diff)} € · Con descuadre ${st.turnsWithDiff}`,
      });
    }

    // ── 5) Descuadres ─────────────────────────────────────────────────────
    const diffs = closed
      .map((s) => {
        const expected = Number(s.expectedCash ?? 0);
        const counted = Number(s.finalCashAmount ?? 0);
        const diff = Number(s.difference ?? counted - expected);
        return { s, diff, expected, counted };
      })
      .filter((x) => Math.abs(x.diff) > 0.009)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 40);

    for (const x of diffs) {
      push({
        Seccion: '05 · Descuadres de caja',
        Periodo: String(x.s.closedAt || x.s.openedAt || '').slice(0, 10),
        Tienda: x.s.pointOfSaleName || x.s.pointOfSaleId || '',
        Concepto: `Turno ${x.s.workerName || '—'}`,
        Entradas: x.diff > 0 ? round2(x.diff) : 0,
        Salidas: x.diff < 0 ? round2(Math.abs(x.diff)) : 0,
        Neto: round2(x.diff),
        Saldo: '',
        Notas: `Esperado ${euro(x.expected)} € · Contado ${euro(x.counted)} €`,
      });
    }
    if (!diffs.length) {
      push({
        Seccion: '05 · Descuadres de caja',
        Periodo: String(year),
        Tienda: '—',
        Concepto: 'Sin descuadres',
        Entradas: 0,
        Salidas: 0,
        Neto: 0,
        Saldo: '',
        Notas: 'Todos los turnos cerrados cuadran (diferencia 0).',
      });
    }

    // ── 6) Categorías contables ───────────────────────────────────────────
    const topCobros = [...byCobroCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [cat, total] of topCobros) {
      push({
        Seccion: '06 · Entradas contables por categoría',
        Periodo: String(year),
        Tienda: '—',
        Concepto: cat,
        Entradas: total,
        Salidas: 0,
        Neto: total,
        Saldo: '',
        Notas: 'Cobros del libro de finanzas',
      });
    }
    const topPagos = [...byPayCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [cat, total] of topPagos) {
      push({
        Seccion: '07 · Salidas contables por categoría',
        Periodo: String(year),
        Tienda: '—',
        Concepto: cat,
        Entradas: 0,
        Salidas: total,
        Neto: round2(-total),
        Saldo: '',
        Notas: 'Pagos del libro de finanzas',
      });
    }

    ctx.onProgress?.(95, 'Componiendo informe…');
    return {
      rows,
      reportTitle: `Flujo de caja ${year}`,
      summary:
        `${year}: neto contable ${euro(cf.netCashFlow)} € · `
        + `cajón neto ${euro(tpvCashInYear - tpvCashOutYear)} € · `
        + `apps ${euro(appsYear)} € · `
        + `${turnsYear} turnos · ${turnsDiffYear} descuadres · `
        + `${stores.length} tiendas. Informe operativo (no es el dashboard).`,
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
