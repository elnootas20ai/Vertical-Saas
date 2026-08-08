import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Calculator,
  Loader2,
  Plus,
  Tag,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Brand } from '../../lib/brandsApi';
import type { CatalogComboRef, CatalogItem } from '../../lib/deliveryApi';
import {
  isCatalogTpvConfigurable,
  mergeComboProductIngredients,
  parseIngredientsBulkText,
  readStoreIngredientTpvFlags,
  resolveStoreIngredientBrandIds,
  type StoreIngredient,
} from '../../lib/catalogCustomization';
import { StoreIngredientsPanel } from './StoreIngredientsPanel';
import {
  foodCostPercent,
  isCatalogCostingProduct,
  marginPercent,
  productCostingStatus,
  readProductRecipeLines,
  resolveProductUnitCost,
  resolveStoreIngredientBaseCost,
  storeIngredientsById,
} from '../../lib/catalogCosting';
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
  /** Para abrir el gestor de ingredientes de la tienda desde la ficha. */
  dataUserId?: string;
  businessId?: string;
  onCostingSaved?: (saved: CatalogItem) => void;
  onClose: () => void;
  onSave: (payload: CatalogItemDetailSavePayload) => Promise<void>;
};

function formatMoney(n: number): string {
  return `${n.toFixed(2)}€`;
}

function StatCard({
  label,
  value,
  sub,
  compact,
}: {
  label: string;
  value: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p
        className={`font-bold text-gray-900 dark:text-gray-100 tabular-nums ${
          compact ? 'text-sm' : 'text-lg mt-0.5'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p> : null}
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
  dataUserId,
  businessId,
  onCostingSaved,
  onClose,
  onSave,
}: CatalogItemDetailModalProps) {
  useModalClose(true, onClose);

  const [showCosting, setShowCosting] = useState(false);
  const [showRecipeLines, setShowRecipeLines] = useState(false);
  const [showIngredientsManager, setShowIngredientsManager] = useState(false);
  const costingEnabled = Array.isArray(storeIngredients) && isCatalogCostingProduct(item);
  const ingredientsById = useMemo(
    () => storeIngredientsById(storeIngredients || []),
    [storeIngredients],
  );
  const costingStatus = productCostingStatus(item);
  const costingUnitCost = costingEnabled ? resolveProductUnitCost(item, ingredientsById, brands) : 0;
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

  useEffect(() => {
    const raw =
      typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '';
    setNameDraft(item.name);
    setUnitPriceDraft(String(item.unitPrice ?? ''));
    setCostPriceDraft(String(item.costPrice ?? ''));
    setActiveDraft(item.active !== false);
    setIngredientDraft(raw);
    setComboItems(Array.isArray(item.comboItems) ? [...item.comboItems] : []);
    setComboStructure(comboStructureFromCustomFields(item.customFields, item.comboItems?.length ?? 0));
    setComboStructureConfirmed(isComboStructureConfirmed(item.customFields, item.comboItems?.length ?? 0));
    setNewIngredient('');
    setDirty(false);
  }, [item._id, item.name, item.unitPrice, item.costPrice, item.active, item.customFields?.ingredients, item.comboItems]);

  const ingredientList = useMemo(() => parseIngredientsBulkText(ingredientDraft), [ingredientDraft]);

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
    markDirty();
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
    } catch {
      toast.error('No se pudo guardar');
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
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 border-t border-gray-200 dark:border-gray-700">
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

          <section className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Ingredientes y configuración TPV</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {tpvConfigurable
                        ? 'Pon o quita ingredientes de este producto. El cliente podrá quitarlos en el TPV.'
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
                    {ingredientList.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => removeIngredient(name)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-red-300"
                        title="Quitar"
                      >
                        {name} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                    Sin ingredientes — el TPV no mostrará opciones para quitar.
                  </p>
                )}
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

              {showComboBuilder && (
                <div className="space-y-3 pt-2 border-t border-emerald-200/80 dark:border-emerald-900/40">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Composición del menú / combo
                  </p>
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
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-emerald-200/80 dark:border-emerald-900/40">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Extras de pago disponibles ({applicableExtras.length})
                </p>
                {applicableExtras.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {applicableExtras.map((ing) => (
                      <span
                        key={ing.id}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-300 dark:border-amber-800 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                      >
                        + {ing.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Sin extras de pago para la marca de este producto.
                  </p>
                )}
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Los extras y su precio son de toda la marca: se cambian con «Gestionar ingredientes».
                </p>
              </div>
            </section>

          {costingEnabled && (
            <section className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Calculator className="w-4 h-4 text-[var(--v-blue,#2563eb)] shrink-0" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Escandallo</h3>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${
                      costingStatus === 'recipe'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : costingStatus === 'fixed'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    {costingStatus === 'recipe' ? 'Receta' : costingStatus === 'fixed' ? 'Coste fijo' : 'Sin configurar'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {costingStatus === 'recipe' && costingRecipeLines.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowRecipeLines((v) => !v)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      {showRecipeLines ? 'Ocultar receta' : `Receta (${costingRecipeLines.length})`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowCosting(true)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 text-[var(--v-blue,#2563eb)] hover:bg-blue-50/60 dark:hover:bg-blue-950/20 transition-colors"
                  >
                    {costingStatus === 'none' ? 'Configurar' : 'Editar'}
                  </button>
                </div>
              </div>

              {costingStatus === 'none' ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sin coste configurado: no se puede calcular el margen real de este producto. El resumen de abajo usa el coste manual.
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Coste, margen y food cost se muestran abajo, en el resumen de resultados.
                </p>
              )}

              {showRecipeLines && costingStatus === 'recipe' && costingRecipeLines.length > 0 ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Ingrediente</th>
                        <th className="text-right px-3 py-2 font-semibold">Cant.</th>
                        <th className="text-right px-3 py-2 font-semibold">Coste/u.</th>
                        <th className="text-right px-3 py-2 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costingRecipeLines.map((line, lineIdx) => {
                        const ing = line.storeIngredientId
                          ? ingredientsById.get(line.storeIngredientId)
                          : undefined;
                        const unit = ing ? resolveStoreIngredientBaseCost(ing, brands) : 0;
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
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {formatMoney(unit * line.quantity)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Resultados y ventas</h3>
              {statsLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : null}
            </div>
            <div className="mb-3 grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-200/80 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 overflow-hidden">
              {(() => {
                const pvp = unitPriceDraft !== '' && Number.isFinite(Number(unitPriceDraft))
                  ? Number(unitPriceDraft)
                  : Number(item.unitPrice) || 0;
                const cost = costingEnabled && costingStatus !== 'none'
                  ? costingUnitCost
                  : Number(costPriceDraft) || 0;
                const margin = marginPercent(cost, pvp);
                const fc = foodCostPercent(cost, pvp);
                const fcTone = fc == null
                  ? 'text-gray-900 dark:text-gray-100'
                  : fc > 35
                    ? 'text-red-600 dark:text-red-400'
                    : fc > 25
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';
                const cells: { label: string; value: string; tone?: string; sub?: string }[] = [
                  { label: 'PVP', value: formatMoney(pvp) },
                  { label: 'Coste', value: formatMoney(cost), sub: costingStatus === 'recipe' ? 'receta' : costingStatus === 'fixed' ? 'fijo' : undefined },
                  { label: 'Margen', value: margin != null ? `${margin.toFixed(1)}%` : '—' },
                  { label: 'Food cost', value: fc != null ? `${fc.toFixed(1)}%` : '—', tone: fcTone },
                  { label: 'Vendido', value: `${stats.totalUnits} ud`, sub: formatMoney(stats.totalRevenue) },
                  { label: 'Hoy', value: `${stats.todayUnits} ud`, sub: formatMoney(stats.todayRevenue) },
                ];
                return cells.map((c) => (
                  <div key={c.label} className="px-3 py-2 text-center min-w-0">
                    <p className={`text-sm font-bold tabular-nums truncate ${c.tone ?? 'text-gray-900 dark:text-gray-100'}`}>
                      {c.value}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">
                      {c.label}
                      {c.sub ? ` · ${c.sub}` : ''}
                    </p>
                  </div>
                ));
              })()}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatCard
                label="Total vendido"
                value={`${stats.totalUnits} ud`}
                sub={`${formatMoney(stats.totalRevenue)} · ${stats.orderCount} pedido${stats.orderCount !== 1 ? 's' : ''}`}
              />
              <StatCard label="Hoy" value={`${stats.todayUnits} ud`} sub={formatMoney(stats.todayRevenue)} />
              <StatCard label="7 días" value={`${stats.weekUnits} ud`} sub={formatMoney(stats.weekRevenue)} />
              <StatCard label="Mes" value={`${stats.monthUnits} ud`} sub={formatMoney(stats.monthRevenue)} />
              <StatCard
                label="Ticket medio"
                value={stats.orderCount > 0 ? formatMoney(stats.totalRevenue / stats.orderCount) : '—'}
                sub="por pedido con este producto"
              />
            </div>
            {(stats.topExtras.length > 0 || stats.topRemoved.length > 0) && (
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {stats.topExtras.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 mb-2">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Extras más pedidos
                    </p>
                    <ul className="space-y-1 text-xs text-emerald-900 dark:text-emerald-200">
                      {stats.topExtras.map((row) => (
                        <li key={row.label} className="flex justify-between gap-2">
                          <span className="truncate">+ {row.label}</span>
                          <span className="font-bold tabular-nums shrink-0">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {stats.topRemoved.length > 0 && (
                  <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3">
                    <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-2">Ingredientes más quitados</p>
                    <ul className="space-y-1 text-xs text-red-900 dark:text-red-200">
                      {stats.topRemoved.map((row) => (
                        <li key={row.label} className="flex justify-between gap-2">
                          <span className="truncate">sin {row.label}</span>
                          <span className="font-bold tabular-nums shrink-0">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {showCosting && costingEnabled ? (
        <div onClick={(e) => e.stopPropagation()}>
          <ProductCostingModal
            product={item}
            storeIngredients={storeIngredients || []}
            brands={brands}
            onClose={() => setShowCosting(false)}
            onSaved={(saved) => onCostingSaved?.(saved)}
          />
        </div>
      ) : null}

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
