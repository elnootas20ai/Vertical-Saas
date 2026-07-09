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
    parts.push(`${pricing.extraUsers} trabajador(es) extra (${pricing.extraUsersCost}€)`);
  }
  if (pricing.extraPdv > 0) {
    parts.push(`${pricing.extraPdv} PDV extra (${pricing.extraPdvCost}€)`);
  }
  if (pricing.extraBusinesses > 0) {
    parts.push(`${pricing.extraBusinesses} empresa(s) extra (${pricing.extraBusinessesCost}€)`);
  }
  if (pricing.extraBrands > 0) {
    parts.push(`${pricing.extraBrands} marca(s) extra (${pricing.extraBrandsCost}€)`);
  }
  const prefix = billingMode === 'annual' ? 'Con descuento anual (-20%): ' : '';
  return `${prefix}${parts.join(' + ')}`;
}

export function Recommendation() {
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

  const minimumPlanId = useMemo(() => minimumOnboardingPlanId(planParams), [ planParams]);

  const recommendation = useMemo(() => recommendOnboardingPlan(planParams), [ planParams]);

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
  const needsAddons =
    pricing.extraUsers > 0 ||
    pricing.extraPdv > 0 ||
    pricing.extraBusinesses > 0 ||
    pricing.extraBrands > 0;

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      footer={
        <div className="flex justify-between items-center gap-3">
          <ACCESO__Button variant="outline" onClick={() => navigate('/auth/onboarding/needs')}>
            ← Volver
          </ACCESO__Button>
          <button
            type="button"
            onClick={() => setShowComparison(true)}
            className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline"
          >
            Comparar planes
          </button>
        </div>
      }
    >
      <OnboardingStepHeading
        stepLabel="Paso 5 · Precio"
        title={isRecommendedSelection ? 'Tu precio recomendado' : 'Tu plan seleccionado'}
        subtitle={recommendation.reason}
      />

      {proRequired ? (
        <p className="shrink-0 mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
          Con tu operativa (trabajadores, marcas, módulos o PDV), el plan <strong>PRO</strong> es el mínimo
          necesario. No puedes elegir Basic ni Normal.
        </p>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className={`flex-1 min-h-0 bg-white dark:bg-gray-800 border-2 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col min-h-0 ${
            isRecommendedSelection ? 'border-amber-500' : 'border-gray-900 dark:border-gray-100'
          }`}
        >
          {isRecommendedSelection ? (
            <div className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold mb-2 w-fit">
              <CheckCircle className="w-3.5 h-3.5" />
              Recomendado
            </div>
          ) : (
            <div className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-bold mb-2 w-fit dark:bg-gray-700 dark:text-gray-200">
              Plan elegido
            </div>
          )}
          {selectedPlan.launchOffer ? (
            <div className="shrink-0 mb-2 space-y-1">
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                {selectedPlan.launchOffer.badge}
              </span>
              <p className="text-[11px] leading-relaxed text-violet-800 dark:text-violet-200">
                {selectedPlan.launchOffer.footnote}
              </p>
            </div>
          ) : null}

          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 shrink-0">
            Plan {selectedPlan.name}
          </h2>

          <div className="shrink-0 flex flex-wrap gap-2 text-xs text-gray-700 dark:text-gray-300 my-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-700">
              <Building2 className="w-3.5 h-3.5" />
              {data.businessMetrics.businessCount ?? 1} empresa{(data.businessMetrics.businessCount ?? 1) !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-700">
              <Store className="w-3.5 h-3.5" />
              {data.businessMetrics.locationCount} PDV
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-700">
              <Users className="w-3.5 h-3.5" />
              {data.businessMetrics.userCount} trabajadores
            </span>
            {(data.businessMetrics.commercialBrandCount ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                <Layers className="w-3.5 h-3.5" />
                {data.businessMetrics.commercialBrandCount} marca
                {data.businessMetrics.commercialBrandCount !== 1 ? 's' : ''} extra
              </span>
            ) : null}
            {selectedLabels.length > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                · {selectedLabels.join(', ')}
              </span>
            )}
          </div>

          {needsAddons ? (
            <p className="shrink-0 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Tu operativa supera el cupo base del plan {selectedPlan.name}. Las ampliaciones (PDV, marcas, etc.)
              se suman al precio; los trabajadores incluidos no se cobran extra si entran en el cupo del plan.
            </p>
          ) : null}

          <div className="shrink-0 mb-3 rounded-xl border border-gray-200 bg-gray-50/90 p-3 sm:p-4 dark:border-gray-700 dark:bg-gray-900/50">
            <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setBillingMode('monthly')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  billingMode === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setBillingMode('annual')}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  billingMode === 'annual'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Anual
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  −20%
                </span>
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Tu cuota estimada
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 tabular-nums">
                  <span className="text-3xl font-bold leading-none text-gray-900 dark:text-gray-100 sm:text-4xl">
                    {pricing.total}
                  </span>
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">€</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">/mes</span>
                </p>
                {billingMode === 'annual' ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {pricing.total * 12}€ al año · descuento del 20% aplicado
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    O {annualPricing.total * 12}€ al año con plan anual
                  </p>
                )}
              </div>
              {pricingBreakdown ? (
                <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-400 sm:max-w-[52%] sm:text-right">
                  {pricingBreakdown}
                </p>
              ) : null}
            </div>
          </div>

          <ul className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 content-start overflow-y-auto overscroll-contain text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            {selectedPlan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-1.5">
                <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="shrink-0 pt-3">
            <ACCESO__Button onClick={handleStartTrial} variant="primary" fullWidth>
              Continuar
              <ArrowRight className="w-4 h-4 ml-2" />
            </ACCESO__Button>
          </div>
        </div>
      </div>

      <ACCESO__Modal
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
        title="Elige tu plan"
        maxWidth="6xl"
        tall
      >
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Precio calculado con tus datos ({metrics.businessCount} empresa{metrics.businessCount !== 1 ? 's' : ''},{' '}
          {metrics.locationCount} PDV, {metrics.userCount} trabajadores
          {metrics.commercialBrandCount > 0
            ? `, ${metrics.commercialBrandCount} marca${metrics.commercialBrandCount !== 1 ? 's' : ''} extra`
            : ''}
          ). Los trabajadores solo suman coste si superan el cupo incluido en cada plan.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const planPricing = planPricingById.get(plan.id)!;
            const breakdown = formatPricingBreakdown(plan, planPricing, billingMode);
            const isSelected = plan.id === selectedPlanId;
            const isRecommended = plan.id === recommendation.planId;
            const planAllowed = isOnboardingPlanAllowed(plan.id, planParams);

            return (
              <div
                key={plan.id}
                className={`flex flex-col bg-white dark:bg-gray-800 border-2 rounded-xl p-4 ${
                  ! planAllowed
                    ? 'opacity-60 border-gray-200 dark:border-gray-700'
                    : isSelected
                    ? 'border-gray-900 dark:border-gray-100 ring-2 ring-gray-900/10 dark:ring-gray-100/10'
                    : isRecommended
                      ? 'border-amber-500'
                      : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {isRecommended ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Recomendado
                    </span>
                  ) : null}
                  {plan.launchOffer ? (
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                      {plan.launchOffer.badge}
                    </span>
                  ) : null}
                  {isSelected ? (
                    <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-gray-100 dark:text-gray-900">
                      Seleccionado
                    </span>
                  ) : null}
                </div>

                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{plan.name}</h3>
                <div className="mb-2">
                  <p className="flex items-baseline gap-1 tabular-nums">
                    <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{planPricing.total}</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">€</span>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">/mes</span>
                  </p>
                  {billingMode === 'annual' ? (
                    <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {planPricing.total * 12}€ al año · −20%
                    </p>
                  ) : null}
                </div>

                {breakdown ? (
                  <p className="mb-3 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">{breakdown}</p>
                ) : (
                  <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
                    Cupo base suficiente para tu operativa.
                  </p>
                )}

                {plan.launchOffer ? (
                  <p className="mb-3 text-[11px] leading-relaxed text-violet-800 dark:text-violet-200">
                    {plan.launchOffer.footnote}
                  </p>
                ) : null}

                <ul className="space-y-1.5 mb-4 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs">
                      <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <ACCESO__Button
                  variant={isSelected ? 'primary' : 'outline'}
                  fullWidth
                  disabled={! planAllowed}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {isSelected ? 'Plan seleccionado' : `Elegir ${plan.name}`}
                </ACCESO__Button>
              </div>
            );
          })}
        </div>
      </ACCESO__Modal>
    </OnboardingStepShell>
  );
}
