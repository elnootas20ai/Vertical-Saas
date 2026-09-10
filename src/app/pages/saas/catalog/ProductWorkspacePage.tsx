import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useBusinessOptional } from '../../../context/BusinessContext';
import { CreateCatalogItemModal } from '../../../components/saas/CreateCatalogItemModal';
import { VertialLoadingState } from '../../../components/VertialLoadingState';
import { listBrandsRequest, type Brand } from '../../../lib/brandsApi';
import {
  activateCommercialLinesAfterCatalogImport,
  syncTpvOrganizersAfterCatalogImport,
  normalizeImportCategory,
} from '../../../lib/deliveryCatalogImport';
import {
  createCatalogItemRequest,
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  listDeliveryOrdersRequest,
  updateCatalogItemRequest,
  type CatalogItem,
  type DeliveryOrder,
} from '../../../lib/deliveryApi';
import {
  unifyStoreIngredientsFromConfig,
  resolveTpvBrandConfigFromDeliveryConfig,
  type StoreIngredient,
  type TpvBrandIngredientSelection,
} from '../../../lib/catalogCustomization';
import { findCatalogDuplicateByName, formatCatalogDuplicateNameError } from '../../../lib/catalogBusinessScope';
import { computeCatalogItemSalesStats } from '../../../lib/catalogItemSalesStats';
import { filterStockInventoryItems } from '../../../lib/stockInventoryScope';
import { syncInventoryCatalogFromSources } from '../../../lib/inventorySync';
import { syncRecipesFromCostingCatalog } from '../../../lib/recipeSyncFromCosting';
import { notifyDeliveryCatalogChanged } from '../../../lib/deliverySetup';
import { resolveBusinessScopeId } from '../../../lib/businessStoreScope';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  isDeliveryOpsBusinessType,
  isEventsBusinessType,
  isIceCreamShopBusinessType,
  isRestaurantBusinessType,
} from '../../../lib/deliveryOpsTypes';
import { commercialLineBrands } from '../../../lib/deliveryCatalogImportLogic';
import {
  CATALOG_PRODUCT_RETURN_DEFAULT,
  CATALOG_PRODUCT_WORKSPACE,
  resolveCatalogProductReturnTo,
  type CatalogProductReturnState,
} from '../../../lib/catalogProductWorkspacePaths';
import { formatMoneyEs } from '../../../lib/formatNumberEs';

function ProductResultadosPanel({
  item,
  orders,
  loading,
}: {
  item: CatalogItem;
  orders: DeliveryOrder[];
  loading: boolean;
}) {
  const stats = useMemo(() => computeCatalogItemSalesStats(item, orders), [item, orders]);
  if (loading) {
    return <p className="text-sm text-stone-500">Cargando resultados…</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Control de ventas del producto (hoy / 7 días / mes / total).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Hoy', stats.todayUnits, stats.todayRevenue],
            ['7 días', stats.weekUnits, stats.weekRevenue],
            ['Mes', stats.monthUnits, stats.monthRevenue],
            ['Total', stats.totalUnits, stats.totalRevenue],
          ] as const
        ).map(([label, units, revenue]) => (
          <div
            key={label}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-950/40"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
            <p className="mt-1 text-lg font-bold text-stone-900 dark:text-stone-100">{units}</p>
            <p className="text-xs text-stone-500">{formatMoneyEs(revenue)}</p>
          </div>
        ))}
      </div>
      {stats.lastSoldAt ? (
        <p className="text-xs text-stone-500">
          Última venta: {new Date(stats.lastSoldAt).toLocaleString('es-ES')}
        </p>
      ) : (
        <p className="text-xs text-stone-500">Aún no hay ventas registradas de este producto.</p>
      )}
    </div>
  );
}

export function ProductWorkspacePage() {
  const { productId } = useParams<{ productId?: string }>();
  const isNew = !productId || productId === 'nuevo';
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  const businessId = resolveBusinessScopeId(businessCtx?.currentBusiness);
  const dataUserId = resolveBusinessDataUserId(user, businessCtx?.currentBusiness);
  const businessType = businessCtx?.currentBusiness?.businessType ?? null;
  const isRestaurantCatalog = isRestaurantBusinessType(businessType);
  const isDeliveryOps = isDeliveryOpsBusinessType(businessType);
  const isHeladeria = isIceCreamShopBusinessType(businessType);
  const isEvents = isEventsBusinessType(businessType);
  const usesTpvCatalogUi = isDeliveryOps || isRestaurantCatalog || isHeladeria || isEvents;
  const catalogVertical = isRestaurantCatalog
    ? 'restaurant'
    : isHeladeria
      ? 'heladeria'
      : isEvents
        ? 'events'
        : 'delivery';

  const returnTo = resolveCatalogProductReturnTo(location.state, CATALOG_PRODUCT_RETURN_DEFAULT);
  const seedFromState = (location.state as CatalogProductReturnState & { seedProductId?: string }) || {};

  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [seedFromProduct, setSeedFromProduct] = useState<CatalogItem | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [brandIngredientSelection, setBrandIngredientSelection] = useState<TpvBrandIngredientSelection>({});
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const goBack = useCallback(() => {
    navigate(returnTo);
  }, [navigate, returnTo]);

  const loadAll = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [brandList, items, config] = await Promise.all([
        listBrandsRequest(dataUserId).catch(() => [] as Brand[]),
        listCatalogItemsRequest(dataUserId).catch(() => [] as CatalogItem[]),
        getDeliveryConfigRequest(dataUserId).catch(() => null),
      ]);
      setBrands(Array.isArray(brandList) ? brandList : []);
      const safeItems = (Array.isArray(items) ? items : []).filter((i) => !i.deletedAt);
      setCatalogItems(safeItems);

      const lineBrands = commercialLineBrands(brandList || []);
      const brandIds = lineBrands.map((b) => b._id);
      if (config) {
        const unified = unifyStoreIngredientsFromConfig(config, brandIds);
        setStoreIngredients(unified);
        const { ingredientSelection } = resolveTpvBrandConfigFromDeliveryConfig(config, brandIds);
        setBrandIngredientSelection(ingredientSelection || {});
      } else {
        setStoreIngredients([]);
        setBrandIngredientSelection({});
      }

      if (!isNew && productId) {
        const found = safeItems.find((i) => i._id === productId) || null;
        if (!found) {
          toast.error('Producto no encontrado');
          navigate(returnTo, { replace: true });
          return;
        }
        setEditItem(found);
        setOrdersLoading(true);
        void listDeliveryOrdersRequest(dataUserId)
          .then((list) => setOrders(Array.isArray(list) ? list : []))
          .catch(() => setOrders([]))
          .finally(() => setOrdersLoading(false));
      } else {
        setEditItem(null);
        const seedId = String(seedFromState.seedProductId || '').trim();
        if (seedId) {
          setSeedFromProduct(safeItems.find((i) => i._id === seedId) || null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [dataUserId, isNew, productId, navigate, returnTo, seedFromState.seedProductId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const catalogCategoriesInUse = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      if (String(item.module || 'catalog') === 'stock') continue;
      const cat = normalizeImportCategory(item.category || '');
      if (cat) set.add(cat);
    }
    return [...set];
  }, [catalogItems]);

  const catalogMenuItems = useMemo(
    () => catalogItems.filter((i) => String(i.module || 'catalog') !== 'stock' && i.active !== false),
    [catalogItems],
  );

  const packagingStockItems = useMemo(
    () =>
      filterStockInventoryItems(catalogItems).filter((item) => item.stockCategory === 'packaging'),
    [catalogItems],
  );

  const handleSave = async (data: Partial<CatalogItem>, options?: { keepOpen?: boolean }) => {
    if (!dataUserId) {
      toast.error('Sesión no válida. Recarga e inicia sesión de nuevo.');
      throw new Error('Sesión no válida');
    }
    const payload: Partial<CatalogItem> = {
      ...data,
      module: 'catalog',
      ...(businessId ? { vertical: catalogVertical, business_id: businessId } : {}),
    };
    const duplicateByName = findCatalogDuplicateByName(
      catalogMenuItems,
      String(data.name || '').trim(),
      { excludeId: editItem?._id },
    );
    if (duplicateByName) {
      toast.error(formatCatalogDuplicateNameError(duplicateByName));
      throw new Error('duplicate_name');
    }

    let saved: CatalogItem;
    if (editItem) {
      saved = await updateCatalogItemRequest(dataUserId, { ...editItem, ...payload } as CatalogItem);
      setEditItem(saved);
      setCatalogItems((prev) => prev.map((i) => (i._id === saved._id ? saved : i)));
      toast.success('Producto guardado');
    } else {
      saved = await createCatalogItemRequest(dataUserId, payload as CatalogItem);
      setCatalogItems((prev) => [saved, ...prev]);
      toast.success('Producto creado');
    }

    const uid = dataUserId;
    const bid = businessId;
    const recipeLines = Array.isArray(saved.customFields?.costingRecipe)
      ? (saved.customFields.costingRecipe as unknown[])
      : [];
    const needsRecipeStock = saved.customFields?.costingType === 'recipe' && recipeLines.length > 0;

    void (async () => {
      try {
        if (usesTpvCatalogUi && bid) {
          const sync = await syncTpvOrganizersAfterCatalogImport(bid, [saved]);
          const activation = await activateCommercialLinesAfterCatalogImport(bid, [saved]);
          if (sync.updatedBrands > 0 || activation.activated > 0) {
            const nextBrands = await listBrandsRequest(uid).catch(() => null);
            if (nextBrands) setBrands(nextBrands);
          }
        }
        if (needsRecipeStock && !isRestaurantCatalog) {
          await syncInventoryCatalogFromSources(uid, {
            businessType: String(businessType || 'delivery'),
            businessId: bid || undefined,
            storeIngredients,
            catalogItems: [saved, ...catalogItems],
            brands,
          });
          const refreshed = await listCatalogItemsRequest(uid).catch(() => null);
          if (refreshed) {
            const inventory = filterStockInventoryItems(refreshed);
            await syncRecipesFromCostingCatalog(uid, [saved], inventory);
            setCatalogItems(refreshed.filter((i) => !i.deletedAt));
          }
        }
      } catch {
        /* producto ya guardado */
      } finally {
        notifyDeliveryCatalogChanged(uid, bid);
      }
    })();

    if (!options?.keepOpen) {
      if (isNew) {
        navigate(CATALOG_PRODUCT_WORKSPACE.edit(saved._id), {
          replace: true,
          state: location.state,
        });
        setEditItem(saved);
      } else {
        goBack();
      }
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <VertialLoadingState label="Cargando producto…" />
      </div>
    );
  }

  if (!dataUserId) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-50 p-6 dark:bg-stone-950">
        <p className="text-sm text-stone-600">Sesión no válida.</p>
      </div>
    );
  }

  return (
    <CreateCatalogItemModal
      variant="workspace"
      isOpen
      onClose={goBack}
      onCreate={handleSave}
      editItem={editItem}
      seedFromProduct={seedFromProduct}
      brands={brands}
      businessId={businessId || ''}
      dataUserId={dataUserId}
      onBrandsChange={setBrands}
      catalogCategoriesInUse={catalogCategoriesInUse}
      catalogItems={catalogItems}
      catalogMenuItemsForDuplicateCheck={catalogMenuItems}
      storeIngredients={storeIngredients}
      brandIngredientSelection={brandIngredientSelection}
      packagingStockItems={packagingStockItems}
      isRestaurantCatalog={isRestaurantCatalog}
      resultadosPanel={
        editItem ? (
          <ProductResultadosPanel item={editItem} orders={orders} loading={ordersLoading} />
        ) : null
      }
    />
  );
}
