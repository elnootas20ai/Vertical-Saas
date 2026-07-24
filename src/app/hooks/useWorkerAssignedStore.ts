import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import {
  isDeliveryBusinessType,
  resolveDeliveryBusinessType,
} from '../lib/deliverySetup';
import { filterStoresForWorkerAssignment } from '../lib/pdvScope';
import { resolveWorkerWorkCenter } from '../lib/workerStoreHours';
import { useWorkCenters } from './useWorkCenters';
import type { WorkCenter } from '../lib/workCentersApi';

export function useWorkerAssignedStore() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const {
    retailWorkCenters: scopeCenters,
    allPointsOfSale,
    loading: scopeLoading,
    displayLabelForActive,
  } = useActiveStoreScope();
  const { activeWorkCenters, loading: wcLoading } = useWorkCenters();

  const resolvedType = resolveDeliveryBusinessType({
    business: currentBusiness,
    businesses,
  });
  const isDelivery = isDeliveryBusinessType(resolvedType);
  const salesPointRef = String(user?.employment?.salesPointId || '').trim();

  return useMemo(() => {
    const loading = scopeLoading || wcLoading;
    const pool: WorkCenter[] =
      scopeCenters.length > 0 ? scopeCenters : activeWorkCenters;

    const scoped = filterStoresForWorkerAssignment(allPointsOfSale, pool, salesPointRef);
    let workCenter = scoped.workCenters[0] || null;
    if (!workCenter && salesPointRef) {
      workCenter = resolveWorkerWorkCenter(pool, salesPointRef);
    }
    if (!workCenter && pool.length === 1) {
      workCenter = pool[0];
    }

    const storeLabel =
      scoped.pointsOfSale[0]?.name ||
      workCenter?.name ||
      displayLabelForActive ||
      '';

    const assignedPdvId =
      scoped.pointsOfSale[0]?._id ||
      (salesPointRef && !salesPointRef.startsWith('wc:') ? salesPointRef : '') ||
      '';

    const hasAssignment = Boolean(salesPointRef);
    /** Entrada de fichaje solo con tienda/local asignado en Equipo. */
    const canClockInEntry = !loading && hasAssignment;

    return {
      isDelivery,
      loading,
      workCenter,
      storeLabel,
      assignedPdvId,
      hasAssignment,
      canClockInEntry,
      /** Mostrar bloque de tienda/horario, o aviso si falta asignación. */
      showStoreBlock: isDelivery || pool.length > 0 || hasAssignment || !loading,
    };
  }, [
    isDelivery,
    scopeLoading,
    wcLoading,
    scopeCenters,
    activeWorkCenters,
    allPointsOfSale,
    salesPointRef,
    displayLabelForActive,
  ]);
}
