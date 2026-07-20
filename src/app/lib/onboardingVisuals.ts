export type OnboardingVisualKey =
  | 'business-type'
  | 'company'
  | 'structure'
  | 'needs'
  | 'recommendation'
  | 'payment'
  | 'register-company'
  | 'login-company'
  | 'register-user'
  | 'entry'
  | 'confirmation';

export type OnboardingGradientTheme =
  | 'vertial'
  | 'indigo'
  | 'ocean'
  | 'teal'
  | 'amber'
  | 'violet'
  | 'emerald';

export type OnboardingVisual = {
  /** Vacío = solo gradiente Vertial (sin foto). */
  image: string;
  gradientTheme: OnboardingGradientTheme;
  badge: string;
  title: string;
  subtitle: string;
  highlights: string[];
};

/** Fotos genéricas multi-sector — sin automoción ni concesionarios. */
const HERO_PHOTOS = {
  modernOffice:
    'https://images.unsplash.com/photo-1497366811353-4581034681e7?auto=format&fit=crop&w=1600&q=80',
  teamCollaboration:
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80',
  cafeRetail:
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
  hotelLobby:
    'https://images.unsplash.com/photo-1566074010469-796186253421?auto=format&fit=crop&w=1600&q=80',
  warehouse:
    'https://images.unsplash.com/photo-1586528110311-add1c6197427?auto=format&fit=crop&w=1600&q=80',
  analytics:
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80',
  securePayment:
    'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1600&q=80',
  coworking:
    'https://images.unsplash.com/photo-1521737710482-874447f3128?auto=format&fit=crop&w=1600&q=80',
  tabletOps:
    'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1600&q=80',
} as const;

const GRADIENT_THEMES: Record<OnboardingGradientTheme, string> = {
  vertial: 'linear-gradient(155deg, #0f1419 0%, #1e3a8a 38%, #0f766e 72%, #0f1419 100%)',
  indigo: 'linear-gradient(150deg, #0f1419 0%, #312e81 42%, #1e40af 72%, #0f1419 100%)',
  ocean: 'linear-gradient(155deg, #0c1222 0%, #1e3a8a 48%, #0e7490 100%)',
  teal: 'linear-gradient(155deg, #0f1419 0%, #115e59 45%, #1e3a8a 100%)',
  amber: 'linear-gradient(155deg, #0f1419 0%, #92400e 38%, #1e3a8a 100%)',
  violet: 'linear-gradient(155deg, #0f1419 0%, #5b21b6 40%, #1e3a8a 100%)',
  emerald: 'linear-gradient(155deg, #0f1419 0%, #047857 42%, #1e3a8a 100%)',
};

const PHOTO_OVERLAY =
  'linear-gradient(160deg, rgba(15,23,42,0.94) 0%, rgba(30,58,138,0.82) 48%, rgba(15,20,25,0.96) 100%)';

export function getOnboardingHeroBackground(visual: Pick<OnboardingVisual, 'image' | 'gradientTheme'>): string {
  const gradient = GRADIENT_THEMES[visual.gradientTheme] ?? GRADIENT_THEMES.vertial;
  if (!visual.image) return gradient;
  return `${PHOTO_OVERLAY}, url('${visual.image}')`;
}

export const ONBOARDING_VISUALS: Record<OnboardingVisualKey, OnboardingVisual> = {
  'business-type': {
    image: '',
    gradientTheme: 'indigo',
    badge: 'Configuración · Paso 1',
    title: 'Una plataforma, muchos sectores',
    subtitle: 'Delivery, taller, clínica, hotel… Vertial se adapta a tu operativa real.',
    highlights: ['24+ verticales', 'Setup guiado', 'Prueba gratuita incluida'],
  },
  company: {
    image: HERO_PHOTOS.modernOffice,
    gradientTheme: 'ocean',
    badge: 'Configuración · Paso 2',
    title: 'Tu empresa, tu espacio',
    subtitle: 'Identificamos tu negocio para preparar el panel, usuarios y permisos.',
    highlights: ['Datos fiscales seguros', 'Dirección y contacto', 'Verificación opcional'],
  },
  structure: {
    image: HERO_PHOTOS.teamCollaboration,
    gradientTheme: 'teal',
    badge: 'Configuración · Paso 3',
    title: 'Equipo y locales a escala',
    subtitle: 'Usuarios y ubicaciones definen el plan ideal para tu volumen.',
    highlights: ['Usuarios incluidos', 'Multi-local', 'Precio transparente'],
  },
  needs: {
    image: HERO_PHOTOS.cafeRetail,
    gradientTheme: 'amber',
    badge: 'Configuración · Paso 4',
    title: 'Operativa a medida',
    subtitle: 'Marca lo que usarás: ventas, stock, CRM, documentos o reparto.',
    highlights: ['Módulos flexibles', 'Sin sobrecoste oculto', 'Ampliable después'],
  },
  recommendation: {
    image: HERO_PHOTOS.analytics,
    gradientTheme: 'violet',
    badge: 'Configuración · Paso 5',
    title: 'Precio claro, sin sorpresas',
    subtitle: 'Recomendamos el plan según tu sector, usuarios y módulos elegidos.',
    highlights: ['Plan recomendado', 'Mensual o anual', 'Facturación clara'],
  },
  payment: {
    image: HERO_PHOTOS.securePayment,
    gradientTheme: 'emerald',
    badge: 'Configuración · Paso 6',
    title: 'Pago seguro y cifrado',
    subtitle: 'Activa tu prueba gratuita. Solo se cobrará al finalizar el periodo de prueba.',
    highlights: ['Cifrado bancario', 'Cancela cuando quieras', 'Sin permanencia'],
  },
  'register-company': {
    image: HERO_PHOTOS.coworking,
    gradientTheme: 'ocean',
    badge: 'Alta de empresa',
    title: 'Crea tu espacio en Vertial',
    subtitle: 'Stock, operaciones, clientes y documentos en un solo lugar.',
    highlights: ['Setup en minutos', 'Multi-vertical', 'Prueba sin compromiso'],
  },
  'login-company': {
    image: HERO_PHOTOS.coworking,
    gradientTheme: 'ocean',
    badge: 'Acceso empresa',
    title: 'Bienvenido de nuevo',
    subtitle: 'Entra y sigue con tu día.',
    highlights: ['Seguro', 'Rápido', 'Siempre a mano'],
  },
  'register-user': {
    image: HERO_PHOTOS.tabletOps,
    gradientTheme: 'teal',
    badge: 'Alta de trabajador',
    title: 'Tu acceso operativo',
    subtitle: 'Fichajes, tareas y módulos asignados por tu empresa.',
    highlights: ['Invitación o alta directa', 'Tablet TPV', 'App web'],
  },
  entry: {
    image: '',
    gradientTheme: 'vertial',
    badge: 'Acceso Vertial',
    title: '¿Cómo entras en Vertial?',
    subtitle: 'Empresa, trabajador o afiliado: elige tu acceso.',
    highlights: ['Empresa y gerencia', 'Operativa en tienda', 'Programa de partners'],
  },
  confirmation: {
    image: HERO_PHOTOS.hotelLobby,
    gradientTheme: 'emerald',
    badge: '¡Listo!',
    title: 'Bienvenido a Vertial',
    subtitle: 'Estamos preparando tu panel, plan y acceso al dashboard.',
    highlights: ['Espacio configurado', 'Prueba activada', 'Acceso inmediato'],
  },
};

const STEP_VISUAL_KEYS: OnboardingVisualKey[] = [
  'business-type',
  'company',
  'structure',
  'needs',
  'recommendation',
  'payment',
];

export function getOnboardingVisualForStep(stepIndex: number): OnboardingVisual {
  const key = STEP_VISUAL_KEYS[stepIndex] ?? 'business-type';
  return ONBOARDING_VISUALS[key];
}

export function getOnboardingVisualKeyForStep(stepIndex: number): OnboardingVisualKey {
  return STEP_VISUAL_KEYS[stepIndex] ?? 'business-type';
}
