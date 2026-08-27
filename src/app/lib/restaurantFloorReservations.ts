import {
  ACTIVE_STATUSES,
  reservationDateTime,
  reservationTableIds,
  type RestaurantReservation,
} from './restaurantReservationTypes';
import { listReservations, type ReservationScopeOptions } from './restaurantReservationsApi';
import { localCalendarDayKey } from './tpvCajaScope';

/** Listado ligero para plano TPV (sin dependencias CRM). */
export function listFloorReservations(
  userId: string,
  scope?: ReservationScopeOptions,
): Promise<RestaurantReservation[]> {
  return listReservations(userId, scope);
}

export type TableReservationHint = {
  reservationId: string;
  guestName: string;
  time: string;
  partySize: number;
};

function isActiveFloorReservation(r: RestaurantReservation, today: string): boolean {
  if (reservationTableIds(r).length === 0) return false;
  if (String(r.date || '').slice(0, 10) !== today) return false;
  if (!ACTIVE_STATUSES.includes(r.status)) return false;
  return true;
}

/** Próxima reserva activa por mesa (hoy). */
export function upcomingReservationsByTableId(
  reservations: RestaurantReservation[],
  today = localCalendarDayKey(),
): Map<string, TableReservationHint> {
  const map = new Map<string, TableReservationHint>();
  const sorted = reservations
    .filter((r) => isActiveFloorReservation(r, today))
    .sort(
      (a, b) =>
        reservationDateTime(a.date, a.time).getTime() - reservationDateTime(b.date, b.time).getTime(),
    );

  for (const r of sorted) {
    const hint: TableReservationHint = {
      reservationId: r._id,
      guestName: r.guestName || 'Reserva',
      time: r.time || '',
      partySize: parseInt(String(r.partySize || '2'), 10) || 2,
    };
    for (const tableId of reservationTableIds(r)) {
      if (!map.has(tableId)) map.set(tableId, hint);
    }
  }
  return map;
}

export function formatReservationHint(hint: TableReservationHint): string {
  const time = hint.time ? hint.time.slice(0, 5) : '';
  return time ? `${time} · ${hint.guestName}` : hint.guestName;
}

/** Reservas activas de hoy, ordenadas por hora (panel TPV). */
export function todayFloorReservations(
  reservations: RestaurantReservation[],
  today = localCalendarDayKey(),
): RestaurantReservation[] {
  return reservations
    .filter((r) => String(r.date || '').slice(0, 10) === today)
    .filter((r) => ACTIVE_STATUSES.includes(r.status))
    .sort(
      (a, b) =>
        reservationDateTime(a.date, a.time).getTime() - reservationDateTime(b.date, b.time).getTime(),
    );
}

export type ReservationAlertKind = 'due' | 'soon';

/** Reserva que debe avisar en TPV: ahora (±2 min o retrasada) o próxima (≤15 min). */
export function reservationAlertKind(
  reservation: RestaurantReservation,
  now = Date.now(),
  soonMinutes = 15,
): ReservationAlertKind | null {
  if (!ACTIVE_STATUSES.includes(reservation.status)) return null;
  const start = reservationDateTime(reservation.date, reservation.time).getTime();
  const diffMin = (start - now) / 60_000;
  if (diffMin <= 2 && diffMin >= -180) return 'due';
  if (diffMin > 2 && diffMin <= soonMinutes) return 'soon';
  return null;
}

export function reservationMinutesUntil(
  reservation: RestaurantReservation,
  now = Date.now(),
): number {
  const start = reservationDateTime(reservation.date, reservation.time).getTime();
  return Math.round((start - now) / 60_000);
}
