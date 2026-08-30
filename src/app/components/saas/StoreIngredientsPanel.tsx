import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Euro,
  AlertCircle,
  Package,
  Pencil,
  ChevronDown,
  Store,
  Layers,
  X,
  SlidersHorizontal,
  ShoppingBag,
} from 'lucide-react';
import {
  catalogItemsUsingIngredient,
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  mergeDuplicateStoreIngredients,
  normalizeStoreIngredientRecipeLines,
  normalizeStoreIngredients,
  normalizeTpvDefaultExtraPrice,
  readStoreIngredientTpvFlags,
  withStoreIngredientTpvFlags,
  unifyStoreIngredientsFromConfig,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
import { getDeliveryConfigRequest, listCatalogItemsRequest, updateDeliveryConfigRequest, pointOfSaleDisplayLabel, type CatalogItem } from '../../lib/deliveryApi';
import { readProductRecipeLines } from '../../lib/catalogCosting';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { CatalogCoreLoadingState } from './CatalogCoreLoadingState';
import { withVertialDefaultBaseCost } from '../../lib/vertialDefaultCosts';
import { normalizeTenantUserId } from '../../lib/tenantUserId';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import {
  commercialLineBrands,
} from '../../lib/deliveryCatalogImportLogic';
import { sortBrandsForDisplay } from '../../lib/brandUtils';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../context/BusinessContext';
import { normalizeBusinessScopeId, notifyDeliveryCatalogChanged, notifyDeliveryConfigChanged } from '../../lib/deliverySetup';
import { filterPointsOfSaleStrictlyForBusiness } from '../../lib/businessStoreScope';
import { syncInventoryCatalogFromSources } from '../../lib/inventorySync';
import { VERTIAL_BTN_DANGER, VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import {
  SaasTabPrimaryButton,
  SaasTabSecondaryButton,
  SaasTabEmpty,
  SaasTabSearch,
} from './SaasTabWorkspace';
import { CatalogTabShell } from './CatalogTabShell';
import { CreateIngredientRecipeModal } from './CreateIngredientRecipeModal';

type SortMode = 'name-asc' | 'name-desc' | 'extra-first';

/** Filas visibles por grupo antes del «mostrar más»: evita listas infinitas. */
const GROUP_PREVIEW_ROWS = 15;

/** Mismo gesto que Inventario → Añadir: un CTA con menú de 2 acciones. */
function IngredientsNewMenu({
  onAddIngredient,
  onCreateRecipe,
  disabled,
}: {
  onAddIngredient: () => void;
  onCreateRecipe: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const itemClass =
    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  return (
    <div ref={ref} className="relative shrink-0">
      <SaasTabPrimaryButton
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Añadir ingrediente o crear receta"
      >
        <Plus className="h-3.5 w-3.5" />
        Nuevo
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </SaasTabPrimaryButton>
      {open ? (
        <>
          <div className="fixed inset-0 z-[30]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-full z-[40] mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => run(onAddIngredient)}
              className={`${itemClass} bg-blue-50/60 dark:bg-blue-950/30`}
            >
              <Package className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
              Añadir ingrediente
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => run(onCreateRecipe)}
              className={itemClass}
            >
              <Layers className="h-4 w-4 text-gray-500" />
              Crear receta
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

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

/** Interruptor en línea para las tablas — look Vertial (azul avance / stone off). */
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
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
        checked
          ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)]'
          : 'border-stone-300 bg-stone-200 dark:border-stone-600 dark:bg-stone-700'
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
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
        aria-label={`Coste de ${ingredient.name}`}
        className="w-20 px-2 py-1 text-right text-sm tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 outline-none focus:border-[var(--v-blue,#2563eb)]"
      />
      <span className="text-xs text-gray-400">€</span>
    </span>
  );
}

/** Precio que se cobra en TPV al añadir este ingrediente como extra. */
function IngredientExtraPriceCell({
  ingredient,
  fallbackPrice,
  onCommit,
}: {
  ingredient: StoreIngredient;
  fallbackPrice?: number | null;
  onCommit: (value: number) => void;
}) {
  const resolved =
    normalizeTpvDefaultExtraPrice(ingredient.extraPrice) ??
    (fallbackPrice != null && Number.isFinite(fallbackPrice) ? fallbackPrice : null);
  const [draft, setDraft] = useState(resolved != null ? String(resolved) : '');

  useEffect(() => {
    const next =
      normalizeTpvDefaultExtraPrice(ingredient.extraPrice) ??
      (fallbackPrice != null && Number.isFinite(fallbackPrice) ? fallbackPrice : null);
    setDraft(next != null ? String(next) : '');
  }, [ingredient.id, ingredient.extraPrice, fallbackPrice]);

  const commit = () => {
    const raw = draft.trim().replace(',', '.');
    const n = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      const next =
        normalizeTpvDefaultExtraPrice(ingredient.extraPrice) ??
        (fallbackPrice != null && Number.isFinite(fallbackPrice) ? fallbackPrice : null);
      setDraft(next != null ? String(next) : '');
      return;
    }
    const rounded = Math.round(n * 100) / 100;
    setDraft(String(rounded));
    if (rounded !== (normalizeTpvDefaultExtraPrice(ingredient.extraPrice) ?? -1)) onCommit(rounded);
  };

  return (
    <span className="inline-flex items-center gap-1" title="Cuánto se cobra en el TPV al añadirlo">
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
        aria-label={`Precio extra de ${ingredient.name}`}
        className="w-16 px-1.5 py-1 text-right text-xs font-semibold tabular-nums border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 outline-none focus:border-amber-500"
      />
      <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">€</span>
    </span>
  );
}

function isSubrecipeIngredient(ing: StoreIngredient): boolean {
  return normalizeStoreIngredientRecipeLines(ing.recipeLines).length > 0;
}

/** Lista del panel: ingredientes TPV + subrecetas (elaborados con composición). */
function toPanelItems(list: StoreIngredient[]): StoreIngredient[] {
  const mapped = list.map((ing) => {
    const { extraPrices: _legacyPrices, ...rest } = ing;
    if (isSubrecipeIngredient(ing)) {
      return {
        ...rest,
        recipeLines: normalizeStoreIngredientRecipeLines(ing.recipeLines),
      };
    }
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
  chargeExtra: boolean;
  allowRemove: boolean;
  /** Precio TPV si es extra de pago. */
  extraPrice: string;
};

function emptyDraft(chargeExtra: boolean): IngredientDraft {
  return {
    name: '',
    chargeExtra,
    allowRemove: true,
    extraPrice: '',
  };
}

function itemToDraft(ing: StoreIngredient): IngredientDraft {
  const flags = readStoreIngredientTpvFlags(ing);
  const price = normalizeTpvDefaultExtraPrice(ing.extraPrice);
  return {
    name: ing.name,
    chargeExtra: flags.chargeExtra,
    allowRemove: flags.allowRemove,
    extraPrice: price != null ? String(price) : '',
  };
}

/** Ingrediente maestro sin marca: el producto (carta/receta) es quien conecta. */
function draftToItem(draft: IngredientDraft, existingId?: string): StoreIngredient | null {
  const name = draft.name.trim();
  if (!name) return null;
  const extraPrice = draft.chargeExtra
    ? normalizeTpvDefaultExtraPrice(draft.extraPrice)
    : null;
  return withStoreIngredientTpvFlags(
    {
      id: existingId || `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      escandalloOnly: false,
      ...(extraPrice != null ? { extraPrice } : {}),
    },
    { chargeExtra: draft.chargeExtra, allowRemove: draft.allowRemove },
  );
}

function IngredientRow({
  draft,
  onChange,
  onRemove,
  isNew,
  onAdd,
  fixedRole,
  saving,
}: {
  draft: IngredientDraft;
  onChange: (next: IngredientDraft) => void;
  onRemove?: () => void;
  isNew?: boolean;
  onAdd?: () => void;
  fixedRole?: 'extra' | 'base';
  saving?: boolean;
}) {
  const chargeExtra = fixedRole ? fixedRole === 'extra' : draft.chargeExtra;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-3 py-3 ${
        isNew
          ? 'border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20'
          : chargeExtra
            ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/40'
            : 'border-stone-200 bg-white dark:bg-stone-900 dark:border-stone-700'
      }`}
    >
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
          Nombre
        </span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            if (isNew && e.key === 'Enter') {
              e.preventDefault();
              onAdd?.();
            }
          }}
          placeholder="Ej. Mozzarella, bacon…"
          autoFocus={isNew}
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-semibold outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-950"
        />
      </label>

      {!fixedRole ? (
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
              draft.chargeExtra
                ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40'
                : 'border-stone-200 text-stone-600 dark:border-stone-700'
            }`}
          >
            <input
              type="checkbox"
              checked={draft.chargeExtra}
              onChange={(e) => onChange({ ...draft, chargeExtra: e.target.checked })}
            />
            Extra de pago
          </label>
          {draft.chargeExtra ? (
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 dark:border-amber-800 dark:bg-amber-950/30">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                Cuánto
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.extraPrice}
                onChange={(e) => onChange({ ...draft, extraPrice: e.target.value })}
                placeholder="0,00"
                className="w-16 border-0 bg-transparent py-0 text-right text-xs font-bold tabular-nums outline-none"
              />
              <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">€</span>
            </label>
          ) : null}
          <label
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
              draft.allowRemove
                ? 'border-stone-400 bg-stone-50 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                : 'border-stone-200 text-stone-600 dark:border-stone-700'
            }`}
          >
            <input
              type="checkbox"
              checked={draft.allowRemove}
              onChange={(e) => onChange({ ...draft, allowRemove: e.target.checked })}
            />
            Se puede quitar en TPV
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
        {isNew ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={saving || !draft.name.trim()}
            className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-4 py-2 text-xs disabled:opacity-50`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Guardando…' : 'Añadir ingrediente'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

type EditIngredientTab = 'datos' | 'tpv' | 'productos';

const EDIT_INGREDIENT_TABS: Array<{
  id: EditIngredientTab;
  label: string;
  hint: string;
  Icon: typeof Package;
}> = [
  { id: 'datos', label: 'Datos', hint: 'Nombre y coste', Icon: Package },
  { id: 'tpv', label: 'TPV', hint: 'Extra y quitar', Icon: SlidersHorizontal },
  { id: 'productos', label: 'Productos', hint: 'Dónde se usa', Icon: ShoppingBag },
];

function listProductsLinkedToIngredient(
  catalogItems: CatalogItem[],
  ing: StoreIngredient,
): Array<{ _id: string; name: string; via: 'carta' | 'receta' | 'ambos' }> {
  const byId = new Map<string, { name: string; carta: boolean; receta: boolean }>();
  for (const p of catalogItemsUsingIngredient(catalogItems, ing.name)) {
    byId.set(p._id, { name: p.name, carta: true, receta: false });
  }
  const needle = ingredientNameFold(ing.name);
  for (const item of catalogItems) {
    if (item.active === false) continue;
    if (item.module && item.module !== 'catalog') continue;
    const hit = readProductRecipeLines(item).some(
      (line) =>
        String(line.storeIngredientId || '').trim() === ing.id ||
        ingredientNameFold(line.name) === needle,
    );
    if (!hit) continue;
    const prev = byId.get(item._id);
    if (prev) prev.receta = true;
    else byId.set(item._id, { name: item.name, carta: false, receta: true });
  }
  return [...byId.entries()]
    .map(([_id, v]) => ({
      _id,
      name: v.name,
      via: (v.carta && v.receta ? 'ambos' : v.carta ? 'carta' : 'receta') as
        | 'carta'
        | 'receta'
        | 'ambos',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Ficha de edición al estilo producto: secciones Datos / TPV / Productos. */
function EditIngredientDetailModal({
  ingredient,
  catalogItems,
  defaultExtraPrice,
  onUpdate,
  onFlags,
  onCost,
  onExtraPrice,
  onRemove,
  onClose,
}: {
  ingredient: StoreIngredient;
  catalogItems: CatalogItem[];
  defaultExtraPrice?: number | null;
  onUpdate: (draft: IngredientDraft) => boolean | Promise<boolean>;
  onFlags: (patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>) => void;
  onCost: (value: number) => void;
  onExtraPrice: (value: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<EditIngredientTab>('datos');
  const [draft, setDraft] = useState(() => itemToDraft(ingredient));

  useEffect(() => {
    setDraft(itemToDraft(ingredient));
    setTab('datos');
  }, [ingredient.id]);

  useEffect(() => {
    setDraft(itemToDraft(ingredient));
  }, [
    ingredient.id,
    ingredient.name,
    ingredient.extraPrice,
    ingredient.baseCost,
    ingredient.tpvChargeExtra,
    ingredient.tpvAllowRemove,
    ingredient.role,
  ]);

  const flags = readStoreIngredientTpvFlags(ingredient);
  const linked = useMemo(
    () => listProductsLinkedToIngredient(catalogItems, ingredient),
    [catalogItems, ingredient],
  );
  const hasInventory = useMemo(
    () => catalogInventoryItemsForIngredient(catalogItems, ingredient.name).length > 0,
    [catalogItems, ingredient.name],
  );

  const pushDraft = (next: IngredientDraft) => {
    setDraft(next);
    void Promise.resolve(onUpdate(next)).then((ok) => {
      if (!ok) setDraft(itemToDraft(ingredient));
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-ingredient-title"
        className="w-full max-w-3xl max-h-[min(92vh,820px)] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 flex items-start justify-between gap-3 border-b border-stone-100 dark:border-stone-800">
          <div className="min-w-0 flex items-start gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-950">
              <Package className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2
                id="edit-ingredient-title"
                className="text-lg font-bold text-stone-900 dark:text-stone-100 truncate"
              >
                {draft.name.trim() || ingredient.name || 'Ingrediente'}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span
                  className={`rounded-lg px-2 py-0.5 font-semibold ${
                    flags.chargeExtra
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                  }`}
                >
                  {flags.chargeExtra ? 'Extra de pago' : 'Incluido'}
                </span>
                {flags.allowRemove ? (
                  <span className="rounded-lg bg-blue-50 px-2 py-0.5 font-semibold text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:text-blue-300">
                    Se puede quitar
                  </span>
                ) : null}
                {hasInventory ? (
                  <span className="rounded-lg bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                    Con inventario
                  </span>
                ) : null}
                <span className="tabular-nums text-stone-400">
                  {linked.length} producto{linked.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Secciones del ingrediente"
          className="shrink-0 border-b border-stone-200 bg-stone-50/80 px-3 pb-3 dark:border-stone-800 dark:bg-stone-950/40 sm:px-5"
        >
          <p className="pt-2.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Elige sección
          </p>
          <div className="grid grid-cols-3 gap-2">
            {EDIT_INGREDIENT_TABS.map(({ id, label, hint, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={`min-h-[4rem] rounded-xl border-2 px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 shadow-sm dark:bg-blue-950/40'
                      : 'border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-blue-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-[var(--v-blue,#2563eb)]' : 'text-stone-400'
                      }`}
                    />
                    <span
                      className={`truncate text-xs font-bold sm:text-sm ${
                        active
                          ? 'text-[var(--v-blue,#2563eb)]'
                          : 'text-stone-800 dark:text-stone-100'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-[10px] leading-snug ${
                      active
                        ? 'text-blue-700/80 dark:text-blue-300/80'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {hint}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          {tab === 'datos' ? (
            <section className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-950/40">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Nombre
                </span>
                <input
                  value={draft.name}
                  onChange={(e) => pushDraft({ ...draft, name: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-900"
                />
              </label>
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Coste base (compra)
                </span>
                <div className="flex items-center gap-2">
                  <IngredientCostCell ingredient={ingredient} onCommit={onCost} />
                  {ingredient.baseCost != null && ingredient.baseCost > 0 ? (
                    <span className="text-xs text-stone-400">
                      {formatMoneyEs(ingredient.baseCost)}
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-stone-500">
                  Coste interno del ingrediente. No es el precio del extra en TPV.
                </p>
              </div>
            </section>
          ) : null}

          {tab === 'tpv' ? (
            <section className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-950/40">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Extra de pago
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Si está activo, en el TPV se cobra al añadirlo al pedido.
                  </p>
                </div>
                <InlineToggle
                  checked={flags.chargeExtra}
                  onChange={(checked) => onFlags({ chargeExtra: checked })}
                />
              </div>
              {flags.chargeExtra ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-2">
                    Cuánto se cobra
                  </p>
                  <IngredientExtraPriceCell
                    ingredient={ingredient}
                    fallbackPrice={defaultExtraPrice}
                    onCommit={onExtraPrice}
                  />
                  <p className="mt-2 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                    Si lo dejas vacío, se usa el precio por defecto de extras de la barra.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Se puede quitar en TPV
                  </p>
                  <p className="text-[11px] text-stone-500">
                    El cliente puede quitarlo del producto al personalizar.
                  </p>
                </div>
                <InlineToggle
                  checked={flags.allowRemove}
                  onChange={(checked) => onFlags({ allowRemove: checked })}
                />
              </div>
            </section>
          ) : null}

          {tab === 'productos' ? (
            <section className="space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Productos de carta o receta que usan este ingrediente. La conexión se hace desde el
                producto (ficha / receta), no aquí.
              </p>
              {linked.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-8 text-center dark:border-stone-700 dark:bg-stone-950/40">
                  <ShoppingBag className="mx-auto h-8 w-8 text-stone-300" />
                  <p className="mt-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
                    Aún no está en ningún producto
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Añádelo en la ficha del producto o en una receta.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 dark:divide-stone-800 dark:border-stone-700">
                  {linked.map((p) => (
                    <li
                      key={p._id}
                      className="flex items-center justify-between gap-3 bg-white px-3 py-2.5 dark:bg-stone-900"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                        {p.name}
                      </span>
                      <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:bg-stone-800 dark:text-stone-300">
                        {p.via === 'ambos' ? 'Carta · Receta' : p.via === 'carta' ? 'Carta' : 'Receta'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-3 dark:border-stone-800 sm:px-5">
          <button
            type="button"
            onClick={onRemove}
            className={`${VERTIAL_BTN_DANGER} !min-h-0 px-3 py-2 text-xs`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
          <div className="flex items-center gap-2">
            <p className="hidden text-[11px] text-stone-400 sm:block">
              Los cambios se guardan al instante.
            </p>
            <button
              type="button"
              onClick={onClose}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
            >
              Hecho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function sortIngredientList(items: StoreIngredient[], sortMode: SortMode = 'name-asc'): StoreIngredient[] {
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

export function StoreIngredientsPanel({
  userId,
  businessId,
}: {
  userId: string;
  businessId: string;
}) {
  const { businesses, currentBusiness } = useBusiness();
  const {
    pointsOfSale,
    retailWorkCenters,
    activeSalesPointId,
    setActiveSalesPoint,
    displayLabelForActive,
  } = useActiveStoreScope();
  /** Solo tiendas de ESTA empresa (nunca bodegeta u otras del portfolio). */
  const storeOptions = useMemo(() => {
    const bid = normalizeBusinessScopeId(businessId);
    const foreignBusinessNames = (businesses || [])
      .filter((b) => {
        const id = normalizeBusinessScopeId(
          String((b as { business_id?: string; id?: string }).business_id || b.id || ''),
        );
        return Boolean(id && bid && id !== bid);
      })
      .map((b) => String((b as { name?: string }).name || '').trim())
      .filter(Boolean);

    const filtered = filterPointsOfSaleStrictlyForBusiness(pointsOfSale || [], {
      businessId: bid,
      workCenters: retailWorkCenters || [],
      foreignBusinessNames,
    });
    // No ocultar la tienda activa del sidebar aunque el filtro sea estricto.
    const cur = String(activeSalesPointId || '').trim();
    if (cur && !filtered.some((s) => String(s._id || '').trim() === cur)) {
      const fromPool = (pointsOfSale || []).find((p) => String(p._id || '').trim() === cur);
      if (fromPool && fromPool.active !== false && !(fromPool as { deletedAt?: string }).deletedAt) {
        return [fromPool, ...filtered];
      }
    }
    return filtered;
  }, [pointsOfSale, retailWorkCenters, businessId, businesses, activeSalesPointId]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configDocId, setConfigDocId] = useState<string | undefined>();
  const [configRev, setConfigRev] = useState<string | undefined>();
  const [items, setItems] = useState<StoreIngredient[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newDraft, setNewDraft] = useState<IngredientDraft>(() => emptyDraft(false));
  const [defaultExtraPrice, setDefaultExtraPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [listSection, setListSection] = useState<'ingredients' | 'subrecipes'>('ingredients');

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

  const allBrandIds = useMemo(() => brands.map((b) => b._id), [brands]);
  const ingredientItems = useMemo(
    () => items.filter((ing) => !isSubrecipeIngredient(ing)),
    [items],
  );
  const subrecipeItems = useMemo(
    () => items.filter((ing) => isSubrecipeIngredient(ing)),
    [items],
  );
  const hasExtras = useMemo(
    () => ingredientItems.some((i) => readStoreIngredientTpvFlags(i).chargeExtra),
    [ingredientItems],
  );

  const visibleIngredients = useMemo(() => {
    const source = listSection === 'subrecipes' ? subrecipeItems : ingredientItems;
    const sorted = sortIngredientList(source, 'name-asc');
    const q = ingredientNameFold(listSearch);
    if (!q) return sorted;
    return sorted.filter((ing) => ingredientNameFold(ing.name).includes(q));
  }, [ingredientItems, subrecipeItems, listSection, listSearch]);

  const editingIngredient = useMemo(
    () => (editingId ? items.find((i) => i.id === editingId) ?? null : null),
    [items, editingId],
  );

  const startCreateIngredient = () => {
    setEditingId(null);
    setNewDraft(emptyDraft(false));
    setCreating(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const brandsPromise = businessId
        ? listBrandsRequest(businessId).catch(() => [])
        : Promise.resolve([]);
      const [cfg, catalog, rawBrands] = await Promise.all([
        Promise.race([
          getDeliveryConfigRequest(userId),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('timeout')), 15_000);
          }),
        ]),
        listCatalogItemsRequest(userId, 'catalog').catch(() => []),
        brandsPromise,
      ]);
      setCatalogItems(catalog);
      const lineBrands = sortBrandsForDisplay(businessId ? commercialLineBrands(rawBrands) : []);
      const brandIds = lineBrands.map((b) => b._id);
      // Solo lo guardado (Excel o alta manual). No reinyectar desde la carta.
      const merged = unifyStoreIngredientsFromConfig(cfg, brandIds);
      const unified = toPanelItems(merged);
      const { items: deduped, mergedCount } = mergeDuplicateStoreIngredients(unified);

      setConfigDocId(cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`);
      setConfigRev(cfg._rev);
      setBrands(lineBrands);
      setItems(deduped);
      setDirty(mergedCount > 0);
      if (mergedCount > 0) {
        toast.message(`Fusionamos ${mergedCount} duplicado(s) al cargar`, { duration: 5000 });
      }
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(deduped, cfg.tpvDefaultExtraPrice) || ''));
      setNewDraft(emptyDraft(false));
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

  const validateDraft = (draft: IngredientDraft, excludeId?: string): string | null => {
    const name = draft.name.trim();
    if (!name) return 'Escribe el nombre';
    const key = ingredientNameFold(name);
    const duplicated = items.some(
      (i) => i.id !== excludeId && ingredientNameFold(i.name) === key,
    );
    if (duplicated) return 'Ya existe un ingrediente con ese nombre';
    return null;
  };

  const syncToWarehouse = useCallback(
    async (rows: StoreIngredient[]) => {
      try {
        const result = await syncInventoryCatalogFromSources(userId, {
          businessType: String(currentBusiness?.businessType || 'delivery'),
          businessId,
          storeIngredients: normalizeStoreIngredients(rows),
          brands: commercialLineBrands(brands),
          catalogItems: await listCatalogItemsRequest(userId).catch(() => catalogItems),
        });
        notifyDeliveryCatalogChanged(userId, businessId);
        return result;
      } catch {
        return null;
      }
    },
    [userId, businessId, brands, catalogItems, currentBusiness?.businessType],
  );

  const persistList = useCallback(
    async (
      nextItems: StoreIngredient[],
      opts?: { successToast?: string; warnNoExtras?: boolean },
    ): Promise<boolean> => {
      const rows = nextItems.filter((i) => String(i.name || '').trim());
      const extrasNow = rows.some((i) => readStoreIngredientTpvFlags(i).chargeExtra);
      if (extrasNow && normalizeTpvDefaultExtraPrice(defaultExtraPrice) == null) {
        toast.error('Indica el precio de los extras (Defecto extras)');
        setDirty(true);
        return false;
      }
      setSaving(true);
      try {
        const tpvDefaultExtraPrice = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
        const saved = await updateDeliveryConfigRequest(userId, {
          _id: configDocId || `dlvconf-${normalizeTenantUserId(userId)}`,
          _rev: configRev,
          storeIngredients: normalizeStoreIngredients(rows),
          tpvBrandSupplements: {},
          tpvBrandCategorySupplements: {},
          ...(tpvDefaultExtraPrice != null ? { tpvDefaultExtraPrice } : {}),
        } as Parameters<typeof updateDeliveryConfigRequest>[1]);
        setConfigDocId(saved._id || configDocId);
        setConfigRev(saved._rev);
        const merged = unifyStoreIngredientsFromConfig(saved, allBrandIds);
        const unified = toPanelItems(merged);
        const { items: deduped } = mergeDuplicateStoreIngredients(unified);
        setItems(deduped);
        setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(deduped, saved.tpvDefaultExtraPrice) || ''));
        setDirty(false);
        notifyDeliveryConfigChanged();
        await syncToWarehouse(deduped);
        if (opts?.successToast) {
          toast.success(opts.successToast);
        } else if (opts?.warnNoExtras) {
          const savedExtras = deduped.filter((i) => ingredientChargesExtra(i)).length;
          if (deduped.length > 0 && savedExtras === 0) {
            toast.warning('Guardado. Ningún extra de pago marcado.', { duration: 5000 });
          }
        }
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
        setDirty(true);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      userId,
      configDocId,
      configRev,
      defaultExtraPrice,
      allBrandIds,
      syncToWarehouse,
    ],
  );

  const applyAndPersist = async (
    updater: (prev: StoreIngredient[]) => StoreIngredient[],
    successToast?: string,
  ): Promise<boolean> => {
    const { items: deduped, mergedCount } = mergeDuplicateStoreIngredients(updater(items));
    if (mergedCount > 0) {
      toast.message(`Fusionamos ${mergedCount} duplicado(s) automáticamente`, { duration: 4500 });
    }
    setItems(deduped);
    return persistList(deduped, { successToast });
  };

  const addItem = async (draft: IngredientDraft): Promise<boolean> => {
    const err = validateDraft(draft);
    if (err) {
      toast.error(err);
      return false;
    }
    const created = draftToItem(draft);
    if (!created) return false;
    const row = withVertialDefaultBaseCost(created, brands);
    const ok = await applyAndPersist((prev) => [...prev, row], `«${row.name}» guardado`);
    if (ok) setNewDraft(emptyDraft(false));
    return ok;
  };

  const updateItem = async (id: string, draft: IngredientDraft): Promise<boolean> => {
    const err = validateDraft(draft, id);
    if (err) {
      toast.error(err);
      return false;
    }
    return applyAndPersist((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const name = draft.name.trim() || i.name;
        const { brandIds: _drop, ...rest } = i;
        const extraPrice = draft.chargeExtra
          ? normalizeTpvDefaultExtraPrice(draft.extraPrice)
          : null;
        const next = withStoreIngredientTpvFlags(
          {
            ...rest,
            name,
            ...(extraPrice != null ? { extraPrice } : { extraPrice: undefined }),
          },
          { chargeExtra: draft.chargeExtra, allowRemove: draft.allowRemove },
        );
        if (extraPrice == null) {
          const { extraPrice: _e, ...without } = next;
          return without;
        }
        return next;
      }),
    );
  };

  const removeItem = async (id: string) => {
    if (editingId === id) setEditingId(null);
    await applyAndPersist(
      (prev) => prev.filter((i) => i.id !== id),
      'Ingrediente eliminado',
    );
  };

  const updateIngredientTpvFlags = (
    id: string,
    patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>,
  ) => {
    void applyAndPersist((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next = withStoreIngredientTpvFlags(i, patch);
        if (patch.chargeExtra === true && normalizeTpvDefaultExtraPrice(next.extraPrice) == null) {
          const fallback = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
          if (fallback != null) return { ...next, extraPrice: fallback };
        }
        return next;
      }),
    );
  };

  const updateIngredientBaseCost = (id: string, baseCost: number) => {
    void applyAndPersist((prev) => prev.map((i) => (i.id === id ? { ...i, baseCost } : i)));
  };

  const updateIngredientExtraPrice = (id: string, extraPrice: number) => {
    void applyAndPersist((prev) => prev.map((i) => (i.id === id ? { ...i, extraPrice } : i)));
  };

  const persistDefaultExtraPrice = async (raw: string) => {
    setDefaultExtraPrice(raw);
    const price = normalizeTpvDefaultExtraPrice(raw);
    if (hasExtras && price == null) {
      setDirty(true);
      return;
    }
    setSaving(true);
    try {
      const saved = await updateDeliveryConfigRequest(userId, {
        _id: configDocId || `dlvconf-${normalizeTenantUserId(userId)}`,
        _rev: configRev,
        storeIngredients: normalizeStoreIngredients(items),
        tpvBrandSupplements: {},
        tpvBrandCategorySupplements: {},
        ...(price != null ? { tpvDefaultExtraPrice: price } : {}),
      } as Parameters<typeof updateDeliveryConfigRequest>[1]);
      setConfigDocId(saved._id || configDocId);
      setConfigRev(saved._rev);
      setDirty(false);
      notifyDeliveryConfigChanged();
    } catch {
      setDirty(true);
      toast.error('No se pudo guardar el precio de extras');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <CatalogCoreLoadingState kind="ingredients" />;
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
  const defaultExtraPriceNum = normalizeTpvDefaultExtraPrice(defaultExtraPrice);

  return (
    <div className="pb-20 lg:pb-4">
      <CatalogTabShell
        hideStoreLabel
        hideStoreStrip
        dataUserId={userId}
        banner={
          saving ? (
            <p className="text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              Guardando…
            </p>
          ) : dirty && hasExtras && !priceOk ? (
            <p className="text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Indica el precio del extra para poder guardar.
            </p>
          ) : undefined
        }
        toolbarLeftExtra={
          <label className="inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 dark:border-stone-700 dark:bg-stone-900">
            <Store className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
            {storeOptions.length > 0 ? (
              <select
                value={
                  storeOptions.some((s) => String(s._id || '').trim() === String(activeSalesPointId || '').trim())
                    ? String(activeSalesPointId || '')
                    : String(storeOptions[0]?._id || '')
                }
                onChange={(e) => setActiveSalesPoint(e.target.value)}
                aria-label="Tienda"
                className="min-w-[10rem] max-w-[16rem] truncate border-0 bg-transparent py-0 pl-0 pr-1 text-xs font-semibold text-stone-800 outline-none dark:text-stone-100"
              >
                {storeOptions.map((s) => {
                  const id = String(s._id || '').trim();
                  const label = pointOfSaleDisplayLabel(s);
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="truncate text-xs font-semibold text-stone-600 dark:text-stone-300">
                {displayLabelForActive || 'Tienda'}
              </span>
            )}
          </label>
        }
        toolbarRight={
          <>
            {hasExtras ? (
              <label
                className="inline-flex h-8 items-center gap-1 text-xs text-stone-500"
                title="Precio por defecto en el TPV si el extra no tiene precio propio"
              >
                <span className="hidden lg:inline font-medium text-stone-500">Defecto extras</span>
                <Euro className="h-3.5 w-3.5 text-stone-400" />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={defaultExtraPrice}
                  onChange={(e) => setDefaultExtraPrice(e.target.value)}
                  onBlur={(e) => void persistDefaultExtraPrice(e.target.value)}
                  aria-label="Precio por defecto de extras en TPV"
                  className="w-14 rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs font-semibold tabular-nums outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-900"
                />
                <span>€</span>
              </label>
            ) : null}
            <IngredientsNewMenu
              onAddIngredient={() => {
                setListSection('ingredients');
                startCreateIngredient();
              }}
              onCreateRecipe={() => {
                setListSection('subrecipes');
                setCreating(false);
                setEditingId(null);
                setShowRecipeModal(true);
              }}
              disabled={saving}
            />
          </>
        }
        toolbarBelow={
          <div
            className="grid grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-stone-100/80 p-1 dark:border-stone-700 dark:bg-stone-900/60"
            role="tablist"
            aria-label="Ingredientes o subrecetas"
          >
            <button
              type="button"
              role="tab"
              aria-selected={listSection === 'ingredients'}
              onClick={() => {
                setListSection('ingredients');
                setExpandedPreview(false);
                setListSearch('');
              }}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                listSection === 'ingredients'
                  ? 'bg-[var(--v-blue,#2563eb)] text-white shadow-sm'
                  : 'bg-white text-stone-700 hover:bg-blue-50/60 dark:bg-stone-800 dark:text-stone-200'
              }`}
            >
              Ingredientes
              <span
                className={`rounded px-1.5 py-px text-[10px] font-bold tabular-nums ${
                  listSection === 'ingredients'
                    ? 'bg-white/25 text-white'
                    : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'
                }`}
              >
                {ingredientItems.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listSection === 'subrecipes'}
              onClick={() => {
                setListSection('subrecipes');
                setExpandedPreview(false);
                setListSearch('');
              }}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                listSection === 'subrecipes'
                  ? 'bg-[var(--v-blue,#2563eb)] text-white shadow-sm'
                  : 'bg-white text-stone-700 hover:bg-blue-50/60 dark:bg-stone-800 dark:text-stone-200'
              }`}
            >
              Subrecetas
              <span
                className={`rounded px-1.5 py-px text-[10px] font-bold tabular-nums ${
                  listSection === 'subrecipes'
                    ? 'bg-white/25 text-white'
                    : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'
                }`}
              >
                {subrecipeItems.length}
              </span>
            </button>
          </div>
        }
      >
        <div className="p-3 space-y-3">
          {(listSection === 'ingredients' ? ingredientItems : subrecipeItems).length > 0 ? (
            <SaasTabSearch
              value={listSearch}
              onChange={(v) => {
                setListSearch(v);
                setExpandedPreview(false);
              }}
              placeholder={
                listSection === 'subrecipes' ? 'Buscar subreceta…' : 'Buscar ingrediente…'
              }
              className="relative w-full"
            />
          ) : null}
          {(listSection === 'ingredients' ? ingredientItems : subrecipeItems).length === 0 ? (
            <SaasTabEmpty
              icon={
                listSection === 'subrecipes' ? (
                  <Layers className="w-10 h-10" />
                ) : (
                  <Package className="w-10 h-10" />
                )
              }
              title={listSection === 'subrecipes' ? 'Sin subrecetas' : 'Sin ingredientes'}
              description={
                listSection === 'subrecipes'
                  ? 'Crea una con «Nuevo» → Crear receta (ej. masa = harina + agua).'
                  : 'Añádelos a mano con «Nuevo» o importa la carta Excel (columna de ingredientes).'
              }
            />
          ) : visibleIngredients.length === 0 ? (
            <SaasTabEmpty
              icon={<Package className="w-10 h-10" />}
              title="Sin resultados"
              description="Prueba otro nombre en el buscador."
            />
          ) : (
                (() => {
                  const rows = expandedPreview
                    ? visibleIngredients
                    : visibleIngredients.slice(0, GROUP_PREVIEW_ROWS);
                  const hiddenCount = visibleIngredients.length - rows.length;
                  return (
                    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                      <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {rows.map((ing) => {
                          const recipeLines = normalizeStoreIngredientRecipeLines(ing.recipeLines);
                          const isSub = recipeLines.length > 0;
                          const flags = readStoreIngredientTpvFlags(ing);
                          const hasInventory =
                            catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0;
                          const usageCount = catalogItemsUsingIngredient(catalogItems, ing.name).length;
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
                                  {!isSub ? (
                                    <button
                                      type="button"
                                      onClick={() => setEditingId(ing.id)}
                                      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                      title="Editar"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => void removeItem(ing.id)}
                                    className="p-2 rounded-lg text-gray-400 hover:text-red-600"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              {isSub ? (
                                <p className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
                                  {recipeLines.map((l) => `${l.name} ${l.quantity}${l.unit}`).join(' · ')}
                                  {ing.usageQtyPerUnit != null
                                    ? ` · venta: ${ing.usageQtyPerUnit}${ing.usageUnit || 'ud'}`
                                    : ''}
                                </p>
                              ) : (
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                <IngredientCostCell
                                  ingredient={ing}
                                  onCommit={(value) => updateIngredientBaseCost(ing.id, value)}
                                />
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                  Extra
                                  <InlineToggle
                                    checked={flags.chargeExtra}
                                    onChange={(checked) =>
                                      updateIngredientTpvFlags(ing.id, { chargeExtra: checked })
                                    }
                                  />
                                </label>
                                {flags.chargeExtra ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                                    Cuánto
                                    <IngredientExtraPriceCell
                                      ingredient={ing}
                                      fallbackPrice={defaultExtraPriceNum}
                                      onCommit={(value) => updateIngredientExtraPrice(ing.id, value)}
                                    />
                                  </span>
                                ) : null}
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                  Se puede quitar
                                  <InlineToggle
                                    checked={flags.allowRemove}
                                    onChange={(checked) =>
                                      updateIngredientTpvFlags(ing.id, { allowRemove: checked })
                                    }
                                  />
                                </label>
                              </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full min-w-[680px]">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-700">
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                {listSection === 'subrecipes' ? 'Subreceta' : 'Ingrediente'}
                              </th>
                              {listSection === 'subrecipes' ? (
                                <>
                                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                    Composición
                                  </th>
                                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                    Por venta
                                  </th>
                                </>
                              ) : (
                                <>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                Coste base
                              </th>
                              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                Extra
                              </th>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                Cuánto (€)
                              </th>
                              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                Se puede quitar
                              </th>
                                </>
                              )}
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                                Se usa en
                              </th>
                              <th className="px-4 py-2.5" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {rows.map((ing) => {
                              const recipeLines = normalizeStoreIngredientRecipeLines(ing.recipeLines);
                              const isSub = recipeLines.length > 0;
                              const flags = readStoreIngredientTpvFlags(ing);
                              const hasInventory =
                                catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0;
                              const usageCount = catalogItemsUsingIngredient(catalogItems, ing.name).length;
                              return (
                                <tr
                                  key={ing.id}
                                  className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                                >
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
                                  {isSub ? (
                                    <>
                                      <td className="px-4 py-2 text-xs text-stone-600 dark:text-stone-300">
                                        {recipeLines.map((l) => `${l.name} ${l.quantity}${l.unit}`).join(' · ')}
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                                        {ing.usageQtyPerUnit != null
                                          ? `${ing.usageQtyPerUnit} ${ing.usageUnit || 'ud'}`
                                          : '—'}
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                  <td className="px-4 py-2 text-right">
                                    <IngredientCostCell
                                      ingredient={ing}
                                      onCommit={(value) => updateIngredientBaseCost(ing.id, value)}
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <InlineToggle
                                      checked={flags.chargeExtra}
                                      onChange={(checked) =>
                                        updateIngredientTpvFlags(ing.id, { chargeExtra: checked })
                                      }
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {flags.chargeExtra ? (
                                      <IngredientExtraPriceCell
                                        ingredient={ing}
                                        fallbackPrice={defaultExtraPriceNum}
                                        onCommit={(value) => updateIngredientExtraPrice(ing.id, value)}
                                      />
                                    ) : (
                                      <span className="text-[11px] text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <InlineToggle
                                      checked={flags.allowRemove}
                                      onChange={(checked) =>
                                        updateIngredientTpvFlags(ing.id, { allowRemove: checked })
                                      }
                                    />
                                  </td>
                                    </>
                                  )}
                                  <td className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                    {usageCount > 0 ? `${usageCount} prod.` : '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center justify-end gap-0.5">
                                      {!isSub ? (
                                      <button
                                        type="button"
                                        onClick={() => setEditingId(ing.id)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                                        title="Editar"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => void removeItem(ing.id)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30"
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
                      {hiddenCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setExpandedPreview((v) => !v)}
                          className="w-full px-4 py-2.5 text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:bg-blue-50/60 dark:hover:bg-blue-950/20 border-t border-gray-100 dark:border-gray-700"
                        >
                          {expandedPreview ? 'Mostrar menos' : `Mostrar los ${hiddenCount} restantes`}
                        </button>
                      ) : null}
                    </section>
                  );
                })()
              )}
        </div>
      </CatalogTabShell>

      {creating ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setCreating(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-ingredient-title"
            className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="create-ingredient-title"
                  className="text-sm font-bold text-stone-900 dark:text-stone-100"
                >
                  Nuevo ingrediente
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Nombre del ingrediente. Se conecta desde el producto (carta / receta). El coste lo pones después en la fila.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <IngredientRow
              draft={newDraft}
              onChange={setNewDraft}
              isNew
              saving={saving}
              onAdd={() => {
                void (async () => {
                  if (await addItem(newDraft)) setCreating(false);
                })();
              }}
            />
            <div className="flex justify-end">
              <SaasTabSecondaryButton onClick={() => setCreating(false)}>Cancelar</SaasTabSecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {editingIngredient ? (
        <EditIngredientDetailModal
          ingredient={editingIngredient}
          catalogItems={catalogItems}
          defaultExtraPrice={defaultExtraPriceNum}
          onUpdate={(draft) => updateItem(editingIngredient.id, draft)}
          onFlags={(patch) => updateIngredientTpvFlags(editingIngredient.id, patch)}
          onCost={(value) => updateIngredientBaseCost(editingIngredient.id, value)}
          onExtraPrice={(value) => updateIngredientExtraPrice(editingIngredient.id, value)}
          onRemove={() => {
            setEditingId(null);
            void removeItem(editingIngredient.id);
          }}
          onClose={() => setEditingId(null)}
        />
      ) : null}

      <CreateIngredientRecipeModal
        open={showRecipeModal}
        onClose={() => setShowRecipeModal(false)}
        brands={brands}
        storeIngredients={items}
        catalogItems={catalogItems}
        userId={userId}
        initialBrandId={allBrandIds[0] || ''}
        onSaved={async ({ ingredient, createdComponents }) => {
          const toAdd = [
            ...createdComponents.map((row) => withVertialDefaultBaseCost(row, brands)),
            withVertialDefaultBaseCost(ingredient, brands),
          ];
          const map = new Map(items.map((i) => [i.id, i]));
          for (const row of toAdd) map.set(row.id, row);
          const nextItems = [...map.values()];
          commitItems(nextItems);
          try {
            const saved = await updateDeliveryConfigRequest(userId, {
              _id: configDocId || `dlvconf-${normalizeTenantUserId(userId)}`,
              _rev: configRev,
              storeIngredients: normalizeStoreIngredients(nextItems),
              ...(normalizeTpvDefaultExtraPrice(defaultExtraPrice) != null
                ? { tpvDefaultExtraPrice: normalizeTpvDefaultExtraPrice(defaultExtraPrice) }
                : {}),
            } as Parameters<typeof updateDeliveryConfigRequest>[1]);
            setConfigDocId(saved._id || configDocId);
            setConfigRev(saved._rev);
            setDirty(false);
            notifyDeliveryConfigChanged();
            const catalog = await listCatalogItemsRequest(userId, 'catalog').catch(() => catalogItems);
            setCatalogItems(catalog);
            await syncToWarehouse(nextItems);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la receta');
          }
        }}
      />
    </div>
  );
}
