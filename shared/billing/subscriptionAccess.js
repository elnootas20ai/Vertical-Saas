/**
 * Acceso al SaaS por estado de suscripción (fuente compartida backend).
 * Las cuentas nuevas arrancan en pending_payment; el trial solo lo concede el admin.
 */

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'subscription_active',
  'trial_active',
  'trial_expiring',
]);

export const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'pending_payment',
  'payment_sent',
  'suspended',
  'grace_period',
  'payment_failed',
  'trial_expired',
]);

export function normalizeSubscriptionStatus(status) {
  return String(status || '').trim();
}

export function isActiveSubscriptionStatus(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(status));
}

export function isBlockingSubscriptionStatus(status) {
  return BLOCKING_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(status));
}

export function isBillingExemptSubscription(subscription) {
  return Boolean(subscription && typeof subscription === 'object' && subscription.billingExempt);
}

/** Bloqueo de acceso al producto (ignora trabajadores: el caller decide). */
export function shouldBlockSubscriptionAccess(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;
  if (isBillingExemptSubscription(subscription)) return false;
  return isBlockingSubscriptionStatus(subscription.status);
}

export function buildTransferPaymentConcept(userId) {
  const hex = String(userId || '')
    .replace(/[^a-fA-F0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();
  return `VERTIAL-${hex || '000000'}`;
}

export function appendSubscriptionHistory(subscription, entry) {
  const prev = subscription && typeof subscription === 'object' ? subscription : {};
  const history = Array.isArray(prev.licenseHistory) ? prev.licenseHistory : [];
  const row = {
    at: entry?.at || new Date().toISOString(),
    action: String(entry?.action || '').trim() || 'update',
    by: entry?.by || '',
    note: entry?.note || '',
    ...(entry?.meta && typeof entry.meta === 'object' ? { meta: entry.meta } : {}),
  };
  return {
    ...prev,
    licenseHistory: [...history, row].slice(-100),
  };
}
