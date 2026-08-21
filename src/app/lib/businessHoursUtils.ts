import type { BusinessHoursConfig, DaySchedule, WeekSchedule } from './settingsApi';
import type { WorkCenter } from './workCentersApi';

export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export const WEEKEND_KEYS = ['saturday', 'sunday'] as const;
export const ALL_SCHEDULE_DAY_KEYS = [...WEEKDAY_KEYS, ...WEEKEND_KEYS] as const;
export type ScheduleDayKey = keyof WeekSchedule;

export const SCHEDULE_DAY_LABELS_ES: Record<ScheduleDayKey, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export const DEFAULT_BUSINESS_HOURS_CONFIG: BusinessHoursConfig = {
  timezone: 'Europe/Madrid',
  schedule: {
    monday: { open: true, from: '09:00', to: '19:00' },
    tuesday: { open: true, from: '09:00', to: '19:00' },
    wednesday: { open: true, from: '09:00', to: '19:00' },
    thursday: { open: true, from: '09:00', to: '19:00' },
    friday: { open: true, from: '09:00', to: '19:00' },
    saturday: { open: true, from: '10:00', to: '14:00' },
    sunday: { open: false, from: '10:00', to: '14:00' },
  },
  holidays: [],
  lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
};

function cloneDaySchedule(day: DaySchedule): DaySchedule {
  return { ...day };
}

export function cloneWeekSchedule(schedule: WeekSchedule): WeekSchedule {
  return {
    monday: cloneDaySchedule(schedule.monday),
    tuesday: cloneDaySchedule(schedule.tuesday),
    wednesday: cloneDaySchedule(schedule.wednesday),
    thursday: cloneDaySchedule(schedule.thursday),
    friday: cloneDaySchedule(schedule.friday),
    saturday: cloneDaySchedule(schedule.saturday),
    sunday: cloneDaySchedule(schedule.sunday),
  };
}

export function patchScheduleDays(
  schedule: WeekSchedule,
  days: readonly ScheduleDayKey[],
  patch: Partial<DaySchedule>,
): WeekSchedule {
  const next = cloneWeekSchedule(schedule);
  for (const day of days) {
    next[day] = { ...next[day], ...patch };
  }
  return next;
}

/** Copia `from`/`to` en todos los días que ya están abiertos. */
export function applyHoursToOpenDays(
  schedule: WeekSchedule,
  from: string,
  to: string,
): WeekSchedule {
  const next = cloneWeekSchedule(schedule);
  for (const day of Object.keys(next) as ScheduleDayKey[]) {
    if (next[day].open) next[day] = { ...next[day], from, to };
  }
  return next;
}

export type BusinessHoursPresetId = 'retail' | 'extended' | 'mornings';

export function getBusinessHoursPresetSchedule(id: BusinessHoursPresetId): WeekSchedule {
  const allDays = [...WEEKDAY_KEYS, ...WEEKEND_KEYS] as ScheduleDayKey[];
  switch (id) {
    case 'extended':
      return patchScheduleDays(
        cloneWeekSchedule(DEFAULT_BUSINESS_HOURS_CONFIG.schedule),
        allDays,
        { open: true, from: '08:00', to: '22:00' },
      );
    case 'mornings':
      return {
        ...patchScheduleDays(cloneWeekSchedule(DEFAULT_BUSINESS_HOURS_CONFIG.schedule), WEEKDAY_KEYS, {
          open: true,
          from: '08:00',
          to: '14:00',
        }),
        saturday: { open: true, from: '08:00', to: '14:00' },
        sunday: { open: false, from: '08:00', to: '14:00' },
      };
    case 'retail':
    default:
      return cloneWeekSchedule(DEFAULT_BUSINESS_HOURS_CONFIG.schedule);
  }
}

export function isRetailWorkCenter(centerType: WorkCenter['centerType']): boolean {
  return centerType === 'punto_de_venta' || centerType === 'almacen';
}

export function countOpenScheduleDays(schedule: WeekSchedule | null | undefined): number {
  if (!schedule) return 0;
  return ALL_SCHEDULE_DAY_KEYS.filter((day) => schedule[day]?.open).length;
}

/**
 * Normaliza cualquier formato razonable a `HH:mm`.
 * Devuelve `''` si no se puede parsear (para inputs / blank).
 */
export function normalizeScheduleTimeValue(
  value: string | null | undefined,
  fallback = '',
): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  let m = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(raw);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  m = /^([01]?\d|2[0-3])h([0-5]\d)?$/i.exec(raw);
  if (m) return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
  m = /^([01]?\d|2[0-3])$/.exec(raw);
  if (m) return `${m[1].padStart(2, '0')}:00`;
  return fallback;
}

/** HH:mm → minutos desde 00:00; `-1` si no es hora válida. */
export function scheduleTimeToMinutes(value: string | null | undefined): number {
  const normalized = normalizeScheduleTimeValue(value);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** true si la franja cruza medianoche (cierre al día siguiente), p. ej. 20:00–06:00. */
export function isOvernightScheduleWindow(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const fromMin = scheduleTimeToMinutes(from);
  const toMin = scheduleTimeToMinutes(to);
  return fromMin >= 0 && toMin >= 0 && fromMin > toMin;
}

/** Primera tienda activa con horario válido (opcionalmente preferida). */
export function pickStoreOpeningHours(
  workCenters: WorkCenter[],
  preferredId?: string | null,
): BusinessHoursConfig | null {
  const active = workCenters.filter((wc) => wc.active !== false);
  const preferred = String(preferredId || '').trim();
  if (preferred) {
    const match = active.find(
      (wc) =>
        (wc.id === preferred || wc._id === preferred)
        && hasValidBusinessHoursConfig(wc.openingHours),
    );
    if (match?.openingHours) return normalizeBusinessHoursConfig(match.openingHours);
  }
  const first = active.find((wc) => hasValidBusinessHoursConfig(wc.openingHours));
  return first?.openingHours ? normalizeBusinessHoursConfig(first.openingHours) : null;
}

/**
 * Horario inicial al crear un PDV: obliga a rellenar apertura/cierre de cada día abierto.
 * Los cerrados cuentan como definidos; los abiertos empiezan sin hora.
 */
export function createBlankBusinessHoursConfig(): BusinessHoursConfig {
  return {
    timezone: 'Europe/Madrid',
    schedule: {
      monday: { open: true, from: '', to: '' },
      tuesday: { open: true, from: '', to: '' },
      wednesday: { open: true, from: '', to: '' },
      thursday: { open: true, from: '', to: '' },
      friday: { open: true, from: '', to: '' },
      // Finde cerrado por defecto: basta configurar L–V; si abre, se rellena al activarlo.
      saturday: { open: false, from: '', to: '' },
      sunday: { open: false, from: '', to: '' },
    },
    holidays: [],
    lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
  };
}

/** Mensaje para UI si el horario no se puede guardar; `null` si es válido. */
export function getBusinessHoursIssue(hours: BusinessHoursConfig | null | undefined): string | null {
  if (!hours?.schedule) {
    return 'Configura el horario de cada día (L–D): abierto con horas o cerrado.';
  }
  for (const day of ALL_SCHEDULE_DAY_KEYS) {
    const d = hours.schedule[day];
    if (!d || typeof d !== 'object') {
      return `${SCHEDULE_DAY_LABELS_ES[day]}: indica si abre y su horario.`;
    }
    if (!d.open) continue;
    const from = String(d.from ?? '').trim();
    const to = String(d.to ?? '').trim();
    if (!from || !to) {
      return `${SCHEDULE_DAY_LABELS_ES[day]}: indica hora de apertura y de cierre.`;
    }
    const fromMin = scheduleTimeToMinutes(from);
    const toMin = scheduleTimeToMinutes(to);
    if (fromMin < 0 || toMin < 0) {
      return `${SCHEDULE_DAY_LABELS_ES[day]}: usa horas válidas (HH:mm).`;
    }
    if (fromMin === toMin) {
      return `${SCHEDULE_DAY_LABELS_ES[day]}: apertura y cierre no pueden ser la misma hora.`;
    }
    // from > to = turno nocturno (p. ej. 20:00 → 06:00 del día siguiente). Válido.
  }
  if (countOpenScheduleDays(hours.schedule) === 0) {
    return 'Activa al menos un día abierto con su horario (L–D).';
  }
  // Horario partido (pausa mediodía): válido junto a horarios distintos por día.
  if (hours.lunchBreak?.enabled) {
    const breakFrom = scheduleTimeToMinutes(hours.lunchBreak.from);
    const breakTo = scheduleTimeToMinutes(hours.lunchBreak.to);
    if (breakFrom < 0 || breakTo < 0) {
      return 'Horario partido: usa horas válidas en la pausa (HH:mm).';
    }
    if (breakFrom >= breakTo) {
      return 'Horario partido: el inicio de la pausa debe ser antes del fin.';
    }
  }
  return null;
}

/** Completa from/to vacíos al editar un día abierto (evita quedar a medias). */
export function ensureOpenDayTimes(
  day: DaySchedule,
  defaults: { from?: string; to?: string } = {},
): DaySchedule {
  const fallbackFrom = defaults.from || '09:00';
  const fallbackTo = defaults.to || '19:00';
  if (!day.open) return { ...day };
  const from = String(day.from || '').trim() || fallbackFrom;
  const to = String(day.to || '').trim() || fallbackTo;
  return { ...day, from, to };
}

export function hasValidBusinessHoursConfig(
  hours: BusinessHoursConfig | null | undefined,
): boolean {
  return getBusinessHoursIssue(hours) === null;
}

function looksLikeDaySchedule(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return 'open' in d || 'from' in d || 'to' in d;
}

/**
 * Acepta `{ schedule: WeekSchedule }` o WeekSchedule plano en la raíz (legacy).
 * `null` si no hay ningún día reconocible.
 */
export function coerceOpeningHoursConfig(
  hours: BusinessHoursConfig | WeekSchedule | null | undefined,
): BusinessHoursConfig | null {
  if (!hours || typeof hours !== 'object') return null;
  const raw = hours as Record<string, unknown>;
  if (raw.schedule && typeof raw.schedule === 'object') {
    const sched = raw.schedule as Record<string, unknown>;
    const hasDays = ALL_SCHEDULE_DAY_KEYS.some((day) => looksLikeDaySchedule(sched[day]));
    if (!hasDays) return null;
    return hours as BusinessHoursConfig;
  }
  const hasFlatDays = ALL_SCHEDULE_DAY_KEYS.some((day) => looksLikeDaySchedule(raw[day]));
  if (!hasFlatDays) return null;
  const schedule = {} as WeekSchedule;
  for (const day of ALL_SCHEDULE_DAY_KEYS) {
    if (looksLikeDaySchedule(raw[day])) {
      schedule[day] = raw[day] as DaySchedule;
    }
  }
  return {
    timezone: String(raw.timezone || DEFAULT_BUSINESS_HOURS_CONFIG.timezone).trim()
      || DEFAULT_BUSINESS_HOURS_CONFIG.timezone,
    schedule,
    holidays: Array.isArray(raw.holidays) ? (raw.holidays as BusinessHoursConfig['holidays']) : [],
    lunchBreak:
      raw.lunchBreak && typeof raw.lunchBreak === 'object'
        ? { ...DEFAULT_BUSINESS_HOURS_CONFIG.lunchBreak, ...(raw.lunchBreak as object) }
        : { ...DEFAULT_BUSINESS_HOURS_CONFIG.lunchBreak },
  };
}

/** Hay payload de horario (anidado o plano), aunque aún no pase validación estricta. */
export function hasOpeningHoursPayload(
  hours: BusinessHoursConfig | WeekSchedule | null | undefined,
): boolean {
  return coerceOpeningHoursConfig(hours) != null;
}

/** Rellena días faltantes y normaliza strings (datos legacy o Couch incompletos). */
export function normalizeBusinessHoursConfig(
  hours: BusinessHoursConfig | WeekSchedule | null | undefined,
): BusinessHoursConfig {
  const coerced = coerceOpeningHoursConfig(hours);
  const base = DEFAULT_BUSINESS_HOURS_CONFIG;
  const schedule = cloneWeekSchedule(base.schedule);
  if (coerced?.schedule && typeof coerced.schedule === 'object') {
    for (const day of ALL_SCHEDULE_DAY_KEYS) {
      const src = coerced.schedule[day];
      if (!src || typeof src !== 'object') continue;
      const fromRaw = String(src.from ?? '').trim();
      const toRaw = String(src.to ?? '').trim();
      // Si el día viene con from/to vacíos, no inventar 09:00–19:00 (eso ocultaba «incompleto»).
      schedule[day] = {
        open: Boolean(src.open),
        from: fromRaw ? normalizeScheduleTimeValue(fromRaw, '') : '',
        to: toRaw ? normalizeScheduleTimeValue(toRaw, '') : '',
      };
    }
  }
  return {
    timezone: String(coerced?.timezone || base.timezone).trim() || base.timezone,
    schedule,
    holidays: Array.isArray(coerced?.holidays) ? coerced!.holidays : [],
    lunchBreak:
      coerced?.lunchBreak && typeof coerced.lunchBreak === 'object'
        ? { ...base.lunchBreak, ...coerced.lunchBreak }
        : { ...base.lunchBreak },
  };
}

/** Al menos una tienda retail activa con horario válido. */
export function anyActiveRetailStoreHasOpeningHours(workCenters: WorkCenter[]): boolean {
  return workCenters.some(
    (wc) =>
      wc.active !== false &&
      isRetailWorkCenter(wc.centerType) &&
      hasValidBusinessHoursConfig(wc.openingHours),
  );
}
