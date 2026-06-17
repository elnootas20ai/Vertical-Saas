import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  ClipboardPaste,
  Search,
  Euro,
} from 'lucide-react';
import {
  emptyTpvCategoryTemplates,
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  mergeStoreIngredientNames,
  normalizeStoreIngredients,
  normalizeTpvCategoryTemplates,
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

function toTpvPanelItems(list: StoreIngredient[]): StoreIngredient[] {
  return list
    .filter((ing) => resolveIngredientRole(ing) !== 'escandallo')
    .map((ing) => {
      const { extraPrices: _legacyPrices, extraPrice: _legacyPrice, ...rest } = ing;
      return {
        ...rest,
        role: ingredientChargesExtra(ing) ? 'extra' : 'base',
        escandalloOnly: false,
      };
    });
}

type IngredientDraft = {
  name: string;
  brandIds: string[];
  productParts: TpvCategoryTemplateKey[];
  chargeExtra: boolean;
};

function emptyDraft(allBrandIds: string[]): IngredientDraft {
  return {
    name: '',
    brandIds: [...allBrandIds],
    productParts: ['pizzas', 'hamburguesas'],
    chargeExtra: true,
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

function draftToItem(draft: IngredientDraft, existingId?: string): StoreIngredient | null {
  const name = draft.name.trim();
  if (!name || draft.brandIds.length === 0 || draft.productParts.length === 0) return null;
  return {
    id: existingId || `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    role: draft.chargeExtra ? 'extra' : 'base',
    escandalloOnly: false,
    brandIds: [...draft.brandIds],
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
}: {
  draft: IngredientDraft;
  brands: Brand[];
  onChange: (next: IngredientDraft) => void;
  onRemove?: () => void;
  isNew?: boolean;
  onAdd?: () => void;
}) {
  const showBrands = brands.length > 1;
  const brandSet = new Set(draft.brandIds);
  const partSet = new Set(draft.productParts);

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${
        isNew
          ? 'border-indigo-300 bg-indigo-50/30 dark:border-indigo-800'
          : draft.chargeExtra
            ? 'border-amber-200 bg-amber-50/20 dark:border-amber-900/40'
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
          placeholder="Ej: Mozzarella, Extra queso…"
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
          Extra de pago
        </label>
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
      {!draft.chargeExtra && (
        <p className="text-xs text-gray-500 pl-1">Incluido en el plato — el cliente puede quitarlo</p>
      )}
    </div>
  );
}

export function StoreIngredientsPanel({ userId, businessId }: { userId: string; businessId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configDocId, setConfigDocId] = useState<string | undefined>();
  const [configRev, setConfigRev] = useState<string | undefined>();
  const [items, setItems] = useState<StoreIngredient[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newDraft, setNewDraft] = useState<IngredientDraft>(() => emptyDraft([]));
  const [defaultExtraPrice, setDefaultExtraPrice] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);

  const allBrandIds = useMemo(() => brands.map((b) => b._id), [brands]);
  const hasExtras = useMemo(() => items.some((i) => ingredientChargesExtra(i)), [items]);

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
      setDefaultExtraPrice(
        String(inferTpvDefaultExtraPrice(unified, cfg.tpvDefaultExtraPrice) || ''),
      );
      setNewDraft(emptyDraft(brandIds));
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const validateDraft = (draft: IngredientDraft): string | null => {
    if (!draft.name.trim()) return 'Escribe el nombre';
    if (draft.brandIds.length === 0) return 'Elige al menos una marca';
    if (draft.productParts.length === 0) return 'Elige pizzas o hamburguesas';
    return null;
  };

  const validateSave = (): string | null => {
    if (!hasExtras) return null;
    const price = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
    if (price == null) return 'Pon el precio de los extras (uno para todos)';
    return null;
  };

  const addItem = () => {
    const err = validateDraft(newDraft);
    if (err) {
      toast.error(err);
      return;
    }
    const row = draftToItem(newDraft);
    if (!row) return;
    setItems((prev) => [...prev, row]);
    setNewDraft(emptyDraft(allBrandIds));
    setDirty(true);
  };

  const importBulk = () => {
    const names = bulkText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const next = toTpvPanelItems(
      mergeStoreIngredientNames(items, names, {
        role: 'extra',
        brandIds: allBrandIds,
        productParts: ['pizzas', 'hamburguesas'],
      }),
    );
    setItems(next);
    setBulkText('');
    setDirty(true);
    toast.success('Añadidos como extras de pago');
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

  const save = async () => {
    const rows = items.filter((i) => String(i.name || '').trim());
    if (rows.length === 0) {
      toast.error('Añade al menos un ingrediente a la lista antes de guardar');
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
        tpvBrandSupplements: {},
        tpvBrandIngredients: {},
        tpvCategoryTemplates: normalizeTpvCategoryTemplates(emptyTpvCategoryTemplates()),
      } as Parameters<typeof updateDeliveryConfigRequest>[1]);
      setConfigDocId(saved._id || configDocId);
      setConfigRev(saved._rev);
      const unified = toTpvPanelItems(unifyStoreIngredientsFromConfig(saved, allBrandIds));
      setItems(unified);
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(unified, saved.tpvDefaultExtraPrice) || ''));
      setDirty(false);
      notifyDeliveryConfigChanged();
      toast.success(`Guardado · ${unified.length} ingrediente(s) para el TPV`);
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
        <button type="button" onClick={() => void load()} className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ingredientes TPV</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-lg">
            Lo que ve el cliente al personalizar: quitar ingredientes o pedir extras. Un solo precio para todos los
            extras.
          </p>
          {dirty && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mt-2">
              Tienes cambios sin guardar
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3 space-y-3">
        <label className="flex flex-wrap items-center gap-3 text-sm font-medium text-gray-800 dark:text-gray-200">
          <span>Precio de todos los extras</span>
          <div className="relative">
            <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.90"
              value={defaultExtraPrice}
              onChange={(e) => {
                setDefaultExtraPrice(e.target.value);
                setDirty(true);
              }}
              className="w-28 pl-8 pr-2 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800"
            />
          </div>
          <span className="text-xs font-normal text-gray-500">Mismo precio para extra queso, bacon, etc.</span>
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Guardar precio y lista
        </button>
      </div>

      <IngredientRow brands={brands} draft={newDraft} onChange={setNewDraft} isNew onAdd={addItem} />

      <div className="flex gap-2">
        <input
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder="Pegar varios: Tomate, Mozzarella, Jamón…"
          className="flex-1 px-3 py-2 border border-dashed rounded-xl text-sm"
        />
        <button type="button" onClick={importBulk} disabled={!bulkText.trim()} className="px-3 py-2 border rounded-xl disabled:opacity-40">
          <ClipboardPaste className="w-4 h-4" />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-center text-gray-500 py-8 border border-dashed rounded-xl">
          Añade ingredientes para que salgan al personalizar en el TPV.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((ing) => (
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
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 hidden sm:block">
            {dirty ? 'Cambios pendientes' : 'Todo guardado'}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="ml-auto inline-flex items-center justify-center gap-2 min-w-[200px] px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
