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

/** Layout de acceso/registro: formulario + panel visual Vertial (solo pantallas muy anchas). */
export function AccesoSplitLayout({
  children,
  visualKey,
  scrollable = true,
  showCompactHero = true,
}: Props) {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 2xl:grid 2xl:h-dvh 2xl:max-h-dvh 2xl:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] 2xl:overflow-hidden">
      <div
        className={
          scrollable
            ? 'flex min-h-dvh flex-col touch-pan-y 2xl:min-h-0 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:scrollbar-visible [-webkit-overflow-scrolling:touch]'
            : 'flex min-h-dvh flex-col 2xl:min-h-0 2xl:overflow-hidden'
        }
      >
        {showCompactHero ? (
          <AccesoCompactHero visualKey={visualKey} className="mx-4 mt-4 shrink-0 sm:mx-6 sm:mt-6 2xl:hidden" />
        ) : null}
        {children}
      </div>
      <OnboardingHeroPanel visualKey={visualKey} />
    </div>
  );
}
