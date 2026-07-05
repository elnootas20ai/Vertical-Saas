import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { reservationAlertKind } from '../lib/restaurantFloorReservations';
import {
  AUTOMATION_STORAGE_KEY,
  DEFAULT_AUTOMATION,
  type RestaurantReservation,
} from '../lib/restaurantReservationTypes';

const SHOWN_KEY = 'vertial.tpv.reservationAlertsShown';

function loadShownSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function persistShownSet(set: Set<string>): void {
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...set].slice(-80)));
  } catch {
    /* ignore */
  }
}

function automationEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTOMATION_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTOMATION.enabled;
    return Boolean({ ...DEFAULT_AUTOMATION, ...JSON.parse(raw) }.enabled);
  } catch {
    return DEFAULT_AUTOMATION.enabled;
  }
}

function fireAlerts(
  reservations: RestaurantReservation[],
  onSeat: ((reservation: RestaurantReservation) => void) | undefined,
  shown: Set<string>,
): void {
  for (const reservation of reservations) {
    const kind = reservationAlertKind(reservation);
    if (!kind) continue;
    const alertId = `${reservation._id}:${kind}:${reservation.date}`;
    if (shown.has(alertId)) continue;
    shown.add(alertId);

    const time = reservation.time?.slice(0, 5) || '';
    const mesa = reservation.tableNumber ? `Mesa ${reservation.tableNumber}` : 'Sin mesa asignada';
    const guest = reservation.guestName || 'Cliente';
    const party = reservation.partySize || '2';

    if (kind === 'due') {
      toast(`Hora de sentar a ${guest}`, {
        description: `${time} · ${mesa} · ${party} pers.`,
        action: onSeat
          ? {
              label: 'Sentar',
              onClick: () => onSeat(reservation),
            }
          : undefined,
        duration: 25_000,
      });
    } else {
      toast(`Reserva próxima · ${guest}`, {
        description: `${time} · ${mesa} · ${party} pers.`,
        duration: 10_000,
      });
    }
  }
  persistShownSet(shown);
}

/** Avisos en TPV cuando llega la hora de la reserva (o 15 min antes). */
export function useRestaurantTpvReservationAlerts(
  reservations: RestaurantReservation[],
  onSeat?: (reservation: RestaurantReservation) => void,
): void {
  const onSeatRef = useRef(onSeat);
  onSeatRef.current = onSeat;
  const shownRef = useRef(loadShownSet());

  useEffect(() => {
    if (!automationEnabled()) return;

    const tick = () => {
      fireAlerts(reservations, onSeatRef.current, shownRef.current);
    };

    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [reservations]);
}
