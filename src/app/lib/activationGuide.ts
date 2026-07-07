import { isRestaurantBusinessType } from './deliveryOpsTypes';

/** Query param: resalta un control o campo (?activar=catalog-import) */
export const ACTIVATION_FOCUS_PARAM = 'activar';

export type ActivationFieldGuide = {
  fieldKey: string;
  label: string;
  bannerTitle: string;
  bannerDetail: string;
};

export type ActivationSubStepGuide = {
  fieldKey?: string;
  /** Ruta si difiere del paso del checklist */
  route?: string;
  clickHint: string;
};

/** Guías de pantalla / controles (empresa, tienda, catálogo, CRM, etc.) */
export const ACTIVATION_FIELD_GUIDES: Record<string, ActivationFieldGuide> = {
  // Empresa
  name: {
    fieldKey: 'name',
    label: 'Nombre comercial',
    bannerTitle: 'Rellena el nombre comercial',
    bannerDetail: 'Icono ✏️ en tu empresa → «Nombre comercial».',
  },
  taxId: {
    fieldKey: 'taxId',
    label: 'CIF / NIF',
    bannerTitle: 'Añade el CIF o NIF',
    bannerDetail: 'En Editar empresa → «CIF / NIF».',
  },
  address: {
    fieldKey: 'address',
    label: 'Dirección',
    bannerTitle: 'Añade la dirección',
    bannerDetail: 'En Editar empresa → «Dirección».',
  },
  phone: {
    fieldKey: 'phone',
    label: 'Teléfono de contacto',
    bannerTitle: 'Añade el teléfono',
    bannerDetail: 'En Editar empresa → «Teléfono».',
  },
  // Tienda / PDV / horarios
  'create-store': {
    fieldKey: 'create-store',
    label: 'Crear tienda',
    bannerTitle: 'Crea tu primera tienda',
    bannerDetail: 'Pulsa «Nueva tienda / PDV» (arriba a la derecha) o el botón de abajo si la lista está vacía.',
  },
  'pdv-list': {
    fieldKey: 'pdv-list',
    label: 'Tiendas y cajas',
    bannerTitle: 'Revisa tus tiendas',
    bannerDetail: 'En Ajustes → Tienda verás cada local con su PDV y código tablet si aplica.',
  },
  'pdv-link': {
    fieldKey: 'pdv-list',
    label: 'Tienda y caja',
    bannerTitle: 'Completa la tienda',
    bannerDetail: 'Si falta el PDV, edita la tienda y guarda con dirección completa (mín. 5 caracteres).',
  },
  'store-hours': {
    fieldKey: 'store-hours',
    label: 'Horario de apertura',
    bannerTitle: 'Define el horario',
    bannerDetail: 'Se abrirá la tienda en el paso «Horarios» del asistente. Guarda al terminar.',
  },
  // Marca
  'create-brand': {
    fieldKey: 'create-brand',
    label: 'Crear carta',
    bannerTitle: 'Crea tu marca',
    bannerDetail: 'Se abre el asistente «Nueva línea comercial». Completa nombre, categorías y tiendas.',
  },
  'edit-brand': {
    fieldKey: 'edit-brand',
    label: 'Editar carta',
    bannerTitle: 'Personaliza tu marca',
    bannerDetail: 'Se abre el editor de la carta. Completa nombre, categorías y tiendas.',
  },
  'brand-name': {
    fieldKey: 'brand-name',
    label: 'Nombre de la carta',
    bannerTitle: 'Nombre visible de la marca',
    bannerDetail: 'Paso «Identidad» o «Qué vendes» → nombre de la línea comercial.',
  },
  // Catálogo
  'catalog-add': {
    fieldKey: 'catalog-add',
    label: 'Añadir producto',
    bannerTitle: 'Crea un producto',
    bannerDetail: 'Pulsa «Añadir manualmente» y rellena nombre y precio.',
  },
  'catalog-import': {
    fieldKey: 'catalog-import',
    label: 'Importar catálogo',
    bannerTitle: 'Importa tu carta',
    bannerDetail: 'Pulsa «Importar Excel» y sube tu fichero con productos y precios.',
  },
  // Clientes / ventas / equipo
  'client-add': {
    fieldKey: 'client-add',
    label: 'Nuevo cliente',
    bannerTitle: 'Crea un cliente',
    bannerDetail: 'Pulsa el botón de alta rápida de clientes.',
  },
  'client-import': {
    fieldKey: 'client-import',
    label: 'Importar clientes',
    bannerTitle: 'Importa clientes',
    bannerDetail: 'Usa el icono de subir (importar) en la barra de clientes/leads.',
  },
  'team-invite': {
    fieldKey: 'team-invite',
    label: 'Invitar al equipo',
    bannerTitle: 'Invita a alguien',
    bannerDetail: 'Pulsa «Invitar miembro» en Equipo.',
  },
  'sale-new': {
    fieldKey: 'sale-new',
    label: 'Nueva venta',
    bannerTitle: 'Registra una venta',
    bannerDetail: 'Pulsa el botón de nueva venta / operación.',
  },
  'open-tpv': {
    fieldKey: 'open-tpv',
    label: 'Abrir TPV',
    bannerTitle: 'Abre el TPV',
    bannerDetail: 'Entra al TPV rápido para cobrar cuando todo lo anterior esté listo.',
  },
  'events-service-add': {
    fieldKey: 'events-service-add',
    label: 'Nuevo servicio',
    bannerTitle: 'Crea un servicio de evento',
    bannerDetail: 'Servicios → «Nuevo servicio» → nombre, categoría y precio.',
  },
  'events-contract-new': {
    fieldKey: 'events-contract-new',
    label: 'Nueva contratación',
    bannerTitle: 'Crea tu primera contratación',
    bannerDetail: 'Eventos → «Nueva contratación» → asistente paso a paso.',
  },
  'doc-template': {
    fieldKey: 'doc-template',
    label: 'Plantilla de documento',
    bannerTitle: 'Crea una plantilla',
    bannerDetail: 'Ajustes → Plantillas → nueva plantilla o subir documento.',
  },
};

const RESTAURANT_ACTIVATION_FIELD_GUIDES: Partial<Record<string, ActivationFieldGuide>> = {
  'create-store': {
    fieldKey: 'create-store',
    label: 'Crear bar/restaurante',
    bannerTitle: 'Crea tu primer bar/restaurante',
    bannerDetail:
      'Pulsa «Nuevo bar/restaurante / PDV» (arriba a la derecha) o el botón de abajo si la lista está vacía.',
  },
  'pdv-list': {
    fieldKey: 'pdv-list',
    label: 'Locales y cajas',
    bannerTitle: 'Revisa tus locales',
    bannerDetail: 'En Ajustes → Bar/restaurante verás cada local con su PDV y código tablet si aplica.',
  },
  'pdv-link': {
    fieldKey: 'pdv-list',
    label: 'Local y caja',
    bannerTitle: 'Completa el local',
    bannerDetail:
      'Si falta el PDV, edita el bar/restaurante y guarda con dirección completa (mín. 5 caracteres).',
  },
  'store-hours': {
    fieldKey: 'store-hours',
    label: 'Horario de apertura',
    bannerTitle: 'Define el horario',
    bannerDetail:
      'Se abrirá el local en el paso «Horarios» del asistente. Guarda al terminar.',
  },
};

const RESTAURANT_ACTIVATION_SUBSTEP_GUIDES: Partial<Record<string, ActivationSubStepGuide>> = {
  retail_store: {
    fieldKey: 'create-store',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Bar/restaurante → «Nuevo bar/restaurante / PDV»',
  },
  active_pdv: {
    fieldKey: 'create-store',
    route: '/saas/settings/tienda',
    clickHint:
      'Ajustes → Bar/restaurante → crea o edita el local (el PDV y TPV se preparan solos)',
  },
  business_hours: {
    fieldKey: 'store-hours',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Bar/restaurante → editar local → paso Horarios',
  },
  branches: {
    fieldKey: 'create-store',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Bar/restaurante o centros de trabajo',
  },
};

/** Sub-pasos del checklist → acción concreta */
export const ACTIVATION_SUBSTEP_GUIDES: Record<string, ActivationSubStepGuide> = {
  // Delivery — tienda
  retail_store: {
    fieldKey: 'create-store',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Tienda → «Nueva tienda / PDV»',
  },
  active_pdv: {
    fieldKey: 'create-store',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Tienda → crea o edita la tienda (el PDV y TPV se preparan solos)',
  },
  // Delivery — marca
  brand_ready: {
    fieldKey: 'create-brand',
    route: '/saas/settings/marca?action=setup-brand',
    clickHint: 'Ajustes → Marca → asistente (completa o crea tu carta)',
  },
  // Delivery — catálogo
  first_product: {
    fieldKey: 'catalog-import',
    route: '/saas/catalog',
    clickHint: 'Catálogo → «Importar Excel» o añadir manualmente',
  },
  product_price: {
    fieldKey: 'catalog-add',
    route: '/saas/catalog',
    clickHint: 'Catálogo → producto con precio de venta > 0 €',
  },
  // Delivery — empresa
  company_name: {
    fieldKey: 'name',
    route: '/saas/settings/empresa',
    clickHint: 'Ajustes → Empresa → ✏️ → Nombre comercial',
  },
  tax_data: {
    fieldKey: 'taxId',
    route: '/saas/settings/empresa',
    clickHint: 'Ajustes → Empresa → ✏️ → CIF / NIF',
  },
  address: {
    fieldKey: 'address',
    route: '/saas/settings/empresa',
    clickHint: 'Ajustes → Empresa → ✏️ → Dirección',
  },
  contact: {
    fieldKey: 'phone',
    route: '/saas/settings/empresa',
    clickHint: 'Ajustes → Empresa → ✏️ → Teléfono',
  },
  // Delivery — operar
  business_hours: {
    fieldKey: 'store-hours',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Tienda → editar tienda → paso Horarios',
  },
  tpv_ready: {
    fieldKey: 'open-tpv',
    route: '/saas/delivery-ops',
    clickHint: 'Centro operativo → «TPV rápido» (o abre el TPV cuando todo esté listo)',
  },
  // Genérico — negocio
  branches: {
    fieldKey: 'create-store',
    route: '/saas/settings/tienda',
    clickHint: 'Ajustes → Tienda o centros de trabajo',
  },
  // Genérico — clientes
  first_client: {
    fieldKey: 'client-add',
    route: '/saas/clients',
    clickHint: 'Clientes → alta rápida o importar',
  },
  multiple_clients: {
    fieldKey: 'client-import',
    route: '/saas/clients',
    clickHint: 'Clientes → icono importar (CSV/Excel)',
  },
  // Genérico — catálogo / stock (first_product / product_price comparten id con delivery)
  multiple_products: {
    fieldKey: 'catalog-import',
    route: '/saas/catalog',
    clickHint: 'Catálogo → importar al menos 3 artículos',
  },
  stock_items: {
    fieldKey: 'catalog-import',
    route: '/saas/catalog',
    clickHint: 'Catálogo → existencias en cada producto',
  },
  stock_cost: {
    fieldKey: 'catalog-add',
    route: '/saas/catalog',
    clickHint: 'Catálogo → coste de compra en la ficha',
  },
  stock_location: {
    fieldKey: 'catalog-add',
    route: '/saas/catalog',
    clickHint: 'Catálogo → ubicación / almacén del artículo',
  },
  // Genérico — operativa
  team: {
    fieldKey: 'team-invite',
    route: '/saas/team',
    clickHint: 'Equipo → Invitar miembro',
  },
  documents: {
    fieldKey: 'doc-template',
    route: '/saas/settings/plantillas',
    clickHint: 'Ajustes → Plantillas → nueva plantilla',
  },
  first_client_sel: {
    fieldKey: 'client-add',
    route: '/saas/clients',
    clickHint: 'Clientes → crear o elegir un cliente',
  },
  first_sale: {
    fieldKey: 'sale-new',
    route: '/saas/sales',
    clickHint: 'Ventas → nueva operación',
  },
  events_catalog_service: {
    fieldKey: 'events-service-add',
    route: '/saas/events-services',
    clickHint: 'Servicios → «Nuevo servicio»',
  },
  events_catalog_price: {
    fieldKey: 'events-service-add',
    route: '/saas/events-services',
    clickHint: 'Servicios → servicio con precio > 0 €',
  },
  events_first_client: {
    fieldKey: 'client-add',
    route: '/saas/clients',
    clickHint: 'Clientes → alta rápida o importar',
  },
  events_first_event: {
    fieldKey: 'events-contract-new',
    route: '/saas/vertical/eventos/nueva-contratacion',
    clickHint: 'Eventos → «Nueva contratación»',
  },
  events_ops_ready: {
    route: '/saas/vertical/eventos',
    clickHint: 'Hub de eventos → pipeline y planificación',
  },
};

export function getActivationFieldGuide(
  fieldKey: string,
  businessType?: string | null,
): ActivationFieldGuide | null {
  const base = ACTIVATION_FIELD_GUIDES[fieldKey] ?? null;
  if (!base) return null;
  if (isRestaurantBusinessType(businessType)) {
    return RESTAURANT_ACTIVATION_FIELD_GUIDES[fieldKey] ?? base;
  }
  return base;
}

export function getSubStepGuide(
  subStepId: string,
  businessType?: string | null,
): ActivationSubStepGuide | null {
  const base = ACTIVATION_SUBSTEP_GUIDES[subStepId] ?? null;
  if (!base) return null;
  if (isRestaurantBusinessType(businessType)) {
    return RESTAURANT_ACTIVATION_SUBSTEP_GUIDES[subStepId] ?? base;
  }
  return base;
}

export function buildActivationTargetUrl(
  stepRoute: string,
  subStepId?: string,
  businessType?: string | null,
): string {
  const guide = subStepId ? getSubStepGuide(subStepId, businessType) : null;
  const base = String(guide?.route || stepRoute || '').trim() || '/saas/dashboard';
  if (!guide?.fieldKey) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${ACTIVATION_FOCUS_PARAM}=${encodeURIComponent(guide.fieldKey)}`;
}

export function clearActivationFocusFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete(ACTIVATION_FOCUS_PARAM);
  const next = params.toString();
  return next ? `?${next}` : '';
}
