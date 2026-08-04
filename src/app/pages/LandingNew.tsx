import { useNavigate } from 'react-router';
import {
  ArrowRight, Award, BarChart3, Bell, Building2, Car, Check, ChevronDown, Clock,
  Code, DollarSign, FileText, Handshake, Layers, Lock, Mail, MapPin, Monitor,
  Package, Shield, ShoppingCart, Sparkles, Star, Target, TrendingUp,
  Truck, Users, Webhook, Wrench, Zap, UtensilsCrossed,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { BrowserFrame } from '../components/landing/BrowserFrame';
import { ModalComingSoon } from '../components/landing/ModalComingSoon';
import { LandingAnalytics, trackLandingCta } from '../components/landing/LandingAnalytics';
import { AUTH_PATHS } from '../lib/authEntryPaths';
import '../../styles/landing.css';

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

const VERTICAL_ICONS = [Car, UtensilsCrossed, Truck, Wrench, ShoppingCart] as const;
const BENTO_ICONS = [Layers, BarChart3, Users, Package, Monitor, Shield, Bell, Zap] as const;
const STAT_ICONS = [Building2, Zap, Shield, Clock] as const;
const STEP_ICONS = [Building2, Target, Zap, Sparkles, TrendingUp] as const;
const STEP_SPANS = [
  'lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-2 lg:col-start-2',
  'lg:col-span-2',
] as const;
const CHIP_ICONS = [FileText, MapPin, Users, TrendingUp] as const;
const INTEGRATION_ICONS = [Building2, Code, Webhook, Mail] as const;

export function LandingNew() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
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
    const timer = setInterval(() => setHeroMetric((m) => (m + 1) % 3), 3200);
    return () => clearInterval(timer);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const heroCaptions = t('landing.hero.captions', { returnObjects: true }) as string[];
  const heroTabs = t('landing.hero.tabs', { returnObjects: true }) as string[];
  const heroPerks = t('landing.hero.perks', { returnObjects: true }) as string[];
  const marquee = t('landing.marquee', { returnObjects: true }) as string[];
  const stats = t('landing.stats', { returnObjects: true }) as { value: string; label: string }[];
  const whyCards = t('landing.why.cards', { returnObjects: true }) as { title: string; desc: string }[];
  const whyTags = t('landing.why.tags', { returnObjects: true }) as string[];
  const verticalItems = t('landing.verticals.items', { returnObjects: true }) as { name: string; desc: string }[];
  const howSteps = t('landing.how.steps', { returnObjects: true }) as { title: string; desc: string }[];
  const howChips = t('landing.how.chips', { returnObjects: true }) as string[];
  const integrationItems = t('landing.integrations.items', { returnObjects: true }) as { title: string; desc: string; tag: string }[];
  const pricingPlans = t('landing.pricing.plans', { returnObjects: true }) as {
    name: string;
    desc: string;
    features: string[];
    cta: string;
  }[];
  const testimonials = t('landing.testimonials.items', { returnObjects: true }) as {
    quote: string;
    name: string;
    role: string;
    initial: string;
  }[];
  const faqItems = t('landing.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  const affiliatePerks = t('landing.contact.affiliatesPerks', { returnObjects: true }) as string[];

  const verticalLive = [true, true, true, true, false];

  const planPrices = useMemo(
    () => [
      { monthly: '50€', yearly: '40€', yearlyTotal: '480€' },
      { monthly: '150€', yearly: '120€', yearlyTotal: '1.440€' },
      { monthly: '350€', yearly: '280€', yearlyTotal: '3.360€' },
    ],
    [],
  );

  // Re-render arrays when language changes
  void i18n.language;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-[Plus_Jakarta_Sans,system-ui,sans-serif] antialiased">
      <LandingAnalytics />
      <Header landingDark />

      <section className="relative min-h-[100svh] flex flex-col overflow-hidden vertial-hero-mesh">
        <div className="absolute inset-0 vertial-grid-lines pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 pt-28 pb-16 flex-1 flex flex-col justify-center relative z-10">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-zinc-300 mb-8">
                <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                {t('landing.hero.badge')}
              </div>

              <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-300/90 mb-3">{t('landing.hero.brand')}</p>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6">
                {t('landing.hero.title1')}
                <br />
                {t('landing.hero.title2')}
                <br />
                <span className="vertial-text-gradient">{t('landing.hero.titleAccent')}</span>
              </h1>
              <p className="text-lg text-zinc-400 max-w-lg mb-8 leading-relaxed">
                {t('landing.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    trackLandingCta('cta_register');
                    navigate(AUTH_PATHS.register, { state: { accountType: 'company' } });
                  }}
                  className="px-8 py-4 vertial-glow-btn text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-blue-950/40 hover:opacity-95 transition-opacity"
                >
                  {t('landing.hero.ctaTrial')}
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    trackLandingCta('cta_sales');
                    navigate('/affiliados');
                  }}
                  className="px-8 py-4 rounded-2xl border border-zinc-600 text-zinc-200 font-semibold hover:bg-white/5 hover:border-zinc-500 transition-colors"
                >
                  {t('landing.hero.ctaAffiliate')}
                </button>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
                {(Array.isArray(heroPerks) ? heroPerks : []).map((perk) => (
                  <span key={perk} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-400" />
                    {perk}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-6 -left-4 z-20 vertial-float hidden sm:block">
                <div className="vertial-bento-card rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs font-semibold text-zinc-200">{t('landing.hero.opsToday')}</span>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-2 z-20 vertial-float-delayed hidden sm:block">
                <div className="vertial-bento-card rounded-2xl px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t('landing.hero.avgMargin')}</p>
                  <p className="text-lg font-bold text-blue-300">+18,4%</p>
                </div>
              </div>

              <BrowserFrame dark className="shadow-[0_40px_80px_rgba(0,0,0,0.55)] border border-zinc-800">
                <div className="p-5 bg-zinc-900 min-h-[280px]">
                  <div className="flex gap-2 mb-4">
                    {(Array.isArray(heroTabs) ? heroTabs : []).map((tab, i) => (
                      <div
                        key={tab}
                        className={`h-7 px-3 rounded-lg text-xs font-medium flex items-center ${
                          heroMetric === i ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {tab}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[Package, Users, DollarSign].map((Icon, i) => (
                      <div key={i} className={`rounded-xl p-3 border ${heroMetric === i ? 'border-blue-500/40 bg-blue-500/10' : 'border-zinc-800 bg-zinc-800/50'}`}>
                        <Icon className={`w-5 h-5 mb-2 ${heroMetric === i ? 'text-blue-300' : 'text-zinc-500'}`} />
                        <div className="h-2 bg-zinc-700 rounded w-full mb-1" />
                        <div className="h-2 bg-zinc-700 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((row) => (
                      <div key={row} className="flex gap-2 items-center">
                        <div className={`h-2 rounded flex-1 ${row === 2 ? 'bg-blue-500/60' : 'bg-zinc-800'}`} />
                        <div className="h-2 bg-zinc-800 rounded w-12" />
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-xs text-blue-300/80 font-medium mt-4">
                    {Array.isArray(heroCaptions) ? heroCaptions[heroMetric] : ''}
                  </p>
                </div>
              </BrowserFrame>
            </div>
          </div>
        </div>

        <div className="border-y border-white/5 bg-zinc-950/80 overflow-hidden py-4">
          <div className="flex vertial-marquee-track whitespace-nowrap">
            {[...(Array.isArray(marquee) ? marquee : []), ...(Array.isArray(marquee) ? marquee : [])].map((item, i) => (
              <span key={`${item}-${i}`} className="mx-6 text-sm font-semibold text-zinc-600 flex items-center gap-6">
                {item}
                <span className="w-1 h-1 rounded-full bg-blue-500/50" />
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-zinc-950 border-b border-zinc-800/80">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(Array.isArray(stats) ? stats : []).map((stat, idx) => {
              const Icon = STAT_ICONS[idx] || Building2;
              return (
                <div key={stat.label} className="vertial-bento-card vertial-card-lift rounded-2xl p-6 text-center">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-blue-300" />
                  </div>
                  <p className="text-lg font-extrabold text-white mb-1">{stat.value}</p>
                  <p className="text-xs text-zinc-500 font-medium">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="modulos" className="py-24 px-6 bg-zinc-950 relative">
        <div className="absolute top-0 left-0 right-0 vertial-section-divider" />
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow={t('landing.why.eyebrow')}
            title={(
              <>
                {t('landing.why.titleBefore')}
                <span className="vertial-text-gradient">{t('landing.why.titleAccent')}</span>
              </>
            )}
            subtitle={t('landing.why.subtitle')}
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Array.isArray(whyCards) ? whyCards : []).map((card, idx) => {
              const Icon = BENTO_ICONS[idx] || Layers;
              const large = idx === 0;
              const span = idx === 0 ? 'lg:col-span-2 lg:row-span-2' : idx === 7 ? 'lg:col-span-2' : '';
              return (
                <div
                  key={card.title}
                  className={`vertial-bento-card vertial-card-lift rounded-2xl p-6 ${span} ${large ? 'flex flex-col justify-between min-h-[240px]' : ''}`}
                >
                  <div>
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-blue-300" />
                    </div>
                    <h3 className={`font-bold text-white mb-2 ${large ? 'text-2xl' : 'text-lg'}`}>{card.title}</h3>
                    <p className={`text-zinc-400 leading-relaxed ${large ? 'text-base' : 'text-sm'}`}>{card.desc}</p>
                  </div>
                  {large && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {(Array.isArray(whyTags) ? whyTags : []).map((tag) => (
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

      <section id="verticales" className="py-24 px-6 bg-zinc-900/40 border-y border-zinc-800 relative overflow-hidden">
        <div className="absolute -right-32 top-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto relative">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
            <SectionHeader
              align="left"
              className="!mb-0"
              eyebrow={t('landing.verticals.eyebrow')}
              title={t('landing.verticals.title')}
              subtitle={t('landing.verticals.subtitle')}
            />
            <button type="button" onClick={() => scrollTo('planes')} className="text-blue-300 font-semibold flex items-center gap-1 hover:gap-2 transition-all shrink-0 pb-1">
              {t('landing.verticals.seePlans')} <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {(Array.isArray(verticalItems) ? verticalItems : []).map((v, idx) => {
              const Icon = VERTICAL_ICONS[idx] || Car;
              const live = verticalLive[idx] ?? false;
              return (
                <div
                  key={v.name}
                  className={`vertial-card-lift rounded-2xl p-6 border relative overflow-hidden ${
                    live
                      ? 'vertial-bento-card hover:border-blue-500/35'
                      : 'bg-zinc-950/60 border-zinc-800/80 opacity-75'
                  }`}
                >
                  {live && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500" />}
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    {live ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-full">
                        {t('landing.verticals.active')}
                      </span>
                    ) : (
                      <Lock className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{v.name}</h3>
                  <p className="text-sm text-zinc-400 mb-6 leading-relaxed min-h-[3.5rem]">{v.desc}</p>
                  <button
                    type="button"
                    onClick={() => (live ? scrollTo('como-funciona') : (setComingSoonVertical(v.name), setShowComingSoonModal(true)))}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                      live
                        ? 'bg-white text-zinc-900 hover:bg-zinc-100 shadow-md shadow-black/20'
                        : 'border border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {live ? t('landing.verticals.seeHow') : t('landing.verticals.soon')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="py-24 px-6 bg-zinc-950">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow={t('landing.how.eyebrow')}
            title={t('landing.how.title')}
            subtitle={t('landing.how.subtitle')}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
            {(Array.isArray(howSteps) ? howSteps : []).map((step, idx) => {
              const Icon = STEP_ICONS[idx] || Building2;
              const n = String(idx + 1).padStart(2, '0');
              return (
                <div key={step.title} className={`vertial-bento-card vertial-card-lift rounded-2xl p-8 relative ${STEP_SPANS[idx] || 'lg:col-span-2'}`}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/20 to-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <Icon className="w-7 h-7 text-blue-300" />
                    </div>
                    <span className="text-3xl font-black text-zinc-700">{n}</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Array.isArray(howChips) ? howChips : []).map((label, idx) => {
              const Icon = CHIP_ICONS[idx] || FileText;
              return (
                <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/40">
                  <Icon className="w-5 h-5 text-teal-400 shrink-0" />
                  <span className="text-sm font-medium text-zinc-300">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="integraciones" className="py-24 px-6 relative overflow-hidden border-t border-zinc-800">
        <div className="absolute inset-0 vertial-hero-mesh opacity-40" />
        <div className="max-w-6xl mx-auto relative">
          <SectionHeader
            eyebrow={t('landing.integrations.eyebrow')}
            title={t('landing.integrations.title')}
            subtitle={t('landing.integrations.subtitle')}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Array.isArray(integrationItems) ? integrationItems : []).map((item, idx) => {
              const Icon = INTEGRATION_ICONS[idx] || Building2;
              return (
                <div key={item.title} className="vertial-bento-card vertial-card-lift rounded-2xl p-6 relative">
                  <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full">
                    {item.tag}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-blue-300" />
                  </div>
                  <h3 className="font-bold text-white text-lg">{item.title}</h3>
                  <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="planes" className="py-24 px-6 bg-zinc-950 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow={t('landing.pricing.eyebrow')}
            title={t('landing.pricing.title')}
            subtitle={t('landing.pricing.subtitle')}
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
                  {p === 'monthly' ? t('landing.pricing.monthly') : t('landing.pricing.yearly')}
                  {p === 'yearly' && (
                    <span className={`ml-1.5 text-xs font-bold ${pricingPeriod === 'yearly' ? 'text-white/90' : 'text-teal-400'}`}>
                      -20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 items-stretch mb-8">
            {(Array.isArray(pricingPlans) ? pricingPlans : []).map((plan, idx) => {
              const prices = planPrices[idx] || planPrices[0];
              const price = pricingPeriod === 'monthly' ? prices.monthly : prices.yearly;
              const primary = idx === 1;
              const sales = idx === 2;
              return (
                <div
                  key={plan.name}
                  className={`vertial-card-lift rounded-2xl p-8 border flex flex-col ${
                    primary
                      ? 'vertial-pricing-glow border-blue-500/40 bg-gradient-to-b from-blue-950/50 via-zinc-900 to-zinc-950 lg:-mt-2 lg:mb-2'
                      : 'vertial-bento-card border-zinc-800'
                  }`}
                >
                  {primary && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-300 mb-4 w-fit px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                      <Star className="w-3.5 h-3.5 fill-blue-300 text-blue-300" /> {t('landing.pricing.mostPopular')}
                    </span>
                  )}
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">{plan.name}</h3>
                  <div className="mt-2 mb-1">
                    <span className="text-4xl lg:text-5xl font-extrabold text-white">{price}</span>
                    <span className="text-zinc-500 text-sm ml-1">{t('landing.pricing.perMonth')}</span>
                  </div>
                  {pricingPeriod === 'yearly' && (
                    <p className="text-xs text-blue-300/80 font-medium mb-1">
                      {t('landing.pricing.yearlyBilled', { amount: prices.yearlyTotal })}
                    </p>
                  )}
                  <p className="text-sm text-zinc-400 mb-6">{plan.desc}</p>
                  <ul className="space-y-3 mb-8 flex-1">
                    {(plan.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                        <span className="w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-blue-300" />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      if (sales) {
                        trackLandingCta('cta_sales');
                        scrollTo('contacto');
                      } else {
                        trackLandingCta('cta_plan');
                        navigate(AUTH_PATHS.register, { state: { accountType: 'company' } });
                      }
                    }}
                    className={`w-full py-3.5 rounded-xl font-bold transition-all ${
                      primary
                        ? 'vertial-glow-btn text-white shadow-lg'
                        : sales
                          ? 'border border-blue-500/40 text-blue-200 hover:bg-blue-500/10'
                          : 'bg-white text-zinc-900 hover:bg-zinc-100'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="vertial-bento-card rounded-2xl px-6 py-4 max-w-2xl mx-auto text-center">
            <p className="text-sm text-zinc-400">
              <span className="text-white font-semibold">{t('landing.pricing.licenseNoteBold')}</span>
              {t('landing.pricing.licenseNote')}
            </p>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-zinc-900/30 border-y border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            eyebrow={t('landing.testimonials.eyebrow')}
            title={(
              <>
                {t('landing.testimonials.titleBefore')}
                <span className="vertial-text-gradient">{t('landing.testimonials.titleAccent')}</span>
              </>
            )}
            subtitle={t('landing.testimonials.subtitle')}
          />
          <div className="grid md:grid-cols-3 gap-6">
            {(Array.isArray(testimonials) ? testimonials : []).map((item) => (
              <div key={item.name} className="vertial-bento-card vertial-card-lift rounded-2xl p-8 flex flex-col">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <QuoteIcon />
                <p className="text-zinc-300 text-sm leading-relaxed flex-1 italic">&ldquo;{item.quote}&rdquo;</p>
                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-zinc-800">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {item.initial}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{item.name}</p>
                    <p className="text-xs text-zinc-500">{item.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 vertial-hero-mesh" />
        <div className="absolute inset-0 vertial-grid-lines opacity-60 pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="vertial-section-eyebrow mx-auto mb-6">{t('landing.finalCta.eyebrow')}</div>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
            {t('landing.finalCta.titleBefore')}
            <span className="vertial-text-gradient">{t('landing.finalCta.titleAccent')}</span>
          </h2>
          <p className="text-xl text-zinc-400 mb-10">{t('landing.finalCta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <button
              type="button"
              onClick={() => {
                trackLandingCta('cta_login');
                navigate(AUTH_PATHS.entry);
              }}
              className="px-10 py-4 vertial-glow-btn text-white font-bold rounded-2xl text-lg shadow-xl shadow-blue-950/30"
            >
              {t('landing.finalCta.startNow')}
            </button>
            <button
              type="button"
              onClick={() => {
                trackLandingCta('cta_tablet');
                navigate(AUTH_PATHS.tpvTabletLogin);
              }}
              className="px-10 py-4 rounded-2xl border border-zinc-600 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 hover:border-zinc-500 transition-colors"
            >
              <Monitor className="w-5 h-5" /> {t('landing.finalCta.tabletTpv')}
            </button>
          </div>
          <p className="text-sm text-zinc-500">
            {t('landing.finalCta.haveAccount')}{' '}
            <button
              type="button"
              onClick={() => {
                trackLandingCta('cta_worker');
                navigate(AUTH_PATHS.workerLogin);
              }}
              className="text-blue-300 font-semibold hover:underline"
            >
              {t('landing.finalCta.workerAccess')}
            </button>
          </p>
        </div>
      </section>

      <section id="faq" className="py-24 px-6 bg-zinc-950">
        <div className="max-w-3xl mx-auto">
          <SectionHeader
            eyebrow={t('landing.faq.eyebrow')}
            title={t('landing.faq.title')}
            subtitle={t('landing.faq.subtitle')}
          />
          <div className="space-y-3">
            {(Array.isArray(faqItems) ? faqItems : []).map((item, i) => (
              <div
                key={item.q}
                className={`rounded-2xl border overflow-hidden transition-colors ${
                  openFaq === i ? 'vertial-faq-open border-blue-500/30' : 'border-zinc-800 vertial-bento-card'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-semibold text-white pr-4">{item.q}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${openFaq === i ? 'rotate-180 text-blue-300' : 'text-zinc-500'}`} />
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

      <section id="contacto" className="py-24 px-6 bg-zinc-900/40 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div className="vertial-bento-card rounded-2xl p-8 lg:p-10 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <SectionHeader
                  align="left"
                  className="!mb-6"
                  eyebrow={t('landing.contact.eyebrow')}
                  title={t('landing.contact.title')}
                />
                <button
                  type="button"
                  onClick={() => navigate('/reuniones')}
                  className="w-full py-4 rounded-2xl font-extrabold vertial-glow-btn text-white flex items-center justify-center gap-2 text-lg"
                >
                  {t('landing.contact.schedule')}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="vertial-bento-card rounded-2xl p-8 lg:p-10 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <Handshake className="w-5 h-5 text-blue-300" />
                  <span className="text-sm font-bold text-blue-300 uppercase tracking-wider">{t('landing.contact.affiliates')}</span>
                </div>
                <h3 className="text-2xl font-extrabold text-white mb-3 leading-snug">
                  {t('landing.contact.affiliatesTitle')}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  {t('landing.contact.affiliatesDesc')}
                </p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {(Array.isArray(affiliatePerks) ? affiliatePerks : []).map((label, idx) => {
                    const Icon = idx === 0 ? TrendingUp : Award;
                    return (
                      <div key={label} className="flex items-center gap-2 text-xs text-zinc-400">
                        <Icon className="w-4 h-4 text-teal-400 shrink-0" />
                        {label}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/affiliados')}
                  className="w-full py-3.5 rounded-xl font-bold vertial-glow-btn text-white flex items-center justify-center gap-2"
                >
                  {t('landing.contact.requestAffiliate')}
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

function QuoteIcon() {
  return (
    <svg className="w-8 h-8 text-teal-400/30 mb-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.17 6A5.17 5.17 0 0 0 2 11.17V18h7.17v-6.83H5.83c0-1.84 1.5-3.34 3.34-3.34V6zm9.66 0A5.17 5.17 0 0 0 11.66 11.17V18H18.83v-6.83h-3.34c0-1.84 1.5-3.34 3.34-3.34V6z" />
    </svg>
  );
}
