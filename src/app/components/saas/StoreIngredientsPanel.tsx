import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  ClipboardPaste,
  Search,
  Euro,
  Zap,
  List,
} from 'lucide-react';
import {
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  mergeStoreIngredientNames,
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
          ? 'border-indigo-300 bg-indigo-50/30 dark:border-indigo-800'
          : chargeExtra
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
            Extra de pago
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
      {!chargeExtra && (
        <p className="text-xs text-gray-500 pl-1">Incluido en el plato — el cliente puede quitarlo</p>
      )}
      {chargeExtra && (
        <p className="text-xs text-amber-800/80 dark:text-amber-300/80 pl-1">Extra de pago — sale en la pestaña Extras del TPV</p>
      )}
    </div>
  );
}

/** Cabecera de bloque numerado en la página de ingredientes TPV. */
function SectionBlock({
  step,
  title,
  description,
  children,
  tone = 'neutral',
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'neutral' | 'amber' | 'indigo';
}) {
  const toneClasses = {
    neutral: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40',
    amber: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20',
    indigo: 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/20 dark:bg-indigo-950/20',
  };
  const badgeClasses = {
    neutral: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
    amber: 'bg-amber-500 text-white',
    indigo: 'bg-indigo-600 text-white',
  };

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${toneClasses[tone]}`}>
      <div className="flex gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badgeClasses[tone]}`}
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Selección rápida: toca chips para marcar/desmarcar extras de pago. */
function QuickExtrasPicker({
  items,
  search,
  onToggleExtra,
  onToggleMany,
}: {
  items: StoreIngredient[];
  search: string;
  onToggleExtra: (id: string, asExtra: boolean) => void;
  onToggleMany: (ids: string[], asExtra: boolean) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items),
    [items, q],
  );
  const extraCount = useMemo(() => items.filter((i) => ingredientChargesExtra(i)).length, [items]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-center text-gray-500 py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
        Aún no hay ingredientes. Usa el paso 2 para pegar una lista o crear uno manualmente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-500 px-2.5 py-1.5 font-semibold text-white">
          Naranja · extra de pago
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 font-semibold text-gray-600 dark:text-gray-300">
          Gris · incluido (se puede quitar)
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {extraCount} de {items.length} cobran extra
        </span>
        <button
          type="button"
          onClick={() => onToggleMany(filtered.map((i) => i.id), true)}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-400 text-amber-900 bg-white dark:bg-gray-900 hover:bg-amber-100 dark:hover:bg-amber-950/40"
        >
          Marcar visibles como extra
        </button>
        <button
          type="button"
          onClick={() => onToggleMany(filtered.map((i) => i.id), false)}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-300 text-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50"
        >
          Pasar visibles a incluidos
        </button>
      </div>

      <div className="flex flex-wrap gap-2 max-h-[min(50vh,420px)] overflow-y-auto p-1 -m-1">
        {filtered.map((ing) => {
          const isExtra = ingredientChargesExtra(ing);
          return (
            <button
              key={ing.id}
              type="button"
              onClick={() => onToggleExtra(ing.id, !isExtra)}
              className={`inline-flex items-center min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all touch-manipulation ${
                isExtra
                  ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-amber-300'
              }`}
            >
              {ing.name}
              {isExtra && <span className="ml-1.5 text-[10px] opacity-90">+€</span>}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">Ningún ingrediente coincide con la búsqueda.</p>
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
  const [newExtraDraft, setNewExtraDraft] = useState<IngredientDraft>(() => emptyDraft([], true));
  const [newBaseDraft, setNewBaseDraft] = useState<IngredientDraft>(() => emptyDraft([], false));
  const [defaultExtraPrice, setDefaultExtraPrice] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);
  const [extrasView, setExtrasView] = useState<'quick' | 'detail'>('quick');

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
      setDefaultExtraPrice(
        String(inferTpvDefaultExtraPrice(unified, cfg.tpvDefaultExtraPrice) || ''),
      );
      setNewExtraDraft(emptyDraft(brandIds, true));
      setNewBaseDraft(emptyDraft(brandIds, false));
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

  const filteredExtras = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return extraItems;
    return extraItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [extraItems, search]);

  const filteredBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseItems;
    return baseItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [baseItems, search]);

  const validateDraft = (draft: IngredientDraft): string | null => {
    if (!draft.name.trim()) return 'Escribe el nombre';
    if (allBrandIds.length > 0 && draft.brandIds.length === 0) return 'Elige al menos una marca';
    if (draft.productParts.length === 0) return 'Elige pizzas o hamburguesas';
    return null;
  };

  const validateSave = (): string | null => {
    if (!hasExtras) return null;
    const price = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
    if (price == null) return 'Pon el precio de los extras (uno para todos)';
    return null;
  };

  const addItem = (draft: IngredientDraft, reset: (d: IngredientDraft) => void) => {
    const err = validateDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    const row = draftToItem(draft, allBrandIds);
    if (!row) return;
    setItems((prev) => [...prev, row]);
    reset(emptyDraft(allBrandIds, draft.chargeExtra));
    setDirty(true);
  };

  const importBulk = () => {
    const names = bulkText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const folded = names.map((n) => n.toLowerCase());
    setItems((prev) => {
      let promoted = 0;
      const next = prev.map((i) => {
        const match = folded.includes(i.name.trim().toLowerCase());
        if (match && !ingredientChargesExtra(i)) {
          promoted += 1;
          return { ...i, role: 'extra' as const, escandalloOnly: false };
        }
        return i;
      });
      const merged = toTpvPanelItems(
        mergeStoreIngredientNames(next, names, {
          role: 'extra',
          brandIds: allBrandIds,
          productParts: ['pizzas', 'hamburguesas'],
        }),
      );
      const added = merged.length - next.length;
      if (promoted > 0 || added > 0) {
        toast.success(
          added > 0 && promoted > 0
            ? `${promoted} marcado(s) · ${added} nuevo(s)`
            : promoted > 0
              ? `${promoted} marcado(s) como extra`
              : `${added} extra(s) añadido(s)`,
        );
      } else {
        toast.info('Esos extras ya estaban en la lista');
      }
      return merged;
    });
    setBulkText('');
    setDirty(true);
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
        toast.warning(
          `Precio guardado, pero 0 extras de pago. Ve al paso 3, toca ingredientes en naranja y vuelve a guardar.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          `Guardado · ${savedExtras} extra(s) de pago · ${savedBase} incluido(s) para quitar`,
        );
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
        <button type="button" onClick={() => void load()} className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-28">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ingredientes TPV</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Define qué puede personalizar el cliente al pedir una pizza o hamburguesa en el TPV.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Pestaña Quitar</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Ingredientes <strong>incluidos</strong> en el plato que el cliente puede quitar sin coste.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pestaña Extras</p>
            <p className="text-sm text-amber-900 dark:text-amber-100 mt-1">
              Ingredientes de <strong>pago</strong> que el cliente puede añadir (todos al mismo precio).
            </p>
          </div>
        </div>

        {dirty && (
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Tienes cambios sin guardar — pulsa Guardar al terminar.
          </p>
        )}
        {extraItems.length === 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Aún no hay extras de pago marcados
            </p>
            <p className="text-sm text-amber-800/90 dark:text-amber-300/90 mt-1">
              Guardar solo el precio <strong>no basta</strong>. En el paso 3 toca los ingredientes en{' '}
              <strong>naranja</strong> y luego guarda.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {extraItems.length} extra(s) de pago listos para el TPV
            </p>
          </div>
        )}
      </header>

      <SectionBlock
        step={1}
        title="Precio de los extras"
        description="Un solo precio para todos los extras de pago (extra queso, bacon, piña…)."
        tone="indigo"
      >
        <label className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,90"
              value={defaultExtraPrice}
              onChange={(e) => {
                setDefaultExtraPrice(e.target.value);
                setDirty(true);
              }}
              className="w-32 pl-8 pr-2 py-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
            />
          </div>
          <span className="text-sm text-gray-500">€ por extra añadido en el TPV</span>
        </label>
        {hasExtras && !normalizeTpvDefaultExtraPrice(defaultExtraPrice) && (
          <p className="text-sm text-amber-700 dark:text-amber-400">Indica el precio antes de guardar.</p>
        )}
      </SectionBlock>

      <SectionBlock
        step={2}
        title="Añadir ingredientes a la lista"
        description="Pega una lista entera o crea ingredientes uno a uno. Después los clasificas en el paso 3."
      >
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Pegar varios de golpe</p>
          <div className="flex gap-2">
            <input
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Ej: Mozzarella, Tomate, Bacon, Extra queso, Piña…"
              className="flex-1 px-3 py-2.5 min-h-[44px] border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-900"
            />
            <button
              type="button"
              onClick={importBulk}
              disabled={!bulkText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-xl disabled:opacity-40 bg-white dark:bg-gray-900 text-sm font-semibold touch-manipulation"
            >
              <ClipboardPaste className="w-4 h-4" />
              Pegar
            </button>
          </div>
          <p className="text-xs text-gray-500">Separados por coma, punto y coma o salto de línea. Si ya existen, se marcan como extra.</p>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Añadir uno manualmente</p>
          <IngredientRow
            brands={brands}
            draft={newBaseDraft}
            onChange={setNewBaseDraft}
            isNew
            onAdd={() => addItem(newBaseDraft, setNewBaseDraft)}
          />
        </div>

        <p className="text-sm text-gray-500">
          {items.length} ingrediente(s) en la lista · {extraItems.length} extra(s) · {baseItems.length} incluido(s)
        </p>
      </SectionBlock>

      <SectionBlock
        step={3}
        title="Elegir qué cobras como extra"
        description="Toca cada ingrediente. Naranja = extra de pago en el TPV. Gris = incluido, solo se puede quitar."
        tone="amber"
      >
        {extraItems.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-100/50 dark:bg-amber-950/40 px-4 py-3">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
              Toca abajo los que cobras extra (se pondrán naranja)
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
              Ejemplo: Extra queso, Bacon, Piña, Champiñones… Luego <strong>Guardar cambios</strong>.
            </p>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en la lista…"
            className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm bg-white dark:bg-gray-900"
          />
        </div>

        <div className="flex rounded-lg border border-amber-300/80 dark:border-amber-800 overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setExtrasView('quick')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${
              extrasView === 'quick'
                ? 'bg-amber-500 text-white'
                : 'bg-white dark:bg-gray-900 text-amber-900 dark:text-amber-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Selección rápida
          </button>
          <button
            type="button"
            onClick={() => setExtrasView('detail')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-l border-amber-300/80 dark:border-amber-800 ${
              extrasView === 'detail'
                ? 'bg-amber-500 text-white'
                : 'bg-white dark:bg-gray-900 text-amber-900 dark:text-amber-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Editar fila a fila
          </button>
        </div>

        {extrasView === 'quick' ? (
          <QuickExtrasPicker
            items={items}
            search={search}
            onToggleExtra={toggleItemExtra}
            onToggleMany={toggleManyExtra}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Para marcas distintas, pizzas/hamburguesas concretas o renombrar ingredientes.
            </p>
            <IngredientRow
              brands={brands}
              draft={newExtraDraft}
              fixedRole="extra"
              onChange={setNewExtraDraft}
              isNew
              onAdd={() => addItem(newExtraDraft, setNewExtraDraft)}
            />
            {filteredExtras.length === 0 ? (
              <p className="text-sm text-center text-gray-500 py-6 border border-dashed border-amber-300/60 rounded-xl">
                Ningún extra de pago todavía. Usa la selección rápida o marca ingredientes en naranja.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Extras de pago ({filteredExtras.length})</p>
                {filteredExtras.map((ing) => (
                  <IngredientRow
                    key={ing.id}
                    brands={brands}
                    draft={itemToDraft(ing, allBrandIds)}
                    fixedRole="extra"
                    onChange={(draft) => updateItem(ing.id, draft)}
                    onRemove={() => removeItem(ing.id)}
                  />
                ))}
              </div>
            )}
            {filteredBase.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-amber-200/60 dark:border-amber-900/40">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                  Incluidos — solo quitar ({filteredBase.length})
                </p>
                {filteredBase.map((ing) => (
                  <IngredientRow
                    key={ing.id}
                    brands={brands}
                    draft={itemToDraft(ing, allBrandIds)}
                    fixedRole="base"
                    onChange={(draft) => updateItem(ing.id, draft)}
                    onRemove={() => removeItem(ing.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </SectionBlock>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-4 py-3 safe-area-bottom">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              {dirty ? 'Cambios pendientes' : 'Todo guardado'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {extraItems.length > 0
                ? `${extraItems.length} extra(s) · precio ${defaultExtraPrice || '—'} €`
                : `Sin extras marcados · precio ${defaultExtraPrice || '—'} €`}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="ml-auto inline-flex items-center justify-center gap-2 min-w-[200px] px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg touch-manipulation"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
