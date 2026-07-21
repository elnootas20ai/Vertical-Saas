import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Banknote,
  Coffee,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  UserRound,
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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

  const cartUnits = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
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
          ? `${formatTpvPrice(cartTotal)} cobrado · cuenta en caja`
          : `${formatTpvPrice(cartTotal)} apuntado a nómina`,
      );
      if (allStockWarnings.length > 0) {
        toast.warning(allStockWarnings[0], {
          description: allStockWarnings.length > 1 ? `+${allStockWarnings.length - 1} aviso(s) de stock` : undefined,
        });
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

  const workerFirstName = selectedWorker?.name.split(/\s+/)[0] || '';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-gray-950">
      {/* Cabecera */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 sm:px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-600 shrink-0" />
              Consumo equipo
            </h1>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
              Apunta Coca-Cola, menú, snacks… y cuenta en caja o nómina
            </p>
          </div>
          {cartUnits > 0 && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-xs font-bold tabular-nums">
              {cartUnits} ud · {formatTpvPrice(cartTotal)}
            </span>
          )}
        </div>

        {/* Paso 1: quién */}
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-2">
            <UserRound className="w-3.5 h-3.5" />
            1 · ¿Quién consume?
          </div>
          <ClockedInWorkerBubbles
            workers={register.clockedInWorkers}
            selectedId={selectedWorkerId}
            onSelect={setSelectedWorkerId}
            loading={register.clockedInWorkersLoading}
            label=""
            emptyHint="Nadie fichado en esta tienda. Ficha primero para apuntar un consumo."
          />
        </div>
      </div>

      {/* Cuerpo: productos + carrito */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Productos */}
        <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-4 overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
            2 · Elige productos
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar Coca-Cola, agua, menú…"
              className="w-full pl-10 pr-3 py-3 min-h-[48px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-1 -mx-0.5 px-0.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold touch-manipulation ${
                  !activeCategory
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                }`}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold touch-manipulation ${
                    activeCategory === cat
                      ? 'bg-amber-600 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
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
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-gray-500 px-4">
              <Package className="w-10 h-10 mb-3 opacity-40" />
              No hay productos para consumo. En Catálogo → Consumos equipo elige las categorías (Bebidas, etc.).
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto pb-4 flex-1 min-h-0 content-start">
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
                    className={`flex flex-col text-left rounded-2xl border-2 p-3 min-h-[112px] transition-colors touch-manipulation active:scale-[0.98] ${
                      inCart
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 shadow-sm'
                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-amber-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug flex-1">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 truncate">{item.category || '—'}</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-black text-amber-700 dark:text-amber-300 tabular-nums">
                          {formatTpvPrice(staffPrice)}
                        </p>
                        {discounted && (
                          <p className="text-[10px] text-gray-400 line-through tabular-nums">
                            {formatTpvPrice(publicPrice)}
                          </p>
                        )}
                      </div>
                      {inCart > 0 ? (
                        <span className="text-xs font-black bg-amber-600 text-white rounded-full min-w-[1.75rem] h-7 px-1.5 flex items-center justify-center shrink-0">
                          {inCart}
                        </span>
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                          <Plus className="w-4 h-4 text-gray-500" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrito + pago (sticky en móvil) */}
        <div className="shrink-0 lg:w-[340px] lg:border-l border-t lg:border-t-0 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col max-h-[46vh] lg:max-h-none shadow-[0_-8px_24px_rgba(0,0,0,0.06)] lg:shadow-none">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">3 · Confirmar</p>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">
              {selectedWorker
                ? `Consumo de ${workerFirstName}`
                : 'Selecciona trabajador arriba'}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
            {cart.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Toca un producto (Coca-Cola, menú…) para apuntarlo.
              </p>
            ) : (
              cart.map((line) => (
                <div
                  key={line.item._id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {line.item.name}
                    </p>
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      {formatTpvPrice(line.unitPrice)} · {formatTpvPrice(line.unitPrice * line.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(line.item._id, -1)}
                      className="p-2 min-h-[40px] min-w-[40px] rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center touch-manipulation"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-black tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(line.item._id, 1)}
                      className="p-2 min-h-[40px] min-w-[40px] rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center touch-manipulation"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 p-3 sm:p-4 space-y-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total</span>
              <span className="text-2xl font-black text-gray-900 dark:text-gray-100 tabular-nums">
                {formatTpvPrice(cartTotal)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setPaymentMode('cash_now')}
                className={`flex flex-col items-center justify-center gap-1 p-3 min-h-[76px] rounded-2xl border-2 text-xs font-bold transition-colors touch-manipulation ${
                  paymentMode === 'cash_now'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Banknote className="w-5 h-5" />
                Paga ahora
                <span className="text-[9px] font-semibold opacity-80">Entra en caja</span>
              </button>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setPaymentMode('payroll_deduction')}
                className={`flex flex-col items-center justify-center gap-1 p-3 min-h-[76px] rounded-2xl border-2 text-xs font-bold transition-colors touch-manipulation ${
                  paymentMode === 'payroll_deduction'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Wallet className="w-5 h-5" />
                A nómina
                <span className="text-[9px] font-semibold opacity-80">Se descuenta luego</span>
              </button>
            </div>

            {paymentMode === 'cash_now' && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 text-center font-medium">
                Este importe se suma al efectivo del cierre de caja.
              </p>
            )}
            {paymentMode === 'payroll_deduction' && (
              <p className="text-[11px] text-sky-700 dark:text-sky-300 text-center font-medium">
                Queda apuntado; no mueve el efectivo de la caja.
              </p>
            )}

            <button
              type="button"
              disabled={submitting || cart.length === 0 || !paymentMode || !selectedWorker}
              onClick={() => void handleConfirm()}
              className="w-full py-3.5 min-h-[52px] rounded-2xl bg-amber-600 hover:bg-amber-700 disabled:opacity-45 text-white font-black text-sm flex items-center justify-center gap-2 touch-manipulation shadow-lg shadow-amber-900/20"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {!selectedWorker
                ? 'Elige trabajador'
                : !paymentMode
                  ? 'Elige cómo pagar'
                  : cart.length === 0
                    ? 'Añade productos'
                    : `Apuntar ${formatTpvPrice(cartTotal)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
