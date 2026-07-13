import type { ReactNode } from 'react';
import { OnboardingHeroPanel } from './onboarding/OnboardingHeroPanel';
import { AccesoCompactHero } from './AccesoCompactHero';
import type { OnboardingVisualKey } from '../../lib/onboardingVisuals';

type Props = {
  children: ReactNode;
  visualKey: OnboardingVisualKey;
  /** Scroll interno en móvil y panel izquierdo en desktop */
  scrollable?: boolean;
  /** Banda compacta arriba en tablet (sin panel lateral) */
  showCompactHero?: boolean;
};

/** Layout de acceso/registro: formulario + panel visual Vertial (split desde lg / ~1024px). */
export function AccesoSplitLayout({
  children,
  visualKey,
  scrollable = true,
  showCompactHero = true,
}: Props) {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 lg:grid lg:h-dvh lg:max-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] lg:overflow-hidden">
      <div
        className={
          scrollable
            ? 'flex min-h-dvh flex-col touch-pan-y lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:scrollbar-visible [-webkit-overflow-scrolling:touch]'
            : 'flex min-h-dvh flex-col lg:min-h-0 lg:overflow-hidden'
        }
      >
        {showCompactHero ? (
          <AccesoCompactHero visualKey={visualKey} className="mx-4 mt-4 shrink-0 sm:mx-6 sm:mt-6 lg:hidden" />
        ) : null}
        {children}
      </div>
      <OnboardingHeroPanel visualKey={visualKey} />
    </div>
  );
}
