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
import { resolveEffectiveSalesPointRef, hasExplicitSiteAssignment } from '../lib/workerStoreAssignment';
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
  const { user, refreshCurrentUser } = useAuth();
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

  const pool = useMemo(
    () => mergeWorkCenterPools(scopeCenters, workCenters, activeWorkCenters),
    [scopeCenters, workCenters, activeWorkCenters],
  );

  const [fetchedWorkCenter, setFetchedWorkCenter] = useState<WorkCenter | null>(null);
  const [fetchingAssigned, setFetchingAssigned] = useState(false);
  const [memberSchedule, setMemberSchedule] = useState<ScheduleTemplate | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [profileRefreshing, setProfileRefreshing] = useState(true);
  /** Fuerza re-lectura del centro (horario) tras cambios en Ajustes / foco de pestaña. */
  const [storeDocRefresh, setStoreDocRefresh] = useState(0);

  const businessId = String(
    currentBusiness?.business_id || user?.linkedBusinessId || '',
  ).trim();
  const memberId = String(user?.user_id || user?.id || '').trim();

  // El gerente puede asignar la tienda después del login: re-sincronizar employment.
  useEffect(() => {
    let cancelled = false;
    setProfileRefreshing(true);
    void refreshCurrentUser()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProfileRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshCurrentUser, memberId]);

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

  const salesPointRef = useMemo(
    () =>
      resolveEffectiveSalesPointRef({
        employmentSalesPointId: user?.employment?.salesPointId,
        scheduleWorkCenterId: memberSchedule?.work_center_id,
        assignments: user?.employment?.assignments,
        workCenters: pool,
        pointsOfSale: allPointsOfSale,
      }),
    [
      user?.employment?.salesPointId,
      user?.employment?.assignments,
      memberSchedule?.work_center_id,
      pool,
      allPointsOfSale,
    ],
  );

  const explicitAssignment = hasExplicitSiteAssignment(user?.employment);

  const resolvedFromPool = useMemo(() => {
    if (!salesPointRef) return null;
    const scoped = filterStoresForWorkerAssignment(allPointsOfSale, pool, salesPointRef);
    return scoped.workCenters[0] || resolveWorkerWorkCenter(pool, salesPointRef);
  }, [allPointsOfSale, pool, salesPointRef]);

  useEffect(() => {
    if (!salesPointRef) {
      setFetchedWorkCenter(null);
      setFetchingAssigned(false);
      return;
    }
    const fetchId = String(
      resolvedFromPool?._id || resolvedFromPool?.id || salesPointRef,
    ).trim();
    let cancelled = false;
    setFetchingAssigned(true);
    // Siempre pedir el doc fresco: el pool puede traer caché sin horario o desactualizado.
    void getWorkCenterById(fetchId)
      .then((wc) => {
        if (!cancelled) setFetchedWorkCenter(wc);
      })
      .catch(() => {
        if (!cancelled) setFetchedWorkCenter(null);
      })
      .finally(() => {
        if (!cancelled) setFetchingAssigned(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salesPointRef, resolvedFromPool, storeDocRefresh]);

  useEffect(() => {
    const bump = () => setStoreDocRefresh((n) => n + 1);
    window.addEventListener('work-centers:changed', bump);
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('work-centers:changed', bump);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return useMemo(() => {
    const employmentRef = String(user?.employment?.salesPointId || '').trim();
    const waitingForAssignmentHints =
      profileRefreshing
      || (!employmentRef && scheduleLoading);
    const listsLoading = scopeLoading || wcLoading || waitingForAssignmentHints;
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

    const hasAssignment = hasExplicitSiteAssignment(user?.employment)
      || Boolean(String(memberSchedule?.work_center_id || '').trim());
    const storeLabel =
      scoped.pointsOfSale[0]?.name
      || resolvedWorkCenter?.name
      || displayLabelForActive
      || (hasAssignment ? 'Tu tienda' : '');

    const workCenter =
      resolvedWorkCenter
      || (hasAssignment && salesPointRef ? stubAssignedWorkCenter(salesPointRef, storeLabel) : null);

    // Tienda de la contratación (employment) o PDV resuelto — NUNCA omitir si hay empleo.
    const employmentStoreId = String(user?.employment?.salesPointId || '').trim().replace(/^wc:/, '');
    const scheduleStoreId = String(memberSchedule?.work_center_id || '').trim().replace(/^wc:/, '');
    const assignedPdvId =
      scoped.pointsOfSale[0]?._id
      || scoped.assignedPdvId
      || employmentStoreId
      || (salesPointRef && !salesPointRef.startsWith('wc:') ? salesPointRef : '')
      || scheduleStoreId
      || '';
    const assignedWorkCenterId =
      String(resolvedWorkCenter?._id || resolvedWorkCenter?.id || '').trim()
      || employmentStoreId
      || scheduleStoreId
      || (salesPointRef ? salesPointRef.replace(/^wc:/, '') : '')
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
     * Auto-fichaje del trabajador: no exige tienda (RRHH / sin PDV / aún sin asignar).
     * La tienda es etiqueta opcional; el horario de local no bloquea.
     */
    const canClockInEntry = !loading;

    return {
      isDelivery,
      loading,
      storeResolving,
      workCenter,
      /** Centro con datos reales; null si solo hay stub de nombre. */
      resolvedWorkCenter,
      storeLabel,
      assignedPdvId,
      /** Centro de trabajo de la contratación (mismo id que salesPointId en invitación). */
      assignedWorkCenterId,
      hasAssignment,
      /** true solo si viene de Equipo (employment.salesPointId), no de inferencia. */
      explicitAssignment,
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
      /** Info útil: tienda asignada, turno personal u horario real del local. */
      showStoreBlock:
        hasAssignment
        || hasPersonalSchedule
        || Boolean(resolvedWorkCenter && hasOpeningHoursPayload(resolvedWorkCenter.openingHours)),
    };
  }, [
    isDelivery,
    scopeLoading,
    wcLoading,
    profileRefreshing,
    scheduleLoading,
    fetchingAssigned,
    pool,
    allPointsOfSale,
    salesPointRef,
    resolvedFromPool,
    fetchedWorkCenter,
    displayLabelForActive,
    memberSchedule,
    explicitAssignment,
    user?.employment?.salesPointId,
  ]);
}
