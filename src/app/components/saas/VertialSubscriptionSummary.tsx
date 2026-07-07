import {
  Building2,
  Calendar,
  Check,
  CreditCard,
  Package,
  Sparkles,
  Store,
  Tag,
} from 'lucide-react';
import type { AuthUser, BillingSubscription } from '../../lib/authApi';
import type { PlanDefinition } from '../../lib/planPricingApi';
import { PLAN_ADDON_CATALOG } from '../../lib/planAddonCatalog';
import { PRO_LAUNCH_OFFER } from '../../lib/planCatalog';
import {
  getEffectiveBusinessLimit,
  getEffectiveCommercialBrandLimit,
  INCLUDED_BUSINESSES,
  INCLUDED_COMMERCIAL_BRANDS,
} from '../../lib/tenantEntitlements';
import { getEffectivePointOfSaleLimit, PLAN_TIER_LABELS, resolvePlanTier } from '../../lib/pointOfSaleLimits';

interface StatusStyle {
  label: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
}

export interface VertialSubscriptionSummaryProps {
  subscription: BillingSubscription;
  user?: AuthUser | null;
  activePlan: PlanDefinition;
  billingMode: 'monthly' | 'annual';
  annualDiscount?: number;
  statusStyle: StatusStyle;
  onChangePlan: () => void;
}

function formatPrice(plan: PlanDefinition, mode: 'monthly' | 'annual', discount: number) {
  if (mode === 'annual') {
    const annual = Math.round(plan.monthlyPrice * 12 * (1 - discount));
    return `${annual}€/año`;
  }
  return `${plan.monthlyPrice}€/mes`;
}

export function VertialSubscriptionSummary({
  subscription,
  user,
  activePlan,
  billingMode,
  annualDiscount = 0.2,
  statusStyle,
  onChangePlan,
}: VertialSubscriptionSummaryProps) {
  const tier = resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '');
  const planLabel = PLAN_TIER_LABELS[tier] || subscription.planName || activePlan.name;
  const pdvLimit = getEffectivePointOfSaleLimit(subscription);
  const businessLimit = getEffectiveBusinessLimit(subscription);
  const brandLimit = getEffectiveCommercialBrandLimit(subscription);
  const baseBusinesses = INCLUDED_BUSINESSES[tier];
  const baseBrands = INCLUDED_COMMERCIAL_BRANDS[tier];
  const extraPdv = subscription.extraPointOfSaleSlots ?? 0;
  const extraBrands = subscription.extraCommercialBrandSlots ?? 0;
  const extraBusinesses = subscription.extraBusinessSlots ?? 0;
  const cardLastFour = String(user?.paymentSummary?.lastFourDigits || '').trim();
  const effectiveMode =
    subscription.billingMode === 'annual' || subscription.billingMode === 'monthly'
      ? subscription.billingMode
      : user?.paymentSummary?.billingMode === 'annual' || user?.paymentSummary?.billingMode === 'monthly'
        ? user.paymentSummary.billingMode
        : billingMode;

  const includedItems = [
    {
      icon: Building2,
      label: `${businessLimit} empresa${businessLimit === 1 ? '' : 's'}`,
      detail:
        extraBusinesses > 0
          ? `${baseBusinesses} del plan + ${extraBusinesses} extra`
          : 'Incluida en el plan',
    },
    {
      icon: Store,
      label: `${pdvLimit} tienda${pdvLimit === 1 ? '' : 's'} / PDV`,
      detail: extraPdv > 0 ? `+${extraPdv} ampliación contratada` : 'Según tu plan',
    },
    {
      icon: Tag,
      label: `${brandLimit} marca${brandLimit === 1 ? '' : 's'} comercial${brandLimit === 1 ? '' : 'es'}`,
      detail:
        brandLimit === 0
          ? 'Sin marcas extra (solo General)'
          : extraBrands > 0
            ? `${baseBrands} del plan + ${extraBrands} extra`
            : 'Incluidas en el plan',
    },
  ];

  const contractedAddons = [
    extraPdv > 0
      ? `${extraPdv}× ${PLAN_ADDON_CATALOG.extra_pdv.name}`
      : null,
    extraBrands > 0
      ? `${extraBrands}× ${PLAN_ADDON_CATALOG.extra_brand.name}`
      : null,
    extraBusinesses > 0
      ? `${extraBusinesses}× ${PLAN_ADDON_CATALOG.extra_business.name}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 p-6 dark:border-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Tu plan con Vertial
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{planLabel}</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle.badgeBg} ${statusStyle.badgeText}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                {statusStyle.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Cobro {effectiveMode === 'annual' ? 'anual' : 'mensual'} ·{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatPrice(activePlan, effectiveMode, annualDiscount)}
              </span>
            </p>
            {subscription.trialEndsAt &&
            ['trial_active', 'trial_expiring'].includes(subscription.status) ? (
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                Prueba gratuita hasta el{' '}
                {new Date(subscription.trialEndsAt).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            ) : null}
            {tier === 'pro' ? (
              <p className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
                <span className="font-semibold">{PRO_LAUNCH_OFFER.badge}.</span> {PRO_LAUNCH_OFFER.footnote}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onChangePlan}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border-2 border-gray-900 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <Sparkles className="h-4 w-4" />
            Cambiar plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Incluido en tu contrato
          </p>
          <ul className="space-y-3">
            {includedItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-800">
                    <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ampliaciones contratadas
            </p>
            {contractedAddons.length > 0 ? (
              <ul className="space-y-2">
                {contractedAddons.map((line) => (
                  <li key={line} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sin ampliaciones de pago. Puedes añadir PDV, marcas o empresas extra más abajo.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {subscription.currentPeriodEnd ? (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  <p className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Próximo ciclo</p>
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
            ) : null}
            {subscription.lastPaymentAt ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Último pago</p>
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    {new Date(subscription.lastPaymentAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/50">
              <CreditCard className="h-4 w-4 shrink-0 text-gray-500" />
              <div>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Método de pago</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {cardLastFour ? `Tarjeta ····${cardLastFour}` : 'Sin tarjeta registrada'}
                </p>
              </div>
            </div>
            {subscription.adminProAccess ? (
              <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
                <Package className="h-4 w-4 shrink-0 text-violet-600" />
                <div>
                  <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">Acceso Pro</p>
                  <p className="text-sm font-bold text-violet-900 dark:text-violet-100">Activado manualmente</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-6 py-4 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Este resumen refleja tu suscripción a Vertial (plan, cupos y ampliaciones). Para modificar el plan base,
          pulsa <span className="font-semibold text-gray-700 dark:text-gray-300">Cambiar plan</span> y confirma el pago
          en la pasarela segura.
        </p>
      </div>
    </div>
  );
}
