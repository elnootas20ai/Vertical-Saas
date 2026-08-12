/**
 * Presentación comercial Vertial — lenguaje simple, una idea por diapositiva.
 * Abrir: /presentacion · Flechas / clic / puntos · F = pantalla completa
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  ChefHat,
  Maximize2,
  MonitorSmartphone,
  Pizza,
  Store,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { VertialLogo } from '../components/VertialLogo';

type Slide = {
  id: string;
  eyebrow?: string;
  title: string;
  line: string;
  bullets?: string[];
  footer?: string;
  icon?: ReactNode;
  tone?: 'hero' | 'dark' | 'light';
};

const SLIDES: Slide[] = [
  {
    id: 'hero',
    tone: 'hero',
    title: 'Vertial',
    line: 'El mando a distancia de tu negocio.',
    footer: 'Presentación · 2 minutos · sin tecnicismos',
  },
  {
    id: 'problem',
    tone: 'dark',
    eyebrow: 'El lío de siempre',
    title: 'Hoy todo está partido',
    line: 'WhatsApp por un lado. Excel por otro. La app de Glovo aparte. La caja “a ojo”.',
    bullets: [
      'Nadie sabe qué pasa en la otra tienda',
      'Al final del día: números que no cuadran',
      'El dueño vive pegado al teléfono',
    ],
    icon: <Store className="h-8 w-8" />,
  },
  {
    id: 'solution',
    tone: 'light',
    eyebrow: 'La idea',
    title: 'Una sola app para todo',
    line: 'Pedidos, cocina, reparto, caja, equipo y números — en el mismo sitio.',
    bullets: [
      'Lo ves en el móvil o en la tablet del local',
      'El trabajador hace lo suyo; tú ves el conjunto',
      'Menos gritos. Más control.',
    ],
    icon: <MonitorSmartphone className="h-8 w-8" />,
  },
  {
    id: 'who',
    tone: 'dark',
    eyebrow: '¿Para quién?',
    title: 'Negocios de verdad',
    line: 'No es una app genérica. Es un sistema por tipo de negocio.',
    bullets: [
      'Delivery / pizzerías / dark kitchens',
      'Restaurantes con sala y cocina',
      'Compraventa de coches',
      'Y más verticales (carnicería, heladería…)',
    ],
    icon: <Building2 className="h-8 w-8" />,
  },
  {
    id: 'delivery',
    tone: 'light',
    eyebrow: 'Delivery',
    title: 'Del pedido al repartidor',
    line: 'Entras el pedido → cocina lo ve → montaje → sale a calle.',
    bullets: [
      'TPV en tablet: cobrar e imprimir',
      'Cocina y montaje en pantallas claras',
      'Varias tiendas, varias marcas, un solo mando',
    ],
    icon: <Pizza className="h-8 w-8" />,
  },
  {
    id: 'ops',
    tone: 'dark',
    eyebrow: 'Centro Operativo',
    title: 'Como ver el partido en directo',
    line: 'Nuevos, cocina, montaje, reparto, incidencias — al segundo.',
    bullets: [
      'Una tienda o todas a la vez',
      'Avisos cuando algo se atasca',
      'El dueño no necesita estar en el local',
    ],
    icon: <Truck className="h-8 w-8" />,
  },
  {
    id: 'caja',
    tone: 'light',
    eyebrow: 'Dinero del día',
    title: 'Caja que se entiende',
    line: 'Abres con un fondo. Cobras. Cierras. Y tiene que cuadrar.',
    bullets: [
      'Efectivo, tarjeta, plataformas',
      'Entradas y salidas de dinero con motivo',
      'Historial claro por día y por tienda',
    ],
    icon: <Wallet className="h-8 w-8" />,
  },
  {
    id: 'restaurant',
    tone: 'dark',
    eyebrow: 'Restaurante',
    title: 'Sala + cocina, mismo idioma',
    line: 'Mesas, pedidos, cocina y caja — sin papeles volando.',
    bullets: [
      'El camarero apunta; la cocina cocina',
      'Menos errores entre sala y fogones',
      'Misma lógica Vertial que en delivery',
    ],
    icon: <ChefHat className="h-8 w-8" />,
  },
  {
    id: 'cars',
    tone: 'light',
    eyebrow: 'Compraventa',
    title: 'Coches de punta a punta',
    line: 'Desde que llega el vehículo hasta que se vende y se factura.',
    bullets: [
      'Stock, documentación, gestoría',
      'Equipo y comisiones',
      'Un centro operativo del concesionario',
    ],
    icon: <Car className="h-8 w-8" />,
  },
  {
    id: 'team',
    tone: 'dark',
    eyebrow: 'Personas',
    title: 'Cada uno ve lo suyo',
    line: 'El dueño ve el negocio. El trabajador ve su puesto.',
    bullets: [
      'Permisos por rol (TPV, cocina, caja…)',
      'Fichajes y equipo',
      'Sin dar la llave de todo a todo el mundo',
    ],
    icon: <Users className="h-8 w-8" />,
  },
  {
    id: 'how',
    tone: 'light',
    eyebrow: 'Cómo se empieza',
    title: 'Tres pasos. Ya.',
    line: '1) Te das de alta · 2) Configuras tu local · 3) Empiezas a vender.',
    bullets: [
      'Sin instalar programas raros',
      'Funciona en navegador y en tablet',
      'Te acompañamos al arrancar',
    ],
  },
  {
    id: 'close',
    tone: 'hero',
    title: 'Menos caos. Más control.',
    line: 'Eso es Vertial.',
    footer: '¿Preguntas? · vertialapp.com',
  },
];

export function VertialPitchDeck() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const total = SLIDES.length;

  const go = useCallback(
    (next: number) => {
      setI(Math.max(0, Math.min(total - 1, next)));
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        go(i + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(i - 1);
      } else if (e.key === 'Home') {
        go(0);
      } else if (e.key === 'End') {
        go(total - 1);
      } else if (e.key === 'Escape') {
        navigate('/demos');
      } else if (e.key === 'f' || e.key === 'F') {
        const el = document.documentElement;
        if (!document.fullscreenElement) void el.requestFullscreen?.();
        else void document.exitFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, i, navigate, total]);

  const tone = slide.tone || 'dark';
  const isHero = tone === 'hero';
  const isLight = tone === 'light';

  return (
    <div
      className={`relative flex min-h-[100dvh] flex-col overflow-hidden select-none ${
        isLight ? 'bg-[#f5f7fb] text-[#0b1220]' : 'bg-[#0b1220] text-white'
      }`}
      onClick={(e) => {
        const w = window.innerWidth;
        if ((e.target as HTMLElement).closest('[data-nav]')) return;
        if (e.clientX > w * 0.55) go(i + 1);
        else if (e.clientX < w * 0.45) go(i - 1);
      }}
    >
      {/* Marca sutil */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
        style={{
          background: 'linear-gradient(90deg, #22c55e, #14b8a6, #2563eb)',
        }}
      />

      <header
        data-nav
        className={`relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-8 ${
          isLight ? 'text-slate-500' : 'text-white/50'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <VertialLogo size="lg" />
          <span className="hidden text-xs font-semibold tracking-wide sm:inline">Presentación</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-nav
            title="Pantalla completa (F)"
            onClick={() => {
              const el = document.documentElement;
              if (!document.fullscreenElement) void el.requestFullscreen?.();
              else void document.exitFullscreen?.();
            }}
            className={`rounded-xl p-2 transition-colors ${
              isLight ? 'hover:bg-slate-200/80' : 'hover:bg-white/10'
            }`}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-nav
            title="Salir (Esc)"
            onClick={() => navigate('/demos')}
            className={`rounded-xl p-2 transition-colors ${
              isLight ? 'hover:bg-slate-200/80' : 'hover:bg-white/10'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col justify-center px-5 pb-24 pt-4 sm:px-12 lg:px-20">
        <div
          key={slide.id}
          className="mx-auto w-full max-w-4xl animate-[fadeSlide_280ms_ease-out]"
        >
          {slide.eyebrow ? (
            <p
              className={`mb-3 text-sm font-bold uppercase tracking-[0.14em] ${
                isLight ? 'text-[#2563eb]' : 'text-teal-300'
              }`}
            >
              {slide.eyebrow}
            </p>
          ) : null}

          {slide.icon ? (
            <div
              className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
                isLight
                  ? 'bg-white text-[#2563eb] border border-slate-200'
                  : 'bg-white/10 text-teal-200'
              }`}
            >
              {slide.icon}
            </div>
          ) : null}

          <h1
            className={`font-extrabold tracking-tight ${
              isHero
                ? 'text-5xl sm:text-7xl lg:text-8xl'
                : 'text-3xl sm:text-5xl lg:text-6xl'
            }`}
          >
            {isHero && slide.id === 'hero' ? (
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #22c55e, #14b8a6, #60a5fa)',
                }}
              >
                {slide.title}
              </span>
            ) : (
              slide.title
            )}
          </h1>

          <p
            className={`mt-5 max-w-3xl text-lg font-medium leading-snug sm:text-2xl ${
              isLight ? 'text-slate-600' : 'text-white/75'
            }`}
          >
            {slide.line}
          </p>

          {slide.bullets?.length ? (
            <ul className="mt-8 space-y-3">
              {slide.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-base sm:text-lg">
                  <span
                    className="mt-2 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: '#14b8a6' }}
                  />
                  <span className={isLight ? 'text-slate-800' : 'text-white/90'}>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {slide.footer ? (
            <p
              className={`mt-10 text-sm font-semibold ${
                isLight ? 'text-slate-400' : 'text-white/40'
              }`}
            >
              {slide.footer}
            </p>
          ) : null}
        </div>
      </main>

      <footer
        data-nav
        className={`relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-8 ${
          isLight ? 'text-slate-500' : 'text-white/45'
        }`}
      >
        <button
          type="button"
          data-nav
          disabled={i === 0}
          onClick={() => go(i - 1)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold disabled:opacity-30 ${
            isLight
              ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
          }`}
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </button>

        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {SLIDES.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                data-nav
                aria-label={`Diapositiva ${idx + 1}`}
                onClick={() => go(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === i
                    ? 'w-6 bg-[#2563eb]'
                    : isLight
                      ? 'w-2 bg-slate-300 hover:bg-slate-400'
                      : 'w-2 bg-white/25 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] font-medium tabular-nums">
            {i + 1} / {total} · flechas · F pantalla completa
          </p>
        </div>

        <button
          type="button"
          data-nav
          disabled={i === total - 1}
          onClick={() => go(i + 1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-3 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-30"
        >
          Siguiente
          <ArrowRight className="h-4 w-4" />
        </button>
      </footer>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
