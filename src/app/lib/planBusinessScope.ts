/**
 * Visibilidad de empresas según plan efectivo.
 * Mediano/Básico: solo el cupo incluido (+ extras contratados).
 * Pro / Ilimitado: no se ocultan (arquitectura multi-empresa).
 */
import { sortByBusinessUsage } from './businessUsageOrder';
import { normalizeBusinessScopeId } from './deliverySetup';
import {
  clampExtraBusinessSlots,
  INCLUDED_BUSINESSES,
  type SubscriptionPlanTier,
} from './tenantEntitlements';

export function getVisibleBusinessLimit(
  planTier: SubscriptionPlanTier,
  extraBusinessSlots: unknown = 0,
): number {
  if (planTier === 'pro') return Number.POSITIVE_INFINITY;
  return INCLUDED_BUSINESSES[planTier] + clampExtraBusinessSlots(extraBusinessSlots);
}

export function limitVisibleBusinesses<
  T extends { business_id?: string; id?: string; name?: string },
>(
  businesses: T[],
  limit: number,
  opts?: {
    userId?: string | null;
    preferId?: string | null;
  },
): T[] {
  if (!Array.isArray(businesses) || businesses.length === 0) return businesses;
  if (!Number.isFinite(limit) || limit >= businesses.length) return businesses;
  if (limit <= 0) return [];

  const prefer = normalizeBusinessScopeId(opts?.preferId);
  const preferred = prefer
    ? businesses.find(
        (b) =>
          normalizeBusinessScopeId(b.business_id) === prefer
          || normalizeBusinessScopeId(b.id) === prefer,
      )
    : undefined;

  const sorted = sortByBusinessUsage(businesses, opts?.userId);
  const out: T[] = [];
  const seen = new Set<string>();

  const push = (b: T | undefined) => {
    if (!b) return;
    const id = normalizeBusinessScopeId(b.business_id || b.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(b);
  };

  push(preferred);
  for (const b of sorted) {
    if (out.length >= limit) break;
    push(b);
  }
  return out;
}
