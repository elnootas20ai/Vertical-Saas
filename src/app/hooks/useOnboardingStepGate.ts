import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useOnboarding, ONBOARDING_ROUTES } from '../../context/OnboardingContext';

/**
 * Evita saltos al paso 1 mientras carga el progreso (local/servidor).
 * Si el usuario intenta abrir un paso demasiado adelantado, lo manda al siguiente pendiente.
 */
export function useOnboardingStepGate(stepIndex: number) {
  const navigate = useNavigate();
  const { data, isProgressReady } = useOnboarding();

  useEffect(() => {
    if (!isProgressReady) return;
    if (data.completedStep < stepIndex - 1) {
      const next = Math.max(0, Math.min(data.completedStep + 1, ONBOARDING_ROUTES.length - 1));
      navigate(ONBOARDING_ROUTES[next], { replace: true });
    }
  }, [isProgressReady, data.completedStep, stepIndex, navigate]);

  return { isProgressReady, completedStep: data.completedStep };
}
