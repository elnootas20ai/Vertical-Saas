import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Euro,
  ListPlus,
  Save,
  AlertCircle,
  Package,
  Warehouse,
  Pencil,
  Calculator,
  Truck,
} from 'lucide-react';
import {
  catalogItemsUsingIngredient,
  inferTpvDefaultExtraPrice,
  ingredientChargesExtra,
  mergeDuplicateStoreIngredients,
  normalizeStoreIngredients,
  normalizeTpvDefaultExtraPrice,
  parseIngredientsBulkText,
  readStoreIngredientTpvFlags,
  resolveIngredientRole,
  resolveStoreIngredientBrandIds,
  withStoreIngredientTpvFlags,
  filterStoreIngredientsByBrand,
  countStoreIngredientsByBrand,
  explodeStoreIngredientsPerBrand,
  storeIngredientsNeedPerBrandSplit,
  unifyStoreIngredientsFromConfig,
  resolveBrandTpvCategoryKeys,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { getDeliveryConfigRequest, listCatalogItemsRequest, updateDeliveryConfigRequest, type CatalogItem } from '../../lib/deliveryApi';
import { notifyDeliveryConfigChanged } from '../../lib/deliverySetup';
import { applyVertialDefaultsToStoreIngredients, withVertialDefaultBaseCost } from '../../lib/vertialDefaultCosts';
import { normalizeTenantUserId } from '../../lib/tenantUserId';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { sortBrandsForDisplay } from '../../lib/brandUtils';
import {
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
  SaasTabEmpty,
  SaasTabWorkspace,
} from './SaasTabWorkspace';

const PART_OPTIONS: Array<{ value: TpvCategoryTemplateKey; label: string }> = [
  { value: 'pizzas', label: 'Pizzas' },
  { value: 'hamburguesas', label: 'Hamburguesas' },
];

type ListFilter = 'all' | 'extra' | 'base' | 'inventario';
type SortMode = 'name-asc' | 'name-desc' | 'extra-first';
type IngredientBadge = 'activo' | 'extra' | 'quitar' | 'inventario';

function ingredientNameFold(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function catalogInventoryItemsForIngredient(catalogItems: CatalogItem[], name: string): CatalogItem[] {
  const key = ingredientNameFold(name);
  if (!key) return [];
  return catalogItems.filter((item) => {
    if (ingredientNameFold(item.name) !== key) return false;
    return item.stockCategory === 'ingredient' || item.module === 'stock';
  });
}

function ingredientBadges(ing: StoreIngredient, catalogItems: CatalogItem[]): IngredientBadge[] {
  const badges: IngredientBadge[] = [];
  const flags = readStoreIngredientTpvFlags(ing);
  if (resolveIngredientRole(ing) !== 'escandallo') badges.push('activo');
  if (flags.chargeExtra) badges.push('extra');
  if (flags.allowRemove) badges.push('quitar');
  if (catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0) {
    badges.push('inventario');
  }
  return badges;
}

function ingredientMatchesInventarioFilter(ing: StoreIngredient, catalogItems: CatalogItem[]): boolean {
  return catalogInventoryItemsForIngredient(catalogItems, ing.name).length > 0;
}

function DetailCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 h-auto ${className}`}
    >
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function IngredientBadgePill({ kind }: { kind: IngredientBadge }) {
  const styles: Record<IngredientBadge, string> = {
    activo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    extra: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    quitar: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    inventario: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  };
  const labels: Record<IngredientBadge, string> = {
    activo: 'Activo',
    extra: 'Extra',
    quitar: 'Quitar',
    inventario: 'Inventario',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}

function toTpvPanelItems(list: StoreIngredient[]): StoreIngredient[] {
  const mapped = list
    .filter((ing) => resolveIngredientRole(ing) !== 'escandallo')
    .map((ing) => {
      const { extraPrices: _legacyPrices, extraPrice: _legacyPrice, ...rest } = ing;
      const flags = readStoreIngredientTpvFlags(ing);
      return withStoreIngredientTpvFlags(
        {
          ...rest,
          escandalloOnly: false,
        },
        flags,
      );
    });

  const seen = new Set<string>();
  return mapped.map((ing, index) => {
    const baseId = String(ing.id || '').trim() || `ing-${ingredientNameFold(ing.name)}-${index}`;
    let id = baseId;
    let n = 0;
    while (seen.has(id)) {
      n += 1;
      id = `${baseId}-${n}`;
    }
    seen.add(id);
    return id === ing.id ? ing : { ...ing, id };
  });
}

type IngredientDraft = {
  name: string;
  brandIds: string[];
  productParts: TpvCategoryTemplateKey[];
  chargeExtra: boolean;
  allowRemove: boolean;
};

function emptyDraft(allBrandIds: string[], chargeExtra: boolean): IngredientDraft {
  return {
    name: '',
    brandIds: [...allBrandIds],
    productParts: ['pizzas', 'hamburguesas'],
    chargeExtra,
    allowRemove: true,
  };
}

function togglePart(parts: TpvCategoryTemplateKey[], part: TpvCategoryTemplateKey): TpvCategoryTemplateKey[] {
  const set = new Set(parts);
  if (set.has(part)) set.delete(part);
  else set.add(part);
  return [...set];
}

function itemToDraft(ing: StoreIngredient, allBrandIds: string[]): IngredientDraft {
  const flags = readStoreIngredientTpvFlags(ing);
  return {
    name: ing.name,
    brandIds: resolveStoreIngredientBrandIds(ing, allBrandIds),
    productParts: ing.productParts?.length ? [...ing.productParts] : ['pizzas', 'hamburguesas'],
    chargeExtra: flags.chargeExtra,
    allowRemove: flags.allowRemove,
  };
}

function draftToItem(
  draft: IngredientDraft,
  allBrandIds: string[],
  existingId?: string,
): StoreIngredient | null {
  const name = draft.name.trim();
  const brandIds = draft.brandIds.length > 0 ? draft.brandIds : allBrandIds;
  if (!name || draft.productParts.length === 0) return null;
  if (allBrandIds.length > 0 && brandIds.length === 0) return null;
  return withStoreIngredientTpvFlags(
    {
      id: existingId || `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      escandalloOnly: false,
      ...(brandIds.length > 0 ? { brandIds: [...brandIds] } : {}),
      productParts: [...draft.productParts],
    },
    { chargeExtra: draft.chargeExtra, allowRemove: draft.allowRemove },
  );
}

function IngredientRow({
  draft,
  brands,
  onChange,
  onRemove,
  isNew,
  onAdd,
  fixedRole,
}: {
  draft: IngredientDraft;
  brands: Brand[];
  onChange: (next: IngredientDraft) => void;
  onRemove?: () => void;
  isNew?: boolean;
  onAdd?: () => void;
  fixedRole?: 'extra' | 'base';
}) {
  const showBrands = brands.length > 1;
  const brandSet = new Set(draft.brandIds);
  const partSet = new Set(draft.productParts);
  const chargeExtra = fixedRole ? fixedRole === 'extra' : draft.chargeExtra;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${
        isNew
          ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-950/20'
          : chargeExtra
            ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/40'
            : 'border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            if (isNew && e.key === 'Enter') {
              e.preventDefault();
              onAdd?.();
            }
          }}
          placeholder="Nombre del ingrediente"
          className="flex-1 min-w-[140px] px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800"
        />
        {PART_OPTIONS.map((part) => (
          <label
            key={part.value}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              partSet.has(part.value)
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={partSet.has(part.value)}
              onChange={() => onChange({ ...draft, productParts: togglePart(draft.productParts, part.value) })}
            />
            {part.label}
          </label>
        ))}
        {!fixedRole && (
          <>
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                draft.chargeExtra
                  ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={draft.chargeExtra}
                onChange={(e) => onChange({ ...draft, chargeExtra: e.target.checked })}
              />
              Extra
            </label>
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                draft.allowRemove
                  ? 'border-gray-400 bg-gray-50 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={draft.allowRemove}
                onChange={(e) => onChange({ ...draft, allowRemove: e.target.checked })}
              />
              Quitar
            </label>
          </>
        )}
        {isNew ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Añadir
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
            aria-label="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {showBrands && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {brands.map((brand) => {
            const on = brandSet.has(brand._id);
            return (
              <button
                key={brand._id}
                type="button"
                onClick={() => {
                  const next = new Set(draft.brandIds);
                  if (on) next.delete(brand._id);
                  else next.add(brand._id);
                  onChange({ ...draft, brandIds: [...next] });
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  on
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {brand.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sortIngredientList(items: StoreIngredient[], sortMode: SortMode): StoreIngredient[] {
  const list = [...items];
  list.sort((a, b) => {
    if (sortMode === 'extra-first') {
      const ae = readStoreIngredientTpvFlags(a).chargeExtra ? 0 : 1;
      const be = readStoreIngredientTpvFlags(b).chargeExtra ? 0 : 1;
      if (ae !== be) return ae - be;
    }
    const cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    return sortMode === 'name-desc' ? -cmp : cmp;
  });
  return list;
}

function IngredientMasterList({
  items,
  selectedId,
  onSelect,
  search,
  listFilter,
  sortMode,
  catalogItems,
}: {
  items: StoreIngredient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  listFilter: ListFilter;
  sortMode: SortMode;
  catalogItems: CatalogItem[];
}) {
  const filtered = useMemo(
    () => sortIngredientList(filterVisibleItems(items, search, listFilter, catalogItems), sortMode),
    [items, search, listFilter, sortMode, catalogItems],
  );

  if (items.length === 0) {
    return (
      <SaasTabEmpty
        icon={<Package className="w-8 h-8" />}
        title="Sin ingredientes"
        description="Importa Excel en Catálogo o añade una lista."
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="py-6 px-4 text-center text-xs text-gray-500">
        Sin resultados{search.trim() ? ` para «${search.trim()}»` : ''}.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800 overflow-y-auto flex-1 min-h-0">
      {filtered.map((ing) => {
        const active = ing.id === selectedId;
        const badges = ingredientBadges(ing, catalogItems);
        return (
          <li key={ing.id}>
            <button
              type="button"
              onClick={() => onSelect(ing.id)}
              className={`w-full flex flex-col gap-1 px-2.5 py-2 text-left transition-colors ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 border-l-2 border-indigo-500'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 border-l-2 border-transparent'
              }`}
            >
              <span className="w-full text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {ing.name}
              </span>
              <span className="flex flex-wrap gap-0.5">
                {badges.map((b) => (
                  <IngredientBadgePill key={b} kind={b} />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TpvToggleRow({
  label,
  checked,
  onChange,
  disabled,
  highlight,
}: {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-2 px-2.5 rounded-lg border text-sm ${
        highlight
          ? 'border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20'
          : 'border-gray-200 dark:border-gray-700'
      } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
    >
      <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        readOnly={!onChange}
        className="rounded border-gray-300"
      />
    </label>
  );
}

function IngredientDetailSheet({
  ingredient,
  brands,
  allBrandIds,
  multiBrand,
  activeBrandId,
  catalogItems,
  editMode,
  onEditModeChange,
  onUpdateTpvFlags,
  onUpdate,
  onRemove,
  onUpdateBaseCost,
}: {
  ingredient: StoreIngredient;
  brands: Brand[];
  allBrandIds: string[];
  multiBrand: boolean;
  activeBrandId: string;
  catalogItems: CatalogItem[];
  editMode: boolean;
  onEditModeChange: (open: boolean) => void;
  onUpdateTpvFlags: (patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>) => void;
  onUpdate: (draft: IngredientDraft) => void;
  onRemove: () => void;
  onUpdateBaseCost: (baseCost: number) => void;
}) {
  const [showAllProducts, setShowAllProducts] = useState(false);
  const tpvFlags = readStoreIngredientTpvFlags(ingredient);
  const badges = ingredientBadges(ingredient, catalogItems);
  const relatedProducts = useMemo(
    () =>
      catalogItemsUsingIngredient(catalogItems, ingredient.name, {
        brandId: multiBrand ? activeBrandId : undefined,
      }),
    [catalogItems, ingredient.name, multiBrand, activeBrandId],
  );
  const inventoryItems = useMemo(
    () => catalogInventoryItemsForIngredient(catalogItems, ingredient.name),
    [catalogItems, ingredient.name],
  );
  const ingredientBrands = useMemo(() => {
    const ids = resolveStoreIngredientBrandIds(ingredient, allBrandIds);
    return brands.filter((b) => ids.includes(b._id));
  }, [ingredient, allBrandIds, brands]);
  const primarySupplier = inventoryItems.find((i) => i.supplierName)?.supplierName || null;

  const hasInventoryData = inventoryItems.length > 0;
  const visibleProducts = showAllProducts ? relatedProducts : relatedProducts.slice(0, 5);
  const [baseCostDraft, setBaseCostDraft] = useState(
    () => (ingredient.baseCost != null ? String(ingredient.baseCost) : ''),
  );

  useEffect(() => {
    setShowAllProducts(false);
    setBaseCostDraft(ingredient.baseCost != null ? String(ingredient.baseCost) : '');
  }, [ingredient.id]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 dark:border-gray-700/80">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
              Ingrediente
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{ingredient.name}</h2>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {badges.map((b) => (
                <IngredientBadgePill key={b} kind={b} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ingredientBrands.length > 0 ? (
                ingredientBrands.map((b) => (
                  <span
                    key={b._id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: b.primaryColor || '#6366f1' }}
                    />
                    {b.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500">Todas las marcas</span>
              )}
            </div>
          </div>
          {!editMode ? (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <SaasTabSecondaryButton onClick={() => onEditModeChange(true)}>
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </SaasTabSecondaryButton>
              <SaasTabSecondaryButton
                onClick={onRemove}
                className="!border-red-200 !text-red-700 hover:!bg-red-50 dark:hover:!bg-red-950/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </SaasTabSecondaryButton>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {editMode ? (
          <DetailCard title="Editar ingrediente" className="mb-3">
            <IngredientRow
              brands={multiBrand ? brands.filter((b) => b._id === activeBrandId) : brands}
              draft={itemToDraft(ingredient, allBrandIds)}
              onChange={onUpdate}
              onRemove={onRemove}
            />
            <button
              type="button"
              onClick={() => onEditModeChange(false)}
              className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              Cerrar edición
            </button>
          </DetailCard>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start auto-rows-min">
          <DetailCard title="TPV">
            <div className="space-y-1.5">
              <TpvToggleRow label="Visible en TPV" checked disabled />
              <TpvToggleRow
                label="Puede añadirse como extra"
                checked={tpvFlags.chargeExtra}
                highlight
                onChange={(checked) => onUpdateTpvFlags({ chargeExtra: checked })}
              />
              <TpvToggleRow
                label="Puede quitarse del producto"
                checked={tpvFlags.allowRemove}
                onChange={(checked) => onUpdateTpvFlags({ allowRemove: checked })}
              />
              {tpvFlags.chargeExtra ? (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 px-1 pt-0.5">
                  El precio del extra se configura arriba en la barra de estadísticas.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {(ingredient.productParts?.length
                  ? ingredient.productParts
                  : (['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[])
                ).map((part) => (
                  <span
                    key={part}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800"
                  >
                    {part === 'pizzas' ? 'Pizzas' : 'Hamburguesas'}
                  </span>
                ))}
              </div>
            </div>
          </DetailCard>

          <DetailCard title="Relaciones">
            <div className="space-y-2 text-sm">
              {relatedProducts.length === 0 ? (
                <p className="text-xs text-gray-500">Ningún producto utiliza este ingrediente</p>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {relatedProducts.length} producto{relatedProducts.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1">
                    {visibleProducts.map((p) => (
                      <li key={p._id}>
                        <Link
                          to="/saas/catalog"
                          className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400 line-clamp-1"
                        >
                          {p.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {relatedProducts.length > 5 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllProducts((v) => !v)}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      {showAllProducts ? 'Ver menos' : `Ver todos (${relatedProducts.length})`}
                    </button>
                  ) : null}
                </>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 mt-1 border-t border-gray-100 dark:border-gray-800 text-xs">
                <Link
                  to="/saas/catalog?tab=escandallo"
                  className="inline-flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400 hover:underline"
                >
                  <Calculator className="w-3 h-3" />
                  Escandallos
                </Link>
                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  <Truck className="w-3 h-3 text-gray-400" />
                  {primarySupplier || 'Sin proveedor'}
                </span>
              </div>
            </div>
          </DetailCard>

          <DetailCard title="Inventario">
            <div className="space-y-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400">
                Coste base (€ / unidad)
                <input
                  type="text"
                  inputMode="decimal"
                  value={baseCostDraft}
                  onChange={(e) => setBaseCostDraft(e.target.value)}
                  onBlur={() => {
                    const raw = baseCostDraft.trim().replace(',', '.');
                    const n = raw === '' ? 0 : Number(raw);
                    if (!Number.isFinite(n) || n < 0) {
                      setBaseCostDraft(ingredient.baseCost != null ? String(ingredient.baseCost) : '');
                      return;
                    }
                    const rounded = Math.round(n * 100) / 100;
                    setBaseCostDraft(String(rounded));
                    onUpdateBaseCost(rounded);
                  }}
                  placeholder="0,00"
                  className="mt-1 w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
                />
              </label>
              <p className="text-[11px] text-gray-400">Se usa en escandallos. Guarda TPV para persistir.</p>
              {hasInventoryData ? (
                <div className="space-y-2 opacity-70 pt-1 border-t border-gray-100 dark:border-gray-800">
                  <TpvToggleRow label="Controlar inventario" checked={false} disabled />
                  <Link
                    to="/saas/catalog?tab=stock"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    <Warehouse className="w-3 h-3" />
                    Ver en inventario
                  </Link>
                </div>
              ) : null}
            </div>
          </DetailCard>
        </div>
      </div>
    </div>
  );
}

function filterVisibleItems(
  items: StoreIngredient[],
  search: string,
  listFilter: ListFilter,
  catalogItems: CatalogItem[],
): StoreIngredient[] {
  const q = search.trim().toLowerCase();
  let list = items;
  if (listFilter === 'extra') {
    list = list.filter((i) => readStoreIngredientTpvFlags(i).chargeExtra);
  }
  if (listFilter === 'base') {
    list = list.filter((i) => readStoreIngredientTpvFlags(i).allowRemove);
  }
  if (listFilter === 'inventario') {
    list = list.filter((i) => ingredientMatchesInventarioFilter(i, catalogItems));
  }
  if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
  return list;
}

export function StoreIngredientsPanel({ userId, businessId }: { userId: string; businessId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configDocId, setConfigDocId] = useState<string | undefined>();
  const [configRev, setConfigRev] = useState<string | undefined>();
  const [items, setItems] = useState<StoreIngredient[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newDraft, setNewDraft] = useState<IngredientDraft>(() => emptyDraft([], false));
  const [defaultExtraPrice, setDefaultExtraPrice] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  const commitItems = useCallback((updater: StoreIngredient[] | ((prev: StoreIngredient[]) => StoreIngredient[])) => {
    setItems((prev) => {
      const raw = typeof updater === 'function' ? updater(prev) : updater;
      const { items: deduped, mergedCount } = mergeDuplicateStoreIngredients(raw);
      if (mergedCount > 0) {
        toast.message(`Fusionamos ${mergedCount} duplicado(s) automáticamente`, { duration: 4500 });
        setDirty(true);
      }
      return deduped;
    });
  }, []);

  const [selectedBrandId, setSelectedBrandId] = useState('');

  const allBrandIds = useMemo(() => brands.map((b) => b._id), [brands]);
  const multiBrand = brands.length > 1;
  const activeBrandId = multiBrand
    ? selectedBrandId && allBrandIds.includes(selectedBrandId)
      ? selectedBrandId
      : allBrandIds[0] || ''
    : allBrandIds[0] || '';
  const activeBrand = brands.find((b) => b._id === activeBrandId);
  const brandScopedItems = useMemo(
    () => (multiBrand ? filterStoreIngredientsByBrand(items, activeBrandId, allBrandIds) : items),
    [items, multiBrand, activeBrandId, allBrandIds],
  );
  const hasExtras = useMemo(
    () => items.some((i) => readStoreIngredientTpvFlags(i).chargeExtra),
    [items],
  );
  const extraItems = useMemo(
    () => brandScopedItems.filter((i) => readStoreIngredientTpvFlags(i).chargeExtra),
    [brandScopedItems],
  );
  const baseItems = useMemo(
    () => brandScopedItems.filter((i) => readStoreIngredientTpvFlags(i).allowRemove),
    [brandScopedItems],
  );
  const inventarioItems = useMemo(
    () => brandScopedItems.filter((i) => ingredientMatchesInventarioFilter(i, catalogItems)),
    [brandScopedItems, catalogItems],
  );

  const handleBrandChange = (id: string) => {
    setSelectedBrandId(id);
    setSearch('');
    setListFilter('all');
    setSelectedId(null);
    setEditMode(false);
    setNewDraft(emptyDraft([id], false));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const cfg = await Promise.race([
        getDeliveryConfigRequest(userId),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('timeout')), 15_000);
        }),
      ]);
      const catalog = await listCatalogItemsRequest(userId, 'catalog').catch(() => []);
      setCatalogItems(catalog);
      const lineBrands = sortBrandsForDisplay(
        businessId ? commercialLineBrands(await listBrandsRequest(businessId).catch(() => [])) : [],
      );
      const brandIds = lineBrands.map((b) => b._id);
      const merged = unifyStoreIngredientsFromConfig(cfg, brandIds);
      const split = explodeStoreIngredientsPerBrand(merged, lineBrands);
      const unified = toTpvPanelItems(split);
      const { items: deduped, mergedCount } = mergeDuplicateStoreIngredients(unified);
      const { items: withCosts, appliedCount } = applyVertialDefaultsToStoreIngredients(deduped, lineBrands);
      const needsPersistSplit =
        lineBrands.length > 1 && storeIngredientsNeedPerBrandSplit(merged, brandIds);

      setConfigDocId(cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`);
      setConfigRev(cfg._rev);
      setBrands(lineBrands);
      setItems(withCosts);
      if (mergedCount > 0) {
        setDirty(true);
        toast.message(`Fusionamos ${mergedCount} duplicado(s) al cargar`, { duration: 5000 });
      } else if (appliedCount > 0) {
        setDirty(true);
        toast.message(`Costes de referencia Vertial aplicados a ${appliedCount} ingrediente(s)`, {
          duration: 5000,
        });
      }

      if (needsPersistSplit && deduped.length > 0) {
        try {
          const saved = await updateDeliveryConfigRequest(userId, {
            _id: cfg._id || `dlvconf-${normalizeTenantUserId(userId)}`,
            _rev: cfg._rev,
            storeIngredients: normalizeStoreIngredients(deduped),
          } as Parameters<typeof updateDeliveryConfigRequest>[1]);
          setConfigDocId(saved._id || cfg._id);
          setConfigRev(saved._rev);
          notifyDeliveryConfigChanged();
          toast.success('Ingredientes separados por marca (modomio / blackburger…)', { duration: 5000 });
        } catch {
          setDirty(true);
          toast.message('Revisa y guarda: hay ingredientes compartidos entre marcas', { duration: 6000 });
        }
      } else {
        setDirty(false);
      }
      setSelectedBrandId((prev) =>
        prev && brandIds.includes(prev) ? prev : brandIds[0] || '',
      );
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(unified, cfg.tpvDefaultExtraPrice) || ''));
      setNewDraft(emptyDraft(brandIds, false));
    } catch {
      setLoadError('Error al cargar');
      toast.error('No se pudieron cargar los ingredientes');
    } finally {
      setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const validateDraft = (draft: IngredientDraft): string | null => {
    if (!draft.name.trim()) return 'Escribe el nombre';
    if (multiBrand && draft.brandIds.length === 0) return 'Elige al menos una marca';
    if (!multiBrand && allBrandIds.length > 0 && draft.brandIds.length === 0) return 'Elige al menos una marca';
    if (draft.productParts.length === 0) return 'Elige pizzas o hamburguesas';
    return null;
  };

  const validateSave = (): string | null => {
    if (!hasExtras) return null;
    const price = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
    if (price == null) return 'Indica el precio de los extras';
    return null;
  };

  const addItem = (draft: IngredientDraft) => {
    const err = validateDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    const created = draftToItem(draft, allBrandIds);
    if (!created) return;
    const row = withVertialDefaultBaseCost(created, brands);
    commitItems((prev) => [...prev, row]);
    setNewDraft(emptyDraft(allBrandIds, false));
    setSearch('');
    setDirty(true);
    setSelectedId(row.id);
    setEditMode(false);
    toast.success(`«${row.name}» añadido`);
  };

  const importBulk = () => {
    const names = parseIngredientsBulkText(bulkText);
    if (names.length === 0) return;

    if (multiBrand && !activeBrandId) {
      toast.error('Elige una marca antes de añadir la lista');
      return;
    }

    const targetBrandIds =
      multiBrand && activeBrandId ? [activeBrandId] : allBrandIds.length > 0 ? [...allBrandIds] : [];
    const targetParts =
      activeBrand && resolveBrandTpvCategoryKeys(activeBrand).length > 0
        ? resolveBrandTpvCategoryKeys(activeBrand)
        : (['pizzas', 'hamburguesas'] as TpvCategoryTemplateKey[]);

    let added = 0;
    let promoted = 0;
    let skipped = 0;
    let brandTotal = 0;

    commitItems((prev) => {
      const next = [...prev];
      let seq = 0;
      for (const rawName of names) {
        const name = rawName.trim();
        if (!name) continue;
        const key = ingredientNameFold(name);
        const idx = next.findIndex(
          (i) =>
            ingredientNameFold(i.name) === key &&
            (!multiBrand ||
              filterStoreIngredientsByBrand([i], activeBrandId, allBrandIds).length > 0),
        );
        if (idx >= 0) {
          if (!readStoreIngredientTpvFlags(next[idx]).chargeExtra) {
            promoted += 1;
            next[idx] = withStoreIngredientTpvFlags(next[idx], { chargeExtra: true, allowRemove: true });
          } else {
            skipped += 1;
          }
          continue;
        }
        added += 1;
        seq += 1;
        next.push(
          withVertialDefaultBaseCost(
            withStoreIngredientTpvFlags(
              {
                id: `ing-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 9)}`,
                name,
                escandalloOnly: false,
                ...(targetBrandIds.length > 0 ? { brandIds: [...targetBrandIds] } : {}),
                productParts: [...targetParts],
              },
              { chargeExtra: true, allowRemove: true },
            ),
            brands,
          ),
        );
      }
      const normalized = toTpvPanelItems(next);
      brandTotal = multiBrand
        ? normalized.filter(
            (i) => filterStoreIngredientsByBrand([i], activeBrandId, allBrandIds).length > 0,
          ).length
        : normalized.length;
      return normalized;
    });

    setBulkText('');
    setSearch('');
    setListFilter('all');
    setDirty(true);

    const brandLabel = activeBrand?.name || 'esta marca';
    const parts: string[] = [`${names.length} en la lista`];
    if (added > 0) parts.push(`${added} nuevo(s)`);
    if (promoted > 0) parts.push(`${promoted} marcado(s) como extra`);
    if (skipped > 0) parts.push(`${skipped} ya eran extra`);
    parts.push(`${brandTotal} en ${brandLabel}`);

    if (added > 0 || promoted > 0) {
      toast.success(`${parts.join(' · ')}. Pulsa «Guardar en el TPV».`, { duration: 9000 });
    } else if (skipped > 0) {
      toast.info(`${parts.join(' · ')} — no había nada nuevo que añadir.`, { duration: 8000 });
    } else {
      toast.warning('No se reconoció ningún nombre. Usa comas o una línea por ingrediente.');
    }
  };

  const updateItem = (id: string, draft: IngredientDraft) => {
    commitItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const brandIds =
          draft.brandIds.length > 0
            ? draft.brandIds
            : allBrandIds.length > 0
              ? allBrandIds
              : i.brandIds || [];
        const productParts =
          draft.productParts.length > 0 ? draft.productParts : ['pizzas', 'hamburguesas'];
        const name = draft.name.trim() || i.name;
        return withStoreIngredientTpvFlags(
          {
            ...i,
            name,
            brandIds: [...brandIds],
            productParts: [...productParts],
          },
          { chargeExtra: draft.chargeExtra, allowRemove: draft.allowRemove },
        );
      }),
    );
    setDirty(true);
  };

  const removeItem = (id: string) => {
    commitItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  const updateIngredientTpvFlags = (
    id: string,
    patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>,
  ) => {
    commitItems((prev) =>
      prev.map((i) => (i.id === id ? withStoreIngredientTpvFlags(i, patch) : i)),
    );
    setDirty(true);
  };

  const toggleManyTpvFlags = (
    ids: string[],
    patch: Partial<{ chargeExtra: boolean; allowRemove: boolean }>,
  ) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitItems((prev) =>
      prev.map((i) => (idSet.has(i.id) ? withStoreIngredientTpvFlags(i, patch) : i)),
    );
    setDirty(true);
  };

  const selectedIngredient = useMemo(
    () => brandScopedItems.find((i) => i.id === selectedId) ?? null,
    [brandScopedItems, selectedId],
  );

  useEffect(() => {
    setEditMode(false);
  }, [selectedId]);

  useEffect(() => {
    if (brandScopedItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !brandScopedItems.some((i) => i.id === selectedId)) {
      const first =
        sortIngredientList(filterVisibleItems(brandScopedItems, search, listFilter, catalogItems), sortMode)[0]
          ?.id ??
        brandScopedItems[0]?.id ??
        null;
      setSelectedId(first);
    }
  }, [brandScopedItems, selectedId, search, listFilter, sortMode, catalogItems]);

  const updateIngredientBaseCost = (id: string, baseCost: number) => {
    commitItems((prev) => prev.map((i) => (i.id === id ? { ...i, baseCost } : i)));
  };

  const save = async () => {
    const rows = items.filter((i) => String(i.name || '').trim());
    if (rows.length === 0) {
      toast.error('Añade al menos un ingrediente antes de guardar');
      return;
    }
    const err = validateSave();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const tpvDefaultExtraPrice = normalizeTpvDefaultExtraPrice(defaultExtraPrice);
      const saved = await updateDeliveryConfigRequest(userId, {
        _id: configDocId || `dlvconf-${normalizeTenantUserId(userId)}`,
        _rev: configRev,
        storeIngredients: normalizeStoreIngredients(rows),
        ...(tpvDefaultExtraPrice != null ? { tpvDefaultExtraPrice } : {}),
      } as Parameters<typeof updateDeliveryConfigRequest>[1]);
      setConfigDocId(saved._id || configDocId);
      setConfigRev(saved._rev);
      const merged = unifyStoreIngredientsFromConfig(saved, allBrandIds);
      const split = explodeStoreIngredientsPerBrand(merged, brands);
      const unified = toTpvPanelItems(split);
      const { items: deduped } = mergeDuplicateStoreIngredients(unified);
      setItems(deduped);
      setDefaultExtraPrice(String(inferTpvDefaultExtraPrice(deduped, saved.tpvDefaultExtraPrice) || ''));
      setDirty(false);
      notifyDeliveryConfigChanged();
      const savedExtras = deduped.filter((i) => ingredientChargesExtra(i)).length;
      const savedBase = deduped.length - savedExtras;
      if (savedExtras === 0) {
        toast.warning('Guardado, pero ningún extra de pago marcado. Márcalos en la ficha del ingrediente.', {
          duration: 8000,
        });
      } else {
        toast.success(`Guardado · ${savedExtras} extras · ${savedBase} incluidos`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const priceOk = !hasExtras || normalizeTpvDefaultExtraPrice(defaultExtraPrice) != null;
  const filteredVisible = filterVisibleItems(brandScopedItems, search, listFilter, catalogItems).length;
  const canSave = !saving && priceOk;

  const markAllBrandAsExtra = () => {
    toggleManyTpvFlags(
      brandScopedItems.map((i) => i.id),
      { chargeExtra: true },
    );
  };

  const markVisibleAsExtra = () => {
    toggleManyTpvFlags(
      filterVisibleItems(brandScopedItems, search, listFilter, catalogItems).map((i) => i.id),
      { chargeExtra: true },
    );
  };

  const markVisibleAsBase = () => {
    toggleManyTpvFlags(
      filterVisibleItems(brandScopedItems, search, listFilter, catalogItems).map((i) => i.id),
      { chargeExtra: false, allowRemove: true },
    );
  };

  return (
    <div className="pb-20 lg:pb-4">
      <SaasTabWorkspace
        stats={[
          { label: 'total', value: brandScopedItems.length },
          { label: 'extras', value: extraItems.length, tone: 'amber' },
          { label: 'quitar', value: baseItems.length },
          { label: 'inventario', value: inventarioItems.length, tone: 'indigo' },
        ]}
        statsTrailing={
          <>
            <label className="inline-flex items-center gap-1">
              <Euro className="w-3 h-3 text-gray-400" />
              <span className="text-gray-500">Extra</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={defaultExtraPrice}
                onChange={(e) => {
                  setDefaultExtraPrice(e.target.value);
                  setDirty(true);
                }}
                className="w-16 px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-xs font-semibold bg-white dark:bg-gray-800 focus:border-amber-400 outline-none"
                title="Precio por defecto de los extras en el TPV"
              />
              <span>€</span>
            </label>
            <SaasTabPrimaryButton
              disabled={!canSave}
              onClick={() => void save()}
              className={
                dirty
                  ? ''
                  : '!bg-emerald-50 !text-emerald-800 border border-emerald-300 dark:!bg-emerald-950/30 dark:!text-emerald-200 dark:border-emerald-700 hover:!bg-emerald-100'
              }
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : dirty ? 'Guardar TPV' : 'Guardado'}
            </SaasTabPrimaryButton>
          </>
        }
        banner={
          dirty ? (
            <p className="text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Cambios pendientes — no llegan al TPV hasta guardar.
              {hasExtras && !priceOk ? ' Indica el precio del extra.' : ''}
            </p>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,25%)_1fr] lg:h-[min(72vh,680px)] divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-700">
          <aside className="flex flex-col min-h-[240px] lg:min-h-0 lg:max-h-full bg-gray-50/40 dark:bg-gray-900/20 overflow-hidden">
            <div className="p-2.5 space-y-2 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <SaasTabSearch value={search} onChange={setSearch} className="relative w-full" />
              {multiBrand ? (
                <label className="block text-xs text-gray-500">
                  Marca
                  <select
                    value={activeBrandId}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    className="mt-1 w-full py-1.5 pl-2 pr-7 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium bg-white dark:bg-gray-900 outline-none"
                  >
                    {brands.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name} ({countStoreIngredientsByBrand(items, b._id, allBrandIds)})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {([
                  { id: 'all' as const, label: 'Todos', count: brandScopedItems.length },
                  { id: 'extra' as const, label: 'Extras', count: extraItems.length },
                  { id: 'base' as const, label: 'Quitar', count: baseItems.length },
                  { id: 'inventario' as const, label: 'Inventario', count: inventarioItems.length },
                ]).map(({ id, label, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setListFilter(id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                      listFilter === id
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {label} {count}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="py-1 pl-1.5 pr-6 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-semibold bg-white dark:bg-gray-900 outline-none"
                  title="Ordenar"
                >
                  <option value="name-asc">A→Z</option>
                  <option value="name-desc">Z→A</option>
                  <option value="extra-first">Extras primero</option>
                </select>
                <SaasTabSecondaryButton
                  onClick={() => setShowBulkPanel((v) => !v)}
                  className="!border-emerald-200 !text-emerald-800 !bg-emerald-50 dark:!bg-emerald-950/30 dark:!text-emerald-200"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  Lista
                </SaasTabSecondaryButton>
              </div>
              <details className="text-[11px]">
                <summary className="cursor-pointer font-semibold text-gray-500 hover:text-gray-700 select-none">
                  Marcar en lote
                </summary>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={markAllBrandAsExtra}
                    disabled={brandScopedItems.length === 0}
                    className="px-2 py-1 rounded-md font-semibold border border-amber-200 text-amber-800 bg-amber-50 disabled:opacity-40"
                  >
                    Todos extra
                  </button>
                  <button
                    type="button"
                    onClick={markVisibleAsExtra}
                    disabled={filteredVisible === 0}
                    className="px-2 py-1 rounded-md font-semibold border border-amber-200 text-amber-800 bg-amber-50 disabled:opacity-40"
                  >
                    Visibles → extra
                  </button>
                  <button
                    type="button"
                    onClick={markVisibleAsBase}
                    disabled={filteredVisible === 0}
                    className="px-2 py-1 rounded-md font-semibold border border-gray-200 text-gray-600 bg-white disabled:opacity-40"
                  >
                    Visibles → quitar
                  </button>
                </div>
              </details>
              {showBulkPanel ? (
                <div className="space-y-1.5">
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={3}
                    placeholder={'Mozzarella, Tomate, Bacon…'}
                    className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 resize-none focus:border-emerald-400 outline-none"
                  />
                  <SaasTabPrimaryButton
                    onClick={() => {
                      importBulk();
                      setShowBulkPanel(false);
                    }}
                    disabled={!bulkText.trim()}
                    className="!bg-emerald-600 hover:!bg-emerald-700"
                  >
                    <Plus className="w-3 h-3" />
                    Añadir
                  </SaasTabPrimaryButton>
                </div>
              ) : null}
            </div>
            <IngredientMasterList
              items={brandScopedItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              search={search}
              listFilter={listFilter}
              sortMode={sortMode}
              catalogItems={catalogItems}
            />
          </aside>

          <main className="min-h-[280px] lg:min-h-0 lg:h-full flex flex-col overflow-hidden bg-white dark:bg-gray-800/50">
            {selectedIngredient ? (
              <IngredientDetailSheet
                ingredient={selectedIngredient}
                brands={brands}
                allBrandIds={allBrandIds}
                multiBrand={multiBrand}
                activeBrandId={activeBrandId}
                catalogItems={catalogItems}
                editMode={editMode}
                onEditModeChange={setEditMode}
                onUpdateTpvFlags={(patch) => updateIngredientTpvFlags(selectedIngredient.id, patch)}
                onUpdate={(draft) => updateItem(selectedIngredient.id, draft)}
                onRemove={() => {
                  removeItem(selectedIngredient.id);
                  toast.success(`«${selectedIngredient.name}» eliminado`);
                }}
                onUpdateBaseCost={(baseCost) => updateIngredientBaseCost(selectedIngredient.id, baseCost)}
              />
            ) : (
              <div className="flex flex-col h-full overflow-y-auto">
                <SaasTabEmpty
                  icon={<Package className="w-10 h-10" />}
                  title="Selecciona un ingrediente"
                  description="Elige uno de la lista o crea uno nuevo abajo."
                />
                <div className="px-4 pb-4 shrink-0">
                  <IngredientRow
                  brands={multiBrand && activeBrand ? [activeBrand] : brands}
                  draft={
                    multiBrand && activeBrandId
                      ? { ...newDraft, brandIds: [activeBrandId] }
                      : newDraft
                  }
                  onChange={setNewDraft}
                  isNew
                  onAdd={() =>
                    addItem(
                      multiBrand && activeBrandId
                        ? { ...newDraft, brandIds: [activeBrandId] }
                        : newDraft,
                    )
                  }
                />
                </div>
              </div>
            )}
          </main>
        </div>
      </SaasTabWorkspace>

      {dirty ? (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-gray-900 px-4 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <SaasTabPrimaryButton
            disabled={!canSave}
            onClick={() => void save()}
            className="w-full justify-center py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar TPV
          </SaasTabPrimaryButton>
        </div>
      ) : null}
    </div>
  );
}
