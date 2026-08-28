import { useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import type { Brand } from '../../lib/brandsApi';
import {
  calculateRecipeTotalCost,
  resolveStoreIngredientBaseCost,
  storeIngredientsById,
  type ProductRecipeLine,
} from '../../lib/catalogCosting';
import {
  readStoreIngredientTpvFlags,
  resolveIngredientRole,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
import { formatDecimalEs, formatMoneyEs } from '../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY } from '../../lib/vertialUiTokens';

export type CatalogRecipePick = {
  storeIngredientId: string;
  name: string;
  quantity: number;
  unit: string;
  /** Si true, aparece en TPV para que el cliente pueda quitarlo. */
  tpvRemovable: boolean;
};

export type CatalogRecipeCreateIngredientInput = {
  name: string;
  baseCost?: number;
  unit?: string;
};

type CatalogProductRecipePickerProps = {
  picks: CatalogRecipePick[];
  onChange: (next: CatalogRecipePick[]) => void;
  storeIngredients: StoreIngredient[];
  brands: Brand[];
  brandIds?: string[];
  salePrice?: number;
  compact?: boolean;
  /** Crea ingrediente maestro + almacén; el picker lo mete en el escandallo. */
  onCreateIngredient?: (input: CatalogRecipeCreateIngredientInput) => Promise<StoreIngredient | null>;
  creatingIngredient?: boolean;
};

function foldName(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function defaultQtyForIngredient(ing: StoreIngredient, unitOverride?: string): number {
  const unit = String(unitOverride || (ing as { unit?: string }).unit || 'ud').toLowerCase();
  if (unit === 'kg' || unit === 'l' || unit === 'lt') return 0.05;
  if (unit === 'g' || unit === 'ml') return 50;
  return 1;
}

function scopeIngredients(
  list: StoreIngredient[],
  brandIds: string[],
): StoreIngredient[] {
  const wanted = new Set(brandIds.filter(Boolean));
  if (wanted.size === 0) return list;
  return list.filter((ing) => {
    const ids = Array.isArray(ing.brandIds) ? ing.brandIds : [];
    if (ids.length === 0) return true;
    return ids.some((id) => wanted.has(id));
  });
}

export function recipePicksToLines(picks: CatalogRecipePick[]): ProductRecipeLine[] {
  return picks
    .filter((p) => p.quantity > 0 && p.storeIngredientId)
    .map((p) => ({
      storeIngredientId: p.storeIngredientId,
      name: p.name,
      quantity: p.quantity,
      unit: p.unit || 'ud',
      stockCategory: 'ingredient' as const,
    }));
}

export function recipePicksToTpvIngredientsText(picks: CatalogRecipePick[]): string {
  return picks
    .filter((p) => p.tpvRemovable)
    .map((p) => p.name.trim())
    .filter(Boolean)
    .join(', ');
}

const UNIT_OPTIONS = ['ud', 'g', 'kg', 'ml', 'l'] as const;

export function CatalogProductRecipePicker({
  picks,
  onChange,
  storeIngredients,
  brands,
  brandIds = [],
  salePrice = 0,
  compact = false,
  onCreateIngredient,
  creatingIngredient = false,
}: CatalogProductRecipePickerProps) {
  const [search, setSearch] = useState('');
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newUnit, setNewUnit] = useState<string>('ud');
  const ingredientsById = useMemo(() => storeIngredientsById(storeIngredients), [storeIngredients]);
  const scoped = useMemo(() => scopeIngredients(storeIngredients, brandIds), [storeIngredients, brandIds]);

  const pickedIds = useMemo(() => new Set(picks.map((p) => p.storeIngredientId)), [picks]);

  const available = useMemo(() => {
    const q = foldName(search);
    return scoped
      .filter((ing) => !pickedIds.has(ing.id))
      .filter((ing) => {
        if (!q) return true;
        return foldName(ing.name).includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [scoped, pickedIds, search]);

  const lines = useMemo(() => recipePicksToLines(picks), [picks]);
  const totalCost = useMemo(
    () => calculateRecipeTotalCost(lines, ingredientsById, brands),
    [lines, ingredientsById, brands],
  );
  const margin =
    salePrice > 0 ? Math.round(((salePrice - totalCost) / salePrice) * 1000) / 10 : null;

  const addIngredient = (ing: StoreIngredient, unitOverride?: string) => {
    const flags = readStoreIngredientTpvFlags(ing);
    const role = resolveIngredientRole(ing);
    const unit = unitOverride || (ing as { unit?: string }).unit || 'ud';
    onChange([
      ...picks,
      {
        storeIngredientId: ing.id,
        name: ing.name,
        quantity: defaultQtyForIngredient(ing, unit),
        unit,
        tpvRemovable: flags.allowRemove && role !== 'escandallo',
      },
    ]);
  };

  const updateQty = (id: string, delta: number) => {
    onChange(
      picks.map((p) => {
        if (p.storeIngredientId !== id) return p;
        const step = p.unit === 'kg' || p.unit === 'l' || p.unit === 'lt' ? 0.01 : 1;
        const next = Math.round((p.quantity + delta * step) * 1000) / 1000;
        return { ...p, quantity: Math.max(step, next) };
      }),
    );
  };

  const setQty = (id: string, raw: string) => {
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    onChange(
      picks.map((p) =>
        p.storeIngredientId === id ? { ...p, quantity: Math.round(n * 1000) / 1000 } : p,
      ),
    );
  };

  const toggleRemovable = (id: string) => {
    onChange(
      picks.map((p) =>
        p.storeIngredientId === id ? { ...p, tpvRemovable: !p.tpvRemovable } : p,
      ),
    );
  };

  const removePick = (id: string) => {
    onChange(picks.filter((p) => p.storeIngredientId !== id));
  };

  const submitCreate = async () => {
    if (!onCreateIngredient || creatingIngredient) return;
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const costRaw = Number(String(newCost).replace(',', '.'));
    const baseCost = Number.isFinite(costRaw) && costRaw >= 0 ? Math.round(costRaw * 100) / 100 : undefined;
    const created = await onCreateIngredient({
      name,
      baseCost,
      unit: newUnit,
    });
    if (!created) return;
    addIngredient(created, newUnit);
    setNewName('');
    setNewCost('');
    setNewUnit('ud');
    setSearch('');
    setShowCreatePanel(false);
  };

  return (
    <div className={`space-y-3 ${compact ? '' : ''}`}>
      <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Escandallo automático
            </p>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 mt-0.5">
              Elige ingredientes con + / −. El coste se calcula solo; al vender se descuenta del stock.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-amber-950 dark:text-amber-100">
              {formatMoneyEs(totalCost)}
            </p>
            {margin != null ? (
              <p
                className={`text-[11px] font-semibold ${
                  margin < 0 ? 'text-red-600' : margin < 15 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                Margen {formatDecimalEs(margin)}%
              </p>
            ) : (
              <p className="text-[11px] text-gray-500">Pon PVP para ver margen</p>
            )}
          </div>
        </div>
      </div>

      {picks.length > 0 ? (
        <div className="space-y-2">
          {picks.map((pick) => {
            const ing = ingredientsById.get(pick.storeIngredientId);
            const unitCost = ing ? resolveStoreIngredientBaseCost(ing, brands) : 0;
            const lineCost = Math.round(pick.quantity * unitCost * 100) / 100;
            return (
              <div
                key={pick.storeIngredientId}
                className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {pick.name}
                  </p>
                  <p className="text-[11px] text-gray-500 tabular-nums">
                    {formatMoneyEs(unitCost)}/{pick.unit} · línea {formatMoneyEs(lineCost)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateQty(pick.storeIngredientId, -1)}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    aria-label="Menos"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={pick.quantity}
                    onChange={(e) => setQty(pick.storeIngredientId, e.target.value)}
                    className="w-16 text-center px-1 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold tabular-nums"
                  />
                  <span className="text-xs text-gray-500 w-6">{pick.unit}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(pick.storeIngredientId, 1)}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    aria-label="Más"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={pick.tpvRemovable}
                    onChange={() => toggleRemovable(pick.storeIngredientId)}
                    className="rounded"
                  />
                  Quitar en TPV
                </label>
                <button
                  type="button"
                  onClick={() => removePick(pick.storeIngredientId)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  aria-label="Quitar del escandallo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
          Aún no hay ingredientes en el escandallo. Añádelos abajo.
        </p>
      )}

      {onCreateIngredient ? (
        showCreatePanel ? (
          <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-800 bg-white dark:bg-stone-900 p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold text-stone-700 dark:text-stone-200">
                Nuevo ingrediente (TPV + almacén + escandallo)
              </p>
              <button
                type="button"
                disabled={creatingIngredient}
                onClick={() => {
                  setShowCreatePanel(false);
                  setNewName('');
                  setNewCost('');
                  setNewUnit('ud');
                }}
                className="shrink-0 text-[10px] font-semibold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-[9rem] flex-1">
                <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">Nombre</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creatingIngredient}
                  placeholder="Ej. Mozzarella"
                  autoFocus
                  className="w-full px-2.5 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitCreate();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowCreatePanel(false);
                      setNewName('');
                      setNewCost('');
                      setNewUnit('ud');
                    }
                  }}
                />
              </div>
              <div className="w-[5.5rem]">
                <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">Coste €</label>
                <input
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  disabled={creatingIngredient}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="w-full px-2.5 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm tabular-nums"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitCreate();
                    }
                  }}
                />
              </div>
              <div className="w-[4.5rem]">
                <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">Ud.</label>
                <select
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  disabled={creatingIngredient}
                  className="w-full px-1.5 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={creatingIngredient || !newName.trim()}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs disabled:opacity-50 inline-flex items-center gap-1.5`}
              >
                {creatingIngredient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creatingIngredient ? 'Creando…' : 'Crear y añadir'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreatePanel(true)}
              disabled={creatingIngredient}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 transition-colors hover:border-amber-500 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:bg-stone-900 dark:text-amber-200 dark:hover:bg-amber-950/30"
            >
              <Plus className="w-3 h-3" />
              Crear ingrediente
            </button>
          </div>
        )
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ingrediente para añadir…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        />
      </div>

      {storeIngredients.length === 0 && !onCreateIngredient ? (
        <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          No hay ingredientes maestros. Crea algunos en <strong>Catálogo → Ingredientes</strong> y vuelve.
        </p>
      ) : available.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-1">
          {search.trim()
            ? 'Sin resultados'
            : scoped.length === 0
              ? 'No hay ingredientes para esta marca. Pulsa «Crear ingrediente» o créalos en Catálogo → Ingredientes.'
              : 'Todos los ingredientes ya están en el escandallo'}
        </p>
      ) : (
        <div
          className={`grid gap-1.5 max-h-40 overflow-y-auto pr-0.5 ${
            compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {available.slice(0, 48).map((ing) => {
            const unitCost = resolveStoreIngredientBaseCost(ing, brands);
            return (
              <button
                key={ing.id}
                type="button"
                onClick={() => addIngredient(ing)}
                className="flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                <span className="inline-flex items-center gap-1.5 min-w-0 w-full">
                  <Plus className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span className="truncate">{ing.name}</span>
                </span>
                <span className="pl-5 text-[10px] font-medium tabular-nums text-stone-500 dark:text-stone-400">
                  {unitCost > 0 ? `${formatMoneyEs(unitCost)} / ud` : 'Sin coste'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
