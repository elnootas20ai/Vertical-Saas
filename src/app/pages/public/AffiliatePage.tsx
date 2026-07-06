import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, ArrowRight, Check, Users, Handshake, TrendingUp, Shield,
  User, Mail, Phone, Building2, Globe, MessageSquare, ChevronRight,
  CheckCircle, AlertCircle, Loader2, Star, Zap, BarChart3, DollarSign,
  Gift, Rocket, HeadphonesIcon, Copy, BadgePercent, LogIn,
} from 'lucide-react';
import { getApiBase } from '../../lib/apiBase';
import { listAffiliateVerticals, DEFAULT_AFFILIATE_COMMISSION_RATE } from '../../lib/affiliatesApi';
import { AUTH_PATHS } from '../../lib/authEntryPaths';

const STEPS = [
  { icon: Rocket, title: 'Solicita tu acceso', desc: 'Rellena el formulario con tus datos. En menos de 48h tendrás tu código de afiliado.' },
  { icon: Gift, title: 'Comparte tu código', desc: 'Recibe tu código único y compártelo con negocios de tu red de contactos.' },
  { icon: Users, title: 'Registra clientes', desc: 'Desde tu panel de afiliado, da de alta a los clientes que refieran a Vertial.' },
  { icon: DollarSign, title: 'Cobra comisiones', desc: 'Gana comisiones recurrentes cada mes por cada cliente activo. Sin límite.' },
];

const BENEFITS = [
  { icon: TrendingUp, title: 'Comisiones recurrentes', desc: 'Gana un % mensual por cada cliente activo que refieras. Ingresos pasivos todos los meses.' },
  { icon: BarChart3, title: 'Panel en tiempo real', desc: 'Accede a tu dashboard exclusivo: clientes, ganancias, estado de pagos, todo bajo control.' },
  { icon: Shield, title: 'Soporte dedicado', desc: 'Equipo exclusivo para afiliados que te ayuda a cerrar ventas y resolver dudas.' },
  { icon: Handshake, title: 'Materiales de venta', desc: 'Kit comercial con demos, presentaciones y recursos para que vendas sin esfuerzo.' },
  { icon: BadgePercent, title: 'Comisiones flexibles', desc: 'El porcentaje se adapta a tu volumen. Cuantos más clientes traigas, más ganas.' },
  { icon: HeadphonesIcon, title: 'Formación continua', desc: 'Webinars, guías y sesiones 1:1 para que domines el producto y multipliques ventas.' },
];

const TESTIMONIALS = [
  { name: 'Carlos M.', role: 'Consultor de Automoción', quote: 'En 3 meses ya estoy facturando comisiones recurrentes. El panel es muy fácil de usar.', stars: 5 },
  { name: 'Laura S.', role: 'Comercial Freelance', quote: 'Lo mejor es que no tengo que dar soporte técnico. Refiero y cobro. Así de simple.', stars: 5 },
  { name: 'Pedro F.', role: 'Agencia Digital', quote: 'He referido 12 clientes en 6 meses. Las comisiones llegan puntuales cada mes.', stars: 5 },
];

const FAQ = [
  { q: '¿Cuánto puedo ganar?', a: `No hay límite. Cuantos más clientes activos refieras, más comisiones mensuales recibes. El porcentaje base es del ${DEFAULT_AFFILIATE_COMMISSION_RATE}% y puede aumentar según tu volumen.` },
  { q: '¿Necesito conocimientos técnicos?', a: 'No. Te damos todos los materiales y formación. Solo necesitas tener red de contactos en sectores como automoción, fitness, hostelería, etc.' },
  { q: '¿Cuándo cobro mis comisiones?', a: 'Las comisiones se liquidan mensualmente. Podrás ver el estado de cada una en tu panel de afiliado.' },
  { q: '¿Puedo ser afiliado desde cualquier país?', a: 'Sí, el programa está abierto a nivel internacional. Solo necesitas poder facturar legalmente.' },
  { q: '¿Cómo funciona el código de afiliado?', a: 'Al ser aceptado recibes un código único (ej: AFF-A7K2). Con él accedes a tu panel, registras clientes y haces seguimiento de todo.' },
];

const API_BASE = getApiBase();

const SCROLL_HEADER_OFFSET = 72;

function scrollToPageSection(sectionId: string) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_HEADER_OFFSET;
  window.scrollTo({ top, behavior: 'smooth' });
}

type FormState = 'idle' | 'loading' | 'success' | 'error';

interface FormData {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  company: string;
  website: string;
  verticals: string[];
  message: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  verticals?: string;
}

export function AffiliatePage() {
  const navigate = useNavigate();
  const [verticalOptions, setVerticalOptions] = useState<string[]>([]);
  const [verticalsLoadError, setVerticalsLoadError] = useState(false);
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [sameAsPhone, setSameAsPhone] = useState(true);

  const [form, setForm] = useState<FormData>({
    name: '', email: '', phone: '', whatsapp: '',
    company: '', website: '', verticals: [], message: '',
  });

  useEffect(() => {
    listAffiliateVerticals()
      .then((verticals) => {
        setVerticalOptions(verticals);
        setVerticalsLoadError(false);
      })
      .catch(() => {
        setVerticalOptions([]);
        setVerticalsLoadError(true);
      });
  }, []);

  const toggleVertical = (v: string) => {
    setForm((prev) => ({
      ...prev,
      verticals: prev.verticals.includes(v) ? prev.verticals.filter((x) => x !== v) : [...prev.verticals, v],
    }));
    if (fieldErrors.verticals) setFieldErrors((p) => ({ ...p, verticals: undefined }));
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!form.name.trim() || form.name.trim().length < 2) errors.name = 'El nombre es obligatorio (mínimo 2 caracteres).';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email || !emailRegex.test(form.email)) errors.email = 'Introduce un email válido.';
    if (!form.phone.trim() || form.phone.trim().length < 6) errors.phone = 'El teléfono es obligatorio.';
    if (form.verticals.length === 0) errors.verticals = 'Selecciona al menos una vertical.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setFormState('loading');
    setErrorMsg('');
    try {
      const payload = { ...form, whatsapp: sameAsPhone ? form.phone : form.whatsapp };
      const res = await fetch(`${API_BASE}/api/affiliate/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) setFormState('success');
      else { setFormState('error'); setErrorMsg(data.error || 'No se pudo enviar la solicitud.'); }
    } catch {
      setFormState('error');
      setErrorMsg('Error de conexión. Inténtalo de nuevo.');
    }
  };

  if (formState === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 ring-4 ring-emerald-500/10">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">¡Solicitud enviada!</h2>
          <p className="text-blue-200/80 mb-3 text-lg leading-relaxed">
            Hemos recibido tu solicitud de afiliación.
          </p>
          <p className="text-blue-300/60 mb-10 text-sm">
            Nuestro equipo la revisará y se pondrá en contacto contigo en un plazo de 48 horas con tu código de afiliado.
          </p>
          <div className="flex flex-col gap-3">
            <button onClick={() => navigate('/')}
              className="px-8 py-3.5 bg-white text-slate-900 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl">
              Volver al inicio
            </button>
            <button onClick={() => setFormState('idle')}
              className="px-8 py-3 text-blue-300 font-medium hover:text-white transition-colors text-sm">
              Enviar otra solicitud
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white scroll-smooth">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium text-sm">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <span className="text-xl font-black text-slate-900 tracking-tight">Vertial</span>
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.companyLogin)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Ya soy cliente
            </button>
            <button
              type="button"
              onClick={() => scrollToPageSection('formulario')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Unirme ahora <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(59,130,246,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.2) 0%, transparent 50%)' }} />
        <div className="relative max-w-5xl mx-auto px-6 py-20 lg:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur border border-white/20 rounded-full mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold text-blue-100">Programa de afiliados abierto</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-[1.1] tracking-tight">
            Gana dinero recomendando
            <span className="block bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
              Vertial
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-blue-200/80 max-w-2xl mx-auto mb-10 leading-relaxed">
            Únete a nuestra red de afiliados y genera ingresos recurrentes cada mes presentando nuestro SaaS a negocios de tu sector. Sin inversión, sin riesgo.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#formulario"
              className="px-8 py-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl shadow-black/20 text-lg flex items-center gap-2">
              Solicitar acceso <ArrowRight className="w-5 h-5" />
            </a>
            <button
              type="button"
              onClick={() => scrollToPageSection('como-funciona')}
              className="px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 transition-all text-lg"
            >
              ¿Cómo funciona?
            </button>
          </div>
          <div className="flex items-center justify-center gap-8 mt-12 text-blue-200/60 text-sm">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Sin inversión</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Comisiones recurrentes</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Panel exclusivo</span>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-blue-600 font-bold text-sm uppercase tracking-widest">Cómo funciona</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3">4 pasos para empezar a ganar</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="relative bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group">
                <div className="absolute -top-3 -left-1 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-600/30">
                  {i + 1}
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500/10 to-violet-500/10 rounded-xl flex items-center justify-center mb-4 mt-2 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Beneficios ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-violet-600 font-bold text-sm uppercase tracking-widest">Ventajas</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3">¿Por qué ser afiliado de Vertial?</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-md transition-all">
                <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-600/20">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Panel preview ── */}
      <section className="py-20 px-6 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-blue-400 font-bold text-sm uppercase tracking-widest">Tu panel de afiliado</span>
            <h2 className="text-3xl sm:text-4xl font-black mt-3">Todo bajo control en un solo lugar</h2>
            <p className="text-blue-200/70 mt-4 max-w-xl mx-auto">
              Accede con tu código único y gestiona clientes, seguimiento y cobros desde un panel intuitivo.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 max-w-3xl mx-auto">
            <div className="grid sm:grid-cols-3 gap-6 mb-8">
              {[
                { label: 'Clientes activos', value: '12', color: 'text-blue-400' },
                { label: 'Comisión pendiente', value: '840 €', color: 'text-amber-400' },
                { label: 'Total cobrado', value: '3.240 €', color: 'text-emerald-400' },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 rounded-xl p-4 text-center">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-sm text-blue-200/60 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {['Antonio Ruiz — Lead activo', 'Sofía Castro — Cliente SaaS firmado', 'Miguel Torres — En seguimiento'].map((c, i) => (
                <div key={c} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {c[0]}
                  </div>
                  <span className="text-sm text-blue-100">{c}</span>
                  {i === 1 && (
                    <span className="ml-auto text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">FIRMADO</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-blue-300/60">
              <Copy className="w-4 h-4" />
              <span>Tu código: <strong className="text-white font-mono">AFF-A7K2</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonios ── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-emerald-600 font-bold text-sm uppercase tracking-widest">Testimonios</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3">Lo que dicen nuestros afiliados</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ name, role, quote, stars }) => (
              <div key={name} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4 italic">"{quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
                    {name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{name}</p>
                    <p className="text-xs text-slate-400">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Formulario ── */}
      <section id="formulario" className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-blue-600 font-bold text-sm uppercase tracking-widest">Únete ahora</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3">Solicita tu código de afiliado</h2>
            <p className="text-slate-500 mt-3">Rellena el formulario y te contactaremos en menos de 48 horas con tu acceso.</p>
          </div>

          <div className="mb-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.companyLogin)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-800 text-sm font-semibold hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <LogIn className="w-4 h-4 text-blue-600" />
              Ya soy cliente
              <span className="text-slate-400 font-normal hidden sm:inline">— acceder al panel</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.affiliatePortal)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-violet-200 bg-violet-50 text-violet-800 text-sm font-semibold hover:bg-violet-100 transition-colors"
            >
              <Handshake className="w-4 h-4" />
              Ya soy afiliado
              <span className="text-violet-500/80 font-normal hidden sm:inline">— tengo código</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Datos personales */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" /> Datos personales
              </h3>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nombre completo <span className="text-red-500">*</span>
                </label>
                <input type="text" value={form.name}
                  onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined })); }}
                  placeholder="Ej. María García López"
                  className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.name ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`} />
                {fieldErrors.name && <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fieldErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" value={form.email}
                    onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined })); }}
                    placeholder="tu@email.com"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.email ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`} />
                </div>
                {fieldErrors.email && <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fieldErrors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Teléfono <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="tel" value={form.phone}
                    onChange={(e) => { setForm((p) => ({ ...p, phone: e.target.value })); if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: undefined })); }}
                    placeholder="+34 600 000 000"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.phone ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`} />
                </div>
                {fieldErrors.phone && <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fieldErrors.phone}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">WhatsApp</label>
                  <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={sameAsPhone} onChange={(e) => setSameAsPhone(e.target.checked)} className="rounded w-3.5 h-3.5 text-blue-600" />
                    Mismo que teléfono
                  </label>
                </div>
                {!sameAsPhone && (
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                    <input type="tel" value={form.whatsapp}
                      onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
                      placeholder="+34 600 000 000"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Empresa <span className="text-xs font-normal text-slate-400">(opcional)</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={form.company}
                      onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                      placeholder="Tu empresa SL"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Web <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="url" value={form.website}
                      onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                      placeholder="https://tuempresa.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Verticales */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-1.5">
                <Zap className="w-4 h-4 text-violet-600" />
                Sectores que deseas ofrecer <span className="text-red-500">*</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">Selecciona los sectores en los que tienes contactos o experiencia.</p>
              {verticalsLoadError ? (
                <div className="flex items-start gap-2 text-amber-800 text-sm py-4 px-3 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>No se pudieron cargar los sectores. Comprueba que el backend está en marcha y recarga la página. Si usas otro puerto de desarrollo, revisa CORS / proxy en Vite.</span>
                </div>
              ) : verticalOptions.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {verticalOptions.map((v) => {
                    const selected = form.verticals.includes(v);
                    return (
                      <button key={v} type="button" onClick={() => toggleVertical(v)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {v}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando opciones...
                </div>
              )}
              {fieldErrors.verticals && <p className="mt-3 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fieldErrors.verticals}</p>}
            </div>

            {/* Mensaje */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                Mensaje adicional <span className="text-xs font-normal text-slate-400 ml-1">(opcional)</span>
              </h3>
              <textarea value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                rows={4}
                placeholder="Cuéntanos sobre tu experiencia, red de contactos o cualquier detalle relevante..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {formState === 'error' && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button type="submit" disabled={formState === 'loading'}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 disabled:from-blue-400 disabled:to-violet-400 text-white font-bold rounded-xl transition-all shadow-xl shadow-blue-600/25 hover:shadow-2xl hover:shadow-blue-600/30 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2 text-lg">
              {formState === 'loading' ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Enviando solicitud...</>
              ) : (
                <>Enviar solicitud de afiliación <ChevronRight className="w-5 h-5" /></>
              )}
            </button>

            <p className="text-center text-xs text-slate-400">
              Al enviar este formulario aceptas que Vertial procese tus datos para gestionar tu solicitud de afiliación.
            </p>
          </form>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-blue-600 font-bold text-sm uppercase tracking-widest">FAQ</span>
            <h2 className="text-3xl font-black text-slate-900 mt-3">Preguntas frecuentes</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map(({ q, a }, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left">
                  <span className="font-semibold text-slate-900 text-sm">{q}</span>
                  <ChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="py-20 px-6 bg-gradient-to-br from-blue-600 to-violet-700 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">¿Listo para empezar a ganar?</h2>
          <p className="text-blue-100/80 text-lg mb-8">Solicita tu código de afiliado y empieza a generar ingresos recurrentes hoy mismo.</p>
          <a href="#formulario"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl text-lg">
            Solicitar mi código <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* ── Footer mini ── */}
      <footer className="py-8 px-6 bg-slate-900 text-center">
        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} Vertial. Programa de afiliados.
        </p>
      </footer>
    </div>
  );
}
