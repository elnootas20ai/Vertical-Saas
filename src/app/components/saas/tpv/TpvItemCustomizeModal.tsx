import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Minus, MessageSquare, Pizza, Search } from 'lucide-react';
import type { CatalogItem } from '../../../lib/deliveryApi';
import {
  type CartLineCustomization,
  type CatalogSupplement,
  cartLineUnitPrice,
  isCustomizableCatalogItem,
  isTpvBuildYourOwnCatalogItem,
  isTpvHalfHalfCatalogItem,
  parseCatalogIngredients,
  parseCatalogSupplements,
  resolveBuildYourOwnMaxIngredients,
  tpvBuildYourOwnIngredientPool,
  type StoreIngredient,
} from '../../../lib/catalogCustomization';
import { foldTpvSearchText } from '../../../lib/tpvCatalogNavigation';
import { useModalClose } from '../../../hooks/useModalClose';
import { dismissTpvKeyboard, TpvModalRoot } from './TpvModalRoot';

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
  /** Texto bajo el título (p. ej. «Pizza 2 de 3»). */
  stepHint?: string;
  /** Texto del botón final. Por defecto: Añadir al pedido + precio. */
  confirmLabel?: string;
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

function matchesSearch(text: string, query: string): boolean {
  const q = foldTpvSearchText(query);
  if (!q) return true;
  return foldTpvSearchText(text).includes(q);
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
  stepHint,
  confirmLabel,
  onClose,
  onConfirm,
}: TpvItemCustomizeModalProps) {
  useModalClose(true, onClose);

  const buildYourOwn = isTpvBuildYourOwnCatalogItem(item);
  const halfHalfSelected = Boolean(
    initial?.halfHalfPizza?.firstProductId && initial?.halfHalfPizza?.secondProductId,
  );
  const customizable =
    buildYourOwn ||
    isCustomizableCatalogItem(item, brands) ||
    isTpvHalfHalfCatalogItem(item) ||
    halfHalfSelected ||
    (initial?.comboSelections?.length ?? 0) > 0;
  const tpvResolveOptions = useMemo(
    () => ({
      productIngredientsOnly: !buildYourOwn,
      storeExtrasOnly: true,
      tpvFallbackWhenEmpty: true,
      catalogItems,
      comboSelections: initial?.comboSelections,
      halfHalfPizza: initial?.halfHalfPizza,
    }),
    [buildYourOwn, catalogItems, initial?.comboSelections, initial?.halfHalfPizza],
  );
  const buildYourOwnPool = useMemo(
    () =>
      buildYourOwn
        ? tpvBuildYourOwnIngredientPool(
            item,
            storeIngredients,
            brandIngredientSelection,
            brands,
            catalogItems,
          )
        : [],
    [buildYourOwn, storeIngredients, brandIngredientSelection, brands, item, catalogItems],
  );
  const buildYourOwnMax = useMemo(
    () => (buildYourOwn ? resolveBuildYourOwnMaxIngredients(item) : null),
    [buildYourOwn, item],
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
  const [addedBase, setAddedBase] = useState<string[]>(initial?.addedBaseIngredients || []);
  const [added, setAdded] = useState<CatalogSupplement[]>(initial?.addedSupplements || []);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [activeTab, setActiveTab] = useState<CustomizeTab>(() => {
    if (buildYourOwn) {
      return buildYourOwnPool.length > 0 ? 'ingredients' : 'extras';
    }
    return defaultTabForItem(customizable, ingredients.length, supplements.length);
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setRemoved(initial?.removedIngredients || []);
    setAddedBase(initial?.addedBaseIngredients || []);
    setAdded(initial?.addedSupplements || []);
    setNotes(initial?.notes || '');
    setActiveTab(
      buildYourOwn
        ? buildYourOwnPool.length > 0
          ? 'ingredients'
          : 'extras'
        : defaultTabForItem(customizable, ingredients.length, supplements.length),
    );
    setSearchQuery('');
  }, [item._id, initial, customizable, ingredients.length, supplements.length, buildYourOwn, buildYourOwnPool.length]);

  useEffect(() => {
    setSearchQuery('');
  }, [activeTab]);

  const filteredIngredients = useMemo(
    () =>
      (buildYourOwn ? buildYourOwnPool : ingredients).filter((name) =>
        matchesSearch(name, searchQuery),
      ),
    [buildYourOwn, buildYourOwnPool, ingredients, searchQuery],
  );
  const filteredSupplements = useMemo(
    () => supplements.filter((sup) => matchesSearch(sup.name, searchQuery)),
    [supplements, searchQuery],
  );

  const customization: CartLineCustomization = {
    removedIngredients: buildYourOwn ? [] : removed,
    addedBaseIngredients: buildYourOwn ? addedBase : undefined,
    addedSupplements: added,
    notes: notes.trim(),
    comboSelections: initial?.comboSelections,
    halfHalfPizza: initial?.halfHalfPizza,
  };

  const basePrice = Number(item.unitPrice || 0);
  const extrasTotal = added.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const unitTotal = cartLineUnitPrice(basePrice, customization);

  const toggleIngredient = (name: string) => {
    if (buildYourOwn) {
      setAddedBase((prev) => {
        if (prev.includes(name)) return prev.filter((n) => n !== name);
        if (buildYourOwnMax != null && prev.length >= buildYourOwnMax) return prev;
        return [...prev, name];
      });
      return;
    }
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
  const addedBaseCount = addedBase.length;
  const addedCount = added.length;
  const hasConfiguredExtras = supplements.length > 0;
  const showSearchBar =
    customizable &&
    ((activeTab === 'ingredients' &&
      (buildYourOwn ? buildYourOwnPool.length > 0 : ingredients.length > 0)) ||
      (activeTab === 'extras' && supplements.length > 0));

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
    <TpvModalRoot>
      {/* Tap fuera = solo bajar teclado; no cancelar la personalización. */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismissTpvKeyboard} />
      <div
        className="relative w-full sm:max-w-3xl h-[94dvh] sm:h-auto sm:max-h-[92dvh] min-h-0 overflow-hidden bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col border-2 border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpv-customize-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Pizza className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {stepHint || (customizable ? 'Personaliza tu pedido' : 'Añadir al pedido')}
                </p>
              </div>
              <h2 id="tpv-customize-title" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {item.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="inline-flex px-2.5 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {categoryLabel}
                </span>
                {(initial?.halfHalfPizza?.firstProductName ||
                  initial?.halfHalfPizza?.secondProductName) && (
                  <span className="inline-flex px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-xs font-semibold text-amber-900 dark:text-amber-200">
                    ½ {initial?.halfHalfPizza?.firstProductName} · ½{' '}
                    {initial?.halfHalfPizza?.secondProductName}
                  </span>
                )}
                {(initial?.comboSelections?.length ?? 0) > 0 && (
                  <span className="inline-flex px-2.5 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                    {initial!.comboSelections!.map((c) => c.productName).join(' · ')}
                  </span>
                )}
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
              buildYourOwn ? 'Ingredientes' : 'Quitar',
              buildYourOwn
                ? buildYourOwnMax != null
                  ? `Elige hasta ${buildYourOwnMax} · ${addedBaseCount}/${buildYourOwnMax}`
                  : 'Toca lo que quieres añadir'
                : 'Toca lo que NO quieres',
              buildYourOwn ? addedBaseCount : removedCount,
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

        {showSearchBar && (
          <div className="shrink-0 px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'ingredients' ? 'Buscar ingrediente…' : 'Buscar extra…'}
                className="w-full pl-11 pr-10 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-emerald-500 outline-none touch-manipulation"
                autoComplete="off"
                enterKeyHint="search"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                  aria-label="Borrar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-5 py-4">
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
              {(buildYourOwn ? buildYourOwnPool : ingredients).length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 leading-relaxed">
                  {buildYourOwn
                    ? 'Configura ingredientes base en Catálogo → Ingredientes TPV (paso 1, sin precio extra).'
                    : halfHalfSelected
                      ? (
                        <>
                          Sin ingredientes de las pizzas elegidas. Revisa que «{initial?.halfHalfPizza?.firstProductName}» y «{initial?.halfHalfPizza?.secondProductName}» tengan ingredientes en su ficha de catálogo o en <strong>Ingredientes TPV</strong>.
                        </>
                      )
                      : (
                      <>
                        Sin ingredientes para quitar. En <strong>Catálogo</strong> abre la ficha de «{item.name}» y rellena
                        ingredientes, o impórtalos en Excel (columna <strong>ingredientes</strong>). También puedes marcar
                        ingredientes incluidos (sin cobro) en Catálogo → <strong>Ingredientes TPV</strong>.
                      </>
                    )}
                </p>
              ) : filteredIngredients.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                  Ningún ingrediente coincide con «{searchQuery.trim()}».
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredIngredients.map((name) => {
                    const isActive = buildYourOwn ? addedBase.includes(name) : removed.includes(name);
                    const atMax =
                      buildYourOwn &&
                      buildYourOwnMax != null &&
                      !isActive &&
                      addedBaseCount >= buildYourOwnMax;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleIngredient(name)}
                        disabled={atMax}
                        className={`min-h-[52px] px-3 py-3 rounded-xl text-sm font-semibold border-2 transition-all active:scale-[0.98] ${
                          isActive
                            ? buildYourOwn
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-600 dark:text-emerald-200'
                              : 'border-red-400 bg-red-50 text-red-800 line-through dark:bg-red-950/40 dark:border-red-700 dark:text-red-300'
                            : atMax
                              ? 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-400 opacity-50 cursor-not-allowed'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 shadow-sm'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          {isActive ? (
                            buildYourOwn ? (
                              <Plus className="w-4 h-4 shrink-0" />
                            ) : (
                              <Minus className="w-4 h-4 shrink-0" />
                            )
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
            <section className="space-y-3">
              {addedCount > 0 && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-0.5">
                  {addedCount} extra(s) · +{formatPrice(extrasTotal)}
                </p>
              )}
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
                </div>
              ) : filteredSupplements.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                  Ningún extra coincide con «{searchQuery.trim()}».
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {filteredSupplements.map((sup) => {
                    const active = added.some((s) => s.id === sup.id);
                    return (
                      <button
                        key={sup.id}
                        type="button"
                        onClick={() => toggleSupplement(sup)}
                        className={`min-h-[52px] px-2 py-2 rounded-xl border-2 transition-all active:scale-[0.97] touch-manipulation ${
                          active
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-md'
                            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
                        }`}
                      >
                        <span className="flex flex-col items-center justify-center gap-0.5 w-full">
                          {active && <Plus className="w-3.5 h-3.5 shrink-0 opacity-90" />}
                          <span className="text-xs sm:text-sm font-semibold text-center leading-tight line-clamp-2">
                            {sup.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold tabular-nums ${
                              active ? 'text-white/90' : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            +{formatPrice(sup.price)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
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
            {confirmLabel || `Añadir al pedido · ${formatPrice(unitTotal)}`}
          </button>
        </div>
      </div>
    </TpvModalRoot>
  );
}
