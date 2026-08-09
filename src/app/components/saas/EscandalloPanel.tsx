import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
  SaasTabToolbarRow,
  SaasTabWorkspace,
} from './SaasTabWorkspace';
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
import { repairVertialFoodEscandallo } from '../../lib/deliveryCatalogImport';
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
  formatEscandalloFoodCost,
  formatEscandalloMargin,
  escandalloMarginTone,
  isCatalogCostingProduct,
  marginPercent,
  productCostingStatus,
  readProductCostingType,
  readProductRecipeLines,
  resolveProductUnitCost,
  resolveStoreIngredientBaseCost,
  storeIngredientsById,
  withProductCosting,
  type ProductCostingType,
  type ProductRecipeLine,
} from '../../lib/catalogCosting';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  Layers,
  Loader2,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { CategoryBulkCostingPanel } from './CategoryBulkCostingPanel';

type StatusFilter = 'all' | 'fixed' | 'recipe' | 'none';

type RecipeLineDraft = {
  storeIngredientId: string;
  quantity: string;
  unit: string;
};

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

export function ProductCostingModal({
  product,
  storeIngredients,
  brands,
  onClose,
  onSaved,
  embedded = false,
}: {
  product: CatalogItem;
  storeIngredients: StoreIngredient[];
  brands: Array<{ _id: string; deliveryLineKind?: string }>;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
  /** Dentro de otra ficha: sin overlay ni segundo modal. */
  embedded?: boolean;
}) {
  useModalClose(!embedded, onClose);
  const ingredientsById = useMemo(() => storeIngredientsById(storeIngredients), [storeIngredients]);
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
  const [lines, setLines] = useState<RecipeLineDraft[]>(() =>
    readProductRecipeLines(product).map((line) => ({
      storeIngredientId: line.storeIngredientId,
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

  const previewCost =
    costingType === 'fixed'
      ? parseDecimalInput(fixedCost) ?? 0
      : calculateRecipeTotalCost(recipeLines, ingredientsById, brands);

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
          ? { costingType: 'fixed', fixedCost: parseDecimalInput(fixedCost) ?? 0 }
          : { costingType: 'recipe', recipeLines },
        ingredientsById,
        brands,
      );
      const saved = await updateCatalogItemRequest(product.user_id, next);
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
                  const lineCost = (ing ? resolveStoreIngredientBaseCost(ing, brands) : 0) * qty;
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
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[10px] uppercase font-bold text-gray-500">Coste</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(previewCost)}</p>
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

export function EscandalloPanel() {
  const { user } = useAuth();
  const { businessId, dataUserId, accountBusinessCount, businessType } = useActiveBusinessScope();
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [brands, setBrands] = useState<Array<{ _id: string; deliveryLineKind?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<CatalogItem | null>(null);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [regeneratingEscandallo, setRegeneratingEscandallo] = useState(false);

  const ingredientsById = useMemo(() => storeIngredientsById(storeIngredients), [storeIngredients]);

  const load = useCallback(async () => {
    const uid = dataUserId || user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [items, config] = await Promise.all([
        listCatalogItemsRequest(uid),
        getDeliveryConfigRequest(uid),
      ]);
      const lineBrands: Brand[] = businessId
        ? sortBrandsForDisplay(
            commercialLineBrands(await listBrandsRequest(businessId).catch(() => [])),
          )
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
      const brandIds = lineBrands.map((b) => b._id);
      const normalized = normalizeStoreIngredients(unifyStoreIngredientsFromConfig(config, brandIds));
      const { items: withDefaults } = applyVertialDefaultsToStoreIngredients(normalized, lineBrands);
      setStoreIngredients(withDefaults);
    } catch {
      toast.error('No se pudo cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, [user?.id, dataUserId, businessId, accountBusinessCount, businessType]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setCollapsedCategories((prev) => {
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
    const withPrice = catalogItems.filter((item) => item.unitPrice > 0);
    const foodCosts = withPrice
      .map((item) => {
        const cost = resolveProductUnitCost(item, ingredientsById, brands);
        return foodCostPercent(cost, item.unitPrice);
      })
      .filter((fc): fc is number => fc != null && Number.isFinite(fc) && fc >= 0 && fc <= 120);
    const avgFc = foodCosts.length > 0 ? foodCosts.reduce((s, v) => s + v, 0) / foodCosts.length : 0;
    const highCostCount = foodCosts.filter((fc) => fc > 35).length;
    return { total: catalogItems.length, fixed, recipe, none, avgFc, highCostCount };
  }, [catalogItems, ingredientsById, brands]);

  const handleSaved = (saved: CatalogItem) => {
    setCatalogItems((prev) => prev.map((item) => (item._id === saved._id ? saved : item)));
    setEditingProduct(null);
  };

  const handleBulkApplied = (saved: CatalogItem[]) => {
    if (saved.length === 0) return;
    const byId = new Map(saved.map((item) => [item._id, item]));
    setCatalogItems((prev) => prev.map((item) => byId.get(item._id) ?? item));
  };

  const handleRegenerateAllEscandallo = useCallback(async () => {
    const uid = dataUserId || user?.id;
    if (!uid || !businessId || regeneratingEscandallo) return;
    setRegeneratingEscandallo(true);
    try {
      const result = await repairVertialFoodEscandallo(uid, businessId, { allMenuProducts: true });
      await load();
      toast.success(
        `Escandallos Vertial: ${result.updated} actualizado(s) · ${result.recipe} receta · ${result.fixed} coste fijo`,
        { duration: 9000 },
      );
    } catch {
      toast.error('No se pudieron generar los escandallos');
    } finally {
      setRegeneratingEscandallo(false);
    }
  }, [businessId, dataUserId, load, regeneratingEscandallo, user?.id]);

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
      <SaasTabWorkspace
        stats={[
          { label: 'productos', value: kpis.total },
          { label: 'con escandallo', value: kpis.recipe, tone: 'emerald' },
          { label: 'coste fijo', value: kpis.fixed },
          { label: 'sin configurar', value: kpis.none, tone: kpis.none > 0 ? 'amber' : 'default' },
          {
            label: 'food cost medio',
            value: kpis.avgFc > 0 ? `${kpis.avgFc.toFixed(1)}%` : '—',
          },
          { label: 'FC >35%', value: kpis.highCostCount, tone: kpis.highCostCount > 0 ? 'red' : 'default' },
        ]}
        toolbar={
          <SaasTabToolbarRow
            left={
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
            }
            right={
              <>
                {catalogItems.length > 0 ? (
                  <SaasTabSecondaryButton
                    disabled={regeneratingEscandallo}
                    onClick={() => void handleRegenerateAllEscandallo()}
                  >
                    {regeneratingEscandallo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Calculator className="w-3.5 h-3.5" />
                    )}
                    Generar escandallos (todas las marcas)
                  </SaasTabSecondaryButton>
                ) : null}
                {categories.length > 0 ? (
                  <SaasTabSecondaryButton
                    onClick={() => setShowCategoryPanel((open) => !open)}
                    className={showCategoryPanel ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300' : ''}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Costes por categoría
                  </SaasTabSecondaryButton>
                ) : null}
              </>
            }
          />
        }
      >
        <div
          className={
            showCategoryPanel && user?.id
              ? 'grid grid-cols-1 lg:grid-cols-[1fr_minmax(260px,30%)] lg:min-h-[min(72vh,680px)] divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-700'
              : undefined
          }
        >
          <div className="min-w-0">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando…
          </div>
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
            {groupedProducts.map(([category, products]) => {
              const isCollapsed = collapsedCategories.has(category);
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
                    {pendingCount} sin coste
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Completo
                  </span>
                )}
              </button>

              {!isCollapsed && (
            <>
            <div className="hidden md:grid grid-cols-[1fr_110px_90px_90px_80px_90px_36px] gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <span>Producto</span>
              <span>Tipo</span>
              <span className="text-right">Coste</span>
              <span className="text-right">PVP</span>
              <span className="text-right">Margen %</span>
              <span className="text-right">Food cost</span>
              <span />
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((product) => {
                const status = productCostingStatus(product);
                const unitCost = resolveProductUnitCost(product, ingredientsById, brands);
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
                      className="w-full px-4 py-3 flex items-center md:grid md:grid-cols-[1fr_110px_90px_90px_80px_90px_36px] gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0 md:flex-none">
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{product.name}</h3>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{product.category || '—'}</p>
                      </div>
                      <div className="hidden md:block">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${statusClass(status)}`}>
                          {statusLabel(status)}
                        </span>
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
                              Coste {status === 'none' ? '—' : formatMoney(unitCost)} · PVP{' '}
                              {salePrice > 0 ? formatMoney(salePrice) : '—'}
                            </span>
                          </div>

                          {status === 'recipe' && recipeLines.length > 0 ? (
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
                                    const unit = ing ? resolveStoreIngredientBaseCost(ing, brands) : 0;
                                    const total = unit * line.quantity;
                                    return (
                                      <tr
                                        key={`${line.storeIngredientId || line.name}-${lineIdx}`}
                                        className="border-t border-gray-100 dark:border-gray-800"
                                      >
                                        <td className="px-3 py-2">{line.name}</td>
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
                          ) : status === 'fixed' ? (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Coste fijo: <strong>{formatMoney(unitCost)}</strong>
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">Este producto aún no tiene coste configurado.</p>
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

          {showCategoryPanel && user?.id ? (
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
      </SaasTabWorkspace>

      {editingProduct ? (
        <ProductCostingModal
          product={editingProduct}
          storeIngredients={storeIngredients}
          brands={brands}
          onClose={() => setEditingProduct(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
