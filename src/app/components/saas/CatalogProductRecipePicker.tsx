import { useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import type { Brand } from '../../lib/brandsApi';
import { type ProductRecipeLine } from '../../lib/catalogCosting';
import {
  readStoreIngredientTpvFlags,
  resolveIngredientRole,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
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
  /** Oculta «Quitar en TPV» (recetas de elaboración / stock). */
  hideTpvOptions?: boolean;
  /** Crea ingrediente maestro + almacén; el picker lo mete en la composición. */
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

function ingredientUnit(ing: StoreIngredient): string {
  return String((ing as { unit?: string }).unit || 'ud').trim() || 'ud';
}

export function CatalogProductRecipePicker({
  picks,
  onChange,
  storeIngredients,
  brands: _brands,
  brandIds = [],
  salePrice: _salePrice = 0,
  compact = false,
  hideTpvOptions = false,
  onCreateIngredient,
  creatingIngredient = false,
}: CatalogProductRecipePickerProps) {
  const [search, setSearch] = useState('');
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newName, setNewName] = useState('');
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

  const addIngredient = (ing: StoreIngredient, unitOverride?: string) => {
    const flags = readStoreIngredientTpvFlags(ing);
    const role = resolveIngredientRole(ing);
    const unit = unitOverride || ingredientUnit(ing);
    onChange([
      ...picks,
      {
        storeIngredientId: ing.id,
        name: ing.name,
        quantity: defaultQtyForIngredient(ing, unit),
        unit,
        tpvRemovable: hideTpvOptions ? false : flags.allowRemove && role !== 'escandallo',
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
    const nameDraft = name;

    setNewName('');
    setSearch('');
    setShowCreatePanel(false);

    const created = await onCreateIngredient({ name });
    if (!created) {
      setNewName(nameDraft);
      setShowCreatePanel(true);
      return;
    }
    addIngredient(created);
  };

  return (
    <div className={`space-y-3 ${compact ? '' : ''}`}>
      <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
        {hideTpvOptions
          ? 'Elige qué componentes forman este elaborado. Las cantidades se descontarán del stock al vender los productos que elijas.'
          : (
            <>
              Elige qué lleva este plato. El coste de compra se gestiona en{' '}
              <strong className="font-semibold text-stone-700 dark:text-stone-200">Ingredientes / proveedores</strong>
              ; aquí solo la composición.
            </>
          )}
      </p>

      {picks.length > 0 ? (
        <div className="space-y-2">
          {picks.map((pick) => (
              <div
                key={pick.storeIngredientId}
                className="flex flex-col gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 sm:flex-row sm:flex-wrap sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {pick.name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 shrink-0">
                    Cuánto usas
                  </span>
                  <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-700 dark:bg-stone-950">
                    <button
                      type="button"
                      onClick={() => updateQty(pick.storeIngredientId, -1)}
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-stone-800"
                      aria-label="Menos"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(pick.quantity)}
                      onChange={(e) => setQty(pick.storeIngredientId, e.target.value)}
                      aria-label={`Cantidad de ${pick.name}`}
                      placeholder="0"
                      className="w-20 text-center px-1 py-1.5 rounded-lg border-0 bg-transparent text-sm font-bold tabular-nums outline-none focus:bg-white dark:focus:bg-stone-900"
                    />
                    <select
                      value={pick.unit || 'ud'}
                      onChange={(e) => {
                        const unit = e.target.value;
                        onChange(
                          picks.map((p) =>
                            p.storeIngredientId === pick.storeIngredientId ? { ...p, unit } : p,
                          ),
                        );
                      }}
                      aria-label={`Unidad de ${pick.name}`}
                      className="h-9 rounded-lg border-0 bg-transparent pl-1 pr-1 text-xs font-semibold text-stone-600 outline-none dark:text-stone-300"
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                      <option value="ud">ud</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => updateQty(pick.storeIngredientId, 1)}
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-stone-800"
                      aria-label="Más"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-[10px] text-stone-400 hidden sm:inline">aprox.</span>
                </div>
                {hideTpvOptions ? null : (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={pick.tpvRemovable}
                      onChange={() => toggleRemovable(pick.storeIngredientId)}
                      className="rounded"
                    />
                    Quitar en TPV
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => removePick(pick.storeIngredientId)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 self-end sm:self-auto"
                  aria-label="Quitar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
          ))}
        </div>
      ) : null}

      {onCreateIngredient ? (
        showCreatePanel ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold text-stone-700 dark:text-stone-200">
                Nuevo ingrediente (solo nombre)
              </p>
              <button
                type="button"
                disabled={creatingIngredient}
                onClick={() => {
                  setShowCreatePanel(false);
                  setNewName('');
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
                  placeholder="Ej. Jamón, bacon…"
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
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={creatingIngredient || !newName.trim()}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs disabled:opacity-50 inline-flex items-center gap-1.5`}
              >
                {creatingIngredient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creatingIngredient ? 'Creando…' : 'Añadir'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreatePanel(true)}
              disabled={creatingIngredient}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 transition-colors hover:border-stone-500 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
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
          placeholder="Buscar ingrediente…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        />
      </div>

      {storeIngredients.length === 0 && !onCreateIngredient ? (
        <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          No hay ingredientes. Créalos en <strong>Catálogo → Ingredientes</strong> y vuelve.
        </p>
      ) : available.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-1">
          {search.trim()
            ? 'Sin resultados'
            : scoped.length === 0
              ? 'No hay ingredientes para esta marca. Créalos en Catálogo → Ingredientes.'
              : 'Todos ya están en este plato'}
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
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              <Plus className="w-3.5 h-3.5 shrink-0 text-stone-500" />
              <span className="truncate">{ing.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type CatalogPackagingPick = {
  catalogItemId: string;
  name: string;
  quantity: number;
  unit: string;
};

export function packagingPicksToLines(picks: CatalogPackagingPick[]): ProductRecipeLine[] {
  return picks
    .filter((p) => p.quantity > 0 && p.catalogItemId)
    .map((p) => ({
      catalogItemId: p.catalogItemId,
      name: p.name,
      quantity: p.quantity,
      unit: p.unit || 'ud',
      stockCategory: 'packaging' as const,
    }));
}

type CatalogProductPackagingPickerProps = {
  picks: CatalogPackagingPick[];
  onChange: (next: CatalogPackagingPick[]) => void;
  packagingItems: Array<{ _id: string; name: string; unit?: string; stockQuantity?: number }>;
  compact?: boolean;
  onCreatePackaging?: (input: { name: string }) => Promise<{ _id: string; name: string; unit?: string } | null>;
  creatingPackaging?: boolean;
};

/** Envases del almacén que se descontarán al vender este producto TPV. */
export function CatalogProductPackagingPicker({
  picks,
  onChange,
  packagingItems,
  compact = false,
  onCreatePackaging,
  creatingPackaging = false,
}: CatalogProductPackagingPickerProps) {
  const [search, setSearch] = useState('');
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newName, setNewName] = useState('');
  const pickedIds = useMemo(() => new Set(picks.map((p) => p.catalogItemId)), [picks]);

  const available = useMemo(() => {
    const q = foldName(search);
    return packagingItems
      .filter((item) => !pickedIds.has(item._id))
      .filter((item) => {
        if (!q) return true;
        return foldName(item.name).includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [packagingItems, pickedIds, search]);

  const addItem = (item: { _id: string; name: string; unit?: string }) => {
    onChange([
      ...picks,
      {
        catalogItemId: item._id,
        name: item.name,
        quantity: 1,
        unit: String(item.unit || 'ud').trim() || 'ud',
      },
    ]);
  };

  const updateQty = (id: string, delta: number) => {
    onChange(
      picks.map((p) => {
        if (p.catalogItemId !== id) return p;
        return { ...p, quantity: Math.max(1, p.quantity + delta) };
      }),
    );
  };

  const setQty = (id: string, raw: string) => {
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    onChange(
      picks.map((p) =>
        p.catalogItemId === id ? { ...p, quantity: Math.max(0, Math.round(n * 1000) / 1000) } : p,
      ),
    );
  };

  const removePick = (id: string) => {
    onChange(picks.filter((p) => p.catalogItemId !== id));
  };

  const submitCreate = async () => {
    if (!onCreatePackaging || creatingPackaging) return;
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const draft = name;
    setNewName('');
    setSearch('');
    setShowCreatePanel(false);
    const created = await onCreatePackaging({ name });
    if (!created) {
      setNewName(draft);
      setShowCreatePanel(true);
      return;
    }
    addItem(created);
  };

  return (
    <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Envases</p>
        <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug mt-0.5">
          Elige o crea el envase que se descuenta al vender (caja, bolsa…). Si no eliges nada, no se resta
          envase.
        </p>
      </div>

      {picks.length > 0 ? (
        <div className="space-y-2">
          {picks.map((pick) => (
            <div
              key={pick.catalogItemId}
              className="flex flex-col gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{pick.name}</p>
                <p className="text-[10px] text-stone-400">Envase · {pick.unit}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 shrink-0">
                  Ud. por venta
                </span>
                <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-700 dark:bg-stone-950">
                  <button
                    type="button"
                    onClick={() => updateQty(pick.catalogItemId, -1)}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-stone-800"
                    aria-label="Menos"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(pick.quantity)}
                    onChange={(e) => setQty(pick.catalogItemId, e.target.value)}
                    aria-label={`Cantidad de ${pick.name}`}
                    className="w-16 text-center px-1 py-1.5 rounded-lg border-0 bg-transparent text-sm font-bold tabular-nums outline-none focus:bg-white dark:focus:bg-stone-900"
                  />
                  <button
                    type="button"
                    onClick={() => updateQty(pick.catalogItemId, 1)}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-stone-800"
                    aria-label="Más"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removePick(pick.catalogItemId)}
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  aria-label="Quitar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {onCreatePackaging ? (
        showCreatePanel ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-3 space-y-2 dark:border-stone-600 dark:bg-stone-900/50">
            <p className="text-xs font-semibold text-stone-700 dark:text-stone-200">Nuevo envase</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitCreate();
                }
              }}
              placeholder="Ej. Caja pizza M"
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={creatingPackaging || !newName.trim()}
                className={`${VERTIAL_BTN_PRIMARY} disabled:opacity-50`}
              >
                {creatingPackaging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Crear y usar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreatePanel(false);
                  setNewName('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreatePanel(true)}
            disabled={creatingPackaging}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 transition-colors hover:border-stone-500 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <Plus className="w-3 h-3" />
            Crear envase
          </button>
        )
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar envase…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        />
      </div>

      {packagingItems.length === 0 && !onCreatePackaging ? (
        <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          No hay envases. Créalos aquí o en <strong>Catálogo → Almacén → Envases</strong>.
        </p>
      ) : available.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-1">
          {search.trim()
            ? 'Sin resultados'
            : packagingItems.length === 0
              ? 'Crea el primer envase con el botón de arriba'
              : 'Todos los envases ya están en este producto'}
        </p>
      ) : (
        <div
          className={`grid gap-1.5 max-h-36 overflow-y-auto pr-0.5 ${
            compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {available.slice(0, 48).map((item) => (
            <button
              key={item._id}
              type="button"
              onClick={() => addItem(item)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              <Plus className="w-3.5 h-3.5 shrink-0 text-stone-500" />
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
