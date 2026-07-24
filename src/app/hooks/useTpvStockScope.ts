import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import {
  isTpvTabletBindingAllowedForAuth,
  readTpvTabletBinding,
} from '../lib/tpvTabletSession';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import { useWorkerAssignedStore } from './useWorkerAssignedStore';

export type TpvStockScopeOverride = {
  dataUserId?: string;
  storeLabel?: string;
  pdvId?: string;
};

export type TpvStockScope = {
  dataUserId: string;
  storeLabel: string;
  pdvId: string;
  businessId: string;
};

/**
 * Tienda activa para inventario en TPV: tablet vinculada → PDV del trabajador → PDV activo en scope.
 * No usa el label global del sidebar si hay un PDV más específico.
 * El binding tablet solo aplica si pertenece a la cuenta activa.
 */
export function useTpvStockScope(override?: TpvStockScopeOverride): TpvStockScope {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();
  const workerStore = useWorkerAssignedStore();

  return useMemo(() => {
    const rawBinding = readTpvTabletBinding();
    const bindingAllowed = isTpvTabletBindingAllowedForAuth({
      binding: rawBinding,
      authUser: user,
      businesses,
      businessesSettled: businessesFetchSettled,
    });
    const binding = bindingAllowed ? rawBinding : null;
    const fallbackDataUserId = resolveBusinessDataUserId(user, currentBusiness) || '';
    const businessId = binding?.businessId || currentBusiness?.id || '';

    if (override?.dataUserId || override?.storeLabel || override?.pdvId) {
      const pdvId =
        override.pdvId ||
        binding?.pdvId ||
        workerStore.assignedPdvId ||
        activeStore.activeSalesPointId ||
        '';
      const pdv = activeStore.pointsOfSale.find((p) => p._id === pdvId);
      const storeLabel =
        override.storeLabel ||
        pdv?.name ||
        binding?.pdvName ||
        workerStore.storeLabel ||
        currentBusiness?.name ||
        'Tienda';
      return {
        dataUserId: override.dataUserId || binding?.dataUserId || fallbackDataUserId,
        storeLabel,
        pdvId,
        businessId,
      };
    }

    if (binding) {
      return {
        dataUserId: binding.dataUserId || fallbackDataUserId,
        storeLabel: binding.pdvName || binding.businessName || 'Tienda',
        pdvId: binding.pdvId,
        businessId: binding.businessId,
      };
    }

    if (workerStore.assignedPdvId && workerStore.storeLabel) {
      return {
        dataUserId: fallbackDataUserId,
        storeLabel: workerStore.storeLabel,
        pdvId: workerStore.assignedPdvId,
        businessId,
      };
    }

    const pdvId = activeStore.activeSalesPointId || '';
    const pdv = activeStore.pointsOfSale.find((p) => p._id === pdvId);
    const storeLabel =
      pdv?.name ||
      workerStore.storeLabel ||
      activeStore.displayLabelForActive ||
      currentBusiness?.name ||
      'Tienda';

    return {
      dataUserId: fallbackDataUserId,
      storeLabel,
      pdvId,
      businessId,
    };
  }, [
    override?.dataUserId,
    override?.storeLabel,
    override?.pdvId,
    user,
    currentBusiness,
    businesses,
    businessesFetchSettled,
    activeStore.activeSalesPointId,
    activeStore.pointsOfSale,
    activeStore.displayLabelForActive,
    workerStore.assignedPdvId,
    workerStore.storeLabel,
  ]);
}
