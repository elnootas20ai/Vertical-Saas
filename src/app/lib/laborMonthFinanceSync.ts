/**
 * Cierre mensual de personal → gasto en finanzas (idempotente por empresa + mes).
 * Usa coste empresa estimado (bruto medio + SS empresa + otros) o coste por horas fichadas.
 */
import { createFinanceMovementInCouch, listFinanceMovements } from './financeApi';
import type { FinanceMovementScope } from './financeScope';
import type { FinanceMovementRecord } from './financeTypes';
import { computeLaborCostBreakdown } from './laborCost';
import type { EmploymentInfo } from './authApi';
import { fetchLaborCost, fetchPayrollSummary } from './clockinsApi';
import { listStaffConsumptionsRequest } from './deliveryApi';

export type LaborCloseMode = 'estimated_salary' | 'actual_hours';

export function laborMonthFinanceRef(businessId: string, period: string): string {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  return `PERSONAL-${bid}-${period}`;
}

export function periodMonthBounds(period: string): { from: string; to: string; date: string } | null {
  const m = String(period || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${m}-01`,
    to: `${m}-${pad(lastDay)}`,
    date: `${m}-${pad(lastDay)}`,
  };
}

export async function hasLaborMonthExpense(
  userId: string,
  businessId: string,
  period: string,
  existing?: FinanceMovementRecord[],
): Promise<boolean> {
  const ref = laborMonthFinanceRef(businessId, period);
  try {
    const movements = existing || await listFinanceMovements(userId);
    return movements.some(
      (mov) =>
        (mov.source === 'labor_month' && mov.sourceRef === `${businessId}:${period}`)
        || mov.reference === ref
        || String(mov.notes || '').includes(`labor_month:${businessId}:${period}`),
    );
  } catch {
    return false;
  }
}

export interface LaborMonthClosePreview {
  period: string;
  mode: LaborCloseMode;
  membersTotal: number;
  membersWithSalary: number;
  grossTotal: number;
  employerSsTotal: number;
  otherTotal: number;
  overtimeCost: number;
  payrollDeductions: number;
  /** Coste neto a registrar: sueldos+SS+extras − consumos a nómina */
  totalEmployerCost: number;
  currency: string;
  lines: Array<{ name: string; amount: number }>;
  alreadyPosted: boolean;
}

function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

export async function previewLaborMonthClose(
  userId: string,
  businessId: string,
  period: string,
  members: Array<{ user_id: string; fullName?: string; name?: string; employment?: EmploymentInfo | null }>,
  mode: LaborCloseMode = 'estimated_salary',
): Promise<LaborMonthClosePreview> {
  const bounds = periodMonthBounds(period);
  if (!bounds) {
    throw new Error('Periodo inválido (usa YYYY-MM)');
  }

  const alreadyPosted = await hasLaborMonthExpense(userId, businessId, period);
  const lines: Array<{ name: string; amount: number }> = [];
  let grossTotal = 0;
  let employerSsTotal = 0;
  let otherTotal = 0;
  let baseEmployerCost = 0;
  let overtimeCost = 0;
  let payrollDeductions = 0;
  let membersWithSalary = 0;
  let currency = 'EUR';

  const hourlyByMember = new Map<string, number>();

  if (mode === 'actual_hours') {
    const labor = await fetchLaborCost(businessId, { from: bounds.from, to: bounds.to });
    currency = labor.summary.cost_currency || 'EUR';
    for (const row of labor.members) {
      if (!row.has_salary_data) continue;
      const amount = Number(row.actual_employer_cost || 0);
      if (!(amount > 0)) continue;
      membersWithSalary += 1;
      baseEmployerCost += amount;
      grossTotal += Number(row.actual_gross_cost || 0);
      employerSsTotal += Math.max(0, amount - Number(row.actual_gross_cost || 0));
      if (row.hourly_employer_cost != null) {
        hourlyByMember.set(row.member_id, Number(row.hourly_employer_cost));
      }
      lines.push({ name: row.member_name || row.member_id, amount: round2(amount) });
    }
  } else {
    for (const member of members) {
      const emp = member.employment;
      if (!emp) continue;
      const breakdown = computeLaborCostBreakdown(emp);
      if (!breakdown) continue;
      membersWithSalary += 1;
      currency = breakdown.costCurrency || currency;
      grossTotal += breakdown.monthlyAverageGross;
      employerSsTotal += breakdown.socialSecurityCost;
      otherTotal += breakdown.otherCosts;
      baseEmployerCost += breakdown.totalMonthlyEmployerCost;
      hourlyByMember.set(member.user_id, breakdown.hourlyEmployerCost);
      lines.push({
        name: member.fullName || member.name || member.user_id,
        amount: breakdown.totalMonthlyEmployerCost,
      });
    }
  }

  // Horas extra → coste adicional (best-effort; si falla el resumen, se ignora)
  try {
    const { summaries } = await fetchPayrollSummary(businessId, period);
    for (const row of summaries || []) {
      const minutes = Number(row.total_overtime_minutes || 0);
      if (!(minutes > 0)) continue;
      const hourly = hourlyByMember.get(row.member_id)
        ?? Number(row.labor_cost?.hourly_employer_cost || 0);
      if (!(hourly > 0)) continue;
      const extra = round2((minutes / 60) * hourly);
      if (!(extra > 0)) continue;
      overtimeCost += extra;
      lines.push({
        name: `Extras · ${row.member_name || row.member_id}`,
        amount: extra,
      });
    }
  } catch {
    /* sin permiso de resumen o sin horarios */
  }

  // Consumos equipo a descontar de nómina → bajan el gasto de personal del mes
  try {
    const { items } = await listStaffConsumptionsRequest(userId, { month: period });
    const bid = String(businessId || '').replace(/^business:/, '').trim();
    for (const item of items || []) {
      if (String(item.paymentMode || '') !== 'payroll_deduction') continue;
      const itemBid = String((item as { business_id?: string; businessId?: string }).business_id
        || (item as { businessId?: string }).businessId || '').replace(/^business:/, '').trim();
      if (bid && itemBid && itemBid !== bid) continue;
      const amount = Number(item.total || 0);
      if (!(amount > 0)) continue;
      payrollDeductions += amount;
    }
    payrollDeductions = round2(payrollDeductions);
    if (payrollDeductions > 0) {
      lines.push({ name: 'Descuentos consumo equipo (−)', amount: -payrollDeductions });
    }
  } catch {
    /* sin consumos o API no disponible */
  }

  const totalEmployerCost = round2(Math.max(0, baseEmployerCost + overtimeCost - payrollDeductions));

  return {
    period,
    mode,
    membersTotal: members.length,
    membersWithSalary,
    grossTotal: round2(grossTotal),
    employerSsTotal: round2(employerSsTotal),
    otherTotal: round2(otherTotal),
    overtimeCost: round2(overtimeCost),
    payrollDeductions,
    totalEmployerCost,
    currency,
    lines: lines.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    alreadyPosted,
  };
}

export async function ensureLaborMonthExpense(
  userId: string,
  businessId: string,
  period: string,
  members: Array<{ user_id: string; fullName?: string; name?: string; employment?: EmploymentInfo | null }>,
  options: {
    mode?: LaborCloseMode;
    businessName?: string;
    scope?: FinanceMovementScope;
    force?: boolean;
  } = {},
): Promise<{ created: boolean; preview: LaborMonthClosePreview; movement?: FinanceMovementRecord }> {
  const mode = options.mode || 'estimated_salary';
  const preview = await previewLaborMonthClose(userId, businessId, period, members, mode);
  const bounds = periodMonthBounds(period);
  if (!bounds) throw new Error('Periodo inválido (usa YYYY-MM)');

  if (preview.alreadyPosted && !options.force) {
    return { created: false, preview };
  }
  if (!(preview.totalEmployerCost > 0.009)) {
    throw new Error('No hay coste laboral que registrar (revisa sueldos en fichas del equipo)');
  }

  const ref = laborMonthFinanceRef(businessId, period);
  const [y, mo] = period.split('-');
  const monthLabel = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });
  const modeLabel = mode === 'actual_hours' ? 'horas fichadas' : 'sueldo estimado';

  const movement = await createFinanceMovementInCouch(userId, {
    type: 'pago',
    user_id: userId,
    concept: `Personal ${monthLabel} (${modeLabel})`,
    reference: ref,
    category: 'personal',
    amountBase: preview.totalEmployerCost,
    taxRate: 0,
    date: bounds.date,
    payMethod: 'transferencia',
    notes: `labor_month:${businessId}:${period} · trabajadores=${preview.membersWithSalary} · bruto≈${preview.grossTotal} · SS≈${preview.employerSsTotal} · extras≈${preview.overtimeCost} · descuentos≈${preview.payrollDeductions}`,
    status: 'paid',
    source: 'labor_month',
    sourceRef: `${businessId}:${period}`,
    businessId: String(businessId || '').replace(/^business:/, '').trim() || undefined,
    businessName: options.businessName || options.scope?.businessName,
    workCenterId: options.scope?.workCenterId,
    workCenterName: options.scope?.workCenterName,
  });

  return { created: true, preview: { ...preview, alreadyPosted: true }, movement };
}
