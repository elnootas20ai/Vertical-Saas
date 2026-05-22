/**
 * CRM Delivery (fidelización / campañas): módulo aparte del flujo «Alta delivery».
 * Con UI desactivada, cualquier enlace legacy redirige al módulo genérico de clientes.
 */
export const DELIVERY_CRM_UI_ENABLED = false;

/** Destino cuando el CRM delivery está oculto (clientes del SaaS). */
export const DELIVERY_CRM_REDIRECT_PATH = '/saas/clients';

export const DELIVERY_CRM_LEGACY_PATH = '/saas/delivery-crm';

/** Ruta CRM según vertical (nunca expone delivery-crm si UI desactivada). */
export function clientsRouteForVertical(vertical: string): string {
  if (vertical === 'delivery') {
    return DELIVERY_CRM_UI_ENABLED ? DELIVERY_CRM_LEGACY_PATH : DELIVERY_CRM_REDIRECT_PATH;
  }
  if (vertical === 'carDealership' || vertical === 'compraventa') {
    return '/saas/vertical/compraventa/crm';
  }
  return DELIVERY_CRM_REDIRECT_PATH;
}

/** Paso «clientes» del tour: mismo criterio (sin pantalla CRM delivery). */
export function tourClientsRoute(): string {
  return DELIVERY_CRM_UI_ENABLED ? DELIVERY_CRM_LEGACY_PATH : DELIVERY_CRM_REDIRECT_PATH;
}
