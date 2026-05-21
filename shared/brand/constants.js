/** Nombre de la línea comercial por defecto (delivery y multi-línea). */
export const DEFAULT_COMMERCIAL_BRAND_NAME = 'General';

export function normalizeBrandNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isDefaultCommercialBrandName(name) {
  return normalizeBrandNameKey(name) === normalizeBrandNameKey(DEFAULT_COMMERCIAL_BRAND_NAME);
}
