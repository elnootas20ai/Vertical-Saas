/**
 * Textos de la web pública (landing). Se montan en i18n bajo la clave `landing`.
 * ES + EN completos; PT/FR/IT usan EN como base hasta traducción dedicada.
 */

export type LandingCopy = {
  nav: {
    product: string;
    verticals: string;
    modules: string;
    integrations: string;
    howItWorks: string;
    plans: string;
    faq: string;
    contact: string;
    startFree: string;
    start: string;
    menu: string;
  };
  hero: {
    badge: string;
    brand: string;
    title1: string;
    title2: string;
    titleAccent: string;
    subtitle: string;
    ctaTrial: string;
    ctaAffiliate: string;
    perks: string[];
    opsToday: string;
    avgMargin: string;
    tabs: string[];
    captions: string[];
  };
  marquee: string[];
  stats: { value: string; label: string }[];
  why: {
    eyebrow: string;
    titleBefore: string;
    titleAccent: string;
    subtitle: string;
    cards: { title: string; desc: string }[];
    tags: string[];
  };
  verticals: {
    eyebrow: string;
    title: string;
    subtitle: string;
    seePlans: string;
    active: string;
    seeHow: string;
    soon: string;
    items: { name: string; desc: string }[];
  };
  how: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: { title: string; desc: string }[];
    chips: string[];
  };
  integrations: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: { title: string; desc: string; tag: string }[];
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    monthly: string;
    yearly: string;
    perMonth: string;
    askPrice: string;
    mostPopular: string;
    licenseNote: string;
    licenseNoteBold: string;
    yearlyBilled: string;
    plans: {
      name: string;
      desc: string;
      features: string[];
      cta: string;
    }[];
  };
  testimonials: {
    eyebrow: string;
    titleBefore: string;
    titleAccent: string;
    subtitle: string;
    items: { quote: string; name: string; role: string; initial: string }[];
  };
  finalCta: {
    eyebrow: string;
    titleBefore: string;
    titleAccent: string;
    subtitle: string;
    startNow: string;
    tabletTpv: string;
    haveAccount: string;
    workerAccess: string;
  };
  faq: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: { q: string; a: string }[];
  };
  contact: {
    eyebrow: string;
    title: string;
    schedule: string;
    affiliates: string;
    affiliatesTitle: string;
    affiliatesDesc: string;
    affiliatesPerks: string[];
    requestAffiliate: string;
  };
  footer: {
    blurb: string;
    madeIn: string;
    product: string;
    resources: string;
    company: string;
    docs: string;
    faq: string;
    api: string;
    howItWorks: string;
    about: string;
    contact: string;
    affiliates: string;
    callUs: string;
    rights: string;
    privacy: string;
    terms: string;
    cookies: string;
    prices: string;
    verticals: string;
    modules: string;
    integrations: string;
    comingSoon: string;
    understood: string;
    comingSoonDesc: string;
  };
};

const es: LandingCopy = {
  nav: {
    product: 'Producto',
    verticals: 'Verticales',
    modules: 'Módulos',
    integrations: 'Integraciones',
    howItWorks: 'Cómo funciona',
    plans: 'Planes',
    faq: 'FAQ',
    contact: 'Contacto',
    startFree: 'Registrarse',
    start: 'Empezar',
    menu: 'Menú',
  },
  hero: {
    badge: 'Plataforma multi-vertical · Hecha en España',
    brand: 'Vertial',
    title1: 'Más tiempo,',
    title2: 'menos tareas,',
    titleAccent: 'más control',
    subtitle: 'Elimina el trabajo manual y céntrate en lo que realmente importa.',
    ctaTrial: 'Registrarse',
    ctaAffiliate: 'Hazte colaborador',
    perks: ['Alta en minutos', 'Sin permanencia', 'Soporte en español', 'Datos en Europa'],
    opsToday: '+24 ops. hoy',
    avgMargin: 'Margen medio',
    tabs: ['Operaciones', 'Stock', 'Alertas'],
    captions: [
      'Pedidos en cocina · reparto en vivo',
      'Stock y márgenes · actualización automática',
      'Equipo, permisos y alertas · un solo panel',
    ],
  },
  marquee: [
    'Compraventa', 'Delivery', 'Taller', 'TPV tablet', 'CRM', 'Finanzas',
    'Documentos', 'Equipo', 'Alertas', 'Multi-sede', 'API REST', 'Vertial',
  ],
  stats: [
    { value: 'Multi-vertical', label: 'Un core, varias operativas' },
    { value: 'Tiempo real', label: 'Datos conectados al panel' },
    { value: 'RGPD', label: 'Datos alojados en Europa' },
    { value: '24/7', label: 'Plataforma siempre disponible' },
  ],
  why: {
    eyebrow: 'Por qué Vertial',
    titleBefore: 'El sistema operativo ',
    titleAccent: 'de tu negocio',
    subtitle:
      'No es otro Excel con login. Es el núcleo operativo de tu empresa — diseñado para escalar por vertical sin empezar de cero.',
    cards: [
      { title: 'Un motor, muchas verticales', desc: 'Misma plataforma, distinta operativa. Sin duplicar sistemas.' },
      { title: 'Dashboard en vivo', desc: 'KPIs, alertas y actividad del día conectados a tus datos.' },
      { title: 'CRM unificado', desc: 'Clientes, historial y segmentación en un solo sitio.' },
      { title: 'Stock & operaciones', desc: 'Inventario, pipeline y trazabilidad de punta a punta.' },
      { title: 'TPV en tablet', desc: 'Caja, consumo de equipo y turnos listos para el mostrador.' },
      { title: 'Seguro en Europa', desc: 'RGPD, permisos granulares y backups automáticos.' },
      { title: 'Centro de alertas', desc: 'Push, email e in-app configurables por rol.' },
      { title: 'Eficiencia', desc: 'Menos trabajo manual, más control. Céntrate en lo que importa.' },
    ],
    tags: ['Core', 'Motor ops', 'Config vertical'],
  },
  verticals: {
    eyebrow: 'Multi-vertical',
    title: 'Elige tu operativa',
    subtitle: 'Misma plataforma Vertial, distinto negocio. Activa la vertical que encaje contigo.',
    seePlans: 'Ver planes',
    active: 'Activo',
    seeHow: 'Ver cómo funciona',
    soon: 'Próximamente',
    items: [
      { name: 'Compraventa', desc: 'Stock, operaciones, documentos y márgenes en tiempo real.' },
      { name: 'Restauración', desc: 'Bar, restaurante, TPV en tablet, cocina y comandas en sala.' },
      { name: 'Delivery', desc: 'Pedidos a domicilio, reparto, cocina y fidelización de clientes.' },
      { name: 'Taller', desc: 'Órdenes de trabajo, recambios y seguimiento de reparaciones.' },
      { name: 'Retail', desc: 'Puntos de venta y catálogo para comercio minorista.' },
    ],
  },
  how: {
    eyebrow: 'Implementación',
    title: 'En marcha en minutos',
    subtitle: 'Cinco claves para tener Vertial operando en tu empresa, con datos reales desde el primer día.',
    steps: [
      { title: 'Crea tu espacio', desc: 'Regístrate, elige vertical y configura tu negocio con el asistente de alta.' },
      { title: 'Conecta tu operativa', desc: 'Stock, pedidos o vehículos: importa datos o empieza desde cero con plantillas.' },
      { title: 'Controla con datos reales', desc: 'Dashboard, alertas y equipo trabajando sobre la misma fuente de verdad.' },
      { title: 'Tranquilidad', desc: 'Todo organizado, sin estrés ni caos.' },
      { title: 'Rentabilidad', desc: 'Menos pérdidas, más beneficios.' },
    ],
    chips: ['Documentos centralizados', 'Multi-ubicación', 'Roles y permisos', 'Informes y KPIs'],
  },
  integrations: {
    eyebrow: 'Ecosistema',
    title: 'Integraciones',
    subtitle: 'Conecta Vertial con tu stack cuando lo necesites — sin vendor lock-in innecesario.',
    items: [
      { title: 'ANCOVE', desc: 'Plataforma oficial compraventas', tag: 'Opcional' },
      { title: 'API REST', desc: 'Acceso programático completo', tag: 'Pro' },
      { title: 'Webhooks', desc: 'Eventos en tiempo real', tag: 'Pro' },
      { title: 'Email / SMTP', desc: 'Documentos y notificaciones', tag: 'Incluido' },
    ],
  },
  pricing: {
    eyebrow: 'Planes',
    title: 'Elige cómo quieres trabajar con Vertial',
    subtitle: 'Te proponemos el plan según tu operativa. Precio bajo consulta.',
    monthly: 'Mensual',
    yearly: 'Anual',
    perMonth: '/mes',
    askPrice: 'Consulta con nosotros',
    mostPopular: 'Más popular',
    licenseNote: ' Cada sede adicional se factura por separado.',
    licenseNoteBold: '1 ubicación = 1 licencia.',
    yearlyBilled: '{{amount}}/año facturados',
    plans: [
      {
        name: 'Básico',
        desc: 'Para empezar con orden',
        features: ['1 ubicación', 'Hasta 2 usuarios', 'Stock ilimitado', 'Operaciones y CRM', 'Documentos básicos'],
        cta: 'Registrarse',
      },
      {
        name: 'Normal',
        desc: 'El más elegido por equipos en crecimiento',
        features: ['1 ubicación', 'Hasta 5 usuarios', 'Todo lo del Básico', 'Firma digital', 'Gestoría integrada', 'KPIs avanzados'],
        cta: 'Registrarse',
      },
      {
        name: 'Pro',
        desc: 'Multi-empresa, API y soporte prioritario',
        features: ['1 ubicación incluida', 'PDV extra de pago', 'Hasta 12 usuarios', 'Todo lo del Normal', 'API y Webhooks', 'Soporte prioritario'],
        cta: 'Hablar con ventas',
      },
    ],
  },
  testimonials: {
    eyebrow: 'Clientes',
    titleBefore: 'Empresas que operan con ',
    titleAccent: 'Vertial',
    subtitle: 'Resultados reales en compraventa, restauración y operaciones multi-equipo.',
    items: [
      {
        quote:
          'Pasamos de hojas de cálculo y WhatsApp a tener todo el stock y las operaciones en un solo sitio. El equipo va mucho más alineado.',
        name: 'Carlos M.',
        role: 'Director · Compraventa',
        initial: 'C',
      },
      {
        quote:
          'Con delivery, cocina y reparto en Vertial vemos el día entero sin perder pedidos. El TPV en tablet nos cambió el ritmo del local.',
        name: 'Laura S.',
        role: 'Gerente · Restauración',
        initial: 'L',
      },
      {
        quote:
          'Multi-sede, permisos por rol y alertas configurables. Por fin una herramienta que se siente de empresa grande, no de prototipo.',
        name: 'Javier P.',
        role: 'Propietario · Grupo multi-negocio',
        initial: 'J',
      },
    ],
  },
  finalCta: {
    eyebrow: 'Empieza hoy',
    titleBefore: 'Tu negocio merece ',
    titleAccent: 'Vertial',
    subtitle: 'Sin permanencia · Soporte en español · Datos en Europa',
    startNow: 'Registrarse',
    tabletTpv: 'TPV en tablet',
    haveAccount: '¿Ya tienes cuenta?',
    workerAccess: 'Acceso trabajadores',
  },
  faq: {
    eyebrow: 'Ayuda',
    title: 'Preguntas frecuentes',
    subtitle: 'Lo esencial antes de dar el paso.',
    items: [
      {
        q: '¿Cómo me registro en Vertial?',
        a: 'Pulsa Registrarse, crea tu cuenta con email y contraseña, elige tu vertical y completa el alta con el plan que necesites.',
      },
      {
        q: '¿Hay permanencia?',
        a: 'No. Puedes cambiar o cancelar el plan cuando quieras desde facturación. Tus datos se conservan de forma segura.',
      },
      {
        q: '¿Puedo cambiar de plan más adelante?',
        a: 'Sí, puedes cambiar de plan en cualquier momento desde tu panel de facturación. El cambio es inmediato.',
      },
      {
        q: '¿Los datos están seguros?',
        a: 'Sí. Todos los datos son cifrados, alojados en Europa y cumplimos con RGPD. Hacemos backups diarios automáticos.',
      },
      {
        q: '¿Cómo funciona la integración con ANCOVE?',
        a: 'ANCOVE es una integración opcional para compraventa. Puedes conectar tu cuenta desde Ajustes → Integraciones.',
      },
    ],
  },
  contact: {
    eyebrow: 'Contacto',
    title: 'Agendar reunión con Vertial',
    schedule: 'Agendar reunión',
    affiliates: 'Afiliados',
    affiliatesTitle: '¿Conoces negocios que encajarían con Vertial?',
    affiliatesDesc:
      'Únete al programa de afiliados: comisiones recurrentes, sin límite de ingresos y soporte dedicado para partners.',
    affiliatesPerks: ['Comisiones recurrentes', 'Sin límite de ingresos'],
    requestAffiliate: 'Solicitar afiliación',
  },
  footer: {
    blurb:
      'Vertial — software de gestión para negocios profesionales. Compraventa, taller y delivery en una sola plataforma.',
    madeIn: 'Hecho en España · Datos en Europa',
    product: 'Producto',
    resources: 'Recursos',
    company: 'Empresa',
    docs: 'Documentación',
    faq: 'Preguntas frecuentes',
    api: 'API para desarrolladores',
    howItWorks: 'Cómo funciona',
    about: 'Sobre nosotros',
    contact: 'Contacto',
    affiliates: 'Afiliados',
    callUs: '¿Dudas? Llámanos',
    rights: '© 2026 Vertial. Todos los derechos reservados.',
    privacy: 'Política de privacidad',
    terms: 'Términos de servicio',
    cookies: 'Cookies',
    prices: 'Precios',
    verticals: 'Verticales',
    modules: 'Módulos',
    integrations: 'Integraciones',
    comingSoon: 'Próximamente',
    understood: 'Entendido',
    comingSoonDesc: '{{feature}} estará disponible muy pronto en Vertial.',
  },
};

const en: LandingCopy = {
  nav: {
    product: 'Product',
    verticals: 'Verticals',
    modules: 'Modules',
    integrations: 'Integrations',
    howItWorks: 'How it works',
    plans: 'Plans',
    faq: 'FAQ',
    contact: 'Contact',
    startFree: 'Sign up',
    start: 'Start',
    menu: 'Menu',
  },
  hero: {
    badge: 'Multi-vertical platform · Made in Spain',
    brand: 'Vertial',
    title1: 'More time,',
    title2: 'fewer tasks,',
    titleAccent: 'more control',
    subtitle: 'Cut the manual work and focus on what really matters.',
    ctaTrial: 'Sign up',
    ctaAffiliate: 'Become a partner',
    perks: ['Set up in minutes', 'No lock-in', 'Support available', 'Data in Europe'],
    opsToday: '+24 ops today',
    avgMargin: 'Avg. margin',
    tabs: ['Operations', 'Stock', 'Alerts'],
    captions: [
      'Kitchen orders · live delivery',
      'Stock & margins · auto updates',
      'Team, permissions & alerts · one panel',
    ],
  },
  marquee: [
    'Dealership', 'Delivery', 'Workshop', 'Tablet POS', 'CRM', 'Finance',
    'Documents', 'Team', 'Alerts', 'Multi-site', 'REST API', 'Vertial',
  ],
  stats: [
    { value: 'Multi-vertical', label: 'One core, many operations' },
    { value: 'Real time', label: 'Data connected to your panel' },
    { value: 'GDPR', label: 'Data hosted in Europe' },
    { value: '24/7', label: 'Always-on platform' },
  ],
  why: {
    eyebrow: 'Why Vertial',
    titleBefore: 'The operating system ',
    titleAccent: 'for your business',
    subtitle:
      'Not another Excel with a login. The operational core of your company — built to scale by vertical without starting over.',
    cards: [
      { title: 'One engine, many verticals', desc: 'Same platform, different operations. No duplicated systems.' },
      { title: 'Live dashboard', desc: 'KPIs, alerts and today’s activity connected to your data.' },
      { title: 'Unified CRM', desc: 'Customers, history and segmentation in one place.' },
      { title: 'Stock & operations', desc: 'Inventory, pipeline and end-to-end traceability.' },
      { title: 'Tablet POS', desc: 'Cash, staff usage and shifts ready for the counter.' },
      { title: 'Secure in Europe', desc: 'GDPR, granular permissions and automatic backups.' },
      { title: 'Alert center', desc: 'Push, email and in-app alerts configurable by role.' },
      { title: 'Efficiency', desc: 'Less manual work, more control. Focus on what matters.' },
    ],
    tags: ['Core', 'Ops engine', 'Vertical config'],
  },
  verticals: {
    eyebrow: 'Multi-vertical',
    title: 'Choose your operations',
    subtitle: 'Same Vertial platform, different business. Activate the vertical that fits you.',
    seePlans: 'See plans',
    active: 'Live',
    seeHow: 'See how it works',
    soon: 'Coming soon',
    items: [
      { name: 'Dealership', desc: 'Stock, operations, documents and margins in real time.' },
      { name: 'Hospitality', desc: 'Bar, restaurant, tablet POS, kitchen and floor orders.' },
      { name: 'Delivery', desc: 'Home orders, dispatch, kitchen and customer loyalty.' },
      { name: 'Workshop', desc: 'Work orders, parts and repair tracking.' },
      { name: 'Retail', desc: 'Points of sale and catalog for retail stores.' },
    ],
  },
  how: {
    eyebrow: 'Implementation',
    title: 'Up and running in minutes',
    subtitle: 'Five keys to get Vertial running in your company, with real data from day one.',
    steps: [
      { title: 'Create your space', desc: 'Sign up, pick a vertical and set up your business with the onboarding wizard.' },
      { title: 'Connect operations', desc: 'Stock, orders or vehicles: import data or start from templates.' },
      { title: 'Control with real data', desc: 'Dashboard, alerts and team working on the same source of truth.' },
      { title: 'Peace of mind', desc: 'Everything organized — no chaos.' },
      { title: 'Profitability', desc: 'Fewer losses, more margin.' },
    ],
    chips: ['Centralized documents', 'Multi-location', 'Roles & permissions', 'Reports & KPIs'],
  },
  integrations: {
    eyebrow: 'Ecosystem',
    title: 'Integrations',
    subtitle: 'Connect Vertial to your stack when you need it — without unnecessary lock-in.',
    items: [
      { title: 'ANCOVE', desc: 'Official dealership platform', tag: 'Optional' },
      { title: 'REST API', desc: 'Full programmatic access', tag: 'Pro' },
      { title: 'Webhooks', desc: 'Real-time events', tag: 'Pro' },
      { title: 'Email / SMTP', desc: 'Documents and notifications', tag: 'Included' },
    ],
  },
  pricing: {
    eyebrow: 'Plans',
    title: 'Choose how you want to work with Vertial',
    subtitle: 'We propose a plan for your operations. Pricing on request.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    perMonth: '/mo',
    askPrice: 'Contact us for pricing',
    mostPopular: 'Most popular',
    licenseNote: ' Each extra site is billed separately.',
    licenseNoteBold: '1 location = 1 license.',
    yearlyBilled: '{{amount}}/year billed',
    plans: [
      {
        name: 'Basic',
        desc: 'Start with structure',
        features: ['1 location', 'Up to 2 users', 'Unlimited stock', 'Operations & CRM', 'Basic documents'],
        cta: 'Sign up',
      },
      {
        name: 'Standard',
        desc: 'Most chosen by growing teams',
        features: ['1 location', 'Up to 5 users', 'Everything in Basic', 'Digital signature', 'Integrated agency tools', 'Advanced KPIs'],
        cta: 'Sign up',
      },
      {
        name: 'Pro',
        desc: 'Multi-company, API and priority support',
        features: ['1 location included', 'Extra POS add-on', 'Up to 12 users', 'Everything in Standard', 'API & Webhooks', 'Priority support'],
        cta: 'Talk to sales',
      },
    ],
  },
  testimonials: {
    eyebrow: 'Customers',
    titleBefore: 'Businesses running on ',
    titleAccent: 'Vertial',
    subtitle: 'Real results in dealership, hospitality and multi-team operations.',
    items: [
      {
        quote:
          'We went from spreadsheets and WhatsApp to stock and operations in one place. The team is far more aligned.',
        name: 'Carlos M.',
        role: 'Director · Dealership',
        initial: 'C',
      },
      {
        quote:
          'With delivery, kitchen and dispatch in Vertial we see the whole day without losing orders. Tablet POS changed our pace.',
        name: 'Laura S.',
        role: 'Manager · Hospitality',
        initial: 'L',
      },
      {
        quote:
          'Multi-site, role permissions and configurable alerts. Finally a tool that feels enterprise — not a prototype.',
        name: 'Javier P.',
        role: 'Owner · Multi-business group',
        initial: 'J',
      },
    ],
  },
  finalCta: {
    eyebrow: 'Start today',
    titleBefore: 'Your business deserves ',
    titleAccent: 'Vertial',
    subtitle: 'No lock-in · Support available · Data in Europe',
    startNow: 'Sign up',
    tabletTpv: 'Tablet POS',
    haveAccount: 'Already have an account?',
    workerAccess: 'Staff access',
  },
  faq: {
    eyebrow: 'Help',
    title: 'Frequently asked questions',
    subtitle: 'The essentials before you take the step.',
    items: [
      {
        q: 'How do I sign up for Vertial?',
        a: 'Click Sign up, create your account with email and password, choose your vertical and complete onboarding with the plan you need.',
      },
      {
        q: 'Is there a lock-in period?',
        a: 'No. You can change or cancel your plan anytime from billing. Your data is kept safely.',
      },
      {
        q: 'Can I change plans later?',
        a: 'Yes. You can change plans anytime from billing. The change is immediate.',
      },
      {
        q: 'Is my data safe?',
        a: 'Yes. Data is encrypted, hosted in Europe and GDPR-compliant, with daily automatic backups.',
      },
      {
        q: 'How does the ANCOVE integration work?',
        a: 'ANCOVE is an optional dealership integration. Connect it from Settings → Integrations.',
      },
    ],
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Book a meeting with Vertial',
    schedule: 'Book a meeting',
    affiliates: 'Affiliates',
    affiliatesTitle: 'Know businesses that would fit Vertial?',
    affiliatesDesc:
      'Join the affiliate program: recurring commissions, no income cap and dedicated partner support.',
    affiliatesPerks: ['Recurring commissions', 'No income cap'],
    requestAffiliate: 'Apply as affiliate',
  },
  footer: {
    blurb:
      'Vertial — management software for professional businesses. Dealership, workshop and delivery in one platform.',
    madeIn: 'Made in Spain · Data in Europe',
    product: 'Product',
    resources: 'Resources',
    company: 'Company',
    docs: 'Documentation',
    faq: 'FAQ',
    api: 'Developer API',
    howItWorks: 'How it works',
    about: 'About us',
    contact: 'Contact',
    affiliates: 'Affiliates',
    callUs: 'Questions? Call us',
    rights: '© 2026 Vertial. All rights reserved.',
    privacy: 'Privacy policy',
    terms: 'Terms of service',
    cookies: 'Cookies',
    prices: 'Pricing',
    verticals: 'Verticals',
    modules: 'Modules',
    integrations: 'Integrations',
    comingSoon: 'Coming soon',
    understood: 'Got it',
    comingSoonDesc: '{{feature}} will be available in Vertial very soon.',
  },
};

export const LANDING_I18N: Record<'es' | 'en' | 'pt' | 'fr' | 'it', LandingCopy> = {
  es,
  en,
  pt: en,
  fr: en,
  it: en,
};

export const WEB_LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
] as const;

export const I18N_LANG_STORAGE_KEY = 'vertial_i18n_lng';
