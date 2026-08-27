import { useCallback, useEffect, useState } from 'react';
import { listFloorReservations, todayFloorReservations } from '../lib/restaurantFloorReservations';
import type { RestaurantReservation } from '../lib/restaurantReservationTypes';

/** Reservas de hoy para alertas TPV (independiente del panel de mesas). */
export function useTodayReservationsPoll(
  userId: string | null,
  scope?: { businessId?: string | null; accountBusinessCount?: number },
) {
  const businessId = scope?.businessId ?? null;
  const accountBusinessCount = scope?.accountBusinessCount ?? 1;

  const [todayReservations, setTodayReservations] = useState<RestaurantReservation[]>([]);

  const reloadReservations = useCallback(async () => {
    if (!userId) {
      setTodayReservations([]);
      return;
    }
    const all = await listFloorReservations(userId, {
      businessId,
      accountBusinessCount,
    }).catch(() => []);
    setTodayReservations(todayFloorReservations(all));
  }, [userId, businessId, accountBusinessCount]);

  useEffect(() => {
    void reloadReservations();
    const interval = setInterval(() => void reloadReservations(), 20_000);
    return () => clearInterval(interval);
  }, [reloadReservations]);

  return { todayReservations, reloadReservations };
}
