import { createBrandRequest, listBrandsRequest, type Brand } from './brandsApi';
import { isDefaultCommercialBrand, sortBrandsForDisplay } from './brandUtils';

function foldKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Resuelve texto de import (nombre de marca o id) a brandIds del negocio.
 * Crea la marca si no existe y `createMissing` es true (por defecto sí en import).
 */
export async function resolveBrandIdsFromImportText(
  businessId: string,
  marcaText: string,
  cache: Brand[],
  options?: { createMissing?: boolean },
): Promise<{ brandIds: string[]; cache: Brand[]; createdNames: string[] }> {
  const bid = String(businessId || '').trim();
  const raw = String(marcaText || '').trim();
  if (!bid || !raw) return { brandIds: [], cache, createdNames: [] };

  const createMissing = options?.createMissing !== false;
  let brands = [...cache];
  if (brands.length === 0) {
    try {
      brands = await listBrandsRequest(bid);
    } catch {
      brands = [];
    }
  }

  const parts = raw.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
  const brandIds: string[] = [];
  const createdNames: string[] = [];

  for (const part of parts) {
    const key = foldKey(part);
    let hit =
      brands.find((b) => b._id === part || b.id === part) ||
      brands.find((b) => foldKey(b.name) === key);
    if (!hit && createMissing) {
      try {
        hit = await createBrandRequest(bid, { name: part, active: true });
        brands.push(hit);
        createdNames.push(part);
      } catch {
        /* skip */
      }
    }
    if (hit?._id && !brandIds.includes(hit._id)) brandIds.push(hit._id);
  }

  return { brandIds, cache: brands, createdNames };
}

export function normalizeImportCategory(value: string): string {
  return String(value || '').trim();
}

/** Bebidas/complementos: sin marca en import salvo que el Excel traiga marca explícita. */
export function shouldClearBrandForCategory(category: string): boolean {
  const c = foldKey(category);
  return (
    c === 'bebidas' ||
    c === 'bebida' ||
    c === 'complementos' ||
    c === 'complemento' ||
    c === 'extras' ||
    c === 'postres' ||
    c === 'postre' ||
    c === 'salsas' ||
    c === 'otros'
  );
}

/** Misma marca por defecto que el wizard manual de alta de producto. */
export function defaultBrandIdForCatalogImport(brands: Brand[]): string {
  const sorted = sortBrandsForDisplay(brands.filter((b) => b.active !== false));
  const pick =
    sorted.find((b) => isDefaultCommercialBrand(b)) ??
    sorted[0];
  return pick?._id ?? '';
}

/**
 * Asigna brandIds en import Excel/IA igual que al crear desde el modal:
 * marca explícita, vacío en categorías sin línea, o marca principal por defecto.
 */
export function resolveCatalogImportBrandIds(
  explicitBrandIds: string[],
  category: string,
  brands: Brand[],
): string[] {
  if (explicitBrandIds.length > 0) return explicitBrandIds;
  if (shouldClearBrandForCategory(category)) return [];
  const defaultId = defaultBrandIdForCatalogImport(brands);
  return defaultId ? [defaultId] : [];
}
