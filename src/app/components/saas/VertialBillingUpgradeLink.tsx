import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

/**
 * Enlace a facturación / upgrade de plan Vertial.
 * En iOS no se muestra (Guideline 3.1.1 — sin CTAs de cobro SaaS).
 */
export function VertialBillingUpgradeLink({
  to = '/saas/billing',
  className,
  children,
  fallback = null,
}: {
  to?: string;
  className?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (isIosCustomerAccessOnlyApp()) {
    return <>{fallback}</>;
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

/** true = se pueden mostrar CTAs de upgrade/pago de suscripción Vertial */
export function canShowVertialBillingUpgradeCta(): boolean {
  return !isIosCustomerAccessOnlyApp();
}
