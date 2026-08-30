import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import type { Brand } from '../../lib/brandsApi';
import {
  isCatalogCostingProduct,
  readProductRecipeLines,
  withProductCosting,
  type ProductRecipeLine,
} from '../../lib/catalogCosting';
import {
  productBrandIdsFromItem,
  withStoreIngredientTpvFlags,
  type StoreIngredient,
  type StoreIngredientRecipeLine,
} from '../../lib/catalogCustomization';
import { updateCatalogItemRequest, type CatalogItem } from '../../lib/deliveryApi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import {
  CatalogProductRecipePicker,
  recipePicksToLines,
  type CatalogRecipePick,
} from './CatalogProductRecipePicker';

const STEPS = [
  { id: 1, title: 'Elaborado' },
  { id: 2, title: 'Composición' },
  { id: 3, title: 'Productos' },
  { id: 4, title: 'Resumen' },
] as const;

export type CreateIngredientRecipeResult = {
  ingredient: StoreIngredient;
  createdComponents: StoreIngredient[];
  appliedProductIds: string[];
};

type CreateIngredientRecipeModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (result: CreateIngredientRecipeResult) => void | Promise<void>;
  brands: Brand[];
  storeIngredients: StoreIngredient[];
  catalogItems: CatalogItem[];
  userId: string;
  /** @deprecated Ya no se preselecciona marca; la conexión es por productos. */
  initialBrandId?: string;
};

function parseQty(raw: string): number | null {
  const n = Number(String(raw || '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}

function mergeRecipeLines(
  existing: ProductRecipeLine[],
  incoming: ProductRecipeLine[],
): ProductRecipeLine[] {
  const byId = new Map<string, ProductRecipeLine>();
  for (const line of existing) {
    const id = String(line.storeIngredientId || '').trim();
    if (!id) continue;
    byId.set(id, { ...line });
  }
  for (const line of incoming) {
    const id = String(line.storeIngredientId || '').trim();
    if (!id) continue;
    byId.set(id, { ...line });
  }
  return [...byId.values()];
}

export function CreateIngredientRecipeModal({
  open,
  onClose,
  onSaved,
  brands,
  storeIngredients,
  catalogItems,
  userId,
}: CreateIngredientRecipeModalProps) {
  useModalClose(open, onClose);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [usageQty, setUsageQty] = useState('180');
  const [usageUnit, setUsageUnit] = useState('g');
  const [picks, setPicks] = useState<CatalogRecipePick[]>([]);
  const [localIngredients, setLocalIngredients] = useState<StoreIngredient[]>([]);
  const [createdComponents, setCreatedComponents] = useState<StoreIngredient[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [productSearch, setProductSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName('');
    setUsageQty('180');
    setUsageUnit('g');
    setPicks([]);
    setLocalIngredients(storeIngredients);
    setCreatedComponents([]);
    setSelectedProductIds(new Set());
    setProductSearch('');
    setSubmitting(false);
    setCreatingIngredient(false);
  }, [open, storeIngredients]);

  const allProducts = useMemo(() => {
    return catalogItems
      .filter((item) => isCatalogCostingProduct(item) && item.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [catalogItems]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [allProducts, productSearch]);

  /** Agrupa por organizador solo para encontrar productos; no etiqueta la receta. */
  const productsByOrganizer = useMemo(() => {
    const groups: Array<{ id: string; name: string; products: CatalogItem[] }> = [];
    const assigned = new Set<string>();

    for (const brand of brands) {
      const products = filteredProducts.filter((p) => {
        const ids = productBrandIdsFromItem(p);
        if (ids.length === 0) return false;
        return ids.includes(brand._id);
      });
      if (products.length === 0) continue;
      for (const p of products) assigned.add(p._id);
      groups.push({ id: brand._id, name: brand.name, products });
    }

    const orphans = filteredProducts.filter((p) => !assigned.has(p._id));
    if (orphans.length > 0) {
      groups.push({
        id: '__otros__',
        name: brands.length > 0 ? 'Otros / sin organizador' : 'Productos',
        products: orphans,
      });
    }
    return groups;
  }, [brands, filteredProducts]);

  const compositionLines = useMemo(() => recipePicksToLines(picks), [picks]);

  const canNext = (() => {
    if (step === 1) return Boolean(name.trim()) && parseQty(usageQty) != null;
    if (step === 2) return compositionLines.length > 0;
    if (step === 3) return selectedProductIds.size > 0;
    return true;
  })();

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setProductsSelected = (ids: string[], selected: boolean) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setProductsSelected(
      filteredProducts.map((p) => p._id),
      true,
    );
  };

  const clearAllFiltered = () => {
    setProductsSelected(
      filteredProducts.map((p) => p._id),
      false,
    );
  };

  const handleCreateComponent = async (input: {
    name: string;
  }): Promise<StoreIngredient | null> => {
    const clean = String(input.name || '').trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    setCreatingIngredient(true);
    try {
      const exists = localIngredients.find(
        (i) => i.name.trim().toLowerCase() === clean.toLowerCase(),
      );
      if (exists) {
        toast.message(`«${exists.name}» ya existía; lo usamos en la receta`);
        return exists;
      }
      const row = withStoreIngredientTpvFlags(
        {
          id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: clean,
          escandalloOnly: true,
          unit: 'g',
        },
        { chargeExtra: false, allowRemove: false },
      );
      setLocalIngredients((prev) => [...prev, row]);
      setCreatedComponents((prev) => [...prev, row]);
      toast.success(`«${clean}» añadido a la composición`);
      return row;
    } finally {
      setCreatingIngredient(false);
    }
  };

  const handleSave = async () => {
    const qty = parseQty(usageQty);
    if (!name.trim() || qty == null || compositionLines.length === 0 || selectedProductIds.size === 0) {
      toast.error('Revisa los pasos: falta algún dato');
      return;
    }

    setSubmitting(true);
    try {
      const recipeLines: StoreIngredientRecipeLine[] = compositionLines.map((line) => ({
        storeIngredientId: line.storeIngredientId,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit || 'ud',
      }));

      const elaborated = withStoreIngredientTpvFlags(
        {
          id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: name.trim().replace(/\s+/g, ' '),
          escandalloOnly: true,
          unit: usageUnit || 'g',
          usageQtyPerUnit: qty,
          usageUnit: usageUnit || 'g',
          recipeLines,
        },
        { chargeExtra: false, allowRemove: false },
      );

      const ingredientsById = new Map<string, StoreIngredient>();
      for (const ing of [...localIngredients, ...createdComponents, elaborated]) {
        ingredientsById.set(ing.id, ing);
      }

      const brandsHint = brands.map((b) => ({ _id: b._id, deliveryLineKind: b.deliveryLineKind }));
      const appliedProductIds: string[] = [];
      // Al vender: solo el elaborado (masa). Las bases se gastan al fabricar, no en la venta.
      const perSaleLines: ProductRecipeLine[] = [
        {
          storeIngredientId: elaborated.id,
          name: elaborated.name,
          quantity: qty,
          unit: usageUnit || 'g',
          stockCategory: 'ingredient',
        },
      ];
      const baseIds = new Set(recipeLines.map((line) => String(line.storeIngredientId || '').trim()).filter(Boolean));

      for (const productId of selectedProductIds) {
        const product = catalogItems.find((p) => p._id === productId);
        if (!product) continue;
        // Quita bases de subreceta si un apply anterior las aplanó en el producto.
        const withoutBases = readProductRecipeLines(product).filter(
          (line) => !baseIds.has(String(line.storeIngredientId || '').trim()),
        );
        const merged = mergeRecipeLines(withoutBases, perSaleLines);
        const patched = withProductCosting(
          product,
          { costingType: 'recipe', recipeLines: merged },
          ingredientsById,
          brandsHint,
        );
        await updateCatalogItemRequest(userId, patched);
        appliedProductIds.push(productId);
      }

      await onSaved({
        ingredient: elaborated,
        createdComponents,
        appliedProductIds,
      });
      toast.success(
        `«${elaborated.name}» creado · ${appliedProductIds.length} producto(s) · se descuenta al vender`,
        { duration: 7000 },
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la receta');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const selectedProducts = allProducts.filter((p) => selectedProductIds.has(p._id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-ingredient-recipe-title"
        className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900 max-h-[min(92vh,720px)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800 shrink-0">
          <div className="min-w-0">
            <h2
              id="create-ingredient-recipe-title"
              className="text-base font-bold text-stone-900 dark:text-stone-100"
            >
              Crear receta
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Paso {step} de 4 — {STEPS.find((s) => s.id === step)?.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full ${
                s.id <= step ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-stone-200 dark:bg-stone-700'
              }`}
            />
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Nombre del elaborado (ej. Masa) y cuánto se usa <strong>por cada venta</strong> del
                producto. Luego eliges en qué productos de la carta se aplica.
              </p>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Nombre *
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masa"
                  autoFocus
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-950"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1 min-w-[8rem] flex-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                    Por unidad vendida *
                  </span>
                  <input
                    value={usageQty}
                    onChange={(e) => setUsageQty(e.target.value)}
                    inputMode="decimal"
                    placeholder="180"
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold tabular-nums outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-950"
                  />
                </label>
                <label className="block space-y-1 w-24">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                    Unidad
                  </span>
                  <select
                    value={usageUnit}
                    onChange={(e) => setUsageUnit(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-sm font-semibold outline-none dark:border-stone-700 dark:bg-stone-950"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="ud">ud</option>
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-stone-500">
                Al vender el producto se descuenta esta cantidad del elaborado. Las bases se restan al
                fabricar en almacén, no en la venta.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                ¿De qué está hecho <strong>{name.trim() || 'este elaborado'}</strong>? Puedes crear un
                ingrediente nuevo si no está en la lista.
              </p>
              <CatalogProductRecipePicker
                picks={picks}
                onChange={setPicks}
                storeIngredients={localIngredients.filter((i) => {
                  const n = name.trim().toLowerCase();
                  if (n && i.name.trim().toLowerCase() === n) return false;
                  return true;
                })}
                brands={brands}
                brandIds={[]}
                hideTpvOptions
                compact
                creatingIngredient={creatingIngredient}
                onCreateIngredient={handleCreateComponent}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                ¿En qué productos se va a usar? Agrupados por organizador para encontrarlos. Puedes
                marcar <strong>todos</strong> o elegir uno a uno.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className="min-w-[10rem] flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-950"
                />
                <button
                  type="button"
                  disabled={filteredProducts.length === 0}
                  onClick={selectAllFiltered}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Todos
                </button>
                <button
                  type="button"
                  disabled={selectedProductIds.size === 0}
                  onClick={clearAllFiltered}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
                >
                  Ninguno
                </button>
              </div>
              {productsByOrganizer.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                  No hay productos de carta. Créalos en Carta y vuelve.
                </p>
              ) : (
                <div className="max-h-72 space-y-3 overflow-y-auto pr-0.5">
                  {productsByOrganizer.map((group) => {
                    const groupIds = group.products.map((p) => p._id);
                    const selectedInGroup = groupIds.filter((id) => selectedProductIds.has(id)).length;
                    const allInGroup = selectedInGroup === groupIds.length && groupIds.length > 0;
                    return (
                      <div
                        key={group.id}
                        className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/80 px-3 py-2 dark:border-stone-800 dark:bg-stone-950/50">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-stone-800 dark:text-stone-100 truncate">
                              {group.name}
                            </p>
                            <p className="text-[10px] tabular-nums text-stone-400">
                              {selectedInGroup}/{group.products.length} productos
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProductsSelected(groupIds, !allInGroup)}
                            className="shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                          >
                            {allInGroup ? 'Quitar todos' : 'Todos de este'}
                          </button>
                        </div>
                        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                          {group.products.map((p) => {
                            const checked = selectedProductIds.has(p._id);
                            return (
                              <li key={`${group.id}-${p._id}`}>
                                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-stone-50 dark:hover:bg-stone-800/60">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleProduct(p._id)}
                                    className="rounded"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-stone-800 dark:text-stone-100">
                                      {p.name}
                                    </span>
                                    {p.category ? (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                                        {p.category}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-stone-500 tabular-nums">
                {selectedProductIds.size} seleccionado{selectedProductIds.size === 1 ? '' : 's'}
                {filteredProducts.length > 0 ? ` de ${filteredProducts.length}` : ''}
              </p>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 space-y-1.5 dark:border-stone-700 dark:bg-stone-950/40">
                <p>
                  <span className="text-stone-500">Elaborado:</span>{' '}
                  <strong className="text-stone-900 dark:text-stone-100">{name.trim()}</strong>
                  {' · '}
                  {usageQty} {usageUnit} por venta
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                  Composición (gasto al fabricar)
                </p>
                <ul className="space-y-1">
                  {compositionLines.map((line) => (
                    <li
                      key={line.storeIngredientId}
                      className="flex justify-between gap-2 rounded-lg border border-stone-100 px-2.5 py-1.5 text-xs dark:border-stone-800"
                    >
                      <span className="font-medium text-stone-800 dark:text-stone-200">{line.name}</span>
                      <span className="tabular-nums text-stone-500">
                        {line.quantity} {line.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                  Productos ({selectedProducts.length})
                </p>
                <p className="mb-1.5 text-[11px] text-stone-500">
                  En cada uno se añade solo «{name.trim() || 'elaborado'}» ({usageQty} {usageUnit} por
                  venta). Bacon, salsas, etc. los pones tú en el escandallo del plato.
                </p>
                <ul className="space-y-1.5">
                  {productsByOrganizer.map((group) => {
                    const picked = group.products.filter((p) => selectedProductIds.has(p._id));
                    if (picked.length === 0) return null;
                    return (
                      <li key={`sum-${group.id}`} className="text-xs">
                        <span className="font-semibold text-stone-700 dark:text-stone-200">
                          {group.name}
                        </span>
                        <span className="text-stone-500">
                          {' — '}
                          {picked.map((p) => p.name).join(' · ')}
                        </span>
                      </li>
                    );
                  })}
                  {selectedProducts.length === 0 ? (
                    <li className="text-xs text-stone-500">—</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-3 dark:border-stone-800 shrink-0">
          <button
            type="button"
            disabled={submitting || step <= 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs disabled:opacity-40`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Atrás
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
            >
              Cancelar
            </button>
            {step < 4 ? (
              <button
                type="button"
                disabled={!canNext || submitting}
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs disabled:opacity-50`}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !canNext}
                onClick={() => void handleSave()}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs disabled:opacity-50 inline-flex items-center gap-1.5`}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {submitting ? 'Guardando…' : 'Guardar receta'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
