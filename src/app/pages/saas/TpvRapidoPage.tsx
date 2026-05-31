import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PhonePrefixSelector } from '../../components/saas/PhonePrefixSelector';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useClientPhoneSearch } from '../../hooks/useClientPhoneSearch';
import {
  listCatalogItemsRequest,
  filterDeliveryOrdersRequest,
  createDeliveryOrderRequest,
  type CatalogItem,
  type DeliveryOrder,
  type DeliveryOrderItem,
  type DeliveryOrderStatus,
  type DeliveryType,
} from '../../lib/deliveryApi';
import { updateClientRequest } from '../../lib/crmApi';
import type { Client, ClientAddress } from '../../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { findActivePromotionByCode, computePromoDiscount, type AppliedPromo, getClientAppliedPromo } from '../../lib/promoCodes';
import { fetchClientPromotionsRequest, type ClientPromotion } from '../../lib/clientPromotionsApi';
import { TpvRegisterGate, useTpvRegister } from '../../components/saas/TpvRegisterGate';
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
  Package,
  Home,
  Briefcase,
  Loader2,
  Sparkles,
} from 'lucide-react';

type Step = 'client' | 'delivery' | 'products' | 'payment';
type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'otros';

interface CartItem {
  catalogItem: CatalogItem;
  quantity: number;
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

export function TpvRapidoPage() {
  return (
    <TpvRegisterGate>
      <TpvRapidoPageInner />
    </TpvRegisterGate>
  );
}

function TpvRapidoPageInner() {
  const { user } = useAuth();
  const register = useTpvRegister();
  const { addClient, clients } = useApp();
  const { currentBusiness } = useBusiness();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedClientIdFromUrl = useRef<string | null>(null);
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const isDeliveryBusiness = currentBusiness?.businessType === 'delivery';
  const [selectedCashierId, setSelectedCashierId] = useState<string>('');

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

  const { results, isSearching, selectedClient, selectClient, clearSelection, clearResults } =
    useClientPhoneSearch({
      userId,
      phone: phoneInput,
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
  const [addressWarning, setAddressWarning] = useState(false);

  // Step 3 - Products
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartShake, setCartShake] = useState(false);

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

  const cashierOptions = useMemo(() => {
    const members = currentBusiness?.members || [];
    const merged = new Map<string, { id: string; name: string; role: string }>();
    members.forEach((m) => {
      const id = String(m.user_id || '');
      if (!id) return;
      merged.set(id, {
        id,
        name: m.fullName?.trim() || m.email || 'Trabajador',
        role: m.role || 'worker',
      });
    });
    if (user?.id) {
      merged.set(user.id, {
        id: user.id,
        name: user.fullName?.trim() || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Gerente',
        role: String((user as Record<string, unknown>).role || 'admin'),
      });
    }
    return Array.from(merged.values());
  }, [currentBusiness?.members, user]);

  useEffect(() => {
    if (!selectedCashierId && cashierOptions.length > 0) {
      const manager = cashierOptions.find((c) => ['admin', 'owner', 'manager', 'gerente'].includes(c.role.toLowerCase()));
      setSelectedCashierId(manager?.id || cashierOptions[0].id);
    }
  }, [cashierOptions, selectedCashierId]);

  useEffect(() => {
    try {
      const cashier = cashierOptions.find((c) => c.id === selectedCashierId);
      const name = cashier?.name?.trim() || '';
      if (name) localStorage.setItem('vertial.tpvRapido.cashierName', name);
    } catch { /* ignore */ }
  }, [cashierOptions, selectedCashierId]);

  // ─── Load catalog ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadingCatalog(true);
    listCatalogItemsRequest(userId, 'catalog')
      .then((items) => {
        if (!cancelled) setCatalog(items);
      })
      .catch(() => {
        if (!cancelled) toast.error('Error al cargar el catálogo');
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const [recentOrdersPool, setRecentOrdersPool] = useState<DeliveryOrder[]>([]);

  useEffect(() => {
    if (!userId) {
      setRecentOrdersPool([]);
      return;
    }
    const pdvId = String(register.session?.pointOfSaleId || '').trim();
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
  }, [userId, register.session?.pointOfSaleId]);

  // ─── Autofocus phone on mount or reset ─────────────────────────────────────
  useEffect(() => {
    if (currentStep === 'client' && !selectedClient && !createdOrder) {
      setTimeout(() => phoneRef.current?.focus(), 100);
    }
  }, [currentStep, selectedClient, createdOrder]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set<string>();
    catalog.forEach((item) => { if (item.category) cats.add(item.category); });
    return Array.from(cats).sort();
  }, [catalog]);

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

  const filteredProducts = useMemo(() => {
    let items = catalog.filter((i) => i.itemType === 'product' || i.itemType === 'combo');
    if (selectedCategory) items = items.filter((i) => i.category === selectedCategory);
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q),
      );
    }
    return items.sort((a, b) => {
      const pricedA = Number(a.unitPrice || 0) > 0 ? 1 : 0;
      const pricedB = Number(b.unitPrice || 0) > 0 ? 1 : 0;
      if (pricedA !== pricedB) return pricedB - pricedA;
      return (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0);
    });
  }, [catalog, selectedCategory, productSearch, clientProductScores]);

  const hasPricedProducts = useMemo(
    () => catalog.some((item) => Number(item.unitPrice || 0) > 0),
    [catalog],
  );

  const habitualProducts = useMemo(
    () =>
      filteredProducts
        .filter((p) => (clientProductScores[p._id] || 0) > 0)
        .slice(0, 6),
    [filteredProducts, clientProductScores],
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
    () => cart.reduce((sum, ci) => sum + ci.catalogItem.unitPrice * ci.quantity, 0),
    [cart],
  );

  const clientPromoSelected = useMemo(() => {
    if (!selectedClientPromoId) return null;
    return clientPromos.find((p) => p.id === selectedClientPromoId) || null;
  }, [clientPromos, selectedClientPromoId]);

  const compute2x1Discount = useCallback(() => {
    const unitPrices: number[] = [];
    for (const ci of cart) {
      const u = Number(ci.catalogItem.unitPrice || 0);
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

  const canSubmit =
    !!selectedCashierId &&
    !!selectedClient &&
    !!deliveryType &&
    cart.length > 0 &&
    !!paymentMethod &&
    (deliveryType !== 'domicilio' || !!selectedAddressId);
  const isProductsFocus = currentStep === 'products' && isStepReachable('products');

  // ─── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback((item: CatalogItem) => {
    if (!item.active) return;
    setCart((prev) => {
      const existing = prev.find((ci) => ci.catalogItem._id === item._id);
      if (existing) return prev.map((ci) => ci.catalogItem._id === item._id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, { catalogItem: item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.catalogItem._id === itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) return prev.filter((ci) => ci.catalogItem._id !== itemId);
      return prev.map((ci) => ci.catalogItem._id === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci);
    });
  }, []);

  const getCartQty = useCallback(
    (itemId: string) => cart.find((ci) => ci.catalogItem._id === itemId)?.quantity || 0,
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
    setProductSearch('');
    setSelectedCategory(null);
    setPaymentMethod(null);
    setCashGiven('');
    setOrderNotes('');
    setInitialStatus('nuevo');
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoMode('none');
    setClientPromos([]);
    setSelectedClientPromoId('');
  }, [clearSelection]);

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
      setPaymentMethod(
        (client.defaultPaymentMethod as PaymentMethod) || null,
      );
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
      const primary = client.addresses?.find((a) => a.isPrimary);
      if (primary) setSelectedAddressId(primary.id);
      completeStep('client');
    },
    [selectClient, completeStep],
  );

  const clientIdFromUrl = searchParams.get('clientId');
  useEffect(() => {
    if (!clientIdFromUrl || !userId) return;
    if (appliedClientIdFromUrl.current === clientIdFromUrl) return;
    const match = clients.find((c) => c.id === clientIdFromUrl);
    if (!match) return;
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
    setCreatingClient(true);
    try {
      const addressId = uuidv4();
      const selectedCashier = cashierOptions.find((c) => c.id === selectedCashierId);
      const primaryBranchId = currentBusiness?.branches?.[0]?.branch_id || '';
      const clientData: Omit<Client, 'id' | 'createdAt'> = {
        type: 'client',
        user_id: userId,
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
      if (created) {
        toast.success('Cliente creado');
        handleSelectClient(created);
      }
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
    cashierOptions,
    selectedCashierId,
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

  // ─── Submit order ─────────────────────────────────────────────────────────
  const handleSubmitOrder = useCallback(
    async (status: DeliveryOrderStatus) => {
      if (!selectedClient || !deliveryType || cart.length === 0) return;

      if (deliveryType === 'domicilio' && !selectedAddressId) {
        setAddressWarning(true);
        return;
      }
      if (!paymentMethod) return;

      setSubmitting(true);
      try {
        const items: DeliveryOrderItem[] = cart.map((ci) => ({
          id: uuidv4(),
          name: ci.catalogItem.name,
          quantity: ci.quantity,
          unitPrice: ci.catalogItem.unitPrice,
          total: ci.catalogItem.unitPrice * ci.quantity,
          catalogItemId: ci.catalogItem._id,
          category: ci.catalogItem.category,
          brandIds: Array.isArray(ci.catalogItem.brandIds) ? ci.catalogItem.brandIds : [],
        }));

        const selectedAddr = selectedClient.addresses?.find((a) => a.id === selectedAddressId);

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
        const cashier = cashierOptions.find((c) => c.id === selectedCashierId);

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
          status,
          salesPointId: pdvId,
          salesPointName: pdvName,
          takenBy: selectedCashierId || user?.user_id || user?.id || '',
          takenByName: cashier?.name || user?.fullName || 'TPV',
          items,
          totalAmount: finalTotal,
          notes: [orderNotes.trim(), promoNote].filter(Boolean).join('\n'),
          observations: selectedCashierId
            ? `Caja atendida por: ${cashierOptions.find((c) => c.id === selectedCashierId)?.name || selectedCashierId}`
            : '',
          paymentMethod,
          paymentStatus: paymentMethod === 'efectivo' ? 'paid' : 'pending',
          paidAmount: paymentMethod === 'efectivo' ? finalTotal : 0,
          deliveryAddressId: selectedAddressId || '',
          priority: 'normal',
        };

        const created = await createDeliveryOrderRequest(userId, orderData);

        const pm = (paymentMethod === 'efectivo' || paymentMethod === 'tarjeta' || paymentMethod === 'bizum')
          ? paymentMethod
          : 'otro';
        await register.addTransaction({
          type: 'sale',
          paymentMethod: pm as any,
          amount: Number(finalTotal || 0),
          description: `TPV rápido · ${created.customerName || selectedClient.name}`,
          orderId: created.id,
          orderNumber: created.orderNumber,
          channel: 'tpv',
          registeredBy: cashier?.name || user?.fullName || 'TPV',
          linkedDeliveryOrderId: created._id,
        });

        setCreatedOrder(created);
        toast.success('Pedido creado correctamente');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Error al crear el pedido');
      } finally {
        setSubmitting(false);
      }
    },
    [selectedClient, deliveryType, cart, selectedAddressId, paymentMethod, finalTotal, orderNotes, userId, phonePrefix, selectedCashierId, cashierOptions, appliedPromo, discountAmount, promoMode, clientPromoSelected, register.session, user?.fullName, user?.user_id, user?.id],
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
    setProductSearch('');
    setSelectedCategory(null);
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
    setSelectedCashierId((prev) => prev || cashierOptions[0]?.id || '');
    setTimeout(() => phoneRef.current?.focus(), 150);
  }, [clearSelection, clearResults, cashierOptions]);

  // ─── Success screen ───────────────────────────────────────────────────────
  if (createdOrder) {
    return (
      <TpvFullscreenShell onBack={() => navigate('/saas/delivery-ops')}>
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
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => navigate('/saas/delivery')}
                className="px-6 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Ver pedido
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <TpvFullscreenShell
      onBack={() => navigate('/saas/delivery-ops')}
      topSlot={(
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={register.requestCashCount}
              className="px-2.5 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              title="Arqueo"
            >
              Arqueo
            </button>
            <button
              type="button"
              onClick={register.requestIncident}
              className="px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              title="Incidencia"
            >
              Incidencia
            </button>
            <button
              type="button"
              onClick={register.requestClose}
              className="px-2.5 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              title="Cerrar caja"
            >
              Cerrar
            </button>
          </div>
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
        </div>
      )}
    >
      <div className={`${isProductsFocus ? 'max-w-[1320px]' : 'max-w-[920px]'} mx-auto pb-28 px-2 md:px-4`}>

        {/* ═══════════════ STEP 1: CLIENT ═══════════════ */}
        {currentStep === 'client' ? (
          <StepContainer step={1} title="Cliente" visible>
            <div className="flex flex-col gap-1">
              <label className={LABEL_CLASS}>Teléfono o nombre del cliente</label>
              <div className="flex gap-2">
                <PhonePrefixSelector value={phonePrefix} onChange={setPhonePrefix} compact />
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    ref={phoneRef}
                    type="text"
                    inputMode="search"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      resetFlowFromClientStep();
                      setShowCreateForm(false);
                      setNewClientPhone('');
                      setDuplicateWarning(false);
                      setPhoneShake(false);
                    }}
                    placeholder="Ej. 612… o María García"
                    className={`${INPUT_CLASS} pl-10 text-lg ${phoneShake ? 'animate-shake border-red-400 dark:border-red-500' : ''}`}
                    autoComplete="off"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Busca por número (al menos 3 dígitos) o por nombre (2 letras o más).
              </p>
            </div>

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
                  {(!isSearching && results.length === 0 && clientSearchReady)
                    ? 'No se encontró ningún cliente'
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
                  <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className={INPUT_CLASS} placeholder="Nombre completo" />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Teléfono *</label>
                  <input
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    type="tel"
                    inputMode="tel"
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
                  <select value={newClientPayment} onChange={(e) => setNewClientPayment(e.target.value as PaymentMethod | '')} className={INPUT_CLASS}>
                    <option value="">Sin preferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="bizum">Bizum</option>
                    <option value="otros">Otros</option>
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
                className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all ${
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
                  const primary = selectedClient?.addresses?.find((a) => a.isPrimary);
                  if (primary) setSelectedAddressId(primary.id);
                }}
                className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all ${
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

                {(selectedClient?.addresses || []).length > 0 && (
                  <div className="space-y-2">
                    {selectedClient!.addresses!.map((addr) => (
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
                            {addr.isPrimary && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">Principal</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{addr.street}</p>
                          {addr.city && <p className="text-xs text-gray-400">{addr.city} {addr.postalCode}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {!showNewAddress && (
                  <button
                    onClick={() => setShowNewAddress(true)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Añadir nueva dirección
                  </button>
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
          <StepContainer step={3} title="Productos" visible wide>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto..."
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>

            {!hasPricedProducts && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  No hay precios cargados en catálogo. Importa Excel para operar rápido.
                </p>
                <button
                  onClick={() => navigate('/saas/catalog')}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  Importar Excel
                </button>
              </div>
            )}

            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 mt-3 scrollbar-hide">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    !selectedCategory
                      ? 'border-gray-900 dark:border-gray-300 bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Todos
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selectedCategory === cat
                        ? 'border-gray-900 dark:border-gray-300 bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {selectedClient && habitualProducts.length > 0 && (
              <div className="mt-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                  Suele pedir (historial)
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">Basado en pedidos anteriores de este cliente.</p>
                <div className="flex flex-wrap gap-2">
                  {habitualProducts.map((item) => (
                    <button
                      key={`habitual-${item._id}`}
                      onClick={() => addToCart(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span className="truncate max-w-[180px]">{item.name}</span>
                      <span className="text-[11px] opacity-80">x{clientProductScores[item._id] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cart.length > 0 && crossSellProducts.length > 0 && (
              <div className="mt-3 mb-2 rounded-xl border border-violet-200/80 dark:border-violet-800/80 bg-violet-50/90 dark:bg-violet-950/30 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-0.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Venta cruzada · suelen combinarlo
                </p>
                <p className="text-[10px] text-violet-600/90 dark:text-violet-400/90 mb-2">
                  {selectedClient?.id
                    ? 'Según tu histórico y el de otros pedidos recientes.'
                    : 'Según pedidos recientes del negocio.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {crossSellProducts.map((item) => (
                    <button
                      key={`cross-${item._id}`}
                      type="button"
                      onClick={() => addToCart(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-gray-900 text-violet-900 dark:text-violet-100 text-xs font-medium hover:bg-violet-100/80 dark:hover:bg-violet-900/40 transition-colors shadow-sm"
                    >
                      <Plus className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[160px]">{item.name}</span>
                      <span className="text-[11px] opacity-75 tabular-nums">{formatPrice(item.unitPrice)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4">
              <div>
                {loadingCatalog ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">No hay productos</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredProducts.map((item) => {
                      const qty = getCartQty(item._id);
                      const disabled = !item.active || Number(item.unitPrice || 0) <= 0;
                      return (
                        <div
                          key={item._id}
                          className={`relative rounded-2xl border-2 overflow-hidden transition-all ${
                            qty > 0
                              ? 'border-gray-900 dark:border-gray-300'
                              : 'border-gray-200 dark:border-gray-700'
                          } ${disabled ? 'opacity-60' : ''}`}
                        >
                          {disabled && (
                            <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-[10px] font-bold uppercase">
                              {Number(item.unitPrice || 0) <= 0 ? 'Sin precio' : 'Agotado'}
                            </div>
                          )}
                          <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-8 h-8 text-gray-300 dark:text-gray-500" />
                            )}
                          </div>
                          <div className="p-2.5">
                            <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                              {Number(item.unitPrice || 0) > 0 ? formatPrice(item.unitPrice) : 'Sin precio'}
                            </p>
                            <div className="flex items-center justify-between mt-1.5">
                              {qty > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => removeFromCart(item._id)}
                                    className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-5 text-center tabular-nums">{qty}</span>
                                  <button
                                    onClick={() => addToCart(item)}
                                    disabled={disabled}
                                    className="w-7 h-7 rounded-lg bg-gray-900 dark:bg-gray-200 flex items-center justify-center text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-300 transition-colors disabled:opacity-40"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(item)}
                                  disabled={disabled}
                                  className="w-full py-1.5 rounded-lg bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900 text-xs font-medium hover:bg-gray-800 dark:hover:bg-gray-300 transition-colors disabled:opacity-40"
                                >
                                  Añadir
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className={`mt-4 lg:mt-0 lg:sticky lg:top-20 h-fit p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 ${cartShake ? 'animate-shake' : ''}`}>
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Resumen</h4>
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {cart.map((ci) => (
                      <div key={ci.catalogItem._id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-gray-500 dark:text-gray-400 tabular-nums">{ci.quantity}x</span>
                          <span className="text-gray-900 dark:text-gray-100 truncate">{ci.catalogItem.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{formatPrice(ci.catalogItem.unitPrice * ci.quantity)}</span>
                          <button onClick={() => removeFromCart(ci.catalogItem._id)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => addToCart(ci.catalogItem)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Promoción
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setPromoMode('none')}
                        className={`px-2.5 h-8 rounded-full text-[11px] font-bold border transition-colors ${
                          promoMode === 'none'
                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                            : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        Ninguna
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromoMode('code')}
                        className={`px-2.5 h-8 rounded-full text-[11px] font-bold border transition-colors ${
                          promoMode === 'code'
                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                            : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        Código
                      </button>
                      <button
                        type="button"
                        disabled={clientPromos.length === 0}
                        onClick={() => setPromoMode('client')}
                        className={`px-2.5 h-8 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                          promoMode === 'client'
                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                            : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                        }`}
                        title={clientPromos.length === 0 ? 'Este cliente no tiene promociones' : 'Usar promo del cliente'}
                      >
                        Cliente
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {promoMode === 'client' ? (
                        <select
                          value={selectedClientPromoId}
                          onChange={(e) => setSelectedClientPromoId(e.target.value)}
                          className={`${INPUT_CLASS} h-10 py-2 min-w-0 flex-1`}
                        >
                          <option value="">Selecciona promo…</option>
                          {clientPromos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} ({String(p.tipo || '').toUpperCase()})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <input
                            value={promoCodeInput}
                            onChange={(e) => setPromoCodeInput(e.target.value)}
                            className={`${INPUT_CLASS} uppercase h-10 py-2 min-w-0 flex-1`}
                            placeholder="Ej. PROMO123"
                            disabled={promoMode !== 'code'}
                          />
                          {appliedPromo ? (
                            <button
                              type="button"
                              onClick={clearPromoCode}
                              className="px-3 h-10 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold hover:bg-white/70 dark:hover:bg-gray-800 transition-colors shrink-0"
                              title="Quitar código"
                            >
                              Quitar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={applyPromoCode}
                              className="px-3 h-10 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 shrink-0"
                              disabled={promoMode !== 'code'}
                            >
                              Aplicar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {promoMode === 'code' && appliedPromo && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-2 font-semibold break-words">
                        Aplicado: {appliedPromo.code}
                      </p>
                    )}
                    {promoMode === 'client' && clientPromoSelected && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-2 font-semibold break-words">
                        Aplicado: {clientPromoSelected.nombre}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Subtotal</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatPrice(cartTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Descuento</span>
                    <span className={`text-xs font-bold tabular-nums ${discountAmount > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      -{formatPrice(discountAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-bold text-gray-900 dark:text-gray-100">Total</span>
                    <span className="font-bold text-lg text-gray-900 dark:text-gray-100 tabular-nums">{formatPrice(finalTotal)}</span>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={() => completeStep('products')}
                      className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </StepContainer>
        ) : null}

        {/* ═══════════════ STEP 4: PAYMENT ═══════════════ */}
        {currentStep === 'payment' && isStepReachable('payment') ? (
          <StepContainer step={4} title="Pago y finalizar" visible>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { key: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                { key: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                { key: 'bizum' as const, label: 'Bizum', icon: Smartphone },
                { key: 'otros' as const, label: 'Otros', icon: Wallet },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setPaymentMethod(key)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    paymentMethod === key
                      ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  } ${!paymentMethod && paymentMethod !== key ? '' : ''}`}
                >
                  <Icon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
                </button>
              ))}
            </div>

            {paymentMethod === 'efectivo' && (
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

            <div className="mt-4">
              <label className={LABEL_CLASS}>Notas / Observaciones</label>
              <textarea
                rows={3}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Instrucciones especiales..."
              />
            </div>

            <div className="mt-4">
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
            </div>
          </StepContainer>
        ) : null}
      </div>

      {/* ═══════════════ STICKY FOOTER ═══════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
        <div className={`${isProductsFocus ? 'max-w-[1320px]' : 'max-w-[920px]'} mx-auto px-4 py-3`}>
          <div className="flex items-center justify-end gap-3 mb-2 text-xs text-gray-500 dark:text-gray-400">
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
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={goToPreviousStep}
              disabled={currentStep === 'client'}
              className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Atrás
            </button>
            <button
              onClick={() => handleSubmitOrder(initialStatus)}
              disabled={!canSubmit || submitting}
              className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enviando...' : 'Cobrar y enviar'}
            </button>
          </div>
        </div>
      </div>
    </TpvFullscreenShell>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepContainer({ step, title, visible, children, wide = false }: { step: number; title: string; visible: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`mb-4 transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className={`${wide ? 'pl-0' : 'pl-0'} space-y-0`}>{children}</div>
    </div>
  );
}

function TpvFullscreenShell({
  children,
  onBack,
  topSlot,
}: {
  children: ReactNode;
  onBack: () => void;
  topSlot?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950 overflow-y-auto">
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-[1320px] mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <div className="flex-1 min-w-0" />
          {topSlot}
        </div>
      </div>
      <div className="max-w-[1320px] mx-auto px-2 md:px-3 pt-2">{children}</div>
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
  const primaryAddr = client.addresses?.find((a) => a.isPrimary) || client.addresses?.[0];
  const payLabels: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    bizum: 'Bizum',
    otros: 'Otros',
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
