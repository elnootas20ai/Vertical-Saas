/**
 * Core — estimación de coste laboral (bruto + SS empresa + otros).
 * Aplicable a todas las verticales; no acoplado a delivery.
 */

export const MONTHLY_HOURS_BY_WORKDAY = {
  completa: 174,
  parcial: 87,
  media: 87,
  flexible: 174,
};

/** Cuota empresarial SS aproximada sobre base de cotización (España, general). */
export const DEFAULT_EMPLOYER_SS_RATE = 0.315;

/** Cuota SS trabajador régimen general (aprox.). */
export const DEFAULT_EMPLOYEE_SS_RATE = 0.0635;

/** IRPF medio orientativo si no hay % en ficha. */
export const DEFAULT_IRPF_RATE = 0.15;

export const EMPLOYER_SS_RATE_BY_CONTRACT = {
  practicas: 0.236,
  formacion: 0.236,
  autonomo: 0,
};

/** Estimación mensual mutua AT/EP cuando hay mutua indicada. */
export const DEFAULT_MUTUAL_INSURANCE_MONTHLY = 45;

/** Pagas al año habituales en España (12 mensuales + extras). */
export const DEFAULT_PAY_PERIODS_BY_CONTRACT = {
  indefinido: 14,
  temporal: 14,
  practicas: 12,
  formacion: 12,
  obra_servicio: 14,
  interinidad: 14,
  fijo_discontinuo: 14,
  autonomo: 12,
};

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Parsea salario en bruto mensual desde texto o número.
 * Soporta "1500", "1.500 €", "18000 anual", etc.
 */
export function parseSalaryToMonthlyGross(salaryRaw, options = {}) {
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

export function resolveMonthlyHours(workday, contractType) {
  const normalized = String(workday || '').trim().toLowerCase();
  if (normalized && MONTHLY_HOURS_BY_WORKDAY[normalized]) {
    return MONTHLY_HOURS_BY_WORKDAY[normalized];
  }
  if (contractType === 'practicas' || contractType === 'formacion') return 87;
  return MONTHLY_HOURS_BY_WORKDAY.completa;
}

export function resolvePayPeriodsPerYear(contractType, explicit) {
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 12 && n <= 16) return Math.round(n);
  const contract = String(contractType || '').trim().toLowerCase();
  return DEFAULT_PAY_PERIODS_BY_CONTRACT[contract] ?? 14;
}

export function resolveEmployerSocialSecurityRate(contributionGroup, contractType) {
  const contract = String(contractType || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(EMPLOYER_SS_RATE_BY_CONTRACT, contract)) {
    return EMPLOYER_SS_RATE_BY_CONTRACT[contract];
  }
  void contributionGroup;
  return DEFAULT_EMPLOYER_SS_RATE;
}

export function resolveEmployeeSocialSecurityRate(explicit, contractType) {
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 0 && n <= 0.2) return n;
  const contract = String(contractType || '').trim().toLowerCase();
  if (contract === 'autonomo') return 0;
  return DEFAULT_EMPLOYEE_SS_RATE;
}

export function resolveIrpfRate(explicit) {
  const n = Number(explicit);
  if (Number.isFinite(n) && n >= 0 && n <= 0.5) return n;
  return DEFAULT_IRPF_RATE;
}

export function estimateMutualInsuranceCost(mutualInsurance, existingOtherCosts) {
  if (existingOtherCosts != null && Number(existingOtherCosts) > 0) {
    return round2(Number(existingOtherCosts));
  }
  return String(mutualInsurance || '').trim() ? DEFAULT_MUTUAL_INSURANCE_MONTHLY : 0;
}

/**
 * Calcula desglose de coste laboral mensual a partir de employment.
 * @returns {object|null}
 */
export function computeLaborCostBreakdown(employment = {}) {
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
  // SS se paga cada mes y también en pagas extras → media mensual = bruto × tipo × (pagas/12)
  const socialSecurityCost = round2(grossMonthly * employerRate * prorrataFactor);
  const employeeSocialSecurity = round2(grossMonthly * employeeSsRate);
  const irpfWithholding = round2(grossMonthly * irpfRate);
  const estimatedNetMonthly = round2(Math.max(0, grossMonthly - employeeSocialSecurity - irpfWithholding));
  const otherCosts = estimateMutualInsuranceCost(
    employment.mutualInsurance,
    employment.otherCosts,
  );
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

/**
 * Enriquece employment con campos de coste calculados.
 */
export function applyLaborCostToEmployment(employment = {}) {
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

/**
 * Coste laboral real del periodo según minutos fichados.
 */
export function computePeriodLaborCost(employment = {}, workedMinutes = 0) {
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

export function computeTotalLaborCostFromEmployment(employment = {}) {
  const breakdown = computeLaborCostBreakdown(employment);
  if (!breakdown) return 0;
  return breakdown.totalMonthlyEmployerCost;
}
