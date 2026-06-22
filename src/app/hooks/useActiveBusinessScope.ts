import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { resolveBusinessScopeId } from '../lib/deliverySetup';
import { normalizeTenantUserId, resolveBusinessDataUserId } from '../lib/tenantUserId';

/**
 * Alcance de la empresa activa (selector superior).
 * Usar en listados/APIs que deben cambiar al cambiar de empresa.
 */
export function useActiveBusinessScope() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();

  return useMemo(() => {
    const businessId = resolveBusinessScopeId(currentBusiness);
    const dataUserId = normalizeTenantUserId(resolveBusinessDataUserId(user, currentBusiness));
    const accountBusinessCount = businesses.length;

    return {
      businessId,
      businessName: currentBusiness?.name || '',
      businessType: currentBusiness?.businessType || '',
      dataUserId,
      accountBusinessCount,
      isMultiBusiness: accountBusinessCount > 1,
    };
  }, [user, currentBusiness, businesses.length, businesses]);
}
