import { useMemo, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
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

export type CatalogRecipePick = {
  storeIngredientId: string;
  name: string;
  quantity: number;
  unit: string;
  /** Si true, aparece en TPV para que el cliente pueda quitarlo. */
  tpvRemovable: boolean;
};

type CatalogProductRecipePickerProps = {
  picks: CatalogRecipePick[];
  onChange: (next: CatalogRecipePick[]) => void;
  storeIngredients: StoreIngredient[];
  brands: Brand[];
  brandIds?: string[];
  salePrice?: number;
  compact?: boolean;
};

function foldName(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function defaultQtyForIngredient(ing: StoreIngredient): number {
  const unit = String(ing.unit || 'ud').toLowerCase();
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

export function CatalogProductRecipePicker({
  picks,
  onChange,
  storeIngredients,
  brands,
  brandIds = [],
  salePrice = 0,
  compact = false,
}: CatalogProductRecipePickerProps) {
  const [search, setSearch] = useState('');
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

  const addIngredient = (ing: StoreIngredient) => {
    const flags = readStoreIngredientTpvFlags(ing);
    const role = resolveIngredientRole(ing);
    onChange([
      ...picks,
      {
        storeIngredientId: ing.id,
        name: ing.name,
        quantity: defaultQtyForIngredient(ing),
        unit: ing.unit || 'ud',
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
              {totalCost.toFixed(2)}€
            </p>
            {margin != null ? (
              <p
                className={`text-[11px] font-semibold ${
                  margin < 0 ? 'text-red-600' : margin < 15 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                Margen {margin.toFixed(1)}%
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
                    {unitCost.toFixed(2)}€/{pick.unit} · línea {lineCost.toFixed(2)}€
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ingrediente para añadir…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        />
      </div>

      {storeIngredients.length === 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          No hay ingredientes maestros. Crea algunos en <strong>Catálogo → Ingredientes</strong> y vuelve.
        </p>
      ) : available.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-1">
          {search.trim()
            ? 'Sin resultados'
            : scoped.length === 0
              ? 'No hay ingredientes para esta marca. Prueba sin filtrar marca o crea ingredientes en Catálogo → Ingredientes.'
              : 'Todos los ingredientes ya están en el escandallo'}
        </p>
      ) : (
        <div
          className={`grid gap-1.5 max-h-40 overflow-y-auto pr-0.5 ${
            compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {available.slice(0, 48).map((ing) => (
            <button
              key={ing.id}
              type="button"
              onClick={() => addIngredient(ing)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              <Plus className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{ing.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
