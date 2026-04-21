import type { FinanceMovementRecord } from './financeTypes';

export { listFinanceMovements } from './financeApi';

export type ClientFinancialRiskLevel = 'low' | 'medium' | 'high';

export interface ClientFinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  movementCount: number;
  lastMovementDate: string | null;
  pendingAmount: number;
  overdueCount: number;
  riskLevel: ClientFinancialRiskLevel;
}

export interface TopClientRevenueRow {
  clientName: string;
  totalRevenue: number;
  movementCount: number;
  lastDate: string | null;
}

export interface ClientPaymentBehavior {
  avgDaysToPayment: number | null;
  onTimePercentage: number | null;
  totalPaid: number;
  totalPending: number;
}

export interface ClientRiskRow {
  clientName: string;
  riskLevel: ClientFinancialRiskLevel;
  overdueAmount: number;
  overdueCount: number;
  totalRevenue: number;
}

function normalizeKey(name: string | undefined): string {
  return (name || '').trim();
}

function matchesClientName(companyName: string | undefined, clientName: string): boolean {
  const a = normalizeKey(companyName).toLowerCase();
  const q = normalizeKey(clientName).toLowerCase();
  if (!a || !q) return false;
  return a.includes(q) || q.includes(a);
}

function parseTime(value: string | undefined): number {
  if (!value) return NaN;
  const t = Date.parse(value);
  return Number.isNaN(t) ? NaN : t;
}

function maxDateString(dates: string[]): string | null {
  if (!dates.length) return null;
  let best = dates[0];
  let bestT = parseTime(best);
  for (let i = 1; i < dates.length; i++) {
    const t = parseTime(dates[i]);
    if (!Number.isNaN(t) && (Number.isNaN(bestT) || t > bestT)) {
      best = dates[i];
      bestT = t;
    }
  }
  return best || null;
}

function startOfDayMs(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isOnOrBeforeDue(paidAt: string, dueDate: string): boolean {
  const p = startOfDayMs(paidAt);
  const d = startOfDayMs(dueDate);
  if (Number.isNaN(p) || Number.isNaN(d)) return false;
  return p <= d;
}

function computeSummaryRiskLevel(params: {
  overdueCount: number;
  pendingCobroCount: number;
  overdueAmount: number;
  totalIncome: number;
}): ClientFinancialRiskLevel {
  const { overdueCount, pendingCobroCount, overdueAmount, totalIncome } = params;
  if (overdueCount === 0) return 'low';
  const overdueRatio =
    pendingCobroCount > 0 ? overdueCount / pendingCobroCount : overdueCount > 0 ? 1 : 0;
  const overdueShareOfIncome =
    totalIncome > 0 ? overdueAmount / totalIncome : overdueAmount > 0 ? 1 : 0;
  if (overdueRatio >= 0.5 || overdueShareOfIncome >= 0.2 || overdueAmount >= 5000) {
    return 'high';
  }
  if (overdueRatio >= 0.25 || overdueShareOfIncome >= 0.1 || overdueAmount >= 1000) {
    return 'medium';
  }
  return 'low';
}

function computeAssessmentRiskLevel(overdueAmount: number, totalRevenue: number): ClientFinancialRiskLevel {
  const share = totalRevenue > 0 ? overdueAmount / totalRevenue : overdueAmount > 0 ? 1 : 0;
  if (overdueAmount >= 5000 || share >= 0.25) return 'high';
  if (overdueAmount >= 1000 || share >= 0.1) return 'medium';
  return 'low';
}

/**
 * Resume ingresos, gastos y riesgo para un cliente (por coincidencia parcial e insensible a mayúsculas en `companyName`).
 */
export function getClientFinancialSummary(
  movements: FinanceMovementRecord[],
  clientName: string,
): ClientFinancialSummary {
  const clientMovements = movements.filter((m) => matchesClientName(m.companyName, clientName));
  const cobros = clientMovements.filter((m) => m.type === 'cobro');
  const pagos = clientMovements.filter((m) => m.type === 'pago');

  const totalIncome = cobros.reduce((sum, m) => sum + (Number(m.totalAmount) || 0), 0);
  const totalExpenses = pagos.reduce((sum, m) => sum + (Number(m.totalAmount) || 0), 0);
  const now = Date.now();

  const pendingCobros = cobros.filter((m) => m.status === 'pending');
  const pendingAmount = pendingCobros.reduce((sum, m) => sum + (Number(m.totalAmount) || 0), 0);

  let overdueCount = 0;
  let overdueAmountSum = 0;
  for (const m of pendingCobros) {
    const dueT = parseTime(m.dueDate);
    if (!Number.isNaN(dueT) && dueT < now) {
      overdueCount += 1;
      overdueAmountSum += Number(m.totalAmount) || 0;
    }
  }

  const dates = clientMovements.map((m) => m.date).filter(Boolean);
  const lastMovementDate = maxDateString(dates);

  const riskLevel = computeSummaryRiskLevel({
    overdueCount,
    pendingCobroCount: pendingCobros.length,
    overdueAmount: overdueAmountSum,
    totalIncome,
  });

  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    movementCount: clientMovements.length,
    lastMovementDate,
    pendingAmount,
    overdueCount,
    riskLevel,
  };
}

/**
 * Agrupa cobros por cliente y ordena por ingreso total.
 */
export function getTopClientsByRevenue(
  movements: FinanceMovementRecord[],
  limit = 10,
): TopClientRevenueRow[] {
  const cobros = movements.filter((m) => m.type === 'cobro');
  const byClient = new Map<
    string,
    { totalRevenue: number; movementCount: number; dates: string[] }
  >();

  for (const m of cobros) {
    const key = normalizeKey(m.companyName) || '(sin cliente)';
    const row = byClient.get(key) || { totalRevenue: 0, movementCount: 0, dates: [] };
    row.totalRevenue += Number(m.totalAmount) || 0;
    row.movementCount += 1;
    if (m.date) row.dates.push(m.date);
    byClient.set(key, row);
  }

  const list: TopClientRevenueRow[] = [];
  for (const [clientName, agg] of byClient) {
    list.push({
      clientName,
      totalRevenue: agg.totalRevenue,
      movementCount: agg.movementCount,
      lastDate: maxDateString(agg.dates),
    });
  }

  list.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return list.slice(0, Math.max(0, limit));
}

/**
 * Comportamiento de pago a partir de `dueDate` y `paidAt` en cobros pagados.
 */
export function getClientPaymentBehavior(
  movements: FinanceMovementRecord[],
  clientName: string,
): ClientPaymentBehavior {
  const cobros = movements.filter(
    (m) => m.type === 'cobro' && matchesClientName(m.companyName, clientName),
  );

  let totalPaid = 0;
  let totalPending = 0;
  const deltas: number[] = [];
  let onTime = 0;
  let onTimeDen = 0;

  for (const m of cobros) {
    if (m.status === 'pending') {
      totalPending += Number(m.totalAmount) || 0;
      continue;
    }
    totalPaid += Number(m.totalAmount) || 0;
    const due = m.dueDate;
    const paid = m.paidAt;
    if (!due || !paid) continue;
    const dueT = parseTime(due);
    const paidT = parseTime(paid);
    if (Number.isNaN(dueT) || Number.isNaN(paidT)) continue;
    const days = Math.round((paidT - dueT) / (24 * 60 * 60 * 1000));
    deltas.push(days);
    onTimeDen += 1;
    if (isOnOrBeforeDue(paid, due)) onTime += 1;
  }

  const avgDaysToPayment = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
  const onTimePercentage = onTimeDen > 0 ? (onTime / onTimeDen) * 100 : null;

  return {
    avgDaysToPayment,
    onTimePercentage,
    totalPaid,
    totalPending,
  };
}

/**
 * Clientes con cobros vencidos pendientes, ordenados por importe vencido.
 */
export function getClientRiskAssessment(movements: FinanceMovementRecord[]): ClientRiskRow[] {
  const cobros = movements.filter((m) => m.type === 'cobro');
  const now = Date.now();
  const byClient = new Map<
    string,
    { overdueAmount: number; overdueCount: number; totalRevenue: number }
  >();

  for (const m of cobros) {
    const key = normalizeKey(m.companyName) || '(sin cliente)';
    const row = byClient.get(key) || { overdueAmount: 0, overdueCount: 0, totalRevenue: 0 };
    const amt = Number(m.totalAmount) || 0;
    row.totalRevenue += amt;
    if (m.status === 'pending') {
      const dueT = parseTime(m.dueDate);
      if (!Number.isNaN(dueT) && dueT < now) {
        row.overdueCount += 1;
        row.overdueAmount += amt;
      }
    }
    byClient.set(key, row);
  }

  const out: ClientRiskRow[] = [];
  for (const [clientName, row] of byClient) {
    if (row.overdueCount === 0) continue;
    out.push({
      clientName,
      riskLevel: computeAssessmentRiskLevel(row.overdueAmount, row.totalRevenue),
      overdueAmount: row.overdueAmount,
      overdueCount: row.overdueCount,
      totalRevenue: row.totalRevenue,
    });
  }

  out.sort((a, b) => b.overdueAmount - a.overdueAmount);
  return out;
}

/**
 * Matriz de ingresos mensuales (solo cobros) por cliente para un año civil (fechas en UTC según `date`).
 */
export function getRevenueByClient(movements: FinanceMovementRecord[], year: number): Map<string, number[]> {
  const result = new Map<string, number[]>();

  for (const m of movements) {
    if (m.type !== 'cobro') continue;
    const d = new Date(m.date);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getUTCFullYear() !== year) continue;

    const clientKey = normalizeKey(m.companyName) || '(sin cliente)';
    let months = result.get(clientKey);
    if (!months) {
      months = Array.from({ length: 12 }, () => 0);
      result.set(clientKey, months);
    }
    const month = d.getUTCMonth();
    months[month] += Number(m.totalAmount) || 0;
  }

  return result;
}
