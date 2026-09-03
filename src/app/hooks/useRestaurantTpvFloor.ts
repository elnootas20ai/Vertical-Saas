import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFloorConfigRequest, listDiningOrdersRequest, listDiningTablesRequest } from '../lib/salaApi';
import { listFloorReservations } from '../lib/restaurantFloorReservations';
import { todayFloorReservations, upcomingReservationsByTableId } from '../lib/restaurantFloorReservations';
import {
  openOrdersByTableId,
  type RestaurantTableLiveInfo,
  resolveRestaurantTableLiveInfo,
} from '../lib/restaurantTableDisplay';
import {
  assignDefaultRoomIds,
  computeRestaurantSummary,
  computeRoomStats,
  extendTable,
  roomsFromFloorConfig,
  tablesForRoom,
} from '../lib/salaRooms';
import type { ExtendedDiningTable, RestaurantSummary, SalaRoom } from '../lib/salaStudioTypes';
import type { RestaurantReservation } from '../lib/restaurantReservationTypes';

export function useRestaurantTpvFloor(
  userId: string | null,
  businessId: string | null,
  options?: { paused?: boolean; accountBusinessCount?: number },
) {
  const paused = options?.paused ?? false;
  const accountBusinessCount = options?.accountBusinessCount ?? 1;
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<ExtendedDiningTable[]>([]);
  const [liveByTableId, setLiveByTableId] = useState<Map<string, RestaurantTableLiveInfo>>(new Map());
  const [todayReservations, setTodayReservations] = useState<RestaurantReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setRooms([]);
      setTables([]);
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const [tablesData, config, ordersToday, reservationsToday] = await Promise.all([
        listDiningTablesRequest(userId, businessId ? { businessId, accountBusinessCount } : undefined),
        getFloorConfigRequest(userId, businessId ? { businessId } : undefined),
        listDiningOrdersRequest(userId, { dateFrom: dayStart.toISOString() }).catch(() => []),
        listFloorReservations(userId, {
          businessId,
          accountBusinessCount,
        }).catch(() => []),
      ]);
      const loadedRooms = roomsFromFloorConfig(config);
      let extended = assignDefaultRoomIds(tablesData.map(extendTable), loadedRooms);
      if (businessId) {
        extended = extended.filter((t) => !t.businessId || t.businessId === businessId);
      }
      extended = extended.filter((t) => t.status !== 'hidden' && t.active !== false);
      const openByTable = openOrdersByTableId(ordersToday);
      const reservationByTable = upcomingReservationsByTableId(reservationsToday);
      const live = new Map<string, RestaurantTableLiveInfo>();
      for (const table of extended) {
        const hint = reservationByTable.get(table._id);
        live.set(
          table._id,
          resolveRestaurantTableLiveInfo(
            table,
            openByTable.get(table._id),
            hint ? { guestName: hint.guestName, time: hint.time } : null,
          ),
        );
      }
      setRooms(loadedRooms.length > 0 ? loadedRooms : []);
      setTables(extended);
      setLiveByTableId(live);
      setTodayReservations(todayFloorReservations(reservationsToday));
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las mesas');
    } finally {
      setLoading(false);
    }
  }, [userId, businessId, accountBusinessCount]);

  useEffect(() => {
    if (paused) return;
    void reload();
  }, [reload, paused]);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void reload();
    }, 30_000);
    return () => clearInterval(interval);
  }, [reload, paused]);

  const summary: RestaurantSummary = useMemo(
    () => computeRestaurantSummary(rooms, tables),
    [rooms, tables],
  );

  const roomStats = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r.id === roomId);
      return computeRoomStats(tables, roomId, room?.name);
    },
    [tables, rooms],
  );

  const tablesInRoom = useCallback(
    (roomId: string) =>
      tablesForRoom(tables, roomId)
        .filter((t) => t.status !== 'hidden')
        .sort((a, b) => a.number - b.number),
    [tables],
  );

  return {
    rooms,
    tables,
    liveByTableId,
    todayReservations,
    loading,
    error,
    reload,
    summary,
    roomStats,
    tablesInRoom,
  };
}
