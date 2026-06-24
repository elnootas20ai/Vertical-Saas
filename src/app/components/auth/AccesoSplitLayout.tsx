import type { ReactNode } from 'react';
import { OnboardingHeroPanel } from './onboarding/OnboardingHeroPanel';
import type { OnboardingVisualKey } from '../../lib/onboardingVisuals';

type Props = {
  children: ReactNode;
  visualKey: OnboardingVisualKey;
  /** Scroll interno en móvil y panel izquierdo en desktop */
  scrollable?: boolean;
};

/** Layout de acceso/registro: formulario + panel visual Vertial (desktop). */
export function AccesoSplitLayout({ children, visualKey, scrollable = true }: Props) {
  return (
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] bg-gray-50 dark:bg-gray-900">
      <div
        className={`flex flex-col min-h-0 ${
          scrollable ? 'overflow-y-auto overscroll-contain scrollbar-visible' : 'overflow-hidden'
        }`}
      >
        {children}
      </div>
      <OnboardingHeroPanel visualKey={visualKey} />
    </div>
  );
}
