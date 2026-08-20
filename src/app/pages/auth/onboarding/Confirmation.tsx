import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, Calendar, CreditCard, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { VertialLogo } from '../../../components/VertialLogo';
import { AccesoCompactHero } from '../../../components/auth/AccesoCompactHero';
import { OnboardingHeroPanel } from '../../../components/auth/onboarding/OnboardingHeroPanel';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import { useAuth } from '../../../context/AuthContext';
import { isDeliveryBusinessType } from '../../../lib/onboardingPlanRecommendation';
import { isRestaurantBusinessType } from '../../../lib/deliveryOpsTypes';

const RESTAURANT_BRAND = 'Vertial Bar/restaurante';

const stepKeys = [
  { id: 1, key: 'workspace', duration: 1000 },
  { id: 2, key: 'plan', duration: 1000 },
  { id: 3, key: 'trial', duration: 1000 },
  { id: 4, key: 'payment', duration: 800 },
  { id: 5, key: 'dashboard', duration: 800 },
] as const;

export function Confirmation() {
  const navigate = useNavigate();
  const { data, isProgressReady } = useOnboarding();
  const { updateOnboardingData } = useAuth();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [countdown, setCountdown] = useState(10);
  const [saveReady, setSaveReady] = useState(false);
  const completionStarted = useRef(false);

  useEffect(() => {
    if (!isProgressReady) return;
    // Alta: el pago es el último paso del flujo; el contrato solo tras cobrar de verdad.
    if (data.completedStep < 5) {
      const next = Math.max(0, Math.min(data.completedStep + 1, ONBOARDING_ROUTES.length - 1));
      navigate(ONBOARDING_ROUTES[next], { replace: true });
    }
  }, [isProgressReady, data.completedStep, navigate]);

  const steps = stepKeys.map(s => ({
    ...s,
    label: t(`onboarding.confirmation.steps.${s.key}`),
  }));

  const tradeName = data.companyProfile.tradeName?.trim() || '';
  const isDelivery = isDeliveryBusinessType(data.businessType);
  const isRestaurant = isRestaurantBusinessType(data.businessType);

  const { headingTitle, headingSubtitle } = useMemo(() => {
    if (isDelivery) {
      return {
        headingTitle: tradeName
          ? `¡${tradeName} ya está en Vertial Delivery!`
          : '¡Tu espacio en Vertial Delivery está listo!',
        headingSubtitle: tradeName
          ? `Estamos activando el panel de ${tradeName}: plan y acceso a locales, caja y pedidos.`
          : 'Estamos activando tu plan y el acceso a locales, caja y pedidos.',
      };
    }
    if (isRestaurant) {
      return {
        headingTitle: tradeName
          ? `¡${tradeName} ya está en ${RESTAURANT_BRAND}!`
          : `¡Tu espacio en ${RESTAURANT_BRAND} está listo!`,
        headingSubtitle: tradeName
          ? `Estamos activando bar/restaurante para ${tradeName}: plan, TPV y operativa de sala.`
          : 'Estamos activando tu bar/restaurante: plan, TPV y operativa de sala.',
      };
    }
    return {
      headingTitle: t('onboarding.confirmation.title'),
      headingSubtitle: t('onboarding.confirmation.subtitle'),
    };
  }, [isDelivery, isRestaurant, tradeName, t]);

  useEffect(() => {
    if (currentStep >= steps.length) return;
    const timer = setTimeout(() => {
      setCompletedSteps(prev => [...prev, steps[currentStep].id]);
      setCurrentStep(prev => prev + 1);
    }, steps[currentStep].duration);
    return () => clearTimeout(timer);
  }, [currentStep]);

  useEffect(() => {
    if (currentStep < steps.length) return;
    if (completionStarted.current) return;
    completionStarted.current = true;

    let countdownTimer: number | undefined;
    let finalTimer: number | undefined;

    const goToPaywall = () => {
      // Cliente nuevo: paywall de transferencia (no dashboard con spinner/race a Gate).
      navigate('/saas/subscription', { replace: true });
    };

    // Esperar a que updateProfile provisione la empresa antes de salir.
    void updateOnboardingData(data as unknown as Record<string, unknown>)
      .catch((error) => {
        console.error('Error saving onboarding:', error);
      })
      .finally(() => {
        setSaveReady(true);
        countdownTimer = window.setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownTimer) window.clearInterval(countdownTimer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        finalTimer = window.setTimeout(goToPaywall, 10000);
      });

    return () => {
      if (finalTimer) window.clearTimeout(finalTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  return (
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain scrollbar-visible p-6 pb-28">
      <AccesoCompactHero visualKey="confirmation" className="mb-6 shrink-0 lg:hidden" />
      <div className="flex flex-1 flex-col items-center justify-center min-h-0">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <VertialLogo size="lg" />
          </div>
          <p className="mb-3 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Configuración completada
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            {headingTitle}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
            {headingSubtitle}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const isCompleted = completedSteps.includes(step.id);
              const isCurrent = currentStep === index;

              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                    ${isCompleted 
                      ? 'bg-green-500' 
                      : isCurrent 
                      ? 'bg-amber-500' 
                      : 'bg-gray-200'
                    }
                  `}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : isCurrent ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">{step.id}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${
                      isCompleted 
                        ? 'text-green-700' 
                        : isCurrent 
                        ? 'text-gray-900 dark:text-gray-100' 
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {step.label}
                      {isCompleted && ' ✓'}
                      {isCurrent && '...'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {currentStep >= steps.length && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
              <p className="text-center font-medium text-green-800 dark:text-green-200">
                {t('onboarding.confirmation.redirect', { countdown })}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('onboarding.confirmation.wait')}
          </p>
        </div>
      </div>

      {currentStep >= steps.length ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 pb-[max(1rem,env(safe-area-inset-bottom))] lg:left-0 lg:right-[42%]">
          <ACCESO__Button
            variant="primary"
            size="lg"
            fullWidth
            icon="next"
            disabled={!saveReady}
            onClick={() => navigate('/saas/subscription', { replace: true })}
          >
            {saveReady ? t('onboarding.confirmation.goNow') : 'Guardando…'}
          </ACCESO__Button>
        </div>
      ) : null}
      </div>
      </div>

      <OnboardingHeroPanel visualKey="confirmation" className="border-l border-white/10" />
    </div>
  );
}