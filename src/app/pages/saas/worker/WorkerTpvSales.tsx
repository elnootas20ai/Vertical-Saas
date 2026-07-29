import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { useBusiness } from '../../../context/BusinessContext';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useTpv, type TpvWorker } from '../../../context/TpvContext';
import { TpvProvider } from '../../../context/TpvContext';
import { NuevoClienteModal } from '../../../components/saas/NuevoClienteModal';
import type { Client } from '../../../context/AppContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { resolveRetailOpsWriteBusinessId } from '../../../lib/tpvRegisterScope';
import {
  filterDeliveryOrdersRequest,
  listCatalogItemsRequest,
  createDeliveryOrderRequest,
  type CatalogItem,
  type DeliveryOrder,
  type DeliveryOrderItem,
} from '../../../lib/deliveryApi';
import {
  pickDefaultActivePdvId,
} from '../../../lib/deliveryOpsPdvSelection';
import { notifyDeliveryOpsLive } from '../../../lib/deliveryOpsLive';
import {
  resolvePdvIdFromStoreRef,
  filterOrdersForActivePdv,
} from '../../../lib/pdvScope';
import { listClockins, type ClockinRecord } from '../../../lib/clockinsApi';
import { foldTpvSearchText } from '../../../lib/tpvCatalogNavigation';
import type { BusinessType } from '../../../lib/businessApi';
import { useNavigate } from 'react-router';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  UserCheck,
  Receipt,
  X,
  Package,
  CheckCircle2,
  Loader2,
  DollarSign,
  ArrowDownUp,
  ArrowLeft,
  Banknote,
  CreditCard,
  Smartphone,
  Tag,
  Users,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

const MAX_ORDERS_FOR_TPV_INTEL = 160;

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

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

/** Misma fecha calendario local que `new Date()` “hoy”. */
function isSameLocalCalendarDay(iso: string | undefined, ref = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'transferencia';
const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: <Banknote className="w-4 h-4" /> },
  { id: 'tarjeta', label: 'Tarjeta', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'transferencia', label: 'Transferencia', icon: <ArrowDownUp className="w-4 h-4" /> },
];

function SalesContent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const {
    lines, activeWorker, ticketTotal, ticketCount,
    addItem, removeItem, updateQuantity, clearTicket, setActiveWorker,
  } = useTpv();

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [clockedInWorkers, setClockedInWorkers] = useState<TpvWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false);
  const [tpvClient, setTpvClient] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [recentOrdersPool, setRecentOrdersPool] = useState<DeliveryOrder[]>([]);
  useModalClose(showPaymentModal, () => setShowPaymentModal(false));
  useModalClose(showHistory, () => setShowHistory(false));

  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = currentBusiness?.business_id || '';
  const writeBusinessId = resolveRetailOpsWriteBusinessId(businessId, businesses);

  const workerPdv = useMemo(() => {
    const fromEmployment = resolvePdvIdFromStoreRef(
      activeStoreScope.pointsOfSale,
      user?.employment?.salesPointId,
    );
    if (fromEmployment.pdvId) return fromEmployment;
    const activeId = activeStoreScope.activeSalesPointId;
    if (activeId) {
      const p = activeStoreScope.pointsOfSale.find((x) => x._id === activeId);
      return { pdvId: activeId, pdvName: p?.name || null, workCenterId: p?.workCenterId || null };
    }
    return fromEmployment;
  }, [activeStoreScope.pointsOfSale, activeStoreScope.activeSalesPointId, user?.employment?.salesPointId]);

  const primaryPdvId = useMemo(
    () => pickDefaultActivePdvId(activeStoreScope.pointsOfSale.filter((p) => p.active !== false)),
    [activeStoreScope.pointsOfSale],
  );

  useEffect(() => {
    if (!dataUserId) return;
    setCatalogLoading(true);
    listCatalogItemsRequest(dataUserId)
      .then(items => setCatalog(items.filter(i => i.active)))
      .catch(() => toast.error('Error al cargar catálogo'))
      .finally(() => setCatalogLoading(false));
  }, [dataUserId]);

  useEffect(() => {
    if (!dataUserId) {
      setRecentOrdersPool([]);
      return;
    }
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    filterDeliveryOrdersRequest(dataUserId, {
      ...(workerPdv.pdvId ? { salesPointId: workerPdv.pdvId } : {}),
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
  }, [dataUserId, workerPdv.pdvId]);

  const refreshOrdersPool = useCallback(async () => {
    if (!dataUserId) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { orders } = await filterDeliveryOrdersRequest(dataUserId, {
        ...(workerPdv.pdvId ? { salesPointId: workerPdv.pdvId } : {}),
        dateFrom: `${today}T00:00:00.000Z`,
        dateTo: `${today}T23:59:59.999Z`,
        limit: MAX_ORDERS_FOR_TPV_INTEL,
      });
      setRecentOrdersPool(orders.slice(0, MAX_ORDERS_FOR_TPV_INTEL));
    } catch {
      /* mantener pool anterior */
    }
  }, [dataUserId, workerPdv.pdvId]);

  /** KPI e historial: pedidos reales canal TPV del día (local), alineados con TPV rápido gerente. */
  const todayTpvFromServer = useMemo(() => {
    const now = new Date();
    let orders = filterOrdersForActivePdv(recentOrdersPool, workerPdv.pdvId, primaryPdvId);
    orders = orders.filter(
      (o) => o.channel === 'tpv' && isSameLocalCalendarDay(o.createdAt, now),
    );
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
    const total = sorted.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    return { orders: sorted, count: sorted.length, total };
  }, [recentOrdersPool, workerPdv.pdvId, primaryPdvId]);

  useEffect(() => {
    if (!businessId) return;
    setWorkersLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    listClockins(businessId, { date: today })
      .then(records => {
        const active = records.filter((r: ClockinRecord) => r.status === 'active' || r.status === 'break');
        const workers: TpvWorker[] = active.map(r => ({ id: r.member_id, name: r.member_name }));
        const unique = Array.from(new Map(workers.map(w => [w.id, w])).values());
        setClockedInWorkers(unique);
        if (!activeWorker && unique.length > 0) setActiveWorker(unique[0]);
      })
      .catch(() => {})
      .finally(() => setWorkersLoading(false));
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => {
    const cats = new Set(catalog.map(i => i.category).filter(Boolean));
    return ['Todos', ...Array.from(cats).sort()];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let items = catalog;
    if (activeCategory && activeCategory !== 'Todos') items = items.filter(i => i.category === activeCategory);
    if (searchQuery.trim()) {
      const q = foldTpvSearchText(searchQuery);
      items = items.filter(
        (i) => foldTpvSearchText(i.name).includes(q) || foldTpvSearchText(i.sku || '').includes(q),
      );
    }
    return items;
  }, [catalog, activeCategory, searchQuery]);

  const clientProductScores = useMemo(() => {
    if (!tpvClient?.id) return {};
    const scores: Record<string, number> = {};
    recentOrdersPool
      .filter((o) => o.clientId === tpvClient.id)
      .slice(0, 60)
      .forEach((order) => {
        order.items.forEach((item: DeliveryOrderItem) => {
          const key = String(item.catalogItemId || '').trim();
          if (!key) return;
          scores[key] = (scores[key] || 0) + Number(item.quantity || 1);
        });
      });
    return scores;
  }, [recentOrdersPool, tpvClient?.id]);

  const globalCoPurchaseScores = useMemo(
    () => buildCoPurchaseScores(recentOrdersPool),
    [recentOrdersPool],
  );

  const clientCoPurchaseScores = useMemo(() => {
    if (!tpvClient?.id) return {};
    return buildCoPurchaseScores(recentOrdersPool.filter((o) => o.clientId === tpvClient.id));
  }, [recentOrdersPool, tpvClient?.id]);

  const catalogById = useMemo(() => {
    const m: Record<string, CatalogItem> = {};
    catalog.forEach((i) => {
      m[i._id] = i;
    });
    return m;
  }, [catalog]);

  const displayedCatalog = useMemo(() => {
    const priced = (i: CatalogItem) => Number(i.unitPrice || 0) > 0;
    return [...filteredCatalog].sort((a, b) => {
      const pa = priced(a) ? 1 : 0;
      const pb = priced(b) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0);
    });
  }, [filteredCatalog, clientProductScores]);

  const habitualProducts = useMemo(() => {
    return catalog
      .filter((i) => i.active && (i.itemType === 'product' || i.itemType === 'combo'))
      .filter((p) => (clientProductScores[p._id] || 0) > 0)
      .sort((a, b) => (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0))
      .slice(0, 6);
  }, [catalog, clientProductScores]);

  const crossSellProducts = useMemo(() => {
    const ticketIds = new Set(lines.map((l) => l.catalogItem._id));
    if (ticketIds.size === 0) return [];

    const merged = new Map<string, number>();
    const accumulate = (matrix: Record<string, Record<string, number>>, weight: number) => {
      for (const cid of ticketIds) {
        const row = matrix[cid];
        if (!row) continue;
        for (const [pid, n] of Object.entries(row)) {
          if (ticketIds.has(pid)) continue;
          merged.set(pid, (merged.get(pid) || 0) + n * weight);
        }
      }
    };

    accumulate(globalCoPurchaseScores, 1);
    if (tpvClient?.id) accumulate(clientCoPurchaseScores, 2.8);

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
      const ticketCategories = new Set(
        lines.map((l) => l.catalogItem.category).filter(Boolean) as string[],
      );
      for (const item of catalog) {
        if (picked.length >= 8) break;
        if (!item.category || !ticketCategories.has(item.category)) continue;
        if (ticketIds.has(item._id)) continue;
        if (!isSellable(item)) continue;
        if (picked.some((p) => p._id === item._id)) continue;
        picked.push(item);
      }
    }

    if (picked.length < 3 && tpvClient?.id) {
      for (const item of catalog) {
        if (picked.length >= 8) break;
        if ((clientProductScores[item._id] || 0) <= 0) continue;
        if (ticketIds.has(item._id)) continue;
        if (!isSellable(item)) continue;
        if (picked.some((p) => p._id === item._id)) continue;
        picked.push(item);
      }
    }

    return picked.slice(0, 8);
  }, [
    lines,
    globalCoPurchaseScores,
    clientCoPurchaseScores,
    catalogById,
    catalog,
    tpvClient?.id,
    clientProductScores,
  ]);

  const clearTicketAndClient = useCallback(() => {
    clearTicket();
    setTpvClient(null);
  }, [clearTicket]);

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : (parts[0]?.[0] || '?').toUpperCase();
  };

  const handleFinalizeSale = useCallback(() => {
    if (lines.length === 0) { toast.error('Añade productos al ticket'); return; }
    if (!activeWorker) { toast.error('Selecciona un trabajador'); return; }
    setShowPaymentModal(true);
  }, [lines, activeWorker]);

  const confirmSale = useCallback(async () => {
    if (!dataUserId || lines.length === 0) return;
    if (!workerPdv.pdvId) {
      toast.error('No hay tienda asignada. Pide al gerente que te asigne un local.');
      return;
    }
    const items: DeliveryOrderItem[] = lines.map((l) => ({
      id: l.id,
      name: l.catalogItem.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: l.total,
      catalogItemId: l.catalogItem._id,
      category: l.catalogItem.category || '',
      brandIds: Array.isArray(l.catalogItem.brandIds) ? l.catalogItem.brandIds : [],
    }));
    const workerLabel = activeWorker?.name || 'Trabajador';
    const obsParts = [`TPV trabajador · ${workerLabel}`];
    if (tpvClient?.name) obsParts.push(`Cliente: ${tpvClient.name}`);
    setSubmittingSale(true);
    try {
      await createDeliveryOrderRequest(dataUserId, {
        clientId: tpvClient?.id || '',
        customerName: tpvClient?.name || 'Mostrador',
        customerPhone: tpvClient?.phone || '',
        customerEmail: '',
        customerAddress: '',
        salesPointId: workerPdv.pdvId,
        salesPointName: workerPdv.pdvName || '',
        business_id: writeBusinessId || businessId || '',
        deliveryType: 'sala',
        channel: 'tpv',
        status: 'entregado',
        priority: 'normal',
        items,
        totalAmount: ticketTotal,
        notes: '',
        observations: obsParts.join(' · '),
        paymentMethod,
        paymentStatus: 'paid',
        paidAmount: ticketTotal,
        paidAt: new Date().toISOString(),
        stageHistory: [
          {
            status: 'entregado',
            date: new Date().toISOString(),
            user: workerLabel,
            notes: 'Venta mostrador (trabajador)',
          },
        ],
      });
      notifyDeliveryOpsLive({
        reason: 'worker_sale',
        businessId: writeBusinessId || businessId,
      });
      await refreshOrdersPool();
      toast.success(`Venta de ${formatCurrency(ticketTotal)} registrada`);
      clearTicketAndClient();
      setShowPaymentModal(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar la venta en el servidor');
    } finally {
      setSubmittingSale(false);
    }
  }, [
    dataUserId,
    lines,
    ticketTotal,
    paymentMethod,
    activeWorker,
    tpvClient,
    workerPdv,
    clearTicketAndClient,
    refreshOrdersPool,
  ]);

  const todayTotal = todayTpvFromServer.total;
  const todaySales = todayTpvFromServer.count;

  return (
    <div className="flex flex-col h-full min-h-0 lg:flex-row">
      {/* Catalog panel */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top bar */}
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/saas/worker/tasks')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Ventas</h1>
                <p className="text-xs text-gray-500">Mostrador y punto de venta</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Historial
              </button>
            </div>
          </div>

          {/* Daily stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5 text-center">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(todayTotal)}</p>
              <p className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-500">Vendido hoy</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-2.5 text-center">
              <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{todaySales}</p>
              <p className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-500">Ventas</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-2.5 text-center">
              <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{todaySales > 0 ? formatCurrency(todayTotal / todaySales) : '—'}</p>
              <p className="text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-500">Ticket medio</p>
            </div>
          </div>

          {/* Search + categories */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar producto, SKU..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat === 'Todos' ? null : cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  (cat === 'Todos' && !activeCategory) || activeCategory === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {catalogLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : displayedCatalog.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <>
            {tpvClient && habitualProducts.length > 0 && (
              <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                  Suele pedir (historial)
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">Cliente vinculado · pedidos anteriores.</p>
                <div className="flex flex-wrap gap-2">
                  {habitualProducts.map((item) => (
                    <button
                      key={`habitual-${item._id}`}
                      type="button"
                      onClick={() => addItem(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span className="truncate max-w-[140px]">{item.name}</span>
                      <span className="text-[11px] opacity-80 tabular-nums">×{clientProductScores[item._id] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lines.length > 0 && crossSellProducts.length > 0 && (
              <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-800 rounded-xl border border-violet-200/80 dark:border-violet-800/80 bg-violet-50/90 dark:bg-violet-950/30 px-3 py-3 -mx-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-0.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Venta cruzada · suelen combinarlo
                </p>
                <p className="text-[10px] text-violet-600/90 dark:text-violet-400/90 mb-2">
                  {tpvClient?.id
                    ? 'Histórico del cliente y otros pedidos recientes.'
                    : 'Pedidos recientes del negocio.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {crossSellProducts.map((item) => (
                    <button
                      key={`cross-${item._id}`}
                      type="button"
                      onClick={() => addItem(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-gray-900 text-violet-900 dark:text-violet-100 text-xs font-medium hover:bg-violet-100/80 dark:hover:bg-violet-900/40 transition-colors shadow-sm"
                    >
                      <Plus className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[120px]">{item.name}</span>
                      <span className="text-[11px] opacity-75 tabular-nums">{formatCurrency(item.unitPrice)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {displayedCatalog.map(item => {
                const inTicket = lines.find(l => l.catalogItem._id === item._id);
                return (
                  <button
                    key={item._id}
                    onClick={() => addItem(item)}
                    className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all active:scale-95 ${
                      inTicket
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 hover:shadow-md'
                    }`}
                  >
                    {inTicket && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {inTicket.quantity}
                      </span>
                    )}
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-14 h-14 rounded-lg object-cover mb-2" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2">
                        <Package className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 text-center leading-tight line-clamp-2 w-full">
                      {item.name}
                    </span>
                    <span className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-400">
                      {formatCurrency(item.unitPrice)}
                    </span>
                    {item.sku && (
                      <span className="mt-0.5 text-[10px] text-gray-400 truncate max-w-full">{item.sku}</span>
                    )}
                  </button>
                );
              })}
            </div>
            </>
          )}
        </div>

        {/* Mobile ticket toggle */}
        {ticketCount > 0 && (
          <div className="lg:hidden shrink-0 p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleFinalizeSale}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-lg"
            >
              <Receipt className="w-5 h-5" />
              Cobrar {formatCurrency(ticketTotal)} ({ticketCount} uds)
            </button>
          </div>
        )}
      </div>

      {/* Desktop ticket panel */}
      <div className="hidden lg:flex w-80 xl:w-96 flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Worker selector */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vendedor</span>
          </div>
          {workersLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : clockedInWorkers.length === 0 ? (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">No hay trabajadores fichados</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {clockedInWorkers.map(w => {
                const isActive = activeWorker?.id === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setActiveWorker(w)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-700'
                    }`}>
                      {getInitials(w.name)}
                    </span>
                    <span className="truncate max-w-[80px]">{w.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ticket lines */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingCart className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">Ticket vacío</p>
              <p className="text-xs">Selecciona productos del catálogo</p>
            </div>
          ) : (
            lines.map(line => (
              <div key={line.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{line.catalogItem.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(line.unitPrice)} x {line.quantity}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateQuantity(line.id, line.quantity - 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-red-100 text-gray-600 hover:text-red-600 transition-colors">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
                  <button onClick={() => updateQuantity(line.id, line.quantity + 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-blue-100 text-gray-600 hover:text-blue-600 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-sm font-semibold w-16 text-right">{formatCurrency(line.total)}</span>
                <button onClick={() => removeItem(line.id)} className="w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Cliente vinculado */}
        <div className="shrink-0 px-3 py-2 border-t border-gray-100 dark:border-gray-800">
          {tpvClient ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 text-xs font-bold">{tpvClient.name[0]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tpvClient.name}</p>
                  <p className="text-[10px] text-gray-400">{tpvClient.phone}</p>
                </div>
              </div>
              <button onClick={() => setTpvClient(null)} className="text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNuevoClienteModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir cliente
            </button>
          )}
        </div>

        {/* Total + actions */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{ticketCount} artículo{ticketCount !== 1 ? 's' : ''}</span>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(ticketTotal)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearTicketAndClient}
              disabled={lines.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <X className="w-4 h-4" /> Vaciar
            </button>
            <button
              onClick={handleFinalizeSale}
              disabled={lines.length === 0}
              className="flex-[2] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg"
            >
              <Receipt className="w-4 h-4" /> Cobrar {ticketTotal > 0 ? formatCurrency(ticketTotal) : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Método de pago</h2>
            <p className="text-sm text-gray-500 mb-4">Total: <span className="font-bold text-blue-600">{formatCurrency(ticketTotal)}</span></p>

            <div className="grid grid-cols-2 gap-2 mb-6">
              {PAYMENT_METHODS.map(pm => (
                <button
                  key={pm.id}
                  onClick={() => setPaymentMethod(pm.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    paymentMethod === pm.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {pm.icon}
                  <span className="text-sm font-medium">{pm.label}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmSale()}
                disabled={submittingSale}
                className="flex-[2] px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingSale ? 'Guardando…' : 'Confirmar venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl shadow-2xl w-full lg:max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ventas de hoy</h2>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {todayTpvFromServer.orders.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Sin ventas TPV registradas hoy</p>
                  <p className="text-xs mt-2 text-gray-500">Incluye ventas desde este puesto y desde TPV rápido (gerente).</p>
                </div>
              ) : (
                todayTpvFromServer.orders.map((order) => (
                  <div key={order._id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(Number(order.totalAmount || 0))}</span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-gray-400 mb-1">{order.orderNumber}</p>
                    <p className="text-xs text-gray-500">
                      {(order.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-semibold">
                        {order.paymentMethod || '—'}
                      </span>
                      {order.observations && (
                        <span className="text-[10px] text-gray-400 truncate max-w-full">{order.observations}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <NuevoClienteModal
        open={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onClientCreated={(client: Client) => {
          setTpvClient({ id: client.id, name: client.name, phone: client.phone });
          setShowNuevoClienteModal(false);
          toast.success(`Cliente "${client.name}" vinculado al ticket`);
        }}
        contexto="tpv"
        perfil="trabajador"
      />
    </div>
  );
}

export function WorkerTpvSales() {
  return (
    <TpvProvider>
      <SalesContent />
    </TpvProvider>
  );
}
