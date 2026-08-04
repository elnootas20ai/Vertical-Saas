/**
 * Disponibilidad de carta en TPV sala (agotado desde cocina).
 */
import type { CatalogItem } from './deliveryApi';

export function isCatalogItemAvailableForSale(item: CatalogItem | null | undefined): boolean {
  if (!item) return false;
  if (item.active === false) return false;
  if (item.available === false) return false;
  return true;
}

type CartLineLike = { catalogItem?: CatalogItem | null };

/** Líneas del carrito cuyo producto está marcado agotado / inactivo. */
export function unavailableCartLines<T extends CartLineLike>(lines: T[]): T[] {
  return (lines || []).filter((line) => !isCatalogItemAvailableForSale(line.catalogItem));
}

export function formatUnavailableCartNames(lines: CartLineLike[]): string {
  const names = unavailableCartLines(lines)
    .map((l) => String(l.catalogItem?.name || 'Producto').trim())
    .filter(Boolean);
  return [...new Set(names)].join(', ');
}
