import type { EmploymentInfo } from './authApi';

export const MONTHLY_HOURS_BY_WORKDAY = {
  completa: 174,
  parcial: 87,
  media: 87,
  flexible: 174,
} as const;

export const DEFAULT_EMPLOYER_SS_RATE = 0.315;

/** Cuota SS trabajador régimen general (aprox. contingencias comunes + desempleo + FP). */
export const DEFAULT_EMPLOYEE_SS_RATE = 0.0635;

/** IRPF medio orientativo si no hay % en ficha (no sustituye modelo formal). */
export const DEFAULT_IRPF_RATE = 0.15;

export const EMPLOYER_SS_RATE_BY_CONTRACT: Record<string, number> = {
  practicas: 0.236,
  formacion: 0.236,
  autonomo: 0,
};

export const DEFAULT_MUTUAL_INSURANCE_MONTHLY = 45;

export const DEFAULT_PAY_PERIODS_BY_CONTRACT: Record<string, number> = {
  indefinido: 14,
  temporal: 14,
  practicas: 12,
  formacion: 12,
  obra_servicio: 14,
  interinidad: 14,
  fijo_discontinuo: 14,
  autonomo: 12,
};

export interface LaborCostBreakdown {
  grossMonthly: number;
  payPeriodsPerYear: number;
  extraPayCount: number;
  annualGross: number;
  monthlyAverageGross: number;
  socialSecurityCost: number;
  employeeSocialSecurity: number;
  irpfWithholding: number;
  estimatedNetMonthly: number;
  otherCosts: number;
  totalMonthlyEmployerCost: number;
  monthlyHours: number;
  hourlyGross: number;
  hourlyEmployerCost: number;
  employerRate: number;
  employeeSsRate: number;
  irpfRate: number;
  costCurrency: string;
  costPeriod: 'monthly' | 'annual';
}

export interface PeriodLaborCost extends LaborCostBreakdown {
  workedHours: number;
  actualGrossCost: number;
  actualEmployerCost: number;
}

function round2(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

export function parseSalaryToMonthlyGross(
  salaryRaw: string | number | null | undefined,
  options: { forceAnnual?: boolean } = {},
): number | null {
  if (salaryRaw == null || salaryRaw === '') return null;

  if (typeof salaryRaw === 'number' && Number.isFinite(salaryRaw) && salaryRaw > 0) {
    const forceAnnual = options.forceAnnual === true;
    return forceAnnual ? round2(salaryRaw / 12) : round2(salaryRaw);
  }

  const text = String(salaryRaw).trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const isAnnual = options.forceAnnual === true
    || /\b(anual|año|year)\b/.test(lower)
    || /\bbruto\s*anual\b/.test(lower);

  let numStr = text.replace(/[^\d.,]/g, '');
  if (!numStr) return null;

  const lastComma = numStr.lastIndexOf(',');
  const lastDot = numStr.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const parts = numStr.split(',');
    numStr = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0].replace(/\./g, '')}.${parts[1]}`
      : numStr.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const parts = numStr.split('.');
    if (parts.length > 2) {
      numStr = numStr.replace(/\./g, '');
    } else if (parts.length === 2 && parts[1].length === 3 && !isAnnual) {
      numStr = numStr.replace(/\./g, '');
    }
  }

  const amount = Number(numStr);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (isAnnual) return round2(amount / 12);
  if (amount >= 6000 && !/\bm(es|ensual|\/mes)\b/.test(lower)) {
    return round2(amount / 12);
  }

  return round2(amount);
}

export function resolveMonthlyHours(workday?: string, contractType?: string): number {
  const normalized = String(workday || '').trim().toLowerCase();
  if (normalized && normalized in MONTHLY_HOURS_BY_WORKDAY) {
    return MONTHLY_HOURS_BY_WORKDAY[normalized as keyof typeof MONTHLY_HOURS_BY_WORKDAY];
  }
  if (contractType === 'practicas' || contractType === 'formacion') return 87;
  return MONTHLY_HOURS_BY_WORKDAY.completa;
}

export function resolvePayPeriodsPerYear(contractType?: string, explicit?: number | string): number {
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 12 && n <= 16) return Math.round(n);
  const contract = String(contractType || '').trim().toLowerCase();
  return DEFAULT_PAY_PERIODS_BY_CONTRACT[contract] ?? 14;
}

export function resolveEmployerSocialSecurityRate(
  contributionGroup?: string,
  contractType?: string,
): number {
  const contract = String(contractType || '').trim().toLowerCase();
  if (contract in EMPLOYER_SS_RATE_BY_CONTRACT) {
    return EMPLOYER_SS_RATE_BY_CONTRACT[contract];
  }
  void contributionGroup;
  return DEFAULT_EMPLOYER_SS_RATE;
}

export function estimateMutualInsuranceCost(
  mutualInsurance?: string,
  existingOtherCosts?: number,
): number {
  if (existingOtherCosts != null && Number(existingOtherCosts) > 0) {
    return round2(Number(existingOtherCosts));
  }
  return String(mutualInsurance || '').trim() ? DEFAULT_MUTUAL_INSURANCE_MONTHLY : 0;
}

export function resolveEmployeeSocialSecurityRate(
  explicit?: number | string,
  contractType?: string,
): number {
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 0 && n <= 0.2) return n;
  const contract = String(contractType || '').trim().toLowerCase();
  if (contract === 'autonomo') return 0;
  return DEFAULT_EMPLOYEE_SS_RATE;
}

export function resolveIrpfRate(explicit?: number | string): number {
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 0 && n <= 0.5) return n;
  return DEFAULT_IRPF_RATE;
}

export function computeLaborCostBreakdown(employment: Partial<EmploymentInfo> = {}): LaborCostBreakdown | null {
  const contractType = String(employment.contractType || '').trim().toLowerCase();
  const workday = String(employment.workday || '').trim().toLowerCase();

  const grossMonthly = employment.grossSalary != null && Number(employment.grossSalary) > 0
    ? round2(Number(employment.grossSalary))
    : parseSalaryToMonthlyGross(employment.salary);

  if (!grossMonthly) return null;

  const payPeriodsPerYear = resolvePayPeriodsPerYear(contractType, employment.payPeriodsPerYear);
  const prorrataFactor = payPeriodsPerYear / 12;
  const extraPayCount = Math.max(0, payPeriodsPerYear - 12);
  const annualGross = round2(grossMonthly * payPeriodsPerYear);
  const monthlyAverageGross = round2(grossMonthly * prorrataFactor);

  const monthlyHours = resolveMonthlyHours(workday, contractType);
  const employerRate = resolveEmployerSocialSecurityRate(employment.contributionGroup, contractType);
  const employeeSsRate = resolveEmployeeSocialSecurityRate(employment.employeeSsRate, contractType);
  const irpfRate = resolveIrpfRate(employment.irpfRate);
  const socialSecurityCost = round2(grossMonthly * employerRate * prorrataFactor);
  const employeeSocialSecurity = round2(grossMonthly * employeeSsRate);
  const irpfWithholding = round2(grossMonthly * irpfRate);
  const estimatedNetMonthly = round2(Math.max(0, grossMonthly - employeeSocialSecurity - irpfWithholding));
  const otherCosts = estimateMutualInsuranceCost(employment.mutualInsurance, employment.otherCosts);
  const totalMonthlyEmployerCost = round2(monthlyAverageGross + socialSecurityCost + otherCosts);
  const hourlyGross = monthlyHours > 0 ? round2(monthlyAverageGross / monthlyHours) : 0;
  const hourlyEmployerCost = monthlyHours > 0 ? round2(totalMonthlyEmployerCost / monthlyHours) : 0;

  return {
    grossMonthly,
    payPeriodsPerYear,
    extraPayCount,
    annualGross,
    monthlyAverageGross,
    socialSecurityCost,
    employeeSocialSecurity,
    irpfWithholding,
    estimatedNetMonthly,
    otherCosts,
    totalMonthlyEmployerCost,
    monthlyHours,
    hourlyGross,
    hourlyEmployerCost,
    employerRate,
    employeeSsRate,
    irpfRate,
    costCurrency: employment.costCurrency || 'EUR',
    costPeriod: 'monthly',
  };
}

export function applyLaborCostToEmployment<T extends Partial<EmploymentInfo>>(employment: T): T {
  if (!employment || typeof employment !== 'object') return employment;

  const breakdown = computeLaborCostBreakdown(employment);
  if (!breakdown) return employment;

  return {
    ...employment,
    grossSalary: breakdown.grossMonthly,
    payPeriodsPerYear: breakdown.payPeriodsPerYear,
    socialSecurityCost: breakdown.socialSecurityCost,
    employeeSsRate: breakdown.employeeSsRate,
    irpfRate: breakdown.irpfRate,
    otherCosts: breakdown.otherCosts,
    costCurrency: employment.costCurrency || breakdown.costCurrency,
    costPeriod: employment.costPeriod || breakdown.costPeriod,
    lastCostReview: new Date().toISOString(),
  };
}

export function computePeriodLaborCost(
  employment: Partial<EmploymentInfo> = {},
  workedMinutes = 0,
): PeriodLaborCost | null {
  const breakdown = computeLaborCostBreakdown(employment);
  if (!breakdown) return null;

  const hours = Math.max(0, Number(workedMinutes) || 0) / 60;
  return {
    ...breakdown,
    workedHours: round2(hours),
    actualGrossCost: round2(hours * breakdown.hourlyGross),
    actualEmployerCost: round2(hours * breakdown.hourlyEmployerCost),
  };
}

export function computeTotalLaborCost(employment: Partial<EmploymentInfo> = {}): number {
  const breakdown = computeLaborCostBreakdown(employment);
  if (!breakdown) return 0;
  return breakdown.totalMonthlyEmployerCost;
}

export function formatLaborCurrency(value: number | null | undefined, currency = 'EUR'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
}
