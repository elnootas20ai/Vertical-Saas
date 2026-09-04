import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Minus, Package, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Brand } from '../../../lib/brandsApi';
import type { CatalogItem } from '../../../lib/deliveryApi';
import type { TpvCatalogSection } from '../../../lib/tpvCatalogNavigation';
import {
  buildTpvProductSearchIndex,
  parseTpvSectionId,
  searchTpvProducts,
  TPV_PRODUCT_SEARCH_LIMIT,
} from '../../../lib/tpvCatalogNavigation';
import { brandTint } from '../../../lib/brandUtils';
import { isTpvComboCatalogItem } from '../../../lib/catalogComboSlots';
import { isTpvHalfHalfCatalogItem, isTpvBuildYourOwnCatalogItem } from '../../../lib/catalogCustomization';
import { resolveCatalogProductImage } from '../../../lib/catalogProductPlaceholders';
import {
  readTpvCategoryOrder,
  readTpvSectionOrder,
  tpvPickerOrderStorageKey,
  writeTpvCategoryOrder,
  writeTpvSectionOrder,
} from '../../../lib/tpvPickerOrder';
import { TpvReorderableChipRow } from './TpvReorderableChipRow';

function BrandSectionChip({
  section,
  active,
  onSelect,
}: {
  section: TpvCatalogSection;
  active: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  const color =
    section.color && /^#[0-9A-Fa-f]{6}$/.test(section.color) ? section.color : '#374151';

  return (
    <button
      type="button"
      onClick={onSelect}
      title={section.label}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-semibold touch-manipulation transition-colors focus:outline-none ${
        active
          ? 'border-transparent text-white'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'
      }`}
      style={
        active
          ? { backgroundColor: color }
          : { color, backgroundColor: brandTint(color, '10') }
      }
    >
      {section.logo ? (
        <img
          src={section.logo}
          alt=""
          className="w-4 h-4 rounded-full object-cover shrink-0"
        />
      ) : null}
      <span className="max-w-[7rem] truncate">{section.label}</span>
    </button>
  );
}

type TpvProductPickerProps = {
  sections: TpvCatalogSection[];
  selectedSectionId: string;
  onSelectedSectionChange: (sectionId: string) => void;
  loading: boolean;
  catalog: CatalogItem[];
  /** Marcas del negocio: para ocultar organizadores compartidos entre marcas. */
  brands?: Brand[];
  clientProductScores: Record<string, number>;
  resetSignal?: number;
  selectedCategory: string | null;
  onSelectedCategoryChange: (category: string | null) => void;
  categories: string[];
  habitualProducts: CatalogItem[];
  crossSellProducts: CatalogItem[];
  getCartQty: (itemId: string) => number;
  addToCart: (item: CatalogItem) => void;
  removeFromCart: (itemId: string) => void;
  formatPrice: (n: number) => string;
  cartPanel: ReactNode;
  hasPricedProducts: boolean;
  onImportCatalog?: () => void;
  /** TPV trabajador: sin enlace al módulo Catálogo (solo gerente). */
  hideCatalogAdminLink?: boolean;
  /** TPV tablet: layout denso, catálogo + carrito en fila y más espacio útil. */
  compact?: boolean;
  /** Móvil: carta y pedido a pantalla completa con pestañas (no split). */
  phoneMode?: boolean;
  /** Badge en pestaña Pedido (móvil). */
  cartBadgeCount?: number;
  /** Layout de pestañas (bar: marca + familias). */
  catalogLayout?: 'default' | 'brand_families';
};

const ProductTile = memo(function ProductTile({
  item,
  qty,
  accentColor,
  disabled,
  formatPrice,
  onAdd,
  onRemove,
  compact = false,
}: {
  item: CatalogItem;
  qty: number;
  accentColor?: string;
  disabled: boolean;
  formatPrice: (n: number) => string;
  onAdd: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const price = Number(item.unitPrice || 0);
  const imageUrl = resolveCatalogProductImage(item);
  const hasImage = Boolean(imageUrl);
  const inCart = qty > 0;
  const isCombo = isTpvComboCatalogItem(item);
  const isHalfHalf = isTpvHalfHalfCatalogItem(item);
  const isBuildYourOwn = isTpvBuildYourOwnCatalogItem(item);

  return (
    <article
      className={`flex flex-col border overflow-hidden transition-colors ${
        compact ? 'rounded-lg' : 'rounded-xl'
      } ${
        inCart
          ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        className="flex flex-col flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed touch-manipulation"
      >
        <div className={`relative bg-gray-100 dark:bg-gray-800 overflow-hidden ${compact ? 'aspect-square' : 'aspect-square'}`}>
          {hasImage ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: accentColor ? brandTint(accentColor, '12') : undefined }}
            >
              <Package className={`text-gray-400 dark:text-gray-500 ${compact ? 'w-7 h-7' : 'w-5 h-5'}`} strokeWidth={1.5} />
            </div>
          )}
          {inCart && (
            <span className={`absolute top-1 right-1 rounded-md bg-emerald-600 text-white font-bold flex items-center justify-center tabular-nums ${compact ? 'min-w-[1.35rem] h-[1.35rem] px-1 text-xs' : 'min-w-[1.15rem] h-[1.15rem] px-0.5 text-[10px]'}`}>
              {qty}
            </span>
          )}
          {isHalfHalf && (
            <span className={`absolute top-1 left-1 rounded-md bg-amber-600 text-white font-bold uppercase ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[8px]'}`}>
              ½½
            </span>
          )}
          {isBuildYourOwn && !isHalfHalf && (
            <span className={`absolute top-1 left-1 rounded-md bg-orange-600 text-white font-bold uppercase ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[8px]'}`}>
              Gusto
            </span>
          )}
          {isCombo && !isHalfHalf && !isBuildYourOwn && (
            <span className={`absolute top-1 left-1 rounded-md bg-indigo-600 text-white font-bold uppercase ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[8px]'}`}>
              Menú
            </span>
          )}
          {disabled && (
            <span className="absolute inset-x-0 bottom-0 bg-black/55 text-[8px] font-bold uppercase text-white text-center py-0.5">
              {price <= 0 ? 'Sin €' : 'N/D'}
            </span>
          )}
        </div>
        <div className={`px-1.5 flex flex-col justify-between gap-0.5 ${compact ? 'py-1.5 min-h-[2.75rem]' : 'py-1.5 min-h-[2.75rem]'}`}>
          <p className={`leading-tight font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 ${compact ? 'text-xs' : 'text-[11px] md:text-xs'}`}>
            {item.name}
          </p>
          <p className={`font-bold text-gray-700 dark:text-gray-300 tabular-nums ${compact ? 'text-sm' : 'text-[11px]'}`}>
            {price > 0 ? formatPrice(price) : '—'}
          </p>
        </div>
      </button>

      {inCart && (
        <div className="flex items-center border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onRemove}
            className={`flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation ${compact ? 'min-h-[40px] h-10' : 'min-h-[36px] h-9'}`}
            aria-label="Quitar"
          >
            <Minus className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          </button>
          <span className={`font-bold tabular-nums px-1 ${compact ? 'text-sm' : 'text-xs'}`}>{qty}</span>
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 touch-manipulation ${compact ? 'min-h-[40px] h-10' : 'min-h-[36px] h-9'}`}
            aria-label="Añadir"
          >
            <Plus className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          </button>
        </div>
      )}
    </article>
  );
});

function SearchResultRow({
  item,
  qty,
  formatPrice,
  onAdd,
  disabled,
  compact = false,
}: {
  item: CatalogItem;
  qty: number;
  formatPrice: (n: number) => string;
  onAdd: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  const price = Number(item.unitPrice || 0);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className={`w-full flex items-center gap-2 rounded-lg border text-left transition-colors touch-manipulation ${
        compact ? 'px-2 py-1.5 min-h-[36px]' : 'px-3 py-2.5 min-h-[44px]'
      } ${
        qty > 0
          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-300 dark:hover:border-indigo-600'
      } disabled:opacity-50`}
    >
      <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
        {item.name}
      </span>
      {item.category && (
        <span className="shrink-0 text-[10px] text-gray-400 max-w-[28%] truncate">{item.category}</span>
      )}
      <span className="shrink-0 text-sm font-bold tabular-nums text-gray-700 dark:text-gray-300">
        {price > 0 ? formatPrice(price) : '—'}
      </span>
      {qty > 0 ? (
        <span className="shrink-0 min-w-[1.25rem] h-5 px-1 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
          {qty}
        </span>
      ) : (
        <Plus className="w-4 h-4 shrink-0 text-indigo-500" />
      )}
    </button>
  );
}

export function TpvProductPicker({
  sections,
  selectedSectionId,
  onSelectedSectionChange,
  loading,
  catalog,
  brands = [],
  clientProductScores,
  resetSignal = 0,
  selectedCategory,
  onSelectedCategoryChange,
  categories,
  habitualProducts,
  crossSellProducts,
  getCartQty,
  addToCart,
  removeFromCart,
  formatPrice,
  cartPanel,
  hasPricedProducts,
  onImportCatalog,
  hideCatalogAdminLink = false,
  compact = false,
  phoneMode = false,
  cartBadgeCount = 0,
  userId,
  businessId,
  catalogLayout = 'default',
}: TpvProductPickerProps) {
  const [productSearch, setProductSearch] = useState('');
  const [phonePanel, setPhonePanel] = useState<'catalog' | 'cart'>('catalog');
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const useSplitRow = compact && !phoneMode;
  const showCatalog = !phoneMode || phonePanel === 'catalog';
  const showCart = !phoneMode || phonePanel === 'cart';

  const orderStorageKey = useMemo(
    () => (userId && businessId ? tpvPickerOrderStorageKey(userId, businessId) : ''),
    [userId, businessId],
  );

  useEffect(() => {
    if (resetSignal > 0) {
      setProductSearch('');
      onSelectedCategoryChange(null);
    }
  }, [resetSignal, onSelectedCategoryChange]);

  const activeSection = sections.find((s) => s.id === selectedSectionId) ?? sections[0];
  const accentColor =
    activeSection?.color && /^#[0-9A-Fa-f]{6}$/.test(activeSection.color)
      ? activeSection.color
      : '#6366f1';

  const selectedScope = useMemo(
    () => parseTpvSectionId(selectedSectionId),
    [selectedSectionId],
  );

  const searchIndex = useMemo(() => buildTpvProductSearchIndex(catalog), [catalog]);

  const filteredProducts = useMemo(
    () =>
      searchTpvProducts(
        searchIndex,
        catalog,
        productSearch,
        selectedScope,
        selectedCategory,
        clientProductScores,
        brands,
        catalogLayout,
      ),
    [searchIndex, catalog, productSearch, selectedScope, selectedCategory, clientProductScores, brands, catalogLayout],
  );

  const isSearchMode = productSearch.trim().length > 0;
  const searchTruncated =
    isSearchMode && filteredProducts.length >= TPV_PRODUCT_SEARCH_LIMIT;
  const topBarSections = useMemo(
    () =>
      sections.filter(
        (s) =>
          s.scope.kind === 'all'
          || s.scope.kind === 'brand'
          || s.scope.kind === 'shared',
      ),
    [sections],
  );

  const sectionById = useMemo(
    () => new Map(topBarSections.map((section) => [section.id, section])),
    [topBarSections],
  );

  useEffect(() => {
    const ids = topBarSections.map((section) => section.id);
    if (!orderStorageKey) {
      setSectionOrder(ids);
      return;
    }
    setSectionOrder(readTpvSectionOrder(orderStorageKey, ids));
  }, [orderStorageKey, topBarSections]);

  useEffect(() => {
    if (!orderStorageKey) {
      setCategoryOrder(categories);
      return;
    }
    setCategoryOrder(readTpvCategoryOrder(orderStorageKey, selectedSectionId, categories));
  }, [orderStorageKey, selectedSectionId, categories]);

  const orderedTopBarSections = useMemo(
    () =>
      sectionOrder
        .map((id) => sectionById.get(id))
        .filter((section): section is TpvCatalogSection => Boolean(section)),
    [sectionOrder, sectionById],
  );

  const orderedCategories = useMemo(() => {
    const known = new Set(categories);
    const fromOrder = categoryOrder.filter((cat) => known.has(cat));
    for (const cat of categories) {
      if (!fromOrder.includes(cat)) fromOrder.push(cat);
    }
    return fromOrder;
  }, [categories, categoryOrder]);

  const handleSectionReorder = (nextIds: string[]) => {
    setSectionOrder(nextIds);
    if (orderStorageKey) writeTpvSectionOrder(orderStorageKey, nextIds);
  };

  const handleCategoryReorder = (nextIds: string[]) => {
    setCategoryOrder(nextIds);
    if (orderStorageKey) writeTpvCategoryOrder(orderStorageKey, selectedSectionId, nextIds);
  };

  const catalogGridColumns = phoneMode
    ? 'repeat(2, minmax(0, 1fr))'
    : useSplitRow
      ? 'repeat(auto-fill, minmax(5.75rem, 1fr))'
      : 'repeat(auto-fill, minmax(5.25rem, 1fr))';

  const catalogColumn = (
      <div className={`flex-1 flex flex-col min-h-0 min-w-0 w-full rounded-lg border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden ${phoneMode && !showCatalog ? 'hidden' : ''}`}>
        <div className={`shrink-0 border-b border-gray-100 dark:border-gray-800 ${compact ? 'px-2 pt-1.5 pb-1.5' : 'px-2.5 pt-2.5 pb-2'}`}>
          <div className="relative">
            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${compact ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
            <input
              id="tpv-product-search"
              name="vertial-product-search"
              type="text"
              inputMode="search"
              value={productSearch}
              onChange={(e) => {
                const v = e.target.value;
                setProductSearch(v);
                if (v.trim()) onSelectedCategoryChange(null);
              }}
              placeholder={phoneMode ? 'Buscar producto…' : 'Producto, categoría, SKU o código…'}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className={`w-full pl-8 pr-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${compact ? 'h-10 text-sm' : 'h-10 text-sm'}`}
            />
            {productSearch.trim() ? (
              <button
                type="button"
                title="Borrar búsqueda"
                aria-label="Borrar búsqueda"
                onClick={() => setProductSearch('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-9 min-w-9 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/70 dark:hover:text-stone-200 dark:hover:bg-stone-700 touch-manipulation"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        {!isSearchMode && topBarSections.length > 0 && (
          <div className={`shrink-0 border-b border-gray-100 dark:border-gray-800 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'}`}>
            <TpvReorderableChipRow
              itemIds={orderedTopBarSections.map((section) => section.id)}
              onReorder={handleSectionReorder}
              gapClassName="gap-1.5"
              alignClassName="items-center"
              renderItem={(sectionId) => {
                const section = sectionById.get(sectionId);
                if (!section) return null;
                return (
                  <BrandSectionChip
                    section={section}
                    active={selectedSectionId === section.id}
                    onSelect={() => {
                      onSelectedSectionChange(section.id);
                      onSelectedCategoryChange(null);
                    }}
                  />
                );
              }}
            />
          </div>
        )}

        {!isSearchMode && (
          <>
            {categories.length > 0 && (
              <div className={`shrink-0 border-b border-gray-100 dark:border-gray-800 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'}`}>
                <TpvReorderableChipRow
                  itemIds={orderedCategories}
                  onReorder={handleCategoryReorder}
                  gapClassName="gap-1.5"
                  alignClassName="items-center"
                  prefix={(
                    <button
                      type="button"
                      onClick={() => onSelectedCategoryChange(null)}
                      className={`shrink-0 inline-flex items-center rounded-full border px-2.5 h-7 text-[11px] font-semibold touch-manipulation ${
                        !selectedCategory
                          ? 'border-transparent text-white'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300'
                      }`}
                      style={!selectedCategory ? { backgroundColor: accentColor } : undefined}
                    >
                      Todas
                    </button>
                  )}
                  renderItem={(cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        type="button"
                        onClick={() => onSelectedCategoryChange(active ? null : cat)}
                        title={cat}
                        className={`shrink-0 inline-flex items-center rounded-full border px-2.5 h-7 text-[11px] font-semibold touch-manipulation max-w-[9rem] ${
                          active
                            ? 'border-transparent text-white'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300'
                        }`}
                        style={
                          active
                            ? { backgroundColor: accentColor }
                            : { color: accentColor, backgroundColor: brandTint(accentColor, '10') }
                        }
                      >
                        <span className="truncate">{cat}</span>
                      </button>
                    );
                  }}
                />
              </div>
            )}
          </>
        )}

        {!hasPricedProducts && !isSearchMode && (
          <div className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-800 dark:text-amber-300">
              {hideCatalogAdminLink
                ? 'No hay productos cargados. Avisad al gerente para que revise el catálogo.'
                : 'Sin precios en catálogo.'}
            </p>
            {!hideCatalogAdminLink && onImportCatalog && (
              <button type="button" onClick={onImportCatalog} className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 underline">
                Ir al catálogo
              </button>
            )}
          </div>
        )}

        {!isSearchMode && !compact && habitualProducts.length > 0 && (
          <div className="shrink-0 mx-2 mt-2 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200/60 dark:border-emerald-800/40">
            <p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1">Este cliente suele pedir</p>
            <div className="flex flex-wrap gap-1">
              {habitualProducts.map((item) => (
                <button
                  key={`hab-${item._id}`}
                  type="button"
                  onClick={() => addToCart(item)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 text-[10px] font-medium text-emerald-900 dark:text-emerald-100"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[100px]">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isSearchMode && !compact && crossSellProducts.length > 0 && (
          <div className="shrink-0 mx-2 mt-2 px-2 py-1.5 rounded-lg bg-violet-50/80 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/40">
            <p className="text-[10px] font-semibold text-violet-800 dark:text-violet-300 mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              También suelen llevar
            </p>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {crossSellProducts.map((item) => (
                <button
                  key={`xs-${item._id}`}
                  type="button"
                  onClick={() => addToCart(item)}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-800 text-[10px] font-medium"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span className="max-w-[90px] truncate">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y ${compact ? 'p-2' : 'p-2'}`}>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isSearchMode
                  ? 'Sin coincidencias'
                  : sections.length === 0
                    ? 'Sin productos'
                    : 'Sin productos en esta sección'}
              </p>
            </div>
          ) : isSearchMode ? (
            <div className="space-y-1">
              {searchTruncated && (
                <p className="text-[10px] text-gray-400 px-1 mb-2">
                  Mostrando los primeros {TPV_PRODUCT_SEARCH_LIMIT} resultados. Afina la búsqueda.
                </p>
              )}
              {filteredProducts.map((item) => {
                const qty = getCartQty(item._id);
                const disabled = !item.active || Number(item.unitPrice || 0) <= 0;
                return (
                  <SearchResultRow
                    key={item._id}
                    item={item}
                    qty={qty}
                    formatPrice={formatPrice}
                    onAdd={() => addToCart(item)}
                    disabled={disabled}
                    compact={compact}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: catalogGridColumns }}
            >
              {filteredProducts.map((item) => {
                const qty = getCartQty(item._id);
                const disabled = !item.active || Number(item.unitPrice || 0) <= 0;
                return (
                  <ProductTile
                    key={item._id}
                    item={item}
                    qty={qty}
                    accentColor={accentColor}
                    disabled={disabled}
                    formatPrice={formatPrice}
                    onAdd={() => addToCart(item)}
                    onRemove={() => removeFromCart(item._id)}
                    compact={compact || phoneMode}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
  );

  const cartColumn = (
      <aside
        className={
          phoneMode
            ? `flex-1 flex flex-col min-h-0 w-full rounded-xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-950/50 overflow-hidden ${!showCart ? 'hidden' : ''}`
            : useSplitRow
              ? 'w-[min(18rem,32%)] min-w-[14rem] shrink-0 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-950/50 flex flex-col min-h-0 overflow-hidden'
              : 'md:w-[17rem] xl:w-[18rem] shrink-0 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-950/50 flex flex-col min-h-[14rem] md:min-h-0 md:sticky md:top-14 md:self-start md:max-h-[calc(100dvh-8rem)]'
        }
      >
        {cartPanel}
      </aside>
  );

  return (
    <div
      className={
        phoneMode
          ? 'flex flex-col gap-2 flex-1 min-h-0 w-full min-w-0'
          : useSplitRow
            ? 'flex flex-row gap-2 flex-1 min-h-0 w-full min-w-0'
            : 'flex flex-col md:flex-row gap-3 min-h-[min(68vh,640px)] md:min-h-0 md:h-full w-full'
      }
    >
      {phoneMode ? (
        <div className="shrink-0 flex rounded-xl bg-gray-100 dark:bg-gray-800 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setPhonePanel('catalog')}
            className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
              phonePanel === 'catalog'
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Carta
          </button>
          <button
            type="button"
            onClick={() => setPhonePanel('cart')}
            className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold touch-manipulation transition-colors inline-flex items-center justify-center gap-1.5 ${
              phonePanel === 'cart'
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Pedido
            {cartBadgeCount > 0 ? (
              <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold tabular-nums flex items-center justify-center">
                {cartBadgeCount}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
      {catalogColumn}
      {cartColumn}
    </div>
  );
}
