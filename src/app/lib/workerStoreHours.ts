import {
  ALL_SCHEDULE_DAY_KEYS,
  hasOpeningHoursPayload,
  isOvernightScheduleWindow,
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

function previousScheduleDayKey(dayKey: ScheduleDayKey): ScheduleDayKey {
  const idx = ALL_SCHEDULE_DAY_KEYS.indexOf(dayKey);
  if (idx < 0) return dayKey;
  return ALL_SCHEDULE_DAY_KEYS[(idx + ALL_SCHEDULE_DAY_KEYS.length - 1) % ALL_SCHEDULE_DAY_KEYS.length];
}

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
  const bare = ref.startsWith('wc:') ? ref.slice(3) : ref;
  const matches = workCenters.filter((wc) => {
    const id = String(wc._id || '').trim();
    const alt = String(wc.id || '').trim();
    return id === ref || alt === ref || id === bare || alt === bare;
  });
  if (matches.length === 0) return null;
  return matches.reduce((best, wc) => preferRicherWorkCenter(best, wc));
}

/**
 * ¿Está abierta la franja de ESTE día en este instante?
 * Turno nocturno (20:00–06:00) = pertenece al día de inicio:
 *   - en el día de inicio solo cuenta la parte de noche (desde `from`)
 *   - la madrugada hasta `to` la resuelve el día anterior (ver `formatStoreHoursToday`)
 * Así Lunes 20→06 y Martes 20→06 no se pisan en la madrugada.
 */
function isWithinDayStartWindow(date: Date, from: string, to: string): boolean | null {
  const fromMin = scheduleTimeToMinutes(from);
  const toMin = scheduleTimeToMinutes(to);
  if (fromMin < 0 || toMin < 0 || fromMin === toMin) return null;
  const nowMin = date.getHours() * 60 + date.getMinutes();
  if (fromMin < toMin) {
    return nowMin >= fromMin && nowMin < toMin;
  }
  // Nocturno: solo la cola de noche del día de inicio.
  return nowMin >= fromMin;
}

/** ¿Seguimos dentro de la madrugada del turno nocturno del día ANTERIOR? */
function isWithinPreviousOvernightTail(date: Date, from: string, to: string): boolean {
  if (!isOvernightScheduleWindow(from, to)) return false;
  const toMin = scheduleTimeToMinutes(to);
  if (toMin < 0) return false;
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return nowMin < toMin;
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
      label: 'Sin horario de apertura',
      headline: 'Sin horario de apertura',
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

  // Madrugada: turno nocturno del día anterior (antes de mirar si hoy abre).
  const prevKey = previousScheduleDayKey(dayKey);
  const prev = hours.schedule[prevKey];
  if (prev?.open) {
    const prevFrom = String(prev.from || '').trim();
    const prevTo = String(prev.to || '').trim();
    if (
      prevFrom
      && prevTo
      && scheduleTimeToMinutes(prevFrom) >= 0
      && scheduleTimeToMinutes(prevTo) >= 0
      && isWithinPreviousOvernightTail(date, prevFrom, prevTo)
    ) {
      return {
        label: `${prevFrom} – ${prevTo} (+1)`,
        headline: `${prevFrom} – ${prevTo} (+1)`,
        open: true,
        openForClockIn: true,
        storeOpenNow: true,
        status: 'open',
        from: prevFrom,
        to: prevTo,
        dayKey: prevKey,
      };
    }
  }

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

  const withinToday = isWithinDayStartWindow(date, from, to);
  if (withinToday === true) {
    const overnight = isOvernightScheduleWindow(from, to);
    return {
      label: overnight ? `${from} – ${to} (+1)` : `${from} – ${to}`,
      headline: overnight ? `${from} – ${to} (+1)` : `${from} – ${to}`,
      open: true,
      openForClockIn: true,
      storeOpenNow: true,
      status: 'open',
      from,
      to,
      dayKey,
    };
  }

  if (withinToday === null) {
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

  // Día abierto pero fuera de franja (o aún no ha empezado el nocturno).
  const overnight = isOvernightScheduleWindow(from, to);
  return {
    label: overnight ? `${from} – ${to} (+1)` : `${from} – ${to}`,
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

export function listStoreHoursWeek(workCenter: WorkCenter | null | undefined) {
  if (!hasOpeningHoursPayload(workCenter?.openingHours)) return [];
  const hours = normalizeBusinessHoursConfig(workCenter!.openingHours);
  const todayKey = getScheduleDayKeyForDate();
  return ALL_SCHEDULE_DAY_KEYS.map((dayKey) => {
    const day = hours.schedule[dayKey];
    const isToday = dayKey === todayKey;
    const overnight = Boolean(day?.open && isOvernightScheduleWindow(day.from, day.to));
    return {
      dayKey,
      label: SCHEDULE_DAY_LABELS_ES[dayKey],
      isToday,
      open: Boolean(day?.open),
      from: day?.from || '',
      to: day?.to || '',
      text: day?.open
        ? overnight
          ? `${day.from} – ${day.to} (+1)`
          : `${day.from} – ${day.to}`
        : 'Cerrado',
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
