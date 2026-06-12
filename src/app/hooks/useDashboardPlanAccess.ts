import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  PLAN_TIER_LABELS,
  resolvePlanTier,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';
import {
  canViewDashboardEbitda,
  canViewDashboardFinanceWidget,
  getLockedDashboardWidgets,
  getUnlockedDashboardWidgets,
  isDashboardWidgetUnlocked,
  type DashboardWidgetId,
} from '../lib/dashboardPlanCatalog';

export function useDashboardPlanAccess() {
  const { subscription } = useApp();

  const planTier = resolvePlanTier(
    subscription?.selectedPlanId || '',
    subscription?.planName || '',
  );

  const planLabel = PLAN_TIER_LABELS[planTier];
  const isBasicPlan = planTier === 'basic';

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
    unlockedWidgets,
    lockedWidgets,
    canShowWidget,
    canViewEbitda: canViewDashboardEbitda(planTier),
    canViewFinanceWidget: canViewDashboardFinanceWidget(planTier),
  };
}

export type { DashboardWidgetId, SubscriptionPlanTier };
