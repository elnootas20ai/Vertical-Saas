import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PhonePrefixSelector } from '../../components/saas/PhonePrefixSelector';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useClientPhoneSearch } from '../../hooks/useClientPhoneSearch';
import {
  filterDeliveryOrdersRequest,
  createDeliveryOrderWithCajaStatus,
  getDeliveryConfigRequest,
  type CatalogItem,
  type DeliveryOrder,
  type DeliveryOrderItem,
  type DeliveryOrderStatus,
  type DeliveryType,
  type TpvPaymentMethod,
  isTpvRegisterSessionOpen,
} from '../../lib/deliveryApi';
import { updateClientRequest, getClientDetailRequest } from '../../lib/crmApi';
import type { Client, ClientAddress } from '../../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { findActivePromotionByCode, computePromoDiscount, type AppliedPromo, getClientAppliedPromo } from '../../lib/promoCodes';
import { printDeliveryTicket } from '../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom } from '../../lib/deliveryTicketHelpers';
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
  buildTpvCatalogSections,
  categoriesForTpvScope,
  defaultTpvSectionId,
  parseTpvSectionId,
  tpvSectionProductCount,
} from '../../lib/tpvCatalogNavigation';
import { TpvRegisterGate, TpvRegisterProvider, useTpvRegisterIfOpen, type TpvRegisterContextType } from '../../components/saas/TpvRegisterGate';
import { isTpvTabletBound, readTpvTabletBinding, TPV_TABLET_DELIVERY_PATH } from '../../lib/tpvTabletSession';
import { resolveTpvRegisterScope } from '../../lib/tpvRegisterScope';
import { shouldUseDeliveryStores, resolveBusinessScopeId, DELIVERY_CONFIG_CHANGED } from '../../lib/deliverySetup';
import { resolveClientSearchBusinessId } from '../../lib/clientSearchScope';
import { ClockedInWorkerBubbles } from '../../components/saas/ClockedInWorkerBubbles';
import { TpvOfflineBanner } from '../../components/saas/TpvOfflineBanner';
import { CeoTpvStorePicker, buildCeoTpvStoreRows } from '../../components/saas/CeoTpvStorePicker';
import { WorkerTpvDelivery } from './worker/WorkerTpvDelivery';
import { WorkerTpvStockReview } from './worker/WorkerTpvStockReview';
import { WorkerTpvBottomBar } from '../../components/saas/WorkerTpvBottomBar';
import { TpvChromeScope, useTpvOrderFlowChrome } from '../../context/TpvChromeContext';
import { consumeTpvStockReviewLaunch, TPV_OPEN_STOCK_REVIEW_EVENT } from '../../lib/tpvStockReview';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  coerceSelectedPdvId,
  notifyDeliveryActiveStoreChanged,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../../lib/deliveryOpsPdvSelection';
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
  Smartphone,
  Wallet,
  ShoppingCart,
  CheckCircle2,
  Home,
  Briefcase,
  Loader2,
} from 'lucide-react';

type Step = 'client' | 'delivery' | 'products' | 'payment';
type PaymentMethod = TpvPaymentMethod;

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
  const { currentBusiness, businesses } = useBusiness();
  const {
    pointsOfSale,
    retailWorkCenters,
    activeSalesPointId,
    setActiveSalesPoint,
    loading: storesLoading,
  } = useActiveStoreScope();
  const navigate = useNavigate();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [forceStorePicker, setForceStorePicker] = useState(false);
  const [stockOpen, setStockOpen] = useState(() => consumeTpvStockReviewLaunch());

  useEffect(() => {
    const onOpen = () => setStockOpen(true);
    window.addEventListener(TPV_OPEN_STOCK_REVIEW_EVENT, onOpen);
    return () => window.removeEventListener(TPV_OPEN_STOCK_REVIEW_EVENT, onOpen);
  }, []);

  /** Misma tienda que Ops / sidebar / última elección — sin pedir de nuevo salvo "Cambiar tienda". */
  useEffect(() => {
    if (forceStorePicker || !businessId || !dataUserId) return;
    const pdvs = pointsOfSale.filter((p) => p.active !== false);
    const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    const pdvId = coerceSelectedPdvId(pdvs, saved || activeSalesPointId);
    if (!pdvId) return;
    setSelectedPdvId((prev) => (prev === pdvId ? prev : pdvId));
    if (activeSalesPointId !== pdvId) {
      setActiveSalesPoint(pdvId);
    }
  }, [
    forceStorePicker,
    businessId,
    dataUserId,
    pointsOfSale,
    activeSalesPointId,
    setActiveSalesPoint,
  ]);

  useEffect(() => {
    const onStore = () => {
      if (forceStorePicker || !businessId || !dataUserId) return;
      const pdvs = pointsOfSale.filter((p) => p.active !== false);
      const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
      const pdvId = coerceSelectedPdvId(pdvs, saved || activeSalesPointId);
      if (pdvId) setSelectedPdvId(pdvId);
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [forceStorePicker, businessId, dataUserId, pointsOfSale, activeSalesPointId]);

  useEffect(() => {
    if (!businessId || !dataUserId) return;
    prefetchTpvCatalog(dataUserId, businessId, {
      accountBusinessCount: businesses.length,
    });
  }, [businessId, dataUserId, businesses.length]);

  const storeRows = useMemo(
    () => buildCeoTpvStoreRows(retailWorkCenters, pointsOfSale, businessId),
    [retailWorkCenters, pointsOfSale, businessId],
  );

  const selectedPdvName = useMemo(() => {
    if (!selectedPdvId) return '';
    const pdv = pointsOfSale.find((p) => p._id === selectedPdvId);
    return pdv?.name || '';
  }, [selectedPdvId, pointsOfSale]);

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

  if (!selectedPdvId || forceStorePicker) {
    return (
      <CeoTpvStorePicker
        storeName={currentBusiness?.name}
        storeRows={storeRows}
        pointsOfSale={pointsOfSale.filter((p) => p.active !== false)}
        loading={storesLoading}
        onSelect={handleSelectStore}
        onBack={() => navigate('/saas/delivery-ops')}
      />
    );
  }

  return (
    <TpvChromeScope bottomBar={!stockOpen ? <WorkerTpvBottomBar ceoMode /> : null}>
      <div className="flex flex-col h-[100svh] min-h-[100svh] overflow-hidden bg-gray-50 dark:bg-gray-950">
        <TpvOfflineBanner />
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <TpvRegisterGate
            fillParent
            initialManagerPdvId={selectedPdvId}
            onManagerStoreCleared={handleChangeStore}
          >
            {stockOpen ? (
              <WorkerTpvStockReview
                onBack={() => setStockOpen(false)}
                scopeOverride={{
                  dataUserId,
                  storeLabel: selectedPdvName,
                  pdvId: selectedPdvId,
                }}
              />
            ) : (
              <WorkerTpvDelivery
                ceoMode
                forcedPdvId={selectedPdvId}
                onChangeStore={handleChangeStore}
              />
            )}
          </TpvRegisterGate>
        </div>
      </div>
    </TpvChromeScope>
  );
}

export function TpvRapidoPage() {
  if (isTpvTabletBound()) {
    return <Navigate to={TPV_TABLET_DELIVERY_PATH} replace />;
  }
  return <TpvRapidoCeoBoard />;
}

export type TpvRapidoOrderFlowProps = {
  /** Tablet TPV: volver al tablero operativo en lugar de delivery-ops */
  onBack?: () => void;
  tabletMode?: boolean;
  /** Cuando el flujo se monta fuera del árbol del gate (p. ej. vista embebida en tablet). */
  registerOverride?: TpvRegisterContextType;
};

export function TpvRapidoOrderFlow({
  onBack,
  tabletMode = false,
  registerOverride,
}: TpvRapidoOrderFlowProps = {}) {
  useTpvOrderFlowChrome(tabletMode);
  const { user } = useAuth();
  const registerFromGate = useTpvRegisterIfOpen();
  const register = registerOverride ?? registerFromGate;

  const { addClient, clients, clientsTotalCount } = useApp();
  const { currentBusiness, businesses } = useBusiness();
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate('/saas/delivery-ops'));
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedClientIdFromUrl = useRef<string | null>(null);
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () => resolveTpvRegisterScope({ currentBusiness, tabletBinding, authUser: user }),
    [currentBusiness, tabletBinding, user],
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
  const clientSearchUserId = useMemo(
    () => userId || resolveBusinessDataUserId(user, currentBusiness),
    [userId, user, currentBusiness],
  );
  const clientSearchBusinessId = resolveClientSearchBusinessId(currentBusiness, businessId);

  const [currentStep, setCurrentStep] = useState<Step>('client');
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());

  // Step 1 - Client
  const [phonePrefix, setPhonePrefix] = useState('+34');
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

  const { results, isSearching, searchError, selectedClient, selectClient, clearSelection, clearResults } =
    useClientPhoneSearch({
      userId: clientSearchUserId,
      phone: phoneInput,
      businessId: clientSearchBusinessId,
      enabled: !showCreateForm,
      matchByName: true,
      minQueryLength: 2,
    });

  // Step 2 - Delivery
  const [deliveryType, setDeliveryType] = useState<DeliveryType | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartShake, setCartShake] = useState(false);
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
  const [recentOrdersPool, setRecentOrdersPool] = useState<DeliveryOrder[]>([]);

  // Step 4 - Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [cashGiven, setCashGiven] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [initialStatus, setInitialStatus] = useState<'nuevo' | 'cocina'>('nuevo');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoMode, setPromoMode] = useState<'none' | 'code' | 'client'>('none');
  const [clientPromos, setClientPromos] = useState<ClientPromotion[]>([]);
  const [selectedClientPromoId, setSelectedClientPromoId] = useState<string>('');

  // Post-creation
  const [createdOrder, setCreatedOrder] = useState<DeliveryOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const { catalog, brands, loadingCatalog } = useTpvCatalog(userId, businessId, {
    accountBusinessCount: businesses.length,
  });

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
      })
      .catch(() => {});
  }, [userId, brands]);

  const catalogSections = useMemo(
    () => buildTpvCatalogSections(brands, catalog),
    [brands, catalog],
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
  }, [businessId]);

  useEffect(() => {
    if (brandInitRef.current || catalogSections.length === 0) return;
    brandInitRef.current = true;
    setSelectedSectionId(defaultTpvSectionId(catalogSections, catalog));
  }, [catalogSections, catalog]);

  useEffect(() => {
    if (!selectedSectionId || loadingCatalog || catalog.length === 0) return;
    const scope = parseTpvSectionId(selectedSectionId);
    if (!scope || tpvSectionProductCount(catalog, scope) > 0) return;
    const fallback = defaultTpvSectionId(catalogSections, catalog);
    if (fallback && fallback !== selectedSectionId) {
      setSelectedSectionId(fallback);
      setSelectedCategory(null);
    }
  }, [selectedSectionId, loadingCatalog, catalog, catalogSections]);

  useEffect(() => {
    if (!userId || !businessId) return;
    prefetchTpvCatalog(userId, businessId, { accountBusinessCount: businesses.length });
  }, [userId, businessId, businesses.length]);

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
      })
      .catch(() => {
        if (!cancelled) {
          setTpvCategoryTemplates({});
          setStoreIngredients([]);
          setTpvBrandIngredientSelection({});
          setTpvBrandSupplements({});
          setTpvDefaultExtraPrice(0);
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
        const unified = unifyStoreIngredientsFromConfig(cfg || {}, brands.map((b) => b._id));
        setStoreIngredients(unified);
        setTpvDefaultExtraPrice(inferTpvDefaultExtraPrice(unified, cfg?.tpvDefaultExtraPrice));
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

  // ─── Autofocus phone on mount or reset ─────────────────────────────────────
  useEffect(() => {
    if (currentStep === 'client' && !selectedClient && !createdOrder) {
      setTimeout(() => phoneRef.current?.focus(), 100);
    }
  }, [currentStep, selectedClient, createdOrder]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    if (!selectedScope) return [];
    return categoriesForTpvScope(selectedScope, brands, catalog);
  }, [selectedScope, brands, catalog]);

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

  const hasPricedProducts = useMemo(
    () => catalog.some((item) => Number(item.unitPrice || 0) > 0),
    [catalog],
  );

  const habitualProducts = useMemo(
    () =>
      catalog
        .filter(
          (p) =>
            (p.itemType === 'product' || p.itemType === 'combo') &&
            p.active !== false &&
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
      item.active &&
      Number(item.unitPrice || 0) > 0 &&
      (item.itemType === 'product' || item.itemType === 'combo');

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
    if (promoMode === 'code') {
      return computePromoDiscount(cartTotal, appliedPromo);
    }
    if (promoMode === 'client') {
      if (!clientPromoSelected) return { discount: 0, finalTotal: cartTotal };
      const isActive = String(clientPromoSelected.estado || '').toLowerCase() === 'activa';
      if (!isActive) return { discount: 0, finalTotal: cartTotal };
      const tipo = String(clientPromoSelected.tipo || '').toLowerCase();
      if (tipo === '2x1') {
        const d = Math.min(cartTotal, compute2x1Discount());
        return { discount: d, finalTotal: Math.max(0, cartTotal - d) };
      }
      if (tipo === 'descuento') {
        const pct = Math.min(100, Math.max(0, Number(clientPromoSelected.descuento || 0)));
        const d = Math.min(cartTotal, (cartTotal * pct) / 100);
        return { discount: d, finalTotal: Math.max(0, cartTotal - d) };
      }
      // regalo/envio_gratis/puntos/otro -> no cambia total (solo anotación)
      return { discount: 0, finalTotal: cartTotal };
    }
    return { discount: 0, finalTotal: cartTotal };
  }, [promoMode, cartTotal, appliedPromo, clientPromoSelected, compute2x1Discount]);

  const finalTotal = effectiveCalc.finalTotal;
  const discountAmount = effectiveCalc.discount;

  const cartCount = useMemo(
    () => cart.reduce((sum, ci) => sum + ci.quantity, 0),
    [cart],
  );

  const changeAmount = useMemo(() => {
    const given = parseFloat(cashGiven.replace(',', '.'));
    if (isNaN(given) || given < finalTotal) return null;
    return given - finalTotal;
  }, [cashGiven, finalTotal]);

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
    toast.success(`Código aplicado: ${found.code}`);
  }, [promoCodeInput]);

  const clearPromoCode = useCallback(() => {
    setAppliedPromo(null);
    setPromoCodeInput('');
    if (promoMode === 'code') setPromoMode('none');
  }, [promoMode]);

  const isStepReachable = useCallback(
    (step: Step) => {
      if (step === 'client') return true;
      if (step === 'delivery') return !!selectedClient;
      if (step === 'products') return !!selectedClient && !!deliveryType;
      if (step === 'payment') return !!selectedClient && !!deliveryType && cart.length > 0;
      return false;
    },
    [selectedClient, deliveryType, cart.length],
  );

  const orderReady =
    !!effectiveOrderTakerId &&
    !!selectedClient &&
    !!deliveryType &&
    cart.length > 0 &&
    (deliveryType !== 'domicilio' || !!selectedAddressId);

  const canSubmit = orderReady && !!paymentMethod;
  const isProductsFocus = currentStep === 'products' && isStepReachable('products');

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
        ...(comboTarget.initial ?? EMPTY_CART_CUSTOMIZATION),
        comboSelections: selections,
      };
      const { item, lineId } = comboTarget;
      setComboTarget(null);
      setCustomizeTarget({ item, lineId, initial: customization });
    },
    [comboTarget],
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
          ? { ...ci, customization: { ...ci.customization, notes: notes.trim() } }
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
      setSelectedSectionId(defaultTpvSectionId(catalogSections));
    }
    setPaymentMethod(null);
    setCashGiven('');
    setOrderNotes('');
    setInitialStatus('nuevo');
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoMode('none');
    setClientPromos([]);
    setSelectedClientPromoId('');
  }, [clearSelection, catalogSections]);

  const goToPreviousStep = useCallback(() => {
    const order: Step[] = ['client', 'delivery', 'products', 'payment'];
    const idx = order.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(order[idx - 1]);
    }
  }, [currentStep]);

  // ─── Client selection ─────────────────────────────────────────────────────
  const handleSelectClient = useCallback(
    (client: Client) => {
      selectClient(client);
      setShowCreateForm(false);
      setDuplicateWarning(false);
      setPaymentMethod(null);
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
      if (userId) {
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
    [selectClient, completeStep],
  );

  const clientIdFromUrl = searchParams.get('clientId');
  useEffect(() => {
    if (!clientIdFromUrl || !userId) return;
    if (appliedClientIdFromUrl.current === clientIdFromUrl) return;

    const applyClientFromUrl = (match: Parameters<typeof handleSelectClient>[0]) => {
      appliedClientIdFromUrl.current = clientIdFromUrl;
      handleSelectClient(match);
      setPhonePrefix(match.phonePrefix || '+34');
      setPhoneInput(match.phone || '');
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
    getClientDetailRequest(userId, clientIdFromUrl)
      .then((client) => {
        if (cancelled || !client) return;
        applyClientFromUrl(client);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [clientIdFromUrl, userId, clients, handleSelectClient, setSearchParams]);

  const handleCreateClient = useCallback(async () => {
    const phoneDigits = newClientPhone.replace(/\D/g, '');
    if (!newClientName.trim() || phoneDigits.length < 9 || !newClientStreet.trim()) {
      toast.error('Completa nombre, teléfono (mín. 9 dígitos) y calle');
      return;
    }
    if (isDeliveryBusiness && !newClientCity.trim()) {
      toast.error('Completa la ciudad del cliente');
      return;
    }
    if (!userId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }
    setCreatingClient(true);
    try {
      const addressId = uuidv4();
      const selectedCashier = selectedOrderTaker;
      const primaryBranchId = currentBusiness?.branches?.[0]?.branch_id || '';
      const clientData: Omit<Client, 'id' | 'createdAt'> = {
        type: 'client',
        user_id: userId,
        ...(businessId ? { businessId, business_id: businessId } : {}),
        clientType: 'particular',
        name: newClientName.trim(),
        phone: newClientPhone.replace(/\D/g, '') || newClientPhone.trim(),
        phonePrefix,
        email: '',
        status: 'active' as const,
        responsible: selectedCashier?.name || user?.fullName || user?.firstName || 'TPV',
        branch_id: primaryBranchId,
        tags: ['tpv'],
        address: newClientStreet.trim(),
        city: isDeliveryBusiness ? newClientCity.trim() : '',
        notes: newClientNotes.trim(),
        consents: { dataProcessing: false, commercial: false, thirdParty: false },
        defaultPaymentMethod: (newClientPayment || '') as Client['defaultPaymentMethod'],
        addresses: [
          {
            id: addressId,
            label: 'Casa',
            street: newClientStreet.trim(),
            city: isDeliveryBusiness ? newClientCity.trim() : undefined,
            isPrimary: true,
            usageCount: 0,
            lastUsedAt: null,
          },
        ],
        stats: {
          totalOrders: 0,
          lastOrderDate: null,
          orderFrequencyDays: 0,
          favoriteAddressId: null,
          totalSpent: 0,
          createdFrom: 'tpv' as const,
        },
      };
      const created = await addClient(clientData);
      if (!created) {
        toast.error('No se pudo crear el cliente. Inténtalo de nuevo.');
        return;
      }
      toast.success('Cliente creado');
      setShowCreateForm(false);
      setNewClientName('');
      setNewClientStreet('');
      setNewClientCity('');
      setNewClientNotes('');
      setNewClientPayment('');
      setNewClientPhone('');
      setPhoneInput(created.phone || phoneDigits);
      setPhonePrefix(created.phonePrefix || phonePrefix);
      handleSelectClient(created);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear cliente');
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
    async (status: DeliveryOrderStatus, methodOverride?: PaymentMethod) => {
      if (!selectedClient || !deliveryType || cart.length === 0) return;
      if (!register || !isTpvRegisterSessionOpen(register.session)) {
        toast.error('Abre la caja de la tienda para cobrar y enviar');
        return;
      }

      if (deliveryType === 'domicilio' && !selectedAddressId) {
        setAddressWarning(true);
        return;
      }
      const method = methodOverride || paymentMethod;
      if (!method) return;

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

      const collectOnDelivery = deliveryType === 'domicilio';

      setSubmitting(true);
      try {
        const items: DeliveryOrderItem[] = cart.map((ci) => {
          const unitPrice = cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization);
          return {
            id: ci.lineId,
            name: ci.catalogItem.name,
            quantity: ci.quantity,
            unitPrice,
            total: cartLineTotal(ci.catalogItem.unitPrice, ci.quantity, ci.customization),
            notes: ci.customization.notes || undefined,
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

        const selectedAddr = resolveClientDeliveryAddresses(selectedClient).find(
          (a) => a.id === selectedAddressId,
        );

        const promoNote = (() => {
          if (promoMode === 'code' && appliedPromo) {
            return `Promo (código): ${appliedPromo.code} (${appliedPromo.name}) · -${formatPrice(discountAmount)}`;
          }
          if (promoMode === 'client' && clientPromoSelected) {
            return `Promo (cliente): ${clientPromoSelected.nombre} (${clientPromoSelected.tipo}) · -${formatPrice(discountAmount)}`;
          }
          return '';
        })();

        const pdvId = String(register.session?.pointOfSaleId || '').trim();
        const pdvName = String(register.session?.pointOfSaleName || '').trim();
        const takerId = effectiveOrderTakerId;
        const takerName = selectedOrderTaker?.name || user?.fullName || 'TPV';

        const submitStatus: DeliveryOrderStatus = tabletMode ? 'listo' : status;
        const now = new Date().toISOString();

        const orderData: Partial<DeliveryOrder> = {
          clientId: selectedClient.id,
          customerName: selectedClient.name,
          customerPhone: `${selectedClient.phonePrefix || phonePrefix} ${selectedClient.phone}`,
          customerEmail: selectedClient.email || '',
          customerAddress: [selectedAddr?.street || selectedClient.address || '', selectedAddr?.city || selectedClient.city || '']
            .map((s) => String(s || '').trim())
            .filter(Boolean)
            .join(', ') || '',
          deliveryType,
          channel: 'tpv',
          status: submitStatus,
          ...(tabletMode ? { assemblyStartedAt: now, kitchenCompletedAt: now } : {}),
          salesPointId: pdvId,
          salesPointName: pdvName,
          takenBy: takerId || user?.user_id || user?.id || '',
          takenByName: takerName,
          items,
          totalAmount: finalTotal,
          ...(discountAmount > 0 ? { discountAmount } : {}),
          notes: [orderNotes.trim(), promoNote].filter(Boolean).join('\n'),
          observations: takerName ? `Atendido por: ${takerName}` : '',
          paymentMethod: normalizeTpvPaymentMethod(method),
          paymentStatus: collectOnDelivery ? 'pending' : 'paid',
          paidAmount: collectOnDelivery ? 0 : finalTotal,
          paidAt: collectOnDelivery ? '' : now,
          paymentCollected: !collectOnDelivery,
          paymentCollectedAt: collectOnDelivery ? '' : now,
          paymentCollectedBy: collectOnDelivery ? '' : takerName,
          deliveryAddressId: selectedAddressId || '',
          priority: 'normal',
        };

        const { order: created, cajaStatus } = await createDeliveryOrderWithCajaStatus(userId, orderData);

        setCreatedOrder(created);
        if (cajaStatus && !isCajaRegistrationOk(cajaStatus)) {
          toast.success('Pedido creado, pero no quedó en caja — revisa que esté abierta');
        } else {
          toast.success('Pedido creado y registrado en caja');
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error al crear el pedido');
      } finally {
        setSubmitting(false);
      }
    },
    [selectedClient, deliveryType, cart, selectedAddressId, paymentMethod, finalTotal, orderNotes, userId, phonePrefix, register?.selectedOrderTakerId, selectedOrderTaker, appliedPromo, discountAmount, promoMode, clientPromoSelected, register?.session, user?.fullName, user?.user_id, user?.id, tabletMode, tpvBrandIngredientSelection, tpvCategoryTemplates, storeIngredients, brands],
  );

  // ─── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    appliedClientIdFromUrl.current = null;
    setCurrentStep('client');
    setCompletedSteps(new Set());
    setPhoneInput('');
    setPhonePrefix('+34');
    clearSelection();
    clearResults();
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
      setSelectedSectionId(defaultTpvSectionId(catalogSections));
    }
    setPaymentMethod(null);
    setCashGiven('');
    setOrderNotes('');
    setInitialStatus('nuevo');
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoMode('none');
    setClientPromos([]);
    setSelectedClientPromoId('');
    setCreatedOrder(null);
    setTimeout(() => phoneRef.current?.focus(), 150);
  }, [clearSelection, clearResults, catalogSections]);

  const handleCancelOrder = useCallback(() => {
    goBack();
  }, [goBack]);

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
                Pedido #{createdOrder.orderNumber || createdOrder.id.slice(-6)}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {createdOrder.customerName} · {formatPrice(createdOrder.totalAmount)}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                {createdOrder.items.length} producto{createdOrder.items.length !== 1 ? 's' : ''} ·{' '}
                {createdOrder.deliveryType === 'domicilio' ? 'Envío a domicilio' : 'Recogida en local'}
              </p>
              {createdOrder.ticketNumber && (
                <p className="text-sm font-mono text-gray-500 mt-2">Ticket {createdOrder.ticketNumber}</p>
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
              <button
                onClick={() => (tabletMode ? goBack() : navigate('/saas/delivery-ops'))}
                className="px-6 min-h-[48px] py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-manipulation"
              >
                {tabletMode ? 'Volver al tablero' : 'Ver pedido'}
              </button>
              <button
                onClick={handleReset}
                className="px-6 min-h-[48px] py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors touch-manipulation"
              >
                Crear otro pedido
              </button>
            </div>
          </div>
        </div>
      </TpvFullscreenShell>
    );
  }

  const clientSearchReady = phoneInput.trim().length >= 2;

  const needsOpenRegister =
    currentStep === 'products' || currentStep === 'payment';

  if (needsOpenRegister && !register) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Abre la caja de la tienda para cobrar y enviar el pedido.
        </p>
        <button
          type="button"
          onClick={goBack}
          className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold"
        >
          Volver
        </button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  // Acciones de caja (arqueo, incidencia, cierre…) viven en RegisterStatusBar del gate; aquí solo enlace al panel CEO.
  const tpvTopActions = register && isTpvRegisterSessionOpen(register.session) && !tabletMode ? (
    <button
      type="button"
      onClick={() => navigate('/saas/vertical/delivery/caja')}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors max-w-[55vw]"
      title={`Caja: ${register.session.pointOfSaleName ? `${register.session.pointOfSaleName} / ` : ''}${register.session.terminalName} · ${register.session.workerName}`}
    >
      <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      <span className="truncate">
        Caja: {register.session.pointOfSaleName ? `${register.session.pointOfSaleName} / ` : ''}{register.session.terminalName}
      </span>
    </button>
  ) : null;

  const footerPrimaryLabel = (() => {
    if (currentStep === 'client' && showCreateForm) {
      return creatingClient ? 'Guardando...' : 'Guardar cliente';
    }
    if (currentStep === 'client' && selectedClient) return 'Continuar';
    if (currentStep === 'client') return 'Selecciona un cliente';
    if (currentStep === 'delivery' && deliveryType === 'domicilio' && selectedAddressId) return 'Continuar';
    if (currentStep === 'products' && orderReady) return 'Continuar al pago';
    if (currentStep === 'payment' && deliveryType === 'domicilio') return 'Enviar pedido';
    if (submitting) return 'Enviando...';
    return 'Cobrar y enviar';
  })();

  const footerPrimaryDisabled = (() => {
    if (currentStep === 'client' && showCreateForm) return creatingClient;
    if (currentStep === 'client' && selectedClient) return false;
    if (currentStep === 'delivery' && deliveryType === 'domicilio' && selectedAddressId) return false;
    if (currentStep === 'products') return !orderReady || submitting;
    if (currentStep === 'payment') return !canSubmit || submitting;
    return !canSubmit || submitting;
  })();

  const handleFooterPrimary = () => {
    if (currentStep === 'client' && showCreateForm) {
      void handleCreateClient();
      return;
    }
    if (currentStep === 'client' && selectedClient) {
      completeStep('client');
      return;
    }
    if (currentStep === 'delivery' && deliveryType === 'domicilio' && selectedAddressId) {
      completeStep('delivery');
      return;
    }
    if (currentStep === 'products' && orderReady) {
      completeStep('products');
      return;
    }
    void handleSubmitOrder(tabletMode ? 'listo' : initialStatus);
  };

  const stickyFooter = (
    <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className={`w-full min-w-0 px-2 ${tabletMode ? 'py-1.5' : 'px-3 py-2 max-w-[920px] mx-auto'} ${!tabletMode && isProductsFocus ? 'max-w-[1320px] mx-auto' : ''}`}>
        <div className={`flex items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400 ${tabletMode ? 'mb-0.5' : 'mb-1.5'}`}>
          {cartCount > 0 && (
            <span className="flex items-center gap-1">
              <ShoppingCart className="w-3 h-3" />
              {cartCount}
            </span>
          )}
          {finalTotal > 0 && (
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
              {formatPrice(finalTotal)}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleCancelOrder}
            className={`px-3 rounded-lg border-2 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'px-3 py-2.5 text-sm'}`}
          >
            Cancelar pedido
          </button>
          <button
            type="button"
            onClick={goToPreviousStep}
            disabled={currentStep === 'client'}
            className={`px-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-sm' : 'px-3 py-2.5 text-sm'}`}
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={handleFooterPrimary}
            disabled={footerPrimaryDisabled}
            className={`flex-1 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation ${tabletMode ? 'min-h-[44px] py-2 text-base' : 'px-3 py-2.5 text-sm'}`}
          >
            {footerPrimaryLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <TpvFullscreenShell
      onBack={goBack}
      embedded
      tabletMode={tabletMode}
      contentFill={tabletMode && isProductsFocus}
      topSlot={tpvTopActions}
      footerSlot={stickyFooter}
      hideBack
    >
      <div className={`w-full min-w-0 ${tabletMode ? 'flex-1 min-h-0 flex flex-col pb-0 px-1' : isProductsFocus ? 'max-w-[1320px] mx-auto pb-4 px-2 md:px-4' : 'max-w-[920px] mx-auto pb-4 px-2 md:px-4'}`}>
        {!tabletMode && register && register.clockedInWorkers.length > 0 && (
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
                className="flex gap-2"
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
                role="search"
              >
                <PhonePrefixSelector value={phonePrefix} onChange={setPhonePrefix} compact />
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    ref={phoneRef}
                    id="tpv-client-search"
                    name="vertial-client-search"
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    value={phoneInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPhoneInput(value);
                      if (selectedClient) {
                        resetFlowFromClientStep();
                      } else {
                        setShowCreateForm(false);
                        setNewClientPhone('');
                        setDuplicateWarning(false);
                        setPhoneShake(false);
                      }
                    }}
                    placeholder="Ej. 612… o María García"
                    className={`${INPUT_CLASS} pl-10 ${tabletMode ? 'text-base py-2' : 'text-lg'} ${phoneShake ? 'animate-shake border-red-400 dark:border-red-500' : ''}`}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                  />
                </div>
              </form>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {clientsTotalCount >= 500
                  ? `Tienes ${clientsTotalCount.toLocaleString('es-ES')} clientes: busca por teléfono (3+ dígitos) o nombre (2+ letras). No se listan todos a la vez.`
                  : 'Busca por número (al menos 3 dígitos) o por nombre (2 letras o más).'}
              </p>
            </div>

            {searchError && (
              <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300 text-sm">
                {searchError}
              </div>
            )}

            {isSearching && (
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
              </div>
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
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {searchError
                    ? 'Revisa la conexión e inténtalo otra vez.'
                    : (!isSearching && results.length === 0 && clientSearchReady)
                      ? (isDeliveryBusiness && clientsTotalCount > 0
                        ? 'No se encontró ningún cliente en esta empresa. Si los importaste en otra, cámbiala arriba.'
                        : 'No se encontró ningún cliente')
                      : 'Si no aparece, puedes crear cliente manualmente'}
                </p>
                <button
                  onClick={() => {
                    const d = phoneInput.replace(/\D/g, '');
                    setNewClientPhone(d.length >= 6 ? phoneInput.replace(/\s+/g, ' ').trim() : '');
                    setShowCreateForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-medium text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear cliente nuevo
                </button>
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
                    placeholder="Solo números del móvil"
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Calle *</label>
                  <input value={newClientStreet} onChange={(e) => setNewClientStreet(e.target.value)} className={INPUT_CLASS} placeholder="Calle, número, piso…" />
                </div>
                {isDeliveryBusiness && (
                  <div>
                    <label className={LABEL_CLASS}>Ciudad *</label>
                    <input value={newClientCity} onChange={(e) => setNewClientCity(e.target.value)} className={INPUT_CLASS} placeholder="Ciudad" />
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
                    <option value="bizum">Bizum</option>
                    <option value="otro">Otros</option>
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

        {/* ═══════════════ STEP 2: DELIVERY TYPE ═══════════════ */}
        {currentStep === 'delivery' && isStepReachable('delivery') ? (
          <StepContainer step={2} title="Tipo de entrega" visible>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setDeliveryType('recogida');
                  completeStep('delivery');
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
                        <label className={LABEL_CLASS}>Código postal</label>
                        <input value={editAddrPostal} onChange={(e) => setEditAddrPostal(e.target.value)} className={INPUT_CLASS} />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Notas</label>
                      <input value={editAddrNotes} onChange={(e) => setEditAddrNotes(e.target.value)} className={INPUT_CLASS} placeholder="Portal, timbre..." />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingAddressId(null)}
                        className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
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
                        <label className={LABEL_CLASS}>Código postal</label>
                        <input value={newAddrPostal} onChange={(e) => setNewAddrPostal(e.target.value)} className={INPUT_CLASS} />
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
                      <button onClick={() => setShowNewAddress(false)} className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={handleSaveNewAddress} disabled={savingAddress || !newAddrStreet.trim()} className="px-5 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50">
                        {savingAddress ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                {selectedAddressId && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => completeStep('delivery')}
                      className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                      Continuar
                    </button>
                  </div>
                )}
              </div>
            )}
          </StepContainer>
        ) : null}

        {/* ═══════════════ STEP 3: PRODUCTS ═══════════════ */}
        {currentStep === 'products' && isStepReachable('products') ? (
          <StepContainer step={3} title="Productos" visible wide className={tabletMode ? 'flex-1 min-h-0 flex flex-col mb-0' : undefined}>
            <div className={tabletMode ? 'flex-1 min-h-0 flex flex-col w-full' : undefined}>
            <TpvProductPicker
              compact={tabletMode}
              sections={catalogSections}
              selectedSectionId={selectedSectionId}
              onSelectedSectionChange={setSelectedSectionId}
              loading={loadingCatalog}
              catalog={catalog}
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
                    <h4 className={`font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider ${tabletMode ? 'text-xs' : 'text-xs'}`}>
                      Pedido
                    </h4>
                    {cartCount > 0 && (
                      <span className={`font-bold tabular-nums rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 ${tabletMode ? 'text-xs px-2 py-0.5' : 'text-[10px] px-2 py-0.5'}`}>
                        {cartCount}
                      </span>
                    )}
                  </div>

                  {cart.length === 0 ? (
                    <div className={`flex-1 flex flex-col items-center justify-center text-center ${tabletMode ? 'py-6 px-2' : 'py-6 px-2'}`}>
                      <ShoppingCart className={`text-gray-300 dark:text-gray-600 mb-2 ${tabletMode ? 'w-10 h-10' : 'w-8 h-8'}`} />
                      <p className={`text-gray-400 dark:text-gray-500 ${tabletMode ? 'text-sm' : 'text-xs'}`}>Toca productos para añadir</p>
                    </div>
                  ) : (
                    <>
                      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y ${tabletMode ? 'space-y-2' : 'space-y-2.5 pr-0.5'}`}>
                        {cart.map((ci) => {
                          const lineUnit = cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization);
                          const lineTotal = cartLineTotal(ci.catalogItem.unitPrice, ci.quantity, ci.customization);
                          const extras = buildOrderExtras(ci.customization);
                          const customizable = isCustomizableCatalogItem(ci.catalogItem);
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
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums text-xs">
                                    {formatPrice(lineTotal)}
                                  </span>
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
                                  placeholder="Notas (sin cebolla, para llevar…)"
                                  className="w-full px-2 py-1 text-[10px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-gray-500"
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
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                          Promoción
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {(['none', 'code', 'client'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              disabled={mode === 'client' && clientPromos.length === 0}
                              onClick={() => setPromoMode(mode)}
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
                          ) : (
                            <>
                              <input
                                value={promoCodeInput}
                                onChange={(e) => setPromoCodeInput(e.target.value)}
                                className={`${INPUT_CLASS} uppercase h-9 py-1.5 text-xs min-w-0 flex-1`}
                                placeholder="PROMO"
                                disabled={promoMode !== 'code'}
                              />
                              {appliedPromo ? (
                                <button type="button" onClick={clearPromoCode} className="px-2 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold shrink-0">
                                  Quitar
                                </button>
                              ) : (
                                <button type="button" onClick={applyPromoCode} disabled={promoMode !== 'code'} className="px-2 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold shrink-0 disabled:opacity-50">
                                  OK
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                          <span className="font-bold tabular-nums">{formatPrice(cartTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-0.5">
                          <span className="text-gray-500 dark:text-gray-400">Descuento</span>
                          <span className={`font-bold tabular-nums ${discountAmount > 0 ? 'text-emerald-600' : ''}`}>
                            -{formatPrice(discountAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-bold text-sm">Total</span>
                          <span className="font-bold text-base tabular-nums">{formatPrice(finalTotal)}</span>
                        </div>
                        {!tabletMode && (
                        <button
                          type="button"
                          onClick={() => completeStep('products')}
                          className="w-full mt-3 min-h-[44px] py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors touch-manipulation"
                        >
                          Continuar al pago
                        </button>
                        )}
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
                <p className="mt-2 text-lg font-bold tabular-nums">{formatPrice(finalTotal)}</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { key: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                { key: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                { key: 'bizum' as const, label: 'Bizum', icon: Smartphone },
                { key: 'otro' as const, label: 'Otros', icon: Wallet },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPaymentMethod(key)}
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
            </div>

            {paymentMethod === 'efectivo' && deliveryType !== 'domicilio' && (
              <div className="mt-4 p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <label className={LABEL_CLASS}>El cliente paga con</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    placeholder={formatPrice(finalTotal)}
                    className={`${INPUT_CLASS} text-lg font-medium pr-8`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                </div>
                {changeAmount !== null && changeAmount >= 0 && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Cambio</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
                      {formatPrice(changeAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3">
              <label className={LABEL_CLASS}>Notas / Observaciones</label>
              <textarea
                rows={tabletMode ? 2 : 3}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Instrucciones especiales..."
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
          brands={brands}
          catalogItems={catalog}
          formatPrice={formatPrice}
          onClose={() => setCustomizeTarget(null)}
          onConfirm={(customization) =>
            commitCartLine(customizeTarget.item, customization, customizeTarget.lineId)
          }
        />
      )}
    </TpvFullscreenShell>
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
  /** Oculta «Volver» arriba; la salida va en el footer (Cancelar pedido). */
  hideBack?: boolean;
}) {
  const minimalHeader = tabletMode && embedded;
  const showHeader = !hideBack || !!topSlot;
  const header = showHeader ? (
    <div className="shrink-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 pt-[max(0px,env(safe-area-inset-top))]">
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
              minimalHeader
                ? 'flex-1 min-h-0 flex flex-col h-full px-1 pt-0.5'
                : `max-w-[1320px] mx-auto px-2 md:px-3 pt-1.5 ${tabletMode && contentFill ? 'flex-1 min-h-0 flex flex-col h-full' : ''}`
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
    <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 shrink-0">
        {getInitials(client.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{client.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {client.phonePrefix || '+34'} {client.phone}
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
      <button
        onClick={onSelect}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900 text-xs font-medium hover:bg-gray-800 dark:hover:bg-gray-300 transition-colors"
      >
        Seleccionar
      </button>
    </div>
  );
}
