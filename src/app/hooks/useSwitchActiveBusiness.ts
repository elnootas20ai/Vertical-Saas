import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useBusiness } from '../context/BusinessContext';
import { useDashboardViewOptional } from '../context/DashboardViewContext';
import { saasPathWithBusinessScope } from '../lib/businessScopeUrl';
import { normalizeBusinessScopeId } from '../lib/deliverySetup';
import type { Business } from '../lib/businessApi';

function findBusinessByScopeId(list: Business[], businessId: string): Business | undefined {
  const norm = normalizeBusinessScopeId(businessId);
  if (!norm) return undefined;
  return list.find(
    (b) =>
      normalizeBusinessScopeId(b.business_id) === norm
      || normalizeBusinessScopeId(b.id) === norm,
  );
}

export function useSwitchActiveBusiness() {
  const navigate = useNavigate();
  const location = useLocation();
  const { switchBusiness, businesses, currentBusiness } = useBusiness();
  const dashboardView = useDashboardViewOptional();

  return useCallback(
    (businessId: string, options?: { syncUrl?: boolean; silent?: boolean }) => {
      const found = findBusinessByScopeId(businesses, businessId);
      if (!found) {
        if (!options?.silent) {
          toast.error('No se pudo cambiar de empresa. Vuelve a cargar la página.');
        }
        return false;
      }

      const activeId = normalizeBusinessScopeId(currentBusiness?.business_id);
      const targetId = normalizeBusinessScopeId(found.business_id);
      dashboardView?.enterBusinessView();
      switchBusiness(found.business_id);

      if (options?.syncUrl !== false) {
        navigate(
          saasPathWithBusinessScope(
            `${location.pathname}${location.search}`,
            found.business_id,
          ),
          { replace: true, preventScrollReset: true },
        );
      }

      return activeId !== targetId;
    },
    [
      businesses,
      currentBusiness?.business_id,
      dashboardView,
      location.pathname,
      location.search,
      navigate,
      switchBusiness,
    ],
  );
}
