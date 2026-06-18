import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Edit3,
  Loader2,
  Package,
  Plus,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Brand } from '../../lib/brandsApi';
import type { CatalogItem } from '../../lib/deliveryApi';
import {
  isCustomizableCatalogItem,
  parseIngredientsBulkText,
} from '../../lib/catalogCustomization';
import type { CatalogItemSalesStats } from '../../lib/catalogItemSalesStats';
import { useModalClose } from '../../hooks/useModalClose';

type CatalogItemDetailModalProps = {
  item: CatalogItem;
  brands: Brand[];
  stats: CatalogItemSalesStats;
  statsLoading?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSaveIngredients: (ingredients: string) => Promise<void>;
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
  stats,
  statsLoading,
  onClose,
  onEdit,
  onSaveIngredients,
}: CatalogItemDetailModalProps) {
  useModalClose(true, onClose);

  const customizable = isCustomizableCatalogItem(item, brands);
  const brandLabel = useMemo(() => {
    const ids = Array.isArray(item.brandIds) ? item.brandIds : [];
    const names = ids
      .map((id) => brands.find((b) => b._id === id)?.name)
      .filter(Boolean);
    return names.join(', ');
  }, [item.brandIds, brands]);

  const [ingredientDraft, setIngredientDraft] = useState('');
  const [newIngredient, setNewIngredient] = useState('');
  const [savingIngredients, setSavingIngredients] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const raw =
      typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '';
    setIngredientDraft(raw);
    setNewIngredient('');
    setDirty(false);
  }, [item._id, item.customFields?.ingredients]);

  const ingredientList = useMemo(() => parseIngredientsBulkText(ingredientDraft), [ingredientDraft]);

  const addIngredient = () => {
    const name = newIngredient.trim();
    if (!name) return;
    const next = [...ingredientList];
    if (!next.some((n) => n.toLowerCase() === name.toLowerCase())) next.push(name);
    setIngredientDraft(next.join(', '));
    setNewIngredient('');
    setDirty(true);
  };

  const removeIngredient = (name: string) => {
    const next = ingredientList.filter((n) => n !== name);
    setIngredientDraft(next.join(', '));
    setDirty(true);
  };

  const handleSaveIngredients = async () => {
    setSavingIngredients(true);
    try {
      await onSaveIngredients(ingredientDraft.trim());
      setDirty(false);
      toast.success('Ingredientes guardados');
    } catch {
      toast.error('No se pudieron guardar los ingredientes');
    } finally {
      setSavingIngredients(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            {item.image ? (
              <img src={item.image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                <Package className="w-6 h-6 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Ficha de producto
              </p>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{item.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                {item.category ? (
                  <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 font-medium">{item.category}</span>
                ) : null}
                {brandLabel ? (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {brandLabel}
                  </span>
                ) : null}
                <span className="font-bold text-gray-900 dark:text-gray-100">{item.unitPrice.toFixed(2)}€</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
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

          {customizable && (
            <section className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                Ingredientes de esta pizza
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Solo los de este producto. En el TPV el cliente podrá quitarlos. Los extras de pago se configuran en
                Ingredientes TPV (lista global).
              </p>

              {ingredientList.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3">
                  {ingredientList.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => removeIngredient(name)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Quitar de la lista"
                    >
                      {name} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                  Sin ingredientes definidos. Añádelos aquí o impórtalos en el Excel (columna «ingredientes»).
                </p>
              )}

              <div className="flex gap-2 mb-3">
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
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <textarea
                rows={2}
                value={ingredientDraft}
                onChange={(e) => {
                  setIngredientDraft(e.target.value);
                  setDirty(true);
                }}
                placeholder="Tomate, Mozzarella, Albahaca (separados por comas)"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm resize-none mb-3"
              />

              {parseIngredientsBulkText(ingredientDraft).length > 0 && (
                <p className="text-xs text-gray-500 mb-3">
                  {parseIngredientsBulkText(ingredientDraft).length} ingrediente(s) en TPV para quitar
                </p>
              )}

              <button
                type="button"
                disabled={!dirty || savingIngredients}
                onClick={() => void handleSaveIngredients()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold"
              >
                {savingIngredients ? 'Guardando…' : 'Guardar ingredientes'}
              </button>
            </section>
          )}
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
            onClick={onEdit}
            className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white text-sm font-bold inline-flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Editar producto
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
