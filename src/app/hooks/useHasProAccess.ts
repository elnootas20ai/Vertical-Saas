import { usePointOfSaleAccess } from './usePointOfSaleAccess';

/**
 * Determines whether the current user has access to PRO-only features.
 *
 * A plan counts as PRO when:
 *  - The subscription is in an "active" state (covers paid plans), and
 *  - The selected plan id is `'pro'`, or the plan name contains `'pro'`.
 *
 * This hook honours the dev plan override (`setDevSubscriptionPlan`) so that
 * `uriel@admin.com` can swap plans on the fly and CTA gates unlock immediately.
 */
export function useHasProAccess(): boolean {
  return usePointOfSaleAccess(0).hasProAccess;
}
