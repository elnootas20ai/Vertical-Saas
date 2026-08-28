/** Reglas de aplicación de un ítem de catálogo tipo «servicio» (cargos, suplementos, envío…). */

export type CatalogServiceApplicationMode = 'manual' | 'automatic' | 'both';

export type CatalogServiceDeliveryType = 'domicilio' | 'recogida' | 'sala';

export type CatalogServiceRules = {
  applicationMode: CatalogServiceApplicationMode;
  deliveryTypes: CatalogServiceDeliveryType[];
  brandScope: 'all' | 'selected';
  brandIds: string[];
  cashierCanRemove: boolean;
  tpvOnly: boolean;
};

export const CATALOG_SERVICE_CATEGORY = 'Servicios';

export const CATALOG_SERVICE_RULES_CF_KEY = 'catalogServiceRules';

export const DEFAULT_CATALOG_SERVICE_RULES: CatalogServiceRules = {
  applicationMode: 'manual',
  deliveryTypes: [],
  brandScope: 'all',
  brandIds: [],
  cashierCanRemove: true,
  tpvOnly: false,
};

export const CATALOG_SERVICE_APPLICATION_OPTIONS: Array<{
  value: CatalogServiceApplicationMode;
  label: string;
  desc: string;
}> = [
  { value: 'manual', label: 'Solo manual', desc: 'El cajero lo añade en TPV' },
  { value: 'automatic', label: 'Automático', desc: 'Entra solo si cumple reglas' },
  { value: 'both', label: 'Manual y auto', desc: 'Auto cuando toca; también se puede añadir' },
];

export const CATALOG_SERVICE_DELIVERY_TYPE_OPTIONS: Array<{
  value: CatalogServiceDeliveryType;
  label: string;
}> = [
  { value: 'domicilio', label: 'A domicilio' },
  { value: 'recogida', label: 'Recogida' },
  { value: 'sala', label: 'Sala / terraza' },
];

const VALID_DELIVERY_TYPES = new Set<CatalogServiceDeliveryType>(['domicilio', 'recogida', 'sala']);
const VALID_MODES = new Set<CatalogServiceApplicationMode>(['manual', 'automatic', 'both']);

function normalizeDeliveryTypes(raw: unknown): CatalogServiceDeliveryType[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogServiceDeliveryType[] = [];
  for (const v of raw) {
    const id = String(v || '').trim() as CatalogServiceDeliveryType;
    if (VALID_DELIVERY_TYPES.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeBrandIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
}

export function readCatalogServiceRules(
  customFields?: Record<string, unknown> | null,
): CatalogServiceRules {
  const raw = customFields?.[CATALOG_SERVICE_RULES_CF_KEY];
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CATALOG_SERVICE_RULES };
  const o = raw as Record<string, unknown>;
  const mode = String(o.applicationMode || '').trim() as CatalogServiceApplicationMode;
  const applicationMode = VALID_MODES.has(mode) ? mode : DEFAULT_CATALOG_SERVICE_RULES.applicationMode;
  const brandScope = o.brandScope === 'selected' ? 'selected' : 'all';
  const brandIds = normalizeBrandIds(o.brandIds);
  return {
    applicationMode,
    deliveryTypes: normalizeDeliveryTypes(o.deliveryTypes),
    brandScope: brandScope === 'selected' && brandIds.length > 0 ? 'selected' : 'all',
    brandIds: brandScope === 'selected' ? brandIds : [],
    cashierCanRemove: o.cashierCanRemove !== false,
    tpvOnly: o.tpvOnly === true,
  };
}

export function mergeCatalogServiceRulesIntoCustomFields(
  customFields: Record<string, unknown>,
  rules: CatalogServiceRules,
): Record<string, unknown> {
  const normalized: CatalogServiceRules = {
    applicationMode: VALID_MODES.has(rules.applicationMode)
      ? rules.applicationMode
      : DEFAULT_CATALOG_SERVICE_RULES.applicationMode,
    deliveryTypes: normalizeDeliveryTypes(rules.deliveryTypes),
    brandScope: rules.brandScope === 'selected' ? 'selected' : 'all',
    brandIds:
      rules.brandScope === 'selected' ? normalizeBrandIds(rules.brandIds) : [],
    cashierCanRemove: rules.cashierCanRemove !== false,
    tpvOnly: rules.tpvOnly === true,
  };
  if (normalized.brandScope === 'selected' && normalized.brandIds.length === 0) {
    normalized.brandScope = 'all';
  }
  return {
    ...customFields,
    [CATALOG_SERVICE_RULES_CF_KEY]: normalized,
  };
}

export function catalogServiceRulesNeedDeliveryTypes(rules: CatalogServiceRules): boolean {
  return rules.applicationMode === 'automatic' || rules.applicationMode === 'both';
}

export function validateCatalogServiceRules(rules: CatalogServiceRules): string | null {
  if (!catalogServiceRulesNeedDeliveryTypes(rules)) return null;
  if (rules.deliveryTypes.length === 0) {
    return 'Indica cuándo se aplica el servicio automático (domicilio, recogida o sala).';
  }
  if (rules.brandScope === 'selected' && rules.brandIds.length === 0) {
    return 'Elige al menos una marca comercial o deja «Todas las marcas».';
  }
  return null;
}

export function summarizeCatalogServiceRules(rules: CatalogServiceRules): string {
  const mode =
    CATALOG_SERVICE_APPLICATION_OPTIONS.find((o) => o.value === rules.applicationMode)?.label ||
    rules.applicationMode;
  const parts: string[] = [mode];
  if (catalogServiceRulesNeedDeliveryTypes(rules) && rules.deliveryTypes.length > 0) {
    const when = rules.deliveryTypes
      .map((id) => CATALOG_SERVICE_DELIVERY_TYPE_OPTIONS.find((o) => o.value === id)?.label || id)
      .join(', ');
    parts.push(when);
  }
  if (rules.brandScope === 'selected' && rules.brandIds.length > 0) {
    parts.push(`${rules.brandIds.length} marca(s)`);
  } else {
    parts.push('Todas las marcas');
  }
  if (rules.tpvOnly) parts.push('Solo TPV');
  if (!rules.cashierCanRemove && catalogServiceRulesNeedDeliveryTypes(rules)) {
    parts.push('No se puede quitar');
  }
  return parts.join(' · ');
}

export function brandIdsForCatalogServiceSave(rules: CatalogServiceRules): string[] {
  if (rules.brandScope === 'selected' && rules.brandIds.length > 0) {
    return normalizeBrandIds(rules.brandIds);
  }
  return [];
}
