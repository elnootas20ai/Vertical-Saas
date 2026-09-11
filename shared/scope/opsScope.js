/**
 * CORE Vertial — aislamiento ops (cuenta / empresa / tienda).
 *
 * Contrato:
 * - user_id = owner de la cuenta (workers remapean al owner).
 * - business_id = empresa activa; en multi-empresa (>=2) legacy sin bid NO se comparte.
 * - salesPointId / workCenterId = tienda cuando aplica.
 * - vertical = tipo de negocio (delivery, restaurant…); no sustituye business_id.
 */

export function normalizeOpsBusinessId(value) {
  return String(value || '')
    .replace(/^business:/, '')
    .trim();
}

export function normalizeOpsUserId(value) {
  const v = String(value || '').trim();
  return v.startsWith('account:') ? v.slice('account:'.length) : v;
}

/**
 * Lee businessId de query/body/params (prioridad query → body → params).
 */
export function resolveBusinessIdFromRequest(req) {
  return normalizeOpsBusinessId(
    req?.query?.businessId
      || req?.query?.business_id
      || req?.body?.businessId
      || req?.body?.business_id
      || req?.params?.businessId
      || '',
  );
}

export function resolveAccountBusinessCount(req, fallback = 1) {
  const fromQuery = Number(req?.query?.accountBusinessCount);
  if (Number.isFinite(fromQuery) && fromQuery >= 1) return Math.floor(fromQuery);
  return Math.max(1, Number(fallback) || 1);
}

/**
 * Sella campos de aislamiento en un doc ops (create/update merge).
 * No inventa business_id vacío: solo escribe si hay valor.
 */
export function stampOpsDoc(data = {}, {
  ownerUserId,
  businessId,
  salesPointId,
  workCenterId,
  vertical,
} = {}) {
  const out = data && typeof data === 'object' ? { ...data } : {};
  const uid = normalizeOpsUserId(ownerUserId || out.user_id || out.userId);
  if (uid) {
    out.user_id = uid;
  }
  const bid = normalizeOpsBusinessId(businessId || out.business_id || out.businessId);
  if (bid) {
    out.business_id = bid;
    out.businessId = bid;
  }
  const sp = String(
    salesPointId !== undefined ? salesPointId : (out.salesPointId || ''),
  ).trim();
  if (salesPointId !== undefined || sp) {
    out.salesPointId = sp;
  }
  const wc = String(
    workCenterId !== undefined ? workCenterId : (out.workCenterId || ''),
  ).trim();
  if (workCenterId !== undefined || wc) {
    out.workCenterId = wc;
  }
  const vert = String(vertical || out.vertical || '').trim().toLowerCase();
  if (vert) {
    out.vertical = vert;
  }
  return out;
}

/**
 * Filtro multi-empresa fail-closed:
 * - sin businessId → no filtra (caller decide)
 * - multi (>=2) + doc sin business_id → excluido
 * - doc con business_id distinto → excluido
 */
export function filterDocsForBusiness(
  docs,
  businessId,
  { multiEmpresa = false, accountBusinessCount } = {},
) {
  const bid = normalizeOpsBusinessId(businessId);
  if (!bid) return Array.isArray(docs) ? docs : [];
  const n =
    accountBusinessCount != null
      ? Math.max(1, Number(accountBusinessCount) || 1)
      : multiEmpresa
        ? 2
        : 1;
  const multi = n >= 2;
  return (Array.isArray(docs) ? docs : []).filter((doc) => {
    const docBid = normalizeOpsBusinessId(doc?.business_id || doc?.businessId);
    if (!docBid) return !multi;
    return docBid === bid;
  });
}

/** Alias estable para catálogo / compras (misma regla). */
export function filterCatalogDocsByBusinessScope(docs, businessId, accountBusinessCount = 1) {
  return filterDocsForBusiness(docs, businessId, { accountBusinessCount });
}
