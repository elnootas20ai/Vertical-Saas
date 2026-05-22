import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ACCESO__Stepper } from '../../design-system/ACCESO__Stepper';
import { ONBOARDING_ROUTES, ONBOARDING_STEPS } from '../../../context/OnboardingContext';

type Props = {
  stepIndex: number;
  maxWidth?: string;
  children: ReactNode;
  footer: ReactNode;
};

/** Pantalla completa sin scroll: cabecera (stepper) + contenido flexible + pie fijos. */
export function OnboardingStepShell({
  stepIndex,
  maxWidth = 'max-w-3xl',
  children,
  footer,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="h-dvh max-h-dvh min-h-0 bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      <header className="shrink-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 pt-3 pb-2">
        <div className={`w-full ${maxWidth} mx-auto`}>
          <ACCESO__Stepper
            steps={[...ONBOARDING_STEPS]}
            currentStep={stepIndex}
            compact
            onStepClick={(i) => {
              if (i !== stepIndex) navigate(ONBOARDING_ROUTES[i]);
            }}
          />
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 sm:px-6 py-3">
        <div className={`w-full ${maxWidth} mx-auto flex-1 min-h-0 flex flex-col overflow-hidden`}>
          {children}
        </div>
      </main>

      <footer className="shrink-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3">
        <div className={`w-full ${maxWidth} mx-auto`}>{footer}</div>
      </footer>
    </div>
  );
}

export function OnboardingStepHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="shrink-0 mb-3">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{title}</h1>
      {subtitle ? (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-snug">{subtitle}</p>
      ) : null}
    </div>
  );
}
