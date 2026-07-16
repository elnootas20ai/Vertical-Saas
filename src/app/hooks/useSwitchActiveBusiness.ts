import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useBusiness } from '../context/BusinessContext';
import { useDashboardViewOptional } from '../context/DashboardViewContext';
import { saasPathWithBusinessScope } from '../lib/businessScopeUrl';
import { resolvePathAfterBusinessSwitch } from '../lib/businessSwitchPath';
import { normalizeBusinessScopeId } from '../lib/deliverySetup';
import { isRestaurantBusinessType } from '../lib/deliveryOpsTypes';
import type { Business } from '../lib/businessApi';
import { clearRestaurantClientCaches } from '../verticals/restaurant/clearRestaurantClientCaches';
import { RESTAURANT_OPS_HOME_PATH } from '../lib/retailOpsPaths';

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
      if (isRestaurantBusinessType(found.businessType)) {
        clearRestaurantClientCaches(found.business_id);
      }
      switchBusiness(found.business_id);

      if (options?.syncUrl !== false) {
        const switchedPath = resolvePathAfterBusinessSwitch(
          location.pathname,
          found.businessType,
        );
        const nextPath =
          switchedPath
          || (isRestaurantBusinessType(found.businessType)
            ? RESTAURANT_OPS_HOME_PATH
            : location.pathname);
        navigate(saasPathWithBusinessScope(nextPath, found.business_id), {
          replace: true,
          preventScrollReset: true,
        });
      }

      return activeId !== targetId;
    },
    [
      businesses,
      currentBusiness?.business_id,
      dashboardView,
      location.pathname,
      navigate,
      switchBusiness,
    ],
  );
}
