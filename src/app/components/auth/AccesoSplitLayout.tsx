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
    <div className="min-h-dvh 2xl:h-dvh 2xl:max-h-dvh grid 2xl:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] bg-gray-50 dark:bg-gray-900">
      <div
        className={`flex flex-col min-h-0 ${
          scrollable ? 'overflow-y-auto overscroll-contain scrollbar-visible' : 'overflow-hidden'
        }`}
      >
        {showCompactHero ? (
          <AccesoCompactHero visualKey={visualKey} className="mx-4 mt-4 sm:mx-6 sm:mt-6 2xl:hidden" />
        ) : null}
        {children}
      </div>
      <OnboardingHeroPanel visualKey={visualKey} />
    </div>
  );
}
