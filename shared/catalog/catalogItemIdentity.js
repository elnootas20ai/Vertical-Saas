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
