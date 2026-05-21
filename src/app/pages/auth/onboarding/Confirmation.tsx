import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, Calendar, CreditCard, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import { useAuth } from '../../../context/AuthContext';

const stepKeys = [
  { id: 1, key: 'workspace', duration: 1000 },
  { id: 2, key: 'plan', duration: 1000 },
  { id: 3, key: 'trial', duration: 1000 },
  { id: 4, key: 'payment', duration: 800 },
  { id: 5, key: 'dashboard', duration: 800 },
] as const;

export function Confirmation() {
  const navigate = useNavigate();
  const { data } = useOnboarding();
  const { updateOnboardingData } = useAuth();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [countdown, setCountdown] = useState(10);
  const completionStarted = useRef(false);

  useEffect(() => {
    if (data.completedStep < 5) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);

  const steps = stepKeys.map(s => ({
    ...s,
    label: t(`onboarding.confirmation.steps.${s.key}`),
  }));

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

    const countdownTimer = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          window.clearInterval(countdownTimer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    void updateOnboardingData(data as unknown as Record<string, unknown>).catch((error) => {
      console.error('Error saving onboarding:', error);
    });

    const goToSaas = () => {
      navigate('/saas/dashboard', { replace: true });
    };

    const finalTimer = window.setTimeout(goToSaas, 10000);

    return () => {
      window.clearTimeout(finalTimer);
      window.clearInterval(countdownTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-800 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t('onboarding.confirmation.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('onboarding.confirmation.subtitle')}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8">
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
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
              <p className="text-center text-green-800 font-medium">
                {t('onboarding.confirmation.redirect', { countdown })}
              </p>
              <div className="flex justify-center">
                <ACCESO__Button
                  variant="primary"
                  onClick={() => navigate('/saas/dashboard', { replace: true })}
                >
                  {t('onboarding.confirmation.goNow')}
                </ACCESO__Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('onboarding.confirmation.wait')}
          </p>
        </div>
      </div>
    </div>
  );
}