import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  Euro,
  ChevronDown,
  Minus,
  Sparkles,
  ListPlus,
  Settings2,
  Save,
  AlertCircle,
} from 'lucide-react';
import {
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  normalizeStoreIngredients,
  normalizeTpvDefaultExtraPrice,
  resolveIngredientRole,
  resolveStoreIngredientBrandIds,
  unifyStoreIngredientsFromConfig,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { getDeliveryConfigRequest, updateDeliveryConfigRequest } from '../../lib/deliveryApi';
import { notifyDeliveryConfigChanged } from '../../lib/deliverySetup';
import { normalizeTenantUserId } from '../../lib/tenantUserId';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { sortBrandsForDisplay } from '../../lib/brandUtils';

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

function SavePanel({
  dirty,
  saving,
  hasExtras,
  priceOk,
  extraCount,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  hasExtras: boolean;
  priceOk: boolean;
  extraCount: number;
  onSave: () => void;
}) {
  const canSave = !saving && (!hasExtras || priceOk);

  return (
    <div
      className={`rounded-2xl border-2 p-4 space-y-3 ${
        dirty
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600 shadow-md shadow-amber-100/50 dark:shadow-none'
          : 'border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800'
      }`}
    >
      {dirty ? (
        <>
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-950 dark:text-amber-100">Cambios sin guardar</p>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-1 leading-relaxed">
                Lo que hagas aquí <strong>no llega al TPV</strong> hasta que pulses guardar.
              </p>
            </div>
          </div>
          {hasExtras && !priceOk && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 pl-7">
              Pon el precio del extra antes de guardar.
            </p>
          )}
        </>
      ) : (
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Guardado en el TPV</p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-1">
              {extraCount > 0
                ? `${extraCount} extra(s) activos en el TPV tablet.`
                : 'Sin extras de pago marcados todavía.'}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={onSave}
        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold touch-manipulation transition-all ${
          dirty
            ? 'bg-gray-900 hover:bg-gray-800 text-white shadow-lg dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-white'
            : 'bg-white dark:bg-gray-900 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
        } disabled:opacity-50`}
      >
        {saving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Save className="w-5 h-5" />
        )}
        {saving ? 'Guardando…' : dirty ? 'Guardar en el TPV' : 'Todo guardado'}
      </button>

      <ol className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1 pl-4 list-decimal leading-relaxed">
        <li>Marca ingredientes (extra o solo quitar)</li>
        <li>Pulsa <strong className="text-gray-700 dark:text-gray-300">Guardar en el TPV</strong></li>
      </ol>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'amber' | 'slate';
}) {
  const tones = {
    neutral: 'border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50',
    amber: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/30',
    slate: 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-black text-gray-900 dark:text-gray-100 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function IngredientTileGrid({
  items,
  search,
  listFilter,
  onToggleExtra,
  onClearSearch,
  onClearFilter,
}: {
  items: StoreIngredient[];
  search: string;
  listFilter: ListFilter;
  onToggleExtra: (id: string, asExtra: boolean) => void;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
}) {
  const filtered = useMemo(
    () => filterVisibleItems(items, search, listFilter),
    [items, search, listFilter],
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/20 px-8 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <ListPlus className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-base font-bold text-gray-800 dark:text-gray-200">Empieza añadiendo ingredientes</p>
        <p className="text-sm text-gray-500 mt-2 max-w-xs">
          Pega una lista a la izquierda o usa las opciones avanzadas.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-6 py-12 text-center space-y-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Ningún resultado
          {search.trim() ? ` para «${search.trim()}»` : listFilter !== 'all' ? ' con este filtro' : ''}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {q && (
            <button
              type="button"
              onClick={onClearSearch}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            >
              Limpiar búsqueda
            </button>
          )}
          {listFilter !== 'all' && (
            <button
              type="button"
              onClick={onClearFilter}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
            >
              Ver todos ({items.length})
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[min(62vh,640px)] overflow-y-auto pr-1">
      {filtered.map((ing, index) => {
        const isExtra = ingredientChargesExtra(ing);
        const label = String(ing.name || '').trim() || '(sin nombre)';
        return (
          <button
            key={`${ing.id}-${index}`}
            type="button"
            onClick={() => onToggleExtra(ing.id, !isExtra)}
            className={`group relative flex flex-col items-start justify-between min-h-[88px] p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98] touch-manipulation ${
              isExtra
                ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100/80 dark:from-amber-950/50 dark:to-amber-900/30 shadow-sm hover:border-amber-500'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
            }`}
          >
            <span
              className={`absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-lg ${
                isExtra
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 group-hover:text-gray-600'
              }`}
            >
              {isExtra ? <Sparkles className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </span>
            <span
              className={`text-sm font-bold leading-snug pr-8 line-clamp-3 ${
                isExtra ? 'text-amber-950 dark:text-amber-50' : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {label}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide mt-2 ${
                isExtra ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400'
              }`}
            >
              {isExtra ? 'Extra de pago' : 'Solo quitar'}
            </span>
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

  const allBrandIds = useMemo(() => brands.map((b) => b._id), [brands]);
  const hasExtras = useMemo(() => items.some((i) => ingredientChargesExtra(i)), [items]);
  const extraItems = useMemo(() => items.filter((i) => ingredientChargesExtra(i)), [items]);
  const baseItems = useMemo(() => items.filter((i) => !ingredientChargesExtra(i)), [items]);

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
      const unified = toTpvPanelItems(unifyStoreIngredientsFromConfig(cfg, brandIds));
      setConfigDocId(cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`);
      setConfigRev(cfg._rev);
      setBrands(lineBrands);
      setItems(unified);
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(unified, cfg.tpvDefaultExtraPrice) || ''));
      setNewDraft(emptyDraft(brandIds, false));
      setDirty(false);
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
    if (allBrandIds.length > 0 && draft.brandIds.length === 0) return 'Elige al menos una marca';
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
    const names = bulkText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;

    let added = 0;
    let promoted = 0;
    let skipped = 0;

    setItems((prev) => {
      const next = [...prev];
      let seq = 0;
      for (const rawName of names) {
        const name = rawName.trim();
        if (!name) continue;
        const key = ingredientNameFold(name);
        const idx = next.findIndex((i) => ingredientNameFold(i.name) === key);
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
          ...(allBrandIds.length > 0 ? { brandIds: [...allBrandIds] } : {}),
          productParts: ['pizzas', 'hamburguesas'],
        });
      }
      return toTpvPanelItems(next);
    });

    setBulkText('');
    setSearch('');
    setListFilter('all');
    setDirty(true);

    if (added > 0 || promoted > 0) {
      toast.success(
        added > 0 && promoted > 0
          ? `${added} añadido(s) · ${promoted} marcado(s) como extra`
          : added > 0
            ? `${added} ingrediente(s) añadido(s)`
            : `${promoted} marcado(s) como extra`,
      );
    } else if (skipped > 0) {
      toast.info('Esos ingredientes ya estaban en la lista');
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
      const unified = toTpvPanelItems(unifyStoreIngredientsFromConfig(saved, allBrandIds));
      setItems(unified);
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(unified, saved.tpvDefaultExtraPrice) || ''));
      setDirty(false);
      notifyDeliveryConfigChanged();
      const savedExtras = unified.filter((i) => ingredientChargesExtra(i)).length;
      const savedBase = unified.length - savedExtras;
      if (savedExtras === 0) {
        toast.warning('Guardado, pero ningún extra de pago marcado. Toca las tarjetas ámbar.', {
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
  const filteredVisible = filterVisibleItems(items, search, listFilter).length;

  const markVisibleAsExtra = () => {
    toggleManyExtra(filterVisibleItems(items, search, listFilter).map((i) => i.id), true);
  };

  const markVisibleAsBase = () => {
    toggleManyExtra(filterVisibleItems(items, search, listFilter).map((i) => i.id), false);
  };

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ingredientes TPV</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
          Lista maestra del negocio. Si importas el catálogo con la columna <strong>ingredientes</strong> en Excel,
          los nombres se rellenan solos aquí. En cada producto van los que lleva esa receta; aquí marcas cuáles son{' '}
          <strong>extras de pago</strong> (naranja) y el precio del suplemento.
        </p>
      </div>

      {/* Stats — solo móvil/tablet arriba; en desktop van en sidebar */}
      <div className="grid grid-cols-2 lg:hidden gap-3">
        <StatCard label="Total" value={items.length} />
        <StatCard label="Extras" value={extraItems.length} tone="amber" />
      </div>

      {/* Layout principal */}
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        {/* Panel izquierdo — fijo al hacer scroll */}
        <aside className="lg:sticky lg:top-4 lg:z-20 lg:self-start space-y-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <SavePanel
            dirty={dirty}
            saving={saving}
            hasExtras={hasExtras}
            priceOk={priceOk}
            extraCount={extraItems.length}
            onSave={() => void save()}
          />

          <div className="hidden lg:grid grid-cols-2 gap-2">
            <StatCard label="Total" value={items.length} />
            <StatCard label="Extras" value={extraItems.length} tone="amber" />
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Precio del extra</label>
              <div className="relative mt-2">
                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,90"
                  value={defaultExtraPrice}
                  onChange={(e) => {
                    setDefaultExtraPrice(e.target.value);
                    setDirty(true);
                  }}
                  className="w-full pl-9 pr-3 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold bg-gray-50 dark:bg-gray-800 focus:border-amber-400 outline-none"
                />
              </div>
              {hasExtras && !priceOk && (
                <p className="text-xs text-amber-600 mt-2 font-medium">Necesitas poner precio si hay extras</p>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Añadir lista</label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                placeholder={'Mozzarella\nTomate\nBacon\nExtra queso\nPiña'}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-800 resize-none focus:border-emerald-400 outline-none leading-relaxed"
              />
              <button
                type="button"
                onClick={importBulk}
                disabled={!bulkText.trim()}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl disabled:opacity-40 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold touch-manipulation"
              >
                <Plus className="w-4 h-4" />
                Añadir a la lista
              </button>
              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                Uno por línea o separados por coma.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-xs text-gray-500 leading-relaxed">
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Cómo funciona</p>
            <p>
              <span className="text-amber-600 font-semibold">Extra de pago</span> → pestaña Extras en el TPV.
              {' '}
              <span className="text-gray-600 font-semibold">Solo quitar</span> → ingrediente incluido en el plato.
            </p>
          </div>
        </aside>

        {/* Panel derecho — grid principal */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden min-w-0">
          <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Ingredientes</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {filteredVisible} visibles · toca una tarjeta para cambiar el tipo
                </p>
              </div>
              <div className="flex p-1 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0">
                {([
                  { id: 'all' as const, label: 'Todos', count: items.length },
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
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-800 focus:border-gray-400 outline-none"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={markVisibleAsExtra}
                  disabled={filteredVisible === 0}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800"
                >
                  + Extra
                </button>
                <button
                  type="button"
                  onClick={markVisibleAsBase}
                  disabled={filteredVisible === 0}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600"
                >
                  Solo quitar
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            <IngredientTileGrid
              items={items}
              search={search}
              listFilter={listFilter}
              onToggleExtra={toggleItemExtra}
              onClearSearch={() => setSearch('')}
              onClearFilter={() => setListFilter('all')}
            />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/40"
            >
              <span className="inline-flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Edición avanzada
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            {showAdvanced && (
              <div className="px-5 pb-5 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
                <IngredientRow
                  brands={brands}
                  draft={newDraft}
                  onChange={setNewDraft}
                  isNew
                  onAdd={() => addItem(newDraft)}
                />
                {items.map((ing) => (
                  <IngredientRow
                    key={ing.id}
                    brands={brands}
                    draft={itemToDraft(ing, allBrandIds)}
                    onChange={(draft) => updateItem(ing.id, draft)}
                    onRemove={() => removeItem(ing.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Guardar fijo en móvil cuando hay cambios */}
      {dirty && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-gray-900 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-2 text-center">
            Cambios sin guardar — no llegan al TPV hasta que guardes
          </p>
          <button
            type="button"
            disabled={saving || (hasExtras && !priceOk)}
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
