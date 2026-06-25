import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ACCESO__Stepper } from '../../design-system/ACCESO__Stepper';
import { VertialLogo } from '../../VertialLogo';
import { OnboardingHeroPanel } from './OnboardingHeroPanel';
import { ONBOARDING_ROUTES, ONBOARDING_STEPS } from '../../../context/OnboardingContext';

type Props = {
  stepIndex: number;
  maxWidth?: string;
  children: ReactNode;
  footer: ReactNode;
};

/** Pantalla completa: panel formulario + hero Vertial (desktop). */
export function OnboardingStepShell({
  stepIndex,
  maxWidth = 'max-w-3xl',
  children,
  footer,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="h-dvh max-h-dvh min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,38%)] overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="flex min-h-0 flex-col overflow-hidden">
        <header className="shrink-0 z-20 border-b border-gray-200/80 bg-white/95 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 px-4 sm:px-6 pt-3 pb-2.5">
          <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-3`}>
            <div className="flex items-center justify-between gap-3">
              <VertialLogo size="md" />
              <span className="hidden sm:inline text-xs font-medium text-gray-500 dark:text-gray-400">
                Configuración de empresa
              </span>
            </div>
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

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-4">
          <div className={`mx-auto flex w-full ${maxWidth} min-h-0 flex-1 flex-col gap-3 overflow-hidden`}>
            {children}
          </div>
        </main>

        <footer className="shrink-0 z-20 border-t border-gray-200/80 bg-white/95 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 px-4 sm:px-6 py-3.5">
          <div className={`mx-auto w-full ${maxWidth}`}>{footer}</div>
        </footer>
      </div>

      <OnboardingHeroPanel stepIndex={stepIndex} className="border-l border-white/10" />
    </div>
  );
}

export function OnboardingStepHeading({
  title,
  subtitle,
  stepLabel,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  stepLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={`shrink-0 ${compact ? 'mb-2' : 'mb-4'}`}>
      {stepLabel ? (
        <p className="mb-1.5 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          {stepLabel}
        </p>
      ) : null}
      <h1
        className={`font-bold leading-tight text-gray-900 dark:text-gray-100 ${
          compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
        }`}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={`text-gray-600 dark:text-gray-400 leading-snug ${
            compact ? 'mt-1 text-xs sm:text-sm' : 'mt-1.5 text-sm leading-relaxed'
          }`}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function OnboardingContentCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
