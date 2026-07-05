/** Tipos que comparten el motor operativo de delivery (TPV, pedidos, cocina, caja). */
export const DELIVERY_OPS_BUSINESS_TYPES = ['delivery', 'restaurant'] as const;

/** Verticales con checklist lateral y tour popup de 5 pasos. */
export const GUIDED_ACTIVATION_BUSINESS_TYPES = [
  ...DELIVERY_OPS_BUSINESS_TYPES,
  'carDealership',
  'cleaning',
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

export function getGuidedActivationChecklistTitle(businessType?: string | null): string {
  const t = String(businessType || '').trim();
  if (t === 'restaurant') return 'Alta bar/restaurante';
  if (t === 'carDealership') return 'Alta compraventa';
  if (t === 'cleaning') return 'Alta limpieza';
  return 'Alta delivery';
}

export function getGuidedActivationFirstStepId(businessType?: string | null): string | undefined {
  const t = String(businessType || '').trim();
  if (t === 'carDealership') return 'compraventa_store';
  if (t === 'cleaning') return 'cleaning_services';
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

/** Fuente única: ¿TPV operativo en modo sala/mesas? Usa la empresa del scope (tablet/caja), no solo el selector global. */
export function resolveRestaurantVerticalFromContext(params: {
  currentBusiness?: BusinessScopeRef | null;
  businesses?: BusinessScopeRef[];
  scopeBusinessId?: string | null;
}): boolean {
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
}): boolean {
  if (params.businessesFetchSettled === false) return true;
  const businesses = params.businesses || [];
  const scopeId = normalizeScopeBusinessId(params.scopeBusinessId);
  if (!scopeId) return false;
  if (businesses.length === 0) return true;
  return !businessTypeForScopeId(scopeId, businesses);
}
