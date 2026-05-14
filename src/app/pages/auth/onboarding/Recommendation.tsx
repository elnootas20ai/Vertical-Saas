import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Check, CheckCircle, MapPin, Users } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Stepper } from '../../../components/design-system/ACCESO__Stepper';
import { ACCESO__Modal } from '../../../components/design-system/ACCESO__Modal';
import { useOnboarding, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

const STEP_INDEX = 4;

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxUsers: number;
  maxLocations: number;
  features: string[];
}

const plans: Plan[] = [
  {
    id: 'basic',
    name: 'BASIC',
    priceMonthly: 49,
    priceAnnual: 39,
    maxUsers: 2,
    maxLocations: 1,
    features: ['Hasta 2 usuarios', '1 ubicación', 'Stock ilimitado', 'Operaciones y CRM', 'Documentos básicos'],
  },
  {
    id: 'normal',
    name: 'NORMAL',
    priceMonthly: 149,
    priceAnnual: 119,
    maxUsers: 5,
    maxLocations: 1,
    features: ['Hasta 5 usuarios', '1 ubicación', 'Firma digital', 'Gestoría integrada', 'KPIs avanzados'],
  },
  {
    id: 'pro',
    name: 'PRO',
    priceMonthly: 349,
    priceAnnual: 279,
    maxUsers: 12,
    maxLocations: 2,
    features: ['Hasta 12 usuarios', 'Hasta 2 ubicaciones', 'API y Webhooks', 'Soporte prioritario', 'Onboarding personalizado'],
  },
];

export function Recommendation() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const [billingMode, setBillingMode] = useState<'monthly' | 'annual'>(data.subscriptionSelection.billingMode);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);

  const selectedModules = useMemo(() => {
    const labels = {
      inventory: 'Inventory',
      sales: 'Sales',
      crm: 'CRM',
      documentation: 'Documentation',
      analytics: 'Analytics',
      workshop: 'Workshop',
    } as const;

    return Object.entries(data.requestedModules)
      .filter(([, enabled]) => enabled)
      .map(([key]) => labels[key as keyof typeof labels]);
  }, [data.requestedModules]);

  const recommendation = useMemo(() => {
    const userCount = data.businessMetrics.userCount;
    const locationCount = data.businessMetrics.locationCount;

    if (userCount > 12 || locationCount > 2) {
      return {
        plan: plans[2],
        reason: `Con ${userCount} usuarios y ${locationCount} ubicaciones, lo más cercano es PRO y luego se puede ampliar a medida.`,
      };
    }

    let planId = 'basic';
    if (userCount > 2 || locationCount > 1) {
      planId = 'normal';
    }
    if (userCount > 5 || locationCount > 1) {
      planId = 'pro';
    }
    if ((data.requestedModules.analytics || data.requestedModules.documentation) && planId === 'basic') {
      planId = 'normal';
    }

    return {
      plan: plans.find((plan) => plan.id === planId) || plans[0],
      reason: `Con ${userCount} usuario${userCount !== 1 ? 's' : ''}, ${locationCount} ubicación${locationCount !== 1 ? 'es' : ''} y ${selectedModules.length || 1} área${selectedModules.length === 1 ? '' : 's'} a gestionar, este plan encaja mejor con tu operativa.`,
    };
  }, [data.businessMetrics.locationCount, data.businessMetrics.userCount, data.requestedModules, selectedModules.length]);

  const pricing = useMemo(() => {
    const extraUsers = Math.max(0, data.businessMetrics.userCount - recommendation.plan.maxUsers);
    const extraLocations = Math.max(0, data.businessMetrics.locationCount - recommendation.plan.maxLocations);
    const extraUsersCost = extraUsers * 5;
    const extraLocationsCost = extraLocations * 25;
    const baseCost = billingMode === 'monthly' ? recommendation.plan.priceMonthly : recommendation.plan.priceAnnual;
    const total = baseCost + extraUsersCost + extraLocationsCost;

    return {
      baseCost,
      extraUsers,
      extraLocations,
      extraUsersCost,
      extraLocationsCost,
      total,
    };
  }, [billingMode, data.businessMetrics.locationCount, data.businessMetrics.userCount, recommendation.plan]);

  const handleStartTrial = () => {
    updateData('subscriptionSelection', {
      recommendedPlanId: recommendation.plan.id,
      billingMode,
      estimatedMonthlyTotal:
        recommendation.plan.priceMonthly +
        Math.max(0, data.businessMetrics.userCount - recommendation.plan.maxUsers) * 5 +
        Math.max(0, data.businessMetrics.locationCount - recommendation.plan.maxLocations) * 25,
      estimatedAnnualTotal:
        recommendation.plan.priceAnnual +
        Math.max(0, data.businessMetrics.userCount - recommendation.plan.maxUsers) * 5 +
        Math.max(0, data.businessMetrics.locationCount - recommendation.plan.maxLocations) * 25,
    });
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/payment-info');
  };

  const handleBack = () => {
    navigate('/auth/onboarding/needs');
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Stepper sticky arriba */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 pt-6 pb-2 shrink-0">
        <div className="w-full max-w-3xl mx-auto">
          <ACCESO__Stepper
            steps={[...ONBOARDING_STEPS]}
            currentStep={STEP_INDEX}
            onStepClick={(i) => {
              if (i !== STEP_INDEX) navigate(ONBOARDING_ROUTES[i]);
            }}
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="w-full max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">Tu plan recomendado</h1>
            <p className="text-gray-600 dark:text-gray-400">Basándonos en tus respuestas, te recomendamos empezar con:</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border-2 border-amber-500 rounded-2xl p-8 mb-6 shadow-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-bold mb-3">
              <CheckCircle className="w-4 h-4" />
              Recomendado para ti
            </div>

            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Plan {recommendation.plan.name}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{recommendation.reason}</p>

            <div className="flex flex-wrap gap-4 text-sm mb-6">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span>{data.businessMetrics.userCount} usuarios</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span>{data.businessMetrics.locationCount} ubicaciones</span>
              </div>
              {selectedModules.length > 0 && (
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Check className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span>{selectedModules.join(', ')}</span>
                </div>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setBillingMode('monthly')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    billingMode === 'monthly' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  Mensual
                </button>
                <button
                  onClick={() => setBillingMode('annual')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    billingMode === 'annual' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  Anual <span className="ml-2 text-xs text-green-600 font-bold">Ahorra 20%</span>
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Plan {recommendation.plan.name}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{pricing.baseCost}€/mes</span>
                  </div>
                  {pricing.extraUsers > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">+ {pricing.extraUsers} usuarios extra</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{pricing.extraUsersCost}€/mes</span>
                    </div>
                  )}
                  {pricing.extraLocations > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">+ {pricing.extraLocations} ubicaciones extra</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{pricing.extraLocationsCost}€/mes</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-300 flex justify-between">
                    <span className="font-bold text-gray-900 dark:text-gray-100">Total estimado</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{pricing.total}€/mes</span>
                  </div>
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-gray-900 dark:text-gray-100">{pricing.total}€</span>
                <span className="text-gray-600 dark:text-gray-400">/mes</span>
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              {recommendation.plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>

            <ACCESO__Button onClick={handleStartTrial} variant="primary" fullWidth size="lg">
              Continuar
              <ArrowRight className="w-5 h-5 ml-2" />
            </ACCESO__Button>
          </div>

          <div className="text-center mb-4">
            <button onClick={() => setShowComparison(true)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 underline text-sm">
              Ver comparación de todos los planes
            </button>
          </div>
        </div>
      </div>

      {/* Botón sticky abajo */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
        <div className="w-full max-w-3xl mx-auto flex justify-start">
          <ACCESO__Button variant="outline" onClick={handleBack}>
            ← Volver
          </ACCESO__Button>
        </div>
      </div>

      <ACCESO__Modal open={showComparison} onClose={() => setShowComparison(false)} title="Comparación de planes">
        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-4 ${plan.id === recommendation.plan.id ? 'border-amber-500' : 'border-gray-200 dark:border-gray-700'}`}>
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
    </div>
  );
}