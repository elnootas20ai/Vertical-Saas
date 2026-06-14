import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { isDeliveryBusinessType } from '../lib/deliverySetup';
import { filterStoresForWorkerAssignment } from '../lib/pdvScope';
import { resolveWorkerWorkCenter } from '../lib/workerStoreHours';
import type { WorkCenter } from '../lib/workCentersApi';

export function useWorkerAssignedStore() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const { retailWorkCenters, allPointsOfSale, loading, displayLabelForActive } = useActiveStoreScope();

  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const salesPointRef = String(user?.employment?.salesPointId || '').trim();

  return useMemo(() => {
    if (!isDelivery) {
      return {
        isDelivery: false,
        loading,
        workCenter: null as WorkCenter | null,
        storeLabel: '',
        hasAssignment: false,
      };
    }

    const scoped = filterStoresForWorkerAssignment(allPointsOfSale, retailWorkCenters, salesPointRef);
    let workCenter = scoped.workCenters[0] || null;
    if (!workCenter && salesPointRef) {
      workCenter = resolveWorkerWorkCenter(retailWorkCenters, salesPointRef);
    }

    const storeLabel =
      scoped.pointsOfSale[0]?.name ||
      workCenter?.name ||
      displayLabelForActive ||
      '';

    return {
      isDelivery: true,
      loading,
      workCenter,
      storeLabel,
      hasAssignment: Boolean(salesPointRef && workCenter),
    };
  }, [
    isDelivery,
    loading,
    allPointsOfSale,
    retailWorkCenters,
    salesPointRef,
    displayLabelForActive,
  ]);
}
