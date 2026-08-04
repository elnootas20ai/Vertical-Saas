/**
 * Core — devengo de vacaciones (días por mes según alta + prorrata de jornada).
 * Referencia: jornada completa = 40 h/semana → 2,5 d/mes (30 naturales/año).
 * Media jornada / menos horas → proporcional (p. ej. 20 h → 1,25 d/mes).
 */

export type VacationAccrualMode = 'annual_fixed' | 'monthly';

/** Horas semanales de referencia para jornada completa (España habitual). */
export const DEFAULT_FULL_TIME_WEEKLY_HOURS = 40;

export interface VacationAccrualSettingsLike {
  defaultDaysPerYear: number;
  /** Si existe, override manual del cupo anual (sin prorrata). */
  allowances?: Record<string, number>;
  accrualMode?: VacationAccrualMode;
  /** Días a jornada completa que se suman cada mes (p. ej. 30/12 = 2,5). */
  daysPerMonth?: number;
  /** Horas/semana = 100 % del cupo. Por defecto 40. */
  fullTimeWeeklyHours?: number;
}

/** Datos de contrato para prorratear el cupo. */
export type VacationContractInput = {
  /** Horas semanales del contrato (prioridad máxima). */
  hoursPerWeek?: number | null;
  /** completa | media | parcial | flexible */
  workday?: string | null;
  /** Horas del horario asignado (si no hay hoursPerWeek en ficha). */
  scheduleWeeklyHours?: number | null;
};

export type VacationAccrualOptions = {
  startDate?: string;
  endDate?: string;
  year?: number;
  asOf?: Date | string;
  contract?: VacationContractInput | null;
};

function round1(n: number): number {
  return Math.round(Number(n) * 10) / 10;
}

function parseDay(iso: string): Date | null {
  const s = String(iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Días de calendario inclusivos (evita fallos por DST). */
function calendarDaysInclusive(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((b0 - a0) / 86_400_000) + 1;
}

/**
 * Meses fraccionados de alta dentro de `year`, hasta `asOf` (inclusive).
 * Ej.: alta 15-ene, asOf 31-ene → ~0.55 mes; alta 1-ene a 30-jun → 6.
 * Sin fecha de alta → 0 (nunca inventar “desde el 1 de enero”).
 */
export function countAccrualMonthsInYear(
  startDate: string | undefined,
  endDate: string | undefined,
  year: number,
  asOf: Date = new Date(),
): number {
  const fromRaw = parseDay(String(startDate || '').trim());
  if (!fromRaw) return 0;

  const yearStart = new Date(year, 0, 1, 12, 0, 0);
  const yearEnd = new Date(year, 11, 31, 12, 0, 0);

  let from = fromRaw;
  if (from < yearStart) from = yearStart;

  let to = asOf;
  if (to > yearEnd) to = yearEnd;
  const contractEnd = parseDay(endDate || '');
  if (contractEnd && contractEnd < to) to = contractEnd;

  if (to < from) return 0;

  let months = 0;
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1, 12, 0, 0);

  while (cursor <= to) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    if (y !== year) {
      cursor.setMonth(cursor.getMonth() + 1);
      continue;
    }
    const dim = daysInMonth(y, m);
    const monthStart = new Date(y, m, 1, 12, 0, 0);
    const monthEnd = new Date(y, m, dim, 12, 0, 0);
    const overlapStart = from > monthStart ? from : monthStart;
    const overlapEnd = to < monthEnd ? to : monthEnd;
    if (overlapEnd >= overlapStart) {
      const activeDays = calendarDaysInclusive(overlapStart, overlapEnd);
      months += Math.min(1, Math.max(0, activeDays / dim));
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return Math.round(months * 1000) / 1000;
}

/**
 * Meses de alta ya completados en el año (enteros).
 * Con 1 día de alta → 0; al cumplir ~1 mes → 1 → se carga el primer bloque (p. ej. 2,5 d).
 */
export function countCompletedAccrualMonths(
  startDate: string | undefined,
  endDate: string | undefined,
  year: number,
  asOf: Date = new Date(),
): number {
  const exact = countAccrualMonthsInYear(startDate, endDate, year, asOf);
  return Math.max(0, Math.floor(exact + 1e-9));
}

export function resolveFullTimeWeeklyHours(settings?: VacationAccrualSettingsLike | null): number {
  const n = Number(settings?.fullTimeWeeklyHours);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_FULL_TIME_WEEKLY_HOURS;
}

/**
 * Horas semanales del contrato.
 * Prioridad: hoursPerWeek → horario asignado → jornada (completa 40 / media-parcial 20).
 * `null` = no se puede calcular (falta dato en RRHH).
 */
export function resolveWeeklyContractHours(
  contract?: VacationContractInput | null,
  fullTimeHours: number = DEFAULT_FULL_TIME_WEEKLY_HOURS,
): number | null {
  const ft = fullTimeHours > 0 ? fullTimeHours : DEFAULT_FULL_TIME_WEEKLY_HOURS;
  const explicit = Number(contract?.hoursPerWeek);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(60, Math.max(0.5, explicit));
  }

  const schedule = Number(contract?.scheduleWeeklyHours);
  if (Number.isFinite(schedule) && schedule > 0) {
    return Math.min(60, Math.max(0.5, schedule));
  }

  const wd = String(contract?.workday || '').trim().toLowerCase();
  if (wd === 'completa') return ft;
  if (wd === 'media' || wd === 'parcial') return round1(ft / 2);
  // flexible / vacío → hace falta hoursPerWeek
  return null;
}

/** Factor 0–1 respecto a jornada completa (40 h). */
export function resolveFteFactor(
  contract?: VacationContractInput | null,
  fullTimeHours: number = DEFAULT_FULL_TIME_WEEKLY_HOURS,
): number | null {
  const hours = resolveWeeklyContractHours(contract, fullTimeHours);
  if (hours == null) return null;
  const ft = fullTimeHours > 0 ? fullTimeHours : DEFAULT_FULL_TIME_WEEKLY_HOURS;
  return Math.min(1, Math.max(0, hours / ft));
}

export function resolveDaysPerMonth(settings: VacationAccrualSettingsLike): number {
  const explicit = Number(settings.daysPerMonth);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const annual = Number(settings.defaultDaysPerYear) || 22;
  return Math.round((annual / 12) * 100) / 100;
}

export function resolveAccrualMode(settings: VacationAccrualSettingsLike): VacationAccrualMode {
  return settings.accrualMode === 'monthly' ? 'monthly' : 'annual_fixed';
}

/**
 * Días de vacaciones disponibles en el año (devengados o cupo fijo),
 * prorrateados por jornada (horas/semana ÷ 40).
 * `allowances[memberId]` = override manual (cupo fijo, sin prorrata).
 */
export function computeAccruedVacationDays(
  settings: VacationAccrualSettingsLike,
  memberId: string,
  options: VacationAccrualOptions = {},
): number {
  const year = options.year ?? new Date().getFullYear();
  const asOf = typeof options.asOf === 'string'
    ? (parseDay(options.asOf) || new Date())
    : (options.asOf || new Date());

  const manual = settings.allowances?.[memberId];
  if (manual != null && Number.isFinite(Number(manual))) {
    return Math.max(0, Number(manual));
  }

  const annualFull = Math.max(0, Number(settings.defaultDaysPerYear) || 22);
  const mode = resolveAccrualMode(settings);
  const ftHours = resolveFullTimeWeeklyHours(settings);
  const fte = resolveFteFactor(options.contract, ftHours);

  // Sin jornada/horas conocidas: no inventar cupo a tiempo completo.
  if (fte == null) {
    return 0;
  }

  const annualCap = round1(annualFull * fte);

  // Sin fecha de alta: no inventar cupo (ni mensual ni anual fijo).
  if (!String(options.startDate || '').trim()) {
    return 0;
  }

  // Solo meses completos de alta: con 1 día laboral → 0 d (no 14/15 “de regalo”).
  const months = countCompletedAccrualMonths(options.startDate, options.endDate, year, asOf);

  // Ambos modos cargan según política y tiempo de alta (tope = cupo anual × FTE).
  if (mode !== 'monthly') {
    const fraction = Math.min(1, Math.max(0, months / 12));
    return Math.min(annualCap, Math.max(0, round1(annualCap * fraction)));
  }

  const perMonthFull = resolveDaysPerMonth(settings);
  const perMonth = perMonthFull * fte;
  const accrued = round1(months * perMonth);
  return Math.min(annualCap, Math.max(0, accrued));
}

export interface VacationBalance {
  accrued: number;
  used: number;
  pending: number;
  /** Saldo bruto (puede ser fracción). */
  remaining: number;
  /**
   * Días enteros que se pueden pedir ya.
   * No se pide 1 día con 0,3 generados solo por darse de alta.
   */
  requestable: number;
  /** Meses de alta completados en el año (base del cargo). */
  completedMonths: number;
  /** Progreso del mes en curso 0–1 (informativo; aún no suma al saldo). */
  monthProgress: number;
  /** Días/mes ya prorrateados a la jornada del trabajador. */
  daysPerMonth: number;
  /** Días/mes a jornada completa (política empresa). */
  fullTimeDaysPerMonth: number;
  mode: VacationAccrualMode;
  fteFactor: number | null;
  hoursPerWeek: number | null;
  annualCap: number;
}

export function computeVacationBalance(
  settings: VacationAccrualSettingsLike,
  memberId: string,
  usedDays: number,
  pendingDays = 0,
  options: VacationAccrualOptions = {},
): VacationBalance {
  const ftHours = resolveFullTimeWeeklyHours(settings);
  const hoursPerWeek = resolveWeeklyContractHours(options.contract, ftHours);
  const fteFactor = resolveFteFactor(options.contract, ftHours);
  const fullTimeDaysPerMonth = resolveDaysPerMonth(settings);
  const annualFull = Math.max(0, Number(settings.defaultDaysPerYear) || 22);
  const annualCap = fteFactor == null ? 0 : round1(annualFull * fteFactor);

  const year = options.year ?? new Date().getFullYear();
  const asOf = typeof options.asOf === 'string'
    ? (parseDay(options.asOf) || new Date())
    : (options.asOf || new Date());
  const monthsExact = countAccrualMonthsInYear(options.startDate, options.endDate, year, asOf);
  const completedMonths = Math.max(0, Math.floor(monthsExact + 1e-9));
  const monthProgress = Math.max(0, Math.min(1, round1(monthsExact - completedMonths)));

  const accrued = computeAccruedVacationDays(settings, memberId, options);
  const used = Math.max(0, Number(usedDays) || 0);
  // Informativo: pendientes NO reservan saldo. Solo descuenta lo aprobado por RRHH.
  const pending = Math.max(0, Number(pendingDays) || 0);
  const remaining = Math.max(0, round1(accrued - used));
  return {
    accrued,
    used,
    pending,
    remaining,
    requestable: Math.max(0, Math.floor(remaining + 1e-9)),
    completedMonths,
    monthProgress,
    daysPerMonth: fteFactor == null ? 0 : round1(fullTimeDaysPerMonth * fteFactor),
    fullTimeDaysPerMonth,
    mode: resolveAccrualMode(settings),
    fteFactor,
    hoursPerWeek,
    annualCap,
  };
}
