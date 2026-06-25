import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Minus, Package, Plus, Search, Sparkles } from 'lucide-react';
import type { CatalogItem } from '../../../lib/deliveryApi';
import type { TpvCatalogSection } from '../../../lib/tpvCatalogNavigation';

function isBrandScopeSection(section: TpvCatalogSection): boolean {
  return section.scope.kind === 'all' || section.scope.kind === 'brand';
}

function BrandSectionChip({
  section,
  active,
  compact,
  onSelect,
}: {
  section: TpvCatalogSection;
  active: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const color =
    section.color && /^#[0-9A-Fa-f]{6}$/.test(section.color) ? section.color : '#374151';
  const tileSize = compact ? 'w-10 h-10' : 'w-11 h-11';
  const chipWidth = compact ? 'w-[3.25rem]' : 'w-14';

  return (
    <button
      type="button"
      onClick={onSelect}
      title={section.label}
      className={`shrink-0 flex flex-col items-center gap-0.5 focus:outline-none touch-manipulation ${chipWidth}`}
    >
      {section.logo ? (
        <span
          className={`${tileSize} rounded-xl overflow-hidden border-2 transition-all ${
            active ? 'border-gray-900 dark:border-gray-100 shadow-md scale-105' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <img src={section.logo} alt="" className="w-full h-full object-cover" />
        </span>
      ) : (
        <span
          className={`${tileSize} rounded-xl flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
            active ? 'text-white shadow-md scale-105 border-transparent' : 'border-gray-200 dark:border-gray-700'
          }`}
          style={
            active
              ? { backgroundColor: color }
              : { color, backgroundColor: brandTint(color, '14') }
          }
        >
          {section.shortCode || section.label.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span
        className={`text-center leading-tight line-clamp-2 w-full px-0.5 font-medium ${
          compact ? 'text-[8px]' : 'text-[9px]'
        } ${active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {section.label}
      </span>
    </button>
  );
}
import {
  buildTpvProductSearchIndex,
  parseTpvSectionId,
  searchTpvProducts,
  TPV_PRODUCT_SEARCH_LIMIT,
} from '../../../lib/tpvCatalogNavigation';
import { brandTint } from '../../../lib/brandUtils';
import { isTpvComboCatalogItem } from '../../../lib/catalogComboSlots';
import { isTpvHalfHalfCatalogItem } from '../../../lib/catalogCustomization';

type TpvProductPickerProps = {
  sections: TpvCatalogSection[];
  selectedSectionId: string;
  onSelectedSectionChange: (sectionId: string) => void;
  loading: boolean;
  catalog: CatalogItem[];
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
  /** TPV tablet: layout denso, catálogo + carrito en fila y más espacio útil. */
  compact?: boolean;
};

function categoryShortLabel(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

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
  const hasImage = Boolean(item.image?.trim());
  const inCart = qty > 0;
  const isCombo = isTpvComboCatalogItem(item);
  const isHalfHalf = isTpvHalfHalfCatalogItem(item);

  return (
    <article
      className={`flex flex-col rounded-xl border overflow-hidden transition-colors ${
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
        <div className="relative aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {hasImage ? (
            <img src={item.image} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: accentColor ? brandTint(accentColor, '12') : undefined }}
            >
              <Package className="w-5 h-5 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
            </div>
          )}
          {inCart && (
            <span className="absolute top-1 right-1 min-w-[1.15rem] h-[1.15rem] px-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {qty}
            </span>
          )}
          {isHalfHalf && (
            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[8px] font-bold uppercase">
              ½½
            </span>
          )}
          {isCombo && !isHalfHalf && (
            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[8px] font-bold uppercase">
              Menú
            </span>
          )}
          {disabled && (
            <span className="absolute inset-x-0 bottom-0 bg-black/55 text-[8px] font-bold uppercase text-white text-center py-0.5">
              {price <= 0 ? 'Sin €' : 'N/D'}
            </span>
          )}
        </div>
        <div className={`px-1.5 flex flex-col justify-between gap-0.5 ${compact ? 'py-1 min-h-[2.1rem]' : 'py-1.5 min-h-[2.75rem]'}`}>
          <p className={`leading-tight font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 ${compact ? 'text-[10px]' : 'text-[11px] md:text-xs'}`}>
            {item.name}
          </p>
          <p className={`font-bold text-gray-600 dark:text-gray-400 tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            {price > 0 ? formatPrice(price) : '—'}
          </p>
        </div>
      </button>

      {inCart && (
        <div className="flex items-center border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onRemove}
            className={`flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation ${compact ? 'min-h-[28px] h-7' : 'min-h-[36px] h-9'}`}
            aria-label="Quitar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-bold tabular-nums px-1">{qty}</span>
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className={`flex-1 flex items-center justify-center text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 touch-manipulation ${compact ? 'min-h-[28px] h-7' : 'min-h-[36px] h-9'}`}
            aria-label="Añadir"
          >
            <Plus className="w-3.5 h-3.5" />
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
  compact = false,
}: TpvProductPickerProps) {
  const [productSearch, setProductSearch] = useState('');

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
      ),
    [searchIndex, catalog, productSearch, selectedScope, selectedCategory, clientProductScores],
  );

  const isSearchMode = productSearch.trim().length > 0;
  const searchTruncated =
    isSearchMode && filteredProducts.length >= TPV_PRODUCT_SEARCH_LIMIT;
  const brandSections = useMemo(
    () => sections.filter(isBrandScopeSection),
    [sections],
  );
  const sharedSections = useMemo(
    () => sections.filter((s) => s.scope.kind === 'shared'),
    [sections],
  );

  return (
    <div
      className={
        compact
          ? 'flex flex-row gap-2 h-full min-h-0 max-h-full'
          : 'flex flex-col md:flex-row gap-3 min-h-[min(68vh,640px)] md:min-h-0 md:h-full'
      }
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className={`shrink-0 border-b border-gray-100 dark:border-gray-800 ${compact ? 'px-2 pt-1.5 pb-1.5' : 'px-2.5 pt-2.5 pb-2'}`}>
          <div className="relative">
            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
            <input
              id="tpv-product-search"
              name="vertial-product-search"
              type="search"
              value={productSearch}
              onChange={(e) => {
                const v = e.target.value;
                setProductSearch(v);
                if (v.trim()) onSelectedCategoryChange(null);
              }}
              placeholder="Producto, categoría, SKU o código…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className={`w-full pl-8 pr-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                compact ? 'h-8 text-xs' : 'h-10 text-sm'
              }`}
            />
          </div>
        </div>

        {!isSearchMode && brandSections.length > 0 && (
          <>
            <div className={`shrink-0 border-b border-gray-200 dark:border-gray-800 bg-gray-100/80 dark:bg-gray-950/50 ${compact ? 'px-1.5 py-1' : 'px-2 py-2'}`}>
              <div className={`flex overflow-x-auto scrollbar-hide items-start ${compact ? 'gap-1.5' : 'gap-2'}`}>
                {brandSections.map((section) => (
                  <BrandSectionChip
                    key={section.id}
                    section={section}
                    active={selectedSectionId === section.id}
                    compact={compact}
                    onSelect={() => {
                      onSelectedSectionChange(section.id);
                      onSelectedCategoryChange(null);
                    }}
                  />
                ))}
              </div>
            </div>

            {sharedSections.length > 0 && (
              <div className={`shrink-0 border-b border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-900/40 ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'}`}>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {sharedSections.map((section) => {
                    const active = selectedSectionId === section.id;
                    const color =
                      section.color && /^#[0-9A-Fa-f]{6}$/.test(section.color)
                        ? section.color
                        : '#374151';
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => {
                          onSelectedSectionChange(section.id);
                          onSelectedCategoryChange(null);
                        }}
                        className={`shrink-0 rounded-md font-semibold uppercase tracking-wide transition-all truncate touch-manipulation ${
                          compact
                            ? 'px-2 py-1 min-h-[28px] text-[8px] max-w-[6rem]'
                            : 'px-2.5 py-1.5 min-h-[32px] text-[9px] max-w-[7rem]'
                        } ${
                          active
                            ? 'text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                        }`}
                        style={active ? { backgroundColor: color } : undefined}
                        title={section.label}
                      >
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!isSearchMode && (
          <>
            {categories.length > 0 && (
              <div className={`shrink-0 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 ${compact ? 'px-1.5 py-1' : 'px-2 py-2'}`}>
                <div className={`flex overflow-x-auto scrollbar-hide items-start ${compact ? 'gap-1.5' : 'gap-2'}`}>
                  <button
                    type="button"
                    onClick={() => onSelectedCategoryChange(null)}
                    className={`shrink-0 flex flex-col items-center focus:outline-none ${compact ? 'gap-0.5 w-11' : 'gap-1 w-14'}`}
                  >
                    <span
                      className={`rounded-xl flex items-center justify-center font-bold transition-all ${
                        compact ? 'w-9 h-9 text-[9px]' : 'w-11 h-11 text-[10px]'
                      } ${
                        !selectedCategory
                          ? 'text-white shadow-md scale-105'
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                      }`}
                      style={!selectedCategory ? { backgroundColor: accentColor } : undefined}
                    >
                      ALL
                    </span>
                    <span className={`text-[9px] font-medium text-center leading-tight ${!selectedCategory ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>
                      Todas
                    </span>
                  </button>
                  {categories.map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => onSelectedCategoryChange(active ? null : cat)}
                        className={`shrink-0 flex flex-col items-center focus:outline-none ${compact ? 'gap-0.5 w-11' : 'gap-1 w-14'}`}
                      >
                        <span
                          className={`rounded-xl flex items-center justify-center font-bold transition-all ${
                            compact ? 'w-9 h-9 text-[9px]' : 'w-11 h-11 text-[10px]'
                          } ${
                            active
                              ? 'text-white shadow-md scale-105'
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                          }`}
                          style={
                            active
                              ? { backgroundColor: accentColor }
                              : { color: accentColor, backgroundColor: brandTint(accentColor, '14') }
                          }
                        >
                          {categoryShortLabel(cat)}
                        </span>
                        <span
                          className={`text-[9px] font-medium text-center leading-tight line-clamp-2 w-full px-0.5 ${
                            active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {cat}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!hasPricedProducts && !isSearchMode && (
          <div className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-800 dark:text-amber-300">Sin precios en catálogo.</p>
            {onImportCatalog && (
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

        <div className={`flex-1 min-h-0 overflow-y-auto ${compact ? 'p-1.5' : 'p-2'}`}>
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
              className={compact ? 'grid gap-1.5' : 'grid gap-2'}
              style={{
                gridTemplateColumns: compact
                  ? 'repeat(auto-fill, minmax(3.75rem, 1fr))'
                  : 'repeat(auto-fill, minmax(5.25rem, 1fr))',
              }}
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
                    compact={compact}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside
        className={
          compact
            ? 'w-[11.5rem] sm:w-[12.5rem] shrink-0 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-950/50 flex flex-col min-h-0 max-h-full overflow-hidden'
            : 'md:w-[17rem] xl:w-[18rem] shrink-0 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-950/50 flex flex-col min-h-[14rem] md:min-h-0 md:sticky md:top-14 md:self-start md:max-h-[calc(100dvh-8rem)]'
        }
      >
        {cartPanel}
      </aside>
    </div>
  );
}
