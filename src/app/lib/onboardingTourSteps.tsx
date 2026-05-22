import React from 'react';
import {
  Building2,
  Package,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Users,
  Settings,
  Store,
  Tags,
  Clock,
} from 'lucide-react';
import { tourClientsRoute } from './deliveryCrmFeature';
import { isDeliveryBusinessType } from './deliverySetup';

export interface OnboardingTourStep {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  hint?: string;
  route?: string;
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

function buildDeliveryWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);

  let title: string;
  if (firstName && businessName) {
    title = `Hola, ${firstName} — ${businessName} en Vertial Delivery`;
  } else if (firstName) {
    title = `Hola, ${firstName}. Bienvenido a Vertial Delivery`;
  } else if (businessName) {
    title = `Bienvenido, ${businessName}`;
  } else {
    title = 'Bienvenido a Vertial Delivery';
  }

  const description = businessName
    ? `Configuraremos ${businessName} para operar con locales, caja, carta y pedidos desde un solo panel. Te acompañamos en el orden adecuado para abrir tu primer local sin pasos en vano.`
    : 'Configuraremos tu negocio para operar con locales, caja, carta y pedidos desde un solo panel. Te acompañamos paso a paso para dejar tu primer local listo para vender.';

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    title,
    description,
    hint: 'En el menú lateral, «Alta delivery» indica en todo momento qué falta por completar.',
  };
}

function buildGenericWelcomeStep(p?: OnboardingTourPersonalization): OnboardingTourStep {
  const { firstName, businessName } = trimPersonalization(p);

  const title = firstName
    ? `Hola, ${firstName}. Bienvenido a Vertial`
    : businessName
      ? `Bienvenido, ${businessName}`
      : '¡Bienvenido a tu plataforma!';

  const description = businessName
    ? `Te mostramos cómo poner ${businessName} en marcha: datos de empresa, catálogo y operativa diaria, con una guía clara para no perderte.`
    : 'Te mostramos los módulos clave para poner tu negocio en marcha con una guía clara y sin rodeos.';

  return {
    id: 'welcome',
    icon: <Sparkles className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    title,
    description,
    hint: 'Puedes repetir este tour cuando quieras desde Ayuda → Tour interactivo.',
  };
}

const GENERIC_ONBOARDING_TOUR_STEPS_BODY: OnboardingTourStep[] = [
  {
    id: 'configure',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Configura tu negocio',
    description:
      'Empieza completando los datos de tu empresa: nombre comercial, datos fiscales, dirección y contacto. Así tus documentos y facturas saldrán con la información correcta.',
    hint: 'Accede desde Ajustes → Empresa para completar tu perfil.',
    route: '/saas/settings/empresa',
  },
  {
    id: 'clients',
    icon: <Users className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    title: 'Sube tus clientes',
    description:
      'Importa tu base de clientes desde Excel o créalos manualmente. Con el CRM integrado podrás gestionar clientes y leads desde un mismo sitio.',
    hint: 'Puedes importar clientes en bloque desde un fichero CSV o Excel.',
    route: tourClientsRoute(),
  },
  {
    id: 'catalog',
    icon: <Package className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    title: 'Crea tu catálogo',
    description:
      'Da de alta tus productos o servicios. Asigna categorías, precios, impuestos y toda la información necesaria para empezar a vender.',
    hint: 'Puedes añadir productos de uno en uno o importar en bloque.',
    route: '/saas/catalog',
  },
  {
    id: 'operations',
    icon: <Settings className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-gray-700 to-gray-900',
    title: 'Configura tu operativa',
    description:
      'Define la numeración de documentos, invita a tu equipo y configura los permisos básicos para que todos puedan trabajar.',
    hint: 'Accede a Ajustes para personalizar numeración, plantillas y roles.',
    route: '/saas/settings/numeracion',
  },
  {
    id: 'sales',
    icon: <TrendingUp className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Realiza tu primera venta',
    description:
      'Ya estás listo para crear tu primera operación. Registra una venta, genera el documento correspondiente y comprueba que todo funciona correctamente.',
    hint: 'Desde Ventas puedes crear operaciones y generar facturas.',
    route: '/saas/sales',
  },
  {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Todo listo para empezar!',
    description:
      'Ya conoces los módulos principales. En el Dashboard encontrarás la guía de arranque rápido para completar la configuración de tu negocio paso a paso.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  },
];

/** Tour post-login alineado al checklist «Alta delivery» (mismos pasos; la marca ya existe en borrador). */
const DELIVERY_ONBOARDING_TOUR_STEPS_BODY: OnboardingTourStep[] = [
  {
    id: 'delivery_store',
    icon: <Store className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
    title: 'Crea tu local y la caja',
    description:
      'Cada tienda es un local físico (nombre y dirección). Al darla de alta se crea el PDV, la caja del TPV de ese local. Puedes tener varios locales, cada uno con su PDV.',
    hint: 'Al crear la tienda también se prepara un borrador de carta (marca) vinculado al local.',
    route: '/saas/settings/tienda',
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
  },
  {
    id: 'delivery_company',
    icon: <Building2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    title: 'Revisa los datos de empresa',
    description:
      'Si acabas de registrarte, buena parte ya está guardada (nombre, CIF/NIF, dirección y teléfono). Entra solo para comprobar que todo es correcto o rellenar lo que falte en facturas y documentos — no hace falta volver a darlos todos.',
    hint: 'Ajustes → Empresa. En «Alta delivery» este paso se marca solo cuando falta algún dato.',
    route: '/saas/settings/empresa',
  },
  {
    id: 'delivery_operate',
    icon: <Clock className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
    title: 'Horarios y primer TPV',
    description:
      'Al crear o editar tu tienda, define el horario de apertura en el mismo asistente. Con local, marca y carta listos, ya puedes cobrar en el TPV.',
    hint: 'El horario queda guardado en cada local; el TPV se abre desde el dashboard.',
    route: '/saas/settings/tienda?action=horarios',
  },
  {
    id: 'done',
    icon: <CheckCircle2 className="w-7 h-7 text-white" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    title: '¡Listo para delivery!',
    description:
      'Ya conoces el flujo de arranque. En el menú lateral, «Alta delivery» te marca qué falta por completar hasta el 100%.',
    hint: 'Puedes volver a ver este tour desde Ayuda → Tour interactivo.',
  },
];

export function getOnboardingTourSteps(
  businessType?: string | null,
  personalization?: OnboardingTourPersonalization,
): OnboardingTourStep[] {
  if (isDeliveryBusinessType(businessType)) {
    return [buildDeliveryWelcomeStep(personalization), ...DELIVERY_ONBOARDING_TOUR_STEPS_BODY];
  }
  return [buildGenericWelcomeStep(personalization), ...GENERIC_ONBOARDING_TOUR_STEPS_BODY];
}
