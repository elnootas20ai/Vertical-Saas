import { useNavigate } from 'react-router';
import {
  Check, Car, Users, MapPin, FileText, Zap, Shield, Clock, ArrowRight,
  MessageCircle, CheckCircle, DollarSign, Building2, PhoneCall, Mail, ChevronDown,
  BarChart3, Package, Database, FolderOpen, Lock, Wrench, ShoppingCart, Truck, Target, Bell, Code, Webhook,
  Star, Quote, TrendingUp, Award, Globe, Sparkles, Handshake
} from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useState, useEffect } from 'react';
import { ModalComingSoon } from '../components/landing/ModalComingSoon';
import { BrowserFrame } from '../components/landing/BrowserFrame';
import { ModuleImageModal } from '../components/landing/ModuleImageModal';

export function LandingNew() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [comingSoonVertical, setComingSoonVertical] = useState('');
  const [activeTab, setActiveTab] = useState<'operativa' | 'comercial' | 'documentacion' | 'control'>('operativa');
  const [showAllModules, setShowAllModules] = useState(false);
  const [pricingPeriod, setPricingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [dashboardState, setDashboardState] = useState(0);
  const [moduleModal, setModuleModal] = useState<{ isOpen: boolean; title: string; imageSrc?: string }>({
    isOpen: false,
    title: '',
    imageSrc: undefined,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setDashboardState((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkMode = root.classList.contains('dark');

    if (hadDarkMode) {
      root.classList.remove('dark');
    }

    return () => {
      if (hadDarkMode) {
        root.classList.add('dark');
      }
    };
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleComingSoon = (vertical: string) => {
    setComingSoonVertical(vertical);
    setShowComingSoonModal(true);
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const modules = {
    operativa: [
      { icon: Car, title: 'Stock de vehículos', bullets: ['Ficha completa con fotos y documentos', 'Alertas de días en stock y rotación'], link: '#', color: 'from-blue-500 to-blue-700' },
      { icon: Package, title: 'Operaciones', bullets: ['Pipeline visual de compras y ventas', 'Control de gastos e incidencias'], link: '#', color: 'from-blue-600 to-blue-800' },
      { icon: MapPin, title: 'Ubicaciones', bullets: ['Mapa visual del aparcamiento', 'Movimientos entre zonas en tiempo real'], link: '#', color: 'from-sky-500 to-blue-600' },
      { icon: DollarSign, title: 'Ventas', bullets: ['Gestión de precios y márgenes', 'Historial completo de transacciones'], link: '#', color: 'from-blue-400 to-blue-600' },
    ],
    comercial: [
      { icon: Users, title: 'CRM / Leads', bullets: ['Captación automática de leads', 'Seguimiento de interacciones'], link: '#', color: 'from-blue-500 to-blue-700' },
      { icon: Target, title: 'Seguimiento', bullets: ['Timeline de acciones', 'Recordatorios y tareas'], link: '#', color: 'from-blue-600 to-blue-800' },
      { icon: CheckCircle, title: 'Reservas / Señal', bullets: ['Gestión de reservas y señales', 'Control de vencimientos'], link: '#', color: 'from-sky-500 to-blue-600' },
      { icon: MessageCircle, title: 'Postventa', bullets: ['Gestión de incidencias', 'Satisfacción del cliente'], link: '#', color: 'from-blue-400 to-blue-600' },
    ],
    documentacion: [
      { icon: FileText, title: 'Recepción', bullets: ['Registro de documentos de entrada', 'Validación automática'], link: '#', color: 'from-blue-500 to-blue-700' },
      { icon: FolderOpen, title: 'Contratos', bullets: ['Plantillas personalizables', 'Firma digital integrada'], link: '#', color: 'from-blue-600 to-blue-800' },
      { icon: Building2, title: 'Facturas', bullets: ['Generación automática', 'Integración con gestoría'], link: '#', color: 'from-sky-500 to-blue-600' },
      { icon: Shield, title: 'Gestoría', bullets: ['Envío automático de documentos', 'Seguimiento de trámites'], link: '#', color: 'from-blue-400 to-blue-600' },
    ],
    control: [
      { icon: BarChart3, title: 'KPIs', bullets: ['Métricas de ventas y márgenes', 'Rotación de stock'], link: '#', color: 'from-blue-500 to-blue-700' },
      { icon: Bell, title: 'Alertas', bullets: ['Notificaciones personalizables', 'Escalado automático'], link: '#', color: 'from-blue-600 to-blue-800' },
      { icon: Users, title: 'Equipo', bullets: ['Gestión de usuarios y permisos', 'Actividad del equipo'], link: '#', color: 'from-sky-500 to-blue-600' },
      { icon: Zap, title: 'Integraciones', bullets: ['API REST completa', 'Webhooks y sincronización'], link: '#', color: 'from-blue-400 to-blue-600' },
    ],
  };

  const currentModules = modules[activeTab];

  const tabLabels: Record<string, string> = {
    operativa: 'Operativa',
    comercial: 'Comercial',
    documentacion: 'Documentación',
    control: 'Control',
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* ───── HERO ───── */}
      <section
        className="relative pt-24 pb-0 overflow-hidden bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(23,37,84,0.9), rgba(30,58,138,0.85), rgba(15,23,42,0.9)), url('https://images.unsplash.com/photo-1485291571150-772bcfc10da5?auto=format&fit=crop&w=1800&q=80')",
        }}
      >
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center pb-16 lg:pb-0">
            {/* Left: Text */}
            <div className="pt-8 lg:pt-16 pb-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full mb-6 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-sm font-semibold text-blue-200">Plataforma multi-vertical</span>
              </div>

              <h1 className="text-4xl lg:text-6xl font-extrabold text-white mb-6 leading-[1.1] tracking-tight">
                Control total<br />
                de tu negocio,{' '}
                <span className="bg-gradient-to-r from-blue-300 to-sky-300 bg-clip-text text-transparent">
                  sin caos
                </span>
              </h1>

              <p className="text-lg text-blue-200 mb-8 leading-relaxed max-w-lg">
                Stock, operaciones, clientes y documentos en un solo lugar. Sin papeles perdidos, sin procesos duplicados.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
                <button
                  onClick={() => navigate('/auth/entry')}
                  className="px-8 py-4 bg-white text-blue-700 rounded-xl hover:bg-blue-50 transition-all font-bold flex items-center justify-center gap-2 shadow-2xl shadow-blue-950/50 hover:-translate-y-0.5"
                >
                  Probar gratis 14 días
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scrollToSection('contacto')}
                  className="px-8 py-4 border-2 border-white/30 text-white rounded-xl hover:bg-white/10 hover:border-white/50 transition-all font-semibold"
                >
                  Hablar con ventas
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-sm">
                {[
                  'Sin tarjeta de crédito',
                  'Sin permanencia',
                  'Soporte en español',
                  'Datos en Europa',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-blue-200">
                    <div className="w-5 h-5 bg-blue-500/30 border border-blue-400/40 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-300" />
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* Floating social proof */}
              <div className="mt-8 flex items-center gap-4">
                <div className="flex -space-x-2">
                  {['C', 'L', 'J', 'A', 'M'].map((initial, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full border-2 border-blue-900 bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold"
                    >
                      {initial}
                    </div>
                  ))}
                </div>
                <div className="text-blue-200 text-sm">
                  <span className="text-white font-semibold">+500 empresas</span> ya confían en Vertial
                </div>
              </div>
            </div>

            {/* Right: Product preview */}
            <div className="lg:pt-12 pb-0 flex flex-col gap-4">
              <div className="relative">
                {/* Notification badge floating */}
                <div className="absolute -top-4 -right-4 z-20 bg-white rounded-2xl px-4 py-2.5 shadow-2xl border border-blue-100 flex items-center gap-2.5 animate-pulse">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-700">+12 ops. hoy</span>
                </div>

                <BrowserFrame className="shadow-[0_32px_64px_rgba(0,0,0,0.4)]">
                  <div className="p-6 bg-gradient-to-br from-blue-50 to-white">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="col-span-1 space-y-2">
                        <div className="h-3 bg-blue-700 rounded w-3/4" />
                        <div className="h-2 bg-blue-200 rounded w-full" />
                        <div className="h-2 bg-blue-100 rounded w-full" />
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className={`h-2 rounded w-full transition-colors duration-500 ${dashboardState === i ? 'bg-blue-600' : 'bg-blue-100'}`}
                          />
                        ))}
                      </div>

                      <div className="col-span-2 h-[200px] relative">
                        {/* State 0 */}
                        <div className="absolute inset-0 space-y-3 transition-opacity duration-500" style={{ opacity: dashboardState === 0 ? 1 : 0, pointerEvents: dashboardState === 0 ? 'auto' : 'none' }}>
                          <div className="flex gap-2">
                            <div className="h-16 bg-blue-100 rounded-xl flex-1 flex items-center justify-center animate-pulse">
                              <Package className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="h-16 bg-blue-50 rounded-xl flex-1 flex items-center justify-center">
                              <Car className="w-6 h-6 text-blue-500" />
                            </div>
                            <div className="h-16 bg-blue-200 rounded-xl flex-1 flex items-center justify-center">
                              <Clock className="w-6 h-6 text-blue-700" />
                            </div>
                          </div>
                          <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-2">
                            <div className="flex gap-2">
                              {[1, 2, 3, 4].map((k) => <div key={k} className="h-2 bg-blue-700 rounded w-1/4" />)}
                            </div>
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <div className="h-2 bg-blue-100 rounded w-1/4" />
                                <div className="h-2 bg-blue-100 rounded w-1/4" />
                                <div className={`h-2 rounded w-1/4 ${i === 1 ? 'bg-blue-500 animate-pulse' : 'bg-blue-100'}`} />
                                <div className="h-2 bg-blue-100 rounded w-1/4 relative overflow-hidden">
                                  <div className="absolute inset-0 bg-blue-500 animate-pulse" style={{ width: '60%' }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* State 1 */}
                        <div className="absolute inset-0 space-y-3 transition-opacity duration-500" style={{ opacity: dashboardState === 1 ? 1 : 0, pointerEvents: dashboardState === 1 ? 'auto' : 'none' }}>
                          <div className="flex gap-2">
                            <div className="h-16 bg-blue-200 rounded-xl flex-1 flex items-center justify-center animate-pulse">
                              <FolderOpen className="w-6 h-6 text-blue-700" />
                            </div>
                            <div className="h-16 bg-blue-100 rounded-xl flex-1 flex items-center justify-center">
                              <FileText className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="h-16 bg-blue-50 rounded-xl flex-1 flex items-center justify-center">
                              <CheckCircle className="w-6 h-6 text-blue-500" />
                            </div>
                          </div>
                          <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-2">
                            <div className="flex gap-2">
                              {[1, 2, 3].map((k) => <div key={k} className="h-2 bg-blue-700 rounded w-1/3" />)}
                            </div>
                            {[1, 2, 3, 4].map((i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <div className="w-4 h-4 bg-blue-100 rounded flex-shrink-0" />
                                <div className="h-2 bg-blue-100 rounded flex-1" />
                                <div className={`h-2 rounded w-16 ${i <= 2 ? 'bg-blue-500' : 'bg-blue-300 animate-pulse'}`} />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* State 2 */}
                        <div className="absolute inset-0 space-y-3 transition-opacity duration-500" style={{ opacity: dashboardState === 2 ? 1 : 0, pointerEvents: dashboardState === 2 ? 'auto' : 'none' }}>
                          <div className="flex gap-2">
                            <div className="h-16 bg-blue-700 rounded-xl flex-1 flex items-center justify-center animate-pulse">
                              <Building2 className="w-6 h-6 text-white" />
                            </div>
                            <div className="h-16 bg-blue-100 rounded-xl flex-1 flex items-center justify-center">
                              <MapPin className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="h-16 bg-blue-50 rounded-xl flex-1 flex items-center justify-center">
                              <Database className="w-6 h-6 text-blue-500" />
                            </div>
                          </div>
                          <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-2">
                            <div className="flex gap-2">
                              {[1, 2, 3, 4].map((k) => <div key={k} className="h-2 bg-blue-700 rounded w-1/4" />)}
                            </div>
                            {[
                              { color: 'bg-blue-600' },
                              { color: 'bg-blue-400' },
                              { color: 'bg-blue-300' },
                            ].map((loc, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <div className={`w-2 h-2 ${loc.color} rounded-full flex-shrink-0 ${i === 0 ? 'animate-pulse' : ''}`} />
                                <div className="h-2 bg-blue-100 rounded w-1/4" />
                                <div className="h-2 bg-blue-100 rounded w-1/4" />
                                <div className={`h-2 ${loc.color} opacity-40 rounded w-1/4`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-center text-xs text-blue-600 font-semibold">
                      {dashboardState === 0 && 'Stock en tiempo real · Actualización automática'}
                      {dashboardState === 1 && 'Documentos digitales · Gestión centralizada'}
                      {dashboardState === 2 && 'Multiubicación · Control total'}
                    </p>
                  </div>
                </BrowserFrame>
              </div>

              {/* Mini cards */}
              <div className="grid grid-cols-3 gap-3 pb-8 lg:pb-16">
                {[
                  { icon: Car, label: 'Stock en tiempo real' },
                  { icon: FileText, label: 'Documentos digitales' },
                  { icon: MapPin, label: 'Multi-ubicación' },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 text-center hover:bg-white/20 hover:border-white/40 transition-all cursor-pointer"
                  >
                    <Icon className="w-6 h-6 text-blue-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-white/90">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="relative h-16 -mb-1">
          <svg viewBox="0 0 1440 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0 64L1440 64L1440 0C1200 48 960 64 720 64C480 64 240 48 0 0L0 64Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ───── STATS BAR ───── */}
      <section className="py-12 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { value: '+500', label: 'Empresas activas', icon: Building2 },
              { value: '+50.000', label: 'Operaciones gestionadas', icon: TrendingUp },
              { value: '99,9%', label: 'Tiempo de actividad', icon: Zap },
              { value: '4,8/5 ★', label: 'Valoración media', icon: Award },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 hover:shadow-lg hover:shadow-blue-100 hover:border-blue-200 transition-all">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-blue-600 mb-1">{stat.value}</div>
                  <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───── VERTICALES ───── */}
      <section id="verticales" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full mb-4">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-sm font-semibold text-blue-700">Multi-vertical</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Elige tu vertical
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Vertial está diseñado para múltiples sectores. Compraventa, Taller y Delivery ya están disponibles.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Compraventa */}
            <div className="group bg-white border-2 border-blue-500 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-200 hover:-translate-y-1 transition-all relative">
              <div className="h-2 bg-gradient-to-r from-blue-500 to-blue-700" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Car className="w-7 h-7 text-white" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                    ✓ Disponible
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Compraventa de coches</h3>
                <p className="text-slate-500 mb-6 text-sm leading-relaxed">
                  Gestión completa para compraventas profesionales. Stock, ventas, documentos y más.
                </p>
                <button
                  onClick={() => scrollToSection('modulos')}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-sm shadow-blue-300"
                >
                  Ver cómo funciona
                </button>
              </div>
            </div>

            {/* Taller */}
            <div className="group bg-white border-2 border-blue-500 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-200 hover:-translate-y-1 transition-all relative">
              <div className="h-2 bg-gradient-to-r from-blue-400 to-blue-600" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Wrench className="w-7 h-7 text-white" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                    ✓ Disponible
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Taller</h3>
                <p className="text-slate-500 mb-6 text-sm leading-relaxed">
                  Gestión de talleres mecánicos y servicios de reparación. Órdenes de trabajo y recambios.
                </p>
                <button
                  onClick={() => scrollToSection('modulos')}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-sm shadow-blue-300"
                >
                  Ver cómo funciona
                </button>
              </div>
            </div>

            {/* Retail - Próximamente */}
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden opacity-60 relative">
              <div className="h-2 bg-slate-200" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-slate-200 rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-7 h-7 text-slate-400" />
                  </div>
                  <Lock className="w-5 h-5 text-slate-400 mt-1" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Retail</h3>
                <p className="text-slate-500 mb-6 text-sm leading-relaxed">
                  Solución para comercios minoristas y puntos de venta. Próximamente disponible.
                </p>
                <button
                  onClick={() => handleComingSoon('Retail')}
                  className="w-full px-4 py-3 border-2 border-slate-300 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Próximamente
                </button>
              </div>
            </div>

            {/* Delivery */}
            <div className="group bg-white border-2 border-blue-500 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-200 hover:-translate-y-1 transition-all relative">
              <div className="h-2 bg-gradient-to-r from-sky-400 to-blue-500" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-sky-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Truck className="w-7 h-7 text-white" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                    ✓ Disponible
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Delivery</h3>
                <p className="text-slate-500 mb-6 text-sm leading-relaxed">
                  Plataforma para servicios de reparto y logística. Rutas, repartidores y seguimiento.
                </p>
                <button
                  onClick={() => scrollToSection('modulos')}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-sm shadow-blue-300"
                >
                  Ver cómo funciona
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── MÓDULOS ───── */}
      <section id="modulos" className="py-20 px-6 bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Todo lo que necesitas para gestionar tu compraventa
            </h2>
            <p className="text-lg text-slate-500">
              16 módulos especializados organizados por categoría
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center p-1.5 bg-white border border-blue-100 rounded-2xl shadow-sm gap-1">
              {(Object.keys(modules) as Array<keyof typeof modules>).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 font-semibold rounded-xl transition-all text-sm ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-300'
                      : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {currentModules.map((module, index) => {
              const Icon = module.icon;
              return (
                <div
                  key={index}
                  className="bg-white border border-blue-100 rounded-2xl p-6 hover:shadow-xl hover:shadow-blue-100 hover:-translate-y-1 transition-all group"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${module.color} rounded-xl flex items-center justify-center mb-4 shadow-md`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">{module.title}</h3>
                  <ul className="space-y-2 mb-4">
                    {module.bullets.map((bullet, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                        <div className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-2.5 h-2.5 text-blue-600" />
                        </div>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                    Ver más <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───── CÓMO FUNCIONA ───── */}
      <section id="como-funciona" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Cómo funciona
            </h2>
            <p className="text-lg text-slate-500">
              Tres pasos simples para gestionar tu compraventa
            </p>
          </div>

          {/* Timeline */}
          <div className="relative mb-14">
            <div className="absolute top-7 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 hidden lg:block" />

            <div className="grid lg:grid-cols-3 gap-8 relative">
              {[
                {
                  step: 1,
                  title: 'Registra tu stock',
                  desc: 'Añade vehículos con fotos, documentos y datos completos en minutos',
                  img: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1080&q=80',
                  alt: 'Inventario de vehículos',
                },
                {
                  step: 2,
                  title: 'Gestiona operaciones',
                  desc: 'Desde presupuesto hasta entrega, todo el proceso en un solo lugar',
                  img: 'https://images.unsplash.com/photo-1670852714979-f73d21652a83?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwZG9jdW1lbnQlMjBzaWduaW5nJTIwdGFibGV0fGVufDF8fHx8MTc3MzA2Nzk0NXww&ixlib=rb-4.1.0&q=80&w=1080',
                  alt: 'Firma digital de documentos',
                },
                {
                  step: 3,
                  title: 'Analiza resultados',
                  desc: 'Métricas en tiempo real para tomar mejores decisiones',
                  img: 'https://images.unsplash.com/photo-1759752394755-1241472b589d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMGFuYWx5dGljcyUyMGRhc2hib2FyZCUyMGNvbXB1dGVyfGVufDF8fHx8MTc3MzAxMzAwOHww&ixlib=rb-4.1.0&q=80&w=1080',
                  alt: 'Dashboard de analíticas',
                },
              ].map(({ step, title, desc, img, alt }) => (
                <div key={step} className="text-center">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-5 relative z-10 border-4 border-white shadow-xl shadow-blue-300">
                    <span className="text-xl font-extrabold text-white">{step}</span>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-5 hover:shadow-xl hover:shadow-blue-100 transition-all">
                    <div className="aspect-video bg-white rounded-xl border border-blue-100 overflow-hidden mb-4">
                      <img src={img} alt={alt} className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Beneficios */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Zap, title: 'Rápido y eficiente', desc: 'Ahorra horas de trabajo manual cada semana' },
              { icon: Shield, title: 'Seguro y cumplidor', desc: 'RGPD, datos en Europa, backups diarios' },
              { icon: Users, title: 'Todo el equipo conectado', desc: 'Roles, permisos y actividad en tiempo real' },
              { icon: Clock, title: 'Soporte cuando lo necesites', desc: 'Chat, email y teléfono en español' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center p-6 bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl hover:shadow-lg hover:shadow-blue-100 hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-blue-200">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h4 className="font-bold text-slate-900 mb-2">{title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── INTEGRACIONES ───── */}
      <section id="integraciones" className="py-20 px-6 bg-gradient-to-br from-blue-700 to-blue-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.4) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }} />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Integraciones</h2>
            <p className="text-lg text-blue-200">Conecta cuando lo necesites</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Building2, title: 'ANCOVE', desc: 'Integración con la plataforma oficial de compraventas', badge: 'Opcional', color: 'from-blue-500 to-blue-700' },
              { icon: Code, title: 'API REST', desc: 'API completa para integraciones personalizadas', badge: null, color: 'from-blue-600 to-blue-800' },
              { icon: Webhook, title: 'Webhooks', desc: 'Eventos en tiempo real para sincronización', badge: null, color: 'from-sky-500 to-blue-600' },
              { icon: Mail, title: 'Email / SMTP', desc: 'Envío automático de documentos y notificaciones', badge: null, color: 'from-blue-400 to-blue-600' },
            ].map(({ icon: Icon, title, desc, badge, color }) => (
              <div key={title} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/20 hover:border-white/40 hover:-translate-y-1 transition-all relative">
                {badge && (
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex px-2 py-1 bg-blue-200/20 text-blue-100 text-xs font-semibold rounded-full border border-blue-200/30">
                      {badge}
                    </span>
                  </div>
                )}
                <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-4 shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-blue-200 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── PRICING ───── */}
      <section id="planes" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Planes para crecer
            </h2>
            <p className="text-lg text-slate-500 mb-6">
              Elige el plan que mejor se adapte a tu negocio
            </p>

            <div className="inline-flex items-center gap-1 p-1.5 bg-blue-50 border border-blue-200 rounded-xl">
              <button
                onClick={() => setPricingPeriod('monthly')}
                className={`px-6 py-2.5 rounded-lg font-semibold transition-all text-sm ${
                  pricingPeriod === 'monthly'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-300'
                    : 'text-slate-600 hover:text-blue-700'
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setPricingPeriod('yearly')}
                className={`px-6 py-2.5 rounded-lg font-semibold transition-all text-sm flex items-center gap-2 ${
                  pricingPeriod === 'yearly'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-300'
                    : 'text-slate-600 hover:text-blue-700'
                }`}
              >
                Anual
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${pricingPeriod === 'yearly' ? 'bg-green-400 text-green-900' : 'bg-green-100 text-green-700'}`}>
                  -20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-8 items-start">
            {/* BÁSICO */}
            <div className="bg-white border-2 border-blue-100 rounded-2xl p-8 hover:shadow-xl hover:shadow-blue-100 hover:border-blue-200 transition-all">
              <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">Básico</h3>
              <div className="mb-2">
                <span className="text-4xl font-extrabold text-slate-900">
                  {pricingPeriod === 'monthly' ? '50€' : '40€'}
                </span>
                <span className="text-slate-500 text-sm ml-1">/mes</span>
              </div>
              {pricingPeriod === 'yearly' && (
                <div className="text-xs text-green-600 font-semibold mb-4">Facturado anualmente (480€/año)</div>
              )}
              <p className="text-slate-500 text-sm mb-6">Para compraventas que están empezando</p>

              <ul className="space-y-3 mb-8">
                {['1 ubicación', 'Hasta 2 usuarios', 'Stock ilimitado', 'Operaciones y CRM', 'Documentos básicos'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-slate-700">
                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate('/auth/entry')}
                className="w-full px-6 py-3.5 border-2 border-blue-600 text-blue-700 font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all"
              >
                Empezar gratis
              </button>
            </div>

            {/* NORMAL - Más popular */}
            <div className="relative bg-gradient-to-br from-blue-600 to-blue-800 border-2 border-blue-500 rounded-2xl p-8 hover:shadow-2xl hover:shadow-blue-300 transition-all -mt-2">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white text-blue-700 text-xs font-extrabold rounded-full shadow-xl">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  Más popular
                </span>
              </div>

              <h3 className="text-sm font-bold text-blue-200 uppercase tracking-wider mb-2">Normal</h3>
              <div className="mb-2">
                <span className="text-4xl font-extrabold text-white">
                  {pricingPeriod === 'monthly' ? '150€' : '120€'}
                </span>
                <span className="text-blue-200 text-sm ml-1">/mes</span>
              </div>
              {pricingPeriod === 'yearly' && (
                <div className="text-xs text-blue-100 font-semibold mb-4">Facturado anualmente (1.440€/año)</div>
              )}
              <p className="text-blue-100 text-sm mb-6">Para compraventas en crecimiento</p>

              <ul className="space-y-3 mb-8">
                {['1 ubicación', 'Hasta 5 usuarios', 'Todo lo del plan Básico', 'Firma digital', 'Gestoría integrada', 'KPIs avanzados'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-white">
                    <div className="w-5 h-5 bg-blue-500/50 border border-blue-400/50 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-100" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate('/auth/entry')}
                className="w-full px-6 py-3.5 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl shadow-blue-900/30"
              >
                Empezar gratis
              </button>
            </div>

            {/* PRO */}
            <div className="bg-white border-2 border-blue-100 rounded-2xl p-8 hover:shadow-xl hover:shadow-blue-100 hover:border-blue-200 transition-all">
              <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">Pro</h3>
              <div className="mb-2">
                <span className="text-4xl font-extrabold text-slate-900">
                  {pricingPeriod === 'monthly' ? '350€' : '280€'}
                </span>
                <span className="text-slate-500 text-sm ml-1">/mes</span>
              </div>
              {pricingPeriod === 'yearly' && (
                <div className="text-xs text-green-600 font-semibold mb-4">Facturado anualmente (3.360€/año)</div>
              )}
              <p className="text-slate-500 text-sm mb-6">Para compraventas profesionales</p>

              <ul className="space-y-3 mb-8">
                {['Múltiples ubicaciones', 'Usuarios ilimitados', 'Todo lo del plan Normal', 'API y Webhooks', 'Soporte prioritario', 'Onboarding personalizado'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-slate-700">
                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => scrollToSection('contacto')}
                className="w-full px-6 py-3.5 border-2 border-blue-600 text-blue-700 font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all"
              >
                Hablar con ventas
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 max-w-xl mx-auto text-center">
            <p className="text-sm text-blue-900">
              <strong>Nota:</strong> 1 ubicación = 1 licencia. Cada ubicación adicional tiene un coste independiente.
            </p>
          </div>
        </div>
      </section>

      {/* ───── TESTIMONIALES ───── */}
      <section className="py-20 px-6 bg-gradient-to-br from-blue-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full mb-4">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <span className="text-sm font-semibold text-yellow-700">Valoración 4,8/5 · +500 empresas</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Lo que dicen nuestros clientes
            </h2>
            <p className="text-lg text-slate-500">
              Empresas que ya gestionan su negocio con Vertial
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: 'Antes perdíamos horas buscando documentos y actualizando hojas de cálculo. Ahora todo está en un lugar y el equipo trabaja mucho más coordinado.',
                name: 'Carlos M.',
                role: 'Director, Compraventa Madrid Sur',
                stars: 5,
                initial: 'C',
                color: 'from-blue-500 to-blue-700',
              },
              {
                quote: 'La integración con la gestoría nos ha ahorrado muchísimo tiempo. Los documentos se envían solos y el seguimiento de trámites es transparente.',
                name: 'Laura S.',
                role: 'Gestora administrativa, Auto Rápido SL',
                stars: 5,
                initial: 'L',
                color: 'from-sky-500 to-blue-600',
              },
              {
                quote: 'El módulo de ubicaciones es increíble para nosotros que tenemos vehículos en varios aparcamientos. Siempre sabemos dónde está cada coche.',
                name: 'Javier P.',
                role: 'Propietario, Grupo Automotriz Levante',
                stars: 5,
                initial: 'J',
                color: 'from-blue-600 to-blue-800',
              },
            ].map((testimonial, i) => (
              <div
                key={i}
                className="bg-white border border-blue-100 rounded-2xl p-8 hover:shadow-xl hover:shadow-blue-100 hover:-translate-y-1 transition-all flex flex-col"
              >
                <div className="flex items-center gap-1 mb-5">
                  {Array.from({ length: testimonial.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <Quote className="w-8 h-8 text-blue-200 mb-3 flex-shrink-0" />
                <p className="text-slate-700 text-sm leading-relaxed flex-1 mb-6 italic">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-3 pt-5 border-t border-blue-100">
                  <div className={`w-10 h-10 bg-gradient-to-br ${testimonial.color} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md`}>
                    {testimonial.initial}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{testimonial.name}</p>
                    <p className="text-xs text-slate-500">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── CTA FINAL ───── */}
      <section className="py-24 px-6 bg-gradient-to-br from-blue-800 via-blue-900 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full mb-6">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-white/80">Sin riesgos · Sin permanencia</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
            Empieza hoy mismo.<br />
            <span className="bg-gradient-to-r from-blue-300 to-sky-300 bg-clip-text text-transparent">Sin riesgos.</span>
          </h2>
          <p className="text-xl text-blue-200 mb-10 max-w-2xl mx-auto">
            Prueba Vertial gratis durante 30 días. Sin tarjeta, sin permanencia, con soporte en español.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/auth/entry')}
              className="px-10 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-2xl shadow-blue-950/50 hover:-translate-y-0.5 text-lg"
            >
              Empezar gratis
            </button>
            <button
              onClick={() => scrollToSection('contacto')}
              className="px-10 py-4 border-2 border-white/40 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/70 transition-all text-lg"
            >
              Hablar con ventas
            </button>
          </div>
          <p className="mt-6 text-blue-300 text-sm">
            ¿Quieres recomendar Vertial y ganar comisiones?{' '}
            <button
              onClick={() => navigate('/affiliados')}
              className="text-white font-semibold underline underline-offset-2 hover:text-blue-200 transition-colors inline-flex items-center gap-1"
            >
              <Handshake className="w-4 h-4" />
              Programa de afiliados
            </button>
          </p>
        </div>
      </section>

      {/* ───── FAQ ───── */}
      <section id="faq" className="py-20 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Preguntas frecuentes
            </h2>
            <p className="text-lg text-slate-500">Resolvemos las dudas más comunes</p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: '¿Necesito tarjeta de crédito para la prueba gratuita?',
                a: 'No. Puedes empezar a usar Vertial sin introducir ninguna tarjeta. Solo email y contraseña.',
              },
              {
                q: '¿Qué pasa después de los 30 días de prueba?',
                a: 'Podrás elegir el plan que mejor se adapte a tu negocio. Si no eliges ninguno, tu cuenta se pausará y tus datos se conservarán 90 días.',
              },
              {
                q: '¿Puedo cambiar de plan más adelante?',
                a: 'Sí, puedes cambiar de plan en cualquier momento desde tu panel de facturación. El cambio es inmediato.',
              },
              {
                q: '¿Los datos están seguros?',
                a: 'Sí. Todos los datos están cifrados, alojados en Europa y cumplimos con RGPD. Hacemos backups diarios automáticos.',
              },
              {
                q: '¿Cómo funciona la integración con ANCOVE?',
                a: 'ANCOVE es una integración opcional. Puedes conectar tu cuenta de ANCOVE desde la configuración de integraciones.',
              },
            ].map((faq, index) => (
              <div key={index} className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden hover:border-blue-200 transition-all">
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-5 flex items-center justify-between hover:bg-blue-50 transition-colors text-left gap-4"
                >
                  <span className="font-semibold text-slate-900">{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-blue-500 transition-transform flex-shrink-0 ${openFaq === index ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-5 text-slate-600 border-t border-blue-100 pt-4 leading-relaxed text-sm">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── CONTACTO ───── */}
      <section id="contacto" className="py-20 px-6 bg-gradient-to-br from-blue-50 to-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            ¿Necesitas ayuda?
          </h2>
          <p className="text-lg text-slate-500 mb-10">
            Nuestro equipo está aquí para ayudarte
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border-2 border-blue-100 rounded-2xl p-8 hover:shadow-xl hover:shadow-blue-100 hover:-translate-y-1 transition-all group">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                <PhoneCall className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">Llámanos</h3>
              <p className="text-slate-500 text-sm mb-4">Lunes a viernes de 9:00 a 18:00</p>
              <a href="tel:+34647779812" className="text-blue-600 hover:text-blue-700 font-bold text-lg transition-colors">
                +34 647 77 98 12
              </a>
            </div>

            <div className="bg-white border-2 border-blue-100 rounded-2xl p-8 hover:shadow-xl hover:shadow-blue-100 hover:-translate-y-1 transition-all group">
              <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">Escríbenos</h3>
              <p className="text-slate-500 text-sm mb-4">Respondemos en menos de 24h</p>
              <a href="mailto:hola@vertialapp.com" className="text-blue-600 hover:text-blue-700 font-bold text-lg transition-colors">
                hola@vertialapp.com
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ───── PROGRAMA DE AFILIADOS ───── */}
      <section className="py-20 px-6 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-full mb-5">
                <Handshake className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-blue-300">Programa de afiliados</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4 leading-tight">
                ¿Conoces negocios que<br />
                <span className="bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent">podrían beneficiarse de Vertial?</span>
              </h2>
              <p className="text-lg text-slate-300 mb-8 max-w-xl">
                Únete a nuestro programa de afiliados y gana comisiones recurrentes por cada cliente que traigas. Sin límite de ingresos, con soporte dedicado.
              </p>
              <div className="flex flex-col sm:flex-row items-center lg:items-start gap-4">
                <button
                  onClick={() => navigate('/affiliados')}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 flex items-center gap-2"
                >
                  <Handshake className="w-5 h-5" />
                  Solicitar afiliación
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="text-sm text-slate-400">Sin coste · Sin permanencia</span>
              </div>
            </div>
            <div className="flex-shrink-0 grid grid-cols-2 gap-4 w-full lg:w-auto">
              {[
                { icon: TrendingUp, label: 'Comisiones recurrentes', desc: 'Gana mes a mes por cada cliente activo' },
                { icon: Users, label: 'Red de contactos', desc: 'Aprovecha tus relaciones profesionales' },
                { icon: Shield, label: 'Soporte exclusivo', desc: 'Equipo dedicado solo para afiliados' },
                { icon: Award, label: 'Sin límite de ingresos', desc: 'Cuantos más clientes, más ganas' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
                  <div className="w-9 h-9 bg-blue-600/30 rounded-xl flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <p className="font-semibold text-white text-sm mb-1">{label}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <ModalComingSoon
        isOpen={showComingSoonModal}
        onClose={() => setShowComingSoonModal(false)}
        verticalName={comingSoonVertical}
      />

      <ModuleImageModal
        isOpen={moduleModal.isOpen}
        onClose={() => setModuleModal({ isOpen: false, title: '' })}
        title={moduleModal.title}
        imageSrc={moduleModal.imageSrc}
      />
    </div>
  );
}
