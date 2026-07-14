import { useNavigate } from 'react-router';
import {
  ArrowRight, Award, BarChart3, Bell, Building2, Car, Check, ChevronDown, Clock, Code,
  DollarSign, FileText, Handshake, Layers, Lock, Mail, MapPin, Monitor,
  Package, PhoneCall, Quote, Shield, ShoppingCart, Sparkles, Star, Target, TrendingUp,
  Truck, Users, Webhook, Wrench, Zap, UtensilsCrossed,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { BrowserFrame } from '../components/landing/BrowserFrame';
import { ModalComingSoon } from '../components/landing/ModalComingSoon';
import { AUTH_PATHS } from '../lib/authEntryPaths';
import '../../styles/landing.css';

const MARQUEE_ITEMS = [
  'Compraventa', 'Delivery', 'Taller', 'TPV tablet', 'CRM', 'Finanzas',
  'Documentos', 'Equipo', 'Alertas', 'Multi-sede', 'API REST', 'Vertial',
];

const VERTICALS = [
  { icon: Car, name: 'Compraventa', desc: 'Stock, operaciones, documentos y márgenes en tiempo real.', live: true },
  { icon: UtensilsCrossed, name: 'Restauración', desc: 'Bar, restaurante, TPV en tablet, cocina y comandas en sala.', live: true },
  { icon: Truck, name: 'Delivery', desc: 'Pedidos a domicilio, reparto, cocina y fidelización de clientes.', live: true },
  { icon: Wrench, name: 'Taller', desc: 'Órdenes de trabajo, recambios y seguimiento de reparaciones.', live: true },
  { icon: ShoppingCart, name: 'Retail', desc: 'Puntos de venta y catálogo para comercio minorista.', live: false },
];

const BENTO = [
  { icon: Layers, title: 'Un motor, muchas verticales', desc: 'Misma plataforma, distinta operativa. Sin duplicar sistemas.', span: 'lg:col-span-2 lg:row-span-2', large: true },
  { icon: BarChart3, title: 'Dashboard en vivo', desc: 'KPIs, alertas y actividad del día conectados a tus datos.' },
  { icon: Users, title: 'CRM unificado', desc: 'Clientes, historial y segmentación en un solo sitio.' },
  { icon: Package, title: 'Stock & operaciones', desc: 'Inventario, pipeline y trazabilidad de punta a punta.' },
  { icon: Monitor, title: 'TPV en tablet', desc: 'Caja, consumo de equipo y turnos listos para el mostrador.' },
  { icon: Shield, title: 'Seguro en Europa', desc: 'RGPD, permisos granulares y backups automáticos.' },
  { icon: Bell, title: 'Centro de alertas', desc: 'Push, email e in-app configurables por rol.' },
];

const FAQ = [
  { q: '¿Necesito tarjeta de crédito para la prueba gratuita?', a: 'No. Puedes empezar a usar Vertial sin introducir ninguna tarjeta. Solo email y contraseña.' },
  { q: '¿Qué pasa después de los 30 días de prueba?', a: 'Podrás elegir el plan que mejor se adapte a tu negocio. Si no eliges ninguno, tu cuenta se pausará y tus datos se conservarán 90 días.' },
  { q: '¿Puedo cambiar de plan más adelante?', a: 'Sí, puedes cambiar de plan en cualquier momento desde tu panel de facturación. El cambio es inmediato.' },
  { q: '¿Los datos están seguros?', a: 'Sí. Todos los datos están cifrados, alojados en Europa y cumplimos con RGPD. Hacemos backups diarios automáticos.' },
  { q: '¿Cómo funciona la integración con ANCOVE?', a: 'ANCOVE es una integración opcional para compraventa. Puedes conectar tu cuenta desde Ajustes → Integraciones.' },
];

const STATS = [
  { icon: Building2, value: 'Multi-vertical', label: 'Un core, varias operativas' },
  { icon: Zap, value: 'Tiempo real', label: 'Datos conectados al panel' },
  { icon: Shield, value: 'RGPD', label: 'Datos alojados en Europa' },
  { icon: Clock, value: '24/7', label: 'Plataforma siempre disponible' },
];

const TESTIMONIALS = [
  {
    quote: 'Pasamos de hojas de cálculo y WhatsApp a tener todo el stock y las operaciones en un solo sitio. El equipo va mucho más alineado.',
    name: 'Carlos M.',
    role: 'Director · Compraventa',
    initial: 'C',
  },
  {
    quote: 'Con delivery, cocina y reparto en Vertial vemos el día entero sin perder pedidos. El TPV en tablet nos cambió el ritmo del local.',
    name: 'Laura S.',
    role: 'Gerente · Restauración',
    initial: 'L',
  },
  {
    quote: 'Multi-sede, permisos por rol y alertas configurables. Por fin una herramienta que se siente de empresa grande, no de prototipo.',
    name: 'Javier P.',
    role: 'Propietario · Grupo multi-negocio',
    initial: 'J',
  },
];

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className = '',
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div className={`mb-14 ${align === 'center' ? 'text-center' : ''} ${className}`}>
      <div className={`vertial-section-eyebrow mb-4 ${align === 'center' ? 'mx-auto' : ''}`}>
        {eyebrow}
      </div>
      <h2 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-white tracking-tight mb-4">{title}</h2>
      {subtitle && (
        <p className={`text-zinc-400 text-lg leading-relaxed max-w-2xl ${align === 'center' ? 'mx-auto' : ''}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function LandingNew() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [comingSoonVertical, setComingSoonVertical] = useState('');
  const [pricingPeriod, setPricingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [heroMetric, setHeroMetric] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    if (hadDark) root.classList.remove('dark');
    return () => { if (hadDark) root.classList.add('dark'); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroMetric((m) => (m + 1) % 3), 3200);
    return () => clearInterval(t);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const heroCaptions = [
    'Pedidos en cocina · reparto en vivo',
    'Stock y márgenes · actualización automática',
    'Equipo, permisos y alertas · un solo panel',
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-[Plus_Jakarta_Sans,system-ui,sans-serif] antialiased">
      <Header landingDark />

      {/* ── HERO ── */}
      <section className="relative min-h-[100svh] flex flex-col overflow-hidden vertial-hero-mesh">
        <div className="absolute inset-0 vertial-grid-lines pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 pt-28 pb-16 flex-1 flex flex-col justify-center relative z-10">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-zinc-300 mb-8">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Plataforma multi-vertical · Hecha en España
              </div>

              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400/90 mb-3">Vertial</p>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6">
                El sistema operativo
                <br />
                <span className="vertial-text-gradient">de tu negocio</span>
              </h1>
              <p className="text-lg text-zinc-400 max-w-lg mb-8 leading-relaxed">
                Stock, operaciones, clientes, TPV y finanzas en una sola plataforma profesional.
                Sin caos. Sin papeles perdidos. Sin herramientas sueltas.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => navigate(AUTH_PATHS.register, { state: { accountType: 'company' } })}
                  className="px-8 py-4 vertial-glow-btn text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/40 hover:opacity-95 transition-opacity"
                >
                  Probar Vertial gratis
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo('contacto')}
                  className="px-8 py-4 rounded-2xl border border-zinc-600 text-zinc-200 font-semibold hover:bg-white/5 hover:border-zinc-500 transition-colors"
                >
                  Hablar con ventas
                </button>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
                {['Sin tarjeta', '30 días gratis', 'Sin permanencia', 'Datos en Europa'].map((t) => (
                  <span key={t} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-6 -left-4 z-20 vertial-float hidden sm:block">
                <div className="vertial-bento-card rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-zinc-200">+24 ops. hoy</span>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-2 z-20 vertial-float-delayed hidden sm:block">
                <div className="vertial-bento-card rounded-2xl px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Margen medio</p>
                  <p className="text-lg font-bold text-emerald-400">+18,4%</p>
                </div>
              </div>

              <BrowserFrame dark className="shadow-[0_40px_80px_rgba(0,0,0,0.55)] border border-zinc-800">
                <div className="p-5 bg-zinc-900 min-h-[280px]">
                  <div className="flex gap-2 mb-4">
                    {['Operaciones', 'Stock', 'Alertas'].map((tab, i) => (
                      <div
                        key={tab}
                        className={`h-7 px-3 rounded-lg text-xs font-medium flex items-center ${
                          heroMetric === i ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {tab}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[Package, Users, DollarSign].map((Icon, i) => (
                      <div key={i} className={`rounded-xl p-3 border ${heroMetric === i ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-800/50'}`}>
                        <Icon className={`w-5 h-5 mb-2 ${heroMetric === i ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        <div className="h-2 bg-zinc-700 rounded w-full mb-1" />
                        <div className="h-2 bg-zinc-700 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((row) => (
                      <div key={row} className="flex gap-2 items-center">
                        <div className={`h-2 rounded flex-1 ${row === 2 ? 'bg-emerald-500/60' : 'bg-zinc-800'}`} />
                        <div className="h-2 bg-zinc-800 rounded w-12" />
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-xs text-emerald-400/80 font-medium mt-4">{heroCaptions[heroMetric]}</p>
                </div>
              </BrowserFrame>
            </div>
          </div>
        </div>

        <div className="border-y border-white/5 bg-zinc-950/80 overflow-hidden py-4">
          <div className="flex vertial-marquee-track whitespace-nowrap">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} className="mx-6 text-sm font-semibold text-zinc-600 flex items-center gap-6">
                {item}
                <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-16 px-6 bg-zinc-950 border-b border-zinc-800/80">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="vertial-bento-card vertial-card-lift rounded-2xl p-6 text-center">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <p className="text-lg font-extrabold text-white mb-1">{stat.value}</p>
                  <p className="text-xs text-zinc-500 font-medium">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── BENTO ── */}
      <section id="modulos" className="py-24 px-6 bg-zinc-950 relative">
        <div className="absolute top-0 left-0 right-0 vertial-section-divider" />
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow="Por qué Vertial"
            title={<>Grande. Conectado. <span className="vertial-text-gradient">Profesional.</span></>}
            subtitle="No es otro Excel con login. Es el núcleo operativo de tu empresa — diseñado para escalar por vertical sin empezar de cero."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {BENTO.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className={`vertial-bento-card vertial-card-lift rounded-2xl p-6 ${card.span || ''} ${card.large ? 'flex flex-col justify-between min-h-[240px]' : ''}`}
                >
                  <div>
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className={`font-bold text-white mb-2 ${card.large ? 'text-2xl' : 'text-lg'}`}>{card.title}</h3>
                    <p className={`text-zinc-400 leading-relaxed ${card.large ? 'text-base' : 'text-sm'}`}>{card.desc}</p>
                  </div>
                  {card.large && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {['Core', 'Motor ops', 'Config vertical'].map((tag) => (
                        <span key={tag} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── VERTICALES ── */}
      <section id="verticales" className="py-24 px-6 bg-zinc-900/40 border-y border-zinc-800 relative overflow-hidden">
        <div className="absolute -right-32 top-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto relative">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
            <SectionHeader
              align="left"
              className="!mb-0"
              eyebrow="Multi-vertical"
              title="Elige tu operativa"
              subtitle="Misma plataforma Vertial, distinto negocio. Activa la vertical que encaje contigo."
            />
            <button type="button" onClick={() => scrollTo('planes')} className="text-emerald-400 font-semibold flex items-center gap-1 hover:gap-2 transition-all shrink-0 pb-1">
              Ver planes <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VERTICALS.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.name}
                  className={`vertial-card-lift rounded-2xl p-6 border relative overflow-hidden ${
                    v.live
                      ? 'vertial-bento-card hover:border-emerald-500/35'
                      : 'bg-zinc-950/60 border-zinc-800/80 opacity-75'
                  }`}
                >
                  {v.live && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500" />}
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-900/20">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    {v.live ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">Activo</span>
                    ) : (
                      <Lock className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{v.name}</h3>
                  <p className="text-sm text-zinc-400 mb-6 leading-relaxed min-h-[3.5rem]">{v.desc}</p>
                  <button
                    type="button"
                    onClick={() => (v.live ? scrollTo('como-funciona') : (setComingSoonVertical(v.name), setShowComingSoonModal(true)))}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                      v.live
                        ? 'bg-white text-zinc-900 hover:bg-zinc-100 shadow-md shadow-black/20'
                        : 'border border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {v.live ? 'Ver cómo funciona' : 'Próximamente'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section id="como-funciona" className="py-24 px-6 bg-zinc-950">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow="Implementación"
            title="En marcha en minutos"
            subtitle="Tres pasos para tener Vertial operando en tu empresa, con datos reales desde el primer día."
          />

          <div className="relative">
            <div className="hidden lg:block absolute top-16 left-[16%] right-[16%] h-px vertial-step-line" />
            <div className="grid lg:grid-cols-3 gap-6">
              {[
                { n: '01', title: 'Crea tu espacio', desc: 'Regístrate, elige vertical y configura tu negocio con el asistente de alta.', icon: Building2 },
                { n: '02', title: 'Conecta tu operativa', desc: 'Stock, pedidos o vehículos: importa datos o empieza desde cero con plantillas.', icon: Target },
                { n: '03', title: 'Controla con datos reales', desc: 'Dashboard, alertas y equipo trabajando sobre la misma fuente de verdad.', icon: Zap },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.n} className="vertial-bento-card vertial-card-lift rounded-2xl p-8 relative">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <Icon className="w-7 h-7 text-emerald-400" />
                      </div>
                      <span className="text-3xl font-black text-zinc-700">{step.n}</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: FileText, label: 'Documentos centralizados' },
              { icon: MapPin, label: 'Multi-ubicación' },
              { icon: Users, label: 'Roles y permisos' },
              { icon: TrendingUp, label: 'Informes y KPIs' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <Icon className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium text-zinc-300">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRACIONES ── */}
      <section id="integraciones" className="py-24 px-6 relative overflow-hidden border-t border-zinc-800">
        <div className="absolute inset-0 vertial-hero-mesh opacity-40" />
        <div className="max-w-6xl mx-auto relative">
          <SectionHeader
            eyebrow="Ecosistema"
            title="Integraciones"
            subtitle="Conecta Vertial con tu stack cuando lo necesites — sin vendor lock-in innecesario."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Building2, title: 'ANCOVE', desc: 'Plataforma oficial compraventas', tag: 'Opcional' },
              { icon: Code, title: 'API REST', desc: 'Acceso programático completo', tag: 'Pro' },
              { icon: Webhook, title: 'Webhooks', desc: 'Eventos en tiempo real', tag: 'Pro' },
              { icon: Mail, title: 'Email / SMTP', desc: 'Documentos y notificaciones', tag: 'Incluido' },
            ].map(({ icon: Icon, title, desc, tag }) => (
              <div key={title} className="vertial-bento-card vertial-card-lift rounded-2xl p-6 relative">
                <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-bold text-white text-lg">{title}</h3>
                <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section id="planes" className="py-24 px-6 bg-zinc-950 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow="Precios"
            title="Planes para crecer con Vertial"
            subtitle="Escala cuando lo necesites. Sin permanencia, con prueba gratuita de 30 días."
          />

          <div className="flex justify-center mb-12">
            <div className="inline-flex p-1 rounded-xl bg-zinc-900 border border-zinc-800">
              {(['monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPricingPeriod(p)}
                  className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    pricingPeriod === p ? 'vertial-glow-btn text-white shadow-lg' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {p === 'monthly' ? 'Mensual' : 'Anual'}
                  {p === 'yearly' && <span className={`ml-1.5 text-xs font-bold ${pricingPeriod === 'yearly' ? 'text-white/90' : 'text-emerald-500'}`}>-20%</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 items-stretch mb-8">
            {[
              { name: 'Básico', price: pricingPeriod === 'monthly' ? '50€' : '40€', yearlyNote: pricingPeriod === 'yearly' ? '480€/año facturados' : null, desc: 'Para empezar con orden', features: ['1 ubicación', 'Hasta 2 usuarios', 'Stock ilimitado', 'Operaciones y CRM', 'Documentos básicos'], cta: 'Empezar gratis', primary: false },
              { name: 'Normal', price: pricingPeriod === 'monthly' ? '150€' : '120€', yearlyNote: pricingPeriod === 'yearly' ? '1.440€/año facturados' : null, desc: 'El más elegido por equipos en crecimiento', features: ['1 ubicación', 'Hasta 5 usuarios', 'Todo lo del Básico', 'Firma digital', 'Gestoría integrada', 'KPIs avanzados'], cta: 'Empezar gratis', primary: true },
              { name: 'Pro', price: pricingPeriod === 'monthly' ? '350€' : '280€', yearlyNote: pricingPeriod === 'yearly' ? '3.360€/año facturados' : null, desc: 'Multi-sede, API y soporte prioritario', features: ['Múltiples ubicaciones', 'Usuarios ilimitados', 'Todo lo del Normal', 'API y Webhooks', 'Soporte prioritario', 'Onboarding personalizado'], cta: 'Hablar con ventas', primary: false, sales: true },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`vertial-card-lift rounded-2xl p-8 border flex flex-col ${
                  plan.primary
                    ? 'vertial-pricing-glow border-emerald-500/40 bg-gradient-to-b from-emerald-950/50 via-zinc-900 to-zinc-950 lg:-mt-2 lg:mb-2'
                    : 'vertial-bento-card border-zinc-800'
                }`}
              >
                {plan.primary && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-4 w-fit px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <Star className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" /> Más popular
                  </span>
                )}
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">{plan.name}</h3>
                <div className="mt-2 mb-1">
                  <span className="text-4xl lg:text-5xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-zinc-500 text-sm ml-1">/mes</span>
                </div>
                {plan.yearlyNote && <p className="text-xs text-emerald-400/80 font-medium mb-1">{plan.yearlyNote}</p>}
                <p className="text-sm text-zinc-400 mb-6">{plan.desc}</p>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => (plan.sales ? scrollTo('contacto') : navigate(AUTH_PATHS.register, { state: { accountType: 'company' } }))}
                  className={`w-full py-3.5 rounded-xl font-bold transition-all ${
                    plan.primary
                      ? 'vertial-glow-btn text-white shadow-lg'
                      : plan.sales
                        ? 'border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                        : 'bg-white text-zinc-900 hover:bg-zinc-100'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <div className="vertial-bento-card rounded-2xl px-6 py-4 max-w-2xl mx-auto text-center">
            <p className="text-sm text-zinc-400">
              <span className="text-white font-semibold">1 ubicación = 1 licencia.</span> Cada sede adicional se factura por separado.
            </p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section className="py-24 px-6 bg-zinc-900/30 border-y border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow="Clientes"
            title={<>Empresas que operan con <span className="vertial-text-gradient">Vertial</span></>}
            subtitle="Resultados reales en compraventa, restauración y operaciones multi-equipo."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="vertial-bento-card vertial-card-lift rounded-2xl p-8 flex flex-col">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <Quote className="w-8 h-8 text-emerald-500/30 mb-3" />
                <p className="text-zinc-300 text-sm leading-relaxed flex-1 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-zinc-800">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {t.initial}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <p className="text-xs text-zinc-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 vertial-hero-mesh" />
        <div className="absolute inset-0 vertial-grid-lines opacity-60 pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="vertial-section-eyebrow mx-auto mb-6">Empieza hoy</div>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
            Tu negocio merece <span className="vertial-text-gradient">Vertial</span>
          </h2>
          <p className="text-xl text-zinc-400 mb-10">30 días gratis · Sin tarjeta · Soporte en español</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <button type="button" onClick={() => navigate(AUTH_PATHS.entry)} className="px-10 py-4 vertial-glow-btn text-white font-bold rounded-2xl text-lg shadow-xl shadow-emerald-950/30">
              Empezar ahora
            </button>
            <button type="button" onClick={() => navigate(AUTH_PATHS.tpvTabletLogin)} className="px-10 py-4 rounded-2xl border border-zinc-600 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 hover:border-zinc-500 transition-colors">
              <Monitor className="w-5 h-5" /> TPV en tablet
            </button>
          </div>
          <p className="text-sm text-zinc-500">
            ¿Ya tienes cuenta?{' '}
            <button type="button" onClick={() => navigate(AUTH_PATHS.workerLogin)} className="text-emerald-400 font-semibold hover:underline">
              Acceso trabajadores
            </button>
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 px-6 bg-zinc-950">
        <div className="max-w-3xl mx-auto">
          <SectionHeader eyebrow="Ayuda" title="Preguntas frecuentes" subtitle="Lo esencial antes de dar el paso." />
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <div
                key={i}
                className={`rounded-2xl border overflow-hidden transition-colors ${
                  openFaq === i ? 'vertial-faq-open border-emerald-500/30' : 'border-zinc-800 vertial-bento-card'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-semibold text-white pr-4">{item.q}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${openFaq === i ? 'rotate-180 text-emerald-400' : 'text-zinc-500'}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-zinc-400 text-sm leading-relaxed border-t border-zinc-800/80 pt-4">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACTO + AFILIADOS ── */}
      <section id="contacto" className="py-24 px-6 bg-zinc-900/40 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div className="vertial-bento-card rounded-2xl p-8 lg:p-10 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-16 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <SectionHeader
                  align="left"
                  className="!mb-6"
                  eyebrow="Contacto"
                  title="Agendar reunión con Vertial"
                />
                <button
                  type="button"
                  onClick={() => navigate('/reuniones')}
                  className="w-full py-4 rounded-2xl font-extrabold vertial-glow-btn text-white flex items-center justify-center gap-2 text-lg"
                >
                  Agendar reunión
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="vertial-bento-card rounded-2xl p-8 lg:p-10 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <Handshake className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Afiliados</span>
                </div>
                <h3 className="text-2xl font-extrabold text-white mb-3 leading-snug">
                  ¿Conoces negocios que encajarían con Vertial?
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  Únete al programa de afiliados: comisiones recurrentes, sin límite de ingresos y soporte dedicado para partners.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { icon: TrendingUp, label: 'Comisiones recurrentes' },
                    { icon: Award, label: 'Sin límite de ingresos' },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 text-xs text-zinc-400">
                      <Icon className="w-4 h-4 text-emerald-500 shrink-0" />
                      {label}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/affiliados')}
                  className="w-full py-3.5 rounded-xl font-bold vertial-glow-btn text-white flex items-center justify-center gap-2"
                >
                  Solicitar afiliación
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer landingDark />

      <ModalComingSoon isOpen={showComingSoonModal} onClose={() => setShowComingSoonModal(false)} verticalName={comingSoonVertical} />
    </div>
  );
}
