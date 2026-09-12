import {
  resolvePlanTier,
  subscriptionHasProAccess,
} from './entitlements.js';

export const RESTAURANT_PLAN_FEATURES = {
  core_operations: { minPlan: 'basic', svaEligible: false },
  inventory: { minPlan: 'normal', svaEligible: false },
  costing: { minPlan: 'normal', svaEligible: false },
  purchases_ocr: { minPlan: 'normal', svaEligible: false },
  dashboard_1: { minPlan: 'normal', svaEligible: false },
  restaurant_ops: { minPlan: 'pro', svaEligible: false },
  dashboard_advanced: { minPlan: 'pro', svaEligible: false },
  reports_advanced: { minPlan: 'pro', svaEligible: false },
  production_stations: { minPlan: 'pro', svaEligible: false },
  offline_tpv: { minPlan: 'pro', svaEligible: false },
  invoice_imap: { minPlan: 'pro', svaEligible: false },
  public_web_orders: { minPlan: 'pro', svaEligible: true, svaId: 'web_orders' },
  table_qr_orders: { minPlan: 'pro', svaEligible: true, svaId: 'table_qr' },
  hr_advanced: { minPlan: 'pro', svaEligible: true, svaId: 'hr' },
  finance_advanced: { minPlan: 'pro', svaEligible: true, svaId: 'finance' },
  crm_advanced: { minPlan: 'pro', svaEligible: true, svaId: 'crm_plus' },
  external_channels: { minPlan: 'pro', svaEligible: true, svaId: 'channels' },
  team_chat: { minPlan: 'pro', svaEligible: true, svaId: 'team_chat' },
  calendar: { minPlan: 'pro', svaEligible: true, svaId: 'calendar' },
};

const PLAN_RANK = { basic: 0, normal: 1, pro: 2 };
const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'subscription_active',
  'trial_active',
  'trial_expiring',
]);

export function restaurantFeatureForId(featureId) {
  return RESTAURANT_PLAN_FEATURES[featureId] || null;
}

export function restaurantFeatureAccessForTier(featureId, planTier, activeSvaIds = []) {
  const feature = restaurantFeatureForId(featureId);
  if (!feature) return false;
  const tier = resolvePlanTier(planTier, planTier);
  if ((PLAN_RANK[tier] || 0) >= (PLAN_RANK[feature.minPlan] || 0)) return true;
  if (!feature.svaEligible || !feature.svaId || tier !== 'normal') return false;
  const enabled = new Set(
    Array.isArray(activeSvaIds)
      ? activeSvaIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
  );
  return enabled.has(feature.svaId);
}

export function accountHasRestaurantFeature(account, featureId) {
  const subscription = account?.subscription || {};
  const billingExempt = Boolean(subscription?.billingExempt);
  const subscriptionActive = ACTIVE_SUBSCRIPTION_STATUSES.has(
    String(subscription?.status || ''),
  );
  const tier = billingExempt || subscriptionHasProAccess(subscription)
    ? 'pro'
    : subscriptionActive
      ? resolvePlanTier(subscription?.selectedPlanId, subscription?.planName)
      : 'basic';
  return restaurantFeatureAccessForTier(
    featureId,
    tier,
    subscription?.activeSvaIds,
  );
}
