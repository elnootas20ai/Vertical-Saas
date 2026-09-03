import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useApp, userCanUseDevPlanOverride } from './AppContext';
import { useAuthOptional } from './AuthContext';
import { BusinessContext, type BusinessContextType } from './businessContextRef';
import { normalizeBusinessScopeId } from '../lib/deliverySetup';
import {
  getVisibleBusinessLimit,
  limitVisibleBusinesses,
} from '../lib/planBusinessScope';
import { useEffectivePlanTier } from '../hooks/useEffectivePlanTier';

/**
 * Dentro de AppProvider: filtra `businesses` al cupo del plan efectivo.
 * Pro / Ilimitado = sin ocultar. Mediano/Básico = solo 1 (o cupo + extras).
 */
export function PlanScopedBusinessProvider({ children }: { children: ReactNode }) {
  const parent = useContext(BusinessContext);
  const planTier = useEffectivePlanTier();
  const { subscription, devUnlimitedPdv } = useApp();
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const canDev = userCanUseDevPlanOverride(user);
  const unlimited = Boolean(canDev && devUnlimitedPdv);

  const emptyList = useMemo(() => [] as BusinessContextType['businesses'], []);
  const businesses = parent?.businesses ?? emptyList;

  const limit = unlimited || !parent
    ? Number.POSITIVE_INFINITY
    : getVisibleBusinessLimit(planTier, subscription.extraBusinessSlots);

  const preferId =
    parent?.currentBusiness?.business_id
    || parent?.currentBusiness?.id
    || null;

  const visibleBusinesses = useMemo(
    () =>
      limitVisibleBusinesses(businesses, limit, {
        userId: user?.user_id || user?.id || null,
        preferId,
      }),
    [businesses, limit, user?.user_id, user?.id, preferId],
  );

  useEffect(() => {
    if (!parent) return;
    const curId = normalizeBusinessScopeId(
      parent.currentBusiness?.business_id || parent.currentBusiness?.id,
    );
    if (!curId || visibleBusinesses.length === 0) return;
    const ok = visibleBusinesses.some(
      (b) =>
        normalizeBusinessScopeId(b.business_id) === curId
        || normalizeBusinessScopeId(b.id) === curId,
    );
    if (ok) return;
    const nextId = String(visibleBusinesses[0]?.business_id || visibleBusinesses[0]?.id || '').trim();
    if (nextId) parent.switchBusiness(nextId);
  }, [
    parent?.switchBusiness,
    parent?.currentBusiness?.business_id,
    parent?.currentBusiness?.id,
    visibleBusinesses,
  ]);

  const switchBusiness = useCallback(
    (businessId: string) => {
      if (!parent) return;
      const id = normalizeBusinessScopeId(businessId);
      if (!id) return;
      const allowed = visibleBusinesses.some(
        (b) =>
          normalizeBusinessScopeId(b.business_id) === id
          || normalizeBusinessScopeId(b.id) === id,
      );
      if (!allowed && Number.isFinite(limit) && limit < businesses.length) {
        return;
      }
      parent.switchBusiness(businessId);
    },
    [parent, visibleBusinesses, limit, businesses.length],
  );

  const value = useMemo((): BusinessContextType | null => {
    if (!parent) return null;
    return {
      ...parent,
      businesses: visibleBusinesses,
      switchBusiness,
    };
  }, [parent, visibleBusinesses, switchBusiness]);

  if (!value) {
    return <>{children}</>;
  }

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}
