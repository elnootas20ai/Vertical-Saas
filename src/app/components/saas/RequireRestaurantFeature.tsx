import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  useRestaurantPlanAccess,
  type RestaurantPlanFeatureId,
} from '../../hooks/useRestaurantPlanAccess';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';

export function RequireRestaurantFeature({
  feature,
  children,
}: {
  feature: RestaurantPlanFeatureId;
  children: ReactNode;
}) {
  const location = useLocation();
  const business = useBusinessOptional();
  const allowed = useRestaurantPlanAccess(feature);
  const isRestaurant = isRestaurantBusinessType(business?.currentBusiness?.businessType);

  if (!isRestaurant || allowed) return <>{children}</>;
  return (
    <Navigate
      to="/saas/dashboard"
      replace
      state={{
        planAccessDenied: true,
        requestedPath: `${location.pathname}${location.search}`,
        requiredPlan: 'pro',
      }}
    />
  );
}
