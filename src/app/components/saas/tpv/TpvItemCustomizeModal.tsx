import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Minus, MessageSquare, Pizza, ShoppingBag, Search } from 'lucide-react';
import type { CatalogItem } from '../../../lib/deliveryApi';
import {
  type CartLineCustomization,
  type CatalogSupplement,
  cartLineUnitPrice,
  isCustomizableCatalogItem,
  parseCatalogIngredients,
  parseCatalogSupplements,
  type StoreIngredient,
} from '../../../lib/catalogCustomization';
import { useModalClose } from '../../../hooks/useModalClose';

type CustomizeTab = 'ingredients' | 'extras' | 'notes';

type TpvItemCustomizeModalProps = {
  item: CatalogItem;
  initial?: CartLineCustomization;
  formatPrice: (n: number) => string;
  templates?: import('../../../lib/catalogCustomization').TpvCategoryTemplates;
  storeIngredients?: StoreIngredient[];
  brandIngredientSelection?: import('../../../lib/catalogCustomization').TpvBrandIngredientSelection;
  brandSupplements?: import('../../../lib/catalogCustomization').TpvBrandSupplements;
  defaultExtraPrice?: number;
  brands?: Array<{ _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>;
  /** Catálogo TPV completo (combos → ingredientes de productos incluidos). */
  catalogItems?: CatalogItem[];
  onClose: () => void;
  onConfirm: (customization: CartLineCustomization) => void;
};

function defaultTabForItem(
  customizable: boolean,
  ingredientsCount: number,
  supplementsCount: number,
): CustomizeTab {
  if (!customizable) return 'notes';
  if (ingredientsCount > 0) return 'ingredients';
  if (supplementsCount > 0) return 'extras';
  return 'notes';
}

export function TpvItemCustomizeModal({
  item,
  initial,
  formatPrice,
  templates,
  storeIngredients,
  brandIngredientSelection,
  brandSupplements,
  defaultExtraPrice,
  brands,
  catalogItems,
  onClose,
  onConfirm,
}: TpvItemCustomizeModalProps) {
  useModalClose(true, onClose);

  const customizable = isCustomizableCatalogItem(item, brands);
  const tpvResolveOptions = useMemo(
    () => ({
      productIngredientsOnly: true,
      storeExtrasOnly: true,
      tpvFallbackWhenEmpty: true,
      catalogItems,
    }),
    [catalogItems],
  );
  const ingredients = useMemo(
    () =>
      parseCatalogIngredients(
        item,
        templates,
        storeIngredients,
        brandIngredientSelection,
        undefined,
        brands,
        tpvResolveOptions,
      ),
    [item, templates, storeIngredients, brandIngredientSelection, brands, tpvResolveOptions],
  );
  const supplements = useMemo(
    () =>
      parseCatalogSupplements(
        item,
        templates,
        brandSupplements,
        undefined,
        storeIngredients,
        defaultExtraPrice,
        brands,
        tpvResolveOptions,
      ),
    [item, templates, brandSupplements, storeIngredients, defaultExtraPrice, brands, tpvResolveOptions],
  );

  const [removed, setRemoved] = useState<string[]>(initial?.removedIngredients || []);
  const [added, setAdded] = useState<CatalogSupplement[]>(initial?.addedSupplements || []);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [extraSearch, setExtraSearch] = useState('');
  const [activeTab, setActiveTab] = useState<CustomizeTab>(() =>
    defaultTabForItem(customizable, ingredients.length, supplements.length),
  );

  useEffect(() => {
    setRemoved(initial?.removedIngredients || []);
    setAdded(initial?.addedSupplements || []);
    setNotes(initial?.notes || '');
    setExtraSearch('');
    setActiveTab(defaultTabForItem(customizable, ingredients.length, supplements.length));
  }, [item._id, initial, customizable, ingredients.length, supplements.length]);

  const customization: CartLineCustomization = {
    removedIngredients: removed,
    addedSupplements: added,
    notes: notes.trim(),
  };

  const basePrice = Number(item.unitPrice || 0);
  const extrasTotal = added.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const unitTotal = cartLineUnitPrice(basePrice, customization);

  const filteredSupplements = useMemo(() => {
    const q = extraSearch.trim().toLowerCase();
    if (!q) return supplements;
    return supplements.filter((sup) => sup.name.toLowerCase().includes(q));
  }, [supplements, extraSearch]);

  const toggleIngredient = (name: string) => {
    setRemoved((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const toggleSupplement = (sup: CatalogSupplement) => {
    setAdded((prev) => {
      const exists = prev.some((s) => s.id === sup.id);
      return exists ? prev.filter((s) => s.id !== sup.id) : [...prev, sup];
    });
  };

  const categoryLabel = String(item.category || '').trim() || 'Producto';
  const removedCount = removed.length;
  const addedCount = added.length;
  const hasConfiguredExtras = supplements.length > 0;

  const tabBtn = (tab: CustomizeTab, label: string, hint: string, badge?: number) => {
    const active = activeTab === tab;
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        className={`flex-1 min-w-0 px-3 py-3 rounded-xl border-2 text-left transition-colors ${
          active
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-bold truncate ${active ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-800 dark:text-gray-200'}`}>
            {label}
          </span>
          {badge != null && badge > 0 ? (
            <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
              {badge}
            </span>
          ) : null}
        </div>
        <p className={`text-[11px] mt-0.5 leading-snug ${active ? 'text-emerald-700/80 dark:text-emerald-300/80' : 'text-gray-500 dark:text-gray-400'}`}>
          {hint}
        </p>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-2xl max-h-[94dvh] overflow-hidden bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col border-2 border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpv-customize-title"
      >
        {/* Cabecera */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Pizza className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {customizable ? 'Personaliza tu pedido' : 'Añadir al pedido'}
                </p>
              </div>
              <h2 id="tpv-customize-title" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {item.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="inline-flex px-2.5 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {categoryLabel}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Precio base{' '}
                  <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatPrice(basePrice)}
                  </span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0 border border-gray-200 dark:border-gray-700"
              aria-label="Cerrar"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {customizable && (
          <div className="shrink-0 px-4 pt-4 pb-2 flex flex-col sm:flex-row gap-2">
            {tabBtn(
              'ingredients',
              'Quitar',
              'Toca lo que NO quieres',
              removedCount,
            )}
            {tabBtn(
              'extras',
              'Extras',
              hasConfiguredExtras ? 'Añadir con suplemento +' : 'Sin extras configurados',
              addedCount,
            )}
            {tabBtn('notes', 'Notas', 'Indicaciones cocina')}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!customizable && (
            <section>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                <MessageSquare className="w-4 h-4" />
                Notas para cocina
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: sin cebolla, para llevar, poco hecha, alergia…"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-gray-100 resize-none focus:border-emerald-500 outline-none min-h-[120px]"
                autoFocus
              />
            </section>
          )}

          {customizable && activeTab === 'ingredients' && (
            <section className="space-y-4">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Ingredientes incluidos
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
                  Toca un ingrediente para <strong>quitarlo</strong> del producto. Los tachados no irán a cocina.
                </p>
              </div>
              {ingredients.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 leading-relaxed">
                  Sin ingredientes para quitar. En <strong>Catálogo</strong> abre la ficha de «{item.name}» y rellena
                  ingredientes, o impórtalos en Excel (columna <strong>ingredientes</strong>). También puedes marcar
                  ingredientes incluidos (sin cobro) en Catálogo → <strong>Ingredientes TPV</strong>.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {ingredients.map((name) => {
                    const isRemoved = removed.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleIngredient(name)}
                        className={`min-h-[52px] px-3 py-3 rounded-xl text-sm font-semibold border-2 transition-all active:scale-[0.98] ${
                          isRemoved
                            ? 'border-red-400 bg-red-50 text-red-800 line-through dark:bg-red-950/40 dark:border-red-700 dark:text-red-300'
                            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 shadow-sm'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          {isRemoved ? (
                            <Minus className="w-4 h-4 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                          <span className="text-center leading-tight">{name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {customizable && activeTab === 'extras' && (
            <section className="space-y-4">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Extras de pago
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1">
                  Toca para añadir. Cada extra suma al precio (se muestra con <strong>+</strong>).
                </p>
              </div>
              {supplements.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-6 text-center space-y-3">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Aún no hay extras de pago
                  </p>
                  <p className="text-sm text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                    Ve a <strong>Catálogo → Ingredientes TPV</strong>, paso <strong>3</strong>: toca los ingredientes en{' '}
                    <strong>naranja</strong> (bacon, extra queso, piña…), pon el precio en el paso 1 y pulsa{' '}
                    <strong>Guardar cambios</strong>.
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                    Si ya los marcaste, recarga el TPV o vuelve a abrir esta pantalla.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {supplements.length > 6 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="search"
                        value={extraSearch}
                        onChange={(e) => setExtraSearch(e.target.value)}
                        placeholder="Buscar extra…"
                        className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                  )}
                  {filteredSupplements.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">Ningún extra coincide con la búsqueda.</p>
                  ) : (
                    filteredSupplements.map((sup) => {
                    const active = added.some((s) => s.id === sup.id);
                    return (
                      <button
                        key={sup.id}
                        type="button"
                        onClick={() => toggleSupplement(sup)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-4 rounded-xl border-2 text-left transition-all active:scale-[0.99] min-h-[56px] ${
                          active
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-md ring-2 ring-emerald-500/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-emerald-300 shadow-sm'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                            }`}
                          >
                            {active ? <Plus className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                          </span>
                          <span className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {sup.name}
                          </span>
                        </span>
                        <span className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                          +{formatPrice(sup.price)}
                        </span>
                      </button>
                    );
                    })
                  )}
                </div>
              )}
            </section>
          )}

          {customizable && activeTab === 'notes' && (
            <section>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                <MessageSquare className="w-4 h-4" />
                Notas para cocina
              </label>
              <textarea
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: poco hecha, sin sal, cortar en 4, alergia…"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-gray-100 resize-none focus:border-emerald-500 outline-none min-h-[140px]"
                autoFocus
              />
            </section>
          )}
        </div>

        {/* Resumen + confirmar */}
        <div className="shrink-0 p-4 sm:p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 space-y-3">
          {(removedCount > 0 || addedCount > 0) && (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 px-1">
              {removedCount > 0 && (
                <p>
                  <span className="font-semibold text-red-600 dark:text-red-400">Sin:</span>{' '}
                  {removed.join(', ')}
                </p>
              )}
              {addedCount > 0 && (
                <p>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Extras:</span>{' '}
                  {added.map((s) => `${s.name} (+${formatPrice(s.price)})`).join(', ')}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-gray-600 dark:text-gray-400">Total unidad</span>
            <div className="text-right">
              {extrasTotal > 0 && (
                <p className="text-xs text-gray-500 tabular-nums">
                  {formatPrice(basePrice)} + {formatPrice(extrasTotal)} extras
                </p>
              )}
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatPrice(unitTotal)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onConfirm(customization)}
            className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-base transition-colors shadow-lg"
          >
            Añadir al pedido · {formatPrice(unitTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}
