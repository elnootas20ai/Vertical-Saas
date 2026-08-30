import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import {
  listInventoryOrganizerChoices,
  buildInventoryOrganizerGroups,
  ORGANIZER_TOTAL,
  type InventoryCommercialBrand,
} from '../../lib/inventoryUtils';
import {
  commercialLineBrands,
  isImportComboCategory,
  listCatalogCategoryOrganizerChoices,
} from '../../lib/deliveryCatalogImportLogic';
import { stockItemsForOrganizer } from '../../lib/purchaseSuggestions';
import type { CatalogItem } from '../../lib/deliveryApi';
import type { StoreIngredient } from '../../lib/catalogCustomization';
import { isStockInventoryItem } from '../../lib/stockInventoryScope';
import {
  VERTIAL_ACCENT_BG,
  VERTIAL_ACCENT_BORDER,
  VERTIAL_BTN_SECONDARY,
} from '../../lib/vertialUiTokens';
import { CatalogUnitChip } from './CatalogUnitChip';
/** Etiquetas legacy `cat:…` + categorías de carta (sin Combos) en «Qué te vende». */

type BrandLike = {
  _id: string;
  name: string;
  active?: boolean;
  deliveryLineKind?: string;
  catalogCategories?: string[];
  isDefault?: boolean;
};

type Props = {
  organizerIds: string[];
  catalogItemIds: string[];
  itemCosts?: Record<string, string>;
  onChange: (next: {
    organizerIds: string[];
    catalogItemIds: string[];
    itemCosts: Record<string, string>;
  }) => void;
  brands?: BrandLike[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  labelClassName?: string;
  businessType?: string | null;
};

export function supplierOrganizerFieldSessionKey(
  supplier: { _id?: string; id?: string } | null | undefined,
  isOpen = true,
): string {
  if (!isOpen) return '';
  const id = String(supplier?._id || supplier?.id || '').trim();
  return id || '__new__';
}

/** Huella de los datos del proveedor para saber cuándo reinicializar el formulario. */
export function supplierFormInitFingerprint(
  supplier: {
    _id?: string;
    id?: string;
    updatedAt?: string;
    organizerIds?: string[];
    catalogItemIds?: string[];
  } | null | undefined,
  catalogItemsLength = 0,
): string {
  const id = String(supplier?._id || supplier?.id || '').trim() || '__new__';
  const orgs = (Array.isArray(supplier?.organizerIds) ? supplier!.organizerIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .sort()
    .join(',');
  const items = (Array.isArray(supplier?.catalogItemIds) ? supplier!.catalogItemIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .sort()
    .join(',');
  return `${id}|${catalogItemsLength}|${String(supplier?.updatedAt || '')}|${orgs}|${items}`;
}

/**
 * Categorías de Carta (sin Combos) + organizadores de Almacén.
 * Carta siempre visible (aunque aún no haya escandallo/almacén) — cuentas legacy/admin.
 * Almacén: presets siempre + grupos con artículos.
 */
export function buildSupplierOrganizerChoices(
  brands: BrandLike[] = [],
  catalogItems: CatalogItem[] = [],
  options?: {
    businessType?: string | null;
    storeIngredients?: StoreIngredient[];
    selectedOrganizerIds?: string[];
  },
): Array<{ id: string; label: string }> {
  const commercialBrands = commercialLineBrands(brands) as InventoryCommercialBrand[];
  const storeIngredients = options?.storeIngredients || [];
  const selected = new Set(
    (options?.selectedOrganizerIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const seen = new Set<string>();
  const seenLabelKeys = new Set<string>();
  const out: Array<{ id: string; label: string }> = [];

  const push = (id: string, label: string) => {
    const cleanId = String(id || '').trim();
    const cleanLabel = String(label || '').trim() || cleanId;
    if (!cleanId || seen.has(cleanId)) return;
    seen.add(cleanId);
    seenLabelKeys.add(
      cleanLabel
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    );
    out.push({ id: cleanId, label: cleanLabel });
  };

  // 1) Secciones de Carta — siempre (sin Combos). Sin exigir escandallo/almacén.
  for (const c of listCatalogCategoryOrganizerChoices(brands, catalogItems, {
    businessType: options?.businessType,
  })) {
    if (isImportComboCategory(c.label)) continue;
    push(c.id, c.label);
  }

  // 2) Almacén con artículos (envases, invcat, líneas…).
  const stock = catalogItems.filter(isStockInventoryItem);
  const groups = buildInventoryOrganizerGroups(stock, storeIngredients, commercialBrands).filter(
    (g) => g.id !== ORGANIZER_TOTAL && (g.total > 0 || selected.has(g.id)),
  );
  for (const g of groups) {
    if (seen.has(g.id)) continue;
    const labelKey = String(g.label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (seenLabelKeys.has(labelKey) && !selected.has(g.id)) continue;
    push(g.id, g.label);
  }

  // 3) Presets de almacén siempre (Envases, Limpieza…). Líneas de marca solo si hay stock o ya seleccionadas.
  const WAREHOUSE_PRESET_IDS = new Set([
    'packaging',
    'cleaning',
    'varios',
    'beverages',
    'complements',
  ]);
  for (const c of listInventoryOrganizerChoices(commercialBrands)) {
    if (seen.has(c.id)) continue;
    const labelKey = String(c.label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (seenLabelKeys.has(labelKey) && !selected.has(c.id)) continue;
    const isPreset = WAREHOUSE_PRESET_IDS.has(c.id);
    if (
      !isPreset
      && !selected.has(c.id)
      && stockItemsForOrganizer(stock, c.id, storeIngredients, commercialBrands).length === 0
    ) {
      continue;
    }
    push(c.id, c.label);
  }

  for (const id of selected) {
    if (seen.has(id)) continue;
    push(id, id);
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

function organizerIdsForMarkedItems(
  catalogItemIds: string[],
  catalogItems: CatalogItem[],
  storeIngredients: StoreIngredient[],
  commercialBrands: InventoryCommercialBrand[],
  choiceIds: string[],
): string[] {
  const marked = new Set(catalogItemIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (marked.size === 0) return [];
  const found: string[] = [];
  for (const orgId of choiceIds) {
    const items = stockItemsForOrganizer(catalogItems, orgId, storeIngredients, commercialBrands);
    if (items.some((item) => marked.has(item._id))) found.push(orgId);
  }
  return found;
}

/** Organizadores guardados + los que cubren productos marcados (al reabrir el formulario). */
export function initialSupplierOrganizerIds(
  supplier: { organizerIds?: string[]; catalogItemIds?: string[]; _id?: string } | null | undefined,
  catalogItems: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
  brands: BrandLike[] = [],
): string[] {
  const ids = new Set(
    (Array.isArray(supplier?.organizerIds) ? supplier.organizerIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const catalogItemIds = initialSupplierCatalogItemIds(supplier, catalogItems);
  const commercialBrands = commercialLineBrands(brands) as InventoryCommercialBrand[];
  const choiceIds = buildSupplierOrganizerChoices(brands, catalogItems, {
    storeIngredients,
  }).map((c) => c.id);
  for (const orgId of organizerIdsForMarkedItems(
    catalogItemIds,
    catalogItems,
    storeIngredients,
    commercialBrands,
    choiceIds,
  )) {
    ids.add(orgId);
  }
  return [...ids];
}

/** Asegura que categorías añadidas y con productos marcados se persisten al guardar. */
export function resolveSupplierOrganizerIdsForSave(
  organizerIds: string[],
  catalogItemIds: string[],
  catalogItems: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
  brands: BrandLike[] = [],
): string[] {
  const ids = new Set(
    (organizerIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const commercialBrands = commercialLineBrands(brands) as InventoryCommercialBrand[];
  const choiceIds = buildSupplierOrganizerChoices(brands, catalogItems, {
    storeIngredients,
    selectedOrganizerIds: organizerIds,
  }).map((c) => c.id);
  for (const orgId of organizerIdsForMarkedItems(
    catalogItemIds,
    catalogItems,
    storeIngredients,
    commercialBrands,
    choiceIds,
  )) {
    ids.add(orgId);
  }
  return [...ids];
}

/**
 * Alta de proveedor: categorías de Carta (ingredientes por sección) + Almacén
 * (envases, limpieza…). Los ingredientes no salen en el TPV.
 */
export function SupplierOrganizersField({
  organizerIds,
  catalogItemIds,
  itemCosts = {},
  onChange,
  brands = [],
  catalogItems = [],
  storeIngredients = [],
  labelClassName = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5',
  businessType = null,
}: Props) {
  const [pickId, setPickId] = useState('');
  const [openOrganizerId, setOpenOrganizerId] = useState('');
  const [query, setQuery] = useState('');
  const pickRef = useRef<HTMLSelectElement>(null);
  const prevSelectedOrgCountRef = useRef(0);

  const commercialBrands = useMemo(
    () => commercialLineBrands(brands) as InventoryCommercialBrand[],
    [brands],
  );
  const allChoices = useMemo(() => {
    const list = buildSupplierOrganizerChoices(brands, catalogItems, {
      businessType,
      storeIngredients,
      selectedOrganizerIds: organizerIds,
    });
    return [...list].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [brands, catalogItems, businessType, storeIngredients, organizerIds]);
  const choices = allChoices;
  const labelById = useMemo(
    () => new Map(choices.map((c) => [c.id, c.label])),
    [choices],
  );
  const selectedOrgs = useMemo(() => {
    const ids = [...new Set((organizerIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    return ids.sort((a, b) =>
      String(labelById.get(a) || a).localeCompare(String(labelById.get(b) || b), 'es'),
    );
  }, [organizerIds, labelById]);
  const selectedItems = useMemo(
    () => new Set((catalogItemIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    [catalogItemIds],
  );
  const queryNorm = useMemo(
    () =>
      query
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    [query],
  );
  const matchesQuery = (text: string) => {
    if (!queryNorm) return true;
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .includes(queryNorm);
  };
  const remaining = useMemo(
    () =>
      choices
        .filter((c) => !selectedOrgs.includes(c.id))
        .filter((c) => matchesQuery(c.label))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    // matchesQuery closes over queryNorm
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryNorm drives filter
    [choices, selectedOrgs, queryNorm],
  );

  const visibleSelectedOrgs = useMemo(() => {
    if (!queryNorm) return selectedOrgs;
    return selectedOrgs.filter((orgId) => {
      const label = labelById.get(orgId) || orgId;
      if (matchesQuery(label)) return true;
      return stockItemsForOrganizer(catalogItems, orgId, storeIngredients, commercialBrands).some((item) =>
        matchesQuery(item.name),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryNorm drives filter
  }, [selectedOrgs, labelById, catalogItems, storeIngredients, commercialBrands, queryNorm]);

  // Al editar o al añadir el primer organizador: abrir uno para ver productos.
  // No reabrir si el usuario cerró manualmente (antes reabría al poner openOrganizerId '').
  useEffect(() => {
    const count = selectedOrgs.length;
    if (count > 0 && prevSelectedOrgCountRef.current === 0) {
      setOpenOrganizerId(selectedOrgs[0]);
    }
    prevSelectedOrgCountRef.current = count;
  }, [selectedOrgs]);

  const emit = (nextOrgs: string[], nextItems: Set<string>, nextCosts = itemCosts) => {
    const costs: Record<string, string> = {};
    for (const id of nextItems) {
      if (nextCosts[id] != null && String(nextCosts[id]).trim() !== '') costs[id] = nextCosts[id];
    }
    onChange({ organizerIds: nextOrgs, catalogItemIds: [...nextItems], itemCosts: costs });
  };

  const addOrganizer = (rawId: string) => {
    const id = String(rawId || '').trim();
    if (!id || selectedOrgs.includes(id)) return;
    emit([...selectedOrgs, id], selectedItems);
    setOpenOrganizerId(id);
    setPickId('');
  };

  const removeOrganizer = (id: string) => {
    const itemsOfOrg = stockItemsForOrganizer(catalogItems, id, storeIngredients, commercialBrands);
    const nextItems = new Set(selectedItems);
    for (const item of itemsOfOrg) nextItems.delete(item._id);
    const nextOrgs = selectedOrgs.filter((x) => x !== id);
    emit(nextOrgs, nextItems);
    if (openOrganizerId === id) setOpenOrganizerId(nextOrgs[0] || '');
  };

  const toggleItem = (item: CatalogItem) => {
    const next = new Set(selectedItems);
    const nextCosts = { ...itemCosts };
    if (next.has(item._id)) {
      next.delete(item._id);
      delete nextCosts[item._id];
    } else {
      next.add(item._id);
      if (nextCosts[item._id] == null || String(nextCosts[item._id]).trim() === '') {
        const n = Number(item.costPrice);
        nextCosts[item._id] = Number.isFinite(n) && n > 0 ? String(n) : '';
      }
    }
    emit(selectedOrgs, next, nextCosts);
  };

  const setItemCost = (itemId: string, raw: string) => {
    emit(selectedOrgs, selectedItems, { ...itemCosts, [itemId]: raw });
  };

  const toggleAllInOrganizer = (_orgId: string, items: CatalogItem[], allOn: boolean) => {
    const next = new Set(selectedItems);
    const nextCosts = { ...itemCosts };
    for (const item of items) {
      if (allOn) {
        next.delete(item._id);
        delete nextCosts[item._id];
      } else {
        next.add(item._id);
        if (nextCosts[item._id] == null || String(nextCosts[item._id]).trim() === '') {
          const n = Number(item.costPrice);
          nextCosts[item._id] = Number.isFinite(n) && n > 0 ? String(n) : '';
        }
      }
    }
    emit(selectedOrgs, next, nextCosts);
  };

  const openCategoryPicker = () => {
    const el = pickRef.current;
    if (!el || remaining.length === 0) return;
    el.focus({ preventScroll: true });
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
        return;
      }
    } catch {
      // showPicker puede fallar en algunos navegadores; fallback abajo.
    }
    el.click();
  };

  const handleAddCategoryClick = () => {
    if (pickId) {
      addOrganizer(pickId);
      return;
    }
    openCategoryPicker();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClassName}>Qué te vende</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Elige una categoría del desplegable (se añade al elegir) o pulsa <span className="font-semibold">Añadir otro</span> para elegir otra. Marca lo que te vende y pon el precio €/ud.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            ref={pickRef}
            value={pickId}
            onChange={(e) => {
              const id = e.target.value;
              setPickId(id);
              if (id) addOrganizer(id);
            }}
            className="flex-1 min-h-11 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
          >
            <option value="">
              {queryNorm && remaining.length === 0 ? 'Sin coincidencias…' : 'Elegir categoría…'}
            </option>
            {remaining.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddCategoryClick}
            disabled={remaining.length === 0}
            className={VERTIAL_BTN_SECONDARY}
            title={
              remaining.length === 0
                ? queryNorm
                  ? 'Ninguna categoría coincide con la búsqueda'
                  : 'Ya tienes todas las categorías'
                : pickId
                  ? 'Añadir la categoría elegida'
                  : 'Elegir otra categoría'
            }
          >
            <Plus className="w-4 h-4" />
            Añadir otro
          </button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar categoría o producto…"
            className="w-full min-h-11 pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
          />
        </div>
        {choices.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">
            No hay categorías todavía. Crea una al dar de alta un producto (Nueva categoría) y vuelve aquí.
          </p>
        ) : remaining.length === 0 && selectedOrgs.length > 0 && !queryNorm ? (
          <p className="text-xs text-gray-400 mt-2">Ya tienes todas las categorías añadidas.</p>
        ) : null}
      </div>

      {visibleSelectedOrgs.length > 0 ? (
        <div className="space-y-2">
          {visibleSelectedOrgs.map((orgId) => {
            const itemsAll = stockItemsForOrganizer(
              catalogItems,
              orgId,
              storeIngredients,
              commercialBrands,
            );
            const items = queryNorm
              ? itemsAll.filter((item) => matchesQuery(item.name) || matchesQuery(labelById.get(orgId) || ''))
              : itemsAll;
            const checkedCount = itemsAll.filter((i) => selectedItems.has(i._id)).length;
            const open = openOrganizerId === orgId || Boolean(queryNorm && items.length > 0);
            const allOn = items.length > 0 && items.every((i) => selectedItems.has(i._id));
            return (
              <div
                key={orgId}
                className={`rounded-xl border-2 overflow-hidden ${
                  open ? `${VERTIAL_ACCENT_BORDER} ${VERTIAL_ACCENT_BG}` : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenOrganizerId(open && !queryNorm ? '' : orgId)}
                    aria-expanded={open}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                        open ? 'rotate-0' : '-rotate-90'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {labelById.get(orgId) || orgId}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {itemsAll.length === 0
                          ? 'Sin productos en esta categoría'
                          : queryNorm
                            ? `${items.length} coincidencia${items.length !== 1 ? 's' : ''} · ${checkedCount} marcado${checkedCount !== 1 ? 's' : ''}`
                            : `${checkedCount} de ${itemsAll.length} producto${itemsAll.length !== 1 ? 's' : ''} marcado${checkedCount !== 1 ? 's' : ''}`}
                      </p>
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 shrink-0 hidden sm:inline">
                      {open ? 'Cerrar' : 'Abrir'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOrganizer(orgId)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Quitar categoría"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {open ? (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">
                        {queryNorm
                          ? 'Ningún producto coincide con la búsqueda en esta categoría.'
                          : 'Esta categoría no tiene productos. Cuando crees productos con esa categoría, saldrán aquí para marcarlos.'}
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleAllInOrganizer(orgId, items, allOn)}
                          className="text-xs font-semibold text-[var(--v-blue,#2563eb)] mb-2 hover:underline"
                        >
                          {allOn ? 'Quitar todos' : 'Marcar todos'}
                        </button>
                        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                          {items.map((item) => {
                            const on = selectedItems.has(item._id);
                            return (
                              <li key={item._id} className="py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleItem(item)}
                                    className="min-w-0 flex-1 flex items-center gap-2 text-left text-sm"
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                        on
                                          ? 'border-blue-600 bg-blue-600 text-white'
                                          : 'border-gray-300 dark:border-gray-600'
                                      }`}
                                    >
                                      {on ? <Check className="w-3.5 h-3.5" /> : null}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-gray-100">
                                      {item.name}
                                    </span>
                                    <CatalogUnitChip unit={item.unit} size="sm" />
                                  </button>
                                  {on ? (
                                    <label className="flex items-center gap-1 shrink-0">
                                      <span className="text-[11px] text-gray-400">€/ud</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={itemCosts[item._id] ?? ''}
                                        placeholder="0"
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setItemCost(item._id, e.target.value)}
                                        className="w-20 px-2 py-1.5 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm tabular-nums text-right text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
                                      />
                                    </label>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : selectedOrgs.length > 0 && queryNorm ? (
        <p className="text-sm text-gray-400">Ninguna categoría o producto coincide con «{query.trim()}».</p>
      ) : null}
    </div>
  );
}

/** Etiquetas legibles de los organizadores guardados en un proveedor. */
export function labelsForSupplierOrganizerIds(
  organizerIds: string[] | undefined,
  brands: BrandLike[] = [],
  catalogItems: CatalogItem[] = [],
): string[] {
  const ids = (Array.isArray(organizerIds) ? organizerIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (ids.length === 0) return [];
  const lines = commercialLineBrands(brands) as InventoryCommercialBrand[];
  const byId = new Map([
    ...listInventoryOrganizerChoices(lines).map((c) => [c.id, c.label] as const),
    // Legacy: proveedores guardados con `cat:…` de carta.
    ...listCatalogCategoryOrganizerChoices(brands, catalogItems).map((c) => [c.id, c.label] as const),
  ]);
  return ids
    .map((id) => byId.get(id) || id)
    .sort((a, b) => a.localeCompare(b, 'es'));
}

export function initialSupplierCatalogItemIds(
  supplier: { _id?: string; catalogItemIds?: string[] } | null | undefined,
  catalogItems: CatalogItem[],
): string[] {
  const fromDoc = (Array.isArray(supplier?.catalogItemIds) ? supplier!.catalogItemIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (fromDoc.length > 0) return [...new Set(fromDoc)];
  const sid = String(supplier?._id || '').trim();
  if (!sid) return [];
  return catalogItems.filter((i) => i.supplierId === sid).map((i) => i._id);
}

export function initialSupplierItemCosts(
  itemIds: string[],
  catalogItems: CatalogItem[],
): Record<string, string> {
  const byId = new Map(catalogItems.map((i) => [i._id, i]));
  const out: Record<string, string> = {};
  for (const id of itemIds) {
    const n = Number(byId.get(id)?.costPrice);
    if (Number.isFinite(n) && n > 0) out[id] = String(n);
  }
  return out;
}

export function parseSupplierItemCosts(raw: Record<string, string> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw || {})) {
    const n = Number(String(value || '').replace(',', '.').trim());
    if (!id || !Number.isFinite(n) || n < 0) continue;
    out[id] = Math.round(n * 10000) / 10000;
  }
  return out;
}
