import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PLAN_TIER_LABELS,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';
import {
  getLockedReports,
  getUnlockedReports,
  isReportUnlocked,
  reportsSummaryByPlan,
  type ReportAccessContext,
  type ReportCatalogEntry,
  type ReportId,
} from '../lib/reportPlanCatalog';
import { useEffectivePlanTier } from './useEffectivePlanTier';

export function useReportPlanAccess() {
  const { user } = useAuth();

  const planTier = useEffectivePlanTier();

  const isManager = useMemo(() => {
    const role = user?.role;
    return role === 'Admin' || role === 'Gerente';
  }, [user?.role]);

  const canViewSensitiveReports = useMemo(() => {
    if (isManager) return true;
    const perms = user?.permissions as Record<string, { view?: boolean }> | undefined;
    return perms?.reports?.view === true;
  }, [isManager, user?.permissions]);

  const accessContext: ReportAccessContext = useMemo(
    () => ({ planTier, isManager, canViewSensitiveReports }),
    [planTier, isManager, canViewSensitiveReports],
  );

  const unlockedReports = useMemo(
    () => getUnlockedReports(accessContext),
    [accessContext],
  );

  const lockedReports = useMemo(
    () => getLockedReports(accessContext),
    [accessContext],
  );

  const summary = useMemo(() => reportsSummaryByPlan(planTier), [planTier]);

  const isBasicPlan = planTier === 'basic';
  const hasFullReportsAccess = !isBasicPlan || unlockedReports.length > 2;

  function canAccessReport(id: ReportId): boolean {
    const entry = unlockedReports.find((r) => r.id === id);
    if (!entry) return false;
    return isReportUnlocked(entry, accessContext);
  }

  function findReport(id: ReportId): ReportCatalogEntry | undefined {
    return unlockedReports.find((r) => r.id === id)
      ?? lockedReports.find((r) => r.id === id);
  }

  return {
    planTier,
    planLabel: PLAN_TIER_LABELS[planTier],
    isManager,
    canViewSensitiveReports,
    unlockedReports,
    lockedReports,
    summary,
    isBasicPlan,
    hasFullReportsAccess,
    canAccessReport,
    findReport,
  };
}

export type { SubscriptionPlanTier, ReportCatalogEntry, ReportId };
