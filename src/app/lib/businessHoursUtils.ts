import type { BusinessHoursConfig, DaySchedule, WeekSchedule } from './settingsApi';
import type { WorkCenter } from './workCentersApi';

export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export const WEEKEND_KEYS = ['saturday', 'sunday'] as const;
export type ScheduleDayKey = keyof WeekSchedule;

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
  return (Object.keys(schedule) as ScheduleDayKey[]).filter((day) => schedule[day]?.open).length;
}

export function hasValidBusinessHoursConfig(
  hours: BusinessHoursConfig | null | undefined,
): boolean {
  if (!hours?.schedule) return false;
  return Object.values(hours.schedule).some(
    (d) =>
      d &&
      d.open &&
      typeof d.from === 'string' &&
      typeof d.to === 'string' &&
      d.from.trim() &&
      d.to.trim() &&
      d.from !== d.to,
  );
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
