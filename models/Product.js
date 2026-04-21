/**
 * Product model — define las reglas de validación y los campos permitidos
 * para los ítems de catálogo (type: 'catalog_item') almacenados en CouchDB.
 *
 * No es un ORM: exporta helpers de validación y las constantes de esquema
 * que comparten el controller de búsqueda y el de delivery.
 */

import { getVerticalCatalogConfig } from './verticalCatalog.js';

export const PRODUCT_CATEGORIES = [
  'general',
  'repuesto',
  'accesorio',
  'consumible',
  'servicio',
  'lubricante',
  'neumatico',
  'carroceria',
  'electronica',
  'otros',
];

export const PRODUCT_UNITS = ['ud', 'kg', 'l', 'm', 'm2', 'h', 'par', 'set', 'caja'];

/**
 * Devuelve las categorías válidas para una vertical.
 * Si no hay config, usa PRODUCT_CATEGORIES como fallback.
 */
export function getCategoriesForVertical(businessType) {
  if (!businessType) return PRODUCT_CATEGORIES;
  const config = getVerticalCatalogConfig(businessType);
  return config.categories || PRODUCT_CATEGORIES;
}

/**
 * Devuelve las unidades disponibles para una vertical.
 */
export function getUnitsForVertical(businessType) {
  if (!businessType) return PRODUCT_UNITS;
  const config = getVerticalCatalogConfig(businessType);
  return (config.units || []).map((u) => u.value);
}

/**
 * Campos de texto en los que actúa el parámetro `?q=` de búsqueda libre.
 */
export const PRODUCT_SEARCH_FIELDS = ['name', 'description', 'sku', 'supplierName', 'category', 'notes', 'brandName'];

/**
 * Valida los parámetros de búsqueda avanzada recibidos en req.query.
 * Devuelve { ok, errors, params } donde `params` contiene los valores normalizados.
 *
 * Filtros soportados:
 *   q          — texto libre (name, description, sku, supplierName, category)
 *   category   — categoría exacta
 *   minPrice   — precio mínimo (unitPrice)
 *   maxPrice   — precio máximo (unitPrice)
 *   available  — "true" | "false"
 *   active     — "true" | "false"
 *   webVisible — "true" | "false"
 *   limit      — tamaño de página (1–500, default 20)
 *   skip       — offset (default 0)
 *   sort       — campo de ordenación, prefijo "-" para descendente
 */
export function parseSearchParams(query = {}) {
  const errors = [];
  const params = {};

  // Texto libre
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q.length > 200) errors.push('El parámetro q no puede superar 200 caracteres');
  else params.q = q;

  // Categoría
  const category = typeof query.category === 'string' ? query.category.trim().toLowerCase() : '';
  if (category && !PRODUCT_CATEGORIES.includes(category)) {
    errors.push(`Categoría inválida. Valores permitidos: ${PRODUCT_CATEGORIES.join(', ')}`);
  } else {
    params.category = category;
  }

  // Rango de precios
  const minPrice = query.minPrice !== undefined ? Number(query.minPrice) : null;
  const maxPrice = query.maxPrice !== undefined ? Number(query.maxPrice) : null;

  if (minPrice !== null && (isNaN(minPrice) || minPrice < 0)) {
    errors.push('minPrice debe ser un número >= 0');
  } else {
    params.minPrice = minPrice;
  }

  if (maxPrice !== null && (isNaN(maxPrice) || maxPrice < 0)) {
    errors.push('maxPrice debe ser un número >= 0');
  } else {
    params.maxPrice = maxPrice;
  }

  if (params.minPrice !== null && params.maxPrice !== null && params.minPrice > params.maxPrice) {
    errors.push('minPrice no puede ser mayor que maxPrice');
  }

  // Booleanos opcionales
  for (const flag of ['available', 'active', 'webVisible']) {
    if (query[flag] !== undefined) {
      const raw = String(query[flag]).toLowerCase();
      if (raw !== 'true' && raw !== 'false') {
        errors.push(`${flag} debe ser "true" o "false"`);
      } else {
        params[flag] = raw === 'true';
      }
    }
  }

  // Paginación
  const limit = query.limit !== undefined ? Math.min(500, Math.max(1, Number(query.limit))) : 20;
  const skip  = query.skip  !== undefined ? Math.max(0, Number(query.skip))  : 0;
  if (isNaN(limit)) errors.push('limit debe ser un número entero');
  else params.limit = limit;
  if (isNaN(skip))  errors.push('skip debe ser un número entero');
  else params.skip  = skip;

  // Ordenación
  const sort = typeof query.sort === 'string' ? query.sort.trim() : '-createdAt';
  params.sort = sort;

  return { ok: errors.length === 0, errors, params };
}

/**
 * Aplica los filtros específicos de producto sobre un array de documentos
 * ya saneados (sanitizeCatalogItem).
 *
 * @param {Array}  docs
 * @param {object} params — resultado de parseSearchParams().params
 * @returns {Array}
 */
export function filterProducts(docs, params = {}) {
  let result = Array.isArray(docs) ? [...docs] : [];

  // Texto libre
  if (params.q) {
    const needle = params.q.toLowerCase();
    result = result.filter((doc) =>
      PRODUCT_SEARCH_FIELDS.some((field) =>
        String(doc[field] ?? '').toLowerCase().includes(needle),
      ),
    );
  }

  // Categoría exacta
  if (params.category) {
    result = result.filter((doc) => (doc.category || '').toLowerCase() === params.category);
  }

  // Rango de precios
  if (params.minPrice !== null && params.minPrice !== undefined) {
    result = result.filter((doc) => Number(doc.unitPrice ?? 0) >= params.minPrice);
  }
  if (params.maxPrice !== null && params.maxPrice !== undefined) {
    result = result.filter((doc) => Number(doc.unitPrice ?? 0) <= params.maxPrice);
  }

  // Booleanos
  for (const flag of ['available', 'active', 'webVisible']) {
    if (params[flag] !== undefined) {
      result = result.filter((doc) => Boolean(doc[flag]) === params[flag]);
    }
  }

  return result;
}

/**
 * Pagina y ordena un array de documentos ya filtrados.
 *
 * @param {Array}  docs
 * @param {object} params — resultado de parseSearchParams().params
 * @returns {{ items: Array, meta: object }}
 */
export function paginateProducts(docs, params = {}) {
  const { limit = 20, skip = 0, sort = '-createdAt' } = params;
  const total = docs.length;

  // Ordenación
  const sortDesc = sort.startsWith('-');
  const sortField = sortDesc ? sort.slice(1) : sort;

  const sorted = [...docs].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    let cmp;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal), 'es', { numeric: true });
    }
    return sortDesc ? -cmp : cmp;
  });

  const items = sorted.slice(skip, skip + limit);

  return {
    items,
    meta: {
      total,
      skip,
      limit,
      hasMore: skip + limit < total,
      sort,
    },
  };
}
