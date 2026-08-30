import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
} from './SaasTabWorkspace';
import { CatalogTabShell } from './CatalogTabShell';
import { CatalogCoreLoadingState } from './CatalogCoreLoadingState';
import { useAuth } from '../../context/AuthContext';
import { useActiveBusinessScope } from '../../hooks/useActiveBusinessScope';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import {
  dedupeCatalogItemsForDisplay,
  filterCatalogItemsForBusinessScope,
} from '../../lib/catalogBusinessScope';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { sortBrandsForDisplay } from '../../lib/brandUtils';
import {
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  updateCatalogItemRequest,
  type CatalogItem,
} from '../../lib/deliveryApi';
import {
  normalizeStoreIngredients,
  unifyStoreIngredientsFromConfig,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
import {
  applyVertialDefaultsToStoreIngredients,
  resolveVertialDefaultRetailCost,
  isDrinkCatalogProduct,
  isDessertCatalogProduct,
} from '../../lib/vertialDefaultCosts';
import {
  calculateRecipeTotalCost,
  foodCostPercent,
  foodRecipeLines,
  formatEscandalloFoodCost,
  formatEscandalloMargin,
  escandalloMarginTone,
  isCatalogCostingProduct,
  marginPercent,
  productCostingStatus,
  readProductCostingType,
  readProductMermaPct,
  readProductRecipeLines,
  resolveIngredientUnitCost,
  resolveProductUnitCost,
  stockItemsByStoreIngredientId,
  storeIngredientsById,
  withProductCosting,
  type ProductCostingType,
  type ProductRecipeLine,
} from '../../lib/catalogCosting';
import { downloadEscandalloProductsExcel } from '../../lib/escandalloExcelExport';
import { buildEscandalloIngredientCostRows } from '../../lib/escandalloIngredientCosts';
import { formatDateEs, formatDateTimeEs } from '../../lib/formatDateEs';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { syncFullStockAutomationAfterCatalogImport } from '../../lib/deliveryCatalogImport';
import { syncRecipeForCostingProduct } from '../../lib/recipeSyncFromCosting';
import { filterStockInventoryItems } from '../../lib/stockInventoryScope';
import {
  listStockMovementsRequest,
  stockMovementUserMessage,
  type StockMovement,
} from '../../lib/stockMovementApi';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Edit3,
  History,
  Layers,
  Loader2,
  Minus,
  Package,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CategoryBulkCostingPanel } from './CategoryBulkCostingPanel';

type StatusFilter = 'all' | 'fixed' | 'recipe' | 'none';
type EscandalloViewTab = 'products' | 'ingredients' | 'history';
type HistoryDatePreset = '7d' | '30d' | 'month' | 'all' | 'custom';

type RecipeLineDraft = {
  storeIngredientId: string;
  quantity: string;
  unit: string;
};

function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rango ISO para filtrar movimientos (inclusive en el día). */
function resolveHistoryDateRange(
  preset: HistoryDatePreset,
  customFrom: string,
  customTo: string,
): { dateFrom?: string; dateTo?: string; label: string } {
  const now = new Date();
  const today = toYmdLocal(now);
  if (preset === 'all') {
    return { label: 'Todo' };
  }
  if (preset === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    const ymd = toYmdLocal(from);
    return {
      dateFrom: `${ymd}T00:00:00.000`,
      dateTo: `${today}T23:59:59.999`,
      label: 'Últimos 7 días',
    };
  }
  if (preset === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    const ymd = toYmdLocal(from);
    return {
      dateFrom: `${ymd}T00:00:00.000`,
      dateTo: `${today}T23:59:59.999`,
      label: 'Últimos 30 días',
    };
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const ymd = toYmdLocal(from);
    return {
      dateFrom: `${ymd}T00:00:00.000`,
      dateTo: `${today}T23:59:59.999`,
      label: 'Este mes',
    };
  }
  const from = String(customFrom || '').trim();
  const to = String(customTo || '').trim() || today;
  return {
    dateFrom: from ? `${from}T00:00:00.000` : undefined,
    dateTo: to ? `${to}T23:59:59.999` : undefined,
    label: from || to ? `${formatDateEs(from || to)} → ${formatDateEs(to || from)}` : 'Personalizado',
  };
}

function groupMovementsByDay(movements: StockMovement[]): Array<{ day: string; items: StockMovement[] }> {
  const map = new Map<string, StockMovement[]>();
  for (const m of movements) {
    const day = formatDateEs(m.createdAt) || 'Sin fecha';
    const arr = map.get(day) || [];
    arr.push(m);
    map.set(day, arr);
  }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}

function formatMoney(value: number): string {
  return `${value.toFixed(2)}€`;
}

function parseDecimalInput(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return 0;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function statusLabel(status: ReturnType<typeof productCostingStatus>): string {
  if (status === 'fixed') return 'Coste fijo';
  if (status === 'recipe') return 'Escandallo';
  return 'Sin configurar';
}

function statusClass(status: ReturnType<typeof productCostingStatus>): string {
  if (status === 'fixed') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
  if (status === 'recipe') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function EscandalloActionsMenu({
  canGenerate,
  generating,
  canDownload,
  canCategoryCosts,
  categoryCostsOpen,
  onGenerate,
  onDownload,
  onToggleCategoryCosts,
}: {
  canGenerate: boolean;
  generating: boolean;
  canDownload: boolean;
  canCategoryCosts: boolean;
  categoryCostsOpen: boolean;
  onGenerate: () => void;
  onDownload: () => void;
  onToggleCategoryCosts: () => void;
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

  const hasAny = canGenerate || canDownload || canCategoryCosts;
  if (!hasAny) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <SaasTabSecondaryButton
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Acciones de escandallo"
      >
        Acciones
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </SaasTabSecondaryButton>
      {open ? (
        <>
          <div className="fixed inset-0 z-[30]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-full z-[40] mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            {canGenerate ? (
              <button
                type="button"
                role="menuitem"
                disabled={generating}
                onClick={() => run(onGenerate)}
                className={`${itemClass} bg-blue-50/60 dark:bg-blue-950/30`}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--v-blue,#2563eb)]" />
                ) : (
                  <Sparkles className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
                )}
                Generar escandallos
              </button>
            ) : null}
            {canDownload ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => run(onDownload)}
                className={itemClass}
              >
                <Download className="w-4 h-4 text-gray-500" />
                Descargar Excel escandallo
              </button>
            ) : null}
            {canCategoryCosts ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => run(onToggleCategoryCosts)}
                className={itemClass}
              >
                <Layers className="w-4 h-4 text-gray-500" />
                {categoryCostsOpen ? 'Ocultar costes por categoría' : 'Costes por categoría'}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ProductCostingModal({
  product,
  storeIngredients,
  brands,
  stockItems = [],
  onClose,
  onSaved,
  embedded = false,
}: {
  product: CatalogItem;
  storeIngredients: StoreIngredient[];
  brands: Array<{ _id: string; deliveryLineKind?: string }>;
  /** Artículos de almacén (última compra) para coste efectivo. */
  stockItems?: CatalogItem[];
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  /** Dentro de otra ficha: sin overlay ni segundo modal. */
  embedded?: boolean;
}) {
  useModalClose(!embedded, onClose);
  const ingredientsById = useMemo(() => storeIngredientsById(storeIngredients), [storeIngredients]);
  const stockByStoreIngredientId = useMemo(
    () => stockItemsByStoreIngredientId(stockItems),
    [stockItems],
  );
  const costOptsBase = useMemo(
    () => ({ stockByStoreIngredientId }),
    [stockByStoreIngredientId],
  );
  const initialType = readProductCostingType(product);
  const retailDefault = isDrinkCatalogProduct(product) || isDessertCatalogProduct(product);
  const [costingType, setCostingType] = useState<ProductCostingType>(
    initialType === 'recipe' ? 'recipe' : 'fixed',
  );
  const [fixedCost, setFixedCost] = useState(() => {
    if (initialType === 'fixed') return String(product.costPrice || 0);
    if (retailDefault) return String(resolveVertialDefaultRetailCost(product));
    return String(product.costPrice || 0);
  });
  const [mermaPct, setMermaPct] = useState(() => {
    const m = readProductMermaPct(product);
    return m > 0 ? String(m) : '';
  });
  const [lines, setLines] = useState<RecipeLineDraft[]>(() =>
    // Solo comida: los envases se editan al crear/editar producto y se conservan al guardar.
    foodRecipeLines(readProductRecipeLines(product)).map((line) => ({
      storeIngredientId: line.storeIngredientId || '',
      quantity: String(line.quantity),
      unit: line.unit,
    })),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (costingType === 'recipe' && lines.length === 0 && storeIngredients.length > 0) {
      setLines([
        {
          storeIngredientId: storeIngredients[0].id,
          quantity: '',
          unit: 'ud',
        },
      ]);
    }
  }, [costingType, lines.length, storeIngredients]);

  const recipeLines = useMemo((): ProductRecipeLine[] => {
    const out: ProductRecipeLine[] = [];
    for (const line of lines) {
      const ing = ingredientsById.get(line.storeIngredientId);
      const quantity = parseDecimalInput(line.quantity);
      if (!ing || quantity == null || quantity <= 0) continue;
      out.push({
        storeIngredientId: line.storeIngredientId,
        name: ing.name,
        quantity,
        unit: line.unit.trim() || 'ud',
      });
    }
    return out;
  }, [lines, ingredientsById]);

  const mermaValue = parseDecimalInput(mermaPct) ?? 0;
  const previewCost =
    costingType === 'fixed'
      ? parseDecimalInput(fixedCost) ?? 0
      : calculateRecipeTotalCost(recipeLines, ingredientsById, brands, undefined, {
          ...costOptsBase,
          mermaPct: mermaValue,
        });

  const salePrice = Number(product.unitPrice) || 0;
  const fc = foodCostPercent(previewCost, salePrice);
  const margin = marginPercent(previewCost, salePrice);

  const addLine = () => {
    const first = storeIngredients[0];
    setLines((prev) => [
      ...prev,
      {
        storeIngredientId: first?.id || '',
        quantity: '',
        unit: 'ud',
      },
    ]);
  };

  const save = async () => {
    if (costingType === 'fixed') {
      const cost = parseDecimalInput(fixedCost);
      if (cost == null) {
        toast.error('Indica un coste fijo válido');
        return;
      }
    } else if (recipeLines.length === 0) {
      toast.error('Añade al menos un ingrediente a la receta');
      return;
    }

    setSaving(true);
    try {
      const next = withProductCosting(
        product,
        costingType === 'fixed'
          ? { costingType: 'fixed', fixedCost: parseDecimalInput(fixedCost) ?? 0, mermaPct: null }
          : {
              costingType: 'recipe',
              recipeLines,
              mermaPct: mermaValue > 0 ? mermaValue : null,
            },
        ingredientsById,
        brands,
        undefined,
        costOptsBase,
      );
      const saved = await updateCatalogItemRequest(product.user_id, next);
      if (costingType === 'recipe') {
        try {
          await syncRecipeForCostingProduct(
            product.user_id,
            saved,
            stockItems,
            ingredientsById,
          );
        } catch {
          /* escandallo ya guardado; sync recipe best-effort */
        }
      }
      onSaved(saved);
      toast.success('Escandallo guardado');
      if (!embedded) onClose();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const removeRecipe = async () => {
    if (!confirm(`¿Eliminar la receta de «${product.name}»?`)) return;
    setSaving(true);
    try {
      const next = withProductCosting(product, { costingType: null }, ingredientsById, brands);
      const saved = await updateCatalogItemRequest(product.user_id, next);
      onSaved(saved);
      toast.success('Receta eliminada');
      if (!embedded) onClose();
    } catch {
      toast.error('No se pudo eliminar');
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
        {!embedded ? (
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Escandallo</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{product.name}</h2>
            {product.category ? (
              <p className="text-xs text-gray-500 mt-0.5">{product.category}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        ) : (
        <div className="flex items-center gap-2 min-w-0 mb-1">
          <Calculator className="w-4 h-4 text-[var(--v-blue,#2563eb)] shrink-0" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Escandallo</h3>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${statusClass(
              productCostingStatus(product),
            )}`}
          >
            {productCostingStatus(product) === 'recipe'
              ? 'Receta'
              : productCostingStatus(product) === 'fixed'
                ? 'Coste fijo'
                : 'Sin configurar'}
          </span>
        </div>
        )}

        <div className={embedded ? 'space-y-4' : 'flex-1 overflow-y-auto px-5 py-4 space-y-4'}>
          <div className="flex flex-wrap gap-2">
            {(['fixed', 'recipe'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setCostingType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  costingType === type
                    ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600'
                }`}
              >
                {type === 'fixed' ? 'Coste fijo' : 'Escandallo'}
              </button>
            ))}
          </div>

          {costingType === 'fixed' ? (
            <label className="block text-sm">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Coste del producto</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={fixedCost}
                  onChange={(e) => setFixedCost(e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
                  placeholder="0,00"
                />
                <span className="text-sm text-gray-500">€</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Para bebidas, postres o productos revendidos.</p>
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Ingredientes</p>
                <SaasTabSecondaryButton onClick={addLine} disabled={storeIngredients.length === 0}>
                  <Plus className="w-3.5 h-3.5" />
                  Añadir
                </SaasTabSecondaryButton>
              </div>
              {storeIngredients.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Crea ingredientes en Catálogo → Ingredientes y define su coste base.
                </p>
              ) : null}
              <div className="space-y-2">
                {lines.map((line, index) => {
                  const ing = ingredientsById.get(line.storeIngredientId);
                  const qty = parseDecimalInput(line.quantity) ?? 0;
                  const stock = line.storeIngredientId
                    ? stockByStoreIngredientId.get(line.storeIngredientId)
                    : undefined;
                  const unitRes = ing
                    ? resolveIngredientUnitCost(ing, stock, brands)
                    : { effective: 0, fromFicha: 0, fromPurchase: 0, source: 'zero' as const };
                  const lineCost = unitRes.effective * qty;
                  return (
                    <div
                      key={`${line.storeIngredientId}-${index}`}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_88px_72px_88px_36px] gap-2 items-end p-2.5 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <label className="block text-xs text-gray-500">
                        Ingrediente
                        <select
                          value={line.storeIngredientId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setLines((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, storeIngredientId: id } : row)),
                            );
                          }}
                          className="mt-0.5 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
                        >
                          <option value="">Seleccionar…</option>
                          {storeIngredients.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        {unitRes.source === 'purchase' && unitRes.fromFicha > 0 && unitRes.fromPurchase !== unitRes.fromFicha ? (
                          <span className="mt-1 inline-flex text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                            Última compra {formatMoney(unitRes.fromPurchase)} · ficha {formatMoney(unitRes.fromFicha)}
                          </span>
                        ) : unitRes.source === 'ficha' ? (
                          <span className="mt-1 inline-flex text-[10px] font-semibold text-gray-500">Coste ficha</span>
                        ) : unitRes.source === 'zero' && line.storeIngredientId ? (
                          <span className="mt-1 inline-flex text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            Sin coste
                          </span>
                        ) : null}
                      </label>
                      <label className="block text-xs text-gray-500">
                        Cantidad
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, quantity: e.target.value } : row)),
                            )
                          }
                          className="mt-0.5 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
                        />
                      </label>
                      <label className="block text-xs text-gray-500">
                        Unidad
                        <input
                          type="text"
                          value={line.unit}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, unit: e.target.value } : row)),
                            )
                          }
                          className="mt-0.5 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
                        />
                      </label>
                      <div className="text-xs">
                        <p className="text-gray-500">Coste</p>
                        <p className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatMoney(lineCost)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg justify-self-end"
                        aria-label="Quitar ingrediente"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <label className="block text-sm">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Merma %</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={mermaPct}
                    onChange={(e) => setMermaPct(e.target.value)}
                    className="w-24 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500">% sobre el coste del plato</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Afecta al coste por venta y al descuento de stock (waste) al guardar.
                </p>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-gray-500">
                {costingType === 'recipe' ? 'Coste por venta' : 'Coste'}
              </p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(previewCost)}</p>
              {costingType === 'recipe' && mermaValue > 0 ? (
                <p className="text-[10px] text-gray-500 mt-0.5">con merma {mermaValue}%</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-gray-500">PVP</p>
              <p className="text-lg font-bold tabular-nums">{salePrice > 0 ? formatMoney(salePrice) : '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-gray-500">Food cost</p>
              <p className={`text-lg font-bold tabular-nums ${fc != null && fc > 35 ? 'text-red-600' : fc != null && fc > 25 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {fc != null ? `${fc.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-gray-500">Margen</p>
              <p className="text-lg font-bold tabular-nums">{margin != null ? `${margin.toFixed(1)}%` : '—'}</p>
            </div>
          </div>
        </div>

        <div
          className={
            embedded
              ? 'pt-2 flex flex-wrap gap-2 justify-between'
              : 'shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 justify-between'
          }
        >
          <div>
            {productCostingStatus(product) !== 'none' ? (
              <button
                type="button"
                onClick={() => void removeRecipe()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar receta
              </button>
            ) : null}
          </div>
          <div className="flex gap-2 ml-auto">
            {!embedded ? (
              <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
            ) : null}
            <SaasTabPrimaryButton disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Guardar
            </SaasTabPrimaryButton>
          </div>
        </div>
    </>
  );

  if (embedded) {
    return (
      <section className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-3 space-y-2.5">
        {body}
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

export function EscandalloPanel({
  seedCatalogItems,
  seedStoreIngredients,
  seedBrands,
  onCostingUpdated,
}: {
  seedCatalogItems?: CatalogItem[];
  seedStoreIngredients?: StoreIngredient[];
  seedBrands?: Array<{ _id: string; deliveryLineKind?: string }>;
  /** Tras generar escandallo: refrescar catálogo padre (evita datos obsoletos en seed). */
  onCostingUpdated?: () => void;
} = {}) {
  const { user } = useAuth();
  const { businessId, dataUserId, accountBusinessCount, businessType } = useActiveBusinessScope();
  const hasCatalogSeed = (seedCatalogItems?.length ?? 0) > 0;
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(() => seedCatalogItems ?? []);
  const [stockItems, setStockItems] = useState<CatalogItem[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>(
    () => seedStoreIngredients ?? [],
  );
  const [brands, setBrands] = useState<Array<{ _id: string; deliveryLineKind?: string }>>(
    () => seedBrands ?? [],
  );
  const [loading, setLoading] = useState(!hasCatalogSeed);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** Categorías abiertas. Vacío = todas cerradas al entrar (el usuario abre la que quiera). */
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<CatalogItem | null>(null);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [generatingCosting, setGeneratingCosting] = useState(false);
  const [viewTab, setViewTab] = useState<EscandalloViewTab>('products');
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [historyMovements, setHistoryMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyPreset, setHistoryPreset] = useState<HistoryDatePreset>('30d');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  const historyRange = useMemo(
    () => resolveHistoryDateRange(historyPreset, historyFrom, historyTo),
    [historyPreset, historyFrom, historyTo],
  );

  const historyByDay = useMemo(() => groupMovementsByDay(historyMovements), [historyMovements]);

  const ingredientsById = useMemo(() => storeIngredientsById(storeIngredients), [storeIngredients]);
  const stockByStoreIngredientId = useMemo(
    () => stockItemsByStoreIngredientId(stockItems),
    [stockItems],
  );
  const recipeCostOpts = useMemo(
    () => ({ stockByStoreIngredientId }),
    [stockByStoreIngredientId],
  );

  const ingredientCostRows = useMemo(
    () =>
      buildEscandalloIngredientCostRows(
        storeIngredients,
        stockItems as Array<CatalogItem & { lastPurchasePrice?: number }>,
        brands,
      ),
    [storeIngredients, stockItems, brands],
  );

  const filteredIngredientRows = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return ingredientCostRows;
    return ingredientCostRows.filter(
      (row) =>
        row.name.toLowerCase().includes(q)
        || row.supplierName.toLowerCase().includes(q),
    );
  }, [ingredientCostRows, ingredientSearch]);

  const ingredientKpis = useMemo(() => {
    const linked = ingredientCostRows.filter((r) => r.linkedStock).length;
    const purchase = ingredientCostRows.filter((r) => r.source === 'purchase').length;
    const zero = ingredientCostRows.filter((r) => r.effectiveCost <= 0).length;
    const withSupplier = ingredientCostRows.filter((r) => r.supplierName).length;
    return {
      total: ingredientCostRows.length,
      linked,
      purchase,
      zero,
      withSupplier,
    };
  }, [ingredientCostRows]);

  const loadHistory = useCallback(async () => {
    const uid = dataUserId || user?.id;
    if (!uid) return;
    setHistoryLoading(true);
    try {
      const range = resolveHistoryDateRange(historyPreset, historyFrom, historyTo);
      const movements = await listStockMovementsRequest(uid, {
        movementType: 'purchase_reception',
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        limit: historyPreset === 'all' ? 120 : 300,
      });
      const sorted = [...movements].sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      );
      setHistoryMovements(sorted);
      setHistoryLoaded(true);
    } catch (err) {
      toast.error(stockMovementUserMessage(err, 'No se pudo cargar el histórico de compras'));
    } finally {
      setHistoryLoading(false);
    }
  }, [dataUserId, user?.id, historyPreset, historyFrom, historyTo]);

  useEffect(() => {
    if (viewTab !== 'history') return;
    void loadHistory();
  }, [viewTab, loadHistory]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const uid = dataUserId || user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const brandsPromise = businessId
        ? listBrandsRequest(businessId).catch(() => [])
        : Promise.resolve([]);
      const [items, stockRaw, config, rawBrands] = await Promise.all([
        listCatalogItemsRequest(uid, 'catalog'),
        listCatalogItemsRequest(uid, 'stock').catch(() => [] as CatalogItem[]),
        getDeliveryConfigRequest(uid),
        brandsPromise,
      ]);
      const lineBrands: Brand[] = businessId
        ? sortBrandsForDisplay(commercialLineBrands(rawBrands))
        : [];

      const visibleItems = businessId
        ? filterCatalogItemsForBusinessScope(items, businessId, lineBrands, {
            accountBusinessCount,
            activeBusinessType: businessType,
          })
        : items;

      setBrands(lineBrands);
      setCatalogItems(
        dedupeCatalogItemsForDisplay(visibleItems.filter(isCatalogCostingProduct), businessId),
      );
      setStockItems(filterStockInventoryItems(stockRaw));
      const brandIds = lineBrands.map((b) => b._id);
      const normalized = normalizeStoreIngredients(unifyStoreIngredientsFromConfig(config, brandIds));
      const { items: withDefaults } = applyVertialDefaultsToStoreIngredients(normalized, lineBrands);
      setStoreIngredients(withDefaults);
    } catch (err) {
      // Si ya hay seed en pantalla, no molestar con toast (fallo de refresco en segundo plano).
      if (!silent) {
        const msg = err instanceof Error && err.message.trim()
          ? err.message
          : 'No se pudo cargar el catálogo';
        toast.error(msg);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.id, dataUserId, businessId, accountBusinessCount, businessType]);

  useEffect(() => {
    // DeliveryCatalog ya pasa seed → pintar al instante y refrescar en silencio.
    void load({ silent: hasCatalogSeed });
  }, [load, hasCatalogSeed]);

  // Seed solo para pintar rápido antes del fetch; no sustituye al catálogo del servidor.
  useEffect(() => {
    if (!hasCatalogSeed) return;
    if (seedBrands?.length) setBrands(seedBrands);
    if (seedStoreIngredients?.length) setStoreIngredients(seedStoreIngredients);
  }, [hasCatalogSeed, seedBrands, seedStoreIngredients]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      if (item.category) set.add(item.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [catalogItems]);

  const filteredProducts = useMemo(() => {
    let list = catalogItems;
    if (categoryFilter) list = list.filter((item) => item.category === categoryFilter);
    if (statusFilter !== 'all') {
      list = list.filter((item) => productCostingStatus(item) === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) || String(item.category || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [catalogItems, categoryFilter, statusFilter, search]);

  /** Mismo esquema que el Catálogo: los productos agrupados por categoría y el escandallo dentro de cada uno. */
  const groupedProducts = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of filteredProducts) {
      const cat = String(item.category || '').trim() || 'Sin categoría';
      const arr = map.get(cat) || [];
      arr.push(item);
      map.set(cat, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [filteredProducts]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const kpis = useMemo(() => {
    const fixed = catalogItems.filter((item) => productCostingStatus(item) === 'fixed').length;
    const recipe = catalogItems.filter((item) => productCostingStatus(item) === 'recipe').length;
    const none = catalogItems.length - fixed - recipe;
    const withMerma = catalogItems.filter((item) => readProductMermaPct(item) > 0).length;
    const withPrice = catalogItems.filter((item) => item.unitPrice > 0);
    const foodCosts = withPrice
      .map((item) => {
        const cost = resolveProductUnitCost(item, ingredientsById, brands, undefined, {
          ...recipeCostOpts,
          mermaPct: readProductMermaPct(item),
        });
        return foodCostPercent(cost, item.unitPrice);
      })
      .filter((fc): fc is number => fc != null && Number.isFinite(fc) && fc >= 0 && fc <= 500);
    const avgFc = foodCosts.length > 0 ? foodCosts.reduce((s, v) => s + v, 0) / foodCosts.length : 0;
    const highCostCount = foodCosts.filter((fc) => fc > 35).length;
    let zeroCostLines = 0;
    for (const item of catalogItems) {
      if (productCostingStatus(item) !== 'recipe') continue;
      for (const line of readProductRecipeLines(item)) {
        if (line.stockCategory === 'packaging') continue;
        if (!line.storeIngredientId) continue;
        const ing = ingredientsById.get(line.storeIngredientId);
        if (!ing) continue;
        const stock = stockByStoreIngredientId.get(line.storeIngredientId);
        if (resolveIngredientUnitCost(ing, stock, brands).effective <= 0) zeroCostLines += 1;
      }
    }
    return {
      total: catalogItems.length,
      fixed,
      recipe,
      none,
      withMerma,
      avgFc,
      highCostCount,
      zeroCostLines,
    };
  }, [catalogItems, ingredientsById, brands, recipeCostOpts, stockByStoreIngredientId]);

  const handleSaved = (saved: CatalogItem) => {
    setCatalogItems((prev) => prev.map((item) => (item._id === saved._id ? saved : item)));
    setEditingProduct(null);
  };

  const handleBulkApplied = (saved: CatalogItem[]) => {
    if (saved.length === 0) return;
    const byId = new Map(saved.map((item) => [item._id, item]));
    setCatalogItems((prev) => prev.map((item) => byId.get(item._id) ?? item));
  };

  const handleDownloadEscandalloExcel = useCallback(() => {
    if (catalogItems.length === 0) {
      toast.error('No hay productos para exportar');
      return;
    }
    try {
      const { rows, filename } = downloadEscandalloProductsExcel(
        catalogItems,
        storeIngredients,
        brands,
        stockItems,
      );
      toast.success(`Excel descargado: ${rows} fila(s) · ${filename}`);
    } catch {
      toast.error('No se pudo generar el Excel de escandallo');
    }
  }, [brands, catalogItems, storeIngredients, stockItems]);

  const handleGenerateEscandallos = useCallback(async () => {
    const uid = dataUserId || user?.id;
    if (!uid || !businessId) return;
    setGeneratingCosting(true);
    try {
      const automation = await syncFullStockAutomationAfterCatalogImport(uid, businessId);
      const { costing } = automation;
      if (costing.updated <= 0) {
        toast.message(
          'No se pudo inferir escandallo automático. Revisa la pestaña Ingredientes o configura cada producto a mano.',
        );
      } else {
        toast.success(
          `Escandallo generado: ${costing.recipe} con receta, ${costing.fixed} con coste fijo${costing.failed ? ` · ${costing.failed} error(es)` : ''}`,
        );
      }
      await load({ silent: true });
      onCostingUpdated?.();
    } catch {
      toast.error('No se pudo generar el escandallo automático');
    } finally {
      setGeneratingCosting(false);
    }
  }, [businessId, dataUserId, load, onCostingUpdated, user?.id]);

  if (!isDeliveryOpsBusinessType(businessType) && !isRestaurantBusinessType(businessType)) {
    const escandalloCopy = getRetailOpsUiCopy(businessType);
    return (
      <SaasTabEmpty
        title="Escandallo no disponible"
        description={escandalloCopy.escandalloUnavailable}
      />
    );
  }

  return (
    <>
      <CatalogTabShell
        stats={
          viewTab === 'ingredients'
            ? [
                { label: 'ingredientes', value: ingredientKpis.total },
                { label: 'con almacén', value: ingredientKpis.linked, tone: 'emerald' },
                { label: 'última compra', value: ingredientKpis.purchase, tone: 'emerald' },
                { label: 'con proveedor', value: ingredientKpis.withSupplier },
                {
                  label: 'sin coste',
                  value: ingredientKpis.zero,
                  tone: ingredientKpis.zero > 0 ? 'amber' : 'default',
                },
              ]
            : viewTab === 'history'
              ? [
                  { label: 'entradas', value: historyMovements.length },
                  { label: 'periodo', value: historyRange.label },
                ]
            : [
                { label: 'productos', value: kpis.total },
                { label: 'con escandallo', value: kpis.recipe, tone: 'emerald' },
                { label: 'coste fijo', value: kpis.fixed },
                { label: 'sin configurar', value: kpis.none, tone: kpis.none > 0 ? 'amber' : 'default' },
                { label: 'con merma', value: kpis.withMerma },
                {
                  label: 'food cost medio',
                  value: kpis.avgFc > 0 ? `${kpis.avgFc.toFixed(1)}%` : '—',
                },
                { label: 'FC >35%', value: kpis.highCostCount, tone: kpis.highCostCount > 0 ? 'red' : 'default' },
              ]
        }
        toolbarLeftExtra={
          viewTab === 'products' ? (
          <>
                <SaasTabSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar producto…"
                  className="relative w-full sm:w-52"
                />
                {categories.length > 0 ? (
                  <select
                    className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 outline-none"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">Todas las categorías</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="all">Todos</option>
                  <option value="recipe">Con escandallo</option>
                  <option value="fixed">Coste fijo</option>
                  <option value="none">Sin configurar</option>
                </select>
              </>
          ) : viewTab === 'ingredients' ? (
            <SaasTabSearch
              value={ingredientSearch}
              onChange={setIngredientSearch}
              placeholder="Buscar ingrediente o proveedor…"
              className="relative w-full sm:w-64"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 outline-none"
                value={historyPreset}
                onChange={(e) => setHistoryPreset(e.target.value as HistoryDatePreset)}
                aria-label="Periodo del histórico"
              >
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="month">Este mes</option>
                <option value="all">Todo</option>
                <option value="custom">Fechas…</option>
              </select>
              {historyPreset === 'custom' ? (
                <>
                  <input
                    type="date"
                    value={historyFrom}
                    onChange={(e) => setHistoryFrom(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900"
                    aria-label="Desde"
                  />
                  <span className="text-xs text-gray-400">→</span>
                  <input
                    type="date"
                    value={historyTo}
                    onChange={(e) => setHistoryTo(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900"
                    aria-label="Hasta"
                  />
                </>
              ) : null}
              <SaasTabSecondaryButton disabled={historyLoading} onClick={() => void loadHistory()}>
                {historyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Actualizar
              </SaasTabSecondaryButton>
            </div>
          )
        }
        toolbarRight={
          viewTab === 'products' ? (
          <>
            <EscandalloActionsMenu
                canGenerate={kpis.none > 0}
                generating={generatingCosting}
                canDownload={catalogItems.length > 0}
                canCategoryCosts={categories.length > 0}
                categoryCostsOpen={showCategoryPanel}
                onGenerate={() => void handleGenerateEscandallos()}
                onDownload={handleDownloadEscandalloExcel}
                onToggleCategoryCosts={() => setShowCategoryPanel((open) => !open)}
              />
          </>
          ) : null
        }
        toolbarBelow={
          <div
            className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200 bg-stone-100/80 p-1 dark:border-stone-700 dark:bg-stone-900/60"
            role="tablist"
            aria-label="Vistas de escandallo"
          >
            {(
              [
                { id: 'products' as const, label: 'Productos', count: kpis.total },
                { id: 'ingredients' as const, label: 'Ingredientes', count: ingredientKpis.total },
                { id: 'history' as const, label: 'Histórico', count: historyLoaded ? historyMovements.length : null },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={viewTab === tab.id}
                onClick={() => {
                  setViewTab(tab.id);
                  if (tab.id !== 'products') setShowCategoryPanel(false);
                }}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors ${
                  viewTab === tab.id
                    ? 'bg-[var(--v-blue,#2563eb)] text-white shadow-sm'
                    : 'bg-white text-stone-700 hover:bg-blue-50/60 dark:bg-stone-800 dark:text-stone-200'
                }`}
              >
                {tab.label}
                {tab.count != null ? (
                  <span
                    className={`rounded px-1.5 py-px text-[10px] font-bold tabular-nums ${
                      viewTab === tab.id
                        ? 'bg-white/25 text-white'
                        : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        }
      >
        <div
          className={
            viewTab === 'products' && showCategoryPanel && user?.id
              ? 'grid grid-cols-1 lg:grid-cols-[1fr_minmax(260px,30%)] lg:min-h-[min(72vh,680px)] divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-700'
              : undefined
          }
        >
          <div className="min-w-0">
        {loading ? (
          <CatalogCoreLoadingState kind="escandallo" compact />
        ) : viewTab === 'ingredients' ? (
          filteredIngredientRows.length === 0 ? (
            <SaasTabEmpty
              icon={<Package className="w-10 h-10" />}
              title={ingredientCostRows.length === 0 ? 'Sin ingredientes' : 'Sin resultados'}
              description={
                ingredientCostRows.length === 0
                  ? 'Crea ingredientes en Catálogo → Ingredientes (o importa Excel). Aquí verás coste de ficha, última compra y proveedor.'
                  : 'Prueba con otra búsqueda.'
              }
            />
          ) : (
            <div className="p-3 space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Coste que usa el escandallo de productos. Si hay última compra en almacén, manda esa.
              </p>
              <div className="hidden md:grid grid-cols-[1fr_90px_100px_100px_1fr_70px] gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <span>Ingrediente</span>
                <span className="text-right">Ficha</span>
                <span className="text-right">Últ. compra</span>
                <span className="text-right">Efectivo</span>
                <span>Proveedor</span>
                <span className="text-right">Stock</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
                {filteredIngredientRows.map((row) => (
                  <div
                    key={row.ingredientId}
                    className="grid grid-cols-1 md:grid-cols-[1fr_90px_100px_100px_1fr_70px] gap-1 md:gap-2 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{row.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {row.unit}
                        {!row.linkedStock ? ' · sin enlace a almacén' : ''}
                      </div>
                    </div>
                    <div className="text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {row.fichaCost > 0 ? formatMoneyEs(row.fichaCost) : '—'}
                    </div>
                    <div className="text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {row.purchaseCost > 0 ? formatMoneyEs(row.purchaseCost) : '—'}
                    </div>
                    <div className="text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {row.effectiveCost > 0 ? formatMoneyEs(row.effectiveCost) : '—'}
                      {row.source === 'purchase' ? (
                        <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Últ. compra</div>
                      ) : null}
                    </div>
                    <div className="text-gray-700 dark:text-gray-300 truncate">
                      {row.supplierName || '—'}
                    </div>
                    <div className="text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {row.stockQty != null ? row.stockQty : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : viewTab === 'history' ? (
          historyLoading && historyMovements.length === 0 ? (
            <CatalogCoreLoadingState kind="escandallo" compact />
          ) : historyMovements.length === 0 ? (
            <SaasTabEmpty
              icon={<History className="w-10 h-10" />}
              title="Sin compras en este periodo"
              description={`No hay entradas de compra (${historyRange.label}). Prueba otro rango o recibe un albarán: ahí queda el precio.`}
            />
          ) : (
            <div className="p-3 space-y-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Compras al almacén por fecha ({historyRange.label}). Así ves si el proveedor subió el precio.
              </p>
              {historyByDay.map(({ day, items }) => (
                <section
                  key={day}
                  className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-100 tabular-nums">{day}</span>
                    <span className="text-[10px] font-semibold uppercase text-gray-400 tabular-nums">
                      {items.length} entrada{items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="hidden md:grid grid-cols-[90px_1fr_80px_100px_1fr] gap-2 px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    <span>Hora</span>
                    <span>Artículo</span>
                    <span className="text-right">Cant.</span>
                    <span className="text-right">€ / ud</span>
                    <span>Nota</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map((m) => {
                      const time = formatDateTimeEs(m.createdAt).split(', ')[1] || '';
                      return (
                        <div
                          key={m._id}
                          className="grid grid-cols-1 md:grid-cols-[90px_1fr_80px_100px_1fr] gap-1 md:gap-2 px-3 py-2.5 text-sm"
                        >
                          <div className="text-gray-500 dark:text-gray-400 tabular-nums text-xs md:text-sm">
                            {time || '—'}
                          </div>
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {m.catalogItemName || 'Artículo'}
                          </div>
                          <div className="text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {m.quantity}
                          </div>
                          <div className="text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                            {Number(m.unitCost) > 0 ? formatMoneyEs(m.unitCost) : '—'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {m.notes || m.referenceType || '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : filteredProducts.length === 0 ? (
          <SaasTabEmpty
            icon={<Calculator className="w-10 h-10" />}
            title={catalogItems.length === 0 ? 'Sin productos en catálogo' : 'Sin resultados'}
            description={
              catalogItems.length === 0
                ? 'Añade productos en la pestaña Catálogo para configurar escandallos.'
                : 'Prueba con otro filtro o búsqueda.'
            }
          />
        ) : (
          <div className="p-3 space-y-3">
            {kpis.none > 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-xl px-3 py-2.5">
                <strong>{kpis.none} producto{kpis.none === 1 ? '' : 's'} sin coste.</strong> El escandallo no se crea solo al
                añadir productos al catálogo: hay que generarlo (botón «Generar escandallos»), usar ingredientes en la ficha del
                producto o configurarlo producto a producto. Abre cada categoría para ver el detalle.
              </p>
            ) : null}
            {kpis.zeroCostLines > 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-xl px-3 py-2.5">
                <strong>{kpis.zeroCostLines} línea{kpis.zeroCostLines === 1 ? '' : 's'} a coste 0.</strong> Revisa
                el coste de ficha o la última compra en Almacén → Ingredientes / Inventario.
              </p>
            ) : null}
            {groupedProducts.map(([category, products]) => {
              const isCollapsed = !expandedCategories.has(category);
              const pendingCount = products.filter((p) => productCostingStatus(p) === 'none').length;
              return (
            <section
              key={category}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                aria-expanded={!isCollapsed}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors border-b border-gray-100 dark:border-gray-700"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{category}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{products.length}</span>
                {pendingCount > 0 ? (
                  <span className="ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    {pendingCount} sin escandallo
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Completo
                  </span>
                )}
              </button>

              {!isCollapsed && (
            <>
            <div className="hidden md:grid grid-cols-[1fr_100px_64px_90px_90px_80px_90px_36px] gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <span>Producto</span>
              <span>Tipo</span>
              <span className="text-right">Merma</span>
              <span className="text-right">Coste/venta</span>
              <span className="text-right">PVP</span>
              <span className="text-right">Margen %</span>
              <span className="text-right">Food cost</span>
              <span />
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((product) => {
                const status = productCostingStatus(product);
                const mermaPct = readProductMermaPct(product);
                const unitCost = resolveProductUnitCost(product, ingredientsById, brands, undefined, {
                  ...recipeCostOpts,
                  mermaPct,
                });
                const salePrice = Number(product.unitPrice) || 0;
                const fc = foodCostPercent(unitCost, salePrice);
                const margin = marginPercent(unitCost, salePrice);
                const marginTone = escandalloMarginTone(unitCost, salePrice);
                const recipeLines = readProductRecipeLines(product);
                const isExpanded = expandedId === product._id;

                return (
                  <div key={product._id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : product._id)}
                      className="w-full px-4 py-3 flex items-center md:grid md:grid-cols-[1fr_100px_64px_90px_90px_80px_90px_36px] gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0 md:flex-none">
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{product.name}</h3>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                          {product.category || '—'}
                          {mermaPct > 0 ? ` · Merma ${mermaPct}%` : ''}
                        </p>
                      </div>
                      <div className="hidden md:block">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </div>
                      <div className="hidden md:block text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                        {mermaPct > 0 ? `${mermaPct}%` : '—'}
                      </div>
                      <div className="hidden md:block text-right text-sm font-semibold tabular-nums">
                        {status === 'none' ? '—' : formatMoney(unitCost)}
                      </div>
                      <div className="hidden md:block text-right text-sm font-semibold tabular-nums">
                        {salePrice > 0 ? formatMoney(salePrice) : '—'}
                      </div>
                      <div className="hidden md:block text-right text-sm font-semibold tabular-nums">
                        {margin != null ? (
                          <span
                            className={
                              marginTone === 'negative'
                                ? 'text-red-600'
                                : marginTone === 'warn'
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }
                          >
                            {formatEscandalloMargin(unitCost, salePrice)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </div>
                      <div className="hidden md:block text-right">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            fc != null && fc > 35
                              ? 'text-red-600'
                              : fc != null && fc > 25
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                          }`}
                        >
                          {formatEscandalloFoodCost(unitCost, salePrice)}
                        </span>
                      </div>
                      <div className="hidden md:flex justify-end">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="px-4 pb-4 bg-gray-50/60 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800">
                        <div className="pt-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-2 md:hidden">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusClass(status)}`}>
                              {statusLabel(status)}
                            </span>
                            <span className="text-xs text-gray-500">
                              Coste por venta {status === 'none' ? '—' : formatMoney(unitCost)} · PVP{' '}
                              {salePrice > 0 ? formatMoney(salePrice) : '—'}
                              {mermaPct > 0 ? ` · Merma ${mermaPct}%` : ''}
                            </span>
                          </div>

                          {status === 'recipe' && recipeLines.length > 0 ? (
                            <>
                              <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-400">
                                <span>
                                  Coste por venta: <strong className="tabular-nums">{formatMoney(unitCost)}</strong>
                                </span>
                                {mermaPct > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-semibold">
                                    Merma {mermaPct}%
                                  </span>
                                ) : null}
                              </div>
                              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-white dark:bg-gray-900 text-gray-500">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-semibold">Ingrediente</th>
                                    <th className="text-right px-3 py-2 font-semibold">Cant.</th>
                                    <th className="text-right px-3 py-2 font-semibold">Coste/u.</th>
                                    <th className="text-right px-3 py-2 font-semibold">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recipeLines.map((line, lineIdx) => {
                                    const ing = line.storeIngredientId
                                      ? ingredientsById.get(line.storeIngredientId)
                                      : undefined;
                                    const stock = line.storeIngredientId
                                      ? stockByStoreIngredientId.get(line.storeIngredientId)
                                      : undefined;
                                    const unitRes = ing
                                      ? resolveIngredientUnitCost(ing, stock, brands)
                                      : { effective: 0, source: 'zero' as const };
                                    const unit = unitRes.effective;
                                    const total = unit * line.quantity;
                                    return (
                                      <tr
                                        key={`${line.storeIngredientId || line.name}-${lineIdx}`}
                                        className="border-t border-gray-100 dark:border-gray-800"
                                      >
                                        <td className="px-3 py-2">
                                          {line.name}
                                          {unitRes.source === 'purchase' ? (
                                            <span className="ml-1.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                                              Última compra
                                            </span>
                                          ) : unitRes.source === 'ficha' ? (
                                            <span className="ml-1.5 text-[10px] font-semibold text-gray-400">Ficha</span>
                                          ) : null}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                          {line.quantity} {line.unit}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(unit)}</td>
                                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(total)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            </>
                          ) : status === 'fixed' ? (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Coste fijo: <strong>{formatMoney(unitCost)}</strong>
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">
                              Sin escandallo. Pulsa «Configurar coste» o usa «Generar escandallos» arriba para crearlo
                              automáticamente desde Ingredientes.
                            </p>
                          )}

                          <SaasTabSecondaryButton onClick={() => setEditingProduct(product)}>
                            <Edit3 className="w-3.5 h-3.5" />
                            {status === 'none' ? 'Configurar coste' : 'Editar'}
                          </SaasTabSecondaryButton>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            </>
              )}
            </section>
              );
            })}
          </div>
        )}
          </div>

          {viewTab === 'products' && showCategoryPanel && user?.id ? (
            <aside className="lg:max-h-[min(72vh,680px)] lg:overflow-hidden flex flex-col min-h-[280px] lg:min-h-0">
              <CategoryBulkCostingPanel
                catalogItems={catalogItems}
                userId={user.id}
                onApplied={handleBulkApplied}
                onClose={() => setShowCategoryPanel(false)}
              />
            </aside>
          ) : null}
        </div>
      </CatalogTabShell>

      {editingProduct ? (
        <ProductCostingModal
          product={editingProduct}
          storeIngredients={storeIngredients}
          brands={brands}
          stockItems={stockItems}
          onClose={() => setEditingProduct(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
