/** Normaliza texto para claves de identidad de catálogo (import, dedupe, upsert). */
export function normalizeCatalogItemIdentityValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Clave estable: SKU si existe; si no, nombre + categoría dentro de módulo/empresa. */
export function catalogImportIdentityKey(item) {
  const moduleKey = String(item?.module || 'catalog');
  const businessKey = String(item?.business_id || item?.businessId || '').trim();
  const sku = normalizeCatalogItemIdentityValue(item?.sku);
  if (sku) return `${moduleKey}|${businessKey}|sku|${sku}`;

  const name = normalizeCatalogItemIdentityValue(item?.name);
  const category = normalizeCatalogItemIdentityValue(item?.category);
  return `${moduleKey}|${businessKey}|name|${name}::${category}`;
}

/** Clave laxa para dedupe UI: mismo producto de carta (nombre + categoría + módulo). */
export function catalogLooseIdentityKey(item) {
  const moduleKey = String(item?.module || 'catalog');
  const name = normalizeCatalogItemIdentityValue(item?.name);
  const category = normalizeCatalogItemIdentityValue(item?.category);
  return `${moduleKey}|name|${name}::${category}`;
}

/** ¿Mismo producto importable/legacy (ignora SKU distinto o business_id vacío)? */
export function isSameLooseCatalogProduct(a, b) {
  if (!a || !b) return false;
  if (String(a?.module || 'catalog') !== String(b?.module || 'catalog')) return false;
  if (normalizeCatalogItemIdentityValue(a?.name) !== normalizeCatalogItemIdentityValue(b?.name)) {
    return false;
  }
  if (
    normalizeCatalogItemIdentityValue(a?.category) !== normalizeCatalogItemIdentityValue(b?.category)
  ) {
    return false;
  }
  const aBiz = String(a?.business_id || a?.businessId || '').trim();
  const bBiz = String(b?.business_id || b?.businessId || '').trim();
  if (aBiz && bBiz && aBiz !== bBiz) return false;
  return true;
}

export function buildCatalogImportIndexes(existingItems) {
  const byStrict = new Map();
  const byLoose = new Map();
  for (const existing of existingItems || []) {
    if (!existing) continue;
    const strict = catalogImportIdentityKey(existing);
    if (!byStrict.has(strict)) byStrict.set(strict, existing);
    const loose = catalogLooseIdentityKey(existing);
    if (!byLoose.has(loose)) byLoose.set(loose, []);
    byLoose.get(loose).push(existing);
  }
  return { byStrict, byLoose };
}

/** Resuelve artículo existente para upsert de import (estricto → laxo → legacy sin empresa). */
export function resolveExistingCatalogItemForImport(doc, indexes) {
  if (!doc || !indexes) return null;

  const strict = catalogImportIdentityKey(doc);
  const strictHit = indexes.byStrict.get(strict);
  if (strictHit) return strictHit;

  const loose = catalogLooseIdentityKey(doc);
  const candidates = indexes.byLoose.get(loose) || [];
  if (candidates.length === 0) return null;

  const docBiz = String(doc?.business_id || doc?.businessId || '').trim();
  const sameBiz = candidates.find(
    (c) => String(c?.business_id || c?.businessId || '').trim() === docBiz,
  );
  if (sameBiz) return sameBiz;

  const legacy = candidates.find((c) => !String(c?.business_id || c?.businessId || '').trim());
  if (legacy) return legacy;

  return candidates.find((c) => isSameLooseCatalogProduct(c, doc)) || null;
}

/** SKU estable cuando el Excel no trae código (evita duplicados en reimport). */
export function buildStableImportCatalogSku(item) {
  const explicit = String(item?.sku || '').trim();
  if (explicit) return explicit.slice(0, 64);

  const slug = (value) =>
    normalizeCatalogItemIdentityValue(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);

  const name = slug(item?.name);
  const category = slug(item?.category);
  const base = [category, name].filter(Boolean).join('-').replace(/-+/g, '-');
  if (!base) return '';
  return `VT-${base}`.slice(0, 64);
}
