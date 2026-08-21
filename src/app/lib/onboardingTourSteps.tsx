import React from 'react';
import {
  Building2,
  Package,
  Sparkles,
  CheckCircle2,
  Store,
  Tags,
  Clock,
  Users,
  Rocket,
  SprayCan,
  Car,
  Wrench,
  Dumbbell,
  PartyPopper,
  FileText,
  LayoutGrid,
} from 'lucide-react';
import {
  isGuidedActivationBusinessType,
} from './deliveryOpsTypes';

export interface OnboardingTourStep {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  hint?: string;
  route?: string;
  /** Lista de comprobaciones concretas (evita confusión tipo 3/4 sin contexto) */
  checklist?: string[];
}

export type OnboardingTourPersonalization = {
  firstName?: string | null;
  businessName?: string | null;
};

function trimPersonalization(p?: OnboardingTourPersonalization) {
  return {
    firstName: String(p?.firstName ?? '').trim(),
    businessName: String(p?.businessName ?? '').trim(),
  };
}

function buildOpsWelcomeStep(
  p?: OnboardingTourPersonalization,
  variant: 'delivery' | 'restaurant' = 'delivery',
): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);
  const brand = variant === 'restaurant' ? 'Vertial Bar/restaurante' : 'Vertial Delivery';
  const opsHint =
    variant === 'restaurant'
      ? 'En el menú lateral, «Alta bar/restaurante» indica en todo momento qué falta por completar.'
      : 'En el menú lateral, «Alta delivery» indica en todo momento qué falta por completar.';

  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en ${brand}`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a ${brand}`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = `Bienvenido a ${brand}`;
  }

  const description =
    variant === 'restaurant'
      ? businessName
        ? `Configuraremos ${businessName} para operar con bar/restaurante, caja, carta y sala desde un solo panel. Te guiamos paso a paso para abrir sin pasos en vano.`
        : 'Configuraremos tu bar/restaurante para operar con caja, carta y sala desde un solo panel. Te guiamos paso a paso para dejar todo listo.'
      : businessName
        ? `Configuraremos ${businessName} para operar con locales, caja, carta y pedidos desde un solo panel. Te acompañamos en el orden adecuado para abrir tu primer local sin pasos en vano.`
        : 'Configuraremos tu negocio para operar con locales, caja, carta y pedidos desde un solo panel. Te acompañamos paso a paso para dejar tu primer local listo para vender.';

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    title,
    description,
    hint: opsHint,
  };
}

function buildCompraventaWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);
  const brand = 'Vertial Compraventa';
  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en ${brand}`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a ${brand}`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = `Bienvenido a ${brand}`;
  }

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    title,
    description: businessName
      ? `Configuraremos ${businessName} para gestionar expositor, stock, clientes y ventas desde un solo panel. Te guiamos paso a paso.`
      : 'Configuraremos tu compraventa para gestionar expositor, stock, clientes y ventas desde un solo panel. Te guiamos paso a paso.',
    hint: 'En el menú lateral, «Alta compraventa» indica en todo momento qué falta por completar.',
  };
}

function buildCleaningWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);
  const brand = 'Vertial Limpieza';
  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en ${brand}`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a ${brand}`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = `Bienvenido a ${brand}`;
  }

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-400 to-teal-500',
    title,
    description: businessName
      ? `Configuraremos ${businessName} para programar servicios, asignar equipo y facturar desde un solo panel. Te guiamos paso a paso.`
      : 'Configuraremos tu empresa de limpieza para programar servicios, asignar equipo y facturar desde un solo panel. Te guiamos paso a paso.',
    hint: 'En el menú lateral, «Alta limpieza» indica en todo momento qué falta por completar.',
  };
}

/** Tour popup paso 1–5 para delivery. */
const DELIVERY_OPS_TOUR_STEPS_BEFORE_DONE: OnboardingTourStep[] = [
  {
    id: 'delivery_store',
    icon: <Store className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
    title: 'Crea tu local y la caja',
    description:
      'Cada tienda es un local físico (nombre y dirección). Al darla de alta se crea el PDV, la caja del TPV de ese local. Puedes tener varios locales, cada uno con su PDV.',
    hint: 'Al crear la tienda también se prepara un borrador de carta (marca) vinculado al local.',
    route: '/saas/settings/tienda',
    checklist: ['Crear la primera tienda (local)', 'Confirmar que la caja / PDV está activa'],
  },
  {
    id: 'delivery_brand',
    icon: <Tags className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Completa tu carta (marca)',
    description:
      'No tienes que crear la marca desde cero: ya existe una línea (suele llamarse «General» o como tu tienda). Aquí defines qué vendes, el nombre visible, las categorías y en qué locales se sirve. La marca no es el local: es la carta que verás en catálogo y TPV.',
    hint: 'Ajustes → Marca → edita la marca existente (Qué vendes, Identidad, Tiendas y categorías).',
    route: '/saas/settings/marca',
    checklist: ['Nombre visible de la carta', 'Categorías y tiendas donde se sirve'],
  },
  {
    id: 'delivery_catalog',
    icon: <Package className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Arma tu catálogo',
    description:
      'Da de alta platos o productos bajo esa marca, con precio de venta. Si el paso Marca del checklist sigue pendiente, termínalo antes: el catálogo usa sus categorías.',
    hint: 'Catálogo → misma línea que completaste en Marca.',
    route: '/saas/catalog',
    checklist: ['Al menos un producto o plato', 'Con precio de venta mayor que 0'],
  },
  {
    id: 'delivery_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description:
      'En el menú lateral, «4/5 pasos» es el progreso global; «3/4 datos» en Empresa son estos cuatro campos. Pulsa Ir junto al que falte (en tu caso suele ser Dirección).',
    hint: 'Ajustes → Empresa → icono lápiz → el campo se resalta en amarillo.',
    route: '/saas/settings/empresa',
    checklist: [
      'Nombre comercial',
      'CIF / NIF',
      'Dirección',
      'Teléfono de contacto',
    ],
  },
  {
    id: 'delivery_operate',
    icon: <Clock className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Horarios y primer TPV',
    description:
      'Al crear o editar tu tienda, define el horario de apertura en el mismo asistente. Con local, marca y carta listos, ya puedes cobrar en el TPV.',
    hint: 'El horario queda guardado en cada local; el TPV se abre desde el dashboard.',
    route: '/saas/settings/horarios',
    checklist: ['Horario de apertura en la tienda', 'Tienda, marca y catálogo listos para el TPV'],
  },
];

/** Tour popup para bar/restaurante (tienda → sala → marca → carta → empresa → horarios). */
const RESTAURANT_OPS_TOUR_STEPS_BEFORE_DONE: OnboardingTourStep[] = [
  {
    id: 'delivery_store',
    icon: <Store className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
    title: 'Crea tu bar/restaurante y la caja',
    description:
      'Cada bar/restaurante es tu local físico (nombre y dirección). Al darlo de alta se crea el PDV y la caja TPV de ese local. Puedes tener varios, cada uno con su PDV.',
    hint: 'Al crear el bar/restaurante también se prepara un borrador de carta (marca) vinculado al local.',
    route: '/saas/settings/tienda',
    checklist: ['Primer bar/restaurante creado', 'Confirmar que la caja / PDV está activa'],
  },
  {
    id: 'restaurant_sala',
    icon: <LayoutGrid className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    title: 'Mapea tu sala',
    description:
      'Indica cuántas zonas tienes (salón, terraza, terraza 2…) y cuántas mesas hay en cada una. Es el primer paso operativo del local.',
    hint: 'Tras crear el PDV se abre el asistente. También en menú → Sala.',
    route: '/saas/sala',
    checklist: ['Zonas definidas', 'Mesas por zona creadas'],
  },
  {
    id: 'delivery_brand',
    icon: <Tags className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Completa tu carta (marca)',
    description:
      'No tienes que crear la marca desde cero: ya existe una línea (suele llamarse «General» o como tu bar/restaurante). Aquí defines qué vendes, el nombre visible, las categorías y en qué locales se sirve. La marca no es el local: es la carta que verás en catálogo y TPV.',
    hint: 'Ajustes → Marca → edita la marca existente (Qué vendes, Identidad, Tiendas y categorías).',
    route: '/saas/settings/marca',
    checklist: ['Nombre visible de la carta', 'Categorías y locales donde se sirve'],
  },
  {
    id: 'delivery_catalog',
    icon: <Package className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Arma tu carta',
    description:
      'Da de alta platos o bebidas bajo esa marca, con precio de venta. Si el paso Marca del checklist sigue pendiente, termínalo antes: la carta usa sus categorías.',
    hint: 'Catálogo → misma línea que completaste en Marca.',
    route: '/saas/catalog',
    checklist: ['Al menos un producto o plato', 'Con precio de venta mayor que 0'],
  },
  {
    id: 'delivery_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description:
      'En el menú lateral, «4/5 pasos» es el progreso global; «3/4 datos» en Empresa son estos cuatro campos. Pulsa Ir junto al que falte (en tu caso suele ser Dirección).',
    hint: 'Ajustes → Empresa → icono lápiz → el campo se resalta en amarillo.',
    route: '/saas/settings/empresa',
    checklist: [
      'Nombre comercial',
      'CIF / NIF',
      'Dirección',
      'Teléfono de contacto',
    ],
  },
  {
    id: 'delivery_operate',
    icon: <Clock className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Horarios y primer TPV',
    description:
      'Al crear o editar tu bar/restaurante, define el horario de apertura en el mismo asistente. Con local, marca y carta listos, ya puedes cobrar en el TPV.',
    hint: 'El horario queda guardado en cada local; el TPV se abre desde el dashboard.',
    route: '/saas/settings/horarios',
    checklist: ['Horario de apertura en el bar/restaurante', 'Bar/restaurante, marca y carta listos para el TPV'],
  },
];

function buildOpsDoneStep(variant: 'delivery' | 'restaurant'): OnboardingTourStep {
  if (variant === 'restaurant') {
    return {
      id: 'done',
      icon: <CheckCircle2 className="w-7 h-7 text-white" />,
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      title: '¡Listo para tu bar/restaurante!',
      description:
        'Ya conoces el flujo de arranque. En el menú lateral, «Alta bar/restaurante» te marca qué falta por completar hasta el 100%.',
      hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
    };
  }
  return {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para delivery!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta delivery» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  };
}

const COMPRAVENTA_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'compraventa_store',
    icon: <Store className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
    title: 'Crea tu expositor y la caja',
    description:
      'Cada expositor es tu punto de venta físico. Al darlo de alta se crea el PDV y la caja TPV de esa sede.',
    hint: 'Ajustes → Tienda → «Nuevo expositor / PDV».',
    route: '/saas/settings/tienda',
    checklist: ['Crear el primer expositor', 'Confirmar que la caja / PDV está activa'],
  },
  {
    id: 'compraventa_clients',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Registra clientes',
    description: 'Añade compradores y contactos para operaciones, reservas y documentación.',
    hint: 'Clientes → «Nuevo cliente».',
    route: '/saas/crm/clientes?tab=clients',
    checklist: ['Al menos un cliente registrado'],
  },
  {
    id: 'compraventa_stock',
    icon: <Car className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Da de alta vehículos',
    description: 'Carga tu stock con matrícula, datos básicos y precio de venta para publicar y operar.',
    hint: 'Stock → «Nuevo vehículo».',
    route: '/saas/vehicles',
    checklist: ['Al menos un vehículo en stock', 'Con precio de venta mayor que 0'],
  },
  {
    id: 'compraventa_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description: 'Completa nombre, CIF, dirección y teléfono para contratos y facturación.',
    hint: 'Ajustes → Empresa → icono lápiz en cada campo pendiente.',
    route: '/saas/settings/empresa',
    checklist: ['Nombre comercial', 'CIF / NIF', 'Dirección', 'Teléfono de contacto'],
  },
  {
    id: 'compraventa_operate',
    icon: <Rocket className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Listo para vender',
    description: 'Con expositor, clientes, stock y datos fiscales ya puedes registrar operaciones.',
    hint: 'Comercial → Ventas para registrar tu primera operación.',
    route: '/saas/vertical/compraventa/ventas',
    checklist: ['Expositor, clientes y stock listos', 'Datos de empresa completos'],
  },
];

const CLEANING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'cleaning_services',
    icon: <SprayCan className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-teal-600',
    title: 'Programa tu primer servicio',
    description: 'Crea un servicio con tipo de limpieza, duración, precio y datos del cliente.',
    hint: 'Servicios → «Nuevo servicio».',
    route: '/saas/cleaning-services',
    checklist: ['Al menos un servicio creado', 'Con precio mayor que 0'],
  },
  {
    id: 'cleaning_clients',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Registra clientes',
    description: 'Centraliza contactos para contratos recurrentes y facturación.',
    hint: 'Clientes → «Nuevo cliente».',
    route: '/saas/vertical/limpieza/clientes',
    checklist: ['Al menos un cliente registrado'],
  },
  {
    id: 'cleaning_team',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-indigo-500 to-blue-600',
    title: 'Invita a tu equipo',
    description: 'Añade operarios o administradores para asignar servicios y rutas.',
    hint: 'Equipo → «Invitar usuario».',
    route: '/saas/equipo',
    checklist: ['Al menos un miembro del equipo invitado'],
  },
  {
    id: 'cleaning_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description: 'Completa nombre, CIF, dirección y teléfono para facturas y contratos.',
    hint: 'Ajustes → Empresa → icono lápiz en cada campo pendiente.',
    route: '/saas/settings/empresa',
    checklist: ['Nombre comercial', 'CIF / NIF', 'Dirección', 'Teléfono de contacto'],
  },
  {
    id: 'cleaning_operate',
    icon: <Rocket className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Listo para operar',
    description: 'Con servicios, clientes, equipo y datos fiscales ya puedes ejecutar trabajos.',
    hint: 'El hub de limpieza concentra servicios, ejecución y calidad.',
    route: '/saas/cleaning-hub',
    checklist: ['Servicios y clientes listos', 'Equipo y datos de empresa completos'],
  },
];

function buildCompraventaDoneStep(): OnboardingTourStep {
  return {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para tu compraventa!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta compraventa» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  };
}

function buildGymWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);
  const brand = 'Vertial Gimnasio';
  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en ${brand}`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a ${brand}`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = `Bienvenido a ${brand}`;
  }

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-400 to-purple-600',
    title,
    description: businessName
      ? `Configuraremos ${businessName} para gestionar socios, clases, cuotas y accesos desde un solo panel. Te guiamos paso a paso.`
      : 'Configuraremos tu gimnasio para gestionar socios, clases, cuotas y accesos desde un solo panel. Te guiamos paso a paso.',
    hint: 'En el menú lateral, «Alta gimnasio» indica en todo momento qué falta por completar.',
  };
}

function buildWorkshopWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);
  const brand = 'Vertial Taller';
  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en ${brand}`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a ${brand}`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = `Bienvenido a ${brand}`;
  }

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-400 to-amber-600',
    title,
    description: businessName
      ? `Configuraremos ${businessName} para gestionar OTs, clientes y recambios desde un solo panel. Te guiamos paso a paso.`
      : 'Configuraremos tu taller para gestionar órdenes de trabajo, clientes y recambios desde un solo panel. Te guiamos paso a paso.',
    hint: 'En el menú lateral, «Alta taller» indica en todo momento qué falta por completar.',
  };
}

function buildEventsWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);
  const brand = 'Vertial Eventos';
  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en ${brand}`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a ${brand}`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = `Bienvenido a ${brand}`;
  }

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-fuchsia-400 to-pink-600',
    title,
    description: businessName
      ? `Configuraremos ${businessName} para presupuestar, contratar y planificar eventos desde un solo panel. Sin TPV: el flujo va de presupuesto a pipeline y cierre.`
      : 'Configuraremos tu agencia de eventos para presupuestar, contratar y planificar desde un solo panel. Sin TPV: el flujo va de presupuesto a pipeline y cierre.',
    hint: 'En el menú lateral, «Alta eventos» indica en todo momento qué falta por completar.',
  };
}

const GYM_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'gym_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description: 'Completa nombre, CIF, dirección y teléfono para contratos y facturación.',
    hint: 'Ajustes → Empresa → icono lápiz en cada campo pendiente.',
    route: '/saas/settings/empresa',
    checklist: ['Nombre comercial', 'CIF / NIF', 'Dirección', 'Teléfono de contacto'],
  },
  {
    id: 'gym_members',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-teal-600',
    title: 'Registra socios',
    description: 'Da de alta miembros con plan, contacto y estado de membresía.',
    hint: 'Socios → «Nuevo socio».',
    route: '/saas/gym-members',
    checklist: ['Al menos un socio registrado'],
  },
  {
    id: 'gym_classes',
    icon: <Dumbbell className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Programa clases',
    description: 'Crea clases con instructor, horario, día y capacidad.',
    hint: 'Clases → «Nueva clase».',
    route: '/saas/gym-classes',
    checklist: ['Al menos una clase creada'],
  },
  {
    id: 'gym_memberships',
    icon: <Package className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Define cuotas',
    description: 'Configura planes de membresía con precios mensuales o anuales.',
    hint: 'Membresías → «Nueva cuota».',
    route: '/saas/gym-memberships',
    checklist: ['Al menos una cuota definida'],
  },
  {
    id: 'gym_operate',
    icon: <Rocket className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Listo para operar',
    description: 'Con socios, clases y cuotas ya puedes controlar accesos y fichajes.',
    hint: 'El hub del gimnasio concentra socios activos y actividad reciente.',
    route: '/saas/gym-hub',
    checklist: ['Empresa, socios y cuotas listos'],
  },
];

const WORKSHOP_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'workshop_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description: 'Completa nombre, CIF, dirección y teléfono para presupuestos y facturas.',
    hint: 'Ajustes → Empresa → icono lápiz en cada campo pendiente.',
    route: '/saas/settings/empresa',
    checklist: ['Nombre comercial', 'CIF / NIF', 'Dirección', 'Teléfono de contacto'],
  },
  {
    id: 'workshop_clients',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Registra clientes',
    description: 'Añade clientes y contactos para vincular órdenes de trabajo.',
    hint: 'Clientes → «Nuevo cliente».',
    route: '/saas/clientes',
    checklist: ['Al menos un cliente registrado'],
  },
  {
    id: 'workshop_orders',
    icon: <Wrench className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Abre la primera OT',
    description: 'Crea una orden de trabajo con vehículo, servicio y estado.',
    hint: 'Taller → «Nueva orden de trabajo».',
    route: '/saas/workshop',
    checklist: ['Al menos una OT creada'],
  },
  {
    id: 'workshop_parts',
    icon: <Package className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Gestiona recambios',
    description: 'Da de alta piezas, referencias y stock mínimo del taller.',
    hint: 'Recambios → «Nuevo recambio».',
    route: '/saas/parts',
    checklist: ['Al menos un recambio registrado'],
  },
  {
    id: 'workshop_operate',
    icon: <Rocket className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
    title: 'Listo para operar',
    description: 'Con clientes, OTs y recambios ya puedes operar el taller al completo.',
    hint: 'Invita mecánicos desde Equipo para asignar OTs.',
    route: '/saas/workshop',
    checklist: ['Clientes, OTs y recambios listos', 'Equipo invitado'],
  },
];

function buildGymDoneStep(): OnboardingTourStep {
  return {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para tu gimnasio!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta gimnasio» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  };
}

function buildWorkshopDoneStep(): OnboardingTourStep {
  return {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para tu taller!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta taller» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  };
}

function buildCleaningDoneStep(): OnboardingTourStep {
  return {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para limpieza!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta limpieza» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  };
}

const EVENTS_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'events_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description: 'Completa nombre, CIF, dirección y teléfono para presupuestos y contratos.',
    hint: 'Ajustes → Empresa → icono lápiz en cada campo pendiente.',
    route: '/saas/settings/empresa',
    checklist: ['Nombre comercial', 'CIF / NIF', 'Dirección', 'Teléfono de contacto'],
  },
  {
    id: 'events_services',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-fuchsia-500 to-pink-600',
    title: 'Arma tu catálogo de servicios',
    description: 'DJ, catering, coordinación… con precio fijo, por persona u hora. Es tu «carta» comercial, no un TPV.',
    hint: 'Servicios → «Nuevo servicio».',
    route: '/saas/events-services',
    checklist: ['Al menos un servicio creado', 'Con precio mayor que 0'],
  },
  {
    id: 'events_clients',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Registra clientes',
    description: 'Contactos a los que enviarás presupuestos y contratos de evento.',
    hint: 'Clientes → «Nuevo cliente».',
    route: '/saas/clients',
    checklist: ['Al menos un cliente registrado'],
  },
  {
    id: 'events_first_contract',
    icon: <FileText className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-teal-600',
    title: 'Crea tu primera contratación',
    description: 'El asistente arma el evento, las líneas de presupuesto y la fase inicial del pipeline.',
    hint: 'Eventos → «Nueva contratación».',
    route: '/saas/vertical/eventos/nueva-contratacion',
    checklist: ['Evento creado en el pipeline'],
  },
  {
    id: 'events_operate',
    icon: <PartyPopper className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Planifica y cierra eventos',
    description: 'Catering, logística y espacios se gestionan tras la contratación. El cierre es por fase, no por caja TPV.',
    hint: 'Hub de eventos → pipeline → detalle del proyecto.',
    route: '/saas/vertical/eventos',
    checklist: ['Pipeline operativo', 'Planificación y cierre por evento'],
  },
];

function buildEventsDoneStep(): OnboardingTourStep {
  return {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para eventos!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta eventos» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  };
}

export function getOnboardingTourSteps(
  businessType?: string | null,
  personalization?: OnboardingTourPersonalization,
): OnboardingTourStep[] {
  const t = String(businessType || '').trim();

  if (t === 'butcherShop') {
    return [
      {
        id: 'butcher_welcome',
        icon: <Package className="w-7 h-7 text-white" />,
        iconBg: 'bg-gradient-to-br from-red-500 to-rose-700',
        title: personalization?.businessName
          ? `Bienvenido a ${personalization.businessName}`
          : 'Bienvenido a tu carnicería',
        description:
          'En pocos pasos dejas listo el mostrador: productos a €/kg, báscula, primera venta y (si quieres) repartos a domicilio.',
        hint: 'Puedes repetir este tour desde Ayuda.',
      },
      {
        id: 'butcher_products',
        icon: <Package className="w-7 h-7 text-white" />,
        iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
        title: 'Crea tus cortes',
        description:
          'Da de alta productos con precio €/kg y stock mínimo. Ese listado es el mismo que verás en el TPV.',
        hint: 'Menú Carnicería → Productos.',
        route: '/saas/butcher-products',
        checklist: ['Al menos un corte con precio €/kg', 'Stock mínimo definido'],
      },
      {
        id: 'butcher_scale',
        icon: <Clock className="w-7 h-7 text-white" />,
        iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
        title: 'Configura la báscula',
        description:
          'Registra el dispositivo de pesaje. En el TPV podrás leer peso estable o introducir kg a mano.',
        route: '/saas/vertical/carniceria/basculas',
        checklist: ['Báscula registrada o modo manual listo'],
      },
      {
        id: 'butcher_tpv',
        icon: <Store className="w-7 h-7 text-white" />,
        iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
        title: 'Haz la primera venta',
        description:
          'Abre el TPV, elige un corte, pesa o introduce kg y cobra. El stock baja solo en el servidor.',
        route: '/saas/vertical/carniceria/tpv',
        checklist: ['Una venta cobrada en el TPV'],
      },
      {
        id: 'butcher_delivery',
        icon: <Tags className="w-7 h-7 text-white" />,
        iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
        title: '¿Repartos a domicilio?',
        description:
          'Opcional: activa repartos en la pantalla Repartos y crea encargos con dirección. Si no entregas, sáltate este paso.',
        route: '/saas/vertical/carniceria/reparto',
        checklist: ['Activar o decidir no usar repartos'],
      },
      {
        id: 'butcher_done',
        icon: <Building2 className="w-7 h-7 text-white" />,
        iconBg: 'bg-gradient-to-br from-gray-700 to-gray-900',
        title: '¡Carnicería lista!',
        description:
          'Ya tienes el flujo base. Usa Compras para lotes, Despiece para rendimientos y el Centro operativo para el día a día.',
        hint: 'Centro operativo: /saas/butcher-hub',
        route: '/saas/butcher-hub',
      },
    ];
  }

  if (!isGuidedActivationBusinessType(t)) return [];

  if (t === 'carDealership') {
    return [buildCompraventaWelcomeStep(personalization), ...COMPRAVENTA_TOUR_STEPS, buildCompraventaDoneStep()];
  }
  if (t === 'cleaning') {
    return [buildCleaningWelcomeStep(personalization), ...CLEANING_TOUR_STEPS, buildCleaningDoneStep()];
  }
  if (t === 'gym') {
    return [buildGymWelcomeStep(personalization), ...GYM_TOUR_STEPS, buildGymDoneStep()];
  }
  if (t === 'workshop') {
    return [buildWorkshopWelcomeStep(personalization), ...WORKSHOP_TOUR_STEPS, buildWorkshopDoneStep()];
  }
  if (t === 'events') {
    return [buildEventsWelcomeStep(personalization), ...EVENTS_TOUR_STEPS, buildEventsDoneStep()];
  }

  const variant = t === 'restaurant' ? 'restaurant' : 'delivery';
  const opsSteps =
    variant === 'restaurant' ? RESTAURANT_OPS_TOUR_STEPS_BEFORE_DONE : DELIVERY_OPS_TOUR_STEPS_BEFORE_DONE;
  return [
    buildOpsWelcomeStep(personalization, variant),
    ...opsSteps,
    buildOpsDoneStep(variant),
  ];
}
