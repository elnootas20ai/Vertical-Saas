export const RESTAURANT_PRODUCTION_AREAS = ['kitchen', 'bar'];

export function normalizeRestaurantProductionArea(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cocina') return 'kitchen';
  if (normalized === 'barra') return 'bar';
  return RESTAURANT_PRODUCTION_AREAS.includes(normalized) ? normalized : '';
}

function fold(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isRestaurantBeverageCategory(value) {
  const category = fold(value);
  if (!category) return false;
  return [
    'bebida',
    'bebidas',
    'refresco',
    'refrescos',
    'cerveza',
    'cervezas',
    'vino',
    'vinos',
    'cafe',
    'cafes',
    'coctel',
    'cocteles',
    'drink',
    'drinks',
    'beverage',
    'beverages',
  ].some((token) => category === token || category.startsWith(`${token} `));
}

export function catalogItemHasRecipe(item) {
  const customFields =
    item?.customFields && typeof item.customFields === 'object' ? item.customFields : {};
  if (Array.isArray(customFields.recipeLines) && customFields.recipeLines.length > 0) return true;
  if (String(customFields.ingredients || '').trim()) return true;
  return String(customFields.costingType || '').trim().toLowerCase() === 'recipe';
}

/**
 * Fuente única de compatibilidad para productos sin destino explícito.
 * Un valor guardado siempre gana; receta implica cocina; bebida implica barra;
 * el fallback seguro es cocina para no perder elaboraciones.
 */
export function resolveRestaurantProductionArea(item) {
  const explicit = normalizeRestaurantProductionArea(item?.productionArea);
  if (explicit) return explicit;
  if (catalogItemHasRecipe(item)) return 'kitchen';
  if (isRestaurantBeverageCategory(item?.category)) return 'bar';
  return 'kitchen';
}
