import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  Clock,
  Layers,
  MapPin,
  Monitor,
  Package,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { VertialLogo } from '../../components/VertialLogo';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { markNativeOnboardingSeen } from '../../lib/nativeOnboardingStorage';

interface SlideFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface Slide {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle: string;
  features: SlideFeature[];
}

const SLIDES: Slide[] = [
  {
    icon: Layers,
    eyebrow: 'Todo en 1',
    title: 'El sistema operativo de tu negocio',
    subtitle:
      'Stock, operaciones, clientes, TPV y finanzas en una sola plataforma. Sin caos, sin papeles perdidos, sin herramientas sueltas.',
    features: [
      { icon: BarChart3, title: 'Dashboard en vivo', desc: 'KPIs y actividad del día en tiempo real.' },
      { icon: Users, title: 'CRM unificado', desc: 'Clientes, historial y segmentación en un solo sitio.' },
      { icon: Package, title: 'Stock y operaciones', desc: 'Inventario y trazabilidad de punta a punta.' },
    ],
  },
  {
    icon: Building2,
    eyebrow: 'Estructura empresarial',
    title: 'Tu empresa, organizada de verdad',
    subtitle:
      'Multi-sede, grupos de empresas y permisos granulares por rol. Vertial se adapta a cómo funciona tu negocio, no al revés.',
    features: [
      { icon: MapPin, title: 'Multi-sede', desc: 'Varias tiendas o locales bajo una misma cuenta.' },
      { icon: Layers, title: 'Grupos de empresas', desc: 'Gestiona varios negocios desde un panel.' },
      { icon: Shield, title: 'Permisos por rol', desc: 'Cada persona ve solo lo que le corresponde.' },
    ],
  },
  {
    icon: Users,
    eyebrow: 'Trabajadores',
    title: 'Tu equipo, conectado y al día',
    subtitle:
      'Fichajes, tareas, turnos y TPV en tablet. Cada trabajador entra con su acceso y opera solo los módulos asignados.',
    features: [
      { icon: Clock, title: 'Fichajes y turnos', desc: 'Control horario, horarios y vacaciones.' },
      { icon: Monitor, title: 'TPV en tablet', desc: 'Caja y comandas listas para el mostrador.' },
      { icon: Check, title: 'Tareas y actividad', desc: 'El día a día del equipo, organizado.' },
    ],
  },
  {
    icon: Shield,
    eyebrow: 'Multi-vertical y seguro',
    title: 'Una plataforma, muchas operativas',
    subtitle:
      'Compraventa, restauración, delivery, taller y más. Datos cifrados, alojados en Europa y con alertas configurables. 30 días gratis, sin tarjeta.',
    features: [
      { icon: Layers, title: 'Verticales especializadas', desc: 'La operativa exacta de tu sector.' },
      { icon: Bell, title: 'Centro de alertas', desc: 'Push, email e in-app configurables por rol.' },
      { icon: Shield, title: 'RGPD y Europa', desc: 'Cifrado, backups diarios y datos en Europa.' },
    ],
  },
];

const SWIPE_THRESHOLD_PX = 50;

export function NativeOnboarding() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isLast = index === SLIDES.length - 1;

  const finish = useCallback(
    (destination: string) => {
      markNativeOnboardingSeen();
      navigate(destination);
    },
    [navigate],
  );

  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta < -SWIPE_THRESHOLD_PX) goTo(index + 1);
    else if (delta > SWIPE_THRESHOLD_PX) goTo(index - 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Glow de fondo estilo landing */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[130%] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #10b981, transparent)' }}
      />

      {/* Header: logo + saltar */}
      <div className="relative flex items-center justify-between px-6 pt-4">
        <VertialLogo size="md" className="brightness-0 invert" />
        {!isLast && (
          <button
            type="button"
            onClick={() => finish(AUTH_PATHS.entry)}
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors px-2 py-1"
          >
            Saltar
          </button>
        )}
      </div>

      {/* Carrusel */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((slide) => {
            const SlideIcon = slide.icon;
            return (
              <div
                key={slide.eyebrow}
                className="flex h-full w-full shrink-0 flex-col justify-center px-7 py-4 overflow-y-auto"
              >
                <div className="mx-auto w-full max-w-md">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                    <SlideIcon className="h-8 w-8 text-emerald-400" />
                  </div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    {slide.eyebrow}
                  </p>
                  <h1 className="mb-3 text-3xl font-extrabold leading-tight tracking-tight">
                    {slide.title}
                  </h1>
                  <p className="mb-7 text-base leading-relaxed text-zinc-400">{slide.subtitle}</p>

                  <div className="space-y-3">
                    {slide.features.map((feature) => {
                      const FeatureIcon = feature.icon;
                      return (
                        <div
                          key={feature.title}
                          className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5"
                        >
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                            <FeatureIcon className="h-4.5 w-4.5 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{feature.title}</p>
                            <p className="text-sm leading-snug text-zinc-400">{feature.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: dots + CTA */}
      <div className="relative px-7 pb-6 pt-2">
        <div className="mb-5 flex items-center justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.eyebrow}
              type="button"
              aria-label={`Ir a la página ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? 'w-7 bg-emerald-400' : 'w-2 bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <div className="mx-auto w-full max-w-md space-y-3">
            <button
              type="button"
              onClick={() =>
                finish(AUTH_PATHS.register)
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Crear mi cuenta gratis
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => finish(AUTH_PATHS.entry)}
              className="w-full rounded-xl border border-zinc-700 px-6 py-3.5 text-base font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
            >
              Ya tengo cuenta
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-md">
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Siguiente
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
