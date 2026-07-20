import { VertialLogo } from '../VertialLogo';
import {
  ONBOARDING_VISUALS,
  getOnboardingHeroBackground,
  type OnboardingVisualKey,
} from '../../lib/onboardingVisuals';

/** Banda visual en móvil/tablet cuando el panel lateral solo aparece desde lg. */
export function AccesoCompactHero({
  visualKey,
  className = '',
}: {
  visualKey: OnboardingVisualKey;
  className?: string;
}) {
  const content = ONBOARDING_VISUALS[visualKey];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-gray-700/80 ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: getOnboardingHeroBackground(content) }}
      />
      <div className="absolute inset-0 bg-[#0f1419]/75" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 20%, rgba(96,165,250,0.45) 0%, transparent 45%), radial-gradient(circle at 10% 90%, rgba(52,211,153,0.35) 0%, transparent 40%)',
        }}
      />

      <div className="relative z-10 flex items-start gap-2.5 p-2.5 sm:gap-4 sm:p-4">
        <VertialLogo size="sm" className="shrink-0 [&_img]:brightness-0 [&_img]:invert mt-0.5 sm:hidden" />
        <VertialLogo size="lg" className="shrink-0 [&_img]:brightness-0 [&_img]:invert mt-0.5 hidden sm:block" />
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-blue-100">
            {content.badge}
          </span>
          <h2 className="mt-1 text-base sm:text-xl font-bold leading-tight text-white">{content.title}</h2>
          <p className="mt-0.5 text-[11px] sm:text-sm text-blue-100/85 leading-snug line-clamp-1 sm:line-clamp-2">
            {content.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
