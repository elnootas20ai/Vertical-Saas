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
