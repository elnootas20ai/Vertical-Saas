export type OnboardingVisualKey =
  | 'business-type'
  | 'company'
  | 'structure'
  | 'needs'
  | 'recommendation'
  | 'payment'
  | 'register-company'
  | 'register-user'
  | 'entry'
  | 'confirmation';

export type OnboardingVisual = {
  image: string;
  badge: string;
  title: string;
  subtitle: string;
  highlights: string[];
};

export const ONBOARDING_VISUALS: Record<OnboardingVisualKey, OnboardingVisual> = {
  'business-type': {
    image:
      'https://images.unsplash.com/photo-1485291571150-772bcfc10da5?auto=format&fit=crop&w=1600&q=80',
    badge: 'Configuración · Paso 1',
    title: 'Una plataforma, muchos sectores',
    subtitle: 'Delivery, taller, clínica, hotel… Vertial se adapta a tu operativa real.',
    highlights: ['24+ verticales', 'Setup guiado', 'Prueba gratuita incluida'],
  },
  company: {
    image:
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80',
    badge: 'Configuración · Paso 2',
    title: 'Tu empresa, tu espacio',
    subtitle: 'Identificamos tu negocio para preparar el panel, usuarios y permisos.',
    highlights: ['Datos fiscales seguros', 'Dirección y contacto', 'Verificación opcional'],
  },
  structure: {
    image:
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80',
    badge: 'Configuración · Paso 3',
    title: 'Equipo y locales a escala',
    subtitle: 'Usuarios y ubicaciones definen el plan ideal para tu volumen.',
    highlights: ['Usuarios incluidos', 'Multi-local', 'Precio transparente'],
  },
  needs: {
    image:
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=80',
    badge: 'Configuración · Paso 4',
    title: 'Operativa a medida',
    subtitle: 'Marca lo que usarás: ventas, stock, CRM, documentos o reparto.',
    highlights: ['Módulos flexibles', 'Sin sobrecoste oculto', 'Ampliable después'],
  },
  recommendation: {
    image:
      'https://images.unsplash.com/photo-1759752394755-1241472b589d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1600',
    badge: 'Configuración · Paso 5',
    title: 'Precio claro, sin sorpresas',
    subtitle: 'Recomendamos el plan según tu sector, usuarios y módulos elegidos.',
    highlights: ['Plan recomendado', 'Mensual o anual', 'Facturación clara'],
  },
  payment: {
    image:
      'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1600&q=80',
    badge: 'Configuración · Paso 6',
    title: 'Pago seguro y cifrado',
    subtitle: 'Activa tu prueba gratuita. Solo se cobrará al finalizar el periodo de prueba.',
    highlights: ['Cifrado bancario', 'Cancela cuando quieras', 'Sin permanencia'],
  },
  'register-company': {
    image:
      'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1600&q=80',
    badge: 'Alta de empresa',
    title: 'Crea tu espacio en Vertial',
    subtitle: 'Stock, operaciones, clientes y documentos en un solo lugar.',
    highlights: ['Setup en minutos', 'Multi-vertical', 'Prueba sin compromiso'],
  },
  'register-user': {
    image:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80',
    badge: 'Alta de trabajador',
    title: 'Tu acceso operativo',
    subtitle: 'Fichajes, tareas y módulos asignados por tu empresa.',
    highlights: ['Invitación o alta directa', 'Tablet TPV', 'App web'],
  },
  entry: {
    image:
      'https://images.unsplash.com/photo-1485291571150-772bcfc10da5?auto=format&fit=crop&w=1600&q=80',
    badge: 'Acceso Vertial',
    title: 'Control total de tu negocio',
    subtitle: 'Empresa, trabajador o afiliado: elige tu puerta de entrada.',
    highlights: ['Empresa y gerencia', 'Operativa en tienda', 'Programa de partners'],
  },
  confirmation: {
    image:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80',
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
