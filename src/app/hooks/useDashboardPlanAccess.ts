import { useMemo } from 'react';
import {
  PLAN_TIER_LABELS,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';
import {
  canViewDashboardEbitda,
  canViewDashboardFinanceWidget,
  canViewDeliveryDashboardExtras,
  getLockedDashboardWidgets,
  getUnlockedDashboardWidgets,
  isDashboardWidgetUnlocked,
  type DashboardWidgetId,
} from '../lib/dashboardPlanCatalog';
import { useEffectivePlanTier } from './useEffectivePlanTier';

export function useDashboardPlanAccess() {
  const planTier = useEffectivePlanTier();

  const planLabel = PLAN_TIER_LABELS[planTier];
  const isBasicPlan = planTier === 'basic';
  /** Básico o Mediano: dashboard operativo reducido (sin bloque Pro). */
  const isLimitedDashboard = planTier !== 'pro';
  const canViewDeliveryExtras = canViewDeliveryDashboardExtras(planTier);

  const unlockedWidgets = useMemo(
    () => getUnlockedDashboardWidgets(planTier),
    [planTier],
  );

  const lockedWidgets = useMemo(
    () => getLockedDashboardWidgets(planTier),
    [planTier],
  );

  const canShowWidget = (id: DashboardWidgetId) => isDashboardWidgetUnlocked(id, planTier);

  return {
    planTier,
    planLabel,
    isBasicPlan,
    isLimitedDashboard,
    canViewDeliveryExtras,
    unlockedWidgets,
    lockedWidgets,
    canShowWidget,
    canViewEbitda: canViewDashboardEbitda(planTier),
    canViewFinanceWidget: canViewDashboardFinanceWidget(planTier),
  };
}

export type { DashboardWidgetId, SubscriptionPlanTier };
