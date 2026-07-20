/**
 * Core — devengo de vacaciones (días por mes según alta).
 * Independiente de vertical; usable desde vacationsApi / UI.
 */

export type VacationAccrualMode = 'annual_fixed' | 'monthly';

export interface VacationAccrualSettingsLike {
  defaultDaysPerYear: number;
  /** Si existe, override manual del cupo anual (sin prorrata). */
  allowances?: Record<string, number>;
  accrualMode?: VacationAccrualMode;
  /** Días laborables que se suman cada mes completo (p. ej. 22/12 ≈ 1.83 o 2). */
  daysPerMonth?: number;
}

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
 */
export function countAccrualMonthsInYear(
  startDate: string | undefined,
  endDate: string | undefined,
  year: number,
  asOf: Date = new Date(),
): number {
  const yearStart = new Date(year, 0, 1, 12, 0, 0);
  const yearEnd = new Date(year, 11, 31, 12, 0, 0);

  let from = parseDay(startDate || `${year}-01-01`) || yearStart;
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
 * Días de vacaciones disponibles en el año (devengados o cupo fijo).
 * `allowances[memberId]` sigue siendo override manual (cupo fijo anual).
 */
export function computeAccruedVacationDays(
  settings: VacationAccrualSettingsLike,
  memberId: string,
  options: {
    startDate?: string;
    endDate?: string;
    year?: number;
    asOf?: Date | string;
  } = {},
): number {
  const year = options.year ?? new Date().getFullYear();
  const asOf = typeof options.asOf === 'string'
    ? (parseDay(options.asOf) || new Date())
    : (options.asOf || new Date());

  const manual = settings.allowances?.[memberId];
  if (manual != null && Number.isFinite(Number(manual))) {
    return Math.max(0, Number(manual));
  }

  const annual = Math.max(0, Number(settings.defaultDaysPerYear) || 22);
  const mode = resolveAccrualMode(settings);

  if (mode !== 'monthly') {
    return annual;
  }

  const months = countAccrualMonthsInYear(options.startDate, options.endDate, year, asOf);
  const perMonth = resolveDaysPerMonth(settings);
  const accrued = round1(months * perMonth);
  // No superar el cupo anual configurado
  return Math.min(annual, Math.max(0, accrued));
}

export interface VacationBalance {
  accrued: number;
  used: number;
  pending: number;
  remaining: number;
  daysPerMonth: number;
  mode: VacationAccrualMode;
}

export function computeVacationBalance(
  settings: VacationAccrualSettingsLike,
  memberId: string,
  usedDays: number,
  pendingDays = 0,
  options: {
    startDate?: string;
    endDate?: string;
    year?: number;
    asOf?: Date | string;
  } = {},
): VacationBalance {
  const accrued = computeAccruedVacationDays(settings, memberId, options);
  const used = Math.max(0, Number(usedDays) || 0);
  const pending = Math.max(0, Number(pendingDays) || 0);
  return {
    accrued,
    used,
    pending,
    remaining: Math.max(0, round1(accrued - used)),
    daysPerMonth: resolveDaysPerMonth(settings),
    mode: resolveAccrualMode(settings),
  };
}
