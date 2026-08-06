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
    <div className="h-dvh max-h-dvh min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="z-20 shrink-0 border-b border-gray-200/80 bg-white/95 px-3 pb-2 pt-2 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:px-6 sm:pb-2.5 sm:pt-3 [@media(max-height:700px)]:pb-1.5 [@media(max-height:700px)]:pt-1.5">
          <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-2 sm:gap-3 [@media(max-height:700px)]:gap-1.5`}>
            <div className="flex items-center justify-between gap-3">
              <VertialLogo size="md" />
              <span className="hidden text-xs font-medium text-gray-500 dark:text-gray-400 sm:inline">
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

        {/* En pantallas bajas (portátil) ocultamos el hero móvil para no comer altura. */}
        <AccesoCompactHero
          visualKey={visualKey}
          className="mx-3 mt-2 shrink-0 sm:mx-6 lg:hidden [@media(max-height:760px)]:hidden"
        />

        {/* Scroll único del cuerpo: se adapta a portátil y a monitor grande. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scrollbar-visible touch-pan-y px-3 py-2 sm:px-6 sm:py-3 [-webkit-overflow-scrolling:touch] [@media(min-height:900px)]:py-5">
          <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-2 sm:gap-3 [@media(min-height:900px)]:gap-4`}>
            {children}
          </div>
        </main>

        <footer className="z-20 shrink-0 border-t border-gray-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:px-6 sm:py-3.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] [@media(max-height:700px)]:py-2">
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
    <div className={`shrink-0 ${compact ? 'mb-1 sm:mb-2' : 'mb-2 sm:mb-4'} [@media(max-height:700px)]:mb-1`}>
      {stepLabel ? (
        <p className="mb-1 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 sm:mb-1.5 sm:px-2.5 sm:text-[11px]">
          {stepLabel}
        </p>
      ) : null}
      <h1
        className={`font-bold leading-tight text-gray-900 dark:text-gray-100 ${
          compact
            ? 'text-base sm:text-xl [@media(min-height:900px)]:text-2xl'
            : 'text-lg sm:text-2xl [@media(min-height:900px)]:text-[1.75rem]'
        }`}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={`text-gray-600 dark:text-gray-400 leading-snug ${
            compact
              ? 'mt-0.5 text-xs sm:mt-1 sm:text-sm'
              : 'mt-1 text-xs leading-relaxed sm:mt-1.5 sm:text-sm'
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
