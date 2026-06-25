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
  recommendOnboardingPlan,
} from '../../../lib/onboardingPlanRecommendation';

const STEP_INDEX = 4;

export function Recommendation() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const [billingMode, setBillingMode] = useState<'monthly' | 'annual'>(data.subscriptionSelection.billingMode);
  const [showComparison, setShowComparison] = useState(false);

  const plans = useMemo(() => getPlansForBusinessType(data.businessType), [data.businessType]);

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

  const recommendation = useMemo(
    () =>
      recommendOnboardingPlan({
        businessType: data.businessType,
        userCount: data.businessMetrics.userCount,
        locationCount: data.businessMetrics.locationCount,
        businessCount: data.businessMetrics.businessCount,
        commercialBrandCount: data.businessMetrics.commercialBrandCount,
        modules: data.requestedModules,
      }),
    [
      data.businessType,
      data.businessMetrics.locationCount,
      data.businessMetrics.userCount,
      data.businessMetrics.businessCount,
      data.businessMetrics.commercialBrandCount,
      data.requestedModules,
    ],
  );

  const pricing = useMemo(
    () =>
      calculateOnboardingPricing({
        plan: recommendation.plan,
        billingMode,
        userCount: data.businessMetrics.userCount,
        locationCount: data.businessMetrics.locationCount,
        businessCount: data.businessMetrics.businessCount,
        commercialBrandCount: data.businessMetrics.commercialBrandCount,
      }),
    [billingMode, data.businessMetrics, recommendation.plan],
  );

  const handleStartTrial = () => {
    const totals = estimateSubscriptionTotals({
      plan: recommendation.plan,
      userCount: data.businessMetrics.userCount,
      locationCount: data.businessMetrics.locationCount,
      businessCount: data.businessMetrics.businessCount,
      commercialBrandCount: data.businessMetrics.commercialBrandCount,
    });

    updateData('subscriptionSelection', {
      recommendedPlanId: recommendation.plan.id,
      billingMode,
      estimatedMonthlyTotal: totals.estimatedMonthlyTotal,
      estimatedAnnualTotal: totals.estimatedAnnualTotal,
    });
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/payment-info');
  };

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
      <OnboardingStepHeading stepLabel="Paso 5 · Precio" title="Tu precio recomendado" subtitle={recommendation.reason} />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 bg-white dark:bg-gray-800 border-2 border-amber-500 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col overflow-hidden">
          <div className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold mb-2 w-fit">
            <CheckCircle className="w-3.5 h-3.5" />
            Recomendado
          </div>

          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 shrink-0">
            Plan {recommendation.plan.name}
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

          {recommendation.exceedsPlanLimits ? (
            <p className="shrink-0 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Tu operativa supera el cupo base del plan PRO. Podrás contratar ampliaciones en Facturación.
            </p>
          ) : null}

          <div className="shrink-0 flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setBillingMode('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                billingMode === 'monthly' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingMode('annual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                billingMode === 'annual' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700'
              }`}
            >
              Anual <span className="text-green-600 font-bold">-20%</span>
            </button>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {pricing.total}€<span className="text-sm font-normal text-gray-500">/mes</span>
              </p>
              {billingMode === 'annual' ? (
                <p className="mt-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                  {pricing.total * 12}€ al año · -20% aplicado
                </p>
              ) : null}
            </div>
          </div>

          {(pricing.extraUsers > 0 ||
            pricing.extraPdv > 0 ||
            pricing.extraBusinesses > 0 ||
            pricing.extraBrands > 0) && (
            <p className="shrink-0 text-xs text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
              {billingMode === 'annual' ? 'Con descuento anual (-20%): ' : ''}
              Plan {recommendation.plan.name} {pricing.baseCost}€
              {pricing.extraUsers > 0 && ` + ${pricing.extraUsers} trabajador(es) extra (${pricing.extraUsersCost}€)`}
              {pricing.extraPdv > 0 && ` + ${pricing.extraPdv} PDV extra (${pricing.extraPdvCost}€)`}
              {pricing.extraBusinesses > 0 &&
                ` + ${pricing.extraBusinesses} empresa(s) extra (${pricing.extraBusinessesCost}€)`}
              {pricing.extraBrands > 0 &&
                ` + ${pricing.extraBrands} marca(s) extra (${pricing.extraBrandsCost}€)`}
            </p>
          )}

          <ul className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 content-start text-xs sm:text-sm text-gray-700 dark:text-gray-300 overflow-hidden">
            {recommendation.plan.features.map((feature) => (
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

      <ACCESO__Modal open={showComparison} onClose={() => setShowComparison(false)} title="Comparación de planes">
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-4 ${
                plan.id === recommendation.plan.id ? 'border-amber-500' : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{plan.name}</h3>
              <div className="mb-3">
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {billingMode === 'monthly' ? plan.priceMonthly : plan.priceAnnual}€
                </span>
                <span className="text-gray-600 dark:text-gray-400 text-sm">/mes</span>
              </div>
              <ul className="space-y-1.5 mb-4">
                {plan.features.slice(0, 3).map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-xs">
                    <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ACCESO__Modal>
    </OnboardingStepShell>
  );
}
