import { Check } from 'lucide-react';
import { VertialLogo } from '../../VertialLogo';
import {
  ONBOARDING_VISUALS,
  getOnboardingHeroBackground,
  type OnboardingVisual,
  type OnboardingVisualKey,
  getOnboardingVisualForStep,
} from '../../../lib/onboardingVisuals';

type Props = {
  visualKey?: OnboardingVisualKey;
  stepIndex?: number;
  visual?: Partial<OnboardingVisual>;
  className?: string;
};

const GLOW_BY_THEME: Record<string, { primary: string; secondary: string }> = {
  vertial: { primary: 'bg-blue-500/25', secondary: 'bg-emerald-500/15' },
  indigo: { primary: 'bg-indigo-500/30', secondary: 'bg-blue-500/20' },
  ocean: { primary: 'bg-blue-500/25', secondary: 'bg-cyan-500/20' },
  teal: { primary: 'bg-teal-500/25', secondary: 'bg-blue-500/20' },
  amber: { primary: 'bg-amber-500/20', secondary: 'bg-blue-500/20' },
  violet: { primary: 'bg-violet-500/25', secondary: 'bg-indigo-500/20' },
  emerald: { primary: 'bg-emerald-500/25', secondary: 'bg-teal-500/20' },
};

export function OnboardingHeroPanel({ visualKey, stepIndex, visual: visualOverride, className = '' }: Props) {
  const base =
    visualKey != null
      ? ONBOARDING_VISUALS[visualKey]
      : stepIndex != null
        ? getOnboardingVisualForStep(stepIndex)
        : ONBOARDING_VISUALS.entry;

  const content: OnboardingVisual = {
    ...base,
    ...visualOverride,
    gradientTheme: visualOverride?.gradientTheme ?? base.gradientTheme,
    highlights: visualOverride?.highlights ?? base.highlights,
  };

  const glow = GLOW_BY_THEME[content.gradientTheme] ?? GLOW_BY_THEME.vertial;

  return (
    <aside
      className={`relative hidden 2xl:flex flex-col overflow-hidden bg-[#0f1419] ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: getOnboardingHeroBackground(content) }}
      />

      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className={`absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl pointer-events-none ${glow.primary}`} />
      <div className={`absolute top-1/3 -left-16 h-64 w-64 rounded-full blur-3xl pointer-events-none ${glow.secondary}`} />
      <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      {!content.image ? (
        <div
          className="absolute inset-0 opacity-35 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 70% 18%, rgba(96,165,250,0.4) 0%, transparent 42%), radial-gradient(circle at 18% 82%, rgba(52,211,153,0.28) 0%, transparent 38%)',
          }}
        />
      ) : null}

      <div className="relative z-10 flex flex-1 flex-col justify-between p-8 xl:p-10">
        <div>
          <VertialLogo size="lg" className="[&_img]:brightness-0 [&_img]:invert mb-8" />
          <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100 backdrop-blur-sm">
            {content.badge}
          </div>
          <h2 className="mt-5 text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight text-white">
            {content.title}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-blue-100/90">{content.subtitle}</p>
        </div>

        <ul className="mt-8 space-y-3">
          {content.highlights.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm text-white/90">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/40">
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              </span>
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs text-white/40">© Vertial · Plataforma multi-vertical</p>
      </div>
    </aside>
  );
}
