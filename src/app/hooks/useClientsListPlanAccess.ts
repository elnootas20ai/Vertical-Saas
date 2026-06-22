import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  clientsListSummaryByPlan,
  isClientsListFeatureUnlocked,
  requiredPlanLabelForListFeature,
  type ClientsListFeatureId,
} from '../lib/clientsListPlanCatalog';
import {
  PLAN_TIER_LABELS,
  resolvePlanTier,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';

export function useClientsListPlanAccess() {
  const { subscription } = useApp();

  const planTier = resolvePlanTier(
    subscription?.selectedPlanId || '',
    subscription?.planName || '',
  );

  const planLabel = PLAN_TIER_LABELS[planTier];
  const isBasicPlan = planTier === 'basic';

  const summary = useMemo(() => clientsListSummaryByPlan(planTier), [planTier]);

  const can = (id: ClientsListFeatureId) => isClientsListFeatureUnlocked(id, planTier);

  return {
    planTier,
    planLabel,
    isBasicPlan,
    ...summary,
    canAccessFeature: can,
    requiredPlanLabel: (id: ClientsListFeatureId) => requiredPlanLabelForListFeature(id),
    canViewOrderCount: can('lista_col_pedidos'),
    canViewSpent: can('lista_col_gasto'),
    canViewLastOrder: can('lista_col_ultimo'),
    canViewTagsColumn: can('lista_col_tags'),
    canViewLoyalty: can('lista_col_loyalty'),
    canFilterTags: can('lista_filtro_tags'),
    canUseSegments: can('lista_segmentos'),
    canImportFromBusiness: can('lista_import_empresa'),
    canExport: can('lista_export'),
  };
}

export type { ClientsListFeatureId, SubscriptionPlanTier };
