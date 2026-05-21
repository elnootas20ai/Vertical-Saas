import type { BillingSubscription } from './authApi';

export type SubscriptionPlanTier = 'basic' | 'normal' | 'pro';

/** PDV incluidos por plan (sin extras de admin). */
export const POINT_OF_SALE_LIMITS: Record<SubscriptionPlanTier, number> = {
  basic: 1,
  normal: 1,
  pro: 2,
};

export const PLAN_TIER_LABELS: Record<SubscriptionPlanTier, string> = {
  basic: 'Básico',
  normal: 'Normal',
  pro: 'Pro',
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'subscription_active',
  'trial_active',
  'trial_expiring',
]);

export function resolvePlanTier(planId: string, planName: string): SubscriptionPlanTier {
  const id = planId.toLowerCase();
  const name = planName.toLowerCase();
  if (id === 'pro' || name.includes('pro')) return 'pro';
  if (id === 'normal' || name.includes('normal')) return 'normal';
  return 'basic';
}

export function clampExtraPointOfSaleSlots(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(99, n));
}

export function getBasePointOfSaleLimit(planTier: SubscriptionPlanTier): number {
  return POINT_OF_SALE_LIMITS[planTier];
}

export function getEffectivePointOfSaleLimit(
  subscription: Pick<BillingSubscription, 'status' | 'selectedPlanId' | 'planName' | 'extraPointOfSaleSlots'> | null | undefined,
): number {
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return POINT_OF_SALE_LIMITS.basic;
  }
  const tier = resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '');
  const extra = clampExtraPointOfSaleSlots(subscription.extraPointOfSaleSlots);
  return getBasePointOfSaleLimit(tier) + extra;
}

export function subscriptionHasAdminProAccess(
  subscription: Pick<BillingSubscription, 'adminProAccess'> | null | undefined,
): boolean {
  return Boolean(subscription?.adminProAccess);
}

export function subscriptionHasProAccess(
  subscription: Pick<
    BillingSubscription,
    'status' | 'selectedPlanId' | 'planName' | 'adminProAccess'
  > | null | undefined,
): boolean {
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return false;
  }
  if (subscriptionHasAdminProAccess(subscription)) return true;
  return resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '') === 'pro';
}
