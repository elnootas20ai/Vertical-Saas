/** Solo Delivery (bar/restaurante es vertical aparte). */
export const DELIVERY_OPS_BUSINESS_TYPES = ['delivery'] as const;

/** Verticales con checklist lateral y tour popup de alta. */
export const GUIDED_ACTIVATION_BUSINESS_TYPES = [
  ...DELIVERY_OPS_BUSINESS_TYPES,
  'restaurant',
  'carDealership',
  'cleaning',
  'gym',
  'workshop',
  'events',
  'butcherShop',
] as const;

export type DeliveryOpsBusinessType = (typeof DELIVERY_OPS_BUSINESS_TYPES)[number];
export type GuidedActivationBusinessType = (typeof GUIDED_ACTIVATION_BUSINESS_TYPES)[number];

export function isDeliveryOpsBusinessType(businessType?: string | null): boolean {
  const t = String(businessType || '').trim();
  return (DELIVERY_OPS_BUSINESS_TYPES as readonly string[]).includes(t);
}

export function isGuidedActivationBusinessType(businessType?: string | null): boolean {
  const t = String(businessType || '').trim();
  return (GUIDED_ACTIVATION_BUSINESS_TYPES as readonly string[]).includes(t);
}

export function isCleaningBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'cleaning';
}

export function isEventsBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'events';
}

/** Negocios con tienda / PDV / TPV en sidebar y ajustes. */
export function isRetailStoreBusinessType(businessType?: string | null): boolean {
  const t = String(businessType || '').trim();
  return isDeliveryOpsBusinessType(t) || t === 'restaurant' || t === 'carDealership' || t === 'butcherShop';
}

export function getGuidedActivationChecklistTitle(businessType?: string | null): string {
  const t = String(businessType || '').trim();
  if (t === 'restaurant') return 'Alta bar/restaurante';
  if (t === 'carDealership') return 'Alta compraventa';
  if (t === 'cleaning') return 'Alta limpieza';
  if (t === 'gym') return 'Alta gimnasio';
  if (t === 'workshop') return 'Alta taller';
  if (t === 'events') return 'Alta eventos';
  if (t === 'butcherShop') return 'Alta carnicería';
  return 'Alta delivery';
}

export function getGuidedActivationFirstStepId(businessType?: string | null): string | undefined {
  const t = String(businessType || '').trim();
  if (t === 'carDealership') return 'compraventa_store';
  if (t === 'cleaning') return 'cleaning_services';
  if (t === 'gym') return 'gym_company';
  if (t === 'workshop') return 'workshop_company';
  if (t === 'events') return 'events_company';
  if (t === 'butcherShop') return 'butcher_products';
  if (t === 'restaurant') return 'retail_store';
  if (isDeliveryOpsBusinessType(t)) return 'delivery_store';
  return undefined;
}

/** Solo reparto / dark kitchen — no bar-restauración sala. */
export function isStrictDeliveryBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'delivery';
}

export function isRestaurantBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'restaurant';
}

type BusinessScopeRef = {
  businessType?: string | null;
  business_id?: string;
  id?: string;
};

function normalizeScopeBusinessId(value?: string | null): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function businessTypeForScopeId(
  scopeBusinessId: string,
  businesses: BusinessScopeRef[],
): string | null {
  const scopeId = normalizeScopeBusinessId(scopeBusinessId);
  if (!scopeId) return null;
  const match = businesses.find(
    (b) => normalizeScopeBusinessId(b.business_id || b.id) === scopeId,
  );
  return match?.businessType ? String(match.businessType).trim() : null;
}

export type TpvTabletVerticalHint = 'delivery' | 'restaurant';

/** Fuente única: ¿TPV operativo en modo sala/mesas? Usa la empresa del scope (tablet/caja), no solo el selector global. */
export function resolveRestaurantVerticalFromContext(params: {
  currentBusiness?: BusinessScopeRef | null;
  businesses?: BusinessScopeRef[];
  scopeBusinessId?: string | null;
  /** Sesión tablet: vertical fijado por el código de tienda (no esperar al selector global). */
  isTabletSession?: boolean;
  tabletVertical?: TpvTabletVerticalHint | null;
}): boolean {
  if (params.isTabletSession && params.tabletVertical === 'restaurant') return true;
  if (params.isTabletSession && params.tabletVertical === 'delivery') return false;

  const businesses = params.businesses || [];
  const scopeId = normalizeScopeBusinessId(params.scopeBusinessId);
  if (scopeId && businesses.length > 0) {
    const scopedType = businessTypeForScopeId(scopeId, businesses);
    if (scopedType) return isRestaurantBusinessType(scopedType);
  }
  return isRestaurantBusinessType(params.currentBusiness?.businessType);
}

/** Mientras no sepamos el vertical del scope, no montar tablero delivery (evita flash en tablet). */
export function isTpvOpsVerticalPending(params: {
  currentBusiness?: BusinessScopeRef | null;
  businesses?: BusinessScopeRef[];
  scopeBusinessId?: string | null;
  businessesFetchSettled?: boolean;
  /** Sesión tablet: el código ya validó empresa y vertical en servidor. */
  isTabletSession?: boolean;
  tabletVertical?: TpvTabletVerticalHint | null;
}): boolean {
  const scopeId = normalizeScopeBusinessId(params.scopeBusinessId);
  if (params.isTabletSession && scopeId) {
    return false;
  }

  if (params.businessesFetchSettled === false) return true;
  const businesses = params.businesses || [];
  if (!scopeId) return false;
  if (businesses.length === 0) return true;
  return !businessTypeForScopeId(scopeId, businesses);
}
