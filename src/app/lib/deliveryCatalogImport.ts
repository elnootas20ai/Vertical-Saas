import { listBrandsRequest, type Brand } from './brandsApi';
import { isDefaultCommercialBrand, sortBrandsForDisplay } from './brandUtils';

function foldKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export type ResolveBrandIdsFromImportResult = {
  brandIds: string[];
  cache: Brand[];
  /** Siempre vacío: el import de catálogo no crea líneas comerciales en Ajustes → Marca. */
  createdNames: string[];
  /** Nombres del Excel que no coinciden con ninguna marca ya creada en la empresa. */
  unmatchedNames: string[];
};

/**
 * Resuelve texto de import (nombre de línea comercial o id) a brandIds del negocio.
 * Solo enlaza marcas existentes; nunca crea marcas nuevas (eso es Ajustes → Marca).
 */
export async function resolveBrandIdsFromImportText(
  businessId: string,
  marcaText: string,
  cache: Brand[],
  options?: { createMissing?: boolean },
): Promise<ResolveBrandIdsFromImportResult> {
  const bid = String(businessId || '').trim();
  const raw = String(marcaText || '').trim();
  if (!bid || !raw) {
    return { brandIds: [], cache, createdNames: [], unmatchedNames: [] };
  }

  /** Blindaje: import catálogo no debe crear marcas comerciales (p. ej. Coca-Cola del Excel). */
  const createMissing = options?.createMissing === true;
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
  const unmatchedNames: string[] = [];

  for (const part of parts) {
    const key = foldKey(part);
    const hit =
      brands.find((b) => b._id === part || b.id === part) ||
      brands.find((b) => foldKey(b.name) === key);
    if (!hit && createMissing) {
      // Reservado para flujos explícitos fuera del import Excel (no usado por defecto).
      unmatchedNames.push(part);
      continue;
    }
    if (!hit) {
      unmatchedNames.push(part);
      continue;
    }
    if (hit._id && !brandIds.includes(hit._id)) brandIds.push(hit._id);
  }

  return { brandIds, cache: brands, createdNames: [], unmatchedNames };
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
 * marca explícita (solo si existe en la empresa), vacío en categorías sin línea, o marca principal.
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

/** Aviso único tras import si el Excel trae marcas de producto (Coca-Cola…) en vez de líneas comerciales. */
export function formatUnmatchedCommercialBrandWarning(unmatchedNames: string[]): string | null {
  const unique = [...new Set(unmatchedNames.map((n) => String(n || '').trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  const sample = unique.slice(0, 8).join(', ');
  const extra = unique.length > 8 ? ` (+${unique.length - 8} más)` : '';
  return (
    `Columna «marca»: ${sample}${extra} no coincide con tus líneas en Ajustes → Marca. ` +
    'Esos productos se asignan a tu marca principal. No se crean marcas nuevas desde el Excel.'
  );
}
