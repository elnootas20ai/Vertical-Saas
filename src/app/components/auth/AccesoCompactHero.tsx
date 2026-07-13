import { Check } from 'lucide-react';
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

      <div className="relative z-10 flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-5 md:flex-row md:items-center md:justify-between md:gap-6 lg:gap-8">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <VertialLogo size="md" className="shrink-0 [&_img]:brightness-0 [&_img]:invert mt-0.5 sm:hidden" />
          <VertialLogo size="lg" className="shrink-0 [&_img]:brightness-0 [&_img]:invert mt-0.5 hidden sm:block" />
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-100">
              {content.badge}
            </span>
            <h2 className="mt-1.5 sm:mt-2 text-base sm:text-xl md:text-2xl font-bold leading-tight text-white">{content.title}</h2>
            <p className="mt-1 text-xs sm:text-sm text-blue-100/85 leading-snug max-w-xl line-clamp-2 md:line-clamp-none">{content.subtitle}</p>
          </div>
        </div>

        <ul className="hidden sm:flex flex-wrap gap-x-3 gap-y-1.5 sm:gap-x-4 sm:gap-y-2 md:justify-end shrink-0 sm:pl-0">
          {content.highlights.map((item) => (
            <li key={item} className="flex items-center gap-1.5 text-xs sm:text-sm text-white/90">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 ring-1 ring-emerald-400/35">
                <Check className="h-3 w-3 text-emerald-300" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
