import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Banknote,
  Loader2,
  Minus,
  Package,
  Plus,
  Receipt,
  Search,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { ClockedInWorkerBubbles } from '../../../components/saas/ClockedInWorkerBubbles';
import type { TpvRegisterContextType } from '../../../components/saas/TpvRegisterGate';
import {
  createStaffConsumptionRequest,
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  type CatalogItem,
  type StaffConsumptionConfig,
  type StaffConsumptionPaymentMode,
} from '../../../lib/deliveryApi';
import {
  isCatalogItemEligibleForStaffConsumption,
  normalizeStaffConsumptionConfig,
  resolveStaffUnitPrice,
} from '../../../lib/staffConsumptionUtils';

type CartLine = {
  item: CatalogItem;
  quantity: number;
  unitPrice: number;
};

interface WorkerTpvStaffConsumptionProps {
  userId: string;
  onBack: () => void;
  register: TpvRegisterContextType;
  salesPointId?: string | null;
  salesPointName?: string | null;
}

function formatTpvPrice(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0,00\u00A0€';
  return `${n.toFixed(2).replace('.', ',')}\u00A0€`;
}

function hasStaffDiscount(staffPrice: number, publicPrice: number): boolean {
  return publicPrice > 0 && staffPrice < publicPrice - 0.004;
}

export function WorkerTpvStaffConsumption({
  userId,
  onBack,
  register,
  salesPointId,
  salesPointName,
}: WorkerTpvStaffConsumptionProps) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [staffConfig, setStaffConfig] = useState<StaffConsumptionConfig>(
    normalizeStaffConsumptionConfig(),
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMode, setPaymentMode] = useState<StaffConsumptionPaymentMode | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [items, config] = await Promise.all([
        listCatalogItemsRequest(userId, 'catalog'),
        getDeliveryConfigRequest(userId).catch(() => null),
      ]);
      setCatalog(items.filter((item) => item.active !== false));
      setStaffConfig(normalizeStaffConsumptionConfig(config?.staffConsumption));
    } catch {
      toast.error('No se pudo cargar el catálogo de consumos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedWorkerId) return;
    const selfId = String(user?.user_id || user?.id || '').trim();
    const fromClocked = register.clockedInWorkers.find((w) => w.id === selfId);
    if (fromClocked) {
      setSelectedWorkerId(fromClocked.id);
      return;
    }
    if (register.clockedInWorkers.length === 1) {
      setSelectedWorkerId(register.clockedInWorkers[0].id);
    }
  }, [register.clockedInWorkers, selectedWorkerId, user?.id, user?.user_id]);

  const eligibleProducts = useMemo(
    () => catalog.filter((item) => isCatalogItemEligibleForStaffConsumption(item, staffConfig)),
    [catalog, staffConfig],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of eligibleProducts) {
      const cat = String(item.category || '').trim();
      if (cat) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [eligibleProducts]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligibleProducts.filter((item) => {
      if (activeCategory && String(item.category || '').trim() !== activeCategory) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || String(item.category || '').toLowerCase().includes(q);
    });
  }, [eligibleProducts, search, activeCategory]);

  const selectedWorker = useMemo(
    () => register.clockedInWorkers.find((w) => w.id === selectedWorkerId) || null,
    [register.clockedInWorkers, selectedWorkerId],
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );

  const addToCart = (item: CatalogItem) => {
    const unitPrice = resolveStaffUnitPrice(item, staffConfig);
    setCart((prev) => {
      const existing = prev.find((line) => line.item._id === item._id);
      if (existing) {
        return prev.map((line) =>
          line.item._id === item._id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { item, quantity: 1, unitPrice }];
    });
    setPaymentMode(null);
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.item._id === itemId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
    setPaymentMode(null);
  };

  const handleConfirm = async () => {
    if (!selectedWorker) {
      toast.error('Selecciona quién consume');
      return;
    }
    if (cart.length === 0) {
      toast.error('Añade al menos un producto');
      return;
    }
    if (!paymentMode) {
      toast.error('Elige cómo pagar');
      return;
    }

    setSubmitting(true);
    try {
      const allStockWarnings: string[] = [];
      for (const line of cart) {
        const result = await createStaffConsumptionRequest(userId, {
          workerId: selectedWorker.id,
          workerName: selectedWorker.name,
          catalogItemId: line.item._id,
          quantity: line.quantity,
          paymentMode,
          paymentMethod: 'efectivo',
          salesPointId: salesPointId || undefined,
          salesPointName: salesPointName || undefined,
          registerSessionId: register.session?._id,
        });
        if (result.stockWarnings?.length) {
          allStockWarnings.push(...result.stockWarnings);
        }
      }
      toast.success(
        paymentMode === 'cash_now'
          ? `${formatTpvPrice(cartTotal)} cobrado y apuntado`
          : `${formatTpvPrice(cartTotal)} apuntado a nómina`,
      );
      if (allStockWarnings.length > 0) {
        toast.warning(allStockWarnings[0], { description: allStockWarnings.length > 1 ? `+${allStockWarnings.length - 1} aviso(s) de stock` : undefined });
      }
      setCart([]);
      setPaymentMode(null);
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar el consumo');
    } finally {
      setSubmitting(false);
    }
  };

  if (!staffConfig.enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[40vh] text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Los consumos de equipo están desactivados. Actívalos en Catálogo → Consumos equipo.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Consumo equipo</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Bebida, comida o menú del personal</p>
          </div>
        </div>

        <ClockedInWorkerBubbles
          workers={register.clockedInWorkers}
          selectedId={selectedWorkerId}
          onSelect={setSelectedWorkerId}
          loading={register.clockedInWorkersLoading}
          label="¿Quién consume?"
        />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-0 md:gap-4 p-4 overflow-hidden">
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar bebida, menú…"
              className="w-full pl-10 pr-3 py-2.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-3 mb-1">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  !activeCategory
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    activeCategory === cat
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-gray-500">
              <Package className="w-10 h-10 mb-3 opacity-40" />
              No hay productos habilitados para consumo de equipo.
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 overflow-y-auto pb-4">
              {filteredProducts.map((item) => {
                const staffPrice = resolveStaffUnitPrice(item, staffConfig);
                const publicPrice = Number(item.unitPrice || 0);
                const discounted = hasStaffDiscount(staffPrice, publicPrice);
                const inCart = cart.find((line) => line.item._id === item._id)?.quantity || 0;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className={`flex flex-col text-left rounded-2xl border p-3 min-h-[104px] transition-colors touch-manipulation ${
                      inCart
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-violet-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug flex-1">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1 truncate">{item.category}</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-violet-700 dark:text-violet-300 tabular-nums whitespace-nowrap">
                          {formatTpvPrice(staffPrice)}
                        </p>
                        {discounted && (
                          <p className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap mt-0.5">
                            PVP {formatTpvPrice(publicPrice)}
                          </p>
                        )}
                      </div>
                      {inCart > 0 && (
                        <span className="text-xs font-bold bg-violet-600 text-white rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                          {inCart}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 md:shrink flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden max-h-[42vh] md:max-h-none">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Tu consumo</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-gray-500">Toca un producto para añadirlo.</p>
            ) : (
              cart.map((line) => (
                <div key={line.item._id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {line.item.name}
                    </p>
                    <p className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{formatTpvPrice(line.unitPrice)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(line.item._id, -1)}
                      className="p-2 min-h-[36px] min-w-[36px] rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center touch-manipulation"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(line.item._id, 1)}
                      className="p-2 min-h-[36px] min-w-[36px] rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center touch-manipulation"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
                {formatTpvPrice(cartTotal)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setPaymentMode('cash_now')}
                className={`flex flex-col items-center gap-1.5 p-3 min-h-[72px] rounded-xl border-2 text-xs font-bold transition-colors touch-manipulation ${
                  paymentMode === 'cash_now'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Banknote className="w-5 h-5" />
                Pago ahora
              </button>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setPaymentMode('payroll_deduction')}
                className={`flex flex-col items-center gap-1.5 p-3 min-h-[72px] rounded-xl border-2 text-xs font-bold transition-colors touch-manipulation ${
                  paymentMode === 'payroll_deduction'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Wallet className="w-5 h-5" />
                Descontar nómina
              </button>
            </div>

            <button
              type="button"
              disabled={submitting || cart.length === 0 || !paymentMode || !selectedWorker}
              onClick={() => void handleConfirm()}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar consumo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
