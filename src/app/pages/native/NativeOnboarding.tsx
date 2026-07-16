import { useCallback, useEffect, useRef, useState } from 'react';
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
  Printer,
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
    title: 'Más tiempo, menos tareas, más control',
    subtitle:
      'Elimina el trabajo manual y céntrate en lo que realmente importa.',
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
  {
    icon: Printer,
    eyebrow: 'Impresora WiFi',
    title: 'Imprime tickets como en Revo',
    subtitle:
      'Configura la impresora con la IP del ticket SELF-TEST. Activa «Red local» en Ajustes del iPhone/iPad → Vertial.',
    features: [
      { icon: Printer, title: 'IP fija', desc: 'Escribe la IP de la impresora térmica (HPRT, Epson…).' },
      { icon: Monitor, title: 'TPV en tablet', desc: 'Tickets de pedidos y cierre desde el mostrador.' },
      { icon: Check, title: 'Sin cables', desc: 'Solo WiFi del local; sin PC obligatorio en iPhone/iPad.' },
    ],
  },
];

const SWIPE_THRESHOLD_PX = 48;
const DRAG_LOCK_PX = 10;

export function NativeOnboarding() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const dragLocked = useRef(false);
  const dragXRef = useRef(0);
  const indexRef = useRef(index);
  const isLast = index === SLIDES.length - 1;

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const finish = useCallback(
    (destination: string) => {
      markNativeOnboardingSeen();
      navigate(destination);
    },
    [navigate],
  );

  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
  }, []);

  const applyEdgeResistance = useCallback((delta: number, currentIndex: number) => {
    if (
      (currentIndex === 0 && delta > 0) ||
      (currentIndex === SLIDES.length - 1 && delta < 0)
    ) {
      return delta * 0.28;
    }
    return delta;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      dragLocked.current = false;
      dragXRef.current = 0;
      setIsSnapping(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      if (!dragLocked.current) {
        if (Math.abs(dx) < DRAG_LOCK_PX && Math.abs(dy) < DRAG_LOCK_PX) return;
        if (Math.abs(dy) > Math.abs(dx)) return;
        dragLocked.current = true;
      }

      e.preventDefault();
      const offset = applyEdgeResistance(dx, indexRef.current);
      dragXRef.current = offset;
      setDragX(offset);
    };

    const onTouchEnd = () => {
      if (!dragLocked.current) return;

      const delta = dragXRef.current;
      dragLocked.current = false;
      dragXRef.current = 0;
      setDragX(0);
      setIsSnapping(true);

      if (delta < -SWIPE_THRESHOLD_PX) goTo(indexRef.current + 1);
      else if (delta > SWIPE_THRESHOLD_PX) goTo(indexRef.current - 1);
    };

    track.addEventListener('touchstart', onTouchStart, { passive: true });
    track.addEventListener('touchmove', onTouchMove, { passive: false });
    track.addEventListener('touchend', onTouchEnd, { passive: true });
    track.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      track.removeEventListener('touchstart', onTouchStart);
      track.removeEventListener('touchmove', onTouchMove);
      track.removeEventListener('touchend', onTouchEnd);
      track.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyEdgeResistance, goTo]);

  const trackTransform = `translate3d(calc(-${index * 100}% + ${dragX}px), 0, 0)`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-zinc-950 text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 55% at 50% -5%, rgba(16,185,129,0.22), transparent 70%), radial-gradient(ellipse 60% 40% at 85% 100%, rgba(16,185,129,0.08), transparent 65%)',
        }}
      />

      <div className="relative flex items-center justify-between px-6 pt-4">
        <VertialLogo size="md" className="brightness-0 invert" />
        {!isLast && (
          <button
            type="button"
            onClick={() => finish(AUTH_PATHS.entry)}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            Saltar
          </button>
        )}
      </div>

      <div
        ref={trackRef}
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            transform: trackTransform,
            transition: dragX !== 0 || !isSnapping ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {SLIDES.map((slide) => {
            const SlideIcon = slide.icon;
            return (
              <div
                key={slide.eyebrow}
                className="flex h-full w-full shrink-0 flex-col justify-center overflow-y-auto overscroll-contain px-6 py-3"
              >
                <div className="mx-auto w-full max-w-md">
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 ring-1 ring-emerald-400/25">
                    <SlideIcon className="h-7 w-7 text-emerald-400" />
                  </div>

                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                    {slide.eyebrow}
                  </p>
                  <h1 className="mb-3 text-[1.65rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl">
                    {slide.title}
                  </h1>
                  <p className="mb-6 text-[15px] leading-relaxed text-zinc-400">{slide.subtitle}</p>

                  <div className="overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10 backdrop-blur-sm">
                    {slide.features.map((feature, featureIndex) => {
                      const FeatureIcon = feature.icon;
                      const isLastFeature = featureIndex === slide.features.length - 1;
                      return (
                        <div
                          key={feature.title}
                          className={`flex items-start gap-3.5 px-4 py-3.5 ${isLastFeature ? '' : 'border-b border-white/[0.06]'}`}
                        >
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                            <FeatureIcon className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0 pt-0.5">
                            <p className="text-sm font-semibold text-zinc-100">{feature.title}</p>
                            <p className="mt-0.5 text-sm leading-snug text-zinc-400">{feature.desc}</p>
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

      <div className="relative px-6 pb-6 pt-2">
        <div className="mb-5 flex items-center justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.eyebrow}
              type="button"
              aria-label={`Ir a la página ${i + 1}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => {
                setDragX(0);
                setIsSnapping(true);
                goTo(i);
              }}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? 'w-6 bg-emerald-400' : 'w-1.5 bg-zinc-600'
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <div className="mx-auto w-full max-w-md space-y-2.5">
            <button
              type="button"
              onClick={() => finish(AUTH_PATHS.register)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition-colors active:bg-emerald-400"
            >
              Crear mi cuenta gratis
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => finish(AUTH_PATHS.entry)}
              className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-900/40 px-6 py-3.5 text-base font-medium text-zinc-200 transition-colors active:bg-zinc-800/80"
            >
              Ya tengo cuenta
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-md">
            <button
              type="button"
              onClick={() => {
                setIsSnapping(true);
                goTo(index + 1);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition-colors active:bg-emerald-400"
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
