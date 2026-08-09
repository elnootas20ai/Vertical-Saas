import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Euro,
  ListPlus,
  Save,
  AlertCircle,
  Package,
  Pencil,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  catalogItemsUsingIngredient,
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  mergeDuplicateStoreIngredients,
  normalizeStoreIngredients,
  normalizeTpvDefaultExtraPrice,
  parseIngredientsBulkText,
  readStoreIngredientTpvFlags,
  resolveIngredientRole,
  resolveStoreIngredientBrandIds,
  withStoreIngredientTpvFlags,
  filterStoreIngredientsByBrand,
  countStoreIngredientsByBrand,
  explodeStoreIngredientsPerBrand,
  storeIngredientsNeedPerBrandSplit,
  unifyStoreIngredientsFromConfig,
  resolveBrandTpvCategoryKeys,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { getDeliveryConfigRequest, listCatalogItemsRequest, updateDeliveryConfigRequest, type CatalogItem } from '../../lib/deliveryApi';
import { notifyDeliveryConfigChanged } from '../../lib/deliverySetup';
import { applyVertialDefaultsToStoreIngredients, withVertialDefaultBaseCost } from '../../lib/vertialDefaultCosts';
import { normalizeTenantUserId } from '../../lib/tenantUserId';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { sortBrandsForDisplay } from '../../lib/brandUtils';
import {
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
  SaasTabEmpty,
  SaasTabToolbarRow,
  SaasTabWorkspace,
} from './SaasTabWorkspace';

const PART_OPTIONS: Array<{ value: TpvCategoryTemplateKey; label: string }> = [
  { value: 'pizzas', label: 'Pizzas' },
  { value: 'hamburguesas', label: 'Hamburguesas' },
];

type ListFilter = 'all' | 'extra' | 'base' | 'inventario';
type SortMode = 'name-asc' | 'name-desc' | 'extra-first';

/** Filas visibles por grupo antes del «mostrar más»: evita listas infinitas. */
const GROUP_PREVIEW_ROWS = 15;

function ingredientNameFold(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function catalogInventoryItemsForIngredient(catalogItems: CatalogItem[], name: string): CatalogItem[] {
  const key = ingredientNameFold(name);
  if (!key) return [];
  return catalogItems.filter((item) => {
    if (ingredientNameFold(item.name) !== key) return false;
    return item.stockCategory === 'ingredient' || item.module === 'stock';
  });
}

function ingredientMatchesInventarioFilter(ing: StoreIngredient, catalogItems: CatalogItem[]): boolean {
  return catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0;
}

/** Interruptor en línea para las tablas (mismo look que el toggle Web del catálogo). */
function InlineToggle({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative inline-block align-middle ${
        checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/** Celda de coste editable: escribe y sal del campo (o Enter) para aplicar. */
function IngredientCostCell({
  ingredient,
  onCommit,
}: {
  ingredient: StoreIngredient;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(ingredient.baseCost != null ? String(ingredient.baseCost) : '');

  useEffect(() => {
    setDraft(ingredient.baseCost != null ? String(ingredient.baseCost) : '');
  }, [ingredient.id, ingredient.baseCost]);

  const commit = () => {
    const raw = draft.trim().replace(',', '.');
    const n = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setDraft(ingredient.baseCost != null ? String(ingredient.baseCost) : '');
      return;
    }
    const rounded = Math.round(n * 100) / 100;
    setDraft(String(rounded));
    if (rounded !== (ingredient.baseCost ?? 0)) onCommit(rounded);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="0,00"
        className="w-20 px-2 py-1 text-right text-sm tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 outline-none focus:border-[var(--v-blue,#2563eb)]"
      />
      <span className="text-xs text-gray-400">€</span>
    </span>
  );
}

function toTpvPanelItems(list: StoreIngredient[]): StoreIngredient[] {
  const mapped = list
    .filter((ing) => resolveIngredientRole(ing) !== 'escandallo')
    .map((ing) => {
      const { extraPrices: _legacyPrices, extraPrice: _legacyPrice, ...rest } = ing;
      const flags = readStoreIngredientTpvFlags(ing);
      return withStoreIngredientTpvFlags(
        {
          ...rest,
          escandalloOnly: false,
        },
        flags,
      );
    });

  const seen = new Set<string>();
  return mapped.map((ing, index) => {
    const baseId = String(ing.id || '').trim() || `ing-${ingredientNameFold(ing.name)}-${index}`;
    let id = baseId;
    let n = 0;
    while (seen.has(id)) {
      n += 1;
      id = `${baseId}-${n}`;
    }
    seen.add(id);
    return id === ing.id ? ing : { ...ing, id };
  });
}

type IngredientDraft = {
  name: string;
  brandIds: string[];
  productParts: TpvCategoryTemplateKey[];
  chargeExtra: boolean;
  allowRemove: boolean;
};

function emptyDraft(allBrandIds: string[], chargeExtra: boolean): IngredientDraft {
  return {
    name: '',
    brandIds: [...allBrandIds],
    productParts: ['pizzas', 'hamburguesas'],
    chargeExtra,
    allowRemove: true,
  };
}

function togglePart(parts: TpvCategoryTemplateKey[], part: TpvCategoryTemplateKey): TpvCategoryTemplateKey[] {
  const set = new Set(parts);
  if (set.has(part)) set.delete(part);
  else set.add(part);
  return [...set];
}

function itemToDraft(ing: StoreIngredient, allBrandIds: string[]): IngredientDraft {
  const flags = readStoreIngredientTpvFlags(ing);
  return {
    name: ing.name,
    brandIds: resolveStoreIngredientBrandIds(ing, allBrandIds),
    productParts: ing.productParts?.length ? [...ing.productParts] : ['pizzas', 'hamburguesas'],
    chargeExtra: flags.chargeExtra,
    allowRemove: flags.allowRemove,
  };
}

function draftToItem(
  draft: IngredientDraft,
  allBrandIds: string[],
  existingId?: string,
): StoreIngredient | null {
  const name = draft.name.trim();
  const brandIds = draft.brandIds.length > 0 ? draft.brandIds : allBrandIds;
  if (!name || draft.productParts.length === 0) return null;
  if (allBrandIds.length > 0 && brandIds.length === 0) return null;
  return withStoreIngredientTpvFlags(
    {
      id: existingId || `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      escandalloOnly: false,
      ...(brandIds.length > 0 ? { brandIds: [...brandIds] } : {}),
      productParts: [...draft.productParts],
    },
    { chargeExtra: draft.chargeExtra, allowRemove: draft.allowRemove },
  );
}

function IngredientRow({
  draft,
  brands,
  onChange,
  onRemove,
  isNew,
  onAdd,
  fixedRole,
}: {
  draft: IngredientDraft;
  brands: Brand[];
  onChange: (next: IngredientDraft) => void;
  onRemove?: () => void;
  isNew?: boolean;
  onAdd?: () => void;
  fixedRole?: 'extra' | 'base';
}) {
  const showBrands = brands.length > 1;
  const brandSet = new Set(draft.brandIds);
  const partSet = new Set(draft.productParts);
  const chargeExtra = fixedRole ? fixedRole === 'extra' : draft.chargeExtra;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${
        isNew
          ? 'border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20'
          : chargeExtra
            ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/40'
            : 'border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            if (isNew && e.key === 'Enter') {
              e.preventDefault();
              onAdd?.();
            }
          }}
          placeholder="Nombre del ingrediente"
          className="flex-1 min-w-[140px] px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800"
        />
        {PART_OPTIONS.map((part) => (
          <label
            key={part.value}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              partSet.has(part.value)
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={partSet.has(part.value)}
              onChange={() => onChange({ ...draft, productParts: togglePart(draft.productParts, part.value) })}
            />
            {part.label}
          </label>
        ))}
        {!fixedRole && (
          <>
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                draft.chargeExtra
                  ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={draft.chargeExtra}
                onChange={(e) => onChange({ ...draft, chargeExtra: e.target.checked })}
              />
              Extra
            </label>
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                draft.allowRemove
                  ? 'border-gray-400 bg-gray-50 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={draft.allowRemove}
                onChange={(e) => onChange({ ...draft, allowRemove: e.target.checked })}
              />
              Quitar
            </label>
          </>
        )}
        {isNew ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Añadir
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
            aria-label="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {showBrands && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {brands.map((brand) => {
            const on = brandSet.has(brand._id);
            return (
              <button
                key={brand._id}
                type="button"
                onClick={() => {
                  const next = new Set(draft.brandIds);
                  if (on) next.delete(brand._id);
                  else next.add(brand._id);
                  onChange({ ...draft, brandIds: [...next] });
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  on
                    ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {brand.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sortIngredientList(items: StoreIngredient[], sortMode: SortMode): StoreIngredient[] {
  const list = [...items];
  list.sort((a, b) => {
    if (sortMode === 'extra-first') {
      const ae = readStoreIngredientTpvFlags(a).chargeExtra ? 0 : 1;
      const be = readStoreIngredientTpvFlags(b).chargeExtra ? 0 : 1;
      if (ae !== be) return ae - be;
    }
    const cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    return sortMode === 'name-desc' ? -cmp : cmp;
  });
  return list;
}

function filterVisibleItems(
  items: StoreIngredient[],
  search: string,
  listFilter: ListFilter,
  catalogItems: CatalogItem[],
): StoreIngredient[] {
  const q = search.trim().toLowerCase();
  let list = items;
  if (listFilter === 'extra') {
    list = list.filter((i) => readStoreIngredientTpvFlags(i).chargeExtra);
  }
  if (listFilter === 'base') {
    list = list.filter((i) => readStoreIngredientTpvFlags(i).allowRemove);
  }
  if (listFilter === 'inventario') {
    list = list.filter((i) => ingredientMatchesInventarioFilter(i, catalogItems));
  }
  if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
  return list;
}

export function StoreIngredientsPanel({ userId, businessId }: { userId: string; businessId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configDocId, setConfigDocId] = useState<string | undefined>();
  const [configRev, setConfigRev] = useState<string | undefined>();
  const [items, setItems] = useState<StoreIngredient[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newDraft, setNewDraft] = useState<IngredientDraft>(() => emptyDraft([], false));
  const [defaultExtraPrice, setDefaultExtraPrice] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [creating, setCreating] = useState(false);

  const commitItems = useCallback((updater: StoreIngredient[] | ((prev: StoreIngredient[]) => StoreIngredient[])) => {
    setItems((prev) => {
      const raw = typeof updater === 'function' ? updater(prev) : updater;
      const { items: deduped, mergedCount } = mergeDuplicateStoreIngredients(raw);
      if (mergedCount > 0) {
        toast.message(`Fusionamos ${mergedCount} duplicado(s) automáticamente`, { duration: 4500 });
        setDirty(true);
      }
      return deduped;
    });
  }, []);

  const [selectedBrandId, setSelectedBrandId] = useState('');

  const allBrandIds = useMemo(() => brands.map((b) => b._id), [brands]);
  const multiBrand = brands.length > 1;
  const activeBrandId = multiBrand
    ? selectedBrandId && allBrandIds.includes(selectedBrandId)
      ? selectedBrandId
      : allBrandIds[0] || ''
    : allBrandIds[0] || '';
  const activeBrand = brands.find((b) => b._id === activeBrandId);
  const brandScopedItems = useMemo(
    () => (multiBrand ? filterStoreIngredientsByBrand(items, activeBrandId, allBrandIds) : items),
    [items, multiBrand, activeBrandId, allBrandIds],
  );
  const hasExtras = useMemo(
    () => items.some((i) => readStoreIngredientTpvFlags(i).chargeExtra),
    [items],
  );
  const extraItems = useMemo(
    () => brandScopedItems.filter((i) => readStoreIngredientTpvFlags(i).chargeExtra),
    [brandScopedItems],
  );
  const baseItems = useMemo(
    () => brandScopedItems.filter((i) => readStoreIngredientTpvFlags(i).allowRemove),
    [brandScopedItems],
  );
  const inventarioItems = useMemo(
    () => brandScopedItems.filter((i) => ingredientMatchesInventarioFilter(i, catalogItems)),
    [brandScopedItems, catalogItems],
  );

  const visibleIngredients = useMemo(
    () => sortIngredientList(filterVisibleItems(brandScopedItems, search, listFilter, catalogItems), sortMode),
    [brandScopedItems, search, listFilter, catalogItems, sortMode],
  );

  /** Grupos estilo catálogo: extras de pago arriba, incluidos debajo. */
  const ingredientGroups = useMemo(
    () => [
      {
        id: 'extras',
        title: 'Extras de pago',
        hint: 'Se cobran al añadirlos a un producto en el TPV',
        items: visibleIngredients.filter((i) => readStoreIngredientTpvFlags(i).chargeExtra),
      },
      {
        id: 'incluidos',
        title: 'Incluidos en los productos',
        hint: 'Parte de la receta; el cliente puede quitarlos sin coste',
        items: visibleIngredients.filter((i) => !readStoreIngredientTpvFlags(i).chargeExtra),
      },
    ],
    [visibleIngredients],
  );

  const editingIngredient = useMemo(
    () => (editingId ? items.find((i) => i.id === editingId) ?? null : null),
    [items, editingId],
  );

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBrandChange = (id: string) => {
    setSelectedBrandId(id);
    setSearch('');
    setListFilter('all');
    setEditingId(null);
    setNewDraft(emptyDraft([id], false));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const cfg = await Promise.race([
        getDeliveryConfigRequest(userId),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('timeout')), 15_000);
        }),
      ]);
      const catalog = await listCatalogItemsRequest(userId, 'catalog').catch(() => []);
      setCatalogItems(catalog);
      const lineBrands = sortBrandsForDisplay(
        businessId ? commercialLineBrands(await listBrandsRequest(businessId).catch(() => [])) : [],
      );
      const brandIds = lineBrands.map((b) => b._id);
      const merged = unifyStoreIngredientsFromConfig(cfg, brandIds);
      const split = explodeStoreIngredientsPerBrand(merged, lineBrands);
      const unified = toTpvPanelItems(split);
      const { items: deduped, mergedCount } = mergeDuplicateStoreIngredients(unified);
      const { items: withCosts, appliedCount } = applyVertialDefaultsToStoreIngredients(deduped, lineBrands);
      const needsPersistSplit =
        lineBrands.length > 1 && storeIngredientsNeedPerBrandSplit(merged, brandIds);
      const needsPersistCosts = appliedCount > 0;
      const persistItems = withCosts;

      setConfigDocId(cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`);
      setConfigRev(cfg._rev);
      setBrands(lineBrands);
      setItems(persistItems);
      if (mergedCount > 0) {
        setDirty(true);
        toast.message(`Fusionamos ${mergedCount} duplicado(s) al cargar`, { duration: 5000 });
      }

      if ((needsPersistSplit || needsPersistCosts) && persistItems.length > 0) {
        try {
          const saved = await updateDeliveryConfigRequest(userId, {
            _id: cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`,
            _rev: cfg._rev,
            storeIngredients: normalizeStoreIngredients(persistItems),
          } as Parameters<typeof updateDeliveryConfigRequest>[1]);
          setConfigDocId(saved._id || cfg._id);
          setConfigRev(saved._rev);
          notifyDeliveryConfigChanged();
          if (needsPersistSplit) {
            toast.success('Ingredientes separados por marca (modomio / blackburger…)', { duration: 5000 });
          }
          // Costes de referencia Vertial: se guardan en silencio (evita toast en cada entrada).
          setDirty(mergedCount > 0);
        } catch {
          setDirty(true);
          if (needsPersistSplit) {
            toast.message('Revisa y guarda: hay ingredientes compartidos entre marcas', { duration: 6000 });
          }
        }
      } else {
        setDirty(mergedCount > 0);
      }
      setSelectedBrandId((prev) =>
        prev && brandIds.includes(prev) ? prev : brandIds[0] || '',
      );
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(unified, cfg.tpvDefaultExtraPrice) || ''));
      setNewDraft(emptyDraft(brandIds, false));
    } catch {
      setLoadError('Error al cargar');
      toast.error('No se pudieron cargar los ingredientes');
    } finally {
      setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const validateDraft = (draft: IngredientDraft): string | null => {
    if (!draft.name.trim()) return 'Escribe el nombre';
    if (multiBrand && draft.brandIds.length === 0) return 'Elige al menos una marca';
    if (!multiBrand && allBrandIds.length > 0 && draft.brandIds.length === 0) return 'Elige al menos una marca';
    if (draft.productParts.length === 0) return 'Elige pizzas o hamburguesas';
    return null;
  };

  const validateSave = (): string | null => {
    if (!hasExtras) return null;
    const price = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
    if (price == null) return 'Indica el precio de los extras';
    return null;
  };

  const addItem = (draft: IngredientDraft) => {
    const err = validateDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    const created = draftToItem(draft, allBrandIds);
    if (!created) return;
    const row = withVertialDefaultBaseCost(created, brands);
    commitItems((prev) => [...prev, row]);
    setNewDraft(emptyDraft(allBrandIds, false));
    setSearch('');
    setDirty(true);
    toast.success(`«${row.name}» añadido`);
  };

  const importBulk = () => {
    const names = parseIngredientsBulkText(bulkText);
    if (names.length === 0) return;

    if (multiBrand && !activeBrandId) {
      toast.error('Elige una marca antes de añadir la lista');
      return;
    }

    const targetBrandIds =
      multiBrand && activeBrandId ? [activeBrandId] : allBrandIds.length > 0 ? [...allBrandIds] : [];
    const targetParts =
      activeBrand && resolveBrandTpvCategoryKeys(activeBrand).length > 0
        ? resolveBrandTpvCategoryKeys(activeBrand)
        : (['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]);

    let added = 0;
    let promoted = 0;
    let skipped = 0;
    let brandTotal = 0;

    commitItems((prev) => {
      const next = [...prev];
      let seq = 0;
      for (const rawName of names) {
        const name = rawName.trim();
        if (!name) continue;
        const key = ingredientNameFold(name);
        const idx = next.findIndex(
          (i) =>
            ingredientNameFold(i.name) === key &&
            (!multiBrand ||
              filterStoreIngredientsByBrand([i], activeBrandId, allBrandIds).length > 0),
        );
        if (idx >= 0) {
          if (!readStoreIngredientTpvFlags(next[idx]).chargeExtra) {
            promoted += 1;
            next[idx] = withStoreIngredientTpvFlags(next[idx], { chargeExtra: true, allowRemove: true });
          } else {
            skipped += 1;
          }
          continue;
        }
        added += 1;
        seq += 1;
        next.push(
          withVertialDefaultBaseCost(
            withStoreIngredientTpvFlags(
              {
                id: `ing-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 9)}`,
                name,
                escandalloOnly: false,
                ...(targetBrandIds.length > 0 ? { brandIds: [...targetBrandIds] } : {}),
                productParts: [...targetParts],
              },
              { chargeExtra: true, allowRemove: true },
            ),
            brands,
          ),
        );
      }
      const normalized = toTpvPanelItems(next);
      brandTotal = multiBrand
        ? normalized.filter(
            (i) => filterStoreIngredientsByBrand([i], activeBrandId, allBrandIds).length > 0,
          ).length
        : normalized.length;
      return normalized;
    });

    setBulkText('');
    setSearch('');
    setListFilter('all');
    setDirty(true);

    const brandLabel = activeBrand?.name || 'esta marca';
    const parts: string[] = [`${names.length} en la lista`];
    if (added > 0) parts.push(`${added} nuevo(s)`);
    if (promoted > 0) parts.push(`${promoted} marcado(s) como extra`);
    if (skipped > 0) parts.push(`${skipped} ya eran extra`);
    parts.push(`${brandTotal} en ${brandLabel}`);

    if (added > 0 || promoted > 0) {
      toast.success(`${parts.join(' · ')}. Pulsa «Guardar en el TPV».`, { duration: 9000 });
    } else if (skipped > 0) {
      toast.info(`${parts.join(' · ')} — no había nada nuevo que añadir.`, { duration: 8000 });
    } else {
      toast.warning('No se reconoció ningún nombre. Usa comas o una línea por ingrediente.');
    }
  };

  const updateItem = (id: string, draft: IngredientDraft) => {
    commitItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const brandIds =
          draft.brandIds.length > 0
            ? draft.brandIds
            : allBrandIds.length > 0
              ? allBrandIds
              : i.brandIds || [];
        const productParts =
          draft.productParts.length > 0 ? draft.productParts : ['pizzas', 'hamburguesas'];
        const name = draft.name.trim() || i.name;
        return withStoreIngredientTpvFlags(
          {
            ...i,
            name,
            brandIds: [...brandIds],
            productParts: [...productParts],
          },
          { chargeExtra: draft.chargeExtra, allowRemove: draft.allowRemove },
        );
      }),
    );
    setDirty(true);
  };

  const removeItem = (id: string) => {
    commitItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
    setDirty(true);
  };

  const updateIngredientTpvFlags = (
    id: string,
    patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>,
  ) => {
    commitItems((prev) =>
      prev.map((i) => (i.id === id ? withStoreIngredientTpvFlags(i, patch) : i)),
    );
    setDirty(true);
  };

  const toggleManyTpvFlags = (
    ids: string[],
    patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>,
  ) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitItems((prev) =>
      prev.map((i) => (idSet.has(i.id) ? withStoreIngredientTpvFlags(i, patch) : i)),
    );
    setDirty(true);
  };

  const updateIngredientBaseCost = (id: string, baseCost: number) => {
    commitItems((prev) => prev.map((i) => (i.id === id ? { ...i, baseCost } : i)));
    setDirty(true);
  };

  const save = async () => {
    const rows = items.filter((i) => String(i.name || '').trim());
    if (rows.length === 0) {
      toast.error('Añade al menos un ingrediente antes de guardar');
      return;
    }
    const err = validateSave();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const tpvDefaultExtraPrice = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
      const saved = await updateDeliveryConfigRequest(userId, {
        _id: configDocId || `dlvconf-${normalizeTenantUserId(userId)}`,
        _rev: configRev,
        storeIngredients: normalizeStoreIngredients(rows),
        ...(tpvDefaultExtraPrice != null ? { tpvDefaultExtraPrice } : {}),
      } as Parameters<typeof updateDeliveryConfigRequest>[1]);
      setConfigDocId(saved._id || configDocId);
      setConfigRev(saved._rev);
      const merged = unifyStoreIngredientsFromConfig(saved, allBrandIds);
      const split = explodeStoreIngredientsPerBrand(merged, brands);
      const unified = toTpvPanelItems(split);
      const { items: deduped } = mergeDuplicateStoreIngredients(unified);
      setItems(deduped);
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(deduped, saved.tpvDefaultExtraPrice) || ''));
      setDirty(false);
      notifyDeliveryConfigChanged();
      const savedExtras = deduped.filter((i) => ingredientChargesExtra(i)).length;
      const savedBase = deduped.length - savedExtras;
      if (savedExtras === 0) {
        toast.warning('Guardado, pero ningún extra de pago marcado. Márcalos en la ficha del ingrediente.', {
          duration: 8000,
        });
      } else {
        toast.success(`Guardado · ${savedExtras} extras · ${savedBase} incluidos`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--v-blue,#2563eb)] mb-3" />
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const priceOk = !hasExtras || normalizeTpvDefaultExtraPrice(defaultExtraPrice) != null;
  const filteredVisible = filterVisibleItems(brandScopedItems, search, listFilter, catalogItems).length;
  const canSave = !saving && priceOk;

  const markAllBrandAsExtra = () => {
    toggleManyTpvFlags(
      brandScopedItems.map((i) => i.id),
      { chargeExtra: true },
    );
  };

  const markVisibleAsExtra = () => {
    toggleManyTpvFlags(
      filterVisibleItems(brandScopedItems, search, listFilter, catalogItems).map((i) => i.id),
      { chargeExtra: true },
    );
  };

  const markVisibleAsBase = () => {
    toggleManyTpvFlags(
      filterVisibleItems(brandScopedItems, search, listFilter, catalogItems).map((i) => i.id),
      { chargeExtra: false, allowRemove: true },
    );
  };

  return (
    <div className="pb-20 lg:pb-4">
      <SaasTabWorkspace
        stats={[
          { label: 'ingredientes', value: brandScopedItems.length },
          { label: 'extras de pago', value: extraItems.length, tone: extraItems.length > 0 ? 'amber' : 'default' },
        ]}
        statsTrailing={
          <>
            <label
              className="inline-flex items-center gap-1"
              title="Precio que se suma al producto por cada extra añadido en el TPV"
            >
              <Euro className="w-3 h-3 text-gray-400" />
              <span className="text-gray-500">Precio por extra</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={defaultExtraPrice}
                onChange={(e) => {
                  setDefaultExtraPrice(e.target.value);
                  setDirty(true);
                }}
                className="w-16 px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-xs font-semibold bg-white dark:bg-gray-800 focus:border-amber-400 outline-none"
                title="Precio por defecto de los extras en el TPV"
              />
              <span>€</span>
            </label>
            <SaasTabPrimaryButton
              disabled={!canSave}
              onClick={() => void save()}
              className={
                dirty
                  ? ''
                  : '!bg-emerald-50 !text-emerald-800 border border-emerald-300 dark:!bg-emerald-950/30 dark:!text-emerald-200 dark:border-emerald-700 hover:!bg-emerald-100'
              }
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : dirty ? 'Guardar TPV' : 'Guardado'}
            </SaasTabPrimaryButton>
          </>
        }
        banner={
          dirty ? (
            <p className="text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Cambios pendientes — no llegan al TPV hasta guardar.
              {hasExtras && !priceOk ? ' Indica el precio del extra.' : ''}
            </p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              Ingredientes de tus productos en el TPV: marca cuáles se cobran como{' '}
              <strong className="text-amber-700 dark:text-amber-400">extra</strong> y cuáles puede{' '}
              <strong className="text-gray-700 dark:text-gray-300">quitar</strong> el cliente.
              Elige un ingrediente de la lista para ver su ficha.
            </p>
          )
        }
        toolbar={
          <>
            <SaasTabToolbarRow
              left={
                <>
                  <SaasTabSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar ingrediente…"
                    className="relative w-full sm:w-48"
                  />
                  {multiBrand ? (
                    <select
                      value={activeBrandId}
                      onChange={(e) => handleBrandChange(e.target.value)}
                      className="py-1.5 pl-2 pr-7 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold bg-white dark:bg-gray-900 outline-none"
                      title="Marca"
                    >
                      {brands.map((b) => (
                        <option key={b._id} value={b._id}>
                          {b.name} ({countStoreIngredientsByBrand(items, b._id, allBrandIds)})
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <select
                    value={listFilter}
                    onChange={(e) => setListFilter(e.target.value as ListFilter)}
                    className="py-1.5 pl-2 pr-7 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold bg-white dark:bg-gray-900 outline-none"
                    title="Filtrar por estado"
                  >
                    <option value="all">Todos ({brandScopedItems.length})</option>
                    <option value="extra">Extras de pago ({extraItems.length})</option>
                    <option value="base">Se pueden quitar ({baseItems.length})</option>
                    <option value="inventario">Con inventario ({inventarioItems.length})</option>
                  </select>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="py-1.5 pl-2 pr-7 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold bg-white dark:bg-gray-900 outline-none"
                    title="Ordenar"
                  >
                    <option value="name-asc">A→Z</option>
                    <option value="name-desc">Z→A</option>
                    <option value="extra-first">Extras primero</option>
                  </select>
                </>
              }
              right={
                <>
                  <SaasTabSecondaryButton
                    onClick={() => {
                      setShowBatchPanel((v) => !v);
                      setShowBulkPanel(false);
                    }}
                  >
                    Marcar en lote
                  </SaasTabSecondaryButton>
                  <SaasTabSecondaryButton
                    onClick={() => {
                      setShowBulkPanel((v) => !v);
                      setShowBatchPanel(false);
                    }}
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    Añadir lista
                  </SaasTabSecondaryButton>
                  <SaasTabPrimaryButton
                    onClick={() => {
                      setCreating(true);
                      setEditingId(null);
                    }}
                    className="!bg-[var(--v-blue,#2563eb)] hover:!bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuevo ingrediente
                  </SaasTabPrimaryButton>
                </>
              }
            />
            {showBatchPanel ? (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-gray-500">Aplicar a esta marca:</span>
                <button
                  type="button"
                  onClick={markAllBrandAsExtra}
                  disabled={brandScopedItems.length === 0}
                  className="px-2 py-1 rounded-lg font-semibold border border-amber-200 text-amber-800 bg-amber-50 disabled:opacity-40"
                >
                  Todos extra
                </button>
                <button
                  type="button"
                  onClick={markVisibleAsExtra}
                  disabled={filteredVisible === 0}
                  className="px-2 py-1 rounded-lg font-semibold border border-amber-200 text-amber-800 bg-amber-50 disabled:opacity-40"
                >
                  Visibles → extra
                </button>
                <button
                  type="button"
                  onClick={markVisibleAsBase}
                  disabled={filteredVisible === 0}
                  className="px-2 py-1 rounded-lg font-semibold border border-gray-200 text-gray-600 bg-white disabled:opacity-40"
                >
                  Visibles → quitar
                </button>
              </div>
            ) : null}
            {showBulkPanel ? (
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={2}
                  placeholder={'Mozzarella, Tomate, Bacon… (comas o una línea por ingrediente)'}
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 resize-none focus:border-[var(--v-blue,#2563eb)] outline-none"
                />
                <SaasTabPrimaryButton
                  onClick={() => {
                    importBulk();
                    setShowBulkPanel(false);
                  }}
                  disabled={!bulkText.trim()}
                  className="!bg-[var(--v-blue,#2563eb)] hover:!bg-blue-700 shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  Añadir lista
                </SaasTabPrimaryButton>
              </div>
            ) : null}
          </>
        }
      >
        <div className="p-3 space-y-3">
          {creating ? (
            <section className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Nuevo ingrediente</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Nombre, dónde se usa y si se cobra como extra. El coste se pone después en su fila.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancelar
                </button>
              </div>
              <IngredientRow
                brands={multiBrand && activeBrand ? [activeBrand] : brands}
                draft={
                  multiBrand && activeBrandId
                    ? { ...newDraft, brandIds: [activeBrandId] }
                    : newDraft
                }
                onChange={setNewDraft}
                isNew
                onAdd={() => {
                  const draft =
                    multiBrand && activeBrandId
                      ? { ...newDraft, brandIds: [activeBrandId] }
                      : newDraft;
                  const err = validateDraft(draft);
                  addItem(draft);
                  if (!err) setCreating(false);
                }}
              />
            </section>
          ) : null}

          {visibleIngredients.length === 0 ? (
            brandScopedItems.length === 0 ? (
              <SaasTabEmpty
                icon={<Package className="w-10 h-10" />}
                title="Sin ingredientes"
                description="Crea el primero con «Nuevo ingrediente» o pega varios con «Añadir lista»."
              />
            ) : (
              <div className="py-8 px-4 text-center text-xs text-gray-500">
                Sin resultados{search.trim() ? ` para «${search.trim()}»` : ''}.
              </div>
            )
          ) : (
            ingredientGroups.map((group) => {
              if (group.items.length === 0) return null;
              const isCollapsed = collapsedGroups.has(group.id);
              const isExpanded = expandedGroups.has(group.id);
              const rows = isExpanded ? group.items : group.items.slice(0, GROUP_PREVIEW_ROWS);
              const hiddenCount = group.items.length - rows.length;
              return (
                <section
                  key={group.id}
                  className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors border-b border-gray-100 dark:border-gray-700"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{group.title}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{group.items.length}</span>
                    <span className="ml-auto hidden sm:block text-[11px] text-gray-400 dark:text-gray-500">
                      {group.hint}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <>
                    {/* Móvil: tarjetas de ingrediente */}
                    <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                      {rows.map((ing) => {
                        const flags = readStoreIngredientTpvFlags(ing);
                        const hasInventory =
                          catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0;
                        const usageCount = catalogItemsUsingIngredient(catalogItems, ing.name, {
                          brandId: multiBrand ? activeBrandId : undefined,
                        }).length;
                        return (
                          <li key={ing.id} className="px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {ing.name}
                                </span>
                                {hasInventory ? (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"
                                    title="Con inventario vinculado"
                                  />
                                ) : null}
                                <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                                  {usageCount > 0 ? `${usageCount} prod.` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(ing.id)}
                                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                  title="Editar nombre, marcas y uso"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    removeItem(ing.id);
                                    toast.success(`«${ing.name}» eliminado`);
                                  }}
                                  className="p-2 rounded-lg text-gray-400 hover:text-red-600"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              <IngredientCostCell
                                ingredient={ing}
                                onCommit={(value) => updateIngredientBaseCost(ing.id, value)}
                              />
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                Extra
                                <InlineToggle
                                  checked={flags.chargeExtra}
                                  onChange={(checked) => updateIngredientTpvFlags(ing.id, { chargeExtra: checked })}
                                  title="Se cobra como extra al añadirlo en el TPV"
                                />
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                Se puede quitar
                                <InlineToggle
                                  checked={flags.allowRemove}
                                  onChange={(checked) => updateIngredientTpvFlags(ing.id, { allowRemove: checked })}
                                  title="El cliente puede quitarlo del producto"
                                />
                              </label>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {/* Desktop: tabla completa */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full min-w-[680px]">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-700">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ingrediente</th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Coste base</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Extra de pago</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Se puede quitar</th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Se usa en</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {rows.map((ing) => {
                            const flags = readStoreIngredientTpvFlags(ing);
                            const hasInventory =
                              catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0;
                            const usageCount = catalogItemsUsingIngredient(catalogItems, ing.name, {
                              brandId: multiBrand ? activeBrandId : undefined,
                            }).length;
                            return (
                              <tr key={ing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                      {ing.name}
                                    </span>
                                    {hasInventory ? (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"
                                        title="Con inventario vinculado"
                                      />
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <IngredientCostCell
                                    ingredient={ing}
                                    onCommit={(value) => updateIngredientBaseCost(ing.id, value)}
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <InlineToggle
                                    checked={flags.chargeExtra}
                                    onChange={(checked) => updateIngredientTpvFlags(ing.id, { chargeExtra: checked })}
                                    title="Se cobra como extra al añadirlo en el TPV"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <InlineToggle
                                    checked={flags.allowRemove}
                                    onChange={(checked) => updateIngredientTpvFlags(ing.id, { allowRemove: checked })}
                                    title="El cliente puede quitarlo del producto"
                                  />
                                </td>
                                <td className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                  {usageCount > 0 ? `${usageCount} prod.` : '—'}
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setEditingId(ing.id)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                                      title="Editar nombre, marcas y uso"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        removeItem(ing.id);
                                        toast.success(`«${ing.name}» eliminado`);
                                      }}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {group.items.length > GROUP_PREVIEW_ROWS ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                        className="w-full px-4 py-2.5 text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:bg-blue-50/60 dark:hover:bg-blue-950/20 border-t border-gray-100 dark:border-gray-700 transition-colors"
                      >
                        {isExpanded ? 'Mostrar menos' : `Mostrar los ${hiddenCount} restantes`}
                      </button>
                    ) : null}
                    </>
                  )}
                </section>
              );
            })
          )}
        </div>
      </SaasTabWorkspace>

      {editingIngredient ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditingId(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Editar ingrediente</h3>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <IngredientRow
              brands={multiBrand ? brands.filter((b) => b._id === activeBrandId) : brands}
              draft={itemToDraft(editingIngredient, allBrandIds)}
              onChange={(draft) => updateItem(editingIngredient.id, draft)}
              onRemove={() => {
                removeItem(editingIngredient.id);
                setEditingId(null);
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-400">Los cambios se aplican al pulsar «Guardar TPV».</p>
              <SaasTabSecondaryButton onClick={() => setEditingId(null)}>Hecho</SaasTabSecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {dirty ? (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-gray-900 px-4 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <SaasTabPrimaryButton
            disabled={!canSave}
            onClick={() => void save()}
            className="w-full justify-center py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar TPV
          </SaasTabPrimaryButton>
        </div>
      ) : null}
    </div>
  );
}
