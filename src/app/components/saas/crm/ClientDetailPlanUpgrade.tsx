import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import type { ClientDetailFeatureId } from '../../../lib/clientDetailPlanCatalog';
import { getClientDetailFeature } from '../../../lib/clientDetailPlanCatalog';
import { PLAN_TIER_LABELS } from '../../../lib/pointOfSaleLimits';
import type { SubscriptionPlanTier } from '../../../lib/pointOfSaleLimits';

export function ClientDetailPlanBanner({
  planLabel,
  unlockedCount,
  lockedCount,
}: {
  planLabel: string;
  unlockedCount: number;
  lockedCount: number;
}) {
  if (lockedCount <= 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 dark:border-indigo-800 dark:from-indigo-950/40 dark:to-violet-950/30 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div>
          <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
            Plan {planLabel} — ficha de cliente limitada
          </p>
          <p className="mt-1 text-xs text-indigo-700/90 dark:text-indigo-300">
            Tienes {unlockedCount} función{unlockedCount !== 1 ? 'es' : ''} activa{unlockedCount !== 1 ? 's' : ''}.
            {lockedCount > 0 ? ` ${lockedCount} bloqueada${lockedCount !== 1 ? 's' : ''} en planes superiores.` : ''}
          </p>
        </div>
      </div>
      <Link
        to="/saas/billing"
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
      >
        Ver planes
      </Link>
    </div>
  );
}

export function ClientDetailLockedPanel({
  featureId,
  planTier,
}: {
  featureId: ClientDetailFeatureId;
  planTier: SubscriptionPlanTier;
}) {
  const entry = getClientDetailFeature(featureId);
  const needed = entry ? PLAN_TIER_LABELS[entry.minPlan] : 'Normal';

  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center dark:border-gray-700 dark:bg-gray-800">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-900">
        <Lock className="h-5 w-5 text-gray-400" />
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {entry?.label || 'Función'} — plan {needed}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {entry?.description || 'Disponible en un plan superior.'}
        {planTier === 'basic' ? ' Sube a Normal o Pro para desbloquearla.' : ' Disponible en plan Pro.'}
      </p>
      <Link
        to="/saas/billing"
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900"
      >
        Mejorar plan
      </Link>
    </div>
  );
}
