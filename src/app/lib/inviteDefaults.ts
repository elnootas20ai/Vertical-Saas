import type { BusinessType } from './businessApi';
import { isDeliveryBusinessType } from './deliverySetup';
import { isRestaurantBusinessType } from './deliveryOpsTypes';
import { WORKER_DEFAULT_LANDING_PATH } from './workerProfileCompletion';

export const INVITE_LANDING_PAGE_DEFS = [
  { id: WORKER_DEFAULT_LANDING_PATH, key: 'worker' },
  { id: '/saas/vehicles', key: 'vehicles' },
  { id: '/saas/clients', key: 'clients' },
  { id: '/saas/sales', key: 'sales' },
  { id: '/saas/vertical/compraventa/ventas', key: 'sales-compraventa' },
  { id: '/saas/workshop', key: 'workshop' },
  { id: '/saas/documents', key: 'documents' },
  { id: '/saas/calendar', key: 'calendar' },
  { id: '/saas/delivery-reparto', key: 'delivery-reparto' },
  { id: '/saas/delivery-kitchen', key: 'delivery-kitchen' },
  { id: '/saas/delivery-ops', key: 'delivery-ops' },
  { id: '/saas/cocina', key: 'cocina' },
  { id: '/saas/payroll', key: 'payroll' },
  { id: '/saas/team', key: 'team' },
  { id: '/saas/realestate-visits', key: 'realestate-visits' },
  { id: '/saas/realestate-properties', key: 'realestate-properties' },
] as const;

export type InviteLandingPageId = (typeof INVITE_LANDING_PAGE_DEFS)[number]['id'];

const DELIVERY_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/delivery-reparto',
  '/saas/delivery-kitchen',
  '/saas/delivery-ops',
  '/saas/payroll',
  '/saas/team',
]);

const RETAIL_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/vehicles',
  '/saas/clients',
  '/saas/sales',
  '/saas/workshop',
  '/saas/documents',
  '/saas/calendar',
  '/saas/payroll',
  '/saas/team',
]);

const COMPRAVENTA_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/vehicles',
  '/saas/clients',
  '/saas/vertical/compraventa/ventas',
  '/saas/documents',
  '/saas/calendar',
  '/saas/payroll',
  '/saas/team',
]);

const RESTAURANT_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/cocina',
  '/saas/calendar',
  '/saas/payroll',
  '/saas/team',
]);

const GENERIC_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/documents',
  '/saas/calendar',
  '/saas/payroll',
  '/saas/team',
]);

const REAL_ESTATE_LANDING_IDS = new Set<InviteLandingPageId>([
  WORKER_DEFAULT_LANDING_PATH,
  '/saas/realestate-visits',
  '/saas/realestate-properties',
  '/saas/clients',
  '/saas/calendar',
  '/saas/documents',
  '/saas/payroll',
  '/saas/team',
]);

/** Páginas iniciales visibles según la vertical del negocio. */
export function getInviteLandingPagesForBusiness(
  businessType?: string | null,
): typeof INVITE_LANDING_PAGE_DEFS[number][] {
  const bt = (businessType || '') as BusinessType;
  if (isDeliveryBusinessType(bt)) {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => DELIVERY_LANDING_IDS.has(p.id));
  }
  if (isRestaurantBusinessType(bt)) {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => RESTAURANT_LANDING_IDS.has(p.id));
  }
  if (bt === 'carDealership') {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => COMPRAVENTA_LANDING_IDS.has(p.id));
  }
  if (bt === 'workshop' || bt === 'spareParts' || bt === 'scrapyard') {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => RETAIL_LANDING_IDS.has(p.id));
  }
  if (bt === 'realEstate') {
    return INVITE_LANDING_PAGE_DEFS.filter((p) => REAL_ESTATE_LANDING_IDS.has(p.id));
  }
  return INVITE_LANDING_PAGE_DEFS.filter((p) => GENERIC_LANDING_IDS.has(p.id));
}

function isHrManagerRole(role: string): boolean {
  return role === 'Gestor' || role === 'Administrador' || role === 'Encargado' || role === 'Gerente' || role === 'Admin';
}

/** Landing sugerida al elegir función (delivery y resto). */
export function getDefaultInviteLandingPage(
  businessType: string | null | undefined,
  roleId: string | null | undefined,
): InviteLandingPageId {
  const role = String(roleId || '').trim();
  if (isHrManagerRole(role)) return '/saas/payroll';

  if (isDeliveryBusinessType(businessType)) {
    if (role === 'Reparto') return '/saas/delivery-reparto';
    if (role === 'Cocina') return '/saas/delivery-kitchen';
    return WORKER_DEFAULT_LANDING_PATH;
  }
  if (isRestaurantBusinessType(businessType)) {
    if (role === 'Cocina') return '/saas/cocina';
    if (role === 'Mostrador / Atención' || role === 'Encargado') return '/saas/sala';
    return WORKER_DEFAULT_LANDING_PATH;
  }
  if (businessType === 'realEstate') {
    // Encargado/Gestor/Admin ya van a nóminas vía isHrManagerRole.
    if (role === 'Comercial') return '/saas/realestate-visits';
    return WORKER_DEFAULT_LANDING_PATH;
  }
  return WORKER_DEFAULT_LANDING_PATH;
}
