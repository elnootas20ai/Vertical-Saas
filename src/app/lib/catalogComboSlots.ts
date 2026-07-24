import type { CatalogComboRef, CatalogItem } from './deliveryApi';
import { normalizeImportCategory } from './deliveryCatalogImportLogic';

/** Tipo de componente dentro de un menú / combo. */
export type ComboSlotKind = 'main' | 'drink' | 'dessert' | 'side' | 'other';

export type ComboStructureSlot = {
  slotKind: ComboSlotKind;
  label: string;
  required: boolean;
  /** Cuántos productos distintos van en este hueco (p. ej. 2 pizzas en Dúo). */
  expectedCount?: number;
};

export type ComboSlotMeta = {
  kind: ComboSlotKind;
  label: string;
  shortLabel: string;
  hint: string;
  emoji: string;
  /** Categorías de catálogo que encajan en este hueco. */
  categoryPatterns: RegExp[];
};

export const COMBO_SLOT_META: Record<ComboSlotKind, ComboSlotMeta> = {
  main: {
    kind: 'main',
    label: 'Plato principal',
    shortLabel: 'Pizza o burger',
    hint: 'Todo lo de categoría Pizzas o Burgers en tu catálogo',
    emoji: '🍕',
    categoryPatterns: [/pizza/i, /burger/i, /hamburg/i],
  },
  drink: {
    kind: 'drink',
    label: 'Bebida',
    shortLabel: 'Bebida',
    hint: 'Refresco, agua, cerveza…',
    emoji: '🥤',
    categoryPatterns: [/bebida/i, /refresco/i, /caf[eé]/i, /cerveza/i],
  },
  dessert: {
    kind: 'dessert',
    label: 'Postre',
    shortLabel: 'Postre',
    hint: 'Tarta, helado, postre del menú',
    emoji: '🍰',
    categoryPatterns: [/postre/i, /helado/i, /boller/i, /dulce/i],
  },
  side: {
    kind: 'side',
    label: 'Complemento',
    shortLabel: 'Complemento',
    hint: 'Patatas, alitas, extras del menú…',
    emoji: '🍟',
    categoryPatterns: [/complemento/i, /acompa/i, /guarnici/i],
  },
  other: {
    kind: 'other',
    label: 'Otro',
    shortLabel: 'Otro',
    hint: 'Cualquier otro producto',
    emoji: '📦',
    categoryPatterns: [],
  },
};

/** Menú estándar Modomio: pizza + complemento + bebida. */
export const DEFAULT_COMBO_STRUCTURE: ComboStructureSlot[] = [
  { slotKind: 'main', label: 'Pizza o burger', required: true, expectedCount: 1 },
  { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
  { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
];

/** Orden visual al definir y rellenar el menú. */
export const COMBO_MENU_SECTION_ORDER: ComboSlotKind[] = ['main', 'side', 'drink', 'dessert', 'other'];

export type ComboSectionDraft = {
  enabled: boolean;
  count: number;
};

export const DEFAULT_COMBO_SECTION_DRAFT: Record<'main' | 'side' | 'drink' | 'dessert', ComboSectionDraft> = {
  main: { enabled: true, count: 1 },
  side: { enabled: true, count: 1 },
  drink: { enabled: true, count: 1 },
  dessert: { enabled: false, count: 1 },
};

export function structureFromSectionDraft(
  draft: Record<'main' | 'side' | 'drink' | 'dessert', ComboSectionDraft>,
): ComboStructureSlot[] {
  const out: ComboStructureSlot[] = [];
  for (const kind of COMBO_MENU_SECTION_ORDER) {
    if (kind === 'other') continue;
    const row = draft[kind as keyof typeof draft];
    if (!row?.enabled) continue;
    const meta = COMBO_SLOT_META[kind];
    const count = Math.max(1, row.count);
    out.push({
      slotKind: kind,
      label: count > 1 ? `${meta.shortLabel} (×${count})` : meta.shortLabel,
      required: kind !== 'dessert',
      expectedCount: count,
    });
  }
  return out;
}

export function draftFromStructure(structure: ComboStructureSlot[]): Record<
  'main' | 'side' | 'drink' | 'dessert',
  ComboSectionDraft
> {
  const draft = {
    main: { enabled: false, count: 1 },
    side: { enabled: false, count: 1 },
    drink: { enabled: false, count: 1 },
    dessert: { enabled: false, count: 1 },
  };
  for (const slot of structure) {
    if (slot.slotKind in draft) {
      draft[slot.slotKind as keyof typeof draft] = {
        enabled: true,
        count: Math.max(1, slot.expectedCount ?? 1),
      };
    }
  }
  return draft;
}

export function isComboStructureConfirmed(
  customFields: Record<string, unknown> | undefined,
  comboItemsCount = 0,
): boolean {
  if (customFields?.comboStructureConfirmed === true) return true;
  if (comboItemsCount > 0) return true;
  const raw = customFields?.comboStructure;
  return Array.isArray(raw) && raw.length > 0;
}

export function validateComboSectionDraft(
  draft: Record<'main' | 'side' | 'drink' | 'dessert', ComboSectionDraft>,
): string | null {
  if (!draft.main.enabled) return 'El menú debe incluir pizza';
  if (!draft.side.enabled) return 'El menú debe incluir complemento';
  if (!draft.drink.enabled) return 'El menú debe incluir bebida';
  return null;
}

export type ComboMenuPreset = {
  id: string;
  label: string;
  hint: string;
  structure: ComboStructureSlot[];
};

/** Plantillas rápidas para definir qué lleva el menú. */
export const COMBO_MENU_PRESETS: ComboMenuPreset[] = [
  {
    id: 'estandar',
    label: 'Individual',
    hint: '1 pizza + 1 complemento + 1 bebida',
    structure: DEFAULT_COMBO_STRUCTURE,
  },
  {
    id: 'duo',
    label: 'Dúo',
    hint: '2 pizzas + 1 complemento + 2 bebidas',
    structure: [
      { slotKind: 'main', label: 'Pizzas (×2)', required: true, expectedCount: 2 },
      { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
      { slotKind: 'drink', label: 'Bebidas (×2)', required: true, expectedCount: 2 },
    ],
  },
  {
    id: 'familiar',
    label: 'Familiar',
    hint: '3 pizzas + 2 complementos + 4 bebidas',
    structure: [
      { slotKind: 'main', label: 'Pizzas (×3)', required: true, expectedCount: 3 },
      { slotKind: 'side', label: 'Complementos (×2)', required: true, expectedCount: 2 },
      { slotKind: 'drink', label: 'Bebidas (×4)', required: true, expectedCount: 4 },
    ],
  },
  {
    id: 'con_postre',
    label: 'Con postre',
    hint: 'Pizza + complemento + bebida + postre',
    structure: [
      { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
      { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
      { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
      { slotKind: 'dessert', label: 'Postre', required: false, expectedCount: 1 },
    ],
  },
];

export type ComboMainFamily = 'pizza' | 'burger';

/** Sección del menú — nombres como en el Excel (Pizzas, Complementos, Bebidas…). */
export type ComboMenuCatalogSection = {
  /** Título visible (siempre el nombre estándar salvo platos principales). */
  catalogCategory: string;
  slotKind: ComboSlotKind;
  expectedCount: number;
  required: boolean;
  slotQuota: number;
  /** Si true, incluye productos de Sides, Entrantes, etc. bajo «Complementos». */
  groupBySlotKind?: boolean;
  /** Plato principal: agrupa Pizzas + Premium / Burgers en un solo bloque. */
  groupByMainFamily?: ComboMainFamily;
};

const MAIN_CATEGORY_ORDER = [
  'Pizzas',
  'Pizzas Premium',
  'Premium',
  'Especialidad',
  'Top Burgers',
  'Burgers',
  'Hamburguesas',
  'Rolls',
  'Bowls',
  'Calzones',
  'Principales',
] as const;

const SIDE_CATEGORY_ORDER = ['Complementos', 'Sides', 'Entrantes', 'Extras', 'Salsas'] as const;

const DRINK_CATEGORY_ORDER = ['Bebidas', 'Refrescos', 'Cervezas', 'Café'] as const;

const DESSERT_CATEGORY_ORDER = ['Postres', 'Helados', 'Bollería'] as const;

const SLOT_CATEGORY_ORDER: Record<Exclude<ComboSlotKind, 'other'>, readonly string[]> = {
  main: MAIN_CATEGORY_ORDER,
  side: SIDE_CATEGORY_ORDER,
  drink: DRINK_CATEGORY_ORDER,
  dessert: DESSERT_CATEGORY_ORDER,
};

const DEFAULT_SECTION_LABEL: Record<Exclude<ComboSlotKind, 'other'>, string> = {
  main: 'Pizzas',
  side: 'Complementos',
  drink: 'Bebidas',
  dessert: 'Postres',
};

function sellableCatalogProducts(catalog: CatalogItem[], excludeItemId?: string): CatalogItem[] {
  return catalog.filter(
    (c) =>
      c.active !== false &&
      c._id !== excludeItemId &&
      c.itemType !== 'combo' &&
      c.itemType !== 'service',
  );
}

/** Categorías reales del catálogo para un hueco del menú (Pizzas, Sides, Bebidas…). */
export function uniqueCatalogCategoriesForSlotKind(
  slotKind: ComboSlotKind,
  catalog: CatalogItem[],
  excludeItemId?: string,
): string[] {
  if (slotKind === 'other') return [];
  const seen = new Set<string>();
  const found: string[] = [];
  for (const item of sellableCatalogProducts(catalog, excludeItemId)) {
    const cat = String(item.category || '').trim();
    if (!cat) continue;
    if (inferComboSlotKind(cat, item.name) !== slotKind) continue;
    const key = foldCategory(normalizeImportCategory(cat));
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(cat);
  }
  const order = SLOT_CATEGORY_ORDER[slotKind];
  return found.sort((a, b) => {
    const fa = foldCategory(normalizeImportCategory(a));
    const fb = foldCategory(normalizeImportCategory(b));
    const ia = order.findIndex((o) => foldCategory(normalizeImportCategory(o)) === fa);
    const ib = order.findIndex((o) => foldCategory(normalizeImportCategory(o)) === fb);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b, 'es');
  });
}

export function catalogProductsForSlotKind(
  slotKind: ComboSlotKind,
  catalog: CatalogItem[],
  excludeItemId?: string,
): CatalogItem[] {
  return sellableCatalogProducts(catalog, excludeItemId)
    .filter((c) => inferComboSlotKind(c.category || '', c.name) === slotKind)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function categoriesMatch(itemCategory: string, sectionCategory: string): boolean {
  return (
    foldCategory(normalizeImportCategory(itemCategory)) ===
    foldCategory(normalizeImportCategory(sectionCategory))
  );
}

export function catalogProductsForCategory(
  catalogCategory: string,
  catalog: CatalogItem[],
  excludeItemId?: string,
): CatalogItem[] {
  return sellableCatalogProducts(catalog, excludeItemId)
    .filter((c) => categoriesMatch(c.category || '', catalogCategory))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function catalogHasCategory(catalog: CatalogItem[], catalogCategory: string): boolean {
  return catalogProductsForCategory(catalogCategory, catalog).length > 0;
}

function presetStructureForMenu(presetId: string): ComboStructureSlot[] {
  const preset = COMBO_MENU_PRESETS.find((p) => p.id === presetId);
  if (preset) return preset.structure;
  if (presetId === 'custom') return DEFAULT_COMBO_STRUCTURE;
  return DEFAULT_COMBO_STRUCTURE;
}

/** Secciones del combo = categorías reales del catálogo, enlazadas al menú. */
export function buildComboMenuSections(
  presetId: string,
  catalog: CatalogItem[],
  structureOverride?: ComboStructureSlot[] | null,
): ComboMenuCatalogSection[] {
  const structure =
    Array.isArray(structureOverride) && structureOverride.length > 0
      ? structureOverride
      : presetStructureForMenu(presetId);
  const sections: ComboMenuCatalogSection[] = [];

  for (const slot of structure) {
    const quota = Math.max(0, slot.expectedCount ?? (slot.required ? 1 : 0));
    if (quota <= 0 && !slot.required) continue;

    const categories = uniqueCatalogCategoriesForSlotKind(slot.slotKind, catalog);
    if (categories.length === 0) {
      sections.push({
        catalogCategory: DEFAULT_SECTION_LABEL[slot.slotKind as keyof typeof DEFAULT_SECTION_LABEL] ?? slot.label,
        slotKind: slot.slotKind,
        expectedCount: slot.slotKind === 'main' ? quota : 0,
        required: slot.required,
        slotQuota: quota,
        ...(slot.slotKind !== 'main' ? { groupBySlotKind: true as const } : {}),
      });
      continue;
    }

    if (slot.slotKind === 'main') {
      const families: ComboMainFamily[] = [];
      if (categories.some((c) => mainFamilyForCatalogCategory(c) === 'pizza')) families.push('pizza');
      if (categories.some((c) => mainFamilyForCatalogCategory(c) === 'burger')) families.push('burger');

      if (families.length === 0) {
        for (const cat of categories) {
          sections.push({
            catalogCategory: cat,
            slotKind: 'main',
            expectedCount: quota,
            required: slot.required,
            slotQuota: quota,
          });
        }
        continue;
      }

      for (const family of families) {
        const familyCats = categories.filter((c) => mainFamilyForCatalogCategory(c) === family);
        const hasSpecialty =
          family === 'pizza' &&
          familyCats.some((c) => {
            const k = foldCategory(normalizeImportCategory(c));
            return /premium|especialidad/.test(k);
          });
        sections.push({
          catalogCategory:
            family === 'pizza'
              ? hasSpecialty
                ? 'Pizzas / Especialidad'
                : 'Pizzas'
              : familyCats.find((c) => /top\s*burger/i.test(c)) || 'Burgers',
          slotKind: 'main',
          expectedCount: quota,
          required: Boolean(slot.required),
          slotQuota: quota,
          groupByMainFamily: family,
        });
      }
      continue;
    }

    // Complementos, Bebidas, Postres: un bloque con el nombre del Excel (no Sides, Entrantes…).
    sections.push({
      catalogCategory: DEFAULT_SECTION_LABEL[slot.slotKind as keyof typeof DEFAULT_SECTION_LABEL] ?? slot.label,
      slotKind: slot.slotKind,
      expectedCount: 0,
      required: slot.required,
      slotQuota: quota,
      groupBySlotKind: true,
    });
  }

  return sections;
}

export function comboItemsInSlotKind(
  slotKind: ComboSlotKind,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): CatalogComboRef[] {
  return comboItems.filter((ref) => resolveComboRefSlotKind(ref, catalog) === slotKind);
}

export function totalUnitsInSlotKind(
  slotKind: ComboSlotKind,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): number {
  return comboItemsInSlotKind(slotKind, comboItems, catalog).reduce(
    (sum, ref) => sum + Math.max(1, ref.quantity || 1),
    0,
  );
}

export function comboItemsInCatalogSection(
  section: ComboMenuCatalogSection,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): CatalogComboRef[] {
  if (section.groupByMainFamily) {
    const family = section.groupByMainFamily;
    return comboItems.filter((ref) => {
      if (resolveComboRefSlotKind(ref, catalog) !== 'main') return false;
      const product = catalog.find((c) => c._id === ref.productId);
      return (
        mainFamilyForProduct(product?.category || '', ref.productName || product?.name || '') ===
        family
      );
    });
  }
  if (section.groupBySlotKind) {
    return comboItemsInSlotKind(section.slotKind, comboItems, catalog);
  }
  return comboItems.filter((ref) => {
    const product = catalog.find((c) => c._id === ref.productId);
    if (!product) return false;
    return categoriesMatch(product.category || '', section.catalogCategory);
  });
}

/** Lista blanca opcional por hueco (`customFields.comboSlotAllowlists.side = [id…]`). */
export function resolveComboSlotAllowlist(
  customFields: Record<string, unknown> | undefined,
  slotKind: ComboSlotKind,
): string[] | null {
  const raw = customFields?.comboSlotAllowlists;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ids = (raw as Record<string, unknown>)[slotKind];
  if (!Array.isArray(ids)) return null;
  const cleaned = ids.map((id) => String(id || '').trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

export function catalogProductsForComboSection(
  section: ComboMenuCatalogSection,
  catalog: CatalogItem[],
  excludeItemId?: string,
  options?: { allowlistIds?: string[] | null },
): CatalogItem[] {
  let products: CatalogItem[];
  if (section.groupByMainFamily) {
    const family = section.groupByMainFamily;
    products = sellableCatalogProducts(catalog, excludeItemId).filter((p) =>
      isComboSelectableMainProduct(p, family),
    );
  } else if (section.groupBySlotKind) {
    products = catalogProductsForSlotKind(section.slotKind, catalog, excludeItemId).filter(
      (p) => !isExcludedComboPickerProduct(p),
    );
  } else {
    products = catalogProductsForCategory(section.catalogCategory, catalog, excludeItemId).filter(
      (p) => !isExcludedComboPickerProduct(p),
    );
  }
  // Plato principal (pizzas/burgers): nunca limitar por allowlist — salir TODAS las de carta.
  const allow =
    section.slotKind === 'main' ? null : options?.allowlistIds;
  if (allow && allow.length > 0) {
    const set = new Set(allow);
    products = products.filter((p) => set.has(p._id));
  }
  return products.sort((a, b) => {
    const ca = foldCategory(normalizeImportCategory(a.category || ''));
    const cb = foldCategory(normalizeImportCategory(b.category || ''));
    const order = ['pizzas', 'pizza', 'premium', 'especialidad', 'especialidades', 'calzones', 'calzone'];
    const ia = order.findIndex((o) => ca === o || ca.startsWith(o));
    const ib = order.findIndex((o) => cb === o || cb.startsWith(o));
    const sa = ia === -1 ? 50 : ia;
    const sb = ib === -1 ? 50 : ib;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, 'es');
  });
}

function isExcludedComboPickerProduct(item: Pick<CatalogItem, 'name' | 'category' | 'customFields'>): boolean {
  const name = foldCategory(item.name || '');
  const cat = foldCategory(normalizeImportCategory(item.category || ''));
  if (item.customFields?.halfHalf === true) return true;
  if (/^receta\b/.test(name)) return true;
  if (/mitad\s*y\s*mitad|half\s*and\s*half|half-half/.test(name)) return true;
  if (['envases', 'ingredientes', 'consumibles', 'reventa'].includes(cat)) return true;
  if (/caja\s*pizza/.test(name)) return true;
  return false;
}

/**
 * Pizza (o burger) elegible en menús TPV: carta real, sin recetas/stock/envases.
 */
export function isComboSelectableMainProduct(
  item: Pick<CatalogItem, 'name' | 'category' | 'itemType' | 'active' | 'customFields'>,
  family: ComboMainFamily,
): boolean {
  if (item.active === false) return false;
  if (item.itemType === 'combo' || item.itemType === 'service') return false;
  if (isExcludedComboPickerProduct(item)) return false;

  const cat = foldCategory(normalizeImportCategory(item.category || ''));
  const name = foldCategory(item.name || '');

  if (family === 'burger') {
    if (inferComboSlotKind(item.category || '', item.name) !== 'main') return false;
    return mainFamilyForProduct(item.category || '', item.name) === 'burger';
  }

  // Pizza / especialidad / premium / calzone (todas las categorías de carta).
  if (/^(pizzas?|premium|especialidad(es)?|calzones?)$/.test(cat)) return true;
  if (/pizza|calzone/.test(cat)) return true;
  if (inferComboSlotKind(item.category || '', item.name) !== 'main') return false;
  if (mainFamilyForProduct(item.category || '', item.name) === 'burger') return false;
  return /pizza|calzone/.test(name);
}

export function totalUnitsInCatalogSection(
  section: ComboMenuCatalogSection,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): number {
  return comboItemsInCatalogSection(section, comboItems, catalog).reduce(
    (sum, ref) => sum + Math.max(1, ref.quantity || 1),
    0,
  );
}

/**
 * Añade un producto a una sección del menú (TPV / editor).
 * Si expectedCount/slotQuota > 1 (Combo Dúo, Familiar), acumula sin borrar
 * las elecciones previas de la misma familia/categoría.
 */
export function pickComboProductInSection(
  section: ComboMenuCatalogSection,
  product: CatalogItem,
  comboItems: CatalogComboRef[],
  catalogItems: CatalogItem[],
): CatalogComboRef[] | null {
  const categoryNeed = section.expectedCount;
  const slotNeed = section.slotQuota;
  const slotKind = section.slotKind;
  const refSlotKind = inferComboSlotKind(product.category || '', product.name);
  const need = categoryNeed > 0 ? categoryNeed : slotNeed;

  let next = [...comboItems];

  // Solo sustituir (limpiar) cuando el hueco admite 1 unidad.
  // Con ×2 (dúo/familiar) hay que acumular pizzas/complementos/bebidas.
  if (need <= 1) {
    if (section.groupByMainFamily) {
      const family = section.groupByMainFamily;
      next = next.filter((ref) => {
        if (resolveComboRefSlotKind(ref, catalogItems) !== 'main') return true;
        const p = catalogItems.find((c) => c._id === ref.productId);
        return (
          mainFamilyForProduct(p?.category || '', ref.productName || p?.name || '') !== family
        );
      });
    } else if (categoryNeed === 1) {
      next = next.filter((ref) => {
        const p = catalogItems.find((c) => c._id === ref.productId);
        if (!p) return true;
        return !categoriesMatch(p.category || '', section.catalogCategory);
      });
    } else if (slotNeed === 1) {
      next = next.filter((ref) => resolveComboRefSlotKind(ref, catalogItems) !== slotKind);
    } else {
      next = next.filter((ref) => {
        const p = catalogItems.find((c) => c._id === ref.productId);
        if (!p) return true;
        return !categoriesMatch(p.category || '', section.catalogCategory);
      });
    }
  }

  const sameIdx = next.findIndex((c) => c.productId === product._id);
  const have =
    categoryNeed > 0 || section.groupByMainFamily
      ? totalUnitsInCatalogSection(section, next, catalogItems)
      : totalUnitsInSlotKind(slotKind, next, catalogItems);

  if (need === 1) {
    next.push({
      productId: product._id,
      productName: product.name,
      quantity: 1,
      slotKind: refSlotKind,
    });
  } else if (sameIdx >= 0) {
    if (have < need) {
      next[sameIdx] = {
        ...next[sameIdx],
        quantity: next[sameIdx].quantity + 1,
        slotKind: refSlotKind,
      };
    } else {
      return null;
    }
  } else {
    if (have >= need) return null;
    next.push({
      productId: product._id,
      productName: product.name,
      quantity: 1,
      slotKind: refSlotKind,
    });
  }

  return normalizeComboItemsForSave(next, catalogItems);
}

export function isComboMenuComplete(
  sections: ComboMenuCatalogSection[],
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): boolean {
  const quotas = new Map<ComboSlotKind, { quota: number; required: boolean }>();
  for (const section of sections) {
    if (section.slotQuota <= 0) continue;
    const prev = quotas.get(section.slotKind);
    if (!prev || section.slotQuota > prev.quota) {
      quotas.set(section.slotKind, { quota: section.slotQuota, required: section.required });
    }
  }
  for (const [slotKind, { quota, required }] of quotas) {
    if (!required || quota <= 0) continue;
    if (totalUnitsInSlotKind(slotKind, comboItems, catalog) < quota) return false;
  }
  return quotas.size > 0;
}

function structurePresetKey(structure: ComboStructureSlot[]): string {
  return structure
    .map((s) => `${s.slotKind}:${s.required ? 1 : 0}:${Math.max(1, s.expectedCount ?? 1)}`)
    .join('|');
}

export function inferComboMenuPresetId(structure: ComboStructureSlot[]): string {
  const key = structurePresetKey(structure);
  const match = COMBO_MENU_PRESETS.find((p) => structurePresetKey(p.structure) === key);
  return match?.id ?? 'custom';
}

export function expectedCountForComboSlot(
  slotKind: ComboSlotKind,
  structure: ComboStructureSlot[],
): number {
  const slot = structure.find((s) => s.slotKind === slotKind);
  return Math.max(1, slot?.expectedCount ?? 1);
}

export function slotAllowsMultipleProducts(
  slotKind: ComboSlotKind,
  structure: ComboStructureSlot[],
): boolean {
  return expectedCountForComboSlot(slotKind, structure) > 1;
}

/** Suma de unidades en un hueco (líneas × cantidad). */
export function totalUnitsInComboSlot(
  slotKind: ComboSlotKind,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): number {
  const grouped = groupComboItemsBySlot(comboItems, catalog);
  const items = grouped.get(slotKind) ?? [];
  return items.reduce((sum, ref) => sum + Math.max(1, ref.quantity || 1), 0);
}

export function isComboSlotComplete(
  slot: ComboStructureSlot,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): boolean {
  return totalUnitsInComboSlot(slot.slotKind, comboItems, catalog) >= expectedCountForComboSlot(slot.slotKind, [slot]);
}

const SLOT_ORDER: ComboSlotKind[] = ['main', 'side', 'drink', 'dessert', 'other'];

function foldCategory(category: string): string {
  return String(category || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Categorías de catálogo (normalizadas) que van en cada parte del menú. */
const SLOT_CATALOG_CATEGORIES: Record<Exclude<ComboSlotKind, 'other'>, Set<string>> = {
  main: new Set([
    'pizzas',
    'pizza',
    'pizzas premium',
    'pizza premium',
    'premium',
    'especialidad',
    'especialidades',
    'burgers',
    'burger',
    'hamburguesas',
    'hamburguesa',
    'top burgers',
    'top burger',
    'rolls',
    'bowls',
    'principales',
    'calzones',
    'calzone',
    // Bar / restaurante
    'tapas',
    'tapa',
    'raciones',
    'racion',
    'bocadillos',
    'bocadillo',
    'montaditos',
    'montadito',
    'pinchos',
    'pincho',
    'tacos',
    'taco',
    'kebabs',
    'kebab',
    'platos',
    'plato',
    'carta',
  ]),
  side: new Set([
    'complementos',
    'complemento',
    'extras',
    'extra',
    'salsas',
    'salsa',
    'sides',
    'side',
    'entrantes',
    'entrante',
    'guarniciones',
    'guarnicion',
    'patatas',
    'alitas',
    'nuggets',
    'acompanamientos',
    'acompañamientos',
  ]),
  drink: new Set([
    'bebidas',
    'bebida',
    'refrescos',
    'refresco',
    'cervezas',
    'cerveza',
    'café',
    'cafe',
    'zumos',
    'zumo',
  ]),
  dessert: new Set(['postres', 'postre', 'helados', 'helado', 'bolleria', 'bollería']),
};

function slotKindFromCategory(category: string): ComboSlotKind | null {
  const normalized = normalizeImportCategory(category);
  const key = foldCategory(normalized);
  if (!key) return null;
  for (const kind of ['main', 'side', 'drink', 'dessert'] as const) {
    if (SLOT_CATALOG_CATEGORIES[kind].has(key)) return kind;
  }
  if (/^top\s*burger/.test(key) || key.includes('burger')) return 'main';
  if (key.includes('pizza') || /premium|especialidad|calzone/.test(key)) return 'main';
  if (/tapa|racion|bocadillo|montadito|pincho|kebab|plato|carta/.test(key)) return 'main';
  if (/refresco|cerveza|vino|bebida|zumo|agua/.test(key)) return 'drink';
  if (/salsa|complement|extra|side|guarnicion|patata|entrante/.test(key)) return 'side';
  if (/postre|helado|dulce|bolleria/.test(key)) return 'dessert';
  return null;
}

function slotKindFromNameFallback(productName: string): ComboSlotKind | null {
  const name = foldCategory(productName);
  if (/pizza|calzone|burger|hamburg|tapa|racion|bocadillo|pincho|kebab/.test(name)) return 'main';
  if (/patata|alita|nugget|complement|acompa/.test(name)) return 'side';
  if (/coca|pepsi|fanta|agua|cerveza|bebida|refresco/.test(name)) return 'drink';
  if (/postre|tarta|helado|brownie/.test(name)) return 'dessert';
  return null;
}

/** Clasifica un producto del catálogo en pizza/burger, complemento, bebida… */
export function inferComboSlotKind(category: string, productName = ''): ComboSlotKind {
  const fromCategory = slotKindFromCategory(category);
  if (fromCategory) return fromCategory;

  const fromName = slotKindFromNameFallback(productName);
  if (fromName) return fromName;

  return 'other';
}

export function resolveComboRefSlotKind(
  ref: CatalogComboRef,
  catalog: CatalogItem[],
): ComboSlotKind {
  if (ref.slotKind && ref.slotKind in COMBO_SLOT_META) return ref.slotKind;
  const product = catalog.find((p) => p._id === ref.productId);
  return inferComboSlotKind(product?.category || '', ref.productName || product?.name || '');
}

export function groupComboItemsBySlot(
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): Map<ComboSlotKind, CatalogComboRef[]> {
  const map = new Map<ComboSlotKind, CatalogComboRef[]>();
  for (const ref of comboItems) {
    const kind = resolveComboRefSlotKind(ref, catalog);
    const list = map.get(kind) ?? [];
    list.push({ ...ref, slotKind: kind });
    map.set(kind, list);
  }
  return map;
}

/** Productos del catálogo que encajan en un hueco del combo. */
export function catalogProductsForComboSlot(
  slotKind: ComboSlotKind,
  catalog: CatalogItem[],
  options?: { excludeItemId?: string; excludeProductIds?: Set<string> },
): CatalogItem[] {
  const excludeId = options?.excludeItemId;
  const excludeProducts = options?.excludeProductIds ?? new Set<string>();

  return catalog
    .filter((c) => c.active !== false && c._id !== excludeId && c.itemType !== 'combo' && c.itemType !== 'service')
    .filter((c) => !excludeProducts.has(c._id))
    .filter((c) => inferComboSlotKind(c.category || '', c.name) === slotKind)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function comboStructureFromCustomFields(
  customFields: Record<string, unknown> | undefined,
  comboItemsCount = 0,
): ComboStructureSlot[] {
  if (!isComboStructureConfirmed(customFields, comboItemsCount)) return [];
  const raw = customFields?.comboStructure;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_COMBO_STRUCTURE;
  const out: ComboStructureSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const slotKind = (row as ComboStructureSlot).slotKind;
    if (!(slotKind in COMBO_SLOT_META)) continue;
    out.push({
      slotKind,
      label: String((row as ComboStructureSlot).label || COMBO_SLOT_META[slotKind].shortLabel).trim(),
      required: Boolean((row as ComboStructureSlot).required),
      expectedCount: Math.max(1, Number((row as ComboStructureSlot).expectedCount) || 1),
    });
  }
  return out.length > 0 ? out : DEFAULT_COMBO_STRUCTURE;
}

export function comboStructureSummary(
  structure: ComboStructureSlot[],
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): string {
  const grouped = groupComboItemsBySlot(comboItems, catalog);
  const parts: string[] = [];
  for (const slot of structure) {
    const items = grouped.get(slot.slotKind) ?? [];
    if (items.length === 0) {
      parts.push(`${slot.label}?`);
      continue;
    }
    const names = items.map((i) => {
      const qty = i.quantity > 1 ? ` ×${i.quantity}` : '';
      return `${i.productName}${qty}`;
    });
    parts.push(names.join(' + '));
  }
  const extras = SLOT_ORDER.filter(
    (k) => !structure.some((s) => s.slotKind === k) && (grouped.get(k)?.length ?? 0) > 0,
  );
  for (const kind of extras) {
    const items = grouped.get(kind) ?? [];
    parts.push(items.map((i) => i.productName).join(' + '));
  }
  return parts.join(' · ');
}

export function normalizeComboItemsForSave(
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): CatalogComboRef[] {
  return comboItems.map((ref) => {
    const out: CatalogComboRef = {
      productId: ref.productId,
      productName: ref.productName,
      quantity: Math.max(1, Number(ref.quantity) || 1),
      slotKind: resolveComboRefSlotKind(ref, catalog),
    };
    const instanceId = String(ref.instanceId || '').trim();
    if (instanceId) out.instanceId = instanceId;
    const removed = Array.isArray(ref.removedIngredients)
      ? ref.removedIngredients.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    if (removed.length) out.removedIngredients = removed;
    const added = Array.isArray(ref.addedSupplements)
      ? ref.addedSupplements
          .map((s) => ({
            id: String(s?.id || '').trim(),
            name: String(s?.name || '').trim(),
            price: Number(s?.price) || 0,
          }))
          .filter((s) => s.id && s.name)
      : [];
    if (added.length) out.addedSupplements = added;
    const notes = String(ref.notes || '').trim();
    if (notes) out.notes = notes;
    return out;
  });
}

function newComboInstanceId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Expande principales con quantity>1 en unidades sueltas con instanceId
 * (para personalizar cada pizza del Dúo/Familiar).
 */
export function ensureComboMainInstanceIds(
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): CatalogComboRef[] {
  const expanded: CatalogComboRef[] = [];
  for (const ref of comboItems) {
    const slot = resolveComboRefSlotKind(ref, catalog);
    const qty = Math.max(1, Number(ref.quantity) || 1);
    if (slot === 'main') {
      for (let i = 0; i < qty; i += 1) {
        expanded.push({
          ...ref,
          quantity: 1,
          instanceId:
            i === 0 && String(ref.instanceId || '').trim()
              ? String(ref.instanceId).trim()
              : newComboInstanceId(),
          ...(i > 0
            ? {
                // Solo la 1ª unidad hereda personalización antigua de la línea agregada.
                removedIngredients: undefined,
                addedSupplements: undefined,
                notes: undefined,
              }
            : {}),
        });
      }
    } else {
      expanded.push(ref);
    }
  }
  return normalizeComboItemsForSave(expanded, catalog);
}

/**
 * Añade 1 unidad del producto principal (pizza/burger) como línea aparte,
 * para poder personalizar cada una en Individual / Dúo / Familiar.
 */
export function appendComboMainUnit(
  section: ComboMenuCatalogSection,
  product: CatalogItem,
  comboItems: CatalogComboRef[],
  catalogItems: CatalogItem[],
): CatalogComboRef[] | null {
  const need = unitsNeededInComboSection(section);
  let next = [...comboItems];

  if (need === 1) {
    if (section.groupByMainFamily) {
      const family = section.groupByMainFamily;
      next = next.filter((ref) => {
        if (resolveComboRefSlotKind(ref, catalogItems) !== 'main') return true;
        const p = catalogItems.find((c) => c._id === ref.productId);
        return (
          mainFamilyForProduct(p?.category || '', ref.productName || p?.name || '') !== family
        );
      });
    } else {
      next = next.filter((ref) => {
        const p = catalogItems.find((c) => c._id === ref.productId);
        if (!p) return true;
        return !categoriesMatch(p.category || '', section.catalogCategory);
      });
    }
  } else {
    const have = totalUnitsInCatalogSection(section, next, catalogItems);
    if (need > 0 && have >= need) return null;
  }

  const refSlotKind = inferComboSlotKind(product.category || '', product.name);
  next.push({
    productId: product._id,
    productName: product.name,
    quantity: 1,
    slotKind: refSlotKind,
    instanceId: newComboInstanceId(),
  });
  return normalizeComboItemsForSave(next, catalogItems);
}

/** Pizza vs burger según categoría de catálogo (TPV menú). */
export function mainFamilyForCatalogCategory(category: string): ComboMainFamily {
  const key = foldCategory(normalizeImportCategory(category));
  if (/burger|hamburg|smash|black\s*burger/.test(key)) return 'burger';
  return 'pizza';
}

/** Familia pizza/burger: categoría primero; si es ambigua, mira el nombre del producto. */
export function mainFamilyForProduct(
  category: string,
  productName = '',
): ComboMainFamily {
  const fromCat = mainFamilyForCatalogCategory(category);
  if (fromCat === 'burger') return 'burger';
  const name = foldCategory(productName);
  if (/burger|hamburg|smash/.test(name)) return 'burger';
  if (/pizza|calzone/.test(name)) return 'pizza';
  // Categorías genéricas (Principales, Carta…): solo burger si el nombre lo dice.
  const key = foldCategory(normalizeImportCategory(category));
  if (/principal|carta|platos?|especialidad/.test(key) && !/pizza/.test(key)) {
    if (/burger|hamburg|smash/.test(name)) return 'burger';
  }
  return fromCat;
}

export function comboMenuSectionKey(section: ComboMenuCatalogSection): string {
  return `${section.slotKind}::${section.catalogCategory}`;
}

export function unitsNeededInComboSection(section: ComboMenuCatalogSection): number {
  return section.expectedCount > 0 ? section.expectedCount : section.slotQuota;
}

export function isComboMenuSectionDone(
  section: ComboMenuCatalogSection,
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): boolean {
  const need = unitsNeededInComboSection(section);
  if (need <= 0) return true;
  return totalUnitsInCatalogSection(section, comboItems, catalog) >= need;
}

export function inferMainFamilyFromComboSelections(
  comboItems: CatalogComboRef[],
  catalog: CatalogItem[],
): ComboMainFamily | null {
  const mains = comboItemsInSlotKind('main', comboItems, catalog);
  if (mains.length === 0) return null;
  const product = catalog.find((c) => c._id === mains[0].productId);
  if (!product) return null;
  return mainFamilyForProduct(product.category || '', product.name || mains[0].productName);
}

export function comboMenuHasMainFamilyChoice(sections: ComboMenuCatalogSection[]): boolean {
  const mains = sections.filter((s) => s.slotKind === 'main' && s.slotQuota > 0);
  const hasPizza = mains.some(
    (s) => (s.groupByMainFamily ?? mainFamilyForCatalogCategory(s.catalogCategory)) === 'pizza',
  );
  const hasBurger = mains.some(
    (s) => (s.groupByMainFamily ?? mainFamilyForCatalogCategory(s.catalogCategory)) === 'burger',
  );
  return hasPizza && hasBurger;
}

export function filterComboMenuSectionsForMainFamily(
  sections: ComboMenuCatalogSection[],
  family: ComboMainFamily | null,
): ComboMenuCatalogSection[] {
  if (!family) {
    return sections.filter((s) => s.slotKind !== 'main');
  }
  return sections.filter(
    (s) =>
      s.slotKind !== 'main' ||
      (s.groupByMainFamily ?? mainFamilyForCatalogCategory(s.catalogCategory)) === family,
  );
}

/** Secciones del menú para elegir productos al vender en TPV. */
export function resolveTpvComboMenuSections(
  comboItem: Pick<CatalogItem, 'customFields' | 'comboItems'>,
  catalog: CatalogItem[],
): ComboMenuCatalogSection[] {
  const structure = comboStructureFromCustomFields(
    comboItem.customFields,
    comboItem.comboItems?.length ?? 0,
  );
  if (structure.length > 0) {
    // Usar SIEMPRE los expectedCount guardados (Individual/Dúo/Familiar), no caer a 1-1-1.
    const presetId = inferComboMenuPresetId(structure);
    return buildComboMenuSections(presetId === 'custom' ? 'estandar' : presetId, catalog, structure);
  }
  return buildComboMenuSections('estandar', catalog);
}

/** Menú / combo vendible en TPV (tipo combo, categoría o productos incluidos). */
export function isTpvComboCatalogItem(
  item: Pick<CatalogItem, 'itemType' | 'category' | 'comboItems' | 'name' | 'customFields'>,
): boolean {
  if (item.customFields?.halfHalf === true) return false;
  if (item.customFields?.buildYourOwn === true) return false;
  const foldedName = String(item.name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (
    item.itemType !== 'combo' &&
    /mitad\s*y\s*mitad|half\s*and\s*half|half-half/.test(foldedName)
  ) {
    return false;
  }
  if (item.itemType === 'combo') return true;
  const cat = String(item.category || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (cat === 'combos' || cat === 'combo' || cat === 'menus' || cat === 'menu') return true;
  return (item.comboItems?.length ?? 0) > 0;
}
