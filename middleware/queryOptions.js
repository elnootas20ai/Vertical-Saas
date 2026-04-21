/**
 * B-01: Paginación y filtrado genérico para endpoints de lista.
 *
 * Parámetros de query string soportados:
 *   ?limit=50        Número máximo de items por página (1–500, default 100)
 *   ?skip=0          Offset de registros a saltarse (default 0)
 *   ?sort=field      Ordenar por campo ascendente
 *   ?sort=-field     Ordenar por campo descendente (prefijo -)
 *   ?filter[field]=value   Filtrar por campo exacto/parcial (objeto)
 *   ?filter=field:value    Filtrar por campo (formato string)
 *   ?search=texto    Búsqueda de texto libre en campos comunes (name, email, etc.)
 *
 * Retorna: { items, meta: { total, skip, limit, hasMore, sort, filter } }
 */

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Campos en los que actúa el parámetro ?search=
 * cuando no se especifica un campo concreto.
 */
const SEARCH_FIELDS = ['name', 'email', 'phone', 'registrationPlate', 'brand', 'model',
  'clientName', 'vehicleName', 'concept', 'companyName', 'vin'];

/**
 * Aplica filtrado, búsqueda, ordenación y paginación sobre un array de documentos.
 *
 * @param {Array}  docs   - Array de documentos a procesar
 * @param {object} query  - req.query del request HTTP
 * @returns {{ items: Array, meta: object }}
 */
export function applyQueryOptions(docs, query = {}) {
  let result = Array.isArray(docs) ? [...docs] : [];

  // ── 1. Filtrado por campo ──────────────────────────────────────────────────
  const filterParam = query.filter;
  if (filterParam) {
    if (typeof filterParam === 'object' && !Array.isArray(filterParam)) {
      // ?filter[field]=value
      for (const [field, value] of Object.entries(filterParam)) {
        const needle = String(value ?? '').toLowerCase();
        if (needle) {
          result = result.filter((doc) =>
            String(doc[field] ?? '').toLowerCase().includes(needle),
          );
        }
      }
    } else if (typeof filterParam === 'string' && filterParam.includes(':')) {
      // ?filter=field:value
      const colonIdx = filterParam.indexOf(':');
      const field = filterParam.slice(0, colonIdx);
      const value = filterParam.slice(colonIdx + 1);
      const needle = value.toLowerCase();
      if (field && needle) {
        result = result.filter((doc) =>
          String(doc[field] ?? '').toLowerCase().includes(needle),
        );
      }
    }
  }

  // ── 2. Búsqueda de texto libre ─────────────────────────────────────────────
  const searchParam = typeof query.search === 'string' ? query.search.trim() : '';
  if (searchParam) {
    const needle = searchParam.toLowerCase();
    result = result.filter((doc) =>
      SEARCH_FIELDS.some((field) =>
        String(doc[field] ?? '').toLowerCase().includes(needle),
      ),
    );
  }

  // ── 3. Ordenación ──────────────────────────────────────────────────────────
  const sortParam = typeof query.sort === 'string' ? query.sort.trim() : '';
  let sortField = '';
  let sortDesc = false;
  if (sortParam) {
    sortDesc = sortParam.startsWith('-');
    sortField = sortDesc ? sortParam.slice(1) : sortParam;
    result = result.sort((a, b) => {
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
  }

  // ── 4. Paginación ──────────────────────────────────────────────────────────
  // Si no se especifica ?limit= se devuelven todos los registros (retrocompat).
  const total = result.length;
  const hasPagination = query.limit !== undefined || query.skip !== undefined;
  const skip  = Math.max(0, Number(query.skip  ?? 0));
  const limit = hasPagination
    ? Math.min(MAX_LIMIT, Math.max(1, Number(query.limit ?? DEFAULT_LIMIT)))
    : total;

  const items = hasPagination ? result.slice(skip, skip + limit) : result;

  return {
    items,
    meta: {
      total,
      skip,
      limit,
      hasMore: skip + limit < total,
      ...(sortField ? { sort: sortParam } : {}),
      ...(filterParam ? { filter: filterParam } : {}),
      ...(searchParam ? { search: searchParam } : {}),
    },
  };
}
