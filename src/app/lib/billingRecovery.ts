/** Rutas accesibles con suscripción bloqueada (pago / recuperación). */
export const BILLING_RECOVERY_PATHS = [
  '/saas/suspended',
  '/saas/billing',
  '/saas/help',
  '/saas/settings/facturacion',
] as const;

export function isBillingRecoveryPath(pathname: string): boolean {
  return BILLING_RECOVERY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function isBlockingSubscriptionStatus(status: string | undefined): boolean {
  return ['suspended', 'grace_period', 'payment_failed', 'trial_expired'].includes(
    String(status || ''),
  );
}

export function isSuspendedStatus(status: string | undefined): boolean {
  return String(status || '') === 'suspended';
}
