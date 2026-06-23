import { Link } from 'react-router-dom';
import { Building2, Lock, Sparkles } from 'lucide-react';
import type { SubscriptionPlanTier } from '../../lib/pointOfSaleLimits';

type PortfolioPlanBannerProps = {
  planLabel: string;
  planTier: SubscriptionPlanTier;
  maxBusinesses: number;
  currentBusinesses: number;
  canUsePortfolioView: boolean;
  portfolioLocked: boolean;
  variant?: 'dashboard' | 'settings';
  /** En dashboard Pro activo no mostrar nada (evita ruido). */
  hideWhenActive?: boolean;
};

export function PortfolioPlanBanner({
  planLabel,
  planTier,
  maxBusinesses,
  currentBusinesses,
  canUsePortfolioView,
  portfolioLocked,
  variant = 'dashboard',
  hideWhenActive = false,
}: PortfolioPlanBannerProps) {
  if (hideWhenActive && canUsePortfolioView) {
    return null;
  }

  if (canUsePortfolioView && variant === 'dashboard') {
    return null;
  }

  if (canUsePortfolioView) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-xs text-emerald-900 dark:text-emerald-100">
          <span className="font-semibold">Plan {planLabel} · multi-empresa activo.</span>{' '}
          {currentBusinesses} de {maxBusinesses} empresas.
        </p>
      </div>
    );
  }

  if (portfolioLocked) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <Lock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-xs text-amber-900 dark:text-amber-100">
            <span className="font-semibold">Visión general en plan Pro.</span>{' '}
            Tienes {currentBusinesses} empresas; el plan {planLabel} incluye {maxBusinesses}.
          </p>
        </div>
        <Link
          to="/saas/billing"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-800"
        >
          Ver plan Pro
        </Link>
      </div>
    );
  }

  if (variant === 'settings' || planTier !== 'pro') {
    const needsSecond = planTier !== 'pro' && currentBusinesses >= 1;
    if (!needsSecond && variant !== 'settings') return null;

    return (
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <Building2 className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" />
          <p className="text-xs text-gray-700 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">Plan {planLabel}</span>
            {' · '}
            {planTier === 'pro'
              ? `Hasta ${maxBusinesses} empresas con visión consolidada.`
              : 'Segunda empresa y portfolio consolidado en plan Pro.'}
          </p>
        </div>
        {planTier !== 'pro' ? (
          <Link
            to="/saas/billing"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-gray-900 dark:text-indigo-300"
          >
            Subir a Pro
          </Link>
        ) : null}
      </div>
    );
  }

  return null;
}
