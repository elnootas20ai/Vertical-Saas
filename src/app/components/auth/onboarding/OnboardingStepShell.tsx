import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ACCESO__Stepper } from '../../design-system/ACCESO__Stepper';
import { VertialLogo } from '../../VertialLogo';
import { AccesoCompactHero } from '../AccesoCompactHero';
import { OnboardingHeroPanel } from './OnboardingHeroPanel';
import { ONBOARDING_ROUTES, ONBOARDING_STEPS } from '../../../context/OnboardingContext';
import { getOnboardingVisualKeyForStep } from '../../../lib/onboardingVisuals';

type Props = {
  stepIndex: number;
  maxWidth?: string;
  children: ReactNode;
  footer: ReactNode;
};

/** Pantalla completa: formulario centrado + hero lateral desde lg (~1024px). */
export function OnboardingStepShell({
  stepIndex,
  maxWidth = 'max-w-3xl',
  children,
  footer,
}: Props) {
  const navigate = useNavigate();
  const visualKey = getOnboardingVisualKeyForStep(stepIndex);

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 lg:grid lg:h-dvh lg:max-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] lg:overflow-hidden">
      <div className="flex flex-col lg:min-h-0 lg:overflow-hidden">
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

        <AccesoCompactHero
          visualKey={visualKey}
          className="mx-4 mt-3 shrink-0 sm:mx-6 lg:hidden"
        />

        <main className="flex flex-col px-4 py-3 sm:px-6 sm:py-4 touch-pan-y lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-3 lg:min-h-0 lg:flex-1`}>
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
