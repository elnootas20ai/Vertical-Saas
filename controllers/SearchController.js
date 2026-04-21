/**
 * SearchController — búsqueda avanzada sobre el catálogo de productos.
 *
 * Endpoints:
 *   GET /api/search/catalog/:userId          Búsqueda avanzada con filtros
 *   GET /api/search/catalog/:userId/facets   Facetas disponibles (categorías, rangos)
 */

import {
  getCatalogDbName,
  listCatalogItemsByUser,
  sanitizeCatalogItem,
  findAccountByUserId,
  ensureDatabase,
} from '../services/couchdb.js';
import { parseSearchParams, filterProducts, paginateProducts, PRODUCT_CATEGORIES } from '../models/Product.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

/**
 * GET /api/search/catalog/:userId
 *
 * Query params:
 *   q          — texto libre
 *   category   — categoría exacta
 *   minPrice   — precio mínimo unitario
 *   maxPrice   — precio máximo unitario
 *   available  — true | false
 *   active     — true | false
 *   webVisible — true | false
 *   limit      — ítems por página (default 20, máx 500)
 *   skip       — offset (default 0)
 *   sort       — campo de orden, "-campo" para desc (default -createdAt)
 */
export async function searchCatalog(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { ok, errors, params } = parseSearchParams(req.query);
    if (!ok) return badRequest(res, errors.join('; '));

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const raw = await listCatalogItemsByUser(req, userId);
    const docs = raw.map(sanitizeCatalogItem).filter(Boolean);

    const filtered = filterProducts(docs, params);
    const { items, meta } = paginateProducts(filtered, params);

    return res.json({
      ok: true,
      items,
      meta: {
        ...meta,
        query: {
          q: params.q || null,
          category: params.category || null,
          minPrice: params.minPrice,
          maxPrice: params.maxPrice,
          available: params.available,
          active: params.active,
          webVisible: params.webVisible,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en la búsqueda' });
  }
}

/**
 * GET /api/search/catalog/:userId/facets
 *
 * Devuelve los valores únicos disponibles para filtrar:
 *   categories — lista de categorías con su conteo
 *   priceRange — { min, max } del catálogo completo
 *   totalItems — total de ítems activos
 */
export async function catalogFacets(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const raw = await listCatalogItemsByUser(req, userId);
    const docs = raw.map(sanitizeCatalogItem).filter(Boolean);

    // Conteo por categoría
    const categoryCounts = {};
    for (const cat of PRODUCT_CATEGORIES) categoryCounts[cat] = 0;
    for (const doc of docs) {
      const cat = (doc.category || 'general').toLowerCase();
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    const categories = Object.entries(categoryCounts)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Rango de precios
    const prices = docs.map((d) => Number(d.unitPrice || 0));
    const priceRange = {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };

    return res.json({
      ok: true,
      facets: {
        categories,
        priceRange,
        totalItems: docs.length,
        activeItems: docs.filter((d) => d.active).length,
        availableItems: docs.filter((d) => d.available).length,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener facetas' });
  }
}
