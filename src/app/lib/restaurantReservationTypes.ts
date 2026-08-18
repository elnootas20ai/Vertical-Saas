import type { VerticalEntity } from './verticalApiFactory';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'seated'
  | 'finished'
  | 'cancelled'
  | 'delayed'
  | 'no_show';

export type ReservationFilterStatus =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'finished'
  | 'cancelled';

export interface ReservationHistoryEntry {
  action: string;
  userId: string;
  userName: string;
  at: string;
  details?: string;
}

export interface RestaurantReservation extends VerticalEntity {
  guestName: string;
  phone: string;
  email: string;
  clientId: string;
  date: string;
  time: string;
  partySize: string;
  preferredZone: string;
  /** Mesa principal (compat / sentar en TPV). */
  tableId: string;
  tableName: string;
  tableNumber: string;
  /** Una o varias mesas/taburetes que cubren el aforo. */
  tableIds?: string[];
  notes: string;
  status: ReservationStatus;
  history: string;
  orderId: string;
}

export type ReservationFormData = Omit<
  RestaurantReservation,
  keyof VerticalEntity | 'history' | 'orderId'
>;

export const RESERVATION_DURATION_MINUTES = 120;

export const STATUS_CFG: Record<
  ReservationStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: 'Pendiente',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  confirmed: {
    label: 'Confirmada',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-800 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  arrived: {
    label: 'Cliente llegado',
    dot: 'bg-cyan-500',
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    text: 'text-cyan-800 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800',
  },
  seated: {
    label: 'Sentado',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  finished: {
    label: 'Finalizada',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-700',
  },
  cancelled: {
    label: 'Cancelada',
    dot: 'bg-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  delayed: {
    label: 'Retraso',
    dot: 'bg-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    text: 'text-orange-800 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
  },
  no_show: {
    label: 'No presentado',
    dot: 'bg-rose-600',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-800 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800',
  },
};

export const FILTER_TABS: { id: ReservationFilterStatus; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'confirmed', label: 'Confirmadas' },
  { id: 'seated', label: 'Sentadas' },
  { id: 'finished', label: 'Finalizadas' },
  { id: 'cancelled', label: 'Canceladas' },
];

export const ACTIVE_STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'arrived',
  'delayed',
];

export const EMPTY_FORM: ReservationFormData = {
  guestName: '',
  phone: '',
  email: '',
  clientId: '',
  date: new Date().toISOString().slice(0, 10),
  time: '20:00',
  partySize: '2',
  preferredZone: '',
  tableId: '',
  tableName: '',
  tableNumber: '',
  tableIds: [],
  notes: '',
  status: 'pending',
};

export interface ReservationAutomationSettings {
  delayAfterMinutes: number;
  noShowAfterMinutes: number;
  enabled: boolean;
}

export const DEFAULT_AUTOMATION: ReservationAutomationSettings = {
  delayAfterMinutes: 15,
  noShowAfterMinutes: 30,
  enabled: true,
};

export const AUTOMATION_STORAGE_KEY = 'vertial_restaurant_reservation_automation';

export function parseHistory(raw: string | undefined): ReservationHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeHistory(entries: ReservationHistoryEntry[]): string {
  return JSON.stringify(entries);
}

/** Ids de mesa de una reserva (multi) con fallback a tableId legacy. */
export function reservationTableIds(
  reservation: Pick<RestaurantReservation, 'tableId' | 'tableIds'> | Pick<ReservationFormData, 'tableId' | 'tableIds'>,
): string[] {
  const fromList = Array.isArray(reservation.tableIds)
    ? reservation.tableIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (fromList.length > 0) return [...new Set(fromList)];
  const single = String(reservation.tableId || '').trim();
  return single ? [single] : [];
}

/** Texto claro de dónde sienta: «Mesa 3», «Taburete 1 + Mesa 4», etc. */
export function formatReservationSeatPlace(
  reservation: Pick<RestaurantReservation, 'tableName' | 'tableNumber' | 'tableId' | 'tableIds'>,
): string {
  const name = String(reservation.tableName || '').trim();
  if (name) return name;
  const num = String(reservation.tableNumber || '').trim();
  if (num.includes('+')) return `Mesas ${num}`;
  if (num) return `Mesa ${num}`;
  if (reservationTableIds(reservation).length > 0) return 'Mesa asignada';
  return 'Sin mesa';
}

export function reservationDateTime(date: string, time: string): Date {
  const [h, m] = (time || '00:00').split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function reservationEndTime(date: string, time: string): Date {
  const start = reservationDateTime(date, time);
  return new Date(start.getTime() + RESERVATION_DURATION_MINUTES * 60_000);
}

export function timesOverlap(
  aDate: string,
  aTime: string,
  bDate: string,
  bTime: string,
): boolean {
  if (aDate !== bDate) return false;
  const aStart = reservationDateTime(aDate, aTime).getTime();
  const aEnd = aStart + RESERVATION_DURATION_MINUTES * 60_000;
  const bStart = reservationDateTime(bDate, bTime).getTime();
  const bEnd = bStart + RESERVATION_DURATION_MINUTES * 60_000;
  return aStart < bEnd && bStart < aEnd;
}

export function formatRemainingTime(date: string, time: string): string {
  const target = reservationDateTime(date, time);
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) {
    const lateMin = Math.floor(Math.abs(diffMs) / 60_000);
    return lateMin > 0 ? `+${lateMin} min` : 'Ahora';
  }
  const min = Math.ceil(diffMs / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function matchesFilterStatus(
  status: ReservationStatus,
  filter: ReservationFilterStatus,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return status === 'pending' || status === 'delayed' || status === 'arrived';
  if (filter === 'confirmed') return status === 'confirmed';
  if (filter === 'seated') return status === 'seated';
  if (filter === 'finished') return status === 'finished' || status === 'no_show';
  if (filter === 'cancelled') return status === 'cancelled';
  return true;
}
