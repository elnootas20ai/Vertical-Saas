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
import { useModalClose } from '../../hooks/useModalClose';
import { CatalogComboCompositionEditor } from './CatalogComboCompositionEditor';
import { comboStructureFromCustomFields, isComboStructureConfirmed, type ComboStructureSlot } from '../../lib/catalogComboSlots';

type CatalogItemDetailModalProps = {
  item: CatalogItem;
  brands: Brand[];
  catalogItems: CatalogItem[];
  stats: CatalogItemSalesStats;
  statsLoading?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSaveTpvConfig: (payload: {
    ingredients: string;
    comboItems: CatalogComboRef[];
    comboStructure?: ComboStructureSlot[];
    comboStructureConfirmed?: boolean;
  }) => Promise<void>;
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
  onEdit,
  onSaveTpvConfig,
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
  const [tpvTab, setTpvTab] = useState<'ingredients' | 'combo'>('ingredients');

  useEffect(() => {
    const raw =
      typeof item.customFields?.ingredients === 'string' ? item.customFields.ingredients : '';
    setIngredientDraft(raw);
    setComboItems(Array.isArray(item.comboItems) ? [...item.comboItems] : []);
    setComboStructure(comboStructureFromCustomFields(item.customFields, item.comboItems?.length ?? 0));
    setComboStructureConfirmed(isComboStructureConfirmed(item.customFields, item.comboItems?.length ?? 0));
    setNewIngredient('');
    setDirty(false);
    setTpvTab(showComboBuilder && !raw.trim() ? 'combo' : 'ingredients');
  }, [item._id, item.customFields?.ingredients, item.comboItems, showComboBuilder]);

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
    setIngredientDraft(ingredientList.filter((n) => n !== name).join(', '));
    setDirty(true);
  };

  const importIngredientsFromCombo = () => {
    const merged = mergeComboProductIngredients(comboItems, catalogItems);
    if (merged.length === 0) {
      toast.error('Los productos del combo no tienen ingredientes en su ficha');
      return;
    }
    setIngredientDraft(merged.join(', '));
    setDirty(true);
    setTpvTab('ingredients');
    toast.success(`${merged.length} ingrediente(s) importados desde el combo`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveTpvConfig({
        ingredients: ingredientDraft.trim(),
        comboItems,
        comboStructure,
        comboStructureConfirmed,
      });
      setDirty(false);
      toast.success('Configuración TPV guardada');
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
                <span className="font-bold text-gray-900 dark:text-gray-100">{item.unitPrice.toFixed(2)}€</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {tpvConfigurable && (
            <section className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-4">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Configuración TPV</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Define qué puede quitar el cliente y qué incluye el combo. Los extras de pago (+) se gestionan en
                    la pestaña <strong>Ingredientes TPV</strong> del catálogo.
                  </p>
                </div>
              </div>

              {showComboBuilder && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTpvTab('ingredients')}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                      tpvTab === 'ingredients'
                        ? 'border-emerald-500 bg-white dark:bg-gray-900 text-emerald-800 dark:text-emerald-200'
                        : 'border-transparent bg-emerald-100/50 dark:bg-emerald-950/30 text-gray-600'
                    }`}
                  >
                    Ingredientes (quitar)
                    {ingredientList.length > 0 ? ` · ${ingredientList.length}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTpvTab('combo')}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                      tpvTab === 'combo'
                        ? 'border-emerald-500 bg-white dark:bg-gray-900 text-emerald-800 dark:text-emerald-200'
                        : 'border-transparent bg-emerald-100/50 dark:bg-emerald-950/30 text-gray-600'
                    }`}
                  >
                    Composición del menú
                    {comboItems.length > 0 ? ` · ${comboItems.length}` : ''}
                  </button>
                </div>
              )}

              {(tpvTab === 'ingredients' || !showComboBuilder) && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    En el TPV el cliente verá estos ingredientes para <strong>quitarlos</strong> (sin coste extra).
                  </p>
                  {ingredientList.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {ingredientList.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => removeIngredient(name)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-red-300"
                        >
                          {name} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                      Sin ingredientes — el TPV no mostrará opciones para quitar. Añádelos abajo o importa desde el
                      combo.
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
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm resize-none"
                  />
                  {showComboBuilder && comboItems.length > 0 && (
                    <button
                      type="button"
                      onClick={importIngredientsFromCombo}
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Importar ingredientes desde los productos del combo →
                    </button>
                  )}
                </div>
              )}

              {showComboBuilder && tpvTab === 'combo' && (
                <CatalogComboCompositionEditor
                  comboItems={comboItems}
                  catalogItems={catalogItems}
                  excludeItemId={item._id}
                  comboStructure={comboStructure}
                  structureConfirmed={comboStructureConfirmed}
                  onStructureChange={(next) => {
                    setComboStructure(next);
                    setDirty(true);
                  }}
                  onStructureConfirmedChange={(confirmed) => {
                    setComboStructureConfirmed(confirmed);
                    setDirty(true);
                  }}
                  onChange={(next) => {
                    setComboItems(next);
                    setDirty(true);
                  }}
                  onImportIngredients={importIngredientsFromCombo}
                />
              )}

              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold"
              >
                {saving ? 'Guardando…' : 'Guardar configuración TPV'}
              </button>
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
            onClick={onEdit}
            className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white text-sm font-bold inline-flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Editar precio y datos
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
