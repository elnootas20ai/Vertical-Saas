import { useMemo } from 'react';
import {
  CLIENT_DETAIL_BASIC_MAX_ORDERS,
  CLIENT_DETAIL_BASIC_MAX_RECENT_ORDERS,
  clientDetailSummaryByPlan,
  isClientDetailFeatureUnlocked,
  requiredPlanLabelForClientFeature,
  type ClientDetailFeatureId,
} from '../lib/clientDetailPlanCatalog';
import {
  PLAN_TIER_LABELS,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';
import { useEffectivePlanTier } from './useEffectivePlanTier';

export function useClientDetailPlanAccess() {
  const planTier = useEffectivePlanTier();

  const planLabel = PLAN_TIER_LABELS[planTier];
  const isBasicPlan = planTier === 'basic';

  const summary = useMemo(() => clientDetailSummaryByPlan(planTier), [planTier]);

  const can = (id: ClientDetailFeatureId) => isClientDetailFeatureUnlocked(id, planTier);

  const requiredPlan = (id: ClientDetailFeatureId) => requiredPlanLabelForClientFeature(id);

  return {
    planTier,
    planLabel,
    isBasicPlan,
    ...summary,
    canAccessFeature: can,
    requiredPlanLabel: requiredPlan,
    canViewKpis: can('ficha_resumen_kpis'),
    canViewAnalytics: can('ficha_resumen_analytics'),
    canViewPedidos: can('ficha_pedidos'),
    canExpandPedidoDetalle: can('ficha_pedidos_detalle'),
    canViewActividad: can('ficha_actividad'),
    canViewPromociones: can('ficha_promociones'),
    canCreatePromociones: can('ficha_promociones_crear'),
    canViewLoyalty: can('ficha_loyalty'),
    canUseTags: can('ficha_tags'),
    canViewRgpd: can('ficha_rgpd'),
    maxOrdersVisible: isBasicPlan ? CLIENT_DETAIL_BASIC_MAX_ORDERS : Infinity,
    maxRecentOrders: isBasicPlan ? CLIENT_DETAIL_BASIC_MAX_RECENT_ORDERS : 5,
  };
}

export type { ClientDetailFeatureId, SubscriptionPlanTier };
