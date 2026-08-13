/**
 * Tablero KDS de cocina (comandas sala).
 * Usado en la página CEO `/saas/cocina` y embebido en el TPV (sin salir del gate).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { useSSE } from '../../hooks/useSSE';
import {
  listDiningOrdersRequest,
  updateComandaStatusRequest,
  type ComandaStatus,
  type DiningOrder,
} from '../../lib/salaApi';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import { printDeliveryTicket } from '../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom } from '../../lib/deliveryTicketHelpers';
import {
  buildKitchenTickets,
  kitchenTicketMinutes,
  nextKitchenStatus,
  type KitchenTicket,
} from './restaurantKitchen';
import { setCatalogItemAvailabilityRequest } from '../../lib/deliveryApi';
import { DELIVERY_CATALOG_CHANGED } from '../../lib/deliverySetup';
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  MessageSquare,
  Printer,
  RefreshCw,
  Timer,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Ban,
  ArrowLeft,
} from 'lucide-react';

const OVERTIME_MINUTES = 20;
const SOUND_KEY = 'restaurant_kds_sound';

const ACTION_LABELS: Partial<Record<ComandaStatus, { label: string; color: string }>> = {
  in_preparation: { label: 'Empezar', color: 'bg-orange-600 hover:bg-orange-700' },
  ready: { label: '✓ Lista', color: 'bg-green-600 hover:bg-green-700' },
  served: { label: 'Servida', color: 'bg-gray-700 hover:bg-gray-800' },
};

const STATUS_TOAST_LABELS: Partial<Record<ComandaStatus, string>> = {
  in_preparation: 'en preparación',
  ready: 'lista',
  served: 'servida',
};

function formatElapsed(mins: number): string {
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

function timerColor(mins: number): string {
  if (mins < 10) return 'text-green-600';
  if (mins < OVERTIME_MINUTES) return 'text-amber-600';
  return 'text-red-600';
}

function ticketTableLabel(ticket: KitchenTicket): string {
  return ticket.tableName || (ticket.tableNumber ? `Mesa ${ticket.tableNumber}` : 'Mostrador');
}

function KitchenTicketCard({
  ticket,
  now,
  onAdvance,
  onPrint,
  onMarkOutOfStock,
  acting,
  oosBusyId,
}: {
  ticket: KitchenTicket;
  now: number;
  onAdvance: (ticket: KitchenTicket, next: ComandaStatus) => void;
  onPrint: (ticket: KitchenTicket) => void;
  onMarkOutOfStock: (productId: string, name: string) => void;
  acting: boolean;
  oosBusyId: string | null;
}) {
  const mins = kitchenTicketMinutes(ticket, now);
  const isOvertime = ticket.status !== 'ready' && mins > OVERTIME_MINUTES;
  const next = nextKitchenStatus(ticket.status);
  const action = next ? ACTION_LABELS[next] : null;
  const totalUnits = ticket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      className={`rounded-2xl border-2 p-3.5 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${
        isOvertime ? 'ring-2 ring-red-300' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100">
            <UtensilsCrossed className="w-4 h-4 text-stone-500 shrink-0" />
            <span className="truncate">{ticketTableLabel(ticket)}</span>
          </span>
          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-semibold rounded-full">
            Comanda #{ticket.comandaNumber || '—'}
          </span>
          {ticket.zone && (
            <span className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 text-[10px] font-medium rounded-full">
              {ticket.zone}
            </span>
          )}
          {isOvertime && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full animate-pulse">
              <Flame className="w-3 h-3" /> RETRASO
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1 text-base font-bold tabular-nums shrink-0 ${timerColor(mins)}`}>
          <Timer className="w-4 h-4" />
          {formatElapsed(mins)}
        </div>
      </div>

      {ticket.createdByName && (
        <p className="text-xs text-gray-500 mb-2">Comanda de {ticket.createdByName}</p>
      )}

      <div className="mb-2 space-y-1">
        {ticket.items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">
              {item.quantity}x
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm text-gray-800 dark:text-gray-200">{item.name}</span>
              {item.modifiers.length > 0 && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  + {item.modifiers.join(', ')}
                </p>
              )}
              {item.notes && (
                <p className="text-xs text-amber-600 dark:text-amber-400 italic">{item.notes}</p>
              )}
            </div>
            {item.productId ? (
              <button
                type="button"
                title="Marcar agotado en carta"
                disabled={oosBusyId === item.productId}
                onClick={() => onMarkOutOfStock(item.productId, item.name)}
                className="shrink-0 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
              >
                {oosBusyId === item.productId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Ban className="w-3.5 h-3.5" />}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {ticket.notes && (
        <div className="flex items-start gap-1.5 mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">{ticket.notes}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/60 dark:border-gray-600/30">
        <span className="text-xs text-gray-500">{totalUnits} uds</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPrint(ticket)}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Imprimir comanda"
          >
            <Printer className="w-4 h-4" />
          </button>
          {next && action && (
            <button
              type="button"
              onClick={() => onAdvance(ticket, next)}
              disabled={acting}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 shadow-sm ${action.color}`}
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KitchenColumn({
  title,
  icon,
  color,
  tickets,
  now,
  onAdvance,
  onPrint,
  onMarkOutOfStock,
  actingKey,
  oosBusyId,
  emptyLabel,
}: {
  title: string;
  icon: ReactNode;
  color: string;
  tickets: KitchenTicket[];
  now: number;
  onAdvance: (ticket: KitchenTicket, next: ComandaStatus) => void;
  onPrint: (ticket: KitchenTicket) => void;
  onMarkOutOfStock: (productId: string, name: string) => void;
  actingKey: string | null;
  oosBusyId: string | null;
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-t-2xl ${color}`}>
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="ml-auto flex items-center justify-center w-7 h-7 rounded-full bg-white/80 dark:bg-gray-800/80 text-sm font-bold text-gray-900 dark:text-gray-100">
          {tickets.length}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300 dark:text-gray-600">
            <CheckCircle2 className="w-8 h-8 mb-2" />
            <p className="text-xs font-medium">{emptyLabel}</p>
          </div>
        ) : (
          tickets.map((t) => (
            <KitchenTicketCard
              key={t.key}
              ticket={t}
              now={now}
              onAdvance={onAdvance}
              onPrint={onPrint}
              onMarkOutOfStock={onMarkOutOfStock}
              acting={actingKey === t.key}
              oosBusyId={oosBusyId}
            />
          ))
        )}
      </div>
    </div>
  );
}

type MobileTab = 'nuevas' | 'preparacion' | 'listas';

export type RestaurantKitchenBoardProps = {
  className?: string;
  /** Volver al plano TPV (panel embebido). */
  onBack?: () => void;
  /** En página CEO: botón Mesas → `/saas/caja/tpv`. */
  showMesasNav?: boolean;
};

export function RestaurantKitchenBoard({
  className = '',
  onBack,
  showMesasNav = false,
}: RestaurantKitchenBoardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const authUserId = user?.user_id || user?.id || null;
  const scopeBusinessId = resolveBusinessScopeId(currentBusiness);

  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [oosBusyId, setOosBusyId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('nuevas');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  });
  const [now, setNow] = useState(Date.now());

  const prevNewCountRef = useRef<number | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch { /* ignore */ }
  }, [soundEnabled]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(iv);
  }, []);

  const playNewComandaSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* audio no disponible */ }
  }, []);

  const loadOrders = useCallback(async () => {
    if (!userId || !isRestaurant) return;
    const today = localCalendarDayKey();
    try {
      const data = await listDiningOrdersRequest(userId, {
        dateFrom: `${today}T00:00:00.000Z`,
      });
      setOrders(data);
      const newCount = buildKitchenTickets(data, scopeBusinessId)
        .filter((t) => t.status === 'sent_to_kitchen').length;
      if (
        prevNewCountRef.current !== null &&
        newCount > prevNewCountRef.current &&
        soundEnabledRef.current
      ) {
        playNewComandaSound();
      }
      prevNewCountRef.current = newCount;
    } catch {
      toast.error('Error al cargar comandas');
    } finally {
      setLoading(false);
    }
  }, [userId, isRestaurant, scopeBusinessId, playNewComandaSound]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const sseHandlers = useMemo(
    () => ({
      'sala:comanda_sent': () => loadOrders(),
      'sala:comanda_status_changed': () => loadOrders(),
      'sala:comanda_cancelled': () => loadOrders(),
      'sala:order_created': () => loadOrders(),
      'sala:order_updated': () => loadOrders(),
      'sala:order_closed': () => loadOrders(),
      'sala:order_cancelled': () => loadOrders(),
    }),
    [loadOrders],
  );

  useSSE({
    userId: authUserId,
    businessId: currentBusiness?.business_id || null,
    handlers: sseHandlers,
    enabled: Boolean(authUserId && userId && isRestaurant),
  });

  useEffect(() => {
    if (!userId || !isRestaurant) return;
    const iv = setInterval(() => { void loadOrders(); }, 20_000);
    return () => clearInterval(iv);
  }, [userId, isRestaurant, loadOrders]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void loadOrders(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadOrders]);

  const printComanda = useCallback((ticket: KitchenTicket) => {
    if (!currentBusiness) {
      toast.error('No hay empresa activa para imprimir');
      return;
    }
    void printDeliveryTicket({
      order: {
        _id: ticket.orderId,
        orderNumber: ticket.comandaNumber ? String(ticket.comandaNumber) : '',
        customerName: ticketTableLabel(ticket),
        items: ticket.items.map((item) => ({
          quantity: item.quantity,
          name: item.name,
          total: 0,
          notes: item.notes,
        })),
        notes: ticket.notes,
        createdAt: ticket.sentToKitchenAt || new Date().toISOString(),
        takenByName: ticket.createdByName,
      },
      business: businessTicketInfoFrom(currentBusiness),
      cashierName: ticket.createdByName,
      variant: 'kitchen',
    });
  }, [currentBusiness]);

  const markOutOfStock = useCallback(async (productId: string, name: string) => {
    if (!userId || !productId) return;
    if (!window.confirm(`¿Marcar «${name}» como agotado en la carta?`)) return;
    setOosBusyId(productId);
    try {
      await setCatalogItemAvailabilityRequest(userId, productId, false);
      try {
        window.dispatchEvent(new CustomEvent(DELIVERY_CATALOG_CHANGED));
      } catch { /* ignore */ }
      toast.success(`«${name}» agotado en carta`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar agotado');
    } finally {
      setOosBusyId(null);
    }
  }, [userId]);

  const advanceComanda = useCallback(async (ticket: KitchenTicket, next: ComandaStatus) => {
    if (!userId) return;
    setActingKey(ticket.key);
    try {
      const updated = await updateComandaStatusRequest(userId, ticket.orderId, ticket.comandaId, next);
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
      toast.success(`${ticketTableLabel(ticket)} · comanda ${STATUS_TOAST_LABELS[next] || next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar la comanda');
    } finally {
      setActingKey(null);
    }
  }, [userId]);

  const tickets = useMemo(
    () => buildKitchenTickets(orders, scopeBusinessId),
    [orders, scopeBusinessId],
  );
  const colNew = useMemo(() => tickets.filter((t) => t.status === 'sent_to_kitchen'), [tickets]);
  const colPrep = useMemo(() => tickets.filter((t) => t.status === 'in_preparation'), [tickets]);
  const colReady = useMemo(
    () => tickets.filter((t) => t.status === 'ready').reverse(),
    [tickets],
  );

  const overtimeCount = useMemo(
    () => [...colNew, ...colPrep].filter((t) => kitchenTicketMinutes(t, now) > OVERTIME_MINUTES).length,
    [colNew, colPrep, now],
  );

  const mobileTickets = mobileTab === 'nuevas' ? colNew : mobileTab === 'preparacion' ? colPrep : colReady;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (showMesasNav) {
      navigate('/saas/caja/tpv');
    }
  };

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {overtimeCount > 0 && (
        <div className="shrink-0 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            {overtimeCount} comanda(s) fuera de tiempo (más de {OVERTIME_MINUTES} min)
          </p>
        </div>
      )}

      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {onBack || showMesasNav ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
              title="Volver a mesas"
            >
              {onBack ? <ArrowLeft className="w-3.5 h-3.5" /> : <UtensilsCrossed className="w-3.5 h-3.5" />}
              Mesas
            </button>
          ) : null}
          <div className="grid grid-cols-3 gap-2 flex-1">
            {[
              { label: 'Nuevas', value: colNew.length, bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'En preparación', value: colPrep.length, bg: 'bg-orange-50 text-orange-700 border-orange-200' },
              { label: 'Listas', value: colReady.length, bg: 'bg-green-50 text-green-700 border-green-200' },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border p-2 text-center ${s.bg}`}>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-400 hover:bg-gray-100'}`}
              title={soundEnabled ? 'Silenciar aviso de comanda nueva' : 'Activar sonido'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => { setLoading(true); void loadOrders(); }}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refrescar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="md:hidden shrink-0 flex gap-1 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'nuevas' as const, label: 'Nuevas', count: colNew.length },
          { id: 'preparacion' as const, label: 'Preparación', count: colPrep.length },
          { id: 'listas' as const, label: 'Listas', count: colReady.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              mobileTab === tab.id
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {tab.label}
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              mobileTab === tab.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          <div className="hidden md:flex flex-1 min-h-0 gap-4 p-4">
            <KitchenColumn
              title="Nuevas"
              icon={<Clock className="w-4 h-4 text-amber-700" />}
              color="bg-amber-100/80 text-amber-800"
              tickets={colNew}
              now={now}
              onAdvance={advanceComanda}
              onPrint={printComanda}
              onMarkOutOfStock={markOutOfStock}
              actingKey={actingKey}
              oosBusyId={oosBusyId}
              emptyLabel="Sin comandas nuevas"
            />
            <KitchenColumn
              title="En preparación"
              icon={<ChefHat className="w-4 h-4 text-orange-700" />}
              color="bg-orange-100/80 text-orange-800"
              tickets={colPrep}
              now={now}
              onAdvance={advanceComanda}
              onPrint={printComanda}
              onMarkOutOfStock={markOutOfStock}
              actingKey={actingKey}
              oosBusyId={oosBusyId}
              emptyLabel="Nada en los fogones"
            />
            <KitchenColumn
              title="Listas"
              icon={<CheckCircle2 className="w-4 h-4 text-green-700" />}
              color="bg-green-100/80 text-green-800"
              tickets={colReady}
              now={now}
              onAdvance={advanceComanda}
              onPrint={printComanda}
              onMarkOutOfStock={markOutOfStock}
              actingKey={actingKey}
              oosBusyId={oosBusyId}
              emptyLabel="Sin comandas listas"
            />
          </div>

          <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-4">
            {mobileTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ChefHat className="w-12 h-12 mb-3 text-gray-300" />
                <p className="text-sm font-medium">Sin comandas en esta sección</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mobileTickets.map((t) => (
                  <KitchenTicketCard
                    key={t.key}
                    ticket={t}
                    now={now}
                    onAdvance={advanceComanda}
                    onPrint={printComanda}
                    onMarkOutOfStock={markOutOfStock}
                    acting={actingKey === t.key}
                    oosBusyId={oosBusyId}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
