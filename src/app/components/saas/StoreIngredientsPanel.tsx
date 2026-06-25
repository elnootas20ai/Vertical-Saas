import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  Euro,
  ChevronDown,
  ChevronRight,
  Minus,
  Sparkles,
  ListPlus,
  Settings2,
  Save,
  AlertCircle,
  Package,
} from 'lucide-react';
import {
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  normalizeStoreIngredients,
  normalizeTpvDefaultExtraPrice,
  parseIngredientsBulkText,
  resolveIngredientRole,
  resolveStoreIngredientBrandIds,
  filterStoreIngredientsByBrand,
  countStoreIngredientsByBrand,
  explodeStoreIngredientsPerBrand,
  storeIngredientsNeedPerBrandSplit,
  unifyStoreIngredientsFromConfig,
  resolveBrandTpvCategoryKeys,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { getDeliveryConfigRequest, updateDeliveryConfigRequest } from '../../lib/deliveryApi';
import { notifyDeliveryConfigChanged } from '../../lib/deliverySetup';
import { normalizeTenantUserId } from '../../lib/tenantUserId';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { brandTint, sortBrandsForDisplay } from '../../lib/brandUtils';

const PART_OPTIONS: Array<{ value: TpvCategoryTemplateKey; label: string }> = [
  { value: 'pizzas', label: 'Pizzas' },
  { value: 'hamburguesas', label: 'Hamburguesas' },
];

type ListFilter = 'all' | 'extra' | 'base';

function ingredientNameFold(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function toTpvPanelItems(list: StoreIngredient[]): StoreIngredient[] {
  const mapped = list
    .filter((ing) => resolveIngredientRole(ing) !== 'escandallo')
    .map((ing) => {
      const { extraPrices: _legacyPrices, extraPrice: _legacyPrice, ...rest } = ing;
      return {
        ...rest,
        role: ingredientChargesExtra(ing) ? 'extra' : 'base',
        escandalloOnly: false,
      };
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
};

function emptyDraft(allBrandIds: string[], chargeExtra: boolean): IngredientDraft {
  return {
    name: '',
    brandIds: [...allBrandIds],
    productParts: ['pizzas', 'hamburguesas'],
    chargeExtra,
  };
}

function togglePart(parts: TpvCategoryTemplateKey[], part: TpvCategoryTemplateKey): TpvCategoryTemplateKey[] {
  const set = new Set(parts);
  if (set.has(part)) set.delete(part);
  else set.add(part);
  return [...set];
}

function itemToDraft(ing: StoreIngredient, allBrandIds: string[]): IngredientDraft {
  return {
    name: ing.name,
    brandIds: resolveStoreIngredientBrandIds(ing, allBrandIds),
    productParts: ing.productParts?.length ? [...ing.productParts] : ['pizzas', 'hamburguesas'],
    chargeExtra: ingredientChargesExtra(ing),
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
  return {
    id: existingId || `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    role: draft.chargeExtra ? 'extra' : 'base',
    escandalloOnly: false,
    ...(brandIds.length > 0 ? { brandIds: [...brandIds] } : {}),
    productParts: [...draft.productParts],
  };
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
          ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-950/20'
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
            Cobrar extra
          </label>
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
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
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

function CatalogKpi({
  icon,
  value,
  label,
  tone,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  tone: 'blue' | 'amber' | 'slate' | 'green';
}) {
  const tones = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-950/30 dark:border-slate-800',
    green: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-800',
  };
  const iconTones = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    slate: 'text-slate-600',
    green: 'text-green-600',
  };
  return (
    <div className={`p-4 border-2 rounded-xl ${tones[tone]}`}>
      <div className={`mb-2 ${iconTones[tone]}`}>{icon}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function IngredientCatalogTable({
  rows,
  onToggleExtra,
}: {
  rows: StoreIngredient[];
  onToggleExtra: (id: string, asExtra: boolean) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
              Ingrediente
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
              En el TPV
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
              Cambiar
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((ing) => {
            const isExtra = ingredientChargesExtra(ing);
            const label = String(ing.name || '').trim() || '(sin nombre)';
            return (
              <tr key={ing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isExtra
                          ? 'bg-amber-100 dark:bg-amber-950/50'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      {isExtra ? (
                        <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Minus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      )}
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug">
                      {label}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      isExtra
                        ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
                        : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800'
                    }`}
                  >
                    {isExtra ? 'Extra de pago' : 'Solo quitar'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onToggleExtra(ing.id, !isExtra)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {isExtra ? 'Quitar cobro' : 'Marcar extra'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IngredientCatalogSections({
  items,
  search,
  listFilter,
  sectionsOpen,
  onToggleSection,
  onToggleExtra,
  onClearSearch,
  onClearFilter,
  brandLabel,
}: {
  items: StoreIngredient[];
  search: string;
  listFilter: ListFilter;
  sectionsOpen: Set<string>;
  onToggleSection: (key: string) => void;
  onToggleExtra: (id: string, asExtra: boolean) => void;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  brandLabel?: string;
}) {
  const q = search.trim();
  const filtered = useMemo(
    () => filterVisibleItems(items, search, listFilter),
    [items, search, listFilter],
  );
  const extraRows = filtered.filter((i) => ingredientChargesExtra(i));
  const baseRows = filtered.filter((i) => !ingredientChargesExtra(i));

  const sections = [
    { key: 'extra', title: 'Extras de pago', rows: extraRows, tone: 'amber' as const },
    { key: 'base', title: 'Incluidos (solo quitar)', rows: baseRows, tone: 'blue' as const },
  ];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <Package className="w-12 h-12 text-gray-300 mb-3" />
        <p className="font-semibold">
          {brandLabel ? `Sin ingredientes en ${brandLabel}` : 'No hay ingredientes todavía'}
        </p>
        <p className="text-sm mt-1 text-center max-w-sm px-4">
          Importa el catálogo con columna ingredientes en Excel o usa «Añadir lista» arriba.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-12 text-center space-y-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Ningún resultado
          {q ? ` para «${q}»` : listFilter !== 'all' ? ' con este filtro' : ''}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {q && (
            <button
              type="button"
              onClick={onClearSearch}
              className="px-4 py-2 rounded-xl text-sm font-semibold border-2 border-gray-200 dark:border-gray-700"
            >
              Limpiar búsqueda
            </button>
          )}
          {listFilter !== 'all' && (
            <button
              type="button"
              onClick={onClearFilter}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
            >
              Ver todos ({items.length})
            </button>
          )}
        </div>
      </div>
    );
  }

  const visibleSections = sections.filter(
    (s) => listFilter === 'all' || (listFilter === 'extra' && s.key === 'extra') || (listFilter === 'base' && s.key === 'base'),
  );

  return (
    <div className="space-y-3">
      {visibleSections.map((section) => {
        if (section.rows.length === 0) return null;
        const isCollapsed = !sectionsOpen.has(section.key);
        return (
          <div
            key={section.key}
            className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onToggleSection(section.key)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isCollapsed ? (
                  <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
                )}
                <span className="font-semibold text-gray-900 dark:text-gray-100">{section.title}</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                  {section.rows.length} ingrediente{section.rows.length !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
            {!isCollapsed && <IngredientCatalogTable rows={section.rows} onToggleExtra={onToggleExtra} />}
          </div>
        );
      })}
    </div>
  );
}

function BrandTabs({
  brands,
  selectedBrandId,
  onSelect,
  items,
  allBrandIds,
}: {
  brands: Brand[];
  selectedBrandId: string;
  onSelect: (id: string) => void;
  items: StoreIngredient[];
  allBrandIds: string[];
}) {
  if (brands.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {brands.map((brand) => {
        const active = brand._id === selectedBrandId;
        const count = countStoreIngredientsByBrand(items, brand._id, allBrandIds);
        const tint = brandTint(brand.primaryColor || '#6366f1', active ? '22' : '12');
        return (
          <button
            key={brand._id}
            type="button"
            onClick={() => onSelect(brand._id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border-2 transition-all touch-manipulation ${
              active
                ? 'border-gray-900 dark:border-gray-100 shadow-sm'
                : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700'
            }`}
            style={{ backgroundColor: tint }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: brand.primaryColor || '#6366f1' }}
            />
            <span className="text-gray-900 dark:text-gray-100">{brand.name}</span>
            <span className="text-xs font-semibold tabular-nums opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function filterVisibleItems(items: StoreIngredient[], search: string, listFilter: ListFilter): StoreIngredient[] {
  const q = search.trim().toLowerCase();
  let list = items;
  if (listFilter === 'extra') list = list.filter((i) => ingredientChargesExtra(i));
  if (listFilter === 'base') list = list.filter((i) => !ingredientChargesExtra(i));
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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newDraft, setNewDraft] = useState<IngredientDraft>(() => emptyDraft([], false));
  const [defaultExtraPrice, setDefaultExtraPrice] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [dirty, setDirty] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [sectionsOpen, setSectionsOpen] = useState<Set<string>>(() => new Set(['extra', 'base']));
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  const toggleSection = (key: string) => {
    setSectionsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
  const hasExtras = useMemo(() => items.some((i) => ingredientChargesExtra(i)), [items]);
  const extraItems = useMemo(() => brandScopedItems.filter((i) => ingredientChargesExtra(i)), [brandScopedItems]);
  const baseItems = useMemo(() => brandScopedItems.filter((i) => !ingredientChargesExtra(i)), [brandScopedItems]);

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
      const lineBrands = sortBrandsForDisplay(
        businessId ? commercialLineBrands(await listBrandsRequest(businessId).catch(() => [])) : [],
      );
      const brandIds = lineBrands.map((b) => b._id);
      const merged = unifyStoreIngredientsFromConfig(cfg, brandIds);
      const split = explodeStoreIngredientsPerBrand(merged, lineBrands);
      const unified = toTpvPanelItems(split);
      const needsPersistSplit =
        lineBrands.length > 1 && storeIngredientsNeedPerBrandSplit(merged, brandIds);

      setConfigDocId(cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`);
      setConfigRev(cfg._rev);
      setBrands(lineBrands);
      setItems(unified);

      if (needsPersistSplit && unified.length > 0) {
        try {
          const saved = await updateDeliveryConfigRequest(userId, {
            _id: cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`,
            _rev: cfg._rev,
            storeIngredients: normalizeStoreIngredients(unified),
          } as Parameters<typeof updateDeliveryConfigRequest>[1]);
          setConfigDocId(saved._id || cfg._id);
          setConfigRev(saved._rev);
          notifyDeliveryConfigChanged();
          toast.success('Ingredientes separados por marca (modomio / blackburger…)', { duration: 5000 });
        } catch {
          setDirty(true);
          toast.message('Revisa y guarda: hay ingredientes compartidos entre marcas', { duration: 6000 });
        }
      } else {
        setDirty(false);
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
    const row = draftToItem(draft, allBrandIds);
    if (!row) return;
    setItems((prev) => [...prev, row]);
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

    setItems((prev) => {
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
          if (!ingredientChargesExtra(next[idx])) {
            promoted += 1;
            next[idx] = { ...next[idx], role: 'extra' as const, escandalloOnly: false };
          } else {
            skipped += 1;
          }
          continue;
        }
        added += 1;
        seq += 1;
        next.push({
          id: `ing-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 9)}`,
          name,
          role: 'extra',
          escandalloOnly: false,
          ...(targetBrandIds.length > 0 ? { brandIds: [...targetBrandIds] } : {}),
          productParts: [...targetParts],
        });
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
    setItems((prev) =>
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
        return {
          ...i,
          name,
          role: draft.chargeExtra ? 'extra' : 'base',
          escandalloOnly: false,
          brandIds: [...brandIds],
          productParts: [...productParts],
        };
      }),
    );
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDirty(true);
  };

  const toggleItemExtra = (id: string, asExtra: boolean) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, role: asExtra ? 'extra' : 'base', escandalloOnly: false } : i)),
    );
    setDirty(true);
  };

  const toggleManyExtra = (ids: string[], asExtra: boolean) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setItems((prev) =>
      prev.map((i) =>
        idSet.has(i.id) ? { ...i, role: asExtra ? 'extra' : 'base', escandalloOnly: false } : i,
      ),
    );
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
      setItems(unified);
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(unified, saved.tpvDefaultExtraPrice) || ''));
      setDirty(false);
      notifyDeliveryConfigChanged();
      const savedExtras = unified.filter((i) => ingredientChargesExtra(i)).length;
      const savedBase = unified.length - savedExtras;
      if (savedExtras === 0) {
        toast.warning('Guardado, pero ningún extra de pago marcado. Usa «Marcar extra» en la tabla.', {
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
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
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
  const filteredVisible = filterVisibleItems(brandScopedItems, search, listFilter).length;
  const canSave = !saving && priceOk;
  const priceDisplay = defaultExtraPrice.trim() || '—';

  const markAllBrandAsExtra = () => {
    toggleManyExtra(brandScopedItems.map((i) => i.id), true);
  };

  const markVisibleAsExtra = () => {
    toggleManyExtra(filterVisibleItems(brandScopedItems, search, listFilter).map((i) => i.id), true);
  };

  const markVisibleAsBase = () => {
    toggleManyExtra(filterVisibleItems(brandScopedItems, search, listFilter).map((i) => i.id), false);
  };

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ingredientes TPV</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
          {multiBrand
            ? 'Cada línea comercial tiene su lista. Al importar Excel con columna ingredientes entran ya como extras de pago por marca.'
            : 'Al importar Excel con columna ingredientes entran ya como extras de pago. Ajusta el precio del extra y guarda si cambias algo.'}
        </p>
      </div>

      {multiBrand ? (
        <BrandTabs
          brands={brands}
          selectedBrandId={activeBrandId}
          onSelect={(id) => {
            setSelectedBrandId(id);
            setSearch('');
            setListFilter('all');
            setNewDraft(emptyDraft([id], false));
          }}
          items={items}
          allBrandIds={allBrandIds}
        />
      ) : null}

      {/* Barra de estado + guardar */}
      <div
        className={`rounded-xl border-2 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
          dirty
            ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700'
            : 'border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 dark:border-emerald-800'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {dirty ? (
            <>
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-950 dark:text-amber-100">Cambios sin guardar</p>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
                  Los cambios <strong>no llegan al TPV</strong> hasta pulsar «Guardar en el TPV».
                  {hasExtras && !priceOk ? ' Indica el precio del extra abajo.' : ''}
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Sincronizado con el TPV</p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-0.5">
                  {extraItems.length > 0
                    ? `${extraItems.length} extra(s) de pago · ${baseItems.length} incluidos`
                    : `${brandScopedItems.length} ingrediente(s) listos para quitar en venta`}
                </p>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className={`shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
            dirty
              ? 'bg-gray-900 hover:bg-gray-800 text-white dark:bg-amber-500 dark:hover:bg-amber-600'
              : 'border-2 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-900 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando…' : dirty ? 'Guardar en el TPV' : 'Todo guardado'}
        </button>
      </div>

      {/* KPIs estilo catálogo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CatalogKpi
          icon={<Package className="w-5 h-5" />}
          value={brandScopedItems.length}
          label={multiBrand && activeBrand ? `Total · ${activeBrand.name}` : 'Total ingredientes'}
          tone="blue"
        />
        <CatalogKpi
          icon={<Sparkles className="w-5 h-5" />}
          value={extraItems.length}
          label="Extras de pago"
          tone="amber"
        />
        <CatalogKpi
          icon={<Minus className="w-5 h-5" />}
          value={baseItems.length}
          label="Solo quitar"
          tone="slate"
        />
        <CatalogKpi
          icon={<Euro className="w-5 h-5" />}
          value={hasExtras ? `${priceDisplay} €` : '—'}
          label="Precio del extra"
          tone="green"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
        <div className="relative w-full lg:w-auto lg:min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ingrediente…"
            className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 outline-none bg-white dark:bg-gray-800 w-full"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full lg:w-auto">
          <div className="flex p-1 rounded-xl bg-gray-100 dark:bg-gray-800">
            {([
              { id: 'all' as const, label: 'Todos', count: brandScopedItems.length },
              { id: 'extra' as const, label: 'Extras', count: extraItems.length },
              { id: 'base' as const, label: 'Quitar', count: baseItems.length },
            ]).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setListFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  listFilter === id
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {label} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Precio extra"
              value={defaultExtraPrice}
              onChange={(e) => {
                setDefaultExtraPrice(e.target.value);
                setDirty(true);
              }}
              className="w-28 pl-8 pr-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold bg-white dark:bg-gray-800 focus:border-amber-400 outline-none"
              title="Precio por defecto de los extras en el TPV"
            />
          </div>
          <button
            type="button"
            onClick={markAllBrandAsExtra}
            disabled={brandScopedItems.length === 0}
            className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-amber-300 text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-700"
          >
            Todos extras de pago
          </button>
          <button
            type="button"
            onClick={markVisibleAsExtra}
            disabled={filteredVisible === 0}
            className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800"
          >
            Marcar visibles
          </button>
          <button
            type="button"
            onClick={markVisibleAsBase}
            disabled={filteredVisible === 0}
            className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600"
          >
            Solo quitar
          </button>
          <button
            type="button"
            onClick={() => setShowBulkPanel((v) => !v)}
            className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1.5"
          >
            <ListPlus className="w-4 h-4" />
            Añadir lista
          </button>
        </div>
      </div>

      {showBulkPanel && (
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Añadir ingredientes{multiBrand && activeBrand ? ` · ${activeBrand.name}` : ''}
            </p>
            <button
              type="button"
              onClick={() => setShowBulkPanel(false)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              Cerrar
            </button>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={4}
            placeholder={'Mozzarella\nTomate\nBacon\nExtra queso'}
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-900 resize-none focus:border-emerald-400 outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                importBulk();
                setShowBulkPanel(false);
              }}
              disabled={!bulkText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl disabled:opacity-40 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
            >
              <Plus className="w-4 h-4" />
              Añadir a la lista
            </button>
            <p className="text-xs text-gray-500">Uno por línea o separados por coma.</p>
          </div>
        </div>
      )}

      {/* Tabla por secciones — como el catálogo */}
      <IngredientCatalogSections
        items={brandScopedItems}
        search={search}
        listFilter={listFilter}
        sectionsOpen={sectionsOpen}
        onToggleSection={toggleSection}
        onToggleExtra={toggleItemExtra}
        onClearSearch={() => setSearch('')}
        onClearFilter={() => setListFilter('all')}
        brandLabel={multiBrand ? activeBrand?.name : undefined}
      />

      {/* Edición avanzada */}
      <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <span className="inline-flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Edición avanzada{multiBrand && activeBrand ? ` · ${activeBrand.name}` : ''}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>
        {showAdvanced && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
            <IngredientRow
              brands={multiBrand && activeBrand ? [activeBrand] : brands}
              draft={
                multiBrand && activeBrandId
                  ? { ...newDraft, brandIds: [activeBrandId] }
                  : newDraft
              }
              onChange={setNewDraft}
              isNew
              onAdd={() =>
                addItem(
                  multiBrand && activeBrandId
                    ? { ...newDraft, brandIds: [activeBrandId] }
                    : newDraft,
                )
              }
            />
            {brandScopedItems.map((ing) => (
              <IngredientRow
                key={ing.id}
                brands={multiBrand && activeBrand ? [activeBrand] : brands}
                draft={itemToDraft(ing, allBrandIds)}
                onChange={(draft) => updateItem(ing.id, draft)}
                onRemove={() => removeItem(ing.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Guardar fijo en móvil */}
      {dirty && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-gray-900 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void save()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar en el TPV
          </button>
        </div>
      )}
    </div>
  );
}
