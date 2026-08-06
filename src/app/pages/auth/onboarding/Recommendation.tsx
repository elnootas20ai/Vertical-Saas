import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Building2, Check, CheckCircle, Layers, Store, Users } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Modal } from '../../../components/design-system/ACCESO__Modal';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import { useAuth } from '../../../context/AuthContext';
import { isIosCustomerAccessOnlyApp } from '../../../lib/appStoreCompliance';
import { IosCustomerAccessOnlyScreen } from '../../../components/saas/IosCustomerAccessOnlyScreen';
import {
  calculateOnboardingPricing,
  estimateSubscriptionTotals,
  getPlansForBusinessType,
  getSelectedDeliveryNeedLabels,
  getSelectedModuleLabels,
  isDeliveryBusinessType,
  isOnboardingPlanAllowed,
  minimumOnboardingPlanId,
  clampOnboardingPlanId,
  recommendOnboardingPlan,
  type OnboardingPlanDefinition,
  type OnboardingPlanId,
  type OnboardingPricingBreakdown,
} from '../../../lib/onboardingPlanRecommendation';

const STEP_INDEX = 4;

function formatPricingBreakdown(
  plan: OnboardingPlanDefinition,
  pricing: OnboardingPricingBreakdown,
  billingMode: 'monthly' | 'annual',
): string | null {
  const hasExtras =
    pricing.extraUsers > 0 ||
    pricing.extraPdv > 0 ||
    pricing.extraBusinesses > 0 ||
    pricing.extraBrands > 0;
  if (!hasExtras) return null;

  const parts = [`Plan ${plan.name} ${pricing.baseCost}€`];
  if (pricing.extraUsers > 0) {
    parts.push(`${pricing.extraUsers} trab. extra (${pricing.extraUsersCost}€)`);
  }
  if (pricing.extraPdv > 0) {
    parts.push(`${pricing.extraPdv} PDV extra (${pricing.extraPdvCost}€)`);
  }
  if (pricing.extraBusinesses > 0) {
    parts.push(`${pricing.extraBusinesses} emp. extra (${pricing.extraBusinessesCost}€)`);
  }
  if (pricing.extraBrands > 0) {
    parts.push(`${pricing.extraBrands} marcas extra (${pricing.extraBrandsCost}€)`);
  }
  const prefix = billingMode === 'annual' ? 'Anual (−20%): ' : '';
  return `${prefix}${parts.join(' + ')}`;
}

export function Recommendation() {
  const { logout } = useAuth();
  if (isIosCustomerAccessOnlyApp()) {
    return (
      <IosCustomerAccessOnlyScreen
        title="Alta y planes solo en la web"
        onLogout={() => void logout()}
      />
    );
  }
  return <RecommendationWebFlow />;
}

function RecommendationWebFlow() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const [billingMode, setBillingMode] = useState<'monthly' | 'annual'>(data.subscriptionSelection.billingMode);
  const [showComparison, setShowComparison] = useState(false);

  const plans = useMemo(() => getPlansForBusinessType(data.businessType), [data.businessType]);

  const planParams = useMemo(
    () => ({
      businessType: data.businessType,
      userCount: data.businessMetrics.userCount,
      locationCount: data.businessMetrics.locationCount,
      businessCount: data.businessMetrics.businessCount,
      commercialBrandCount: data.businessMetrics.commercialBrandCount,
      modules: data.requestedModules,
      deliveryNeeds: data.deliveryNeeds,
    }),
    [
      data.businessType,
      data.businessMetrics.locationCount,
      data.businessMetrics.userCount,
      data.businessMetrics.businessCount,
      data.businessMetrics.commercialBrandCount,
      data.deliveryNeeds,
      data.requestedModules,
    ],
  );

  const minimumPlanId = useMemo(() => minimumOnboardingPlanId(planParams), [planParams]);

  const recommendation = useMemo(() => recommendOnboardingPlan(planParams), [planParams]);

  const initialPlanId = clampOnboardingPlanId(
    ((data.subscriptionSelection.recommendedPlanId as OnboardingPlanId) ||
      recommendation.planId) as OnboardingPlanId,
    planParams,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<OnboardingPlanId>(initialPlanId);

  useEffect(() => {
    setSelectedPlanId((prev) => clampOnboardingPlanId(prev, planParams));
  }, [minimumPlanId, recommendation.planId, planParams]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? recommendation.plan,
    [plans, selectedPlanId, recommendation.plan],
  );

  useEffect(() => {
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);

  const selectedLabels = useMemo(() => {
    if (isDeliveryBusinessType(data.businessType) && data.deliveryNeeds) {
      return getSelectedDeliveryNeedLabels(data.deliveryNeeds);
    }
    return getSelectedModuleLabels(data.businessType, data.requestedModules);
  }, [data.businessType, data.deliveryNeeds, data.requestedModules]);

  const metrics = recommendation.metrics;

  const pricing = useMemo(
    () =>
      calculateOnboardingPricing({
        plan: selectedPlan,
        billingMode,
        userCount: metrics.userCount,
        locationCount: metrics.locationCount,
        businessCount: metrics.businessCount,
        commercialBrandCount: metrics.commercialBrandCount,
      }),
    [billingMode, metrics, selectedPlan],
  );

  const annualPricing = useMemo(
    () =>
      calculateOnboardingPricing({
        plan: selectedPlan,
        billingMode: 'annual',
        userCount: metrics.userCount,
        locationCount: metrics.locationCount,
        businessCount: metrics.businessCount,
        commercialBrandCount: metrics.commercialBrandCount,
      }),
    [metrics, selectedPlan],
  );

  const pricingBreakdown = formatPricingBreakdown(selectedPlan, pricing, billingMode);

  const planPricingById = useMemo(() => {
    const map = new Map<OnboardingPlanId, OnboardingPricingBreakdown>();
    for (const plan of plans) {
      map.set(
        plan.id,
        calculateOnboardingPricing({
          plan,
          billingMode,
          userCount: metrics.userCount,
          locationCount: metrics.locationCount,
          businessCount: metrics.businessCount,
          commercialBrandCount: metrics.commercialBrandCount,
        }),
      );
    }
    return map;
  }, [billingMode, metrics, plans]);

  const handleSelectPlan = (planId: OnboardingPlanId) => {
    if (!isOnboardingPlanAllowed(planId, planParams)) return;
    setSelectedPlanId(planId);
    setShowComparison(false);
  };

  const handleStartTrial = () => {
    const planId = clampOnboardingPlanId(selectedPlanId, planParams);
    const plan = plans.find((p) => p.id === planId) ?? recommendation.plan;
    const totals = estimateSubscriptionTotals({
      plan,
      userCount: metrics.userCount,
      locationCount: metrics.locationCount,
      businessCount: metrics.businessCount,
      commercialBrandCount: metrics.commercialBrandCount,
    });

    updateData('subscriptionSelection', {
      recommendedPlanId: planId,
      billingMode,
      estimatedMonthlyTotal: totals.estimatedMonthlyTotal,
      estimatedAnnualTotal: totals.estimatedAnnualTotal,
    });
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/payment-info');
  };

  const isRecommendedSelection = selectedPlanId === recommendation.planId;
  const proRequired = minimumPlanId === 'pro';
  const highlightFeatures = selectedPlan.features.slice(0, 4);
  const extraFeatureCount = Math.max(0, selectedPlan.features.length - highlightFeatures.length);

  const addonChips = [
    pricing.extraUsers > 0 ? `+${pricing.extraUsers} trab.` : null,
    pricing.extraPdv > 0 ? `+${pricing.extraPdv} PDV` : null,
    pricing.extraBusinesses > 0 ? `+${pricing.extraBusinesses} emp.` : null,
    pricing.extraBrands > 0 ? `+${pricing.extraBrands} marcas` : null,
  ].filter(Boolean) as string[];

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      footer={
        <div className="flex items-center justify-between gap-3">
          <ACCESO__Button variant="outline" onClick={() => navigate('/auth/onboarding/needs')}>
            ← Volver
          </ACCESO__Button>
          <button
            type="button"
            onClick={() => setShowComparison(true)}
            className="text-xs text-gray-600 underline hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 sm:text-sm"
          >
            Comparar planes
          </button>
        </div>
      }
    >
      <OnboardingStepHeading
        compact
        stepLabel="Paso 5 · Precio"
        title={isRecommendedSelection ? 'Tu precio recomendado' : 'Tu plan seleccionado'}
        subtitle={recommendation.reason}
      />

      <div
        className={`flex flex-col gap-3 rounded-xl border-2 bg-white p-3 shadow-sm dark:bg-gray-800 sm:p-4 ${
          isRecommendedSelection ? 'border-amber-500' : 'border-gray-900 dark:border-gray-100'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold sm:text-xs ${
              isRecommendedSelection
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
            }`}
          >
            <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {isRecommendedSelection ? 'Recomendado' : 'Elegido'}
          </span>
          {selectedPlan.launchOffer ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
              {selectedPlan.launchOffer.badge}
            </span>
          ) : null}
          {proRequired ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
              Mínimo PRO
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              Plan {selectedPlan.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 sm:text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                <Building2 className="h-3 w-3" />
                {data.businessMetrics.businessCount ?? 1} emp.
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                <Store className="h-3 w-3" />
                {data.businessMetrics.locationCount} PDV
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                <Users className="h-3 w-3" />
                {data.businessMetrics.userCount} trab.
              </span>
              {(data.businessMetrics.commercialBrandCount ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                  <Layers className="h-3 w-3" />
                  {data.businessMetrics.commercialBrandCount} marcas
                </span>
              ) : null}
            </div>
          </div>

          <div className="text-right tabular-nums">
            <p className="flex items-baseline justify-end gap-1">
              <span className="text-3xl font-bold leading-none text-gray-900 dark:text-gray-100 sm:text-4xl">
                {pricing.total}
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">€</span>
              <span className="text-sm text-gray-500">/mes</span>
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {billingMode === 'annual'
                ? `${(Math.round(pricing.total * 12 * 100) / 100).toFixed(2)}€/año (−20% sobre el total mensual)`
                : `${(Math.round(annualPricing.total * 12 * 100) / 100).toFixed(2)}€/año si eliges anual`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setBillingMode('monthly')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                billingMode === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingMode('annual')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                billingMode === 'annual'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Anual
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                −20%
              </span>
            </button>
          </div>
          {addonChips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {chip}
            </span>
          ))}
        </div>

        {pricingBreakdown ? (
          <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">{pricingBreakdown}</p>
        ) : null}

        <ul className="grid grid-cols-1 gap-1 text-xs text-gray-700 dark:text-gray-300 sm:grid-cols-2 sm:gap-x-3">
          {highlightFeatures.map((feature) => (
            <li key={feature} className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
              <span className="leading-snug">{feature}</span>
            </li>
          ))}
        </ul>
        {extraFeatureCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowComparison(true)}
            className="self-start text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            +{extraFeatureCount} inclusiones más · comparar
          </button>
        ) : null}

        <ACCESO__Button onClick={handleStartTrial} variant="primary" fullWidth>
          Continuar
          <ArrowRight className="ml-2 h-4 w-4" />
        </ACCESO__Button>
      </div>

      <ACCESO__Modal
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
        title="Elige tu plan"
        maxWidth="6xl"
        tall
      >
        <p className="mb-3 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
          {metrics.businessCount} emp. · {metrics.locationCount} PDV · {metrics.userCount} trab.
          {metrics.commercialBrandCount > 0 ? ` · ${metrics.commercialBrandCount} marcas` : ''}
          {selectedLabels.length > 0 ? ` · ${selectedLabels.slice(0, 3).join(', ')}` : ''}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const planPricing = planPricingById.get(plan.id)!;
            const breakdown = formatPricingBreakdown(plan, planPricing, billingMode);
            const isSelected = plan.id === selectedPlanId;
            const isRecommended = plan.id === recommendation.planId;
            const planAllowed = isOnboardingPlanAllowed(plan.id, planParams);
            const topFeatures = plan.features.slice(0, 5);

            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-xl border-2 bg-white p-3 dark:bg-gray-800 sm:p-4 ${
                  !planAllowed
                    ? 'border-gray-200 opacity-60 dark:border-gray-700'
                    : isSelected
                      ? 'border-gray-900 ring-2 ring-gray-900/10 dark:border-gray-100 dark:ring-gray-100/10'
                      : isRecommended
                        ? 'border-amber-500'
                        : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {isRecommended ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Recomendado
                    </span>
                  ) : null}
                  {plan.launchOffer ? (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                      {plan.launchOffer.badge}
                    </span>
                  ) : null}
                </div>

                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">{plan.name}</h3>
                <p className="mt-1 flex items-baseline gap-1 tabular-nums">
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                    {planPricing.total}
                  </span>
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100">€</span>
                  <span className="text-xs text-gray-500">/mes</span>
                </p>
                {breakdown ? (
                  <p className="mt-1 text-[10px] leading-snug text-gray-500 dark:text-gray-400">{breakdown}</p>
                ) : null}

                <ul className="my-3 flex-1 space-y-1">
                  {topFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <ACCESO__Button
                  variant={isSelected ? 'primary' : 'outline'}
                  fullWidth
                  disabled={!planAllowed}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {isSelected ? 'Seleccionado' : `Elegir ${plan.name}`}
                </ACCESO__Button>
              </div>
            );
          })}
        </div>
      </ACCESO__Modal>
    </OnboardingStepShell>
  );
}
