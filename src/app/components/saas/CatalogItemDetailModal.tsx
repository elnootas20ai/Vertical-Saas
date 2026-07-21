import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
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
} from '../../lib/catalogCustomization';
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
  onClose: () => void;
  onSave: (payload: CatalogItemDetailSavePayload) => Promise<void>;
};

function formatMoney(n: number): string {
  return `${n.toFixed(2)}€`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-0.5">{value}</p>
      {sub ? <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function CatalogItemDetailModal({
  item,
  brands,
  catalogItems,
  stats,
  statsLoading,
  onClose,
  onSave,
}: CatalogItemDetailModalProps) {
  useModalClose(true, onClose);

  const tpvConfigurable = isCatalogTpvConfigurable(item, brands);
  const showComboBuilder =
    item.itemType === 'combo' || /combo/i.test(String(item.category || ''));

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
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <img
              src={productImage}
              alt=""
              className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Ficha de producto — edita aquí
              </p>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{nameDraft || item.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                {item.category ? (
                  <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-medium">
                    {item.category}
                  </span>
                ) : null}
                {brandLabel ? (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {brandLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
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

          <section className="flex justify-center">
            <div className="w-full max-w-xs aspect-square rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shadow-sm">
              <img src={productImage} alt={nameDraft || item.name} className="w-full h-full object-cover" />
            </div>
          </section>

          {tpvConfigurable && (
            <section className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-4">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Configuración TPV</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Pon o quita ingredientes aquí. Los extras de pago (+) están en la pestaña{' '}
                    <strong>Ingredientes TPV</strong> del catálogo.
                  </p>
                </div>
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
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Ventas</h3>
              {statsLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : null}
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
    </div>,
    document.body,
  );
}
