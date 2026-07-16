import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  BLOCKING_SUBSCRIPTION_STATUSES,
  isActiveSubscriptionStatus,
  isBlockingSubscriptionStatus,
  appendSubscriptionHistory,
} from '../shared/billing/subscriptionAccess.js';

export {
  isActiveSubscriptionStatus,
  isBlockingSubscriptionStatus,
  appendSubscriptionHistory,
};

const ACTIVATION_STATUSES = ACTIVE_SUBSCRIPTION_STATUSES;
const BLOCKING_STATUSES = BLOCKING_SUBSCRIPTION_STATUSES;

/**
 * Cuando un superadmin activa una cuenta manualmente, MONEI (CANCELLED) y el cron
 * de gracia la volverían a suspender sin billingExempt y fechas de periodo.
 */
export function applySuperAdminSubscriptionActivation(merged, previousSubscription) {
  const nextStatus = String(merged?.status || '').trim();
  if (!ACTIVATION_STATUSES.has(nextStatus)) return merged;

  const prevStatus = String(previousSubscription?.status || '').trim();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const graceEnd = new Date(periodEnd);
  graceEnd.setDate(graceEnd.getDate() + 7);

  return {
    ...merged,
    billingExempt: Boolean(merged.billingExempt),
    cancelAtPeriodEnd: false,
    currentPeriodStart: merged.currentPeriodStart || now.toISOString(),
    currentPeriodEnd: merged.currentPeriodEnd || periodEnd.toISOString(),
    gracePeriodEndsAt:
      BLOCKING_STATUSES.has(prevStatus) || !merged.gracePeriodEndsAt
        ? graceEnd.toISOString()
        : merged.gracePeriodEndsAt,
    activationDate: merged.activationDate || now.toISOString(),
  };
}

export function isActivationStatus(status) {
  return isActiveSubscriptionStatus(status);
}
