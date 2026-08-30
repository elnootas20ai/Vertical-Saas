import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Calculator,
  Loader2,
  Minus,
  Plus,
  Tag,
  UtensilsCrossed,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import type { Brand } from '../../lib/brandsApi';
import type { CatalogComboRef, CatalogItem } from '../../lib/deliveryApi';
import { updateCatalogItemRequest } from '../../lib/deliveryApi';
import {
  isCatalogTpvConfigurable,
  mergeComboProductIngredients,
  parseCatalogFichaIngredientNames,
  readStoreIngredientTpvFlags,
  resolveIngredientExtraPrice,
  resolveStoreIngredientBrandIds,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
import { StoreIngredientsPanel } from './StoreIngredientsPanel';
import {
  foodCostPercent,
  isCatalogCostingProduct,
  marginPercent,
  productCostingStatus,
  readProductMermaPct,
  readProductRecipeLines,
  resolveProductUnitCost,
  stockItemsByStoreIngredientId,
  storeIngredientsById,
  withProductCosting,
  type ProductRecipeLine,
} from '../../lib/catalogCosting';
import { resolveBocataIngredientQuantity } from '../../lib/barEscandalloPresets';
import { formatQtyEs } from '../../lib/formatNumberEs';
import { CatalogUnitChip } from './CatalogUnitChip';
import { ProductCostingModal } from './EscandalloPanel';
import type { CatalogItemSalesStats } from '../../lib/catalogItemSalesStats';
import { resolveCatalogProductImage } from '../../lib/catalogProductPlaceholders';
import { useModalClose } from '../../hooks/useModalClose';
import { CatalogComboCompositionEditor } from './CatalogComboCompositionEditor';
import {
  comboStructureFromCustomFields,
  isComboStructureConfirmed,
  type ComboStructureSlot,
} from '../../lib/catalogComboSlots';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type DetailTab = 'datos' | 'menu' | 'ingredientes' | 'escandallo' | 'ventas';

const DETAIL_TABS: Array<{
  id: DetailTab;
  label: string;
  hint: string;
  Icon: typeof Tag;
}> = [
  { id: 'datos', label: 'Precio y datos', hint: 'Nombre, PVP y coste', Icon: Tag },
  { id: 'ventas', label: 'Resultados', hint: 'Control del producto', Icon: BarChart3 },
  { id: 'ingredientes', label: 'Ingredientes', hint: 'Quitar / extras TPV', Icon: Zap },
  { id: 'menu', label: 'Menú / combo', hint: 'Armar o editar combo', Icon: UtensilsCrossed },
  { id: 'escandallo', label: 'Escandallo', hint: 'Receta y food cost', Icon: Calculator },
];

const CHART_BLUE = '#2563EB';
const CHART_TEAL = '#14B8A6';
const CHART_GREEN = '#22C55E';
const CHART_AMBER = '#D97706';
const CHART_RED = '#E11D48';
const CHART_MUTED = '#94A3B8';
const PIE_PALETTE = [CHART_BLUE, CHART_TEAL, CHART_GREEN, CHART_AMBER, CHART_MUTED];

export type CatalogItemDetailSavePayload = {
  name: string;
  unitPrice: number;
  costPrice: number;
  active: boolean;
  ingredients: string;
  comboItems: CatalogComboRef[];
  comboStructure?: ComboStructureSlot[];
  comboStructureConfirmed?: boolean;
};

type CatalogItemDetailModalProps = {
  item: CatalogItem;
  brands: Brand[];
  catalogItems: CatalogItem[];
  stats: CatalogItemSalesStats;
  statsLoading?: boolean;
  /** Ingredientes de tienda: habilita la sección de escandallo dentro de la ficha. */
  storeIngredients?: StoreIngredient[];
  /** Artículos de almacén para coste efectiva (última compra). */
  stockItems?: CatalogItem[];
  /** Para abrir el gestor de ingredientes de la tienda desde la ficha. */
  dataUserId?: string;
  businessId?: string;
  /** Producto normal → abre el flujo de crear combo partiendo de este artículo. */
  onArmCombo?: () => void;
  onCostingSaved?: (saved: CatalogItem) => void;
  onClose: () => void;
  onSave: (payload: CatalogItemDetailSavePayload) => Promise<void>;
};

function formatMoney(n: number): string {
  return `${n.toFixed(2)}€`;
}

function formatEsDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function formatEsNumber(n: number, digits = 0): string {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function foldIngredientChipKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function quantityForIngredientChip(
  name: string,
  productName: string,
  recipeLines: ProductRecipeLine[],
): { quantity: number; unit: string } | null {
  const foldedName = foldIngredientChipKey(name);
  const productFold = foldIngredientChipKey(productName);
  const fromRecipe = recipeLines.find((line) => {
    const ln = foldIngredientChipKey(line.name);
    if (!ln || ln === productFold) return false;
    return ln === foldedName || ln.includes(foldedName) || foldedName.includes(ln);
  });
  if (fromRecipe && Number(fromRecipe.quantity) > 0) {
    return { quantity: Number(fromRecipe.quantity), unit: fromRecipe.unit || 'ud' };
  }
  return resolveBocataIngredientQuantity(name);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <p className="font-semibold text-stone-800 dark:text-stone-100">{label || String(row.name || '')}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="tabular-nums text-stone-600 dark:text-stone-300">
          <span style={{ color: p.color }}>{p.name}</span>: {formatEsNumber(Number(p.value || 0), p.name === 'Ingresos' || p.name === '€' ? 2 : 0)}
          {p.name === 'Ingresos' || p.name === '€' ? '€' : p.name === 'Unidades' || p.name === 'ud' ? ' ud' : ''}
        </p>
      ))}
      {typeof row.profit === 'number' ? (
        <p className="mt-0.5 tabular-nums text-stone-500">Beneficio ~ {formatMoney(Number(row.profit))}</p>
      ) : null}
    </div>
  );
}

function RankBars({
  title,
  tone,
  rows,
  empty,
}: {
  title: string;
  tone: 'green' | 'red';
  rows: Array<{ label: string; count: number }>;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const bar = tone === 'green' ? 'bg-emerald-500' : 'bg-[var(--destructive,#E11D48)]';
  const text = tone === 'green' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300';
  return (
    <div>
      <p className={`text-xs font-bold mb-2 ${text}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-stone-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="mb-0.5 flex justify-between gap-2 text-[11px]">
                <span className="truncate font-medium text-stone-700 dark:text-stone-200">
                  {tone === 'green' ? '+ ' : 'sin '}
                  {row.label}
                </span>
                <span className="tabular-nums text-stone-500">{row.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CatalogItemDetailModal({
  item,
  brands,
  catalogItems,
  stats,
  statsLoading,
  storeIngredients,
  stockItems,
  dataUserId,
  businessId,
  onArmCombo,
  onCostingSaved,
  onClose,
  onSave,
}: CatalogItemDetailModalProps) {
  useModalClose(true, onClose);

  const [showIngredientsManager, setShowIngredientsManager] = useState(false);
  const costingEnabled = Array.isArray(storeIngredients) && isCatalogCostingProduct(item);
  const ingredientsById = useMemo(
    () => storeIngredientsById(storeIngredients || []),
    [storeIngredients],
  );
  const stockByStoreIngredientId = useMemo(
    () => stockItemsByStoreIngredientId(stockItems || []),
    [stockItems],
  );
  const costingStatus = productCostingStatus(item);
  const costingUnitCost = costingEnabled
    ? resolveProductUnitCost(item, ingredientsById, brands, undefined, {
        stockByStoreIngredientId,
        mermaPct: readProductMermaPct(item),
      })
    : 0;
  const costingRecipeLines = useMemo(() => readProductRecipeLines(item), [item]);

  const tpvConfigurable = isCatalogTpvConfigurable(item, brands);
  const showComboBuilder =
    item.itemType === 'combo' || /combo/i.test(String(item.category || ''));

  /** Extras de pago de la tienda aplicables a la(s) marca(s) de este producto. */
  const applicableExtras = useMemo(() => {
    const all = (storeIngredients || []).filter(
      (ing) => readStoreIngredientTpvFlags(ing).chargeExtra,
    );
    const productBrandIds = Array.isArray(item.brandIds) ? item.brandIds.filter(Boolean) : [];
    if (productBrandIds.length === 0) return all;
    const allBrandIds = brands.map((b) => b._id);
    return all.filter((ing) => {
      const ingBrands = resolveStoreIngredientBrandIds(ing, allBrandIds);
      if (ingBrands.length === 0) return true;
      return ingBrands.some((id) => productBrandIds.includes(id));
    });
  }, [storeIngredients, item.brandIds, brands]);

  const brandLabel = useMemo(() => {
    const ids = Array.isArray(item.brandIds) ? item.brandIds : [];
    return ids
      .map((id) => brands.find((b) => b._id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }, [item.brandIds, brands]);

  const productImage = useMemo(() => resolveCatalogProductImage(item), [item]);

  const [nameDraft, setNameDraft] = useState(item.name);
  const [unitPriceDraft, setUnitPriceDraft] = useState(String(item.unitPrice ?? ''));
  const [costPriceDraft, setCostPriceDraft] = useState(String(item.costPrice ?? ''));
  const [activeDraft, setActiveDraft] = useState(item.active !== false);
  const [ingredientDraft, setIngredientDraft] = useState('');
  const [newIngredient, setNewIngredient] = useState('');
  const [comboItems, setComboItems] = useState<CatalogComboRef[]>([]);
  const [comboStructure, setComboStructure] = useState<ComboStructureSlot[]>(() =>
    comboStructureFromCustomFields(item.customFields, item.comboItems?.length ?? 0),
  );
  const [comboStructureConfirmed, setComboStructureConfirmed] = useState(() =>
    isComboStructureConfirmed(item.customFields, item.comboItems?.length ?? 0),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('datos');

  const hydrateFromItem = (next: CatalogItem) => {
    const raw =
      typeof next.customFields?.ingredients === 'string' ? next.customFields.ingredients : '';
    setNameDraft(next.name);
    setUnitPriceDraft(String(next.unitPrice ?? ''));
    setCostPriceDraft(String(next.costPrice ?? ''));
    setActiveDraft(next.active !== false);
    setIngredientDraft(raw);
    setComboItems(Array.isArray(next.comboItems) ? [...next.comboItems] : []);
    setComboStructure(comboStructureFromCustomFields(next.customFields, next.comboItems?.length ?? 0));
    setComboStructureConfirmed(isComboStructureConfirmed(next.customFields, next.comboItems?.length ?? 0));
    setNewIngredient('');
  };

  useEffect(() => {
    hydrateFromItem(item);
    setDirty(false);
    setActiveTab('datos');
    // Solo al abrir otro producto: si no, Guardar se apaga y te echa a «Precio y datos».
    // eslint-disable-next-line react-hooks/exhaustive-deps -- item._id
  }, [item._id]);

  useEffect(() => {
    if (dirty) return;
    hydrateFromItem(item);
  }, [
    dirty,
    item.name,
    item.unitPrice,
    item.costPrice,
    item.active,
    item.customFields?.ingredients,
  ]);

  const ingredientList = useMemo(
    () => parseCatalogFichaIngredientNames(ingredientDraft),
    [ingredientDraft],
  );

  const markDirty = () => setDirty(true);

  const addIngredient = () => {
    const name = newIngredient.trim();
    if (!name) return;
    const next = [...ingredientList];
    if (!next.some((n) => n.toLowerCase() === name.toLowerCase())) next.push(name);
    setIngredientDraft(next.join(', '));
    setNewIngredient('');
    markDirty();
  };

  const removeIngredient = (name: string) => {
    setIngredientDraft(ingredientList.filter((n) => n !== name).join(', '));
    setQtyEditorFor((prev) => (prev === name ? null : prev));
    markDirty();
  };

  /** Chip abierto para sumar/restar cantidad (p. ej. más huevos). */
  const [qtyEditorFor, setQtyEditorFor] = useState<string | null>(null);
  const [qtySaving, setQtySaving] = useState(false);

  const findRecipeLineForChip = (chipName: string): ProductRecipeLine | null => {
    const foldedChip = foldIngredientChipKey(chipName);
    const productFold = foldIngredientChipKey(item.name);
    return (
      costingRecipeLines.find((line) => {
        const ln = foldIngredientChipKey(line.name);
        if (!ln || ln === productFold) return false;
        return ln === foldedChip || ln.includes(foldedChip) || foldedChip.includes(ln);
      }) ?? null
    );
  };

  const findStoreIngredientForChip = (chipName: string): StoreIngredient | null => {
    const folded = foldIngredientChipKey(chipName);
    const list = storeIngredients || [];
    return (
      list.find((ing) => foldIngredientChipKey(ing.name) === folded) ??
      list.find((ing) => {
        const f = foldIngredientChipKey(ing.name);
        return Boolean(f) && (f.includes(folded) || folded.includes(f));
      }) ??
      null
    );
  };

  const changeIngredientQty = async (chipName: string, delta: 1 | -1) => {
    if (qtySaving) return;
    const lines = readProductRecipeLines(item).map((l) => ({ ...l }));
    const foldedChip = foldIngredientChipKey(chipName);
    const productFold = foldIngredientChipKey(item.name);
    let line = lines.find((l) => {
      const ln = foldIngredientChipKey(l.name);
      if (!ln || ln === productFold) return false;
      return ln === foldedChip || ln.includes(foldedChip) || foldedChip.includes(ln);
    });

    if (!line) {
      if (costingStatus === 'fixed') {
        toast.error('Este producto usa coste fijo. Edita la receta en la pestaña Escandallo.');
        return;
      }
      const ing = findStoreIngredientForChip(chipName);
      if (!ing) {
        toast.error(
          `«${chipName}» no está en Catálogo → Ingredientes. Créalo ahí (o en Gestionar ingredientes) para poder poner cantidad.`,
        );
        return;
      }
      line = {
        storeIngredientId: ing.id,
        name: ing.name,
        quantity: 0,
        unit: ing.unit || 'ud',
        stockCategory: 'ingredient',
      };
      lines.push(line);
    }

    const unitLower = String(line.unit || 'ud').toLowerCase();
    const step = unitLower === 'kg' || unitLower === 'l' || unitLower === 'lt' ? 0.01 : 1;
    const next = Math.round((Number(line.quantity || 0) + delta * step) * 1000) / 1000;
    line.quantity = Math.max(step, next);

    setQtySaving(true);
    try {
      const nextItem = withProductCosting(
        item,
        { costingType: 'recipe', recipeLines: lines },
        ingredientsById,
        brands,
      );
      const saved = await updateCatalogItemRequest(item.user_id, nextItem);
      onCostingSaved?.(saved);
    } catch {
      toast.error('No se pudo guardar la cantidad');
    } finally {
      setQtySaving(false);
    }
  };

  const importIngredientsFromCombo = () => {
    const merged = mergeComboProductIngredients(comboItems, catalogItems);
    if (merged.length === 0) {
      toast.error('Los productos del combo no tienen ingredientes en su ficha');
      return;
    }
    setIngredientDraft(merged.join(', '));
    markDirty();
    toast.success(`${merged.length} ingrediente(s) importados desde el combo`);
  };

  const handleSave = async () => {
    const name = nameDraft.trim();
    if (!name) {
      toast.error('El nombre no puede estar vacío');
      return;
    }
    const unitPrice = Number(unitPriceDraft);
    const costPrice = Number(costPriceDraft);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error('Precio de venta no válido');
      return;
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      toast.error('Coste no válido');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name,
        unitPrice,
        costPrice,
        active: activeDraft,
        ingredients: ingredientDraft.trim(),
        comboItems,
        comboStructure,
        comboStructureConfirmed,
      });
      setDirty(false);
      toast.success('Ficha guardada');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl h-[min(92vh,860px)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <img
              src={productImage}
              alt=""
              className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
            />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{nameDraft || item.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {item.category ? (
                  <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:text-blue-300 font-semibold">
                    {item.category}
                  </span>
                ) : null}
                {brandLabel ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-medium">
                    <Tag className="w-3 h-3" />
                    {brandLabel}
                  </span>
                ) : null}
                <span
                  className={`px-2 py-0.5 rounded-lg font-semibold ${
                    activeDraft
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {activeDraft ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Secciones de la ficha"
          className="shrink-0 px-3 sm:px-5 pb-3 border-t border-gray-200 dark:border-gray-700 bg-stone-50/80 dark:bg-stone-950/40"
        >
          <p className="pt-2.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Elige sección · toca para cambiar
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {DETAIL_TABS.map(({ id, label, hint, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(id)}
                  className={`min-h-[4.25rem] px-2.5 py-2.5 rounded-xl border-2 text-left touch-manipulation transition-colors active:scale-[0.98] ${
                    active
                      ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40 shadow-sm'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[var(--v-blue,#2563eb)]' : 'text-stone-400'
                      }`}
                    />
                    <span
                      className={`text-xs sm:text-sm font-bold truncate ${
                        active
                          ? 'text-[var(--v-blue,#2563eb)]'
                          : 'text-stone-800 dark:text-stone-100'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  <p
                    className={`text-[10px] sm:text-[11px] mt-1 leading-snug line-clamp-2 ${
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          <div className={activeTab === 'datos' ? 'block space-y-4' : 'hidden'}>
          <section className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Precio y datos</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Precio venta (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPriceDraft}
                  onChange={(e) => {
                    setUnitPriceDraft(e.target.value);
                    markDirty();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Coste (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPriceDraft}
                  onChange={(e) => {
                    setCostPriceDraft(e.target.value);
                    markDirty();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm tabular-nums text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={activeDraft}
                onChange={(e) => {
                  setActiveDraft(e.target.checked);
                  markDirty();
                }}
                className="rounded"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Producto activo en catálogo / TPV
              </span>
            </label>
          </section>
          </div>

          <div className={activeTab === 'menu' ? 'block space-y-4' : 'hidden'}>
            {showComboBuilder ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-[var(--v-blue,#2563eb)] shrink-0" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Composición del combo</h3>
                </div>
                <CatalogComboCompositionEditor
                  comboItems={comboItems}
                  catalogItems={catalogItems}
                  excludeItemId={item._id}
                  comboStructure={comboStructure}
                  structureConfirmed={comboStructureConfirmed}
                  onStructureChange={(next) => {
                    setComboStructure(next);
                    markDirty();
                  }}
                  onStructureConfirmedChange={(confirmed) => {
                    setComboStructureConfirmed(confirmed);
                    markDirty();
                  }}
                  onChange={(next) => {
                    setComboItems(next);
                    markDirty();
                  }}
                  onImportIngredients={importIngredientsFromCombo}
                />
              </section>
            ) : (
              <section className="flex flex-col items-center justify-center gap-4 py-10 px-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40">
                  <UtensilsCrossed className="w-6 h-6 text-[var(--v-blue,#2563eb)]" />
                </div>
                <button
                  type="button"
                  onClick={() => onArmCombo?.()}
                  disabled={!onArmCombo}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold disabled:opacity-40 ${VERTIAL_BTN_PRIMARY}`}
                >
                  <Plus className="w-4 h-4" />
                  Armar combo con este producto
                </button>
              </section>
            )}
          </div>

          <div className={activeTab === 'ingredientes' ? 'block space-y-4' : 'hidden'}>
            <section className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Ingredientes TPV</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {tpvConfigurable
                        ? 'Lista de la ficha: el cliente podrá quitarlos en el TPV. La regla 1 quitado = 1 extra gratis está en Catálogo → Menú.'
                        : 'Ingredientes de este producto (informativo para el equipo y la carta).'}
                    </p>
                  </div>
                </div>
                {dataUserId && businessId ? (
                  <button
                    type="button"
                    onClick={() => setShowIngredientsManager(true)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 transition-colors"
                    title="Extras de pago, costes y qué se puede quitar: para toda la tienda"
                  >
                    Gestionar ingredientes
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Ingredientes (quitar en TPV)
                </p>
                {ingredientList.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {ingredientList.map((name) => {
                      const qty = quantityForIngredientChip(name, item.name, costingRecipeLines);
                      const editing = qtyEditorFor === name;
                      return (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-semibold border-2 bg-white dark:bg-gray-800 transition-colors ${
                          editing
                            ? 'border-emerald-400 dark:border-emerald-700'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setQtyEditorFor((prev) => (prev === name ? null : name))}
                          className="inline-flex items-center gap-1.5"
                          title="Cambiar cantidad"
                        >
                          <span>{name}</span>
                          {qty ? (
                            <>
                              <span className="tabular-nums font-bold text-gray-700 dark:text-gray-200">
                                {formatQtyEs(qty.quantity, 3)}
                              </span>
                              <CatalogUnitChip unit={qty.unit} size="sm" />
                            </>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeIngredient(name)}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-colors"
                          title={`Quitar «${name}»`}
                          aria-label={`Quitar «${name}»`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                    Sin ingredientes — el TPV no mostrará opciones para quitar.
                  </p>
                )}
                {qtyEditorFor && ingredientList.includes(qtyEditorFor) ? (() => {
                  const line = findRecipeLineForChip(qtyEditorFor);
                  const qty = quantityForIngredientChip(qtyEditorFor, item.name, costingRecipeLines);
                  return (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-white dark:bg-gray-800 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                          {qtyEditorFor}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {line
                            ? 'Cantidad en la receta (escandallo y stock)'
                            : 'Aún sin cantidad en la receta — usa + para añadirla'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={qtySaving || !line}
                          onClick={() => void changeIngredientQty(qtyEditorFor, -1)}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                          aria-label="Menos"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="min-w-[64px] text-center text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {qtySaving ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : qty ? (
                            <>
                              {formatQtyEs(qty.quantity, 3)} {qty.unit}
                            </>
                          ) : (
                            '—'
                          )}
                        </span>
                        <button
                          type="button"
                          disabled={qtySaving}
                          onClick={() => void changeIngredientQty(qtyEditorFor, 1)}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                          aria-label="Más"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQtyEditorFor(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Cerrar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })() : null}
                <div className="flex gap-2">
                  <input
                    value={newIngredient}
                    onChange={(e) => setNewIngredient(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addIngredient();
                      }
                    }}
                    placeholder="Ej: Mozzarella, Tomate…"
                    className="flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    title="Añadir"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={ingredientDraft}
                  onChange={(e) => {
                    setIngredientDraft(e.target.value);
                    markDirty();
                  }}
                  placeholder="Tomate, Mozzarella, Albahaca (separados por comas)"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm resize-none"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-emerald-200/80 dark:border-emerald-900/40">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Extras de pago disponibles ({applicableExtras.length})
                </p>
                {applicableExtras.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {applicableExtras.map((ing) => {
                      const price = resolveIngredientExtraPrice(
                        ing,
                        Array.isArray(item.brandIds) ? item.brandIds : [],
                      );
                      return (
                        <span
                          key={ing.id}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-300 dark:border-amber-800 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                        >
                          + {ing.name}
                          {price > 0 ? ` · ${formatMoney(price)}` : ''}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Sin extras de pago para la marca de este producto.
                  </p>
                )}
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Los extras y su precio son de toda la marca: se cambian en Catálogo → Ingredientes o con «Gestionar ingredientes».
                </p>
              </div>
            </section>
          </div>

          <div className={activeTab === 'escandallo' ? 'block space-y-4' : 'hidden'}>
            {costingEnabled ? (
              <ProductCostingModal
                key={`costing-${item._id}-${costingStatus}-${item.costPrice}-${costingRecipeLines.length}`}
                product={item}
                storeIngredients={storeIngredients || []}
                brands={brands}
                stockItems={stockItems || []}
                embedded
                onClose={() => undefined}
                onSaved={(saved) => onCostingSaved?.(saved)}
              />
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center">
                <Calculator className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Escandallo no disponible</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                  Este producto no tiene escandallo automático, o la tienda aún no tiene ingredientes de coste.
                </p>
              </div>
            )}
          </div>

          <div className={activeTab === 'ventas' ? 'block space-y-5' : 'hidden'}>
          <section className="space-y-5">
            {(() => {
              const pvp = unitPriceDraft !== '' && Number.isFinite(Number(unitPriceDraft))
                ? Number(unitPriceDraft)
                : Number(item.unitPrice) || 0;
              const cost = costingEnabled && costingStatus !== 'none'
                ? costingUnitCost
                : Number(costPriceDraft) || 0;
              const margin = marginPercent(cost, pvp);
              const fc = foodCostPercent(cost, pvp);
              const profitPerUnit = Math.round((pvp - cost) * 100) / 100;
              const profitTotal = Math.round(profitPerUnit * stats.totalUnits * 100) / 100;
              const profitToday = Math.round(profitPerUnit * stats.todayUnits * 100) / 100;
              const profitWeek = Math.round(profitPerUnit * stats.weekUnits * 100) / 100;
              const profitMonth = Math.round(profitPerUnit * stats.monthUnits * 100) / 100;
              const stockQty = Number(item.stockQuantity || 0);
              const minStock = Number(item.minStock || 0);
              const lowStock = minStock > 0 && stockQty <= minStock;
              const coverDays =
                stats.avgDailyUnits7d > 0
                  ? Math.round((stockQty / stats.avgDailyUnits7d) * 10) / 10
                  : null;
              const customRate =
                stats.orderCount > 0
                  ? Math.round((stats.customizedOrderCount / stats.orderCount) * 1000) / 10
                  : null;
              const fcTone =
                fc == null
                  ? CHART_MUTED
                  : fc > 35
                    ? CHART_RED
                    : fc > 25
                      ? CHART_AMBER
                      : CHART_GREEN;

              const periodData = [
                { name: 'Hoy', units: stats.todayUnits, revenue: stats.todayRevenue, profit: profitToday },
                { name: '7 días', units: stats.weekUnits, revenue: stats.weekRevenue, profit: profitWeek },
                { name: 'Mes', units: stats.monthUnits, revenue: stats.monthRevenue, profit: profitMonth },
              ];

              const mixSource = stats.byOrderType.length > 0 ? stats.byOrderType : stats.byChannel;
              const mixTitle = stats.byOrderType.length > 0 ? 'Tipo de pedido' : 'Canal';
              const mixData = mixSource.slice(0, 5).map((row) => ({
                name: row.label,
                value: row.units,
                revenue: row.revenue,
              }));
              const hasMix = mixData.some((d) => d.value > 0);

              const economyData = [
                { name: 'Coste', value: Math.max(0, cost), fill: CHART_MUTED },
                { name: 'Beneficio', value: Math.max(0, profitPerUnit), fill: CHART_BLUE },
              ];

              return (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200/80 dark:border-stone-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Resultados</h3>
                        {statsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" /> : null}
                      </div>
                      <p className="text-[11px] text-stone-500">
                        {[item.category, brandLabel].filter(Boolean).join(' · ') || 'Producto de carta'}
                        {stats.lastSoldAt ? ` · última venta ${formatEsDateTime(stats.lastSoldAt)}` : ''}
                        {lowStock ? ' · stock bajo' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-stone-900 dark:text-stone-50">
                        {formatMoney(stats.totalRevenue)}
                      </p>
                      <p className="text-xs text-stone-500 tabular-nums">
                        {stats.totalUnits} ud · {stats.orderCount} pedido{stats.orderCount !== 1 ? 's' : ''}
                        {profitTotal !== 0 ? ` · ~${formatMoney(profitTotal)} ben.` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 sm:gap-8">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">PVP</p>
                      <p className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100">{formatMoney(pvp)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Margen</p>
                      <p className="text-lg font-bold tabular-nums text-[var(--v-blue,#2563eb)]">
                        {margin != null ? `${margin.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Food cost</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: fcTone }}>
                        {fc != null ? `${fc.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <p className="text-xs font-bold text-stone-800 dark:text-stone-200">Ventas por periodo</p>
                      <p className="text-[10px] text-stone-400">unidades · ingresos en tooltip</p>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#a8a29e' }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="units" name="Unidades" fill={CHART_BLUE} radius={[8, 8, 0, 0]} barSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-stone-400 px-1">
                      {periodData.map((p) => (
                        <span key={p.name}>{formatMoney(p.revenue)}</span>
                      ))}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mb-2">
                        Mix · {mixTitle}
                      </p>
                      {hasMix ? (
                        <div className="h-40 relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={mixData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={42}
                                outerRadius={68}
                                paddingAngle={2}
                                stroke="none"
                              >
                                {mixData.map((entry, i) => (
                                  <Cell key={entry.name} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, name: string) => [`${value} ud`, name]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <p className="text-lg font-extrabold tabular-nums text-stone-900 dark:text-stone-100">
                              {mixData.reduce((sum, d) => sum + d.value, 0)}
                            </p>
                            <p className="text-[10px] text-stone-400">ud</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-stone-400 py-10 text-center">Sin desglose todavía</p>
                      )}
                      {hasMix ? (
                        <ul className="mt-1 space-y-1">
                          {mixData.map((d, i) => (
                            <li key={d.name} className="flex items-center gap-2 text-[11px] text-stone-600 dark:text-stone-300">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
                              />
                              <span className="truncate flex-1">{d.name}</span>
                              <span className="tabular-nums text-stone-400">{d.value}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div>
                      <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mb-2">
                        Economía por unidad
                      </p>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={economyData}
                            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                          >
                            <XAxis type="number" hide />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={64}
                              tick={{ fontSize: 11, fill: '#78716c' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip formatter={(v: number) => formatMoney(Number(v))} />
                            <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22}>
                              {economyData.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[11px] text-stone-500 text-center -mt-1">
                        PVP {formatMoney(pvp)} = coste + beneficio/ud
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6 pt-1 border-t border-stone-200/80 dark:border-stone-800">
                    <RankBars
                      title="Extras más pedidos"
                      tone="green"
                      rows={stats.topExtras}
                      empty="Sin extras registrados"
                    />
                    <RankBars
                      title="Más quitados"
                      tone="red"
                      rows={stats.topRemoved}
                      empty="Sin quitados registrados"
                    />
                  </div>

                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Stock {formatEsNumber(stockQty)} {item.unit || 'ud'}
                    {minStock > 0 ? ` · mín. ${formatEsNumber(minStock)}` : ''}
                    {coverDays != null ? ` · cobertura ~${formatEsNumber(coverDays, 1)} días` : ''}
                    {customRate != null
                      ? ` · personalizado ${formatEsNumber(customRate, 1)}% (+${stats.extrasHits}/−${stats.removedHits})`
                      : ''}
                    {item.supplierName ? ` · ${item.supplierName}` : ''}
                  </p>
                </>
              );
            })()}
          </section>
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2.5 text-sm font-semibold ${VERTIAL_BTN_SECONDARY}`}
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className={`px-5 py-2.5 text-sm font-bold disabled:opacity-40 ${VERTIAL_BTN_PRIMARY}`}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {showIngredientsManager && dataUserId && businessId ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={(e) => {
            e.stopPropagation();
            setShowIngredientsManager(false);
          }}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Ingredientes de la tienda</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Extras de pago, costes y qué puede quitar el cliente. Aplica a todos los productos de la marca.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIngredientsManager(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <StoreIngredientsPanel userId={dataUserId} businessId={businessId} />
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
