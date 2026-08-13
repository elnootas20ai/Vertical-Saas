import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { toastActionError, toUserFacingMessage } from '../../lib/userFacingError';
import {
  MIN_CLIENT_PHONE_DIGITS,
  clientPhonesMatch,
  normalizeClientPhoneForSave,
} from '../../../../shared/clients/clientSearchMatch.js';
import { DecimalNumpadField } from '../../components/saas/DecimalNumpadField';
import { parseDecimalPadValue } from '../../lib/decimalNumpadInput';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveTpvClientSearchUserId } from '../../lib/tpvClientSearchUserId';
import { useClientPhoneSearch, clearClientPhoneSearchCache } from '../../hooks/useClientPhoneSearch';
import {
  filterDeliveryOrdersRequest,
  createDeliveryOrderWithCajaStatus,
  updateDeliveryOrderRequest,
  getDeliveryConfigRequest,
  type CatalogItem,
  type DeliveryOrder,
  type DeliveryOrderItem,
  type DeliveryOrderStatus,
  type DeliveryType,
  type PointOfSale,
  type TpvPaymentMethod,
  isTpvRegisterSessionOpen,
} from '../../lib/deliveryApi';
import { updateClientRequest, getClientForTpvRequest, listClientsPageRequest, searchClientsByPhoneRequest } from '../../lib/crmApi';
import type { Client, ClientAddress } from '../../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import {
  findActivePromotionByCode,
  computePromoDiscount,
  priceLinesWithFixedUnitPromos,
  listAutoFixedUnitPricePromotions,
  listSelectableCompanyPromoCodes,
  readStoredPromotions,
  writeStoredPromotions,
  type AppliedPromo,
  type StoredPromotion,
  getClientAppliedPromo,
} from '../../lib/promoCodes';
import { listPromotionsRequest } from '../../lib/promotionsApi';
import { prefetchDeliveryTicketPrint, printDeliveryTicket } from '../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom, formatTicketCustomerAddress, formatTicketCustomerPhone } from '../../lib/deliveryTicketHelpers';
import { OrderTicketButtons } from '../../components/delivery/OrderTicketButtons';
import { fetchClientPromotionsRequest, type ClientPromotion } from '../../lib/clientPromotionsApi';
import { useTpvCatalog } from '../../hooks/useTpvCatalog';
import { prefetchTpvCatalog } from '../../lib/tpvCatalogCache';
import { TpvProductPicker } from '../../components/saas/tpv/TpvProductPicker';
import { TpvItemCustomizeModal } from '../../components/saas/tpv/TpvItemCustomizeModal';
import { TpvComboCustomizeModal } from '../../components/saas/tpv/TpvComboCustomizeModal';
import { TpvHalfHalfCustomizeModal } from '../../components/saas/tpv/TpvHalfHalfCustomizeModal';
import { isTpvComboCatalogItem } from '../../lib/catalogComboSlots';
import {
  type CartLineCustomization,
  EMPTY_CART_CUSTOMIZATION,
  buildOrderExtras,
  buildOrderIngredients,
  cartLineTotal,
  cartLineUnitPrice,
  cartLineExtrasUnitPrice,
  customizationSignature,
  isCustomizableCatalogItem,
  isTpvHalfHalfCatalogItem,
  inferTpvDefaultExtraPrice,
  normalizeTpvCategoryTemplates,
  normalizeStoreIngredients,
  resolveTpvBrandConfigFromDeliveryConfig,
  unifyStoreIngredientsFromConfig,
  type StoreIngredient,
  type TpvBrandIngredientSelection,
  type TpvBrandSupplements,
  type TpvCategoryTemplates,
} from '../../lib/catalogCustomization';
import { isCajaRegistrationOk, normalizeTpvPaymentMethod } from '../../lib/tpvCajaMath';
import {
  isJunkTpvCustomerName,
  quickAttentionNameFromClientSearch,
  resolveTpvCustomerDisplayName,
  validateTpvQuickAttentionName,
} from '../../lib/tpvCustomerDisplayName';
import {
  buildTpvCatalogSections,
  categoriesForTpvScope,
  defaultTpvSectionId,
  parseTpvSectionId,
  tpvSectionProductCount,
  isTpvSellableCatalogItem,
} from '../../lib/tpvCatalogNavigation';
import {
  TpvRegisterGate,
  TpvRegisterProvider,
  useTpvRegisterBoardReady,
  useTpvRegisterIfOpen,
  type TpvRegisterContextType,
} from '../../components/saas/TpvRegisterGate';
import { hasTpvOpenRegisterLatch } from '../../lib/tpvCajaScope';
import { readTpvTabletBinding } from '../../lib/tpvTabletSession';
import {
  resolveTpvRegisterScope,
  shouldAutoSwitchToDeliveryBusiness,
  resolveTpvCatalogBusinessId,
  resolveRetailOpsWriteBusinessId,
} from '../../lib/tpvRegisterScope';
import { isRestaurantBusinessType, isDeliveryOpsBusinessType } from '../../lib/deliveryOpsTypes';
import { resolveTpvCeoExitPath } from '../../lib/retailOpsPaths';
import {
  cancelDiningOrderRequest,
  changeTableStatusRequest,
  linkClientToOrderRequest,
  mergeDiningOrdersRequest,
  type DiningOrder,
} from '../../lib/salaApi';
import { tableStatusOnOpen, tableStatusOnPaid, tableStatusOnRelease, tableStatusOnOrderAdded } from '../../lib/restaurantTableStatus';
import {
  addCartToDiningAccount,
  applyDiningOrderDiscount,
  buildDiningCajaPayItems,
  buildSplitPartViews,
  diningOrderDueAmount,
  diningOrderHasPendingKitchen,
  flattenDiningAccountLines,
  moveDiningOrderToTable,
  payAndCloseDiningOrder,
  scaleAmountsToTotal,
  splitDiningOrderCustom,
  splitDiningOrderEqual,
  voidDiningAccountLine,
  type DiningAccountLineView,
} from '../../lib/restaurantDiningTpv';
import { WorkerTpvStaffConsumption } from './worker/WorkerTpvStaffConsumption';
import { RestaurantChangeTableModal } from '../../components/saas/restaurant/RestaurantChangeTableModal';
import { RestaurantMergeTableModal } from '../../components/saas/restaurant/RestaurantMergeTableModal';
import { RestaurantSplitBillModal, type SplitBillResult } from '../../components/saas/restaurant/RestaurantSplitBillModal';
import { RestaurantAccountDiscountModal } from '../../components/saas/restaurant/RestaurantAccountDiscountModal';
import { TpvSplitPaymentModal } from '../../components/saas/tpv/TpvSplitPaymentModal';
import { TpvModalRoot } from '../../components/saas/tpv/TpvModalRoot';
import { RestaurantItemPaySelectModal } from '../../components/saas/restaurant/RestaurantItemPaySelectModal';
import {
  formatSplitPartsSummary,
  type TpvSplitPaymentPart,
} from '../../lib/tpvSplitPayment';
import { registerSplitPaymentsRequest } from '../../lib/tpvSplitPaymentApi';
import type { DiningTable } from '../../lib/salaApi';
import type { RestaurantTpvPermissions } from '../../lib/restaurantTpvPermissions';
import {
  shouldUseDeliveryStores,
  resolveBusinessScopeId,
  DELIVERY_CONFIG_CHANGED,
} from '../../lib/deliverySetup';
import { ClockedInWorkerBubbles } from '../../components/saas/ClockedInWorkerBubbles';
import { TpvOfflineBanner } from '../../components/saas/TpvOfflineBanner';
import { StoreHoursStatusBanner } from '../../components/saas/StoreHoursStatusBanner';
import { resolveWorkerWorkCenter } from '../../lib/workerStoreHours';
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../lib/tpvTabletOffline';
import { ensureLocalCajaSaleForOrder } from '../../lib/tpvLocalCajaSale';
import { CeoTpvStorePicker, buildCeoTpvStoreRows } from '../../components/saas/CeoTpvStorePicker';
import { WorkerTpvStockReview } from './worker/WorkerTpvStockReview';
import { WorkerTpvBottomBar } from '../../components/saas/WorkerTpvBottomBar';
import { TpvChromeScope, useTpvOrderFlowChrome, useTpvOrderFlowActive } from '../../context/TpvChromeContext';
import { consumeTpvStockReviewLaunch, TPV_OPEN_STOCK_REVIEW_EVENT } from '../../lib/tpvStockReview';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import {
  bootstrapCeoTpvStores,
  needsCeoTpvStoreBootstrap,
} from '../../lib/ceoTpvStoreBootstrap';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  coerceSelectedPdvId,
  notifyDeliveryActiveStoreChanged,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../../lib/deliveryOpsPdvSelection';
import { notifyDeliveryOpsLive } from '../../lib/deliveryOpsLive';
import {
  isDeliveryOrderEditableOnTpvBoard,
  seedTpvCartFromDeliveryOrder,
} from '../../lib/tpvEditDeliveryOrder';
import { orderAlreadyCobrado } from '../../lib/tpvCajaScope';
import { normalizeClockinUserId } from '../../lib/clockinUserId';
import {
  ArrowLeft,
  Search,
  ShoppingBag,
  Truck,
  Plus,
  Minus,
  X,
  Check,
  Edit3,
  User,
  MapPin,
  CreditCard,
  Banknote,
  ShoppingCart,
  CheckCircle2,
  Home,
  Briefcase,
  Loader2,
  ArrowLeftRight,
  Split,
  Percent,
  Zap,
  Wallet,
  Combine,
  Ban,
  UserRound,
  Utensils,
} from 'lucide-react';

/** Lazy: evita ciclo TpvRapidoPage ↔ WorkerTpvDelivery que deja el TPV de mesa en undefined. */
const WorkerTpvDeliveryLazy = lazy(async () => {
  const mod = await import('./worker/WorkerTpvDelivery');
  return { default: mod.WorkerTpvDelivery };
});

type Step = 'client' | 'delivery' | 'products' | 'payment';
type PaymentMethod = TpvPaymentMethod | 'mixto';

interface CartItem {
  lineId: string;
  catalogItem: CatalogItem;
  quantity: number;
  customization: CartLineCustomization;
}

/** Pedidos recientes usados para hábitos del cliente y venta cruzada (co-compra). */
const MAX_ORDERS_FOR_TPV_INTEL = 160;

/** Por cada producto A, peso de B cuando ambos aparecen en el mismo pedido. */
function buildCoPurchaseScores(orders: DeliveryOrder[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const order of orders) {
    const ids = [
      ...new Set(
        (order.items || [])
          .map((i) => String(i.catalogItemId || '').trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const a = ids[i];
        const b = ids[j];
        if (!out[a]) out[a] = {};
        out[a][b] = (out[a][b] || 0) + 1;
      }
    }
  }
  return out;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
const LABEL_CLASS =
  'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2';

const RESTAURANT_WALKIN_CLIENT_ID = 'tpv-restaurant-walk-in';
const DELIVERY_QUICK_ATTENTION_CLIENT_ID = 'tpv-delivery-quick-attention';

function buildTpvWalkInClient(
  userId: string,
  businessId: string,
  opts: { id: string; name: string; tags: string[] },
): Client {
  return {
    id: opts.id,
    type: 'client',
    user_id: userId,
    businessId,
    business_id: businessId,
    clientType: 'particular',
    name: opts.name,
    // Sin teléfono: no es ficha CRM; evita sync falso por dígito 0.
    phone: '',
    phonePrefix: '',
    email: '',
    status: 'active',
    responsible: 'TPV',
    branch_id: '',
    tags: opts.tags,
    address: '',
    city: '',
    notes: '',
    consents: { dataProcessing: false, commercial: false, thirdParty: false },
    defaultPaymentMethod: '',
    addresses: [],
    stats: {
      totalOrders: 0,
      lastOrderDate: null,
      orderFrequencyDays: 0,
      favoriteAddressId: null,
      totalSpent: 0,
      createdFrom: 'tpv',
    },
    createdAt: new Date(0).toISOString(),
  };
}

/** Cliente sintético del TPV (atención rápida / sala): no existe en Couch CRM. */
function isTpvSyntheticClientId(clientId: string | null | undefined): boolean {
  return String(clientId || '').startsWith('tpv-');
}

function buildRestaurantWalkInClient(userId: string, businessId: string, displayName = 'Sala'): Client {
  return buildTpvWalkInClient(userId, businessId, {
    id: RESTAURANT_WALKIN_CLIENT_ID,
    name: displayName,
    tags: ['tpv', 'restaurant-walk-in'],
  });
}

function buildDeliveryQuickAttentionClient(
  userId: string,
  businessId: string,
  displayName = 'Atención rápida',
  phone = '',
  phonePrefix = '',
): Client {
  const base = buildTpvWalkInClient(userId, businessId, {
    id: DELIVERY_QUICK_ATTENTION_CLIENT_ID,
    name: displayName,
    tags: ['tpv', 'quick-attention'],
  });
  const normalized = normalizeClientPhoneForSave(phone);
  return {
    ...base,
    phone: normalized.phone,
    phonePrefix: phonePrefix || normalized.phonePrefix || '',
  };
}

function restaurantFlowResetStep(): Step {
  return 'products';
}

function restaurantFlowCompletedSteps(): Set<Step> {
  return new Set(['client', 'delivery']);
}

function deliveryQuickAttentionCompletedSteps(): Set<Step> {
  return new Set(['client', 'delivery']);
}

function isDeliveryQuickAttentionClient(client: Client | null | undefined): boolean {
  return Boolean(client && client.id === DELIVERY_QUICK_ATTENTION_CLIENT_ID);
}

/** Ficha CRM creada desde atención rápida (solo cuando hay teléfono completo). */
function isQuickAttentionCrmClient(client: Client | null | undefined): boolean {
  return Boolean(client?.tags?.includes('quick-attention'));
}

function isQuickAttentionFlowClient(client: Client | null | undefined): boolean {
  return isDeliveryQuickAttentionClient(client) || isQuickAttentionCrmClient(client);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function formatPrice(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}

const LEGACY_ADDRESS_PREFIX = 'legacy-';

function resolveClientDeliveryAddresses(client: Client): ClientAddress[] {
  const raw = client.addresses || [];
  const normalized = raw
    .map((a, idx) => ({
      ...a,
      street:
        (a.street || '').trim() ||
        (idx === 0 && a.isPrimary !== false ? (client.address || '').trim() : ''),
      city:
        (a.city || '').trim() ||
        (idx === 0 && a.isPrimary !== false ? (client.city || '').trim() : undefined),
      postalCode: a.postalCode || (idx === 0 ? client.postalCode : undefined),
    }))
    .filter((a) => a.street);
  if (normalized.length > 0) return normalized;
  if (client.address?.trim()) {
    return [
      {
        id: `${LEGACY_ADDRESS_PREFIX}${client.id}`,
        label: 'Casa',
        street: client.address.trim(),
        city: client.city,
        postalCode: client.postalCode,
        isPrimary: true,
      },
    ];
  }
  return [];
}

function isPrimaryClientAddress(addr: ClientAddress, all: ClientAddress[]): boolean {
  if (addr.isPrimary) return true;
  return !all.some((a) => a.isPrimary) && all[0]?.id === addr.id;
}

function TpvRapidoCeoBoard() {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled, switchBusiness } = useBusiness();
  const {
    pointsOfSale,
    retailWorkCenters,
    activeSalesPointId,
    setActiveSalesPoint,
    loading: storesLoading,
    refresh: refreshStores,
  } = useActiveStoreScope();
  const navigate = useNavigate();
  const location = useLocation();
  const tpvExitPath = resolveTpvCeoExitPath(location.pathname, currentBusiness?.businessType);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const tpvCatalogBusinessId = useMemo(
    () => resolveTpvCatalogBusinessId(businessId, businesses),
    [businesses, businessId],
  );
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [forceStorePicker, setForceStorePicker] = useState(false);
  const [ceoBootstrapLoading, setCeoBootstrapLoading] = useState(false);
  const [ceoBootstrapSettled, setCeoBootstrapSettled] = useState(false);
  const ceoBootstrapDoneRef = useRef(false);
  const ceoBootstrapInflightRef = useRef(false);
  const [stockOpen, setStockOpen] = useState(() => consumeTpvStockReviewLaunch());
  const lastSyncedStorePdvRef = useRef<string | null>(null);
  /** PDVs recuperados por bootstrap aunque ActiveStoreScope aún esté vacío. */
  const [bootstrapPdvs, setBootstrapPdvs] = useState<PointOfSale[]>([]);

  useEffect(() => {
    ceoBootstrapDoneRef.current = false;
    ceoBootstrapInflightRef.current = false;
    setCeoBootstrapSettled(false);
    setBootstrapPdvs([]);
  }, [businessId]);

  const storeRows = useMemo(
    () =>
      buildCeoTpvStoreRows(
        retailWorkCenters,
        pointsOfSale.length > 0 ? pointsOfSale : bootstrapPdvs,
        businessId,
        {
          accountBusinessCount: businesses.length,
        },
      ),
    [retailWorkCenters, pointsOfSale, bootstrapPdvs, businessId, businesses.length],
  );

  const shouldBootstrapCeoStores = useMemo(() => {
    if (!businessesFetchSettled || !businessId || !dataUserId || !user || !currentBusiness) {
      return false;
    }
    if (!isDeliveryOpsBusinessType(currentBusiness.businessType)) {
      return false;
    }
    if (ceoBootstrapDoneRef.current) return false;
    return needsCeoTpvStoreBootstrap(retailWorkCenters, pointsOfSale, storeRows);
  }, [
    businessesFetchSettled,
    businessId,
    dataUserId,
    user,
    currentBusiness,
    retailWorkCenters,
    pointsOfSale,
    storeRows,
  ]);

  useEffect(() => {
    if (ceoBootstrapDoneRef.current) {
      setCeoBootstrapSettled((prev) => (prev ? prev : true));
      return;
    }
    if (!shouldBootstrapCeoStores) {
      setCeoBootstrapSettled((prev) => (prev ? prev : true));
      return;
    }
    if (ceoBootstrapInflightRef.current) return;
    if (!user || !currentBusiness) return;

    const bizIdAtStart = resolveBusinessScopeId(currentBusiness);
    const accountN = businesses.length;
    // Snapshot estable: no cancelar el bootstrap por identidad nueva del array `businesses`.
    const businessesSnap = businesses;
    ceoBootstrapInflightRef.current = true;
    setCeoBootstrapLoading(true);
    setCeoBootstrapSettled(false);

    void (async () => {
      try {
        const state = await bootstrapCeoTpvStores(user, currentBusiness, businessesSnap, {
          accountBusinessCount: accountN,
        });
        if (resolveBusinessScopeId(currentBusiness) !== bizIdAtStart) return;
        ceoBootstrapDoneRef.current = true;
        const recovered = (state.pointsOfSale || []).filter((p) => p.active !== false);
        if (recovered.length > 0) {
          setBootstrapPdvs(recovered);
          if (recovered.length === 1) {
            const onlyId = recovered[0]._id;
            setSelectedPdvId((prev) => prev || onlyId);
            if (businessId && dataUserId) {
              writeDeliveryOpsSelectedPdvId(businessId, dataUserId, onlyId);
            }
          }
        }
        window.dispatchEvent(new Event('work-centers:changed'));
        await refreshStores();
      } catch {
        ceoBootstrapDoneRef.current = true;
      } finally {
        ceoBootstrapInflightRef.current = false;
        setCeoBootstrapLoading(false);
        setCeoBootstrapSettled(true);
      }
    })();
  }, [
    shouldBootstrapCeoStores,
    user,
    currentBusiness,
    businesses,
    businesses.length,
    businessId,
    dataUserId,
    refreshStores,
  ]);

  const effectiveStoresLoading = storesLoading || ceoBootstrapLoading;

  const activePdvs = useMemo(() => {
    const fromScope = pointsOfSale.filter((p) => p.active !== false);
    if (fromScope.length > 0) return fromScope;
    return bootstrapPdvs.filter((p) => p.active !== false);
  }, [pointsOfSale, bootstrapPdvs]);

  const resolvedInitialPdvId = useMemo(() => {
    if (forceStorePicker || !businessId || !dataUserId || activePdvs.length === 0) return null;
    const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    return coerceSelectedPdvId(activePdvs, saved || activeSalesPointId);
  }, [forceStorePicker, businessId, dataUserId, activePdvs, activeSalesPointId]);

  const effectivePdvId = forceStorePicker ? null : (selectedPdvId || resolvedInitialPdvId);

  const [pdvWaitTimedOut, setPdvWaitTimedOut] = useState(false);

  // Solo esperar mientras hay carga real. `shouldBootstrapCeoStores` solo no debe
  // dejar el TPV colgado en «Tarda más…» para siempre (PDV ya existía en Couch).
  const awaitingPdvResolution =
    !forceStorePicker
    && !effectivePdvId
    && activePdvs.length === 0
    && (
      effectiveStoresLoading
      || (shouldBootstrapCeoStores && !ceoBootstrapSettled)
      || !businessesFetchSettled
      || !businessId
      || !dataUserId
    );

  const noStoresConfigured =
    !forceStorePicker
    && !effectivePdvId
    && !effectiveStoresLoading
    && !ceoBootstrapLoading
    && businessesFetchSettled
    && Boolean(businessId)
    && Boolean(dataUserId)
    && activePdvs.length === 0
    && ceoBootstrapSettled
    && !shouldBootstrapCeoStores
    && pdvWaitTimedOut;

  useEffect(() => {
    if (!awaitingPdvResolution) {
      setPdvWaitTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setPdvWaitTimedOut(true), 5000);
    return () => window.clearTimeout(timer);
  }, [awaitingPdvResolution]);

  // Tras timeout: entrar con la tienda guardada o abrir el selector (no pantalla muerta).
  useEffect(() => {
    if (!pdvWaitTimedOut || forceStorePicker || effectivePdvId) return;
    if (!businessId || !dataUserId) {
      setForceStorePicker(true);
      return;
    }
    const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    if (saved) {
      setSelectedPdvId(saved);
      return;
    }
    setForceStorePicker(true);
  }, [pdvWaitTimedOut, forceStorePicker, effectivePdvId, businessId, dataUserId]);

  useEffect(() => {
    lastSyncedStorePdvRef.current = null;
  }, [businessId]);

  /** TPV ops: auto-switch una sola vez al negocio delivery de la cuenta. */
  const autoSwitchDoneRef = useRef(false);
  useEffect(() => {
    if (!businessesFetchSettled || autoSwitchDoneRef.current) return;
    const targetId = shouldAutoSwitchToDeliveryBusiness(currentBusiness, businesses);
    if (!targetId) return;
    autoSwitchDoneRef.current = true;
    switchBusiness(targetId);
  }, [businessesFetchSettled, businesses, currentBusiness, switchBusiness]);

  useEffect(() => {
    const onOpen = () => setStockOpen(true);
    window.addEventListener(TPV_OPEN_STOCK_REVIEW_EVENT, onOpen);
    return () => window.removeEventListener(TPV_OPEN_STOCK_REVIEW_EVENT, onOpen);
  }, []);

  /** Misma tienda que Ops / sidebar / última elección — sin pedir de nuevo salvo "Cambiar tienda". */
  useEffect(() => {
    if (forceStorePicker || !businessId || !dataUserId) return;
    try {
      if (sessionStorage.getItem('vertial.tpv.orderFlowLock') === '1') return;
    } catch { /* ignore */ }
    const pdvId = coerceSelectedPdvId(
      activePdvs,
      readDeliveryOpsSelectedPdvId(businessId, dataUserId) || activeSalesPointId,
    );
    if (!pdvId) return;
    setSelectedPdvId((prev) => (prev === pdvId ? prev : (prev || pdvId)));
    if (lastSyncedStorePdvRef.current === pdvId && activeSalesPointId === pdvId) return;
    if (activeSalesPointId !== pdvId) {
      // Solo auto-sync si aún no hay tienda fija en el TPV.
      if (selectedPdvId) return;
      lastSyncedStorePdvRef.current = pdvId;
      setActiveSalesPoint(pdvId);
      return;
    }
    lastSyncedStorePdvRef.current = pdvId;
  }, [
    forceStorePicker,
    businessId,
    dataUserId,
    activePdvs,
    activeSalesPointId,
    setActiveSalesPoint,
    selectedPdvId,
  ]);

  useEffect(() => {
    const onStore = () => {
      if (forceStorePicker || !businessId || !dataUserId) return;
      // No cambiar tienda mientras hay un pedido en curso (desmontaría el gate → Abrir caja).
      try {
        if (sessionStorage.getItem('vertial.tpv.orderFlowLock') === '1') return;
      } catch { /* ignore */ }
      const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
      const pdvId = coerceSelectedPdvId(activePdvs, saved || activeSalesPointId);
      // No borrar la tienda si el listado PDV aún no cargó (evita desmontar el gate a mitad de pedido).
      if (!pdvId) return;
      setSelectedPdvId((prev) => {
        if (prev && prev === pdvId) return prev;
        // Si ya hay tienda operativa, no saltar a otra por un evento de fondo.
        if (prev && pdvId !== prev) return prev;
        return pdvId;
      });
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [forceStorePicker, businessId, dataUserId, activePdvs, activeSalesPointId]);

  useEffect(() => {
    if (!effectivePdvId || !dataUserId || !tpvCatalogBusinessId || businesses.length === 0) return;
    prefetchTpvCatalog(dataUserId, {
      scopeBusinessId: tpvCatalogBusinessId,
      businesses,
      accountBusinessCount: businesses.length,
    });
  }, [effectivePdvId, tpvCatalogBusinessId, dataUserId, businesses.length]);

  const selectedPdvName = useMemo(() => {
    if (!effectivePdvId) return '';
    const pdv = pointsOfSale.find((p) => p._id === effectivePdvId);
    return pdv?.name || '';
  }, [effectivePdvId, pointsOfSale]);

  const activeStoreHoursWorkCenter = useMemo(() => {
    if (!effectivePdvId) return null;
    const pdv = pointsOfSale.find((p) => p._id === effectivePdvId);
    const ref = String(pdv?.workCenterId || effectivePdvId).trim();
    return resolveWorkerWorkCenter(retailWorkCenters, ref);
  }, [effectivePdvId, pointsOfSale, retailWorkCenters]);

  const handleSelectStore = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id) return;
      if (businessId && dataUserId) {
        writeDeliveryOpsSelectedPdvId(businessId, dataUserId, id);
        notifyDeliveryActiveStoreChanged();
      }
      setActiveSalesPoint(id);
      setForceStorePicker(false);
      setSelectedPdvId(id);
    },
    [businessId, dataUserId, setActiveSalesPoint],
  );

  const handleChangeStore = useCallback(() => {
    if (businessId && dataUserId) {
      writeDeliveryOpsSelectedPdvId(businessId, dataUserId, null);
      notifyDeliveryActiveStoreChanged();
    }
    setForceStorePicker(true);
    setSelectedPdvId(null);
  }, [businessId, dataUserId]);

  if (noStoresConfigured) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center dark:bg-gray-950">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">No hay tiendas configuradas</p>
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Crea un bar/restaurante con PDV activo en Configuración antes de abrir el TPV.
        </p>
        <button
          type="button"
          onClick={() => navigate('/saas/settings/tienda')}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Configurar tienda
        </button>
      </div>
    );
  }

  if (awaitingPdvResolution && !pdvWaitTimedOut) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center px-6">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Abriendo TPV…</p>
        </div>
      </div>
    );
  }

  // Timeout: el effect de recuperación ya elige tienda guardada o abre el picker.
  // No mostrar pantalla muerta «Tarda más…» (bloqueaba el TPV delivery CEO semanas).
  if (awaitingPdvResolution && pdvWaitTimedOut) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center px-6">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Preparando tienda…</p>
        </div>
      </div>
    );
  }

  if (!effectivePdvId || forceStorePicker) {
    return (
      <CeoTpvStorePicker
        storeName={currentBusiness?.name}
        storeRows={storeRows}
        pointsOfSale={activePdvs}
        loading={effectiveStoresLoading}
        onSelect={handleSelectStore}
        onBack={() => navigate(tpvExitPath, { replace: true })}
      />
    );
  }

  return (
    <TpvChromeScope
      insetBottomBar
      bottomBar={!stockOpen ? <WorkerTpvBottomBar ceoMode onExitCeo={() => navigate(tpvExitPath)} /> : null}
    >
      <div className="flex flex-col overflow-hidden h-full min-h-0 bg-gray-50 dark:bg-gray-950">
        <TpvOfflineBanner />
        <StoreHoursStatusBanner workCenter={activeStoreHoursWorkCenter} compact className="shrink-0" />
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <TpvRegisterGate
            fillParent
            initialManagerPdvId={effectivePdvId}
            onManagerStoreCleared={handleChangeStore}
          >
            {stockOpen ? (
              <WorkerTpvStockReview
                onBack={() => setStockOpen(false)}
                scopeOverride={{
                  dataUserId,
                  storeLabel: selectedPdvName,
                  pdvId: effectivePdvId,
                }}
              />
            ) : (
              <Suspense
                fallback={(
                  <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                    <p className="text-sm text-stone-500">Cargando TPV…</p>
                  </div>
                )}
              >
                <WorkerTpvDeliveryLazy
                  ceoMode
                  forcedPdvId={effectivePdvId}
                  onChangeStore={handleChangeStore}
                />
              </Suspense>
            )}
          </TpvRegisterGate>
        </div>
      </div>
    </TpvChromeScope>
  );
}

export function TpvRapidoPage() {
  return <TpvRapidoCeoBoard />;
}

export type RestaurantTableContext = {
  id: string;
  number: number;
  name: string;
  capacity: number;
  roomName?: string;
  isCounter?: boolean;
};

export type TpvRapidoOrderFlowProps = {
  /** Tablet TPV: volver al tablero operativo en lugar de delivery-ops */
  onBack?: () => void;
  tabletMode?: boolean;
  /** Bar/restaurante: catálogo + cobro directo (sin cliente ni domicilio). */
  restaurantMode?: boolean;
  /** Mesa o mostrador seleccionado en TPV restaurante. */
  restaurantTable?: RestaurantTableContext | null;
  /** Tras cobrar y volver al plano de mesas. */
  onRestaurantOrderComplete?: () => void;
  /** Dentro de RestaurantTpvPage: cabecera mesa + volver al plano. */
  embeddedInRestaurantTpv?: boolean;
  /** Cuenta abierta en sala (comandas acumuladas). */
  restaurantDiningOrder?: DiningOrder | null;
  onRestaurantDiningOrderUpdated?: (order: DiningOrder) => void;
  /** Tras mover la cuenta a otra mesa. */
  onRestaurantTableChange?: (table: RestaurantTableContext, order: DiningOrder) => void;
  restaurantPermissions?: RestaurantTpvPermissions;
  /** Cuando el flujo se monta fuera del árbol del gate (p. ej. vista embebida en tablet). */
  registerOverride?: TpvRegisterContextType;
  /** Desde el plano: abrir carta o ir directo a cobro. */
  restaurantOpenIntent?: 'order' | 'pay';
  /** Pedido en montaje/reparto (domicilio o recogida) a editar. */
  editingDeliveryOrder?: DeliveryOrder | null;
  onEditingDeliveryOrderSaved?: (order: DeliveryOrder) => void;
};

export function TpvRapidoOrderFlow({
  onBack,
  tabletMode = false,
  restaurantMode: restaurantModeProp,
  restaurantTable = null,
  onRestaurantOrderComplete,
  embeddedInRestaurantTpv = false,
  restaurantDiningOrder = null,
  onRestaurantDiningOrderUpdated,
  onRestaurantTableChange,
  restaurantPermissions,
  registerOverride,
  restaurantOpenIntent = 'order',
  editingDeliveryOrder = null,
  onEditingDeliveryOrderSaved,
}: TpvRapidoOrderFlowProps = {}) {
  useTpvOrderFlowChrome(true);
  const orderFlowChrome = useTpvOrderFlowActive();
  const { user } = useAuth();
  const registerFromGate = useTpvRegisterIfOpen();
  const boardReady = useTpvRegisterBoardReady();
  const register = registerOverride ?? registerFromGate;
  const registerStickyRef = useRef<TpvRegisterContextType | null>(
    register && isTpvRegisterSessionOpen(register.session) ? register : null,
  );
  if (register && isTpvRegisterSessionOpen(register.session)) {
    registerStickyRef.current = register;
  } else if (
    registerStickyRef.current
    && !isTpvRegisterSessionOpen(registerStickyRef.current.session)
  ) {
    registerStickyRef.current = null;
  }

  const resolveOpenRegister = useCallback((): TpvRegisterContextType | null => {
    if (register && isTpvRegisterSessionOpen(register.session)) return register;
    const sticky = registerStickyRef.current;
    if (sticky && isTpvRegisterSessionOpen(sticky.session)) return sticky;
    return null;
  }, [register]);

  const { addClient, clients, clientsTotalCount } = useApp();
  const { currentBusiness, businesses, businessesFetchSettled, switchBusiness } = useBusiness();
  const navigate = useNavigate();
  const location = useLocation();
  const tpvExitPath = resolveTpvCeoExitPath(location.pathname, currentBusiness?.businessType);
  const goBack = onBack ?? (() => navigate(tpvExitPath, { replace: true }));
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedClientIdFromUrl = useRef<string | null>(null);
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () => resolveTpvRegisterScope({
      currentBusiness,
      tabletBinding,
      authUser: user,
      pathname: location.pathname,
      businesses,
      businessesSettled: businessesFetchSettled,
    }),
    [currentBusiness, tabletBinding, user, location.pathname, businesses, businessesFetchSettled],
  );
  const isDeliveryBusiness = useMemo(
    () => shouldUseDeliveryStores(
      { business: currentBusiness, userOnboarding: user?.onboarding },
      { tabletBusinessId: (registerScope.scopeBusinessId || tabletBinding?.businessId) ?? null, hasDeliveryPdvs: true },
    ),
    [currentBusiness, user?.onboarding, registerScope.scopeBusinessId, tabletBinding?.businessId],
  );
  const userId = registerScope.effectiveDataUserId;
  const businessId = registerScope.scopeBusinessId;
  const tpvCatalogBusinessId = useMemo(
    () => resolveTpvCatalogBusinessId(businessId, businesses),
    [businesses, businessId],
  );
  const writeBusinessId = useMemo(
    () => resolveRetailOpsWriteBusinessId(businessId, businesses),
    [businesses, businessId],
  );
  // Misma cartera que el contador «Tienes N clientes» (AppContext).
  // Si diverge, ves 6489 y la búsqueda sale vacía (bug recurrente Pau).
  const clientSearchUserId = useMemo(() => {
    const fromAppCount =
      String(user?.invitedBy || '').trim() ||
      String(user?.user_id || user?.id || '').trim();
    const fromResolver = resolveTpvClientSearchUserId({
      currentBusiness,
      scopeDataUserId: userId,
      authUser: user,
    });
    const ownerId = String(currentBusiness?.owner_user_id || '').trim();
    return ownerId || fromResolver || fromAppCount;
  }, [userId, user, currentBusiness]);

  // Precalienta la cartera + índice de búsqueda al abrir el TPV (tras deploy puede tardar ~10s).
  // Así la 1.ª tecla del usuario no se come el cold start.
  useEffect(() => {
    if (!clientSearchUserId) return;
    let cancelled = false;
    void (async () => {
      try {
        await listClientsPageRequest(clientSearchUserId, {
          limit: 1,
          skip: 0,
          lite: true,
        });
        if (cancelled) return;
        await searchClientsByPhoneRequest(
          clientSearchUserId,
          'a',
          1,
          undefined,
          undefined,
          { includeLegacy: true, fallbackAll: true },
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSearchUserId]);

  /** Evita TPV sobre limpieza/otra vertical: cambia al delivery de la cuenta. */
  const autoSwitchOrderFlowRef = useRef(false);
  useEffect(() => {
    if (!businessesFetchSettled || autoSwitchOrderFlowRef.current) return;
    const targetId = shouldAutoSwitchToDeliveryBusiness(currentBusiness, businesses);
    if (!targetId) return;
    autoSwitchOrderFlowRef.current = true;
    switchBusiness(targetId);
  }, [businessesFetchSettled, businesses, currentBusiness, switchBusiness]);

  const isRestaurantMode = Boolean(
    restaurantModeProp ?? isRestaurantBusinessType(currentBusiness?.businessType),
  );

  const walkInClient = useMemo(
    () => buildRestaurantWalkInClient(userId || 'tpv', writeBusinessId || businessId || 'tpv'),
    [userId, writeBusinessId, businessId],
  );

  const tableWalkInClient = useMemo(() => {
    if (!restaurantTable) return walkInClient;
    const label = restaurantTable.isCounter
      ? 'Mostrador'
      : restaurantTable.name || `Mesa ${restaurantTable.number}`;
    return buildRestaurantWalkInClient(userId || 'tpv', writeBusinessId || businessId || 'tpv', label);
  }, [restaurantTable, walkInClient, userId, writeBusinessId, businessId]);

  /**
   * Atención rápida = flujo paralelo (carta → cobrar).
   * No usa el buscador CRM ni selectClient del hook.
   * Debe declararse antes de `quickAttentionClient` (usa el nombre).
   */
  const [quickAttentionActive, setQuickAttentionActive] = useState(false);
  const [quickAttentionName, setQuickAttentionName] = useState('Atención rápida');
  const [quickAttentionPhone, setQuickAttentionPhone] = useState('');
  const [quickNamePromptOpen, setQuickNamePromptOpen] = useState(false);
  const [quickNameDraft, setQuickNameDraft] = useState('');
  const [quickPhoneDraft, setQuickPhoneDraft] = useState('');

  const quickAttentionClient = useMemo(
    () => buildDeliveryQuickAttentionClient(
      userId || 'tpv',
      writeBusinessId || businessId || 'tpv',
      quickAttentionName.trim() || 'Atención rápida',
      quickAttentionPhone,
      '+34',
    ),
    [userId, writeBusinessId, businessId, quickAttentionName, quickAttentionPhone],
  );

  const startAsRestaurant = Boolean(
    restaurantModeProp ?? isRestaurantBusinessType(currentBusiness?.businessType),
  );

  const [currentStep, setCurrentStep] = useState<Step>(() => {
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) return 'products';
    if (startAsRestaurant && restaurantOpenIntent === 'pay') return 'payment';
    return startAsRestaurant ? restaurantFlowResetStep() : 'client';
  });
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(() => {
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      return new Set(['client', 'delivery']);
    }
    return startAsRestaurant ? restaurantFlowCompletedSteps() : new Set();
  });
  /** Aplicar una sola vez el salto a cobro desde el plano de mesas. */
  const restaurantPayIntentAppliedRef = useRef(false);

  // Step 1 - Client
  /** Prefijo legacy en ficha; el TPV ya no pide prefijo — solo dígitos. */
  const [phonePrefix, setPhonePrefix] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneShake, setPhoneShake] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientStreet, setNewClientStreet] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientNotes, setNewClientNotes] = useState('');
  /** Teléfono del alta manual (editable); la búsqueda puede ser por nombre en `phoneInput`. */
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientPayment, setNewClientPayment] = useState<PaymentMethod | ''>('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const { results, isSearching, settledQuery, searchError, selectedClient, selectClient, clearSelection, clearResults } =
    useClientPhoneSearch({
      userId: clientSearchUserId,
      phone: phoneInput,
      // Toda la cartera del titular (como el CRM sin filtro raro de otra empresa).
      businessId: undefined,
      // Con atención rápida el buscador CRM está apagado del todo.
      enabled: !showCreateForm && !quickAttentionActive,
      matchByName: true,
      minQueryLength: 1,
      debounceMs: 220,
      resultLimit: 20,
      keepSearchingWhileSelected: true,
    });

  // Step 2 - Delivery
  const [deliveryType, setDeliveryType] = useState<DeliveryType | null>(() => {
    // Al editar con «+»: hidratar YA (si no, products no es reachable → pantalla en blanco).
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      return editingDeliveryOrder.deliveryType === 'recogida' ? 'recogida' : 'domicilio';
    }
    return startAsRestaurant ? 'recogida' : null;
  });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(() => {
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      return editingDeliveryOrder.deliveryAddressId || null;
    }
    return null;
  });
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState('Casa');
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrCity, setNewAddrCity] = useState('');
  const [newAddrPostal, setNewAddrPostal] = useState('');
  const [newAddrNotes, setNewAddrNotes] = useState('');
  const [newAddrPrimary, setNewAddrPrimary] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editAddrStreet, setEditAddrStreet] = useState('');
  const [editAddrCity, setEditAddrCity] = useState('');
  const [editAddrPostal, setEditAddrPostal] = useState('');
  const [editAddrNotes, setEditAddrNotes] = useState('');
  const [addressWarning, setAddressWarning] = useState(false);

  const deliveryAddresses = useMemo(
    () => (selectedClient ? resolveClientDeliveryAddresses(selectedClient) : []),
    [selectedClient],
  );

  // Step 3 - Products
  const [productPickerReset, setProductPickerReset] = useState(0);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const brandInitRef = useRef(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (!editingDeliveryOrder || !isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      return [];
    }
    const uid = String(registerScope.effectiveDataUserId || 'tpv');
    return seedTpvCartFromDeliveryOrder(editingDeliveryOrder, {}, uid).map((s) => ({
      lineId: s.lineId,
      catalogItem: s.catalogItem,
      quantity: s.quantity,
      customization: s.customization,
    }));
  });
  const [cartShake, setCartShake] = useState(false);
  const restaurantTableMarkedRef = useRef(false);
  const [customizeTarget, setCustomizeTarget] = useState<{
    item: CatalogItem;
    lineId: string | null;
    initial?: CartLineCustomization;
  } | null>(null);
  const [comboTarget, setComboTarget] = useState<{
    item: CatalogItem;
    lineId: string | null;
    initial?: CartLineCustomization;
  } | null>(null);
  const [halfHalfTarget, setHalfHalfTarget] = useState<{
    item: CatalogItem;
    lineId: string | null;
    initial?: CartLineCustomization;
  } | null>(null);
  const [tpvCategoryTemplates, setTpvCategoryTemplates] = useState<TpvCategoryTemplates>({});
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [tpvBrandIngredientSelection, setTpvBrandIngredientSelection] = useState<TpvBrandIngredientSelection>({});
  const [tpvBrandSupplements, setTpvBrandSupplements] = useState<TpvBrandSupplements>({});
  const [tpvDefaultExtraPrice, setTpvDefaultExtraPrice] = useState<number>(0);
  const [tpvFreeSwapOnRemove, setTpvFreeSwapOnRemove] = useState(false);
  const [tpvDeliveryFee, setTpvDeliveryFee] = useState<number>(0);
  /** Si true, no se cobra el envío automático en este pedido. */
  const [waiveDeliveryFee, setWaiveDeliveryFee] = useState(() => {
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      return !(Number(editingDeliveryOrder.deliveryFee) > 0);
    }
    return false;
  });
  const [recentOrdersPool, setRecentOrdersPool] = useState<DeliveryOrder[]>([]);

  // Step 4 - Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(() => {
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      const raw = String(editingDeliveryOrder.paymentMethod || '').trim();
      return raw ? normalizeTpvPaymentMethod(raw) : null;
    }
    return null;
  });
  const [paymentSplitOpen, setPaymentSplitOpen] = useState(false);
  /** Restaurant mesa: choice → items | amounts (como delivery al cobrar). */
  const [restaurantSplitStep, setRestaurantSplitStep] = useState<null | 'choice' | 'items' | 'amounts'>(null);
  const [pendingSplitParts, setPendingSplitParts] = useState<TpvSplitPaymentPart[] | null>(null);
  const [cashGiven, setCashGiven] = useState('');
  // Propina (solo cobro de cuenta de mesa en restaurante/bar)
  const [tipInput, setTipInput] = useState('');
  const [orderNotes, setOrderNotes] = useState(() => {
    if (editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) {
      return String(editingDeliveryOrder.notes || '').trim();
    }
    return '';
  });
  const [initialStatus, setInitialStatus] = useState<'nuevo' | 'cocina'>('nuevo');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoMode, setPromoMode] = useState<'none' | 'code' | 'client'>('none');
  const [promoCodeManual, setPromoCodeManual] = useState(false);
  const [clientPromos, setClientPromos] = useState<ClientPromotion[]>([]);
  const [selectedClientPromoId, setSelectedClientPromoId] = useState<string>('');
  const [companyPromos, setCompanyPromos] = useState<StoredPromotion[]>(() =>
    typeof window !== 'undefined' ? readStoredPromotions() : [],
  );
  const startQuickAttentionFlow = useCallback(() => {
    // Si ya escribieron un nombre en el buscador, reutilizarlo (evita reescribir y el autofill «Buscar»).
    setQuickNameDraft(quickAttentionNameFromClientSearch(phoneInput));
    setQuickPhoneDraft('');
    setQuickNamePromptOpen(true);
  }, [phoneInput]);

  const cancelQuickAttentionNamePrompt = useCallback(() => {
    setQuickNamePromptOpen(false);
    setQuickNameDraft('');
    setQuickPhoneDraft('');
  }, []);

  // Post-creation
  const [createdOrder, setCreatedOrder] = useState<DeliveryOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [changeTableOpen, setChangeTableOpen] = useState(false);
  const [mergeTableOpen, setMergeTableOpen] = useState(false);
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [restaurantClientPickerOpen, setRestaurantClientPickerOpen] = useState(false);
  const [restaurantClientQuery, setRestaurantClientQuery] = useState('');
  const [restaurantStaffConsumptionOpen, setRestaurantStaffConsumptionOpen] = useState(false);
  const actionBusyRef = useRef(false);

  const tpvErrorMeta = useMemo(
    () => ({
      page: location.pathname,
      businessId: currentBusiness?.business_id || '',
      businessName: currentBusiness?.name || '',
    }),
    [location.pathname, currentBusiness?.business_id, currentBusiness?.name],
  );

  const showTpvError = useCallback(
    (err: unknown, context: string, fallback?: string) => {
      toastActionError(err, context, fallback, tpvErrorMeta);
    },
    [tpvErrorMeta],
  );

  const effectiveOrderTakerId = useMemo(() => {
    if (!register) return normalizeClockinUserId(user?.user_id || user?.id) || '';
    const fromPicker = normalizeClockinUserId(register.selectedOrderTakerId);
    if (fromPicker) return fromPicker;
    const fromSession = normalizeClockinUserId(register.session?.workerId);
    if (fromSession) return fromSession;
    if (String(register.session?.workerName || '').trim()) {
      return normalizeClockinUserId(user?.user_id || user?.id);
    }
    return '';
  }, [register, user?.user_id, user?.id]);

  const selectedOrderTaker = useMemo(() => {
    if (!effectiveOrderTakerId) return null;
    if (!register) {
      return {
        id: effectiveOrderTakerId,
        name: String(user?.fullName || 'TPV').trim(),
        status: 'active' as const,
      };
    }
    return register.clockedInWorkers.find((w) => w.id === effectiveOrderTakerId) || null;
  }, [register, effectiveOrderTakerId, user?.fullName]);

  const { catalog, brands, loadingCatalog } = useTpvCatalog(userId, tpvCatalogBusinessId, {
    businesses,
    accountBusinessCount: businesses.length,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listPromotionsRequest(userId)
      .then((remote) => {
        if (cancelled || !Array.isArray(remote)) return;
        writeStoredPromotions(remote);
        setCompanyPromos(remote);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Precarga impresora: al cobrar el ticket arranca sin esperar el import.
  useEffect(() => {
    prefetchDeliveryTicketPrint();
  }, []);

  const reloadDeliveryCustomization = useCallback(() => {
    if (!userId) return;
    getDeliveryConfigRequest(userId)
      .then((cfg) => {
        const unified = unifyStoreIngredientsFromConfig(cfg || {}, brands.map((b) => b._id));
        const brandIds = brands.map((b) => b._id);
        const { ingredientSelection, brandSupplements } = resolveTpvBrandConfigFromDeliveryConfig(
          cfg || {},
          brandIds,
        );
        setTpvCategoryTemplates(normalizeTpvCategoryTemplates(cfg?.tpvCategoryTemplates));
        setStoreIngredients(unified);
        setTpvBrandIngredientSelection(ingredientSelection);
        setTpvBrandSupplements(brandSupplements);
        setTpvDefaultExtraPrice(inferTpvDefaultExtraPrice(unified, cfg?.tpvDefaultExtraPrice));
        setTpvFreeSwapOnRemove(cfg?.tpvFreeSwapOnRemove === true);
        setTpvDeliveryFee(Number(cfg?.tpvDeliveryFee) > 0 ? Number(cfg.tpvDeliveryFee) : 0);
      })
      .catch(() => {});
  }, [userId, brands]);

  const tpvCatalogLayout = isRestaurantMode ? 'brand_families' as const : 'default' as const;

  const catalogSections = useMemo(
    () =>
      buildTpvCatalogSections(brands, catalog, {
        includeAllTab: !isRestaurantMode,
        layout: tpvCatalogLayout,
      }),
    [brands, catalog, isRestaurantMode, tpvCatalogLayout],
  );

  const selectedScope = useMemo(
    () => parseTpvSectionId(selectedSectionId),
    [selectedSectionId],
  );

  useEffect(() => {
    brandInitRef.current = false;
    setSelectedSectionId('');
    setSelectedCategory(null);
    setProductPickerReset((n) => n + 1);
  }, [tpvCatalogBusinessId]);

  useEffect(() => {
    if (brandInitRef.current || catalogSections.length === 0) return;
    brandInitRef.current = true;
    setSelectedSectionId(defaultTpvSectionId(catalogSections, catalog, brands, tpvCatalogLayout));
  }, [catalogSections, catalog, brands, tpvCatalogLayout]);

  useEffect(() => {
    if (!selectedSectionId || loadingCatalog || catalog.length === 0) return;
    const scope = parseTpvSectionId(selectedSectionId);
    if (!scope || tpvSectionProductCount(catalog, scope, brands, tpvCatalogLayout) > 0) return;
    const fallback = defaultTpvSectionId(catalogSections, catalog, brands, tpvCatalogLayout);
    if (fallback && fallback !== selectedSectionId) {
      setSelectedSectionId(fallback);
      setSelectedCategory(null);
    }
  }, [selectedSectionId, loadingCatalog, catalog, catalogSections, brands, tpvCatalogLayout]);

  useEffect(() => {
    if (!userId || !tpvCatalogBusinessId || businesses.length === 0) return;
    prefetchTpvCatalog(userId, {
      scopeBusinessId: tpvCatalogBusinessId,
      businesses,
      accountBusinessCount: businesses.length,
    });
  }, [userId, tpvCatalogBusinessId, businesses]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getDeliveryConfigRequest(userId)
      .then((cfg) => {
        if (cancelled) return;
        setTpvCategoryTemplates(normalizeTpvCategoryTemplates(cfg?.tpvCategoryTemplates));
        const unified = unifyStoreIngredientsFromConfig(cfg || {}, brands.map((b) => b._id));
        const brandIds = brands.map((b) => b._id);
        const { ingredientSelection, brandSupplements } = resolveTpvBrandConfigFromDeliveryConfig(
          cfg || {},
          brandIds,
        );
        setStoreIngredients(unified);
        setTpvBrandIngredientSelection(ingredientSelection);
        setTpvBrandSupplements(brandSupplements);
        setTpvDefaultExtraPrice(inferTpvDefaultExtraPrice(unified, cfg?.tpvDefaultExtraPrice));
        setTpvFreeSwapOnRemove(cfg?.tpvFreeSwapOnRemove === true);
        setTpvDeliveryFee(Number(cfg?.tpvDeliveryFee) > 0 ? Number(cfg.tpvDeliveryFee) : 0);
      })
      .catch(() => {
        if (!cancelled) {
          setTpvCategoryTemplates({});
          setStoreIngredients([]);
          setTpvBrandIngredientSelection({});
          setTpvBrandSupplements({});
          setTpvDefaultExtraPrice(0);
          setTpvFreeSwapOnRemove(false);
          setTpvDeliveryFee(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, brands]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const onConfigChanged = () => reloadDeliveryCustomization();
    window.addEventListener(DELIVERY_CONFIG_CHANGED, onConfigChanged);
    return () => window.removeEventListener(DELIVERY_CONFIG_CHANGED, onConfigChanged);
  }, [userId, reloadDeliveryCustomization]);

  useEffect(() => {
    if (!userId || !customizeTarget) return;
    let cancelled = false;
    getDeliveryConfigRequest(userId)
      .then((cfg) => {
        if (cancelled) return;
        const brandIds = brands.map((b) => b._id);
        const unified = unifyStoreIngredientsFromConfig(cfg || {}, brandIds);
        const { ingredientSelection } = resolveTpvBrandConfigFromDeliveryConfig(cfg || {}, brandIds);
        setStoreIngredients(unified);
        setTpvBrandIngredientSelection(ingredientSelection);
        setTpvDefaultExtraPrice(inferTpvDefaultExtraPrice(unified, cfg?.tpvDefaultExtraPrice));
        setTpvFreeSwapOnRemove(cfg?.tpvFreeSwapOnRemove === true);
        setTpvDeliveryFee(Number(cfg?.tpvDeliveryFee) > 0 ? Number(cfg.tpvDeliveryFee) : 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, brands, customizeTarget?.item._id]);

  useEffect(() => {
    if (!userId) {
      setRecentOrdersPool([]);
      return;
    }
    const pdvId = String(register?.session?.pointOfSaleId || '').trim();
    const today = new Date().toISOString().slice(0, 10);
    let cancelled = false;
    filterDeliveryOrdersRequest(userId, {
      ...(pdvId ? { salesPointId: pdvId } : {}),
      dateFrom: `${today}T00:00:00.000Z`,
      dateTo: `${today}T23:59:59.999Z`,
      limit: MAX_ORDERS_FOR_TPV_INTEL,
    })
      .then(({ orders }) => {
        if (!cancelled) setRecentOrdersPool(orders.slice(0, MAX_ORDERS_FOR_TPV_INTEL));
      })
      .catch(() => {
        if (!cancelled) setRecentOrdersPool([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, register?.session?.pointOfSaleId]);

  /** Mesa ocupada solo cuando hay líneas en el ticket — no al abrir la mesa vacía. */
  useEffect(() => {
    if (!isRestaurantMode || !restaurantTable || restaurantTable.isCounter || !userId) return;

    const tableId = restaurantTable.id;
    const taker = register?.selectedOrderTakerId || user?.fullName || 'TPV';
    const accountOpen = Boolean(
      embeddedInRestaurantTpv && restaurantDiningOrder && !restaurantTable.isCounter,
    );

    if (accountOpen) {
      if (cart.length > 0 && !restaurantTableMarkedRef.current) {
        restaurantTableMarkedRef.current = true;
        void changeTableStatusRequest(userId, tableId, tableStatusOnOpen('available'), {
          currentGuests: restaurantDiningOrder?.guests || 1,
          occupiedBy: taker,
        }).catch(() => {
          restaurantTableMarkedRef.current = false;
        });
      }
      return;
    }

    if (cart.length > 0) {
      if (restaurantTableMarkedRef.current) return;
      restaurantTableMarkedRef.current = true;
      void changeTableStatusRequest(userId, tableId, tableStatusOnOpen('available'), {
        currentGuests: 1,
        occupiedBy: taker,
      }).catch(() => {
        restaurantTableMarkedRef.current = false;
      });
      return;
    }

    if (restaurantTableMarkedRef.current) {
      restaurantTableMarkedRef.current = false;
      void changeTableStatusRequest(userId, tableId, tableStatusOnRelease(), {
        currentGuests: 0,
        occupiedBy: '',
      }).catch(() => null);
    }
  }, [
    cart.length,
    isRestaurantMode,
    restaurantTable,
    userId,
    register?.selectedOrderTakerId,
    user?.fullName,
    embeddedInRestaurantTpv,
    restaurantDiningOrder,
  ]);

  // ─── Autofocus phone on mount or reset ─────────────────────────────────────
  useEffect(() => {
    if (isRestaurantMode) return;
    if (currentStep === 'client' && !selectedClient && !createdOrder) {
      setTimeout(() => phoneRef.current?.focus(), 100);
    }
  }, [currentStep, selectedClient, createdOrder, isRestaurantMode]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    if (!selectedScope) return [];
    return categoriesForTpvScope(selectedScope, brands, catalog, tpvCatalogLayout);
  }, [selectedScope, brands, catalog, tpvCatalogLayout]);

  const clientProductScores = useMemo(() => {
    if (!selectedClient?.id) return {};
    const scores: Record<string, number> = {};
    recentOrdersPool
      .filter((o) => o.clientId === selectedClient.id)
      .slice(0, 60)
      .forEach((order) => {
        order.items.forEach((item: DeliveryOrderItem) => {
          const key = String(item.catalogItemId || '').trim();
          if (!key) return;
          scores[key] = (scores[key] || 0) + Number(item.quantity || 1);
        });
      });
    return scores;
  }, [recentOrdersPool, selectedClient?.id]);

  const globalCoPurchaseScores = useMemo(
    () => buildCoPurchaseScores(recentOrdersPool),
    [recentOrdersPool],
  );

  const clientCoPurchaseScores = useMemo(() => {
    if (!selectedClient?.id) return {};
    return buildCoPurchaseScores(recentOrdersPool.filter((o) => o.clientId === selectedClient.id));
  }, [recentOrdersPool, selectedClient?.id]);

  const catalogById = useMemo(() => {
    const m: Record<string, CatalogItem> = {};
    catalog.forEach((i) => {
      m[i._id] = i;
    });
    return m;
  }, [catalog]);

  const isEditingDeliveryOrder = Boolean(
    editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder),
  );
  const editHydratedRef = useRef<string | null>(null);

  // Hidratar carrito al editar (domicilio o recogida; montaje o reparto).
  // Si ya hay ítems en memoria/caché, tratar como listo aunque haya revalidación en curso
  // (evita stub→ready y el parpadeo del spinner en tablet).
  useEffect(() => {
    if (!editingDeliveryOrder || !isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)) return;
    if (!userId) return;
    const orderId = String(editingDeliveryOrder._id || '').trim();
    if (!orderId) return;

    const catalogReady = !loadingCatalog || Object.keys(catalogById).length > 0;
    const hydrateKey = `${orderId}:${catalogReady ? 'ready' : 'stub'}`;
    if (editHydratedRef.current === hydrateKey) return;
    // Si ya hidratamos con carta lista, no pisar con stubs ni resetear el picker.
    if (editHydratedRef.current === `${orderId}:ready`) return;
    const firstHydrate = !editHydratedRef.current || !String(editHydratedRef.current).startsWith(`${orderId}:`);
    editHydratedRef.current = hydrateKey;
    // Sin toasts al entrar a editar (evita aviso amarillo fugaz arriba).
    toast.dismiss();

    const order = editingDeliveryOrder;
    const seeds = seedTpvCartFromDeliveryOrder(order, catalogById, userId);
    setCart(
      seeds.map((s) => ({
        lineId: s.lineId,
        catalogItem: s.catalogItem,
        quantity: s.quantity,
        customization: s.customization,
      })),
    );
    setOrderNotes(String(order.notes || '').trim());
    setWaiveDeliveryFee(!(Number(order.deliveryFee) > 0));
    const dtype = (order.deliveryType === 'recogida' ? 'recogida' : 'domicilio') as DeliveryType;
    setDeliveryType(dtype);
    setSelectedAddressId(order.deliveryAddressId || null);
    const pay = normalizeTpvPaymentMethod(order.paymentMethod);
    if (pay) setPaymentMethod(pay);
    setCurrentStep('products');
    setCompletedSteps(new Set(['client', 'delivery']));
    // Solo resetear el picker en la 1.ª hidratación (no al pasar stub→ready).
    if (firstHydrate) {
      setProductPickerReset((n) => n + 1);
    }

    const clientId = String(order.clientId || '').trim();
    if (clientId && !isTpvSyntheticClientId(clientId)) {
      void getClientForTpvRequest(userId, clientId)
        .then((c) => {
          if (c) selectClient(c);
        })
        .catch(() => {
          selectClient(
            buildDeliveryQuickAttentionClient(
              userId,
              writeBusinessId || businessId || '',
              order.customerName || 'Cliente',
              order.customerPhone || '',
              '+34',
            ),
          );
        });
    } else {
      selectClient(
        buildDeliveryQuickAttentionClient(
          userId,
          writeBusinessId || businessId || '',
          order.customerName || 'Cliente',
          order.customerPhone || '',
          '+34',
        ),
      );
    }
  }, [
    editingDeliveryOrder,
    userId,
    catalogById,
    loadingCatalog,
    selectClient,
    writeBusinessId,
    businessId,
  ]);

  const hasPricedProducts = useMemo(
    () => catalog.some((item) => Number(item.unitPrice || 0) > 0),
    [catalog],
  );

  const habitualProducts = useMemo(
    () =>
      catalog
        .filter(
          (p) =>
            isTpvSellableCatalogItem(p) &&
            (clientProductScores[p._id] || 0) > 0,
        )
        .sort((a, b) => (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0))
        .slice(0, 6),
    [catalog, clientProductScores],
  );

  const crossSellProducts = useMemo(() => {
    const cartIds = new Set(cart.map((c) => c.catalogItem._id));
    if (cartIds.size === 0) return [];

    const merged = new Map<string, number>();
    const accumulate = (matrix: Record<string, Record<string, number>>, weight: number) => {
      for (const cid of cartIds) {
        const row = matrix[cid];
        if (!row) continue;
        for (const [pid, n] of Object.entries(row)) {
          if (cartIds.has(pid)) continue;
          merged.set(pid, (merged.get(pid) || 0) + n * weight);
        }
      }
    };

    accumulate(globalCoPurchaseScores, 1);
    if (selectedClient?.id) accumulate(clientCoPurchaseScores, 2.8);

    const isSellable = (item: CatalogItem | undefined) =>
      !!item &&
      Number(item.unitPrice || 0) > 0 &&
      isTpvSellableCatalogItem(item);

    const ranked = [...merged.entries()].sort((a, b) => b[1] - a[1]);
    const picked: CatalogItem[] = [];
    for (const [pid] of ranked) {
      const item = catalogById[pid];
      if (!isSellable(item)) continue;
      picked.push(item);
      if (picked.length >= 10) break;
    }

    if (picked.length < 4) {
      const cartCategories = new Set(
        cart.map((c) => c.catalogItem.category).filter(Boolean) as string[],
      );
      for (const item of catalog) {
        if (picked.length >= 8) break;
        if (!item.category || !cartCategories.has(item.category)) continue;
        if (cartIds.has(item._id)) continue;
        if (!isSellable(item)) continue;
        if (picked.some((p) => p._id === item._id)) continue;
        picked.push(item);
      }
    }

    if (picked.length < 3 && selectedClient?.id) {
      for (const item of catalog) {
        if (picked.length >= 8) break;
        if ((clientProductScores[item._id] || 0) <= 0) continue;
        if (cartIds.has(item._id)) continue;
        if (!isSellable(item)) continue;
        if (picked.some((p) => p._id === item._id)) continue;
        picked.push(item);
      }
    }

    return picked.slice(0, 8);
  }, [
    cart,
    globalCoPurchaseScores,
    clientCoPurchaseScores,
    catalogById,
    catalog,
    selectedClient?.id,
    clientProductScores,
  ]);

  const cartTotal = useMemo(
    () => cart.reduce(
      (sum, ci) => sum + cartLineTotal(ci.catalogItem.unitPrice, ci.quantity, ci.customization),
      0,
    ),
    [cart],
  );

  const autoPromoCalc = useMemo(() => {
    const lines = cart.map((ci) => {
      const base = Number(ci.catalogItem.unitPrice || 0);
      const extras = cartLineExtrasUnitPrice(ci.customization);
      return {
        productId: ci.catalogItem._id,
        name: ci.catalogItem.name || '',
        baseUnitPrice: base,
        extrasUnitPrice: extras,
        unitPrice: cartLineUnitPrice(base, ci.customization),
        quantity: ci.quantity,
      };
    });
    const salesPointId = String(register?.session?.pointOfSaleId || '').trim();
    return priceLinesWithFixedUnitPromos(
      lines,
      listAutoFixedUnitPricePromotions(companyPromos, new Date(), { salesPointId }),
    );
  }, [cart, companyPromos, register?.session?.pointOfSaleId]);

  /** Precio cobrado por línea (promo 11€ ya metida en el € de la pizza). */
  const pricedByLineId = useMemo(() => {
    const map = new Map<string, (typeof autoPromoCalc.priced)[number]>();
    cart.forEach((ci, idx) => {
      const row = autoPromoCalc.priced[idx];
      if (row) map.set(ci.lineId, row);
    });
    return map;
  }, [cart, autoPromoCalc.priced]);

  /** Subtotal visible = suma de lo que se cobra en líneas (no el catálogo lleno). */
  const chargedCartTotal = useMemo(
    () => Math.max(0, cartTotal - Math.min(cartTotal, Math.max(0, autoPromoCalc.discount))),
    [cartTotal, autoPromoCalc.discount],
  );

  const clientPromoSelected = useMemo(() => {
    if (!selectedClientPromoId) return null;
    return clientPromos.find((p) => p.id === selectedClientPromoId) || null;
  }, [clientPromos, selectedClientPromoId]);

  const compute2x1Discount = useCallback(() => {
    const unitPrices: number[] = [];
    for (const ci of cart) {
      const u = cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization);
      if (!Number.isFinite(u) || u <= 0) continue;
      for (let i = 0; i < ci.quantity; i++) unitPrices.push(u);
    }
    if (unitPrices.length < 2) return 0;
    unitPrices.sort((a, b) => a - b);
    const freeCount = Math.floor(unitPrices.length / 2);
    let discount = 0;
    for (let i = 0; i < freeCount; i++) discount += unitPrices[i];
    return Math.max(0, discount);
  }, [cart]);

  const effectiveCalc = useMemo(() => {
    const autoDiscount = Math.min(cartTotal, Math.max(0, autoPromoCalc.discount));
    const afterAuto = Math.max(0, cartTotal - autoDiscount);

    let manualDiscount = 0;
    if (promoMode === 'code') {
      manualDiscount = computePromoDiscount(afterAuto, appliedPromo).discount;
    } else if (promoMode === 'client') {
      if (clientPromoSelected) {
        const isActive = String(clientPromoSelected.estado || '').toLowerCase() === 'activa';
        if (isActive) {
          const tipo = String(clientPromoSelected.tipo || '').toLowerCase();
          if (tipo === '2x1') {
            manualDiscount = Math.min(afterAuto, compute2x1Discount());
          } else if (tipo === 'descuento') {
            const pct = Math.min(100, Math.max(0, Number(clientPromoSelected.descuento || 0)));
            manualDiscount = Math.min(afterAuto, (afterAuto * pct) / 100);
          }
        }
      }
    }

    const discount = Math.min(cartTotal, autoDiscount + manualDiscount);
    return {
      discount,
      finalTotal: Math.max(0, cartTotal - discount),
      autoDiscount,
      manualDiscount,
      autoPromoNames: autoPromoCalc.applied.map((p) => p.name).filter(Boolean),
    };
  }, [promoMode, cartTotal, appliedPromo, clientPromoSelected, compute2x1Discount, autoPromoCalc]);

  const finalTotal = effectiveCalc.finalTotal;
  /**
   * En pedido: la promo fija ya va en el precio de línea.
   * Solo guardamos descuentos “aparte” (código / cliente) para no restar dos veces.
   */
  const discountAmount = effectiveCalc.manualDiscount;

  const configuredDeliveryFee = useMemo(() => {
    if (isRestaurantMode) return 0;
    if (deliveryType !== 'domicilio') return 0;
    const fee = Number(tpvDeliveryFee || 0);
    if (!Number.isFinite(fee) || fee <= 0) return 0;
    return Math.round(fee * 100) / 100;
  }, [isRestaurantMode, deliveryType, tpvDeliveryFee]);

  const deliveryFeeAmount = waiveDeliveryFee ? 0 : configuredDeliveryFee;

  /** Total a cobrar: productos − promos + envío (si domicilio y no se quitó). */
  const payableTotal = useMemo(
    () => Math.max(0, finalTotal + deliveryFeeAmount),
    [finalTotal, deliveryFeeAmount],
  );

  useEffect(() => {
    if (deliveryType !== 'domicilio') setWaiveDeliveryFee(false);
  }, [deliveryType]);

  const cartCount = useMemo(
    () => cart.reduce((sum, ci) => sum + ci.quantity, 0),
    [cart],
  );

  const selectableCompanyCodes = useMemo(() => {
    const salesPointId = String(register?.session?.pointOfSaleId || '').trim();
    return listSelectableCompanyPromoCodes({
      salesPointId,
      relatedSalesPointIds: [salesPointId],
    });
    // companyPromos refresca al sync remoto
  }, [companyPromos, register?.session?.pointOfSaleId]);

  const applyPromoCode = useCallback(() => {
    const code = promoCodeInput.trim();
    if (!code) {
      toast.error('Introduce un código');
      return;
    }
    const found = findActivePromotionByCode(code);
    if (!found) {
      toast.error('Código no válido o no está activo');
      return;
    }
    setAppliedPromo(found);
    setPromoCodeInput(found.code);
    setPromoMode('code');
    setPromoCodeManual(false);
    toast.success(`Código aplicado: ${found.code}`);
  }, [promoCodeInput]);

  const applyPromoFromList = useCallback((code: string) => {
    const raw = String(code || '').trim();
    if (!raw) {
      setAppliedPromo(null);
      setPromoCodeInput('');
      return;
    }
    if (raw === '__manual__') {
      setPromoCodeManual(true);
      setAppliedPromo(null);
      setPromoCodeInput('');
      return;
    }
    const found = findActivePromotionByCode(raw);
    if (!found) {
      toast.error('Código no válido o no está activo');
      return;
    }
    setPromoCodeManual(false);
    setAppliedPromo(found);
    setPromoCodeInput(found.code);
    setPromoMode('code');
    toast.success(`Código aplicado: ${found.code}`);
  }, []);

  const clearPromoCode = useCallback(() => {
    setAppliedPromo(null);
    setPromoCodeInput('');
    setPromoCodeManual(false);
    if (promoMode === 'code') setPromoMode('none');
  }, [promoMode]);

  const deliveryFlowClient =
    selectedClient
    || (quickAttentionActive ? quickAttentionClient : null)
    // Editar con «+»: placeholder al instante (CRM puede llegar async → sin esto = blanco).
    || (
      editingDeliveryOrder && isDeliveryOrderEditableOnTpvBoard(editingDeliveryOrder)
        ? buildDeliveryQuickAttentionClient(
          userId || 'tpv',
          writeBusinessId || businessId || 'tpv',
          resolveTpvCustomerDisplayName(editingDeliveryOrder.customerName, 'Cliente'),
          editingDeliveryOrder.customerPhone || '',
          '+34',
        )
        : null
    );

  const isStepReachable = useCallback(
    (step: Step) => {
      if (isRestaurantMode) {
        if (step === 'client' || step === 'delivery') return false;
        if (step === 'products') return true;
        if (step === 'payment') {
          const due =
            restaurantDiningOrder && !restaurantTable?.isCounter
              ? diningOrderDueAmount(restaurantDiningOrder)
              : 0;
          return cart.length > 0 || due > 0;
        }
        return false;
      }
      if (step === 'client') return true;
      if (step === 'delivery') return !!deliveryFlowClient;
      if (step === 'products') return !!deliveryFlowClient && !!deliveryType;
      if (step === 'payment') return !!deliveryFlowClient && !!deliveryType && cart.length > 0;
      return false;
    },
    [isRestaurantMode, deliveryFlowClient, deliveryType, cart.length, restaurantDiningOrder, restaurantTable],
  );

  const restaurantLinkedClient = useMemo(() => {
    if (!isRestaurantMode) return null;
    if (selectedClient?.id && selectedClient.id !== RESTAURANT_WALKIN_CLIENT_ID) {
      return selectedClient;
    }
    const linkedId = String(restaurantDiningOrder?.clientId || '').trim();
    const linkedName = String(restaurantDiningOrder?.clientName || '').trim();
    if (linkedId) {
      return {
        ...tableWalkInClient,
        id: linkedId,
        name: linkedName || 'Cliente sala',
      };
    }
    return null;
  }, [isRestaurantMode, selectedClient, restaurantDiningOrder?.clientId, restaurantDiningOrder?.clientName, tableWalkInClient]);

  const saleClient = isRestaurantMode
    ? (restaurantLinkedClient || tableWalkInClient)
    : deliveryFlowClient;

  const orderReady =
    !!effectiveOrderTakerId &&
    !!saleClient &&
    !!deliveryType &&
    cart.length > 0 &&
    (isRestaurantMode || deliveryType !== 'domicilio' || !!selectedAddressId);

  /** Domicilio: hay que anotar efectivo/tarjeta. Recogida: sin pago aquí (cobra al Entregar). */
  const paymentRequiredToSubmit = deliveryType === 'domicilio';
  const canSubmit = orderReady && (!paymentRequiredToSubmit || !!paymentMethod);
  const isProductsFocus = currentStep === 'products' && isStepReachable('products');

  const deliveryStepReady =
    deliveryType === 'recogida'
    || (deliveryType === 'domicilio' && !!selectedAddressId);
  const deliveryCanContinue =
    deliveryType === 'recogida'
    || (deliveryType === 'domicilio' && !!selectedAddressId && !!paymentMethod);

  const choosePaymentMethod = useCallback((key: PaymentMethod) => {
    setPaymentMethod(key);
    setPendingSplitParts(null);
    if (key !== 'efectivo') setCashGiven('');
  }, []);

  const commitCartLine = useCallback(
    (item: CatalogItem, customization: CartLineCustomization, editLineId: string | null) => {
      if (!item.active) return;
      const sig = customizationSignature(customization);
      setCart((prev) => {
        if (editLineId) {
          return prev.map((ci) =>
            ci.lineId === editLineId ? { ...ci, customization } : ci,
          );
        }
        const mergeIdx = prev.findIndex(
          (ci) =>
            ci.catalogItem._id === item._id &&
            customizationSignature(ci.customization) === sig,
        );
        if (mergeIdx >= 0) {
          return prev.map((ci, idx) =>
            idx === mergeIdx ? { ...ci, quantity: ci.quantity + 1 } : ci,
          );
        }
        return [
          ...prev,
          {
            lineId: uuidv4(),
            catalogItem: item,
            quantity: 1,
            customization,
          },
        ];
      });
      setCustomizeTarget(null);
    },
    [],
  );

  const handleProductPick = useCallback((item: CatalogItem) => {
    if (!item.active) return;
    if (isTpvHalfHalfCatalogItem(item)) {
      setHalfHalfTarget({ item, lineId: null, initial: EMPTY_CART_CUSTOMIZATION });
      return;
    }
    if (isTpvComboCatalogItem(item)) {
      setComboTarget({ item, lineId: null, initial: EMPTY_CART_CUSTOMIZATION });
      return;
    }
    setCustomizeTarget({ item, lineId: null, initial: EMPTY_CART_CUSTOMIZATION });
  }, []);

  const handleHalfHalfConfirm = useCallback(
    (selection: import('../../lib/catalogCustomization').HalfHalfPizzaSelection) => {
      if (!halfHalfTarget) return;
      const customization: CartLineCustomization = {
        ...(halfHalfTarget.initial ?? EMPTY_CART_CUSTOMIZATION),
        halfHalfPizza: selection,
      };
      const { item, lineId } = halfHalfTarget;
      setHalfHalfTarget(null);
      setCustomizeTarget({ item, lineId, initial: customization });
    },
    [halfHalfTarget],
  );

  const handleComboConfirm = useCallback(
    (selections: import('../../lib/deliveryApi').CatalogComboRef[]) => {
      if (!comboTarget) return;
      const customization: CartLineCustomization = {
        ...EMPTY_CART_CUSTOMIZATION,
        notes: String(comboTarget.initial?.notes || '').trim(),
        comboSelections: selections,
      };
      const { item, lineId } = comboTarget;
      setComboTarget(null);
      commitCartLine(item, customization, lineId);
    },
    [comboTarget, commitCartLine],
  );

  const incrementCartLine = useCallback((lineId: string) => {
    setCart((prev) =>
      prev.map((ci) => (ci.lineId === lineId ? { ...ci, quantity: ci.quantity + 1 } : ci)),
    );
  }, []);

  const decrementCartLine = useCallback((lineId: string) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.lineId === lineId);
      if (!existing) return prev;
      if (existing.quantity <= 1) return prev.filter((ci) => ci.lineId !== lineId);
      return prev.map((ci) =>
        ci.lineId === lineId ? { ...ci, quantity: ci.quantity - 1 } : ci,
      );
    });
  }, []);

  const decrementCatalogInCart = useCallback((itemId: string) => {
    setCart((prev) => {
      const idx = [...prev].reverse().findIndex((ci) => ci.catalogItem._id === itemId);
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      const line = prev[realIdx];
      if (line.quantity <= 1) return prev.filter((_, i) => i !== realIdx);
      return prev.map((ci, i) =>
        i === realIdx ? { ...ci, quantity: ci.quantity - 1 } : ci,
      );
    });
  }, []);

  const updateCartLineNotes = useCallback((lineId: string, notes: string) => {
    setCart((prev) =>
      prev.map((ci) =>
        ci.lineId === lineId
          ? { ...ci, customization: { ...ci.customization, notes } }
          : ci,
      ),
    );
  }, []);

  const getCartQty = useCallback(
    (itemId: string) =>
      cart
        .filter((ci) => ci.catalogItem._id === itemId)
        .reduce((sum, ci) => sum + ci.quantity, 0),
    [cart],
  );

  // ─── Step navigation ──────────────────────────────────────────────────────
  const completeStep = useCallback(
    (step: Step) => {
      setCompletedSteps((prev) => new Set(prev).add(step));
      const order: Step[] = ['client', 'delivery', 'products', 'payment'];
      const idx = order.indexOf(step);
      if (idx < order.length - 1) setCurrentStep(order[idx + 1]);
    },
    [],
  );

  const editStep = useCallback((step: Step) => {
    setCurrentStep(step);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(step);
      return next;
    });
  }, []);

  const resetFlowFromClientStep = useCallback(() => {
    appliedClientIdFromUrl.current = null;
    setQuickAttentionActive(false);
    clearSelection();
    setCompletedSteps(new Set());
    setCurrentStep('client');
    setDeliveryType(null);
    setSelectedAddressId(null);
    setShowNewAddress(false);
    setAddressWarning(false);
    setCart([]);
    setProductPickerReset((n) => n + 1);
    setSelectedCategory(null);
    if (catalogSections.length > 0) {
      setSelectedSectionId(defaultTpvSectionId(catalogSections, catalog, brands, tpvCatalogLayout));
    }
    setPaymentMethod(null);
    setCashGiven('');
    setTipInput('');
    setOrderNotes('');
    setInitialStatus('nuevo');
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoMode('none');
    setClientPromos([]);
    setSelectedClientPromoId('');
  }, [clearSelection, catalogSections, catalog]);

  const exitQuickAttentionToClientSearch = useCallback(() => {
    setQuickAttentionActive(false);
    setQuickAttentionName('Atención rápida');
    setQuickAttentionPhone('');
    setQuickNamePromptOpen(false);
    setQuickNameDraft('');
    setQuickPhoneDraft('');
    clearSelection();
    clearResults();
    clearClientPhoneSearchCache();
    setPhoneInput('');
    setShowCreateForm(false);
    setCompletedSteps(new Set());
    setDeliveryType(null);
    setCurrentStep('client');
    setTimeout(() => phoneRef.current?.focus(), 150);
  }, [clearSelection, clearResults]);

  const goToPreviousStep = useCallback(() => {
    if (isRestaurantMode) {
      if (currentStep === 'payment') setCurrentStep('products');
      return;
    }
    if (
      currentStep === 'delivery'
      && (quickAttentionActive || isQuickAttentionFlowClient(selectedClient))
    ) {
      exitQuickAttentionToClientSearch();
      return;
    }
    if (
      currentStep === 'products'
      && (quickAttentionActive || isQuickAttentionFlowClient(selectedClient))
      && deliveryType === 'recogida'
    ) {
      setCurrentStep('delivery');
      return;
    }
    const order: Step[] = ['client', 'delivery', 'products', 'payment'];
    const idx = order.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(order[idx - 1]);
    }
  }, [currentStep, isRestaurantMode, selectedClient, deliveryType, quickAttentionActive, exitQuickAttentionToClientSearch]);

  // ─── Client selection ─────────────────────────────────────────────────────
  const handleSelectClient = useCallback(
    (client: Client) => {
      setQuickAttentionActive(false);
      selectClient(client);
      setShowCreateForm(false);
      setDuplicateWarning(false);
      const pref = String(client.defaultPaymentMethod || '').trim().toLowerCase();
      if (pref === 'efectivo' || pref === 'tarjeta') {
        setPaymentMethod(pref);
      } else {
        setPaymentMethod(null);
      }
      const assigned = getClientAppliedPromo(client.id);
      if (assigned) {
        setAppliedPromo(assigned);
        setPromoCodeInput(assigned.code);
        // el CEO decide en pago, pero si ya hay asignado dejamos modo "code" listo
        setPromoMode('code');
      } else {
        setAppliedPromo(null);
        setPromoCodeInput('');
        setPromoMode('none');
      }
      setClientPromos([]);
      setSelectedClientPromoId('');
      if (userId && !isTpvSyntheticClientId(client.id)) {
        fetchClientPromotionsRequest(userId, client.id)
          .then((promos) => {
            setClientPromos(promos || []);
            const firstActive = (promos || []).find((p) => String(p.estado || '').toLowerCase() === 'activa');
            if (firstActive) setSelectedClientPromoId(firstActive.id);
          })
          .catch(() => {});
      }
      const addrs = resolveClientDeliveryAddresses(client);
      const primary = addrs.find((a) => isPrimaryClientAddress(a, addrs));
      if (primary) setSelectedAddressId(primary.id);
      setEditingAddressId(null);
      completeStep('client');
    },
    [selectClient, completeStep, userId],
  );

  const clientIdFromUrl = searchParams.get('clientId');
  useEffect(() => {
    if (!clientIdFromUrl || !userId) return;
    if (appliedClientIdFromUrl.current === clientIdFromUrl) return;

    const applyClientFromUrl = (match: Parameters<typeof handleSelectClient>[0]) => {
      appliedClientIdFromUrl.current = clientIdFromUrl;
      handleSelectClient(match);
      setPhonePrefix(match.phonePrefix || '');
      setPhoneInput(String(match.phone || '').replace(/\D/g, ''));
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('clientId');
          return next;
        },
        { replace: true },
      );
    };

    const cached = clients.find((c) => c.id === clientIdFromUrl);
    if (cached) {
      applyClientFromUrl(cached);
      return;
    }

    let cancelled = false;
    getClientForTpvRequest(userId, clientIdFromUrl)
      .then((client) => {
        if (cancelled || !client) return;
        applyClientFromUrl(client);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [clientIdFromUrl, userId, clients, handleSelectClient, setSearchParams]);

  const handleCreateClient = useCallback(async () => {
    const normalizedPhone = normalizeClientPhoneForSave(newClientPhone);
    const phoneDigits = normalizedPhone.phone;
    if (!newClientName.trim() || phoneDigits.length < MIN_CLIENT_PHONE_DIGITS) {
      toast.error(`Completa nombre y teléfono (mín. ${MIN_CLIENT_PHONE_DIGITS} dígitos)`);
      return;
    }
    if (!userId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }
    setCreatingClient(true);
    try {
      const selectedCashier = selectedOrderTaker;
      const primaryBranchId = currentBusiness?.branches?.[0]?.branch_id || '';
      const street = newClientStreet.trim();
      const clientData: Omit<Client, 'id' | 'createdAt'> = {
        type: 'client',
        user_id: userId,
        ...((writeBusinessId || businessId)
          ? { businessId: writeBusinessId || businessId, business_id: writeBusinessId || businessId }
          : {}),
        clientType: 'particular',
        name: newClientName.trim(),
        phone: phoneDigits,
        phonePrefix: normalizedPhone.phonePrefix,
        email: '',
        status: 'active' as const,
        responsible: selectedCashier?.name || user?.fullName || user?.firstName || 'TPV',
        branch_id: primaryBranchId,
        tags: ['tpv'],
        address: street,
        city: isDeliveryBusiness ? newClientCity.trim() : '',
        notes: newClientNotes.trim(),
        consents: { dataProcessing: false, commercial: false, thirdParty: false },
        defaultPaymentMethod: (newClientPayment || '') as Client['defaultPaymentMethod'],
        // Dirección opcional: solo se guarda si hay calle (recogida / cliente sin domicilio aún).
        addresses: street
          ? [
              {
                id: uuidv4(),
                label: 'Casa',
                street,
                city: isDeliveryBusiness ? (newClientCity.trim() || undefined) : undefined,
                isPrimary: true,
                usageCount: 0,
                lastUsedAt: null,
              },
            ]
          : [],
        stats: {
          totalOrders: 0,
          lastOrderDate: null,
          orderFrequencyDays: 0,
          favoriteAddressId: null,
          totalSpent: 0,
          createdFrom: 'tpv' as const,
          acquisitionKind: 'organic' as const,
        },
      };
      const created = await addClient(clientData);
      if (!created) {
        toast.error('No se pudo crear el cliente. Inténtalo de nuevo.');
        return;
      }
      clearClientPhoneSearchCache();
      toast.success('Cliente creado');
      setShowCreateForm(false);
      setNewClientName('');
      setNewClientStreet('');
      setNewClientCity('');
      setNewClientNotes('');
      setNewClientPayment('');
      setNewClientPhone('');
      setPhoneInput(created.phone || phoneDigits);
      setPhonePrefix(created.phonePrefix || '');
      handleSelectClient(created);
    } catch (err: unknown) {
      toast.error(toUserFacingMessage(err, 'No se pudo crear el cliente'));
    } finally {
      setCreatingClient(false);
    }
  }, [
    userId,
    phonePrefix,
    newClientPhone,
    newClientName,
    newClientStreet,
    newClientCity,
    isDeliveryBusiness,
    newClientNotes,
    newClientPayment,
    handleSelectClient,
    addClient,
    selectedOrderTaker,
    currentBusiness?.branches,
    user?.fullName,
    user?.firstName,
  ]);

  const confirmQuickAttentionName = useCallback(async () => {
    const name = quickNameDraft.trim();
    const nameError = validateTpvQuickAttentionName(name);
    if (nameError) {
      toast.error(nameError);
      return;
    }
    const searchUid = clientSearchUserId || userId;
    if (!searchUid) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    const normalizedPhone = normalizeClientPhoneForSave(quickPhoneDraft);
    const phoneDigits = normalizedPhone.phone;
    // Teléfono opcional: solo cuenta si llega al mínimo. Menos = se ignora (no bloquea).
    const hasPhone = phoneDigits.length >= MIN_CLIENT_PHONE_DIGITS;
    const bizId = writeBusinessId || businessId || '';
    const selectedCashier = selectedOrderTaker;
    const primaryBranchId = currentBusiness?.branches?.[0]?.branch_id || '';

    const finishWithClient = (crmClient: Client | null, phoneForFlow: string) => {
      clearResults();
      clearClientPhoneSearchCache();
      setQuickAttentionName(name);
      setQuickAttentionPhone(phoneForFlow);
      setQuickNamePromptOpen(false);
      setQuickNameDraft('');
      setQuickPhoneDraft('');
      setShowCreateForm(false);
      setDuplicateWarning(false);
      setPhoneInput(phoneForFlow);
      setPhoneShake(false);
      setDeliveryType('recogida');
      setSelectedAddressId(null);
      setShowNewAddress(false);
      setAddressWarning(false);
      setEditingAddressId(null);
      setPaymentMethod(null);
      setAppliedPromo(null);
      setPromoCodeInput('');
      setPromoMode('none');
      setClientPromos([]);
      setSelectedClientPromoId('');
      if (crmClient) {
        setQuickAttentionActive(false);
        handleSelectClient(crmClient);
      } else {
        // Sin ficha CRM: flujo sintético (nombre en cocina/ticket).
        clearSelection();
        setQuickAttentionActive(true);
      }
      // Atención rápida = recogida: ir directo a carta (evita paso vacío / blanco).
      setCompletedSteps(new Set(['client', 'delivery']));
      setCurrentStep('products');
    };

    // Solo nombre (sin teléfono completo) → NO crear ficha en CRM.
    // El pedido usa cliente sintético TPV (nombre en cocina/ticket).
    if (!hasPhone) {
      toast.message('Pedido rápido sin CRM', {
        description: 'Solo nombre: no se guarda en clientes. Con teléfono completo sí.',
      });
      finishWithClient(null, '');
      return;
    }

    setCreatingClient(true);
    try {
      let crmClient: Client | null = null;
      try {
        const { clients: matches } = await searchClientsByPhoneRequest(
          searchUid,
          phoneDigits,
          5,
          undefined,
          undefined,
          { includeLegacy: true, fallbackAll: true },
        );
        const exact = matches.find((c) => clientPhonesMatch(c.phone, phoneDigits));
        if (exact) crmClient = exact;
      } catch {
        // Si falla la búsqueda, intentamos crear igual.
      }

      if (crmClient) {
        toast.success('Cliente encontrado en CRM');
        finishWithClient(crmClient, phoneDigits);
        return;
      }

      const clientData: Omit<Client, 'id' | 'createdAt'> = {
        type: 'client',
        user_id: searchUid,
        ...(bizId ? { businessId: bizId, business_id: bizId } : {}),
        clientType: 'particular',
        name,
        phone: phoneDigits,
        phonePrefix: normalizedPhone.phonePrefix,
        email: '',
        status: 'active',
        responsible: selectedCashier?.name || user?.fullName || user?.firstName || 'TPV',
        branch_id: primaryBranchId,
        tags: ['tpv', 'quick-attention'],
        address: '',
        city: '',
        notes: 'Alta desde atención rápida TPV',
        consents: { dataProcessing: false, commercial: false, thirdParty: false },
        defaultPaymentMethod: '',
        addresses: [],
        commercialStatus: 'active',
        stats: {
          totalOrders: 0,
          lastOrderDate: null,
          orderFrequencyDays: 0,
          favoriteAddressId: null,
          totalSpent: 0,
          createdFrom: 'tpv',
          acquisitionKind: 'organic',
        },
      };

      try {
        const created = await addClient(clientData);
        if (created) {
          toast.success('Cliente guardado en CRM');
          finishWithClient(created, phoneDigits);
          return;
        }
      } catch {
        // Fallo al crear: el pedido puede seguir sin CRM.
      }

      toast.error('No se pudo guardar el cliente. Revisa el teléfono o continúa solo con el nombre.');
      finishWithClient(null, '');
    } catch (err: unknown) {
      // Último recurso: no impedir el pedido rápido.
      toast.message('Continuamos sin guardar en CRM', {
        description: toUserFacingMessage(err, 'El pedido rápido sigue disponible'),
      });
      finishWithClient(null, hasPhone ? phoneDigits : '');
    } finally {
      setCreatingClient(false);
    }
  }, [
    quickNameDraft,
    quickPhoneDraft,
    clientSearchUserId,
    userId,
    writeBusinessId,
    businessId,
    selectedOrderTaker,
    currentBusiness?.branches,
    user?.fullName,
    user?.firstName,
    addClient,
    clearResults,
    clearSelection,
    handleSelectClient,
  ]);

  // ─── Address creation ─────────────────────────────────────────────────────
  const handleSaveNewAddress = useCallback(async () => {
    if (!newAddrStreet.trim() || !selectedClient) return;
    if (isDeliveryBusiness && !newAddrCity.trim()) {
      toast.error('Indica la ciudad de la dirección');
      return;
    }
    setSavingAddress(true);
    try {
      const newAddr: ClientAddress = {
        id: uuidv4(),
        label: newAddrLabel,
        street: newAddrStreet.trim(),
        city: newAddrCity.trim() || undefined,
        postalCode: newAddrPostal.trim() || undefined,
        notes: newAddrNotes.trim() || undefined,
        isPrimary: newAddrPrimary,
        usageCount: 0,
        lastUsedAt: null,
      };
      const existingAddresses = (selectedClient.addresses || []).map((a) =>
        newAddrPrimary ? { ...a, isPrimary: false } : a,
      );
      const updated = await updateClientRequest(userId, {
        ...selectedClient,
        addresses: [...existingAddresses, newAddr],
      } as Client);
      if (updated) {
        selectClient(updated);
        setSelectedAddressId(newAddr.id);
        setShowNewAddress(false);
        setNewAddrStreet('');
        setNewAddrCity('');
        setNewAddrPostal('');
        setNewAddrNotes('');
        setNewAddrPrimary(false);
        toast.success('Dirección guardada');
      }
    } catch {
      toast.error('Error al guardar dirección');
    } finally {
      setSavingAddress(false);
    }
  }, [selectedClient, userId, selectClient, newAddrLabel, newAddrStreet, newAddrCity, newAddrPostal, newAddrNotes, newAddrPrimary, isDeliveryBusiness]);

  const handleStartEditPrimaryAddress = useCallback((addr: ClientAddress) => {
    setShowNewAddress(false);
    setEditingAddressId(addr.id);
    setEditAddrStreet(addr.street || '');
    setEditAddrCity(addr.city || '');
    setEditAddrPostal(addr.postalCode || '');
    setEditAddrNotes(addr.notes || '');
  }, []);

  const handleSaveEditedAddress = useCallback(async () => {
    if (!selectedClient || !editingAddressId || !editAddrStreet.trim()) return;
    if (isDeliveryBusiness && !editAddrCity.trim()) {
      toast.error('Indica la ciudad de la dirección');
      return;
    }
    setSavingAddress(true);
    try {
      const isLegacy = editingAddressId.startsWith(LEGACY_ADDRESS_PREFIX);
      const existing = selectedClient.addresses || [];
      let nextAddresses: ClientAddress[];
      let nextSelectedId = editingAddressId;

      if (isLegacy || existing.length === 0) {
        const newId = uuidv4();
        nextAddresses = [
          {
            id: newId,
            label: 'Casa',
            street: editAddrStreet.trim(),
            city: editAddrCity.trim() || undefined,
            postalCode: editAddrPostal.trim() || undefined,
            notes: editAddrNotes.trim() || undefined,
            isPrimary: true,
            usageCount: 0,
            lastUsedAt: null,
          },
        ];
        nextSelectedId = newId;
      } else {
        nextAddresses = existing.map((a) =>
          a.id === editingAddressId
            ? {
                ...a,
                street: editAddrStreet.trim(),
                city: editAddrCity.trim() || undefined,
                postalCode: editAddrPostal.trim() || undefined,
                notes: editAddrNotes.trim() || undefined,
              }
            : a,
        );
      }

      const editingAddr = nextAddresses.find((a) => a.id === nextSelectedId)
        || nextAddresses.find((a) => a.id === editingAddressId);
      const isPrimary = editingAddr ? isPrimaryClientAddress(editingAddr, nextAddresses) : false;

      const updated = await updateClientRequest(userId, {
        ...selectedClient,
        addresses: nextAddresses,
        ...(isPrimary
          ? {
              address: editAddrStreet.trim(),
              city: editAddrCity.trim(),
              postalCode: editAddrPostal.trim(),
            }
          : {}),
      } as Client);
      if (updated) {
        selectClient(updated);
        setSelectedAddressId(nextSelectedId);
        setEditingAddressId(null);
        toast.success('Dirección actualizada');
      }
    } catch {
      toast.error('Error al guardar dirección');
    } finally {
      setSavingAddress(false);
    }
  }, [
    selectedClient,
    userId,
    selectClient,
    editingAddressId,
    editAddrStreet,
    editAddrCity,
    editAddrPostal,
    editAddrNotes,
    isDeliveryBusiness,
  ]);

  // ─── Submit order ─────────────────────────────────────────────────────────
  const handleSubmitOrder = useCallback(
    async (status: DeliveryOrderStatus, methodOverride?: PaymentMethod, splitParts?: TpvSplitPaymentPart[] | null) => {
      if (!saleClient || !deliveryType || cart.length === 0) return;
      // Candado sync: doble toque no crea dos pedidos (disabled del botón llega un frame tarde).
      if (actionBusyRef.current) return;
      if (isJunkTpvCustomerName(saleClient.name)) {
        toast.error('Pon el nombre del cliente antes de cobrar (no vale «Buscar»)');
        return;
      }
      const openRegister = resolveOpenRegister();
      if (!openRegister) {
        if (boardReady || hasTpvOpenRegisterLatch()) {
          toast.error('Recuperando la caja… espera un segundo y vuelve a cobrar');
        } else {
          toast.error('Abre la caja de la tienda para cobrar y enviar');
        }
        return;
      }

      if (deliveryType === 'domicilio' && !selectedAddressId) {
        setAddressWarning(true);
        return;
      }
      const parts = splitParts ?? pendingSplitParts;
      const method = methodOverride || paymentMethod || (parts?.length ? 'mixto' : null);
      // Recogida: sin método en creación (cobra al Entregar). Domicilio: método obligatorio.
      if (deliveryType === 'domicilio' && !method) return;
      if (!method && deliveryType !== 'recogida' && deliveryType !== 'domicilio') return;

      const incompleteHalfHalf = cart.find(
        (ci) =>
          isTpvHalfHalfCatalogItem(ci.catalogItem) &&
          (!ci.customization.halfHalfPizza?.firstProductId ||
            !ci.customization.halfHalfPizza?.secondProductId),
      );
      if (incompleteHalfHalf) {
        toast.error(`Elige las 2 mitades de «${incompleteHalfHalf.catalogItem.name}» antes de cobrar`);
        setHalfHalfTarget({
          item: incompleteHalfHalf.catalogItem,
          lineId: incompleteHalfHalf.lineId,
          initial: incompleteHalfHalf.customization,
        });
        return;
      }

      // Domicilio: anota cómo pagará, cobra al entregar.
      // Recogida: sin pago al crear → cobra al Entregar en montaje.
      // Pago dividido: crear pendiente y registrar tramos después.
      const collectOnDelivery =
        deliveryType === 'domicilio'
        || deliveryType === 'recogida'
        || (Boolean(parts?.length) && method === 'mixto');

      actionBusyRef.current = true;
      setSubmitting(true);
      try {
        const items: DeliveryOrderItem[] = cart.map((ci) => {
          const priced = pricedByLineId.get(ci.lineId);
          const unitPrice = priced?.unitPrice
            ?? cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization);
          const total = priced?.total
            ?? cartLineTotal(ci.catalogItem.unitPrice, ci.quantity, ci.customization);
          return {
            id: ci.lineId,
            name: ci.catalogItem.name,
            quantity: ci.quantity,
            unitPrice,
            total,
            notes: ci.customization.notes?.trim() || undefined,
            catalogItemId: ci.catalogItem._id,
            category: ci.catalogItem.category,
            brandIds: Array.isArray(ci.catalogItem.brandIds) ? ci.catalogItem.brandIds : [],
            extras: buildOrderExtras(ci.customization),
            ingredients: buildOrderIngredients(
              ci.catalogItem,
              ci.customization,
              tpvCategoryTemplates,
              storeIngredients,
              tpvBrandIngredientSelection,
              brands,
              catalog,
            ),
          };
        });

        const selectedAddr = resolveClientDeliveryAddresses(saleClient).find(
          (a) => a.id === selectedAddressId,
        );

        const pdvId = String(openRegister.session?.pointOfSaleId || '').trim();
        const pdvName = String(openRegister.session?.pointOfSaleName || '').trim();
        const takerId = effectiveOrderTakerId;
        const takerName = selectedOrderTaker?.name || user?.fullName || 'TPV';

        // Tablet: domicilio y recogida entran en montaje (`listo`). Recogida cobrada ≠ entregado.
        const submitStatus: DeliveryOrderStatus = tabletMode ? 'listo' : status;
        const now = new Date().toISOString();

        const tableNote = restaurantTable
          ? restaurantTable.isCounter
            ? 'Mostrador'
            : `Mesa ${restaurantTable.number}${restaurantTable.roomName ? ` · ${restaurantTable.roomName}` : ''}`
          : '';

        const walkInSale = isTpvSyntheticClientId(saleClient.id);
        const cashReceived = (() => {
          if (method !== 'efectivo') return null;
          const given = parseDecimalPadValue(cashGiven);
          if (!isNaN(given) && given > 0) return given;
          if (payableTotal > 0) return payableTotal;
          return null;
        })();
        const cashChange =
          cashReceived != null
            ? Math.max(0, Number((cashReceived - payableTotal).toFixed(2)))
            : null;

        const orderData: Partial<DeliveryOrder> = {
          // Atención rápida sin teléfono: cliente sintético (sin CRM). Con teléfono: ficha CRM.
          clientId: walkInSale ? '' : saleClient.id,
          customerName: resolveTpvCustomerDisplayName(saleClient.name, 'Cliente'),
          customerPhone: walkInSale
            ? (saleClient.phone
              ? formatTicketCustomerPhone(saleClient.phone, saleClient.phonePrefix || phonePrefix)
              : '')
            : formatTicketCustomerPhone(
                saleClient.phone,
                saleClient.phonePrefix || phonePrefix,
              ),
          customerEmail: saleClient.email || '',
          customerAddress: formatTicketCustomerAddress({
            street: selectedAddr?.street || saleClient.address,
            city: selectedAddr?.city || saleClient.city,
            postalCode: selectedAddr?.postalCode || saleClient.postalCode,
          }),
          deliveryType,
          channel: 'tpv',
          status: submitStatus,
          // Siempre anclar montaje (web + tablet). Sin esto el OP no mide tiempos.
          ...(submitStatus === 'entregado'
            ? {
                assemblyStartedAt: now,
                assemblyCompletedAt: now,
                kitchenCompletedAt: now,
                departedAt: now,
                deliveredAt: now,
              }
            : { assemblyStartedAt: now, kitchenCompletedAt: now }),
          salesPointId: pdvId,
          salesPointName: pdvName,
          business_id: writeBusinessId || tpvCatalogBusinessId || businessId || '',
          takenBy: takerId || user?.user_id || user?.id || '',
          takenByName: takerName,
          items,
          totalAmount: payableTotal,
          ...(discountAmount > 0 ? { discountAmount } : {}),
          ...(deliveryFeeAmount > 0 ? { deliveryFee: deliveryFeeAmount } : {}),
          // Sin texto de promo en notas: cocina no necesita el descuento; el € va en discountAmount.
          notes: [tableNote, orderNotes.trim()].filter(Boolean).join('\n'),
          observations: [
            takerName ? `Atendido por: ${takerName}` : '',
            tableNote && !restaurantTable?.isCounter ? `Servicio en mesa` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          ...(method
            ? {
                paymentMethod:
                  method === 'mixto' ? 'mixto' : normalizeTpvPaymentMethod(method),
              }
            : {}),
          paymentStatus: collectOnDelivery || !method ? 'pending' : 'paid',
          paidAmount: collectOnDelivery || !method ? 0 : payableTotal,
          paidAt: collectOnDelivery || !method ? '' : now,
          paymentCollected: !collectOnDelivery && !!method,
          paymentCollectedAt: collectOnDelivery || !method ? '' : now,
          paymentCollectedBy: collectOnDelivery || !method ? '' : takerName,
          ...(cashReceived != null && cashChange != null && !collectOnDelivery
            ? { amountReceived: cashReceived, changeGiven: cashChange }
            : {}),
          // Guardar tramos ya en el pedido (evita marcas/tarjeta a 0 si falla el cobro partido).
          ...(parts?.length
            ? {
                payments: parts.map((p, idx) => ({
                  id: String(p.id || `pay-${idx}`),
                  method: normalizeTpvPaymentMethod(p.method),
                  amount: Number(p.amount) || 0,
                  ...(p.amountReceived != null ? { amountReceived: Number(p.amountReceived) } : {}),
                  ...(p.changeGiven != null ? { changeGiven: Number(p.changeGiven) } : {}),
                })),
              }
            : {}),
          deliveryAddressId: selectedAddressId || '',
          priority: 'normal',
          // Mismo nº en ticket y servidor → imprimir en paralelo al crear.
          orderNumber: `PED-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          ...(restaurantTable && !restaurantTable.isCounter
            ? { tableNumber: restaurantTable.number, tableId: restaurantTable.id }
            : {}),
        };

        // Sin conexión: encolar el pedido para sincronizar al reconectar (solo flujo
        // delivery puro; en restaurante hay mesas/cuentas que requieren el servidor).
        if (!isBrowserOnline() && !restaurantTable && !restaurantDiningOrder) {
          const offlineId = `offline-order:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
          const offlineOrder = {
            ...orderData,
            _id: offlineId,
            id: offlineId,
            type: 'delivery_order',
            user_id: userId,
            orderNumber: orderData.orderNumber || 'PENDIENTE',
            createdAt: now,
            updatedAt: now,
          } as DeliveryOrder;
          enqueueTpvOfflineItem('order_create', { userId, orderData });
          if (!collectOnDelivery) {
            if (parts?.length && method === 'mixto') {
              for (const part of parts) {
                const partAmount = Number(part.amount) || 0;
                if (partAmount <= 0) continue;
                await ensureLocalCajaSaleForOrder(openRegister, offlineOrder, {
                  paymentMethod: normalizeTpvPaymentMethod(part.method),
                  amount: partAmount,
                  registeredBy: takerName || 'TPV',
                  allowMultiple: true,
                });
              }
            } else {
              await ensureLocalCajaSaleForOrder(openRegister, offlineOrder, {
                paymentMethod: orderData.paymentMethod,
                amount: payableTotal,
                registeredBy: takerName || 'TPV',
              });
            }
          }
          setCreatedOrder(offlineOrder);
          return;
        }

        // Primero guardar pedido y mostrar éxito; luego ticket cocina.
        // Si se imprime antes, en tablet el bridge nativo puede dejar la UI en «Enviando…».
        let { order: created, cajaStatus } = await createDeliveryOrderWithCajaStatus(userId, orderData);

        // Cobro dividido: registrar tramos en pedido + caja (también en tablet).
        // No meter un cobro "mixto" único en caja (se contaría mal como efectivo).
        if (
          parts?.length
          && method === 'mixto'
          && deliveryType !== 'domicilio'
          && !collectOnDelivery
        ) {
          created = await registerSplitPaymentsRequest(userId, created._id, parts);
          cajaStatus = null;
        } else if (!collectOnDelivery) {
          // Airbag solo si el servidor NO registró (si ya lo hizo, no volver a sumar).
          const serverCajaOk =
            cajaStatus === 'registered'
            || cajaStatus === 'already_registered'
            || cajaStatus === 'nothing_to_register';
          if (!serverCajaOk) {
            await ensureLocalCajaSaleForOrder(openRegister, created, {
              paymentMethod: created.paymentMethod,
              amount: Number(created.paidAmount || payableTotal),
              registeredBy: takerName || 'TPV',
            });
          }
        }

        notifyDeliveryOpsLive({
          reason: 'order_created',
          businessId: created.business_id || writeBusinessId || businessId,
        });

        setCreatedOrder(created);
        setPendingSplitParts(null);
        if (cajaStatus && !isCajaRegistrationOk(cajaStatus)) {
          toast.success('Pedido creado, pero no quedó en caja — revisa que esté abierta');
        } else if (parts?.length && method === 'mixto') {
          toast.success(`Pedido cobrado · ${formatSplitPartsSummary(parts)}`);
        } else {
          toast.success('Pedido creado y registrado en caja');
        }

        if (currentBusiness) {
          const ticketBusiness = businessTicketInfoFrom(currentBusiness);
          window.setTimeout(() => {
            void printDeliveryTicket({
              order: created,
              business: ticketBusiness,
              salesPointName: pdvName,
              cashierName: takerName,
              variant: 'kitchen',
              accountEmail: user?.email,
            });
          }, 0);
        }

        if (restaurantTable && !restaurantTable.isCounter && userId) {
          void changeTableStatusRequest(userId, restaurantTable.id, tableStatusOnPaid(), {
            currentGuests: 0,
            occupiedBy: '',
          }).catch((releaseErr) => {
            showTpvError(releaseErr, 'liberar_mesa');
          });
        }
      } catch (err: unknown) {
        showTpvError(err, 'crear_pedido', 'Error al crear el pedido');
      } finally {
        setSubmitting(false);
        actionBusyRef.current = false;
      }
    },
    [saleClient, deliveryType, cart, selectedAddressId, paymentMethod, pendingSplitParts, finalTotal, payableTotal, deliveryFeeAmount, orderNotes, userId, phonePrefix, register?.selectedOrderTakerId, selectedOrderTaker, appliedPromo, discountAmount, promoMode, clientPromoSelected, effectiveCalc, register?.session, resolveOpenRegister, boardReady, user?.fullName, user?.user_id, user?.id, user?.email, tabletMode, tpvBrandIngredientSelection, tpvCategoryTemplates, storeIngredients, brands, restaurantTable, restaurantDiningOrder, onRestaurantDiningOrderUpdated, onRestaurantOrderComplete, currentBusiness, writeBusinessId, businessId, catalog, effectiveOrderTakerId, showTpvError, cashGiven, pricedByLineId],
  );

  const handleSaveEditedDeliveryOrder = useCallback(async () => {
    if (!editingDeliveryOrder || !isEditingDeliveryOrder || cart.length === 0 || !userId) return;
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setSubmitting(true);
    try {
      const items: DeliveryOrderItem[] = cart.map((ci) => {
        const priced = pricedByLineId.get(ci.lineId);
        const unitPrice = priced?.unitPrice
          ?? cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization);
        const total = priced?.total
          ?? cartLineTotal(ci.catalogItem.unitPrice, ci.quantity, ci.customization);
        return {
          id: ci.lineId,
          name: ci.catalogItem.name,
          quantity: ci.quantity,
          unitPrice,
          total,
          notes: ci.customization.notes?.trim() || undefined,
          catalogItemId: ci.catalogItem._id,
          category: ci.catalogItem.category,
          brandIds: Array.isArray(ci.catalogItem.brandIds) ? ci.catalogItem.brandIds : [],
          extras: buildOrderExtras(ci.customization),
          ingredients: buildOrderIngredients(
            ci.catalogItem,
            ci.customization,
            tpvCategoryTemplates,
            storeIngredients,
            tpvBrandIngredientSelection,
            brands,
            catalog,
          ),
        };
      });

      const itemsSubtotal = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
      const wasPaid = orderAlreadyCobrado(editingDeliveryOrder);
      const nextTotal = +payableTotal.toFixed(2);
      const now = new Date().toISOString();

      const updated = await updateDeliveryOrderRequest(userId, {
        ...editingDeliveryOrder,
        items,
        itemsSubtotal: +itemsSubtotal.toFixed(2),
        totalAmount: nextTotal,
        ...(discountAmount > 0 ? { discountAmount } : { discountAmount: 0 }),
        deliveryFee: deliveryFeeAmount > 0 ? deliveryFeeAmount : 0,
        notes: orderNotes.trim() || editingDeliveryOrder.notes || '',
        deliveryType: editingDeliveryOrder.deliveryType || deliveryType || 'domicilio',
        status: editingDeliveryOrder.status || 'listo',
        updatedAt: now,
        ...(wasPaid
          ? {}
          : {
              paidAmount: 0,
              paymentStatus: 'pending' as const,
              paymentCollected: false,
            }),
      } as DeliveryOrder);

      notifyDeliveryOpsLive({
        reason: 'order_updated',
        businessId: updated.business_id || writeBusinessId || businessId,
      });

      if (wasPaid && Math.abs(Number(editingDeliveryOrder.totalAmount || 0) - nextTotal) > 0.02) {
        toast.success(`Pedido #${updated.orderNumber} actualizado`, {
          description: 'El total cambió; revisa el cobro si hace falta',
        });
      } else {
        toast.success(`Pedido #${updated.orderNumber} actualizado`);
      }

      onEditingDeliveryOrderSaved?.(updated);
      goBack();
    } catch (err: unknown) {
      showTpvError(err, 'editar_pedido', 'No se pudo guardar el pedido');
    } finally {
      setSubmitting(false);
      actionBusyRef.current = false;
    }
  }, [
    editingDeliveryOrder,
    isEditingDeliveryOrder,
    cart,
    userId,
    payableTotal,
    discountAmount,
    deliveryFeeAmount,
    orderNotes,
    deliveryType,
    tpvCategoryTemplates,
    storeIngredients,
    tpvBrandIngredientSelection,
    brands,
    catalog,
    writeBusinessId,
    businessId,
    onEditingDeliveryOrderSaved,
    goBack,
    showTpvError,
    pricedByLineId,
  ]);

  const accountDue = useMemo(
    () => (restaurantDiningOrder ? diningOrderDueAmount(restaurantDiningOrder) : 0),
    [restaurantDiningOrder],
  );

  // Cobrar desde el plano: saltar a pago cuando la cuenta ya tiene importe.
  useEffect(() => {
    if (!isRestaurantMode || restaurantOpenIntent !== 'pay') return;
    if (restaurantPayIntentAppliedRef.current) return;
    if (accountDue <= 0 && cart.length === 0) return;
    restaurantPayIntentAppliedRef.current = true;
    setCompletedSteps((prev) => new Set(prev).add('products'));
    setCurrentStep('payment');
  }, [isRestaurantMode, restaurantOpenIntent, accountDue, cart.length]);

  const splitParts = useMemo(
    () => (restaurantDiningOrder ? buildSplitPartViews(restaurantDiningOrder) : []),
    [restaurantDiningOrder],
  );

  const hasActiveSplit = splitParts.length > 0;
  const nextUnpaidSplitPart = splitParts.find((p) => !p.paid) || null;

  const restaurantAccountMode = Boolean(
    embeddedInRestaurantTpv && restaurantDiningOrder,
  );

  /** Importe que se cobra ahora (para calculadora de cambio). */
  const cashChargeTotal = useMemo(() => {
    if (restaurantAccountMode) {
      if (hasActiveSplit && nextUnpaidSplitPart) return nextUnpaidSplitPart.amount;
      return Math.max(0, accountDue + finalTotal);
    }
    return payableTotal;
  }, [
    restaurantAccountMode,
    hasActiveSplit,
    nextUnpaidSplitPart,
    accountDue,
    finalTotal,
    payableTotal,
  ]);

  const cashGivenAmount = useMemo(() => parseDecimalPadValue(cashGiven), [cashGiven]);
  const changeAmount = useMemo(() => {
    if (isNaN(cashGivenAmount) || cashGivenAmount <= 0) return null;
    return cashGivenAmount - cashChargeTotal;
  }, [cashGivenAmount, cashChargeTotal]);
  const cashQuickAmounts = useMemo(() => {
    const base = [5, 10, 20, 50, 100].filter((v) => v >= cashChargeTotal);
    const exact = Math.ceil(cashChargeTotal * 100) / 100;
    const uniq = Array.from(new Set([exact, ...base])).filter((v) => v > 0).slice(0, 6);
    return uniq;
  }, [cashChargeTotal]);

  /** Calculadora de cambio siempre que paguen en efectivo (también domicilio: ayuda a anotar billete/cambio). */
  const showCashChangeCalculator = paymentMethod === 'efectivo';

  // Si eligen efectivo y aún no hay billete tecleado, poner "exacto" cuando haya total.
  useEffect(() => {
    if (paymentMethod !== 'efectivo') return;
    if (cashChargeTotal <= 0) return;
    setCashGiven((prev) => {
      if (prev.trim()) return prev;
      return cashChargeTotal.toFixed(2);
    });
  }, [paymentMethod, cashChargeTotal]);

  const accountLines = useMemo(
    () => (restaurantDiningOrder ? flattenDiningAccountLines(restaurantDiningOrder) : []),
    [restaurantDiningOrder],
  );

  const accountItemCount = useMemo(
    () => accountLines.reduce((sum, line) => sum + line.quantity, 0),
    [accountLines],
  );

  const flushCartToAccountIfNeeded = useCallback(async () => {
    if (!restaurantAccountMode || !restaurantDiningOrder?._id || !userId || cart.length === 0) {
      return;
    }
    const { order } = await addCartToDiningAccount({
      userId,
      orderId: restaurantDiningOrder._id,
      lines: cart,
      createdBy: effectiveOrderTakerId || userId,
      createdByName: selectedOrderTaker?.name || user?.fullName || 'TPV',
      sendToKitchen: false,
      currentOrder: restaurantDiningOrder,
    });
    onRestaurantDiningOrderUpdated?.(order);
    setCart([]);
    setProductPickerReset((n) => n + 1);
  }, [
    restaurantAccountMode,
    restaurantDiningOrder,
    userId,
    cart,
    effectiveOrderTakerId,
    selectedOrderTaker?.name,
    user?.fullName,
    onRestaurantDiningOrderUpdated,
  ]);

  const handleGoBack = useCallback(async () => {
    if (embeddedInRestaurantTpv && restaurantAccountMode && cart.length > 0) {
      try {
        await flushCartToAccountIfNeeded();
      } catch (err: unknown) {
        showTpvError(err, 'guardar_cuenta', 'No se pudo guardar la cuenta');
        return;
      }
    }
    goBack();
  }, [embeddedInRestaurantTpv, restaurantAccountMode, cart.length, flushCartToAccountIfNeeded, goBack]);

  const orderPanelCount = restaurantAccountMode ? cartCount + accountItemCount : cartCount;
  const orderPanelEmpty = restaurantAccountMode
    ? cart.length === 0 && accountLines.length === 0
    : cart.length === 0;

  const cartRef = useRef(cart);
  cartRef.current = cart;
  const flushCartRef = useRef(flushCartToAccountIfNeeded);
  flushCartRef.current = flushCartToAccountIfNeeded;

  useEffect(() => {
    return () => {
      if (!embeddedInRestaurantTpv || !restaurantAccountMode) return;
      if (cartRef.current.length === 0) return;
      void flushCartRef.current();
    };
  }, [embeddedInRestaurantTpv, restaurantAccountMode]);

  const handleAddToAccount = useCallback(
    async (sendToKitchen: boolean) => {
      if (actionBusyRef.current) return;
      if (!restaurantDiningOrder?._id || !userId || cart.length === 0) return;
      if (restaurantPermissions && !restaurantPermissions.canAddToAccount) {
        toast.error('No tienes permiso para añadir a la cuenta');
        return;
      }
      if (sendToKitchen && restaurantPermissions && !restaurantPermissions.canSendKitchen) {
        toast.error('No tienes permiso para enviar a cocina');
        return;
      }
      setSubmitting(true);
      actionBusyRef.current = true;
      try {
        const { order, queuedOffline } = await addCartToDiningAccount({
          userId,
          orderId: restaurantDiningOrder._id,
          lines: cart,
          createdBy: effectiveOrderTakerId || userId,
          createdByName: selectedOrderTaker?.name || user?.fullName || 'TPV',
          sendToKitchen,
          currentOrder: restaurantDiningOrder,
        });
        onRestaurantDiningOrderUpdated?.(order);
        if (restaurantTable && !restaurantTable.isCounter && isBrowserOnline()) {
          await changeTableStatusRequest(userId, restaurantTable.id, tableStatusOnOrderAdded());
        }
        setCart([]);
        setProductPickerReset((n) => n + 1);
        if (queuedOffline) {
          toast.message(sendToKitchen
            ? 'Sin red · comanda en cola (se enviará a cocina al sincronizar)'
            : 'Sin red · añadido en local (se sincronizará al volver la red)');
        } else {
          toast.success(sendToKitchen ? 'Enviado a cocina' : 'Añadido a la cuenta');
        }
      } catch (err: unknown) {
        showTpvError(err, 'añadir_cuenta', 'Error al añadir a la cuenta');
      } finally {
        actionBusyRef.current = false;
        setSubmitting(false);
      }
    },
    [
      restaurantDiningOrder,
      userId,
      cart,
      restaurantPermissions,
      effectiveOrderTakerId,
      selectedOrderTaker?.name,
      user?.fullName,
      onRestaurantDiningOrderUpdated,
      restaurantTable,
      showTpvError,
    ],
  );

  const handlePayAccountAmount = useCallback(async (
    payAmount?: number,
    splitLabel?: string,
    methodOverride?: PaymentMethod | null,
    splitParts?: TpvSplitPaymentPart[] | null,
  ) => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId) return;
    if (!register?.session) {
      toast.error('Abre la caja de la tienda para cobrar');
      return;
    }
    if (restaurantPermissions && !restaurantPermissions.canPay) {
      toast.error('No tienes permiso para cobrar');
      return;
    }
    const parts = splitParts?.length ? splitParts : null;
    const singleMethod = methodOverride || paymentMethod;
    if (!parts && !singleMethod) {
      if (currentStep !== 'payment') {
        setCompletedSteps((prev) => new Set(prev).add('products'));
        setCurrentStep('payment');
      } else {
        toast.error('Elige forma de pago');
      }
      return;
    }
    if (!parts && singleMethod === 'mixto') {
      toast.error('Configura el pago dividido');
      return;
    }

    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      let diningOrder = restaurantDiningOrder;
      if (cart.length > 0) {
        const added = await addCartToDiningAccount({
          userId,
          orderId: restaurantDiningOrder._id,
          lines: cart,
          createdBy: effectiveOrderTakerId || userId,
          createdByName: selectedOrderTaker?.name || user?.fullName || 'TPV',
          sendToKitchen: false,
          currentOrder: restaurantDiningOrder,
        });
        diningOrder = added.order;
        onRestaurantDiningOrderUpdated?.(diningOrder);
        setCart([]);
      }

      const due = diningOrderDueAmount(diningOrder);
      if (due <= 0) {
        toast.error('La cuenta está vacía');
        return;
      }

      const tipValue = Math.max(0, parseDecimalPadValue(tipInput) || 0);
      const pdvId = String(register.session.pointOfSaleId || '').trim();
      const pdvName = String(register.session.pointOfSaleName || '').trim();
      const takerName = selectedOrderTaker?.name || user?.fullName || 'TPV';
      const tableNote = restaurantTable
        ? `Mesa ${restaurantTable.number}${restaurantTable.roomName ? ` · ${restaurantTable.roomName}` : ''}`
        : '';
      const walkInSale = isTpvSyntheticClientId(saleClient?.id);

      const slices: Array<{ amount: number; method: string; label: string; amountReceived?: number; changeGiven?: number }> =
        parts
          ? parts
              .map((p, i) => ({
                amount: Math.min(Number(p.amount) || 0, due),
                method: normalizeTpvPaymentMethod(p.method),
                label: parts.length > 1 ? `Parte ${i + 1}` : (splitLabel || ''),
                amountReceived: Number(p.amountReceived) > 0 ? Number(p.amountReceived) : undefined,
                changeGiven: Number(p.changeGiven) >= 0 ? Number(p.changeGiven) : undefined,
              }))
              .filter((s) => s.amount > 0)
          : [{
              amount: payAmount != null ? Math.min(payAmount, due) : due,
              method: normalizeTpvPaymentMethod(singleMethod!),
              label: splitLabel || '',
            }];

      if (slices.length === 0) {
        toast.error('Importe no válido');
        return;
      }

      let closedOrder = diningOrder;
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const stillDueBefore = diningOrderDueAmount(closedOrder);
        const amount = Math.min(slice.amount, stillDueBefore);
        if (amount <= 0) continue;
        const now = new Date().toISOString();
        const payItems = buildDiningCajaPayItems({
          order: closedOrder,
          payAmount: amount,
          dueAmount: stillDueBefore,
          fallbackName: slice.label
            ? `${tableNote || 'Cuenta'} · ${slice.label}`
            : (tableNote || 'Cuenta mesa'),
        });

        // Cobro + caja nativa + stock/finanzas en sala (sin delivery_order sintético).
        const kitchenPending = diningOrderHasPendingKitchen(closedOrder);
        const payResult = await payAndCloseDiningOrder({
          userId,
          order: closedOrder,
          payment: {
            method: slice.method,
            amount,
            tip: i === slices.length - 1 ? tipValue : 0,
            paidBy: effectiveOrderTakerId || userId,
            paidByName: takerName,
            splitLabel: slice.label || '',
            ...(slice.method === 'efectivo'
              ? {
                  amountReceived: slice.amountReceived != null
                    ? slice.amountReceived
                    : (i === 0 && changeAmount != null && changeAmount >= 0 ? cashGivenAmount : amount),
                  changeGiven: slice.changeGiven != null
                    ? slice.changeGiven
                    : (i === 0 && changeAmount != null && changeAmount >= 0
                      ? Number(changeAmount.toFixed(2))
                      : 0),
                }
              : {}),
          },
          salesPointId: pdvId,
          salesPointName: pdvName,
          registerInCaja: true,
          forceCloseIfKitchenPending: true,
        });
        closedOrder = payResult.order;
        onRestaurantDiningOrderUpdated?.(closedOrder);
        if (kitchenPending && (closedOrder.status === 'closed' || diningOrderDueAmount(closedOrder) <= 0.02)) {
          toast.message('Cuenta cobrada con cocina pendiente', {
            description: 'Se forzó el cierre de mesa. Avisa a cocina si hace falta.',
          });
        }

        const cajaStatus = payResult.cajaRegistration?.status;
        if (cajaStatus === 'queued_offline' || payResult.queuedOffline) {
          toast.message('Sin red · cobro en cola', {
            description: 'Se registrará en caja al recuperar conexión',
          });
        } else if (cajaStatus && !isCajaRegistrationOk(cajaStatus)) {
          toast.error(
            payResult.cajaRegistration?.message
              || 'Cobrado en mesa, pero no quedó en caja — revisa que el turno esté abierto',
          );
        }

        if (i === slices.length - 1 && currentBusiness) {
          const ticketItems = slice.label && slices.length > 1
            ? payItems.map((line) => ({
                quantity: line.quantity,
                name: line.name,
                total: line.total,
                notes: line.notes,
              }))
            : flattenDiningAccountLines(closedOrder).map((line) => ({
                quantity: line.quantity,
                name: line.name,
                total: line.lineTotal,
                notes: line.notes,
              }));
          const ticketBusiness = businessTicketInfoFrom(currentBusiness);
          const ticketOrder = {
            _id: closedOrder._id,
            id: closedOrder.id || closedOrder._id,
            orderNumber: `MESA-${restaurantTable?.number ?? closedOrder.tableNumber ?? '?'}`,
            customerName: walkInSale ? (tableNote || 'Sala') : (saleClient?.name || tableNote || 'Sala'),
            customerPhone: walkInSale
              ? ''
              : formatTicketCustomerPhone(
                  saleClient?.phone,
                  saleClient?.phonePrefix || phonePrefix,
                ),
            customerAddress: formatTicketCustomerAddress({
              street: saleClient?.address,
              city: saleClient?.city,
              postalCode: saleClient?.postalCode,
            }),
            channel: 'tpv',
            deliveryType: 'sala',
            status: 'entregado',
            items: ticketItems as DeliveryOrder['items'],
            totalAmount: Number(closedOrder.total || amount),
            paymentMethod: slice.method,
            paymentStatus: 'paid',
            paidAmount: Number(closedOrder.total || amount),
            paidAt: closedOrder.paidAt || now,
            takenByName: takerName,
            salesPointName: pdvName,
            tableNumber: restaurantTable?.number ?? closedOrder.tableNumber,
            business_id: writeBusinessId || tpvCatalogBusinessId || businessId || '',
            verifactuFullNumber: closedOrder.verifactuFullNumber,
            verifactuQrUrl: closedOrder.verifactuQrUrl,
          } as DeliveryOrder;
          window.setTimeout(() => {
            void printDeliveryTicket({
              order: ticketOrder,
              business: ticketBusiness,
              salesPointName: pdvName,
              cashierName: takerName,
              variant: 'customer',
              accountEmail: user?.email,
            });
          }, 0);
        }
      }

      setTipInput('');
      setPendingSplitParts(null);
      setRestaurantSplitStep(null);

      const stillDue = diningOrderDueAmount(closedOrder);
      if (stillDue <= 0.02 || closedOrder.status === 'closed') {
        if (restaurantTable && !restaurantTable.isCounter) {
          await changeTableStatusRequest(userId, restaurantTable.id, tableStatusOnPaid(), {
            currentGuests: 0,
            occupiedBy: '',
          });
        }
        toast.success(
          parts?.length
            ? `Cuenta cobrada · ${formatSplitPartsSummary(parts)}`
            : 'Cuenta cobrada',
        );
        onRestaurantOrderComplete?.();
      } else {
        const paidNow = slices.reduce((s, x) => s + x.amount, 0);
        toast.success(
          splitLabel
            ? `${splitLabel} cobrada · quedan ${formatPrice(stillDue)}`
            : `Cobrado ${formatPrice(paidNow)} · quedan ${formatPrice(stillDue)}`,
        );
      }
    } catch (err: unknown) {
      showTpvError(err, 'cobrar_cuenta', 'Error al cobrar la cuenta');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [
    restaurantDiningOrder,
    userId,
    register?.session,
    restaurantPermissions,
    paymentMethod,
    currentStep,
    cart,
    effectiveOrderTakerId,
    selectedOrderTaker?.name,
    user?.fullName,
    onRestaurantDiningOrderUpdated,
    restaurantTable,
    saleClient,
    onRestaurantOrderComplete,
    showTpvError,
    tipInput,
    currentBusiness,
    user?.email,
    writeBusinessId,
    tpvCatalogBusinessId,
    businessId,
    phonePrefix,
    changeAmount,
    cashGivenAmount,
  ]);

  const handlePayFullAccount = useCallback(async () => {
    if (paymentMethod === 'mixto' && pendingSplitParts?.length) {
      await handlePayAccountAmount(undefined, undefined, 'mixto', pendingSplitParts);
      return;
    }
    const part = hasActiveSplit ? nextUnpaidSplitPart : null;
    await handlePayAccountAmount(part?.amount, part?.label);
  }, [hasActiveSplit, nextUnpaidSplitPart, handlePayAccountAmount, paymentMethod, pendingSplitParts]);

  const goToRestaurantPaymentStep = useCallback(() => {
    setPaymentMethod(null);
    setPendingSplitParts(null);
    setRestaurantSplitStep(null);
    setCashGiven('');
    setCompletedSteps((prev) => new Set(prev).add('products'));
    setCurrentStep('payment');
  }, []);

  const handleRestaurantAccountChargeClick = useCallback(() => {
    if (currentStep !== 'payment') {
      goToRestaurantPaymentStep();
      return;
    }
    if (!paymentMethod) {
      toast.error('Elige forma de pago');
      return;
    }
    void handlePayFullAccount();
  }, [paymentMethod, currentStep, goToRestaurantPaymentStep, handlePayFullAccount]);

  const handleRestaurantSplitChargeClick = useCallback(() => {
    if (!nextUnpaidSplitPart) return;
    if (currentStep !== 'payment') {
      goToRestaurantPaymentStep();
      return;
    }
    if (!paymentMethod) {
      toast.error('Elige forma de pago');
      return;
    }
    void handlePayAccountAmount(nextUnpaidSplitPart.amount, nextUnpaidSplitPart.label);
  }, [
    nextUnpaidSplitPart,
    paymentMethod,
    currentStep,
    goToRestaurantPaymentStep,
    handlePayAccountAmount,
  ]);

  const restaurantSplitItems = useMemo((): DeliveryOrderItem[] => {
    const fromAccount = accountLines.map((line) => ({
      id: line.itemId || line.key,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.lineTotal,
      notes: line.notes,
    }));
    const fromCart = cart.map((line, idx) => {
      const qty = Number(line.quantity) || 0;
      const unit = cartLineUnitPrice(line.catalogItem.unitPrice, line.customization);
      return {
        id: line.lineId || `cart-${idx}`,
        name: String(line.catalogItem?.name || 'Producto'),
        quantity: qty,
        unitPrice: unit,
        total: cartLineTotal(line.catalogItem.unitPrice, qty, line.customization),
        notes: '',
      };
    });
    return [...fromAccount, ...fromCart] as DeliveryOrderItem[];
  }, [accountLines, cart]);

  const openRestaurantPaymentSplit = useCallback(() => {
    if (restaurantSplitItems.length === 0 && cashChargeTotal <= 0) {
      toast.error('No hay productos para dividir');
      return;
    }
    setRestaurantSplitStep('choice');
  }, [restaurantSplitItems.length, cashChargeTotal]);

  const handleRestaurantSplitPartsConfirm = useCallback((parts: TpvSplitPaymentPart[]) => {
    setRestaurantSplitStep(null);
    setPendingSplitParts(parts);
    setPaymentMethod('mixto');
    setCashGiven('');
    void handlePayAccountAmount(undefined, undefined, 'mixto', parts);
  }, [handlePayAccountAmount]);

  const handleConfirmChangeTable = useCallback(async (target: DiningTable) => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId || !restaurantTable) return;
    if (restaurantPermissions && !restaurantPermissions.canMoveTable) {
      toast.error('No tienes permiso para cambiar de mesa');
      return;
    }
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      let order = restaurantDiningOrder;
      if (cart.length > 0) {
        const added = await addCartToDiningAccount({
          userId,
          orderId: order._id,
          lines: cart,
          createdBy: effectiveOrderTakerId || userId,
          createdByName: selectedOrderTaker?.name || user?.fullName || 'TPV',
          sendToKitchen: false,
        });
        order = added.order;
        onRestaurantDiningOrderUpdated?.(order);
        setCart([]);
      }
      const moved = await moveDiningOrderToTable({
        userId,
        order,
        targetTable: target,
      });
      const nextTable: RestaurantTableContext = {
        id: target._id,
        number: target.number,
        name: target.name || `Mesa ${target.number}`,
        capacity: target.capacity,
        roomName: target.zone || '',
        isCounter: false,
      };
      onRestaurantDiningOrderUpdated?.(moved);
      onRestaurantTableChange?.(nextTable, moved);
      setChangeTableOpen(false);
      toast.success(`Cuenta movida a mesa ${target.number}`);
    } catch (err: unknown) {
      showTpvError(err, 'cambiar_mesa', 'No se pudo cambiar de mesa');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [
    restaurantDiningOrder,
    userId,
    restaurantTable,
    restaurantPermissions,
    cart,
    effectiveOrderTakerId,
    selectedOrderTaker?.name,
    user?.fullName,
    onRestaurantDiningOrderUpdated,
    onRestaurantTableChange,
    showTpvError,
  ]);

  const handleConfirmMergeTable = useCallback(async (sourceOrderId: string, sourceTable: DiningTable) => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId) return;
    if (restaurantPermissions && restaurantPermissions.canMoveTable === false) {
      toast.error('No tienes permiso para unir mesas');
      return;
    }
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      const beforeLines = flattenDiningAccountLines(restaurantDiningOrder).length;
      const { order: merged, freedTables } = await mergeDiningOrdersRequest(
        userId,
        [sourceOrderId],
        restaurantDiningOrder._id,
      );
      const afterLines = flattenDiningAccountLines(merged).length;
      if (!freedTables && afterLines <= beforeLines) {
        throw new Error('No se pudo unir: la otra mesa no tiene cuenta abierta válida');
      }
      onRestaurantDiningOrderUpdated?.(merged);
      setMergeTableOpen(false);
      toast.success(`Mesa ${sourceTable.number} unida a esta cuenta`);
    } catch (err: unknown) {
      showTpvError(err, 'unir_mesa', 'No se pudo unir la mesa');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [
    restaurantDiningOrder,
    userId,
    restaurantPermissions,
    onRestaurantDiningOrderUpdated,
    showTpvError,
  ]);

  const handleLinkRestaurantClient = useCallback(async (client: Client) => {
    if (!client?.id || isTpvSyntheticClientId(client.id)) return;
    selectClient(client);
    setRestaurantClientPickerOpen(false);
    setRestaurantClientQuery('');
    if (!restaurantDiningOrder?._id || !userId || restaurantTable?.isCounter) {
      toast.success(`Cliente ${client.name}`);
      return;
    }
    try {
      const updated = await linkClientToOrderRequest(
        userId,
        restaurantDiningOrder._id,
        client.id,
        client.name,
      );
      onRestaurantDiningOrderUpdated?.(updated);
      toast.success(`Cliente ${client.name} vinculado a la mesa`);
    } catch (err: unknown) {
      showTpvError(err, 'vincular_cliente', 'Cliente elegido, pero no se pudo guardar en la cuenta');
    }
  }, [
    selectClient,
    restaurantDiningOrder,
    userId,
    restaurantTable?.isCounter,
    onRestaurantDiningOrderUpdated,
    showTpvError,
  ]);

  // CRM → TPV: si llegamos con clientId en URL, vincularlo a la cuenta al abrir mesa.
  useEffect(() => {
    if (!isRestaurantMode || !userId || !restaurantDiningOrder?._id) return;
    if (restaurantTable?.isCounter) return;
    const client = selectedClient;
    if (!client?.id || isTpvSyntheticClientId(client.id)) return;
    if (appliedClientIdFromUrl.current !== client.id) return;
    if (String(restaurantDiningOrder.clientId || '') === client.id) return;
    let cancelled = false;
    linkClientToOrderRequest(userId, restaurantDiningOrder._id, client.id, client.name)
      .then((updated) => {
        if (!cancelled) onRestaurantDiningOrderUpdated?.(updated);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [
    isRestaurantMode,
    userId,
    restaurantDiningOrder?._id,
    restaurantDiningOrder?.clientId,
    restaurantTable?.isCounter,
    selectedClient,
    onRestaurantDiningOrderUpdated,
  ]);

  const handleConfirmCancelAccount = useCallback(async () => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId || !restaurantTable || restaurantTable.isCounter) return;
    if (restaurantPermissions && restaurantPermissions.canVoidComanda === false) {
      toast.error('No tienes permiso para anular la cuenta');
      return;
    }
    if (!window.confirm('¿Anular la cuenta y liberar la mesa? No se registra cobro en caja.')) {
      return;
    }
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      // cancelDiningOrderRequest ya libera la mesa en backend
      await cancelDiningOrderRequest(userId, restaurantDiningOrder._id, 'Anulada desde TPV sala');
      toast.success('Cuenta anulada · mesa libre');
      onRestaurantOrderComplete?.();
    } catch (err: unknown) {
      showTpvError(err, 'anular_cuenta', 'No se pudo anular la cuenta');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [
    restaurantDiningOrder,
    userId,
    restaurantTable,
    restaurantPermissions,
    onRestaurantOrderComplete,
    showTpvError,
  ]);

  const handleConfirmSplitBill = useCallback(async (result: SplitBillResult) => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId) return;
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      let order = restaurantDiningOrder;
      if (cart.length > 0) {
        const added = await addCartToDiningAccount({
          userId,
          orderId: order._id,
          lines: cart,
          createdBy: effectiveOrderTakerId || userId,
          createdByName: selectedOrderTaker?.name || user?.fullName || 'TPV',
          sendToKitchen: false,
        });
        order = added.order;
        onRestaurantDiningOrderUpdated?.(order);
        setCart([]);
      }
      let splitOrder: DiningOrder;
      let partsCount: number;
      if (result.mode === 'equal') {
        partsCount = result.parts;
        splitOrder = (await splitDiningOrderEqual(userId, order._id, result.parts)).order;
      } else {
        // El servidor exige que la suma coincida con el total; se reescala
        // porque el total puede haber cambiado al volcar el carrito.
        const amounts = scaleAmountsToTotal(result.amounts, Number(order.total || 0));
        partsCount = amounts.length;
        splitOrder = (await splitDiningOrderCustom(userId, order._id, amounts)).order;
      }
      onRestaurantDiningOrderUpdated?.(splitOrder);
      setSplitBillOpen(false);
      toast.success(`Cuenta dividida en ${partsCount} partes`);
    } catch (err: unknown) {
      showTpvError(err, 'dividir_cuenta', 'No se pudo dividir la cuenta');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [restaurantDiningOrder, userId, cart.length, onRestaurantDiningOrderUpdated, showTpvError, effectiveOrderTakerId, selectedOrderTaker?.name, user?.fullName]);

  const handleApplyAccountDiscount = useCallback(async (payload: {
    discountPercent?: number;
    discount?: number;
    reason: string;
    loyaltyRedeem?: { points: number; clientId?: string; reason?: string };
  }) => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId) return;
    if (restaurantPermissions && !restaurantPermissions.canDiscount) {
      toast.error('No tienes permiso para aplicar descuentos');
      return;
    }
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      const order = await applyDiningOrderDiscount({
        userId,
        orderId: restaurantDiningOrder._id,
        discountPercent: payload.discountPercent,
        discount: payload.discount,
        discountReason: payload.reason,
        loyaltyRedeem: payload.loyaltyRedeem,
      });
      onRestaurantDiningOrderUpdated?.(order);
      setDiscountOpen(false);
      toast.success(payload.loyaltyRedeem ? 'Puntos canjeados' : 'Descuento aplicado');
    } catch (err: unknown) {
      showTpvError(err, 'aplicar_descuento', 'No se pudo aplicar el descuento');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [restaurantDiningOrder, userId, restaurantPermissions, onRestaurantDiningOrderUpdated, showTpvError]);

  const handleClearAccountDiscount = useCallback(async () => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId) return;
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      const order = await applyDiningOrderDiscount({
        userId,
        orderId: restaurantDiningOrder._id,
        discount: 0,
        discountPercent: 0,
        discountReason: '',
      });
      onRestaurantDiningOrderUpdated?.(order);
      setDiscountOpen(false);
      toast.success('Descuento eliminado');
    } catch (err: unknown) {
      showTpvError(err, 'quitar_descuento', 'Error al quitar descuento');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [restaurantDiningOrder, userId, onRestaurantDiningOrderUpdated, showTpvError]);

  const handleVoidAccountLine = useCallback(async (line: DiningAccountLineView) => {
    if (actionBusyRef.current) return;
    if (!restaurantDiningOrder?._id || !userId) return;
    if (restaurantPermissions && !restaurantPermissions.canVoidComanda) {
      toast.error('Solo un encargado puede anular artículos de la cuenta');
      return;
    }
    const reason = window.prompt(
      `Anular ${line.quantity}× ${line.name} · Motivo:`,
      'Error de comanda',
    );
    if (reason == null) return;
    setSubmitting(true);
    actionBusyRef.current = true;
    try {
      const order = await voidDiningAccountLine({
        userId,
        order: restaurantDiningOrder,
        comandaId: line.comandaId,
        itemId: line.itemId,
        reason: reason.trim() || 'Anulado desde TPV',
        cancelledBy: selectedOrderTaker?.name || user?.fullName || 'TPV',
      });
      onRestaurantDiningOrderUpdated?.(order);
      toast.success(`Anulado: ${line.name}`);
    } catch (err: unknown) {
      showTpvError(err, 'anular_linea', 'No se pudo anular el artículo');
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [
    restaurantDiningOrder,
    userId,
    restaurantPermissions,
    selectedOrderTaker?.name,
    user?.fullName,
    onRestaurantDiningOrderUpdated,
    showTpvError,
  ]);

  const resetRestaurantTicket = useCallback(() => {
    setCart([]);
    setExpandedCartNotes(new Set());
    setProductPickerReset((n) => n + 1);
    setSelectedCategory(null);
    if (catalogSections.length > 0) {
      setSelectedSectionId(defaultTpvSectionId(catalogSections, catalog, brands, tpvCatalogLayout));
    }
    setPaymentMethod(null);
    setCashGiven('');
    setTipInput('');
    setOrderNotes('');
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoMode('none');
    setCreatedOrder(null);
    setCurrentStep(restaurantFlowResetStep());
    setCompletedSteps(restaurantFlowCompletedSteps());
  }, [catalogSections, catalog]);

  // ─── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (isRestaurantMode) {
      resetRestaurantTicket();
      return;
    }
    appliedClientIdFromUrl.current = null;
    setQuickAttentionActive(false);
    setCurrentStep('client');
    setCompletedSteps(new Set());
    setPhoneInput('');
    setPhonePrefix('');
    clearSelection();
    clearResults();
    clearClientPhoneSearchCache();
    setShowCreateForm(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientStreet('');
    setNewClientNotes('');
    setNewClientPayment('');
    setDuplicateWarning(false);
    setDeliveryType(null);
    setSelectedAddressId(null);
    setShowNewAddress(false);
    setCart([]);
    setProductPickerReset((n) => n + 1);
    setSelectedCategory(null);
    if (catalogSections.length > 0) {
      setSelectedSectionId(defaultTpvSectionId(catalogSections, catalog, brands, tpvCatalogLayout));
    }
    setPaymentMethod(null);
    setCashGiven('');
    setTipInput('');
    setOrderNotes('');
    setInitialStatus('nuevo');
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoMode('none');
    setClientPromos([]);
    setSelectedClientPromoId('');
    setCreatedOrder(null);
    setTimeout(() => phoneRef.current?.focus(), 150);
  }, [clearSelection, clearResults, catalogSections, catalog, isRestaurantMode, resetRestaurantTicket]);

  const handleCancelOrder = useCallback(() => {
    if (isRestaurantMode) {
      resetRestaurantTicket();
      return;
    }
    goBack();
  }, [goBack, isRestaurantMode, resetRestaurantTicket]);

  // ─── Success screen ───────────────────────────────────────────────────────
  if (createdOrder) {
    return (
      <TpvFullscreenShell onBack={goBack} embedded tabletMode={tabletMode}>
        <div className="max-w-[820px] mx-auto py-10">
          <div className="flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {embeddedInRestaurantTpv ? 'Ticket cobrado' : `Pedido #${createdOrder.orderNumber || createdOrder.id.slice(-6)}`}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {createdOrder.customerName} · {formatPrice(createdOrder.totalAmount)}
              </p>
              {paymentMethod === 'efectivo' && changeAmount !== null && changeAmount >= 0 ? (
                <p className="mt-2 text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  Cambio {formatPrice(changeAmount)}
                </p>
              ) : null}
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                {createdOrder.items.length} producto{createdOrder.items.length !== 1 ? 's' : ''}
                {!isRestaurantMode && (
                  <>
                    {' · '}
                    {createdOrder.deliveryType === 'domicilio' ? 'Envío a domicilio' : 'Recogida en local'}
                  </>
                )}
              </p>
              {createdOrder.ticketNumber && (
                <p className="text-sm font-mono text-gray-500 mt-2">Ticket {createdOrder.ticketNumber}</p>
              )}
              {createdOrder.verifactuFullNumber && (
                <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left dark:border-violet-800 dark:bg-violet-950/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    Verifactu
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-violet-950 dark:text-violet-100">
                    {createdOrder.verifactuFullNumber}
                  </p>
                  {createdOrder.verifactuQrUrl ? (
                    <a
                      href={createdOrder.verifactuQrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-medium text-violet-700 underline dark:text-violet-300"
                    >
                      Abrir QR AEAT
                    </a>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-4 justify-center w-full max-w-md">
              {currentBusiness && (
                <OrderTicketButtons
                  order={createdOrder}
                  business={businessTicketInfoFrom(currentBusiness)}
                  salesPointName={createdOrder.salesPointName || register?.session?.pointOfSaleName}
                  cashierName={createdOrder.takenByName}
                  layout="grid"
                  className="w-full"
                />
              )}
              {embeddedInRestaurantTpv ? (
                <button
                  onClick={() => onRestaurantOrderComplete?.()}
                  className="px-6 min-h-[48px] py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-manipulation"
                >
                  Volver a mesas
                </button>
              ) : !(isRestaurantMode && tabletMode && !onBack) ? (
                <button
                  onClick={() => (tabletMode ? goBack() : navigate(tpvExitPath, { replace: true }))}
                  className="px-6 min-h-[48px] py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-manipulation"
                >
                  {tabletMode ? (isRestaurantMode ? 'Volver al código' : 'Volver al tablero') : 'Ver pedido'}
                </button>
              ) : null}
              <button
                onClick={handleReset}
                className="px-6 min-h-[48px] py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors touch-manipulation"
              >
                {isRestaurantMode ? 'Nuevo ticket' : 'Crear otro pedido'}
              </button>
            </div>
          </div>
      </div>
      {changeTableOpen && userId && restaurantTable && !restaurantTable.isCounter ? (
        <RestaurantChangeTableModal
          userId={userId}
          currentTableId={restaurantTable.id}
          onSelect={(table) => void handleConfirmChangeTable(table)}
          onClose={() => setChangeTableOpen(false)}
        />
      ) : null}
      {mergeTableOpen && userId && restaurantTable && restaurantDiningOrder && !restaurantTable.isCounter ? (
        <RestaurantMergeTableModal
          userId={userId}
          currentTableId={restaurantTable.id}
          currentOrderId={restaurantDiningOrder._id}
          onSelect={(sourceOrderId, sourceTable) => void handleConfirmMergeTable(sourceOrderId, sourceTable)}
          onClose={() => setMergeTableOpen(false)}
        />
      ) : null}
      {restaurantClientPickerOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-gray-900 sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Cliente de la mesa</h3>
                <p className="text-xs text-gray-500">Busca por nombre o teléfono</p>
              </div>
              <button
                type="button"
                onClick={() => setRestaurantClientPickerOpen(false)}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2 p-3">
              <input
                autoFocus
                value={restaurantClientQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setRestaurantClientQuery(q);
                  setPhoneInput(q);
                }}
                placeholder="Nombre o teléfono…"
                className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950"
              />
              {restaurantLinkedClient && !isTpvSyntheticClientId(restaurantLinkedClient.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    clearSelection();
                    setRestaurantClientPickerOpen(false);
                    toast.message('Cliente desvinculado en pantalla (la cuenta mantiene el vínculo hasta elegir otro)');
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  Quitar selección actual · {restaurantLinkedClient.name}
                </button>
              ) : null}
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {isSearching ? (
                  <p className="py-6 text-center text-sm text-gray-500">Buscando…</p>
                ) : results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">
                    {restaurantClientQuery.trim().length < 1 ? 'Escribe para buscar' : 'Sin resultados'}
                  </p>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void handleLinkRestaurantClient(c)}
                      className="flex w-full flex-col rounded-xl border border-gray-100 px-3 py-2.5 text-left hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/30"
                    >
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</span>
                      <span className="text-xs text-gray-500">{c.phone || 'Sin teléfono'}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {splitBillOpen && restaurantDiningOrder ? (
        <RestaurantSplitBillModal
          total={accountDue > 0 ? accountDue : Number(restaurantDiningOrder.total || 0)}
          lines={accountLines}
          submitting={submitting}
          onConfirm={(result) => void handleConfirmSplitBill(result)}
          onClose={() => setSplitBillOpen(false)}
        />
      ) : null}
      {discountOpen && restaurantDiningOrder ? (
        <RestaurantAccountDiscountModal
          subtotal={Number(restaurantDiningOrder.subtotal || 0)}
          currentDiscount={Number(restaurantDiningOrder.discount || 0)}
          currentDiscountPercent={Number(restaurantDiningOrder.discountPercent || 0)}
          submitting={submitting}
          loyaltyPoints={Number((saleClient as { loyalty?: { points?: number } } | null)?.loyalty?.points || 0)}
          clientId={String(saleClient?.id || restaurantDiningOrder.clientId || '')}
          clientName={String(saleClient?.name || restaurantDiningOrder.clientName || '')}
          onApply={(payload) => void handleApplyAccountDiscount(payload)}
          onClear={() => void handleClearAccountDiscount()}
          onClose={() => setDiscountOpen(false)}
        />
      ) : null}
      {paymentSplitOpen ? (
        <TpvSplitPaymentModal
          total={payableTotal}
          title="Pago dividido"
          loading={submitting}
          onClose={() => setPaymentSplitOpen(false)}
          onConfirm={(parts) => {
            setPendingSplitParts(parts);
            setPaymentMethod('mixto');
            setPaymentSplitOpen(false);
            setCashGiven('');
            void handleSubmitOrder(tabletMode ? 'listo' : initialStatus, 'mixto', parts);
          }}
        />
      ) : null}
    </TpvFullscreenShell>
    );
  }

  const clientSearchReady = phoneInput.trim().length >= 1;
  const clientSearchSettledEmpty =
    !isSearching
    && results.length === 0
    && clientSearchReady
    && settledQuery === phoneInput.trim();

  const needsOpenRegister =
    currentStep === 'products' || currentStep === 'payment';

  // No exigir caja abierta solo por un parpadeo del contexto: si el gate la pierde
  // un instante, el flujo de pedido no debe saltar a «Abre la caja».
  const registerStable = resolveOpenRegister();

  const allowProductsWithoutRegister =
    (embeddedInRestaurantTpv
      && isRestaurantMode
      && currentStep === 'products'
      && !restaurantTable?.isCounter)
    // Editar pedido del tablero: no bloquear si el contexto de caja parpadea un frame.
    || isEditingDeliveryOrder
    // Nuevo pedido: sticky cubre el parpadeo. Latch/boardReady solos no bastan para cobrar.
    || (
      tabletMode
      && Boolean(registerStable)
    );

  if (needsOpenRegister && !registerStable && !allowProductsWithoutRegister) {
    if (tabletMode && (boardReady || hasTpvOpenRegisterLatch())) {
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Recuperando la caja abierta…
          </p>
          <button
            type="button"
            onClick={() => {
              void handleGoBack();
            }}
            className="text-sm font-semibold text-[#2563EB] hover:underline"
          >
            Volver
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {embeddedInRestaurantTpv && currentStep === 'payment'
            ? 'Abre la caja de la tienda para cobrar esta mesa.'
            : 'Abre la caja de la tienda para cobrar y enviar el pedido.'}
        </p>
        <button
          type="button"
          onClick={() => {
            void handleGoBack();
            // Si el gate no tiene caja, salir del TPV para recargar apertura.
            window.setTimeout(() => {
              try {
                navigate(tpvExitPath, { replace: true });
              } catch {
                /* ignore */
              }
            }, 0);
          }}
          className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold"
        >
          Volver a abrir caja
        </button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  // Acciones de caja (arqueo, incidencia, cierre…) viven en RegisterStatusBar del gate; aquí solo enlace al panel CEO.
  const tpvTopActions = (() => {
    if (embeddedInRestaurantTpv && restaurantTable) {
      return (
        <div className="flex items-center gap-2 min-w-0 w-full">
          <button
            type="button"
            onClick={() => void handleGoBack()}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation min-h-[32px] min-w-[32px] p-1 shrink-0"
            title="Volver a mesas"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {restaurantTable.isCounter ? 'Mostrador' : `Mesa ${restaurantTable.number}`}
          </span>
          {restaurantTable.roomName ? (
            <span className="text-xs text-gray-500 truncate hidden sm:inline">· {restaurantTable.roomName}</span>
          ) : null}
          {restaurantAccountMode && accountDue > 0 ? (
            <span className="text-xs font-bold text-violet-600 dark:text-violet-400 tabular-nums shrink-0">
              Cuenta {formatPrice(accountDue)}
            </span>
          ) : null}
          {restaurantAccountMode && !restaurantTable?.isCounter ? (
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {restaurantPermissions?.canMoveTable !== false ? (
                <button
                  type="button"
                  onClick={() => setChangeTableOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation"
                  title="Cambiar mesa"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  <span className="hidden sm:inline">Mesa</span>
                </button>
              ) : null}
              {accountDue > 0 && !hasActiveSplit ? (
                <button
                  type="button"
                  onClick={() => setSplitBillOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-200 dark:border-violet-800 text-[10px] font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 touch-manipulation"
                  title="Dividir cuenta"
                >
                  <Split className="w-3 h-3" />
                  <span className="hidden sm:inline">Dividir</span>
                </button>
              ) : null}
              {restaurantPermissions?.canDiscount !== false ? (
                <button
                  type="button"
                  onClick={() => setDiscountOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 touch-manipulation"
                  title="Descuento"
                >
                  <Percent className="w-3 h-3" />
                  <span className="hidden sm:inline">Dto.</span>
                </button>
              ) : null}
              {restaurantPermissions?.canMoveTable !== false ? (
                <button
                  type="button"
                  onClick={() => setMergeTableOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-200 dark:border-violet-800 text-[10px] font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 touch-manipulation"
                  title="Unir otra mesa a esta cuenta"
                >
                  <Combine className="w-3 h-3" />
                  <span className="hidden sm:inline">Unir</span>
                </button>
              ) : null}
              {restaurantPermissions?.canVoidComanda !== false ? (
                <button
                  type="button"
                  onClick={() => void handleConfirmCancelAccount()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-[10px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 touch-manipulation"
                  title="Anular cuenta y liberar mesa"
                >
                  <Ban className="w-3 h-3" />
                  <span className="hidden sm:inline">Anular</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setRestaurantClientQuery('');
                  setRestaurantClientPickerOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-sky-200 dark:border-sky-800 text-[10px] font-semibold text-sky-800 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/30 touch-manipulation max-w-[9rem]"
                title="Vincular cliente CRM a la mesa"
              >
                <UserRound className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {restaurantLinkedClient && !isTpvSyntheticClientId(restaurantLinkedClient.id)
                    ? restaurantLinkedClient.name
                    : 'Cliente'}
                </span>
              </button>
              {restaurantPermissions?.canStaffConsumption ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!register || !isTpvRegisterSessionOpen(register.session)) {
                      toast.error('Abre la caja de la tienda para registrar consumo');
                      return;
                    }
                    setRestaurantStaffConsumptionOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 text-[10px] font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 touch-manipulation"
                  title="Consumo del equipo"
                >
                  <Utensils className="w-3 h-3" />
                  <span className="hidden sm:inline">Consumo</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }
    return null;
  })();

  const footerPrimaryLabel = (() => {
    if (isEditingDeliveryOrder) {
      if (submitting) return 'Guardando...';
      return 'Guardar en el pedido';
    }
    if (isRestaurantMode) {
      if (currentStep === 'products' && orderReady) return 'Continuar al pago';
      if (submitting) return 'Cobrando...';
      return 'Cobrar';
    }
    if (currentStep === 'client' && showCreateForm) {
      return creatingClient ? 'Guardando...' : 'Guardar cliente';
    }
    if (currentStep === 'client' && selectedClient) return 'Continuar';
    if (currentStep === 'client') return 'Selecciona un cliente';
    if (currentStep === 'delivery') {
      if (!deliveryType) return 'Elige tipo de entrega';
      if (deliveryType === 'domicilio' && !selectedAddressId) return 'Selecciona dirección';
      if (deliveryType === 'domicilio' && !paymentMethod) return 'Elige forma de pago';
      return 'Continuar a la carta';
    }
    if (currentStep === 'products' && orderReady) {
      if (submitting) return 'Enviando...';
      return 'Enviar pedido';
    }
    if (currentStep === 'products') return 'Añade productos';
    if (currentStep === 'payment') return 'Enviar pedido';
    if (submitting) return 'Enviando...';
    return 'Enviar pedido';
  })();

  const footerPrimaryDisabled = (() => {
    if (isEditingDeliveryOrder) return cart.length === 0 || submitting;
    if (currentStep === 'client' && showCreateForm) return creatingClient;
    if (currentStep === 'client' && selectedClient) return false;
    if (currentStep === 'delivery') return !deliveryCanContinue;
    if (currentStep === 'products') {
      if (isRestaurantMode) return !orderReady || submitting;
      return !canSubmit || submitting;
    }
    if (currentStep === 'payment') return !canSubmit || submitting;
    return !canSubmit || submitting;
  })();

  const handleFooterPrimary = () => {
    if (submitting || actionBusyRef.current) return;
    if (isEditingDeliveryOrder) {
      void handleSaveEditedDeliveryOrder();
      return;
    }
    if (currentStep === 'client' && showCreateForm) {
      void handleCreateClient();
      return;
    }
    if (currentStep === 'client' && selectedClient) {
      completeStep('client');
      return;
    }
    if (currentStep === 'delivery' && deliveryCanContinue) {
      completeStep('delivery');
      return;
    }
    if (currentStep === 'products' && orderReady) {
      if (isRestaurantMode) {
        completeStep('products');
        return;
      }
      if (!paymentMethod && deliveryType === 'domicilio') {
        setCurrentStep('delivery');
        toast.error('Elige cómo va a pagar en la pestaña de entrega');
        return;
      }
      void handleSubmitOrder(tabletMode ? 'listo' : initialStatus);
      return;
    }
    void handleSubmitOrder(tabletMode ? 'listo' : initialStatus);
  };

  const stickyFooter = (
    <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className={`w-full min-w-0 px-2 ${tabletMode ? 'py-1.5' : 'px-3 py-2 max-w-[920px] mx-auto'} ${!tabletMode && isProductsFocus ? 'max-w-[1320px] mx-auto' : ''}`}>
        <div className={`flex items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400 ${tabletMode ? 'mb-0.5' : 'mb-1.5'}`}>
          {restaurantAccountMode && accountDue > 0 ? (
            <span className="font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
              Cuenta {formatPrice(accountDue)}
            </span>
          ) : null}
          {hasActiveSplit ? (
            <span className="text-violet-600 dark:text-violet-400 font-semibold">
              Dividida · {splitParts.filter((p) => p.paid).length}/{splitParts.length} pagadas
            </span>
          ) : null}
          {orderPanelCount > 0 && (
            <span className="flex items-center gap-1">
              <ShoppingCart className="w-3 h-3" />
              {orderPanelCount}
            </span>
          )}
          {payableTotal > 0 && (
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
              {formatPrice(payableTotal)}
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {isRestaurantMode ? (
            <button
              type="button"
              onClick={() => void handleGoBack()}
              className={`inline-flex items-center gap-1.5 px-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'px-3 py-2.5 text-sm'}`}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              Volver
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCancelOrder}
                className={
                  isEditingDeliveryOrder
                    ? `inline-flex items-center gap-1.5 px-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'px-3 py-2.5 text-sm'}`
                    : `px-3 rounded-lg border-2 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'px-3 py-2.5 text-sm'}`
                }
              >
                {isEditingDeliveryOrder ? (
                  <>
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    Volver al tablero
                  </>
                ) : (
                  'Cancelar pedido'
                )}
              </button>
              {!isEditingDeliveryOrder ? (
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  disabled={currentStep === 'client'}
                  className={`px-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'px-3 py-2.5 text-sm'}`}
                >
                  Atrás
                </button>
              ) : null}
            </>
          )}
          {restaurantAccountMode && cart.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void handleAddToAccount(false)}
                disabled={submitting}
                className={`px-3 rounded-lg border-2 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 font-semibold touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'py-2.5 text-sm'}`}
              >
                Añadir a cuenta
              </button>
              <button
                type="button"
                onClick={() => void handleAddToAccount(true)}
                disabled={submitting || restaurantPermissions?.canSendKitchen === false}
                className={`px-3 rounded-lg border-2 border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 font-semibold touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'py-2.5 text-sm'}`}
              >
                Cocina
              </button>
            </>
          ) : null}
          {restaurantAccountMode && (accountDue > 0 || cart.length > 0) ? (
            hasActiveSplit && nextUnpaidSplitPart ? (
              <button
                type="button"
                onClick={handleRestaurantSplitChargeClick}
                disabled={submitting || (currentStep === 'payment' && !paymentMethod)}
                className={`flex-1 min-w-[120px] px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold touch-manipulation disabled:opacity-40 ${tabletMode ? 'min-h-[44px] py-2 text-base' : 'py-2.5 text-sm'}`}
              >
                {submitting
                  ? 'Cobrando…'
                  : currentStep !== 'payment'
                    ? 'Continuar al pago'
                    : !paymentMethod
                      ? 'Elige forma de pago'
                      : `Cobrar ${nextUnpaidSplitPart.label} · ${formatPrice(nextUnpaidSplitPart.amount)}`}
              </button>
            ) : (
            <button
              type="button"
              onClick={handleRestaurantAccountChargeClick}
              disabled={submitting || (cart.length === 0 && accountDue <= 0) || (currentStep === 'payment' && !paymentMethod)}
              className={`flex-1 min-w-[120px] px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold touch-manipulation disabled:opacity-40 ${tabletMode ? 'min-h-[44px] py-2 text-base' : 'py-2.5 text-sm'}`}
            >
              {submitting
                ? 'Cobrando…'
                : currentStep !== 'payment'
                  ? 'Continuar al pago'
                  : !paymentMethod
                    ? 'Elige forma de pago'
                    : cart.length > 0
                      ? 'Cobrar todo'
                      : `Cobrar ${formatPrice(accountDue)}`}
            </button>
            )
          ) : (
            <button
              type="button"
              onClick={handleFooterPrimary}
              disabled={footerPrimaryDisabled}
              className={`flex-1 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-base' : 'px-3 py-2.5 text-sm'}`}
            >
              {footerPrimaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isRestaurantMode && restaurantStaffConsumptionOpen && register && userId) {
    return (
      <WorkerTpvStaffConsumption
        userId={userId}
        onBack={() => setRestaurantStaffConsumptionOpen(false)}
        register={register}
        salesPointId={register.session?.pointOfSaleId}
        salesPointName={register.session?.pointOfSaleName}
      />
    );
  }

  return (
    <>
    <TpvFullscreenShell
      onBack={() => void handleGoBack()}
      embedded
      tabletMode={tabletMode}
      contentFill={tabletMode && isProductsFocus}
      topSlot={tpvTopActions}
      footerSlot={stickyFooter}
      hideBack={!embeddedInRestaurantTpv}
      compactTop={!tabletMode && orderFlowChrome}
    >
      <div className={`w-full min-w-0 ${tabletMode && isProductsFocus ? 'flex-1 min-h-0 flex flex-col pb-0 px-1' : tabletMode ? 'pb-2 px-1' : isProductsFocus ? 'max-w-[1320px] mx-auto pb-4 px-2 md:px-4' : 'max-w-[920px] mx-auto pb-3 px-2 sm:px-3 md:px-4'}`}>
        {!tabletMode && !orderFlowChrome && register && register.clockedInWorkers.length > 0 && (
          <div className="sticky top-0 z-20 -mx-2 md:-mx-4 px-2 md:px-4 py-2 mb-3 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
            <ClockedInWorkerBubbles
              workers={register.clockedInWorkers}
              selectedId={register.selectedOrderTakerId}
              onSelect={register.setSelectedOrderTakerId}
              loading={register.clockedInWorkersLoading}
              label="En tienda"
            />
          </div>
        )}

        {/* ═══════════════ STEP 1: CLIENT ═══════════════ */}
        {currentStep === 'client' ? (
          <StepContainer step={1} title="Cliente" visible>
            <div className="flex flex-col gap-1">
              <label className={LABEL_CLASS} htmlFor="tpv-client-search">
                Teléfono o nombre del cliente
              </label>
              <form
                className="flex flex-col sm:flex-row gap-2"
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
              >
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden />
                  <input
                    ref={phoneRef}
                    id="tpv-client-search"
                    name="vertial-client-search-q"
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={phoneInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPhoneInput(value);
                      if (selectedClient || quickAttentionActive) {
                        if (quickAttentionActive || isQuickAttentionFlowClient(selectedClient)) {
                          setQuickAttentionActive(false);
                          clearSelection();
                          setShowCreateForm(false);
                          setNewClientPhone('');
                          setDuplicateWarning(false);
                          setPhoneShake(false);
                        } else {
                          resetFlowFromClientStep();
                        }
                      } else {
                        setShowCreateForm(false);
                        setNewClientPhone('');
                        setDuplicateWarning(false);
                        setPhoneShake(false);
                      }
                    }}
                    placeholder="Ej. 612345678 o María García"
                    className={`${INPUT_CLASS} pl-10 ${tabletMode ? 'text-base py-2' : 'text-lg'} ${phoneShake ? 'animate-shake border-red-400 dark:border-red-500' : ''}`}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
              </form>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {!clientSearchUserId
                  ? 'No se pudo identificar la cuenta para buscar clientes. Cierra sesión y vuelve a entrar.'
                  : clientsTotalCount >= 500
                  ? `Tienes ${clientsTotalCount.toLocaleString('es-ES')} clientes: nombre o solo números (sin prefijo). No se listan todos a la vez.`
                  : 'Nombre o solo números del móvil (sin prefijo; también extranjeros).'}
              </p>
            </div>

            {searchError && (
              <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300 text-sm">
                {searchError}
              </div>
            )}

            {isSearching && results.length === 0 && clientSearchReady && (
              <p className="mt-3 text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                Buscando clientes…
              </p>
            )}

            {results.length > 0 && (
              <div className="mt-3 space-y-2">
                {results.map((client) => (
                  <ClientResultCard
                    key={client.id}
                    client={client}
                    onSelect={() => handleSelectClient(client)}
                  />
                ))}
              </div>
            )}

            {!showCreateForm && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {searchError
                    ? 'Revisa la conexión e inténtalo otra vez.'
                    : isSearching
                      ? 'Un momento, cargando la cartera…'
                      : clientSearchSettledEmpty
                      ? 'No se encontró ningún cliente con esa búsqueda'
                      : 'Si no aparece, crea uno o usa atención rápida'}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                  {!isRestaurantMode ? (
                    <button
                      type="button"
                      onClick={startQuickAttentionFlow}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 font-medium text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors touch-manipulation"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Atención rápida
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      const d = phoneInput.replace(/\D/g, '');
                      setNewClientPhone(d.length >= 6 ? phoneInput.replace(/\s+/g, ' ').trim() : '');
                      setShowCreateForm(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-medium text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-manipulation"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Crear cliente nuevo
                  </button>
                </div>
              </div>
            )}

            {duplicateWarning && (
              <div className="mt-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm">
                Ya existe un cliente con un teléfono similar. Se creó de todas formas.
              </div>
            )}

            {showCreateForm && (
              <div className="mt-4 p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Nuevo cliente</h3>
                <div>
                  <label className={LABEL_CLASS}>Nombre *</label>
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Nombre completo"
                    name="vertial-new-client-name"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Teléfono *</label>
                  <input
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    type="tel"
                    inputMode="tel"
                    name="vertial-new-client-phone"
                    autoComplete="tel"
                    className={`${INPUT_CLASS} font-mono`}
                    placeholder={`Solo números (mín. ${MIN_CLIENT_PHONE_DIGITS})`}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Calle <span className="font-normal text-gray-400">(opcional)</span></label>
                  <input value={newClientStreet} onChange={(e) => setNewClientStreet(e.target.value)} className={INPUT_CLASS} placeholder="Calle, número, piso…" />
                </div>
                {isDeliveryBusiness && (
                  <div>
                    <label className={LABEL_CLASS}>Ciudad <span className="font-normal text-gray-400">(opcional)</span></label>
                    <input value={newClientCity} onChange={(e) => setNewClientCity(e.target.value)} className={INPUT_CLASS} placeholder="Opcional" />
                  </div>
                )}
                <div>
                  <label className={LABEL_CLASS}>Observaciones</label>
                  <input value={newClientNotes} onChange={(e) => setNewClientNotes(e.target.value)} className={INPUT_CLASS} placeholder="Alergias, portal, piso..." />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Forma de pago</label>
                  <select
                    value={newClientPayment}
                    onChange={(e) => setNewClientPayment(e.target.value as PaymentMethod | '')}
                    className={INPUT_CLASS}
                    name="vertial-new-client-payment-preference"
                    autoComplete="off"
                  >
                    <option value="">Sin preferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewClientPhone('');
                      setNewClientCity('');
                    }}
                    className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button onClick={handleCreateClient} disabled={creatingClient} className="px-5 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50">
                    {creatingClient ? 'Creando...' : 'Crear cliente'}
                  </button>
                </div>
              </div>
            )}
          </StepContainer>
        ) : null}

        {/* ═══════════════ STEP 2: DELIVERY TYPE + PAGO ═══════════════ */}
        {currentStep === 'delivery' && isStepReachable('delivery') ? (
          <StepContainer step={2} title="Entrega" visible>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeliveryType('recogida');
                  setSelectedAddressId(null);
                  setAddressWarning(false);
                  setPaymentMethod(null);
                  setPendingSplitParts(null);
                  setCashGiven('');
                }}
                className={`flex flex-col items-center gap-3 p-6 min-h-[88px] rounded-2xl border-2 transition-all touch-manipulation ${
                  deliveryType === 'recogida'
                    ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <ShoppingBag className="w-8 h-8 text-gray-700 dark:text-gray-300" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">Recogida en local</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeliveryType('domicilio');
                  const primary = deliveryAddresses.find((a) => isPrimaryClientAddress(a, deliveryAddresses));
                  if (primary) setSelectedAddressId(primary.id);
                }}
                className={`flex flex-col items-center gap-3 p-6 min-h-[88px] rounded-2xl border-2 transition-all touch-manipulation ${
                  deliveryType === 'domicilio'
                    ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <Truck className="w-8 h-8 text-gray-700 dark:text-gray-300" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">Envío a domicilio</span>
              </button>
            </div>

            {deliveryType === 'domicilio' && (
              <div className="mt-4 space-y-3">
                {addressWarning && !selectedAddressId && (
                  <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm">
                    Selecciona o añade una dirección de entrega
                  </div>
                )}

                {deliveryAddresses.length > 0 && (
                  <div className="space-y-2">
                    {deliveryAddresses.map((addr) => {
                      const isPrimary = isPrimaryClientAddress(addr, deliveryAddresses);
                      return (
                      <label
                        key={addr.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedAddressId === addr.id
                            ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="address"
                          checked={selectedAddressId === addr.id}
                          onChange={() => setSelectedAddressId(addr.id)}
                          className="mt-1 accent-gray-900 dark:accent-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{addr.label || 'Dirección'}</span>
                            {isPrimary && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">Principal</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{addr.street}</p>
                          {addr.city && <p className="text-xs text-gray-400">{addr.city} {addr.postalCode}</p>}
                        </div>
                        {isPrimary && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleStartEditPrimaryAddress(addr);
                            }}
                            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            title="Editar dirección principal"
                            aria-label="Editar dirección principal"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </label>
                      );
                    })}
                  </div>
                )}

                {!showNewAddress && !editingAddressId && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewAddress(true);
                      setEditingAddressId(null);
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Añadir nueva dirección
                  </button>
                )}

                {editingAddressId && (
                  <div className="p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Editar dirección principal</p>
                    <div>
                      <label className={LABEL_CLASS}>Calle *</label>
                      <input value={editAddrStreet} onChange={(e) => setEditAddrStreet(e.target.value)} className={INPUT_CLASS} placeholder="Calle, número, piso..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLASS}>Ciudad</label>
                        <input value={editAddrCity} onChange={(e) => setEditAddrCity(e.target.value)} className={INPUT_CLASS} />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Código postal (opcional)</label>
                        <input value={editAddrPostal} onChange={(e) => setEditAddrPostal(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Notas</label>
                      <input value={editAddrNotes} onChange={(e) => setEditAddrNotes(e.target.value)} className={INPUT_CLASS} placeholder="Portal, timbre..." />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingAddressId(null)}
                        className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEditedAddress}
                        disabled={savingAddress || !editAddrStreet.trim()}
                        className="px-5 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        {savingAddress ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                {showNewAddress && (
                  <div className="p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
                    <div>
                      <label className={LABEL_CLASS}>Etiqueta</label>
                      <div className="flex gap-2">
                        {['Casa', 'Trabajo', 'Otro'].map((lbl) => (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() => setNewAddrLabel(lbl)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                              newAddrLabel === lbl
                                ? 'border-gray-900 dark:border-gray-300 bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900'
                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {lbl === 'Casa' && <Home className="w-3.5 h-3.5" />}
                            {lbl === 'Trabajo' && <Briefcase className="w-3.5 h-3.5" />}
                            {lbl === 'Otro' && <MapPin className="w-3.5 h-3.5" />}
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Calle *</label>
                      <input value={newAddrStreet} onChange={(e) => setNewAddrStreet(e.target.value)} className={INPUT_CLASS} placeholder="Calle, número, piso..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLASS}>Ciudad</label>
                        <input value={newAddrCity} onChange={(e) => setNewAddrCity(e.target.value)} className={INPUT_CLASS} />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Código postal (opcional)</label>
                        <input value={newAddrPostal} onChange={(e) => setNewAddrPostal(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Notas</label>
                      <input value={newAddrNotes} onChange={(e) => setNewAddrNotes(e.target.value)} className={INPUT_CLASS} placeholder="Portal, timbre..." />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={newAddrPrimary} onChange={(e) => setNewAddrPrimary(e.target.checked)} className="accent-gray-900 dark:accent-gray-300" />
                      Predeterminada
                    </label>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setShowNewAddress(false)} className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        Cancelar
                      </button>
                      <button type="button" onClick={handleSaveNewAddress} disabled={savingAddress || !newAddrStreet.trim()} className="px-5 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50">
                        {savingAddress ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                {configuredDeliveryFee > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    {waiveDeliveryFee ? (
                      <>
                        <span>Envío quitado (era {formatPrice(configuredDeliveryFee)})</span>
                        <button
                          type="button"
                          onClick={() => setWaiveDeliveryFee(false)}
                          className="px-2 h-7 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
                        >
                          Restaurar envío
                        </button>
                      </>
                    ) : (
                      <>
                        <span>Envío +{formatPrice(configuredDeliveryFee)}</span>
                        <button
                          type="button"
                          onClick={() => setWaiveDeliveryFee(true)}
                          className="px-2 h-7 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
                        >
                          Quitar envío
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {deliveryType === 'domicilio' && selectedAddressId ? (
              <div className="mt-5 space-y-2">
                <p className={LABEL_CLASS}>
                  Cómo va a pagar
                  <span className="ml-1 font-normal text-red-500">*</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1 mb-1">
                  Obligatorio. El cobro se confirma al entregar.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                    { key: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                  ]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => choosePaymentMethod(key)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all touch-manipulation ${
                        tabletMode ? 'p-2.5 min-h-[56px]' : 'p-4 min-h-[80px] gap-2'
                      } ${
                        paymentMethod === key
                          ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <Icon className={`text-gray-700 dark:text-gray-300 ${tabletMode ? 'w-5 h-5' : 'w-6 h-6'}`} />
                      <span className={`font-medium text-gray-900 dark:text-gray-100 ${tabletMode ? 'text-xs' : 'text-sm'}`}>{label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (tabletMode) {
                        choosePaymentMethod('mixto');
                        return;
                      }
                      setPaymentSplitOpen(true);
                    }}
                    className={`col-span-2 flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all touch-manipulation ${
                      tabletMode ? 'p-2.5 min-h-[52px]' : 'p-3 min-h-[64px]'
                    } ${
                      paymentMethod === 'mixto'
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40'
                        : 'border-violet-200 dark:border-violet-800 hover:border-violet-400'
                    }`}
                  >
                    <Split className={`text-violet-700 dark:text-violet-300 ${tabletMode ? 'w-5 h-5' : 'w-6 h-6'}`} />
                    <span className={`font-medium text-gray-900 dark:text-gray-100 ${tabletMode ? 'text-xs' : 'text-sm'}`}>
                      Pago dividido
                    </span>
                  </button>
                </div>

                {showCashChangeCalculator && (
                  <div className="mt-2.5 space-y-2">
                    {cashChargeTotal <= 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Añade productos en la carta: el total y el cambio se calcularán solos (puedes volver aquí).
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
                        A cobrar {formatPrice(cashChargeTotal)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mr-0.5">
                        Entrega
                      </span>
                      {cashQuickAmounts.map((amount) => {
                        const label = Math.abs(amount - cashChargeTotal) < 0.001
                          ? 'Exacto'
                          : `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}€`;
                        const selected = !isNaN(cashGivenAmount) && Math.abs(cashGivenAmount - amount) < 0.001;
                        return (
                          <button
                            key={label + String(amount)}
                            type="button"
                            onClick={() => setCashGiven(amount.toFixed(2))}
                            className={`min-h-[32px] px-2.5 rounded-lg text-xs font-semibold border touch-manipulation transition-colors ${
                              selected
                                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                      {changeAmount !== null && changeAmount > 0.001 ? (
                        <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          Cambio {formatPrice(changeAmount)}
                        </span>
                      ) : changeAmount !== null && changeAmount < -0.001 ? (
                        <span className="ml-auto text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">
                          Falta {formatPrice(Math.abs(changeAmount))}
                        </span>
                      ) : null}
                    </div>
                    <DecimalNumpadField
                      value={cashGiven}
                      onChange={setCashGiven}
                      placeholder={cashChargeTotal > 0 ? cashChargeTotal.toFixed(2) : '0.00'}
                      showNumpad
                      compactNumpad={tabletMode}
                      inputClassName={`${INPUT_CLASS} pr-8 text-lg font-semibold tabular-nums`}
                      numpadClassName="mt-2"
                      suffix={
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                      }
                    />
                  </div>
                )}
              </div>
            ) : null}

            {deliveryType === 'recogida' ? (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                Sin cobro ahora: se cobra al entregar en montaje.
              </p>
            ) : null}

            {deliveryCanContinue && (
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => completeStep('delivery')}
                  className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                >
                  Continuar a la carta
                </button>
              </div>
            )}
          </StepContainer>
        ) : null}

        {/* ═══════════════ STEP 3: PRODUCTS ═══════════════ */}
        {currentStep === 'products' && !isStepReachable('products') ? (
          <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Cargando el pedido…</p>
          </div>
        ) : null}
        {currentStep === 'products' && isStepReachable('products') ? (
          <StepContainer step={3} title="Productos" visible wide className={tabletMode ? 'flex-1 min-h-0 flex flex-col mb-0' : undefined}>
            <div className={tabletMode ? 'flex-1 min-h-0 flex flex-col w-full' : undefined}>
            <TpvProductPicker
              compact={tabletMode}
              userId={userId}
              businessId={businessId}
              sections={catalogSections}
              selectedSectionId={selectedSectionId}
              onSelectedSectionChange={setSelectedSectionId}
              loading={loadingCatalog && catalog.length === 0}
              catalog={catalog}
              brands={brands}
              catalogLayout={tpvCatalogLayout}
              clientProductScores={clientProductScores}
              resetSignal={productPickerReset}
              selectedCategory={selectedCategory}
              onSelectedCategoryChange={setSelectedCategory}
              categories={categories}
              habitualProducts={selectedClient ? habitualProducts : []}
              crossSellProducts={cart.length > 0 ? crossSellProducts : []}
              getCartQty={getCartQty}
              addToCart={handleProductPick}
              removeFromCart={decrementCatalogInCart}
              formatPrice={formatPrice}
              hasPricedProducts={hasPricedProducts}
              onImportCatalog={tabletMode ? undefined : () => navigate('/saas/catalog')}
              hideCatalogAdminLink={tabletMode}
              cartPanel={(
                <div className={`flex flex-col h-full min-h-0 ${tabletMode ? 'p-2.5' : 'p-3'} ${cartShake ? 'animate-shake' : ''}`}>
                  <div className={`flex items-center justify-between shrink-0 ${tabletMode ? 'mb-2' : 'mb-1.5'}`}>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider ${tabletMode ? 'text-xs' : 'text-xs'}`}>
                        Pedido
                      </h4>
                      {!isRestaurantMode && saleClient ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (quickAttentionActive || isQuickAttentionFlowClient(saleClient)) {
                              setQuickAttentionActive(false);
                              clearSelection();
                              setCompletedSteps(new Set());
                              setDeliveryType(null);
                            }
                            setCurrentStep('client');
                            setTimeout(() => phoneRef.current?.focus(), 150);
                          }}
                          className="mt-0.5 flex items-center gap-1 max-w-full text-left touch-manipulation"
                          title="Cambiar cliente"
                        >
                          {isQuickAttentionFlowClient(saleClient) ? (
                            <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <User className="w-3 h-3 text-gray-400 shrink-0" />
                          )}
                          <span className={`truncate font-semibold ${
                            isQuickAttentionFlowClient(saleClient)
                              ? 'text-emerald-700 dark:text-emerald-300 text-[11px]'
                              : 'text-gray-500 dark:text-gray-400 text-[11px]'
                          }`}>
                            {saleClient.name}
                            {saleClient.tags?.includes('cliente-perdido') ? ' · Perdido' : ''}
                            {deliveryType === 'recogida' ? ' · Recogida' : deliveryType === 'domicilio' ? ' · Domicilio' : ''}
                          </span>
                        </button>
                      ) : null}
                    </div>
                    {orderPanelCount > 0 && (
                      <span className={`font-bold tabular-nums rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 ${tabletMode ? 'text-xs px-2 py-0.5' : 'text-[10px] px-2 py-0.5'}`}>
                        {orderPanelCount}
                      </span>
                    )}
                  </div>

                  {orderPanelEmpty ? (
                    <div className={`flex-1 flex flex-col items-center justify-center text-center ${tabletMode ? 'py-6 px-2' : 'py-6 px-2'}`}>
                      <ShoppingCart className={`text-gray-300 dark:text-gray-600 mb-2 ${tabletMode ? 'w-10 h-10' : 'w-8 h-8'}`} />
                      <p className={`text-gray-400 dark:text-gray-500 ${tabletMode ? 'text-sm' : 'text-xs'}`}>Toca productos para añadir</p>
                    </div>
                  ) : (
                    <>
                      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y ${tabletMode ? 'space-y-2' : 'space-y-2.5 pr-0.5'}`}>
                        {restaurantAccountMode && accountLines.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                              En cuenta
                            </p>
                            {accountLines.map((line) => (
                              <div
                                key={line.key}
                                className={`rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/70 dark:bg-violet-950/20 ${tabletMode ? 'p-2.5' : 'p-2.5'}`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-violet-600/80 dark:text-violet-400/80 tabular-nums text-xs shrink-0">
                                        {line.quantity}×
                                      </span>
                                      <span className="text-gray-900 dark:text-gray-100 text-xs font-semibold truncate">
                                        {line.name}
                                      </span>
                                    </div>
                                    {line.notes ? (
                                      <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 pl-4 leading-tight">
                                        {line.notes}
                                      </p>
                                    ) : null}
                                    {line.comandaNumber > 0 ? (
                                      <p className="mt-0.5 text-[9px] text-violet-500 dark:text-violet-400 pl-4">
                                        Comanda #{line.comandaNumber}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="font-semibold text-violet-700 dark:text-violet-300 tabular-nums text-xs">
                                      {formatPrice(line.lineTotal)}
                                    </span>
                                    {restaurantPermissions?.canVoidComanda !== false ? (
                                      <button
                                        type="button"
                                        onClick={() => void handleVoidAccountLine(line)}
                                        disabled={submitting}
                                        className="p-1 rounded-lg text-violet-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors touch-manipulation disabled:opacity-40"
                                        title={`Anular ${line.name}`}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {restaurantAccountMode && accountLines.length > 0 && cart.length > 0 ? (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 pt-1">
                            Nuevo
                          </p>
                        ) : null}
                        {cart.map((ci) => {
                          const priced = pricedByLineId.get(ci.lineId);
                          const catalogUnit = cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization);
                          const lineUnit = priced?.unitPrice ?? catalogUnit;
                          const lineTotal = priced?.total
                            ?? cartLineTotal(ci.catalogItem.unitPrice, ci.quantity, ci.customization);
                          const extras = buildOrderExtras(ci.customization);
                          const customizable = isCustomizableCatalogItem(ci.catalogItem);
                          const promoOnLine = Boolean(priced && priced.lineDiscount > 0);
                          return (
                            <div
                              key={ci.lineId}
                              className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 ${tabletMode ? 'p-2.5 space-y-1.5' : 'p-2.5 space-y-1.5'}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isTpvHalfHalfCatalogItem(ci.catalogItem)) {
                                      setHalfHalfTarget({
                                        item: ci.catalogItem,
                                        lineId: ci.lineId,
                                        initial: ci.customization,
                                      });
                                      return;
                                    }
                                    if (isTpvComboCatalogItem(ci.catalogItem)) {
                                      setComboTarget({
                                        item: ci.catalogItem,
                                        lineId: ci.lineId,
                                        initial: ci.customization,
                                      });
                                      return;
                                    }
                                    setCustomizeTarget({
                                      item: ci.catalogItem,
                                      lineId: ci.lineId,
                                      initial: ci.customization,
                                    });
                                  }}
                                  className="min-w-0 text-left hover:opacity-80"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 dark:text-gray-400 tabular-nums text-xs shrink-0">
                                      {ci.quantity}×
                                    </span>
                                    <span className="text-gray-900 dark:text-gray-100 text-xs font-semibold truncate">
                                      {ci.catalogItem.name}
                                    </span>
                                  </div>
                                  {extras.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {extras.map((extra) => (
                                        <p
                                          key={extra}
                                          className={`text-[10px] leading-tight pl-4 ${
                                            extra.startsWith('-')
                                              ? 'text-red-600 dark:text-red-400 line-through'
                                              : 'text-emerald-700 dark:text-emerald-400'
                                          }`}
                                        >
                                          {extra}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </button>
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="text-right">
                                    {promoOnLine && priced && priced.catalogTotal !== lineTotal ? (
                                      <p className="text-[10px] text-gray-400 line-through tabular-nums leading-none">
                                        {formatPrice(priced.catalogTotal)}
                                      </p>
                                    ) : null}
                                    <span className={`font-semibold tabular-nums text-xs ${promoOnLine ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {formatPrice(lineTotal)}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => decrementCartLine(ci.lineId)}
                                    className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => incrementCartLine(ci.lineId)}
                                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-0.5"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <div className="pl-4">
                                <input
                                  type="text"
                                  value={ci.customization.notes}
                                  onChange={(e) => updateCartLineNotes(ci.lineId, e.target.value)}
                                  placeholder="Escribe una nota…"
                                  className="w-full px-2 py-1 text-[10px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-amber-400 dark:focus:border-amber-600"
                                />
                                {(customizable || lineUnit !== Number(ci.catalogItem.unitPrice || 0)) && (
                                  <p className="text-[9px] text-gray-400 mt-0.5 tabular-nums">
                                    {formatPrice(lineUnit)} / ud
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="shrink-0 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="mb-2">
                          <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                            Nota del pedido
                          </label>
                          <textarea
                            rows={tabletMode ? 2 : 2}
                            value={orderNotes}
                            onChange={(e) => setOrderNotes(e.target.value)}
                            placeholder="Escribe aquí (alergias, sin cebolla, timbre…)"
                            className="w-full px-2 py-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-amber-400 dark:focus:border-amber-600 resize-none"
                          />
                        </div>
                        {restaurantAccountMode && accountDue > 0 ? (
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider text-[10px]">
                              Total en cuenta
                            </span>
                            <span className="font-bold tabular-nums text-violet-700 dark:text-violet-300">
                              {formatPrice(accountDue)}
                            </span>
                          </div>
                        ) : null}
                        {restaurantAccountMode && Number(restaurantDiningOrder?.discount || 0) > 0 ? (
                          <div className="flex items-center justify-between text-[10px] text-emerald-700 dark:text-emerald-400 mb-2">
                            <span>
                              Descuento
                              {restaurantDiningOrder?.discountReason
                                ? ` · ${restaurantDiningOrder.discountReason}`
                                : ''}
                            </span>
                            <span className="font-semibold tabular-nums">-{formatPrice(restaurantDiningOrder?.discount || 0)}</span>
                          </div>
                        ) : null}
                        {hasActiveSplit ? (
                          <div className="mb-2 space-y-1">
                            {splitParts.map((part) => (
                              <div
                                key={part.label}
                                className={`flex items-center justify-between text-[10px] rounded-lg px-2 py-1 ${
                                  part.paid
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                                }`}
                              >
                                <span>{part.label}{part.paid ? ' ✓' : ''}</span>
                                <span className="font-bold tabular-nums">{formatPrice(part.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {(cart.length > 0 || (restaurantAccountMode && accountDue > 0)) ? (
                          <>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                          Promoción
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {(['none', 'code', 'client'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              disabled={mode === 'client' && clientPromos.length === 0}
                              onClick={() => {
                                setPromoMode(mode);
                                if (mode === 'code') setPromoCodeManual(false);
                                if (mode !== 'code') {
                                  setAppliedPromo(null);
                                  setPromoCodeInput('');
                                  setPromoCodeManual(false);
                                }
                              }}
                              className={`px-2 h-7 rounded-full text-[10px] font-bold border transition-colors disabled:opacity-50 ${
                                promoMode === mode
                                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              {mode === 'none' ? 'Ninguna' : mode === 'code' ? 'Código' : 'Cliente'}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5 mb-2">
                          {promoMode === 'client' ? (
                            <select
                              value={selectedClientPromoId}
                              onChange={(e) => setSelectedClientPromoId(e.target.value)}
                              className={`${INPUT_CLASS} h-9 py-1.5 text-xs min-w-0 flex-1`}
                            >
                              <option value="">Promo cliente…</option>
                              {clientPromos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre}
                                </option>
                              ))}
                            </select>
                          ) : promoMode === 'code' ? (
                            <>
                              {!promoCodeManual && selectableCompanyCodes.length > 0 ? (
                                <select
                                  value={appliedPromo?.code || ''}
                                  onChange={(e) => applyPromoFromList(e.target.value)}
                                  className={`${INPUT_CLASS} h-9 py-1.5 text-xs min-w-0 flex-1`}
                                >
                                  <option value="">Elegir código…</option>
                                  {selectableCompanyCodes.map((p) => (
                                    <option key={p.id} value={p.code}>
                                      {p.code}
                                      {p.name ? ` · ${p.name}` : ''}
                                    </option>
                                  ))}
                                  <option value="__manual__">Otro (escribir)…</option>
                                </select>
                              ) : (
                                <input
                                  value={promoCodeInput}
                                  onChange={(e) => setPromoCodeInput(e.target.value)}
                                  className={`${INPUT_CLASS} uppercase h-9 py-1.5 text-xs min-w-0 flex-1`}
                                  placeholder="PROMO"
                                  autoFocus={promoCodeManual}
                                />
                              )}
                              {appliedPromo ? (
                                <button type="button" onClick={clearPromoCode} className="px-2 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold shrink-0">
                                  Quitar
                                </button>
                              ) : promoCodeManual || selectableCompanyCodes.length === 0 ? (
                                <button type="button" onClick={applyPromoCode} className="px-2 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold shrink-0">
                                  OK
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-[10px] text-gray-400 py-2">Sin promoción</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                          <span className="font-bold tabular-nums">{formatPrice(chargedCartTotal)}</span>
                        </div>
                        {effectiveCalc.autoDiscount > 0 ? (
                          <div className="flex items-center justify-between text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                            <span className="truncate pr-2">
                              {effectiveCalc.autoPromoNames[0] || 'Promo automática'}
                              {' '}
                              (en precio)
                            </span>
                            <span className="font-semibold tabular-nums shrink-0">
                              ahorras {formatPrice(effectiveCalc.autoDiscount)}
                            </span>
                          </div>
                        ) : null}
                        {effectiveCalc.manualDiscount > 0 ? (
                          <div className="flex items-center justify-between text-xs mt-0.5">
                            <span className="text-gray-500 dark:text-gray-400">Descuento</span>
                            <span className="font-bold tabular-nums text-emerald-600">
                              -{formatPrice(effectiveCalc.manualDiscount)}
                            </span>
                          </div>
                        ) : discountAmount <= 0 ? (
                          <div className="flex items-center justify-between text-xs mt-0.5">
                            <span className="text-gray-500 dark:text-gray-400">Descuento</span>
                            <span className="font-bold tabular-nums">-{formatPrice(0)}</span>
                          </div>
                        ) : null}
                        {configuredDeliveryFee > 0 ? (
                          <div className="flex items-center justify-between text-xs mt-0.5 gap-2">
                            <span className="text-gray-500 dark:text-gray-400 shrink-0">Envío</span>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {waiveDeliveryFee ? (
                                <>
                                  <span className="text-gray-400 line-through tabular-nums">
                                    {formatPrice(configuredDeliveryFee)}
                                  </span>
                                  <span className="font-bold tabular-nums text-emerald-600">0,00 €</span>
                                  <button
                                    type="button"
                                    onClick={() => setWaiveDeliveryFee(false)}
                                    className="px-1.5 h-6 rounded-md border border-gray-200 dark:border-gray-600 text-[10px] font-semibold text-gray-600 dark:text-gray-300 shrink-0"
                                  >
                                    Restaurar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="font-bold tabular-nums">{formatPrice(configuredDeliveryFee)}</span>
                                  <button
                                    type="button"
                                    onClick={() => setWaiveDeliveryFee(true)}
                                    className="px-1.5 h-6 rounded-md border border-gray-200 dark:border-gray-600 text-[10px] font-semibold text-gray-600 dark:text-gray-300 shrink-0"
                                  >
                                    Quitar
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-bold text-sm">Total</span>
                          <span className="font-bold text-base tabular-nums">{formatPrice(payableTotal)}</span>
                        </div>
                        {!tabletMode && (
                        <button
                          type="button"
                          onClick={() => completeStep('products')}
                          className="w-full mt-3 min-h-[44px] py-3 rounded-xl bg-[var(--v-blue,#2563eb)] hover:bg-[#1d4ed8] text-white font-bold text-sm transition-colors touch-manipulation"
                        >
                          Continuar al pago
                        </button>
                        )}
                          </>
                        ) : null}
                        {cart.length > 0 && restaurantAccountMode ? (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Nuevo pedido</span>
                            <span className="font-bold text-sm tabular-nums">{formatPrice(finalTotal)}</span>
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              )}
            />
            </div>
          </StepContainer>
        ) : null}

        {/* ═══════════════ STEP 4: PAYMENT ═══════════════ */}
        {currentStep === 'payment' && isStepReachable('payment') ? (
          <StepContainer step={4} title="Pago y finalizar" visible>
            {deliveryType === 'domicilio' && (
              <div className="mb-4 p-4 rounded-2xl border-2 border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 text-sm text-cyan-900 dark:text-cyan-100">
                <p className="font-semibold">Envío a domicilio</p>
                <p className="mt-1 text-cyan-800 dark:text-cyan-200">
                  Indica cómo pagará el cliente. El cobro se confirma al entregar; si cambia, prevalece lo que marques entonces.
                </p>
                {configuredDeliveryFee > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-cyan-800 dark:text-cyan-200">
                    {waiveDeliveryFee ? (
                      <>
                        <span>Envío quitado (era {formatPrice(configuredDeliveryFee)})</span>
                        <button
                          type="button"
                          onClick={() => setWaiveDeliveryFee(false)}
                          className="px-2 h-7 rounded-lg border border-cyan-300 dark:border-cyan-700 text-xs font-semibold"
                        >
                          Restaurar envío
                        </button>
                      </>
                    ) : (
                      <>
                        <span>Envío +{formatPrice(configuredDeliveryFee)}</span>
                        <button
                          type="button"
                          onClick={() => setWaiveDeliveryFee(true)}
                          className="px-2 h-7 rounded-lg border border-cyan-300 dark:border-cyan-700 text-xs font-semibold"
                        >
                          Quitar envío
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
                <p className="mt-1 text-lg font-bold tabular-nums">{formatPrice(payableTotal)}</p>
              </div>
            )}

            {(restaurantAccountMode || cashChargeTotal > 0) && (
              <div className="mb-3">
                <p className={LABEL_CLASS}>Cómo va a pagar</p>
                {restaurantAccountMode ? (
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 -mt-1 mb-2">
                    {formatPrice(cashChargeTotal)}
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                { key: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(key);
                    setPendingSplitParts(null);
                    setRestaurantSplitStep(null);
                    if (key === 'efectivo') {
                      // Exacto por defecto: no hace falta teclear; solo cambiar si entrega otro billete.
                      setCashGiven(cashChargeTotal.toFixed(2));
                    } else {
                      setCashGiven('');
                    }
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all touch-manipulation ${
                    tabletMode ? 'p-2.5 min-h-[56px]' : 'p-4 min-h-[80px] gap-2'
                  } ${
                    paymentMethod === key
                      ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <Icon className={`text-gray-700 dark:text-gray-300 ${tabletMode ? 'w-5 h-5' : 'w-6 h-6'}`} />
                  <span className={`font-medium text-gray-900 dark:text-gray-100 ${tabletMode ? 'text-xs' : 'text-sm'}`}>{label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (restaurantAccountMode) {
                    openRestaurantPaymentSplit();
                    return;
                  }
                  if (deliveryType === 'domicilio' || tabletMode) {
                    setPaymentMethod('mixto');
                    setPendingSplitParts(null);
                    setCashGiven('');
                    return;
                  }
                  setPaymentSplitOpen(true);
                }}
                className={`col-span-2 flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all touch-manipulation ${
                  tabletMode ? 'p-2.5 min-h-[52px]' : 'p-3 min-h-[64px]'
                } ${
                  paymentMethod === 'mixto'
                    ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40'
                    : 'border-violet-200 dark:border-violet-800 hover:border-violet-400'
                }`}
              >
                <Split className={`text-violet-700 dark:text-violet-300 ${tabletMode ? 'w-5 h-5' : 'w-6 h-6'}`} />
                <span className={`font-medium text-gray-900 dark:text-gray-100 ${tabletMode ? 'text-xs' : 'text-sm'}`}>
                  Pago dividido
                </span>
              </button>
            </div>

            {showCashChangeCalculator && (
              <div className="mt-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mr-0.5">
                    Entrega
                  </span>
                  {cashQuickAmounts.map((amount) => {
                    const label = Math.abs(amount - cashChargeTotal) < 0.001
                      ? 'Exacto'
                      : `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}€`;
                    const selected = !isNaN(cashGivenAmount) && Math.abs(cashGivenAmount - amount) < 0.001;
                    return (
                      <button
                        key={label + String(amount)}
                        type="button"
                        onClick={() => setCashGiven(amount.toFixed(2))}
                        className={`min-h-[32px] px-2.5 rounded-lg text-xs font-semibold border touch-manipulation transition-colors ${
                          selected
                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {changeAmount !== null && changeAmount > 0.001 ? (
                    <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      Cambio {formatPrice(changeAmount)}
                    </span>
                  ) : changeAmount !== null && changeAmount < -0.001 ? (
                    <span className="ml-auto text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">
                      Falta {formatPrice(Math.abs(changeAmount))}
                    </span>
                  ) : null}
                </div>
                <DecimalNumpadField
                  value={cashGiven}
                  onChange={setCashGiven}
                  placeholder={cashChargeTotal.toFixed(2)}
                  showNumpad
                  compactNumpad={tabletMode}
                  inputClassName={`${INPUT_CLASS} pr-8 text-lg font-semibold tabular-nums`}
                  numpadClassName="mt-2"
                  suffix={
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                  }
                />
              </div>
            )}

            {restaurantAccountMode ? (
              <div className="mt-4 p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20">
                <label className={LABEL_CLASS}>Propina (opcional)</label>
                <div className="flex flex-wrap items-center gap-2">
                  {['1', '2', '5'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTipInput((prev) => (prev === v ? '' : v))}
                      className={`min-w-[52px] min-h-[40px] rounded-xl border-2 text-sm font-bold touch-manipulation ${
                        tipInput === v
                          ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {v} €
                    </button>
                  ))}
                  <div className="relative flex-1 min-w-[110px]">
                    <DecimalNumpadField
                      value={tipInput}
                      onChange={setTipInput}
                      placeholder="Otra cantidad"
                      showNumpad={false}
                      inputClassName={`${INPUT_CLASS} pr-8 text-sm font-semibold`}
                      suffix={
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                      }
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                  Se registra con el cobro de la mesa y suma al informe de propinas.
                </p>
              </div>
            ) : null}

            <div className="mt-3">
              <label className={LABEL_CLASS}>Notas / Observaciones</label>
              <textarea
                rows={tabletMode ? 2 : 3}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Escribe aquí (alergias, sin cebolla, timbre…)"
              />
            </div>

            <div className="mt-4">
              {!tabletMode && (
                <>
                  <label className={LABEL_CLASS}>Estado inicial</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInitialStatus('nuevo')}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        initialStatus === 'nuevo'
                          ? 'border-gray-900 dark:border-gray-300 bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      Nuevo
                    </button>
                    <button
                      onClick={() => setInitialStatus('cocina')}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        initialStatus === 'cocina'
                          ? 'border-gray-900 dark:border-gray-300 bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      En preparación
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    El gerente puede configurar el estado por defecto
                  </p>
                </>
              )}
              {tabletMode && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  Tras cobrar, el pedido entra directo en Montaje del tablero.
                </p>
              )}
            </div>
          </StepContainer>
        ) : null}
      </div>
      {halfHalfTarget && (
        <TpvHalfHalfCustomizeModal
          item={halfHalfTarget.item}
          catalogItems={catalog}
          brands={brands}
          initial={halfHalfTarget.initial?.halfHalfPizza}
          formatPrice={formatPrice}
          onClose={() => setHalfHalfTarget(null)}
          onConfirm={handleHalfHalfConfirm}
        />
      )}
      {comboTarget && (
        <TpvComboCustomizeModal
          item={comboTarget.item}
          catalogItems={catalog}
          initialSelections={comboTarget.initial?.comboSelections}
          formatPrice={formatPrice}
          templates={tpvCategoryTemplates}
          brandIngredientSelection={tpvBrandIngredientSelection}
          brandSupplements={tpvBrandSupplements}
          storeIngredients={storeIngredients}
          defaultExtraPrice={tpvDefaultExtraPrice}
          brands={brands}
          onClose={() => setComboTarget(null)}
          onConfirm={handleComboConfirm}
        />
      )}
      {customizeTarget && (
        <TpvItemCustomizeModal
          item={customizeTarget.item}
          initial={customizeTarget.initial}
          templates={tpvCategoryTemplates}
          brandIngredientSelection={tpvBrandIngredientSelection}
          brandSupplements={tpvBrandSupplements}
          storeIngredients={storeIngredients}
          defaultExtraPrice={tpvDefaultExtraPrice}
          freeSwapOnRemove={tpvFreeSwapOnRemove}
          brands={brands}
          catalogItems={catalog}
          formatPrice={formatPrice}
          onClose={() => setCustomizeTarget(null)}
          onConfirm={(customization) =>
            commitCartLine(customizeTarget.item, customization, customizeTarget.lineId)
          }
        />
      )}
      {changeTableOpen && userId && restaurantTable && !restaurantTable.isCounter ? (
        <RestaurantChangeTableModal
          userId={userId}
          currentTableId={restaurantTable.id}
          onSelect={(table) => void handleConfirmChangeTable(table)}
          onClose={() => setChangeTableOpen(false)}
        />
      ) : null}
      {mergeTableOpen && userId && restaurantTable && restaurantDiningOrder && !restaurantTable.isCounter ? (
        <RestaurantMergeTableModal
          userId={userId}
          currentTableId={restaurantTable.id}
          currentOrderId={restaurantDiningOrder._id}
          onSelect={(sourceOrderId, sourceTable) => void handleConfirmMergeTable(sourceOrderId, sourceTable)}
          onClose={() => setMergeTableOpen(false)}
        />
      ) : null}
      {restaurantClientPickerOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-gray-900 sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Cliente de la mesa</h3>
                <p className="text-xs text-gray-500">Busca por nombre o teléfono</p>
              </div>
              <button
                type="button"
                onClick={() => setRestaurantClientPickerOpen(false)}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2 p-3">
              <input
                autoFocus
                value={restaurantClientQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setRestaurantClientQuery(q);
                  setPhoneInput(q);
                }}
                placeholder="Nombre o teléfono…"
                className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950"
              />
              {restaurantLinkedClient && !isTpvSyntheticClientId(restaurantLinkedClient.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    clearSelection();
                    setRestaurantClientPickerOpen(false);
                    toast.message('Cliente desvinculado en pantalla (la cuenta mantiene el vínculo hasta elegir otro)');
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  Quitar selección actual · {restaurantLinkedClient.name}
                </button>
              ) : null}
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {isSearching ? (
                  <p className="py-6 text-center text-sm text-gray-500">Buscando…</p>
                ) : results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">
                    {restaurantClientQuery.trim().length < 1 ? 'Escribe para buscar' : 'Sin resultados'}
                  </p>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void handleLinkRestaurantClient(c)}
                      className="flex w-full flex-col rounded-xl border border-gray-100 px-3 py-2.5 text-left hover:bg-sky-50 dark:border-gray-800 dark:hover:bg-sky-950/30"
                    >
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</span>
                      <span className="text-xs text-gray-500">{c.phone || 'Sin teléfono'}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {splitBillOpen && restaurantDiningOrder ? (
        <RestaurantSplitBillModal
          total={accountDue > 0 ? accountDue : Number(restaurantDiningOrder.total || 0)}
          lines={accountLines}
          submitting={submitting}
          onConfirm={(result) => void handleConfirmSplitBill(result)}
          onClose={() => setSplitBillOpen(false)}
        />
      ) : null}
      {discountOpen && restaurantDiningOrder ? (
        <RestaurantAccountDiscountModal
          subtotal={Number(restaurantDiningOrder.subtotal || 0)}
          currentDiscount={Number(restaurantDiningOrder.discount || 0)}
          currentDiscountPercent={Number(restaurantDiningOrder.discountPercent || 0)}
          submitting={submitting}
          loyaltyPoints={Number((saleClient as { loyalty?: { points?: number } } | null)?.loyalty?.points || 0)}
          clientId={String(saleClient?.id || restaurantDiningOrder.clientId || '')}
          clientName={String(saleClient?.name || restaurantDiningOrder.clientName || '')}
          onApply={(payload) => void handleApplyAccountDiscount(payload)}
          onClear={() => void handleClearAccountDiscount()}
          onClose={() => setDiscountOpen(false)}
        />
      ) : null}
      {paymentSplitOpen ? (
        <TpvSplitPaymentModal
          total={payableTotal}
          title="Pago dividido"
          loading={submitting}
          onClose={() => setPaymentSplitOpen(false)}
          onConfirm={(parts) => {
            setPendingSplitParts(parts);
            setPaymentMethod('mixto');
            setPaymentSplitOpen(false);
            setCashGiven('');
            void handleSubmitOrder(tabletMode ? 'listo' : initialStatus, 'mixto', parts);
          }}
        />
      ) : null}
      {restaurantSplitStep === 'choice' ? (
        <TpvModalRoot>
          <button
            type="button"
            className="absolute inset-0 bg-black/50 border-0"
            aria-label="Cerrar"
            onClick={() => setRestaurantSplitStep(null)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm p-5 mx-auto">
            <button
              type="button"
              onClick={() => setRestaurantSplitStep(null)}
              disabled={submitting}
              className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="text-center mb-4 pr-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                <Split className="w-6 h-6 text-violet-700 dark:text-violet-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Pago dividido</h3>
              {restaurantTable ? (
                <p className="text-sm text-gray-500 mt-1">Mesa {restaurantTable.number}</p>
              ) : null}
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
                {formatPrice(cashChargeTotal)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 font-medium">
                ¿Cómo quieres dividir el cobro?
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setRestaurantSplitStep('items')}
                disabled={submitting || restaurantSplitItems.length === 0}
                className="w-full flex items-start gap-3 text-left py-3.5 px-3 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
              >
                <ShoppingBag className="w-6 h-6 text-violet-700 dark:text-violet-300 shrink-0 mt-0.5" />
                <span>
                  <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">Por artículos</span>
                  <span className="block text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                    Cada producto en efectivo o tarjeta
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setRestaurantSplitStep('amounts')}
                disabled={submitting || cashChargeTotal <= 0}
                className="w-full flex items-start gap-3 text-left py-3.5 px-3 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors disabled:opacity-50"
              >
                <Wallet className="w-6 h-6 text-violet-700 dark:text-violet-300 shrink-0 mt-0.5" />
                <span>
                  <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">Por importes</span>
                  <span className="block text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                    Parte el total en tanto y tanto (€)
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setRestaurantSplitStep(null)}
                disabled={submitting}
                className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                Atrás
              </button>
            </div>
          </div>
        </TpvModalRoot>
      ) : null}
      {restaurantSplitStep === 'items' ? (
        <RestaurantItemPaySelectModal
          items={restaurantSplitItems}
          total={cashChargeTotal}
          title="Pago por artículos"
          subtitle={restaurantTable ? `Mesa ${restaurantTable.number}` : 'Cuenta'}
          loading={submitting}
          onClose={() => setRestaurantSplitStep(null)}
          onBack={() => setRestaurantSplitStep('choice')}
          onConfirm={handleRestaurantSplitPartsConfirm}
        />
      ) : null}
      {restaurantSplitStep === 'amounts' ? (
        <TpvSplitPaymentModal
          total={cashChargeTotal}
          title="Pago por importes"
          subtitle={restaurantTable ? `Mesa ${restaurantTable.number}` : 'Cuenta'}
          loading={submitting}
          onClose={() => setRestaurantSplitStep('choice')}
          onConfirm={handleRestaurantSplitPartsConfirm}
        />
      ) : null}
    </TpvFullscreenShell>
    {quickNamePromptOpen
      && typeof document !== 'undefined'
      && createPortal(
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpv-quick-name-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px] border-0 cursor-default"
            aria-label="Cerrar"
            disabled={creatingClient}
            onClick={() => {
              if (!creatingClient) cancelQuickAttentionNamePrompt();
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[min(88svh,520px)] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="tpv-quick-name-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Pedido rápido
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Solo hace falta el nombre. Si pones teléfono completo (9 dígitos), se guarda en el CRM; si no, no se crea cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelQuickAttentionNamePrompt}
                className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation"
                aria-label="Cerrar"
                disabled={creatingClient}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="tpv-quick-attention-name">
                Nombre *
              </label>
              <input
                id="tpv-quick-attention-name"
                value={quickNameDraft}
                onChange={(e) => setQuickNameDraft(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ej. Mesa 3, Juan, Recado…"
                autoFocus
                name="vertial-quick-attention-name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                disabled={creatingClient}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirmQuickAttentionName();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelQuickAttentionNamePrompt();
                  }
                }}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="tpv-quick-attention-phone">
                Teléfono <span className="normal-case font-medium text-gray-400">(opcional)</span>
              </label>
              <div className="flex gap-2 items-stretch">
                <span className="inline-flex items-center px-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200 shrink-0">
                  +34
                </span>
                <input
                  id="tpv-quick-attention-phone"
                  value={quickPhoneDraft}
                  onChange={(e) => setQuickPhoneDraft(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Si no lo da, déjalo vacío"
                  inputMode="tel"
                  name="vertial-quick-attention-phone"
                  autoComplete="off"
                  disabled={creatingClient}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void confirmQuickAttentionName();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelQuickAttentionNamePrompt();
                    }
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                No es obligatorio. Vacío o incompleto = no se guarda en CRM.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelQuickAttentionNamePrompt}
                disabled={creatingClient}
                className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 touch-manipulation disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmQuickAttentionName()}
                disabled={creatingClient}
                className="px-5 py-2.5 rounded-xl bg-[var(--v-blue,#2563eb)] hover:bg-[#1d4ed8] text-white text-sm font-bold touch-manipulation disabled:opacity-50"
              >
                {creatingClient ? 'Guardando en CRM…' : 'Continuar'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepContainer({ step, title, visible, children, wide = false, className = '' }: { step: number; title: string; visible: boolean; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div
      className={`mb-4 transition-all duration-500 w-full min-w-0 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      } ${className}`}
    >
      <div className={`space-y-0 w-full min-w-0 ${wide ? 'flex-1 min-h-0 flex flex-col' : ''}`}>{children}</div>
    </div>
  );
}

function TpvFullscreenShell({
  children,
  onBack,
  topSlot,
  footerSlot,
  embedded = false,
  tabletMode = false,
  contentFill = false,
  hideBack = false,
  /** En móvil dentro del gate: la barra de caja ya ocupa la parte superior. */
  compactTop = false,
}: {
  children: ReactNode;
  onBack: () => void;
  topSlot?: ReactNode;
  footerSlot?: ReactNode;
  /** Dentro del gate TPV (tablet): no cubrir la barra verde de caja con fixed. */
  embedded?: boolean;
  tabletMode?: boolean;
  /** Tablet: bloquear scroll del shell y delegarlo al grid de productos. */
  contentFill?: boolean;
  /** Oculta «Volver» arriba; la salida va en el footer (Cancelar / Volver al tablero). */
  hideBack?: boolean;
  compactTop?: boolean;
}) {
  const minimalHeader = tabletMode && embedded;
  const showHeader = (!hideBack || !!topSlot) && !(compactTop && !topSlot);
  const header = showHeader ? (
    <div className={`shrink-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 ${compactTop ? '' : 'pt-[max(0px,env(safe-area-inset-top))]'}`}>
      <div className={`mx-auto flex items-center gap-1.5 ${minimalHeader ? 'px-1.5 py-0.5' : `max-w-[1320px] px-3 ${tabletMode ? 'py-1.5' : 'py-2.5'}`}`}>
        {!hideBack ? (
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation ${
              minimalHeader ? 'min-h-[28px] min-w-[28px] p-1' : `gap-1.5 px-2.5 ${tabletMode ? 'min-h-[36px] py-1.5 text-xs' : 'py-1.5 text-sm'}`
            }`}
            title="Volver"
          >
            <ArrowLeft className={minimalHeader ? 'w-4 h-4' : 'w-4 h-4'} />
            {!minimalHeader && 'Volver'}
          </button>
        ) : null}
        <div className="flex-1 min-w-0" />
        {topSlot}
      </div>
    </div>
  ) : null;

  if (embedded) {
    const contentClass =
      tabletMode && contentFill
        ? 'overflow-hidden flex flex-col'
        : tabletMode
          ? 'overflow-y-auto overscroll-contain'
          : 'overflow-y-auto';

    return (
      <div className="h-full w-full min-h-0 min-w-0 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
        {header}
        <div className={`flex-1 min-h-0 min-w-0 w-full ${contentClass}`}>
          <div
            className={`w-full min-w-0 ${
              contentFill
                ? minimalHeader
                  ? 'flex-1 min-h-0 flex flex-col h-full px-1 pt-0.5'
                  : 'max-w-[1320px] mx-auto px-2 md:px-3 pt-1.5 flex-1 min-h-0 flex flex-col h-full'
                : minimalHeader
                  ? 'px-1 pt-0.5 pb-2'
                  : 'max-w-[1320px] mx-auto px-2 md:px-3 pt-1.5 pb-2'
            }`}
          >
            {children}
          </div>
        </div>
        {footerSlot}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950 flex flex-col overflow-hidden">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-2 md:px-3 pt-2">{children}</div>
      </div>
      {footerSlot}
    </div>
  );
}

function CollapsedStep({
  icon,
  label,
  detail,
  onEdit,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onEdit: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400">
        <Check className="w-4 h-4" />
      </div>
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{label}</span>
        {detail && <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{detail}</span>}
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <Edit3 className="w-4 h-4" />
      </button>
    </div>
  );
}

function ClientResultCard({ client, onSelect }: { client: Client; onSelect: () => void }) {
  const addrs = resolveClientDeliveryAddresses(client);
  const primaryAddr = addrs.find((a) => isPrimaryClientAddress(a, addrs));
  const payLabels: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    bizum: 'Bizum',
    otro: 'Otros',
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-800 transition-colors text-left cursor-pointer"
    >
      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 shrink-0">
        {getInitials(client.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{client.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {String(client.phone || '').replace(/\D/g, '') || client.phone || '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          {primaryAddr && (
            <span className="flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {primaryAddr.street}
            </span>
          )}
          {client.defaultPaymentMethod && (
            <span className="flex items-center gap-0.5 shrink-0">
              <CreditCard className="w-3 h-3" />
              {payLabels[client.defaultPaymentMethod] || client.defaultPaymentMethod}
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900 text-xs font-medium pointer-events-none">
        Seleccionar
      </span>
    </button>
  );
}
