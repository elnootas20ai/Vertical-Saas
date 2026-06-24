const ACTIVATION_STATUSES = new Set(['subscription_active', 'trial_active']);
const BLOCKING_STATUSES = new Set(['suspended', 'grace_period', 'payment_failed', 'trial_expired']);

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
    currentPeriodEnd: merged.currentPeriodEnd || periodEnd.toISOString(),
    gracePeriodEndsAt:
      BLOCKING_STATUSES.has(prevStatus) || !merged.gracePeriodEndsAt
        ? graceEnd.toISOString()
        : merged.gracePeriodEndsAt,
  };
}

export function isActivationStatus(status) {
  return ACTIVATION_STATUSES.has(String(status || '').trim());
}

export function isBlockingSubscriptionStatus(status) {
  return BLOCKING_STATUSES.has(String(status || '').trim());
}
