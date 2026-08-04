import {
  ALL_SCHEDULE_DAY_KEYS,
  hasOpeningHoursPayload,
  normalizeBusinessHoursConfig,
  SCHEDULE_DAY_LABELS_ES,
  scheduleTimeToMinutes,
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

export type StoreHoursStatus = 'open' | 'closed' | 'outside_hours' | 'no_schedule';

export type StoreHoursToday = {
  /** Día de la semana abierto en calendario (aunque ahora esté fuera de franja). */
  open: boolean;
  /**
   * El horario de tienda es informativo: no bloquea fichaje.
   * El contrato/turno puede ser más largo o fuera de la franja del local.
   */
  openForClockIn: boolean;
  /** true solo si la tienda está abierta ahora (dentro de franja). */
  storeOpenNow: boolean;
  status: StoreHoursStatus;
  /** Texto corto para la cabecera "Hoy". */
  headline: string;
  label: string;
  from: string;
  to: string;
  dayKey?: ScheduleDayKey;
};

export function getScheduleDayKeyForDate(date = new Date()): ScheduleDayKey {
  return JS_DAY_TO_KEY[date.getDay()] || 'monday';
}

/**
 * Entre dos docs del mismo centro, preferir el que trae horario (y luego el más reciente).
 * Evita que la caché stale sin `openingHours` tape la copia buena del listado.
 */
export function preferRicherWorkCenter(a: WorkCenter, b: WorkCenter): WorkCenter {
  const aHours = hasOpeningHoursPayload(a.openingHours);
  const bHours = hasOpeningHoursPayload(b.openingHours);
  if (aHours !== bHours) return bHours ? b : a;
  const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
  if (tb !== ta) return tb > ta ? b : a;
  return String(b._id || '').localeCompare(String(a._id || '')) >= 0 ? b : a;
}

export function resolveWorkerWorkCenter(
  workCenters: WorkCenter[],
  salesPointRef: string | null | undefined,
): WorkCenter | null {
  const ref = String(salesPointRef || '').trim();
  if (!ref) return null;
  const matches = workCenters.filter((wc) => wc._id === ref || wc.id === ref);
  if (matches.length === 0) return null;
  return matches.reduce((best, wc) => preferRicherWorkCenter(best, wc));
}

function isWithinOpenWindow(date: Date, from: string, to: string): boolean | null {
  const fromMin = scheduleTimeToMinutes(from);
  const toMin = scheduleTimeToMinutes(to);
  if (fromMin < 0 || toMin < 0 || fromMin === toMin) return null;
  const nowMin = date.getHours() * 60 + date.getMinutes();
  if (fromMin < toMin) {
    return nowMin >= fromMin && nowMin < toMin;
  }
  // Franja que cruza medianoche (p. ej. 22:00 – 02:00)
  return nowMin >= fromMin || nowMin < toMin;
}

/**
 * Estado del horario del centro de trabajo (fuente maestra del local).
 * No decide si se puede fichar: eso lo hacen asignación de tienda / vacaciones / etc.
 */
export function getStoreHoursStatus(
  workCenter: WorkCenter | null | undefined,
  date = new Date(),
): StoreHoursToday {
  return formatStoreHoursToday(workCenter, date);
}

export function formatStoreHoursToday(
  workCenter: WorkCenter | null | undefined,
  date = new Date(),
): StoreHoursToday {
  if (!hasOpeningHoursPayload(workCenter?.openingHours)) {
    return {
      label: 'Horario de tienda no definido',
      headline: 'Horario de tienda no definido',
      open: false,
      openForClockIn: true,
      storeOpenNow: false,
      status: 'no_schedule',
      from: '',
      to: '',
    };
  }
  // Normaliza legacy (schedule anidado o plano) / horas rotas.
  const hours = normalizeBusinessHoursConfig(workCenter!.openingHours);
  const dayKey = getScheduleDayKeyForDate(date);
  const day = hours.schedule[dayKey];
  if (!day?.open) {
    return {
      label: `${SCHEDULE_DAY_LABELS_ES[dayKey]}: cerrado`,
      headline: 'Cerrado',
      open: false,
      openForClockIn: true,
      storeOpenNow: false,
      status: 'closed',
      from: String(day?.from || '').trim(),
      to: String(day?.to || '').trim(),
      dayKey,
    };
  }

  const from = String(day.from || '').trim();
  const to = String(day.to || '').trim();
  if (!from || !to || scheduleTimeToMinutes(from) < 0 || scheduleTimeToMinutes(to) < 0) {
    return {
      label: 'Horario de tienda incompleto',
      headline: 'Horario incompleto',
      open: false,
      openForClockIn: true,
      storeOpenNow: false,
      status: 'no_schedule',
      from: '',
      to: '',
      dayKey,
    };
  }
  const within = isWithinOpenWindow(date, from, to);
  if (within === false) {
    return {
      label: `${from} – ${to}`,
      headline: 'Fuera de horario',
      open: true,
      openForClockIn: true,
      storeOpenNow: false,
      status: 'outside_hours',
      from,
      to,
      dayKey,
    };
  }
  if (within === null) {
    return {
      label: from && to ? `${from} – ${to}` : 'Horario incompleto',
      headline: 'Horario incompleto',
      open: true,
      openForClockIn: true,
      storeOpenNow: false,
      status: 'outside_hours',
      from,
      to,
      dayKey,
    };
  }

  return {
    label: `${from} – ${to}`,
    headline: `${from} – ${to}`,
    open: true,
    openForClockIn: true,
    storeOpenNow: true,
    status: 'open',
    from,
    to,
    dayKey,
  };
}

export function listStoreHoursWeek(workCenter: WorkCenter | null | undefined) {
  if (!hasOpeningHoursPayload(workCenter?.openingHours)) return [];
  const hours = normalizeBusinessHoursConfig(workCenter!.openingHours);
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

/** Etiqueta corta para banners TPV/ops. */
export function storeHoursStatusLabelEs(status: StoreHoursStatus): string {
  switch (status) {
    case 'open':
      return 'Abierta';
    case 'closed':
      return 'Cerrada';
    case 'outside_hours':
      return 'Fuera de horario';
    default:
      return 'Sin horario';
  }
}
