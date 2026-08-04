import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import {
  isDeliveryBusinessType,
  resolveDeliveryBusinessType,
} from '../lib/deliverySetup';
import { filterStoresForWorkerAssignment } from '../lib/pdvScope';
import {
  formatStoreHoursToday,
  preferRicherWorkCenter,
  resolveWorkerWorkCenter,
} from '../lib/workerStoreHours';
import { hasOpeningHoursPayload } from '../lib/businessHoursUtils';
import {
  getSchedule,
  getScheduleForDate,
  type DayShift,
  type ScheduleTemplate,
} from '../lib/schedulesApi';
import { useWorkCenters } from './useWorkCenters';
import { getWorkCenterById, type WorkCenter } from '../lib/workCentersApi';

function mergeWorkCenterPools(...lists: WorkCenter[][]): WorkCenter[] {
  const map = new Map<string, WorkCenter>();
  for (const list of lists) {
    for (const wc of list) {
      const key = String(wc._id || wc.id || '').trim();
      if (!key) continue;
      const prev = map.get(key);
      map.set(key, prev ? preferRicherWorkCenter(prev, wc) : wc);
    }
  }
  return Array.from(map.values());
}

function stubAssignedWorkCenter(ref: string, name: string): WorkCenter {
  const id = ref.startsWith('wc:') ? ref.slice(3) : ref;
  const now = new Date().toISOString();
  return {
    _id: id,
    id,
    type: 'sales_point',
    user_id: '',
    name: name || 'Tu tienda',
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function useWorkerAssignedStore() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const {
    retailWorkCenters: scopeCenters,
    allPointsOfSale,
    loading: scopeLoading,
    displayLabelForActive,
  } = useActiveStoreScope();
  const { workCenters, activeWorkCenters, loading: wcLoading } = useWorkCenters();

  const resolvedType = resolveDeliveryBusinessType({
    business: currentBusiness,
    businesses,
  });
  const isDelivery = isDeliveryBusinessType(resolvedType);
  const salesPointRef = String(user?.employment?.salesPointId || '').trim();

  const pool = useMemo(
    () => mergeWorkCenterPools(scopeCenters, workCenters, activeWorkCenters),
    [scopeCenters, workCenters, activeWorkCenters],
  );

  const resolvedFromPool = useMemo(() => {
    if (!salesPointRef) return null;
    const scoped = filterStoresForWorkerAssignment(allPointsOfSale, pool, salesPointRef);
    return scoped.workCenters[0] || resolveWorkerWorkCenter(pool, salesPointRef);
  }, [allPointsOfSale, pool, salesPointRef]);

  const [fetchedWorkCenter, setFetchedWorkCenter] = useState<WorkCenter | null>(null);
  const [fetchingAssigned, setFetchingAssigned] = useState(false);
  const [memberSchedule, setMemberSchedule] = useState<ScheduleTemplate | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const businessId = String(
    currentBusiness?.business_id || user?.linkedBusinessId || '',
  ).trim();
  const memberId = String(user?.user_id || user?.id || '').trim();

  useEffect(() => {
    if (!salesPointRef) {
      setFetchedWorkCenter(null);
      setFetchingAssigned(false);
      return;
    }
    // Si el pool tiene el centro pero sin horario (caché stale), pedir el doc fresco.
    if (resolvedFromPool && hasOpeningHoursPayload(resolvedFromPool.openingHours)) {
      setFetchedWorkCenter(null);
      setFetchingAssigned(false);
      return;
    }
    const fetchId = String(
      resolvedFromPool?._id || resolvedFromPool?.id || salesPointRef,
    ).trim();
    let cancelled = false;
    setFetchingAssigned(true);
    void getWorkCenterById(fetchId)
      .then((wc) => {
        if (!cancelled) setFetchedWorkCenter(wc);
      })
      .finally(() => {
        if (!cancelled) setFetchingAssigned(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salesPointRef, resolvedFromPool]);

  // Turno personal (plantilla de la invitación / Horarios) — independiente del horario de tienda.
  useEffect(() => {
    if (!businessId || !memberId) {
      setMemberSchedule(null);
      setScheduleLoading(false);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    void getSchedule(businessId, memberId)
      .then((sched) => {
        if (!cancelled) setMemberSchedule(sched);
      })
      .catch(() => {
        if (!cancelled) setMemberSchedule(null);
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, memberId]);

  return useMemo(() => {
    const listsLoading = scopeLoading || wcLoading;
    const storeResolving =
      Boolean(salesPointRef)
      && !resolvedFromPool
      && !fetchedWorkCenter
      && fetchingAssigned;
    const loading = listsLoading || storeResolving;

    const scoped = filterStoresForWorkerAssignment(allPointsOfSale, pool, salesPointRef);

    /** Centro real (con datos de horario). El stub solo sirve para mostrar nombre. */
    let resolvedWorkCenter =
      scoped.workCenters[0]
      || resolvedFromPool
      || fetchedWorkCenter
      || null;

    if (
      resolvedWorkCenter
      && fetchedWorkCenter
      && String(resolvedWorkCenter._id || '') === String(fetchedWorkCenter._id || '')
    ) {
      resolvedWorkCenter = preferRicherWorkCenter(resolvedWorkCenter, fetchedWorkCenter);
    } else if (
      resolvedWorkCenter
      && fetchedWorkCenter
      && !hasOpeningHoursPayload(resolvedWorkCenter.openingHours)
      && hasOpeningHoursPayload(fetchedWorkCenter.openingHours)
    ) {
      resolvedWorkCenter = fetchedWorkCenter;
    }

    if (!resolvedWorkCenter && !salesPointRef && pool.length === 1) {
      resolvedWorkCenter = pool[0];
    }

    const hasAssignment = Boolean(salesPointRef);
    const storeLabel =
      scoped.pointsOfSale[0]?.name
      || resolvedWorkCenter?.name
      || displayLabelForActive
      || (hasAssignment ? 'Tu tienda' : '');

    const workCenter =
      resolvedWorkCenter
      || (hasAssignment ? stubAssignedWorkCenter(salesPointRef, storeLabel) : null);

    const assignedPdvId =
      scoped.pointsOfSale[0]?._id
      || (salesPointRef && !salesPointRef.startsWith('wc:') ? salesPointRef : '')
      || '';

    // Horario de tienda = info del local (no candado de fichaje).
    const hoursToday = formatStoreHoursToday(resolvedWorkCenter);
    const storeOutsideHours =
      hasOpeningHoursPayload(resolvedWorkCenter?.openingHours)
      && !hoursToday.storeOpenNow;

    const personalShiftToday: DayShift | null = memberSchedule
      ? getScheduleForDate(memberSchedule, new Date())
      : null;
    const hasPersonalSchedule = Boolean(memberSchedule);
    const personalDayOff = Boolean(memberSchedule) && !personalShiftToday;

    /**
     * Fichar con tienda asignada. El horario de apertura no bloquea
     * (contrato/trabajo fuera de franja permitido).
     */
    const canClockInEntry = !loading && hasAssignment;

    return {
      isDelivery,
      loading,
      storeResolving,
      workCenter,
      /** Centro con datos reales; null si solo hay stub de nombre. */
      resolvedWorkCenter,
      storeLabel,
      assignedPdvId,
      hasAssignment,
      canClockInEntry,
      storeHoursToday: hoursToday,
      /** @deprecated alias: ya no bloquea fichaje; solo indica tienda cerrada/fuera de franja. */
      storeClosedForClockIn: storeOutsideHours,
      storeOutsideHours,
      memberSchedule,
      personalShiftToday,
      hasPersonalSchedule,
      personalDayOff,
      scheduleLoading,
      showStoreBlock: isDelivery || pool.length > 0 || hasAssignment || !listsLoading,
    };
  }, [
    isDelivery,
    scopeLoading,
    wcLoading,
    fetchingAssigned,
    pool,
    allPointsOfSale,
    salesPointRef,
    resolvedFromPool,
    fetchedWorkCenter,
    displayLabelForActive,
    memberSchedule,
    scheduleLoading,
  ]);
}
