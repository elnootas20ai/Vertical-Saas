/** Evita que webhooks MONEI ajenos suspendan cuentas manuales (p. ej. Pauroyo sin cobro en pasarela). */

const DOWNGRADE_MONEI = new Set(['PAST_DUE', 'PAUSED', 'CANCELLED']);
const UPGRADE_MONEI = new Set(['ACTIVE', 'TRIALING']);

export function shouldApplyMoneiWebhookUpdate(account, webhookSubscriptionId, moneiStatus) {
  const incomingId = String(webhookSubscriptionId || '').trim();
  const storedId = String(account?.subscription?.moneiSubscriptionId || '').trim();

  if (UPGRADE_MONEI.has(String(moneiStatus || ''))) {
    return true;
  }

  if (!DOWNGRADE_MONEI.has(String(moneiStatus || ''))) {
    return true;
  }

  if (!storedId) {
    return false;
  }

  if (incomingId && storedId !== incomingId) {
    return false;
  }

  return true;
}

export function mapMoneiStatusToAppStatus(moneiStatus, currentStatus = 'trial_active') {
  const m = String(moneiStatus || '');
  if (m === 'ACTIVE') return 'subscription_active';
  if (m === 'TRIALING') return 'trial_active';
  if (m === 'PAST_DUE') return 'payment_failed';
  if (m === 'PAUSED') return 'grace_period';
  if (m === 'CANCELLED') return 'suspended';
  return currentStatus;
}

export function applyBillingExemptOverride(appStatus, subscription) {
  if (
    Boolean(subscription?.billingExempt) &&
    ['suspended', 'payment_failed', 'grace_period', 'trial_expired'].includes(appStatus)
  ) {
    return 'subscription_active';
  }
  return appStatus;
}
