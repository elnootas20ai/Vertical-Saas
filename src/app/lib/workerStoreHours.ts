import {
  ALL_SCHEDULE_DAY_KEYS,
  normalizeBusinessHoursConfig,
  SCHEDULE_DAY_LABELS_ES,
  type ScheduleDayKey,
} from './businessHoursUtils';
import type { WorkCenter } from './workCentersApi';

const JS_DAY_TO_KEY: ScheduleDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function getScheduleDayKeyForDate(date = new Date()): ScheduleDayKey {
  return JS_DAY_TO_KEY[date.getDay()] || 'monday';
}

export function resolveWorkerWorkCenter(
  workCenters: WorkCenter[],
  salesPointRef: string | null | undefined,
): WorkCenter | null {
  const ref = String(salesPointRef || '').trim();
  if (!ref) return null;
  const direct = workCenters.find((wc) => wc._id === ref);
  if (direct) return direct;
  return workCenters.find((wc) => wc.id === ref) || null;
}

export function formatStoreHoursToday(workCenter: WorkCenter | null | undefined, date = new Date()) {
  if (!workCenter?.openingHours) {
    return { label: 'Sin horario configurado', open: false, from: '', to: '' };
  }
  const hours = normalizeBusinessHoursConfig(workCenter.openingHours);
  const dayKey = getScheduleDayKeyForDate(date);
  const day = hours.schedule[dayKey];
  if (!day?.open) {
    return {
      label: `${SCHEDULE_DAY_LABELS_ES[dayKey]}: cerrado`,
      open: false,
      from: day?.from || '',
      to: day?.to || '',
      dayKey,
    };
  }
  return {
    label: `${day.from} – ${day.to}`,
    open: true,
    from: day.from,
    to: day.to,
    dayKey,
  };
}

export function listStoreHoursWeek(workCenter: WorkCenter | null | undefined) {
  if (!workCenter?.openingHours) return [];
  const hours = normalizeBusinessHoursConfig(workCenter.openingHours);
  const todayKey = getScheduleDayKeyForDate();
  return ALL_SCHEDULE_DAY_KEYS.map((dayKey) => {
    const day = hours.schedule[dayKey];
    const isToday = dayKey === todayKey;
    return {
      dayKey,
      label: SCHEDULE_DAY_LABELS_ES[dayKey],
      isToday,
      open: Boolean(day?.open),
      from: day?.from || '',
      to: day?.to || '',
      text: day?.open ? `${day.from} – ${day.to}` : 'Cerrado',
    };
  });
}
