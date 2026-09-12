import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useEffectivePlanTier } from './useEffectivePlanTier';
import {
  RESTAURANT_PLAN_FEATURES,
  restaurantFeatureAccessForTier,
} from '../../../shared/billing/restaurantPlanFeatures.js';

export type RestaurantPlanFeatureId = keyof typeof RESTAURANT_PLAN_FEATURES;

export function useRestaurantPlanAccess(featureId: RestaurantPlanFeatureId): boolean {
  const planTier = useEffectivePlanTier();
  const { subscription } = useApp();
  const activeSvaIds = (
    subscription as typeof subscription & { activeSvaIds?: string[] }
  ).activeSvaIds;

  return useMemo(
    () => restaurantFeatureAccessForTier(featureId, planTier, activeSvaIds),
    [featureId, planTier, activeSvaIds],
  );
}
