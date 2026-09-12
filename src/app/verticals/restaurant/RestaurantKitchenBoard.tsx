/**
 * Tablero KDS de cocina (comandas sala).
 * Usado en la página CEO `/saas/cocina` y embebido en el TPV (sin salir del gate).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { playUiBeep, unlockUiAudio } from '../../lib/uiSounds';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { useSSE } from '../../hooks/useSSE';
import {
  listDiningOrdersRequest,
  updateComandaStatusRequest,
  type ComandaStatus,
  type DiningOrder,
  type RestaurantProductionArea,
} from '../../lib/salaApi';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import { printDeliveryTicket } from '../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom } from '../../lib/deliveryTicketHelpers';
import {
  buildKitchenTickets,
  buildAccessibleKitchenTickets,
  buildKitchenItemInstructions,
  kitchenTicketMinutes,
  kitchenTicketStatusMinutes,
  kitchenTicketTimerLabel,
  nextKitchenStatus,
  type KitchenTicket,
} from './restaurantKitchen';
import { setCatalogItemAvailabilityRequest } from '../../lib/deliveryApi';
import { useRestaurantPlanAccess } from '../../hooks/useRestaurantPlanAccess';
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
  Coffee,
} from 'lucide-react';

const OVERTIME_MINUTES = 20;
const SOUND_KEY = 'restaurant_kds_sound';
const STATION_KEY = 'restaurant_kds_station';

const ACTION_LABELS: Partial<Record<ComandaStatus, { label: string; shortLabel: string; color: string }>> = {
  in_preparation: { label: 'Empezar preparación', shortLabel: 'Empezar', color: 'bg-[var(--v-blue,#2563eb)] hover:bg-blue-700' },
  ready: { label: 'Marcar lista para servir', shortLabel: 'Marcar lista', color: 'bg-[var(--v-blue,#2563eb)] hover:bg-blue-700' },
  served: { label: 'Confirmar servida', shortLabel: 'Servida', color: 'bg-[var(--v-blue,#2563eb)] hover:bg-blue-700' },
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

function KitchenItemCustomization({
  item,
}: {
  item: KitchenTicket['items'][number];
}) {
  const { lines, note } = buildKitchenItemInstructions(item);
  if (lines.length === 0 && !note) return null;
  return (
    <div className="mt-1 space-y-1">
      {lines.length > 0 ? (
        <p className="whitespace-pre-line text-xs font-semibold leading-relaxed text-blue-700 dark:text-blue-300">
          {lines.join('\n')}
        </p>
      ) : null}
      {note ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Nota de cocina
          </p>
          <p className="mt-0.5 text-xs font-semibold text-amber-950 dark:text-amber-100">{note}</p>
        </div>
      ) : null}
    </div>
  );
}

function KitchenTicketCard({
  ticket,
  now,
  onAdvance,
  onPrint,
  onMarkOutOfStock,
  acting,
  oosBusyId,
  station,
}: {
  ticket: KitchenTicket;
  now: number;
  onAdvance: (ticket: KitchenTicket, next: ComandaStatus) => void;
  onPrint: (ticket: KitchenTicket) => void;
  onMarkOutOfStock: (productId: string, name: string) => void;
  acting: boolean;
  oosBusyId: string | null;
  station: RestaurantProductionArea;
}) {
  const mins = kitchenTicketMinutes(ticket, now);
  const stateMinutes = kitchenTicketStatusMinutes(ticket, now);
  const isOvertime = ticket.status !== 'ready' && stateMinutes > OVERTIME_MINUTES;
  const next = nextKitchenStatus(ticket.status);
  const baseAction = next ? ACTION_LABELS[next] : null;
  const action = baseAction && station === 'bar'
    ? {
        ...baseAction,
        label: next === 'in_preparation'
          ? 'Preparar'
          : next === 'ready'
            ? 'Lista para servir'
            : baseAction.label,
        shortLabel: next === 'ready' ? 'Lista' : baseAction.shortLabel,
      }
    : baseAction;
  const statusTimerColor = ticket.status === 'ready'
    ? 'text-emerald-600 dark:text-emerald-400'
    : timerColor(stateMinutes);
  const totalUnits = ticket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      className={`rounded-xl border bg-white p-2.5 transition-all dark:bg-stone-900 ${
        isOvertime
          ? 'border-rose-300 ring-2 ring-rose-200 dark:border-rose-800 dark:ring-rose-950'
          : 'border-stone-200 dark:border-stone-700'
      }`}
    >
      <div>
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-stone-900 dark:text-stone-100">
            <UtensilsCrossed className="w-4 h-4 text-stone-500 shrink-0" />
            <span className="truncate">{ticketTableLabel(ticket)}</span>
          </span>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-stone-500">
            #{ticket.comandaNumber || '—'}
            {ticket.zone ? ` · ${ticket.zone}` : ''}
            {ticket.createdByName ? ` · ${ticket.createdByName}` : ''}
          </p>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-stone-100 pt-1.5 dark:border-stone-800">
          <div className={`flex items-center gap-1 text-xs font-bold tabular-nums ${statusTimerColor}`}>
            <Timer className="h-3.5 w-3.5" />
            {kitchenTicketTimerLabel(ticket, now)}
          </div>
          {ticket.status !== 'sent_to_kitchen' ? (
            <p className="text-right text-[10px] font-medium text-stone-400">
              Total {formatElapsed(mins)}
            </p>
          ) : null}
        </div>
      </div>

      {isOvertime ? (
        <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <Flame className="h-3 w-3" /> Retraso: +{OVERTIME_MINUTES} min
        </div>
      ) : null}

      <div className="my-2 space-y-1">
        {ticket.items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5 rounded-lg bg-stone-50 px-2 py-1.5 dark:bg-stone-950/50">
            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 px-1 text-xs font-black text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              {item.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{item.name}</span>
              <KitchenItemCustomization item={item} />
            </div>
            {item.productId ? (
              <button
                type="button"
                title="Marcar agotado en carta"
                disabled={oosBusyId === item.productId}
                onClick={() => onMarkOutOfStock(item.productId, item.name)}
                className="shrink-0 rounded-lg p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
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
        <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-900/20">
          <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Nota del pedido</p>
            <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">{ticket.notes}</p>
          </div>
        </div>
      )}

      <div className="border-t border-stone-200/70 pt-2 dark:border-stone-700">
        <span className="text-[10px] font-semibold text-stone-500">
          {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}
        </span>
        <div className="mt-1.5 flex w-full items-center gap-1.5">
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
              onDoubleClick={(e) => e.preventDefault()}
              title={action.label}
              aria-label={action.label}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-xs font-semibold text-white transition-all disabled:opacity-50 ${action.color}`}
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span className="xl:hidden">{action.shortLabel}</span>
              <span className="hidden xl:inline">{action.label}</span>
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
  station,
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
  station: RestaurantProductionArea;
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className={`flex items-center gap-2 rounded-t-xl px-3 py-2 ${color}`}>
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="ml-auto flex items-center justify-center w-7 h-7 rounded-full bg-white/80 dark:bg-gray-800/80 text-sm font-bold text-gray-900 dark:text-gray-100">
          {tickets.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-b-xl border border-t-0 border-gray-200 bg-gray-50/50 p-2 dark:border-gray-700 dark:bg-gray-900/50">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400 dark:text-stone-600">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
              {icon}
            </div>
            <p className="text-center text-xs font-medium">{emptyLabel}</p>
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
              station={station}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const hasProAccess = useRestaurantPlanAccess('production_stations');
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const authUserId = user?.user_id || user?.id || null;
  const scopeBusinessId = resolveBusinessScopeId(currentBusiness);
  const requestedStation = searchParams.get('station') === 'bar' ? 'bar' : 'kitchen';
  const station: RestaurantProductionArea = hasProAccess ? requestedStation : 'kitchen';

  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  /** Lock inmediato (antes del re-render) + cooldown tras avance: evita doble toque Empezar→Listo. */
  const actingLockRef = useRef<string | null>(null);
  const advanceCooldownRef = useRef<Map<string, number>>(new Map());
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
    if (!hasProAccess || searchParams.has('station')) return;
    let saved = '';
    try { saved = localStorage.getItem(STATION_KEY) || ''; } catch { /* ignore */ }
    if (saved !== 'bar') return;
    const next = new URLSearchParams(searchParams);
    next.set('station', 'bar');
    setSearchParams(next, { replace: true });
  }, [hasProAccess, searchParams, setSearchParams]);

  useEffect(() => {
    if (!hasProAccess && searchParams.get('station') === 'bar') {
      const next = new URLSearchParams(searchParams);
      next.set('station', 'kitchen');
      setSearchParams(next, { replace: true });
    }
  }, [hasProAccess, searchParams, setSearchParams]);

  useEffect(() => {
    if (!hasProAccess) return;
    try { localStorage.setItem(STATION_KEY, station); } catch { /* ignore */ }
  }, [hasProAccess, station]);

  useEffect(() => {
    try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch { /* ignore */ }
  }, [soundEnabled]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const playNewComandaSound = useCallback(() => {
    playUiBeep();
  }, []);

  // Desbloqueo de audio al primer toque (sin él, iPad no deja sonar el beep).
  useEffect(() => {
    const unlock = () => unlockUiAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!userId || !isRestaurant) return;
    const today = localCalendarDayKey();
    try {
      const data = await listDiningOrdersRequest(userId, {
        dateFrom: `${today}T00:00:00.000Z`,
      });
      setOrders(data);
      const newCount = buildAccessibleKitchenTickets(
        data,
        scopeBusinessId,
        station,
        hasProAccess,
      )
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
  }, [userId, isRestaurant, scopeBusinessId, station, hasProAccess, playNewComandaSound]);

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
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadOrders();
    }, 30_000);
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
        orderNumber: ticket.comandaNumber
          ? `${ticket.productionArea === 'bar' ? 'B' : 'C'}-${ticket.comandaNumber}`
          : '',
        customerName: ticketTableLabel(ticket),
        items: ticket.items.map((item) => ({
          quantity: item.quantity,
          name: item.name,
          total: 0,
          notes: item.notes,
          extras: item.extras.length > 0 ? item.extras : item.modifiers,
          ingredients: item.ingredients,
        })),
        notes: [
          `ESTACIÓN: ${ticket.productionArea === 'bar' ? 'BARRA' : 'COCINA'}`,
          ticket.notes,
        ].filter(Boolean).join(' · '),
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
    const expectedNext = nextKitchenStatus(ticket.status);
    if (!expectedNext || expectedNext !== next) return;
    if (actingLockRef.current) return;
    const coolUntil = advanceCooldownRef.current.get(ticket.key) || 0;
    if (Date.now() < coolUntil) return;

    actingLockRef.current = ticket.key;
    setActingKey(ticket.key);
    try {
      const updated = await updateComandaStatusRequest(userId, ticket.orderId, ticket.comandaId, next);
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
      // Cooldown: el botón cambia de sitio/label; el 2º clic del doble toque no debe avanzar otra vez.
      advanceCooldownRef.current.set(ticket.key, Date.now() + 900);
      toast.success(`${ticketTableLabel(ticket)} · comanda ${STATUS_TOAST_LABELS[next] || next}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar la comanda';
      // 409 de transición inválida: silencio suave (doble toque ya bloqueado en servidor)
      if (!/Transición no permitida/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      actingLockRef.current = null;
      setActingKey(null);
    }
  }, [userId]);

  const tickets = useMemo(
    () => buildAccessibleKitchenTickets(orders, scopeBusinessId, station, hasProAccess),
    [orders, scopeBusinessId, station, hasProAccess],
  );
  const stationCounts = useMemo(
    () => ({
      kitchen: buildKitchenTickets(orders, scopeBusinessId, 'kitchen').length,
      bar: buildKitchenTickets(orders, scopeBusinessId, 'bar').length,
    }),
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

  const selectStation = (nextStation: RestaurantProductionArea) => {
    const next = new URLSearchParams(searchParams);
    next.set('station', nextStation);
    setSearchParams(next, { replace: true });
    setMobileTab('nuevas');
  };

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {overtimeCount > 0 && (
        <div className="shrink-0 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            {overtimeCount === 1 ? '1 comanda requiere' : `${overtimeCount} comandas requieren`} atención: más de {OVERTIME_MINUTES} min sin avanzar
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
          {hasProAccess ? (
            <div className="flex rounded-xl border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-950">
              {([
                ['kitchen', 'Cocina', ChefHat],
                ['bar', 'Barra', Coffee],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectStation(value)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                    station === value
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-stone-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${
                    station === value ? 'bg-white/20' : 'bg-stone-200 dark:bg-stone-700'
                  }`}>
                    {stationCounts[value]}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2 flex-1">
            {[
              { label: 'Pendientes', value: colNew.length, bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'En preparación', value: colPrep.length, bg: 'bg-orange-50 text-orange-700 border-orange-200' },
              { label: 'Para servir', value: colReady.length, bg: 'bg-green-50 text-green-700 border-green-200' },
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
          { id: 'nuevas' as const, label: 'Pendientes', count: colNew.length },
          { id: 'preparacion' as const, label: 'Preparación', count: colPrep.length },
          { id: 'listas' as const, label: 'Para servir', count: colReady.length },
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
          <div className="hidden min-h-0 flex-1 gap-3 p-3 md:flex">
            <KitchenColumn
              title="Pendientes de empezar"
              icon={<Clock className="w-4 h-4 text-amber-700" />}
              color="bg-amber-100/80 text-amber-800"
              tickets={colNew}
              now={now}
              onAdvance={advanceComanda}
              onPrint={printComanda}
              onMarkOutOfStock={markOutOfStock}
              actingKey={actingKey}
              oosBusyId={oosBusyId}
              emptyLabel="No hay comandas esperando"
              station={station}
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
              emptyLabel="No hay comandas en preparación"
              station={station}
            />
            <KitchenColumn
              title="Listas para servir"
              icon={<CheckCircle2 className="w-4 h-4 text-green-700" />}
              color="bg-green-100/80 text-green-800"
              tickets={colReady}
              now={now}
              onAdvance={advanceComanda}
              onPrint={printComanda}
              onMarkOutOfStock={markOutOfStock}
              actingKey={actingKey}
              oosBusyId={oosBusyId}
              emptyLabel="No hay comandas esperando servicio"
              station={station}
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
                    station={station}
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
