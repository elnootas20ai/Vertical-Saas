import type { BusinessType } from './businessApi';
import { isDeliveryBusinessType } from './deliverySetup';
import { WORKER_DEFAULT_LANDING_PATH } from './workerProfileCompletion';

export const INVITE_LANDING_PAGE_DEFS = [
  { id: WORKER_DEFAULT_LANDING_PATH, key: 'worker' },
  { id: '/saas/vehicles', key: 'vehicles' },
  { id: '/saas/clients', key: 'clients' },
  { id: '/saas/sales', key: 'sales' },
  { id: '/saas/workshop', key: 'workshop' },
  { id: '/saas/documents', key: 'documents' },
  { id: '/saas/calendar', key: 'calendar' },
  { id: '/saas/delivery-reparto', key: 'delivery-reparto' },
  { id: '/saas/delivery-kitchen', key: 'delivery-kitchen' },
  { id: '/saas/delivery-ops', key: 'delivery-ops' },
] as const;

export type InviteLandingPageId = (typeof INVITE_LANDING_PAGE_DEFS)[number]['id'];

const DELIVERY_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/delivery-reparto',
  '/saas/delivery-kitchen',
  '/saas/delivery-ops',
]);

const RETAIL_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/vehicles',
  '/saas/clients',
  '/saas/sales',
  '/saas/workshop',
  '/saas/documents',
  '/saas/calendar',
]);

const GENERIC_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/documents',
  '/saas/calendar',
]);

/** Páginas iniciales visibles según la vertical del negocio. */
export function getInviteLandingPagesForBusiness(
  businessType?: string | null,
): typeof INVITE_LANDING_PAGE_DEFS[number][] {
  const bt = (businessType || '') as BusinessType;
  if (isDeliveryBusinessType(bt)) {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => DELIVERY_LANDING_IDS.has(p.id));
  }
  if (bt === 'carDealership' || bt === 'workshop' || bt === 'spareParts' || bt === 'scrapyard') {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => RETAIL_LANDING_IDS.has(p.id));
  }
  return INVITE_LANDING_PAGE_DEFS.filter((p) => GENERIC_LANDING_IDS.has(p.id));
}

/** Landing sugerida al elegir función (delivery y resto). */
export function getDefaultInviteLandingPage(
  businessType: string | null | undefined,
  roleId: string | null | undefined,
): InviteLandingPageId {
  const role = String(roleId || '').trim();
  if (isDeliveryBusinessType(businessType)) {
    if (role === 'Reparto') return '/saas/delivery-reparto';
    if (role === 'Cocina') return '/saas/delivery-kitchen';
    if (role === 'Encargado' || role === 'Administrador') return '/saas/delivery-ops';
    return WORKER_DEFAULT_LANDING_PATH;
  }
  if (role === 'Administrador' || role === 'Encargado') return WORKER_DEFAULT_LANDING_PATH;
  return WORKER_DEFAULT_LANDING_PATH;
}
