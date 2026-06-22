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
};

export function PortfolioPlanBanner({
  planLabel,
  planTier,
  maxBusinesses,
  currentBusinesses,
  canUsePortfolioView,
  portfolioLocked,
  variant = 'dashboard',
}: PortfolioPlanBannerProps) {
  if (canUsePortfolioView) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 dark:border-emerald-800 dark:from-emerald-950/40 dark:to-teal-950/30 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
              Plan {planLabel} — multi-empresa activo
            </p>
            <p className="mt-0.5 text-xs text-emerald-800/90 dark:text-emerald-300">
              {currentBusinesses} de {maxBusinesses} empresas · Visión general con finanzas y operativa comparadas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (portfolioLocked) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 dark:border-amber-800 dark:from-amber-950/40 dark:to-orange-950/30 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
              Visión general disponible en plan Pro
            </p>
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300">
              Tienes {currentBusinesses} empresas pero el plan {planLabel} incluye {maxBusinesses}.
              Cambia de empresa arriba o pasa a Pro para ver el portfolio consolidado.
            </p>
          </div>
        </div>
        <Link
          to="/saas/billing"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800"
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
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-400" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Plan {planLabel} — {maxBusinesses} empresa incluida
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {planTier === 'pro'
                ? `Puedes crear hasta ${maxBusinesses} empresas y usar Visión general cuando tengas 2.`
                : 'Segunda empresa y vista portfolio consolidada disponibles en plan Pro.'}
            </p>
          </div>
        </div>
        {planTier !== 'pro' ? (
          <Link
            to="/saas/billing"
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-gray-900 dark:text-indigo-300"
          >
            Subir a Pro
          </Link>
        ) : null}
      </div>
    );
  }

  return null;
}
