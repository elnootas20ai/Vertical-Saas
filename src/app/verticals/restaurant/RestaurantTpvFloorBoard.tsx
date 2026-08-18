/**
 * Plano de mesas del TPV sala (tras fichaje + caja abierta).
 * En servicio arriba (mini-ticket + € + acciones). Libres abajo (compactas).
 * Tocar mesa → abre el TPV de esa mesa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  CalendarDays,
  ChefHat,
  LayoutGrid,
  Plus,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import { RestaurantSeatGuestsModal } from '../../components/saas/restaurant/RestaurantSeatGuestsModal';
import { RestaurantTpvReservationsStrip } from '../../components/saas/restaurant/RestaurantTpvReservationsStrip';
import { RestaurantTpvReservationsPanel } from '../../components/saas/restaurant/RestaurantTpvReservationsPanel';
import {
  changeTableStatusRequest,
  getFloorConfigRequest,
  listDiningOrdersRequest,
  listDiningTablesRequest,
  type DiningOrder,
  type DiningTable,
  type DiningTableStatus,
} from '../../lib/salaApi';
import { ensureOpenDiningOrder, loadOpenDiningOrderForTable, diningOrderDueAmount } from '../../lib/restaurantDiningTpv';
import { cancelActiveReservationsForTable } from '../../lib/restaurantReservationsApi';
import {
  openOrdersByTableId,
  resolveTpvFloorVisualStatus,
  diningOrderHasTpvPedido,
  formatTableMoney,
  formatOccupiedTime,
} from '../../lib/restaurantTableDisplay';
import { tableStatusOnOpen } from '../../lib/restaurantTableStatus';
import {
  writeSalaTpvOpenTable,
  consumeSalaTpvOpenTable,
} from '../../lib/salaTpvLaunch';
import {
  formatReservationHint,
  reservationMinutesUntil,
  upcomingReservationsByTableId,
} from '../../lib/restaurantFloorReservations';
import { seatGuest } from '../../lib/restaurantReservationsApi';
import {
  formatReservationSeatPlace,
  type RestaurantReservation,
} from '../../lib/restaurantReservationTypes';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { readTpvTabletBinding } from '../../lib/tpvTabletSession';
import { useLiveClock } from '../../hooks/useLiveClock';
import { useTodayReservationsPoll } from '../../hooks/useTodayReservationsPoll';
import { useRestaurantTpvReservationAlerts } from '../../hooks/useRestaurantTpvReservationAlerts';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { resolveTableCapacity } from './tableCapacity';
import {
  RestaurantTpvTableAccount,
  buildCounterTableContext,
  RESTAURANT_COUNTER_TABLE_ID,
} from './RestaurantTpvTableAccount';
import { RestaurantTpvKitchenPanel } from './RestaurantTpvKitchenPanel';
import type { RestaurantTableContext } from '../../components/saas/tpv/RestaurantTableTpvFlow';
import {
  TpvRegisterProvider,
  useTpvRegisterIfOpen,
  type TpvRegisterContextType,
} from '../../components/saas/TpvRegisterGate';
import { isTpvRegisterSessionOpen } from '../../lib/deliveryApi';
import { useTpvOrderFlowLockControls } from '../../context/TpvChromeContext';

type Props = {
  pdvId: string | null;
  pdvName?: string;
  tabletMode?: boolean;
  onChangeStore?: () => void;
};

const STATUS_UI: Record<
  DiningTableStatus,
  { label: string; card: string; badge: string; accent: string }
> = {
  available: {
    label: 'Libre',
    card: 'border-stone-200 bg-white text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50',
    badge: 'bg-emerald-600 text-white',
    accent: 'bg-emerald-500',
  },
  occupied: {
    label: 'Ocupada',
    card: 'border-stone-200 bg-white text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50',
    badge: 'bg-red-600 text-white',
    accent: 'bg-red-500',
  },
  pending_order: {
    label: 'Ocupada',
    card: 'border-stone-200 bg-white text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50',
    badge: 'bg-red-600 text-white',
    accent: 'bg-red-500',
  },
  served: {
    label: 'Ocupada',
    card: 'border-stone-200 bg-white text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50',
    badge: 'bg-red-600 text-white',
    accent: 'bg-red-500',
  },
  pending_payment: {
    label: 'Por cobrar',
    card: 'border-blue-200 bg-blue-50/60 text-stone-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-stone-50',
    badge: 'bg-[var(--v-blue,#2563eb)] text-white',
    accent: 'bg-[var(--v-blue,#2563eb)]',
  },
  unavailable: {
    label: 'Limpiar',
    card: 'border-stone-200 bg-stone-100 text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200',
    badge: 'bg-neutral-500 text-white',
    accent: 'bg-stone-400',
  },
  reserved: {
    label: 'Reservada',
    card: 'border-violet-200 bg-violet-50/60 text-stone-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-stone-50',
    badge: 'bg-violet-600 text-white',
    accent: 'bg-violet-500',
  },
  hidden: {
    label: 'Oculta',
    card: 'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300',
    badge: 'bg-neutral-400 text-white',
    accent: 'bg-stone-300',
  },
};

/** Mesa con más de 90 min ocupada → resaltar tiempo. */
const LONG_STAY_MIN = 90;

type TicketLine = { key: string; label: string; amount: number };

/** Mini-ticket de la mesa: todas las líneas con importe. */
function buildTableTicket(order: DiningOrder | null | undefined): {
  itemCount: number;
  due: number;
  lines: TicketLine[];
} | null {
  if (!diningOrderHasTpvPedido(order) || !order) return null;
  const lines: TicketLine[] = [];
  let itemCount = 0;
  for (const comanda of order.comandas || []) {
    if (comanda.status === 'cancelled') continue;
    for (const item of comanda.items || []) {
      if (item.status === 'cancelled') continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      itemCount += qty;
      const name = String(item.name || 'Producto').trim() || 'Producto';
      const unit = Number(item.price) || 0;
      lines.push({
        key: `${comanda.id}:${item.id}`,
        label: qty > 1 ? `${qty}× ${name}` : name,
        amount: Math.round(unit * qty * 100) / 100,
      });
    }
  }
  return {
    itemCount,
    due: diningOrderDueAmount(order),
    lines,
  };
}

function occupiedMinutes(table: DiningTable, nowMs: number): number | null {
  const at = String(table.occupiedAt || '').trim();
  if (!at) return null;
  const start = Date.parse(at);
  if (!Number.isFinite(start) || start <= 0) return null;
  return Math.max(0, Math.floor((nowMs - start) / 60_000));
}

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function tablesForBusiness(tables: DiningTable[], businessId: string): DiningTable[] {
  return (tables || []).filter((t) => {
    const bid = normalizeBusinessId(t.businessId);
    return !bid || bid === businessId;
  });
}

function tablesForRoom(tables: DiningTable[], room: SalaRoom): DiningTable[] {
  return tables
    .filter((t) => {
      if (t.active === false || t.status === 'hidden') return false;
      const roomId = String(t.roomId || '').trim();
      if (roomId) return roomId === room.id;
      return String(t.zone || '').trim() === room.name;
    })
    .sort((a, b) => (a.sortOrder || a.number) - (b.sortOrder || b.number));
}

function isOccupiedStatus(status: DiningTableStatus): boolean {
  return (
    status === 'occupied'
    || status === 'pending_order'
    || status === 'served'
    || status === 'pending_payment'
  );
}

function patchTableList(tables: DiningTable[], updated: DiningTable): DiningTable[] {
  const id = String(updated._id || updated.id || '');
  return tables.map((t) => (String(t._id || t.id) === id ? { ...t, ...updated } : t));
}

function tableSortKey(table: DiningTable, openOrder: DiningOrder | null): number {
  const visual = resolveTpvFloorVisualStatus(table, openOrder);
  if (visual === 'pending_payment') return 0;
  if (isOccupiedStatus(visual)) return 1;
  if (visual === 'reserved') return 2;
  if (visual === 'unavailable') return 3;
  return 4;
}

export function RestaurantTpvFloorBoard({
  pdvId,
  pdvName,
  tabletMode = false,
  onChangeStore,
}: Props) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const orderFlowLock = useTpvOrderFlowLockControls();
  const accountLockHeldRef = useRef(false);
  /** Caja viva fuera del portal: al portar la cuenta a body el Context a veces parpadea y el cobro cree que no hay caja. */
  const liveRegister = useTpvRegisterIfOpen();
  const registerHoldRef = useRef<TpvRegisterContextType | null>(
    liveRegister && isTpvRegisterSessionOpen(liveRegister.session) ? liveRegister : null,
  );
  if (liveRegister && isTpvRegisterSessionOpen(liveRegister.session)) {
    registerHoldRef.current = liveRegister;
  } else if (
    registerHoldRef.current
    && !isTpvRegisterSessionOpen(registerHoldRef.current.session)
  ) {
    registerHoldRef.current = null;
  }
  const registerForTableAccount =
    (liveRegister && isTpvRegisterSessionOpen(liveRegister.session) ? liveRegister : null)
    || (
      registerHoldRef.current && isTpvRegisterSessionOpen(registerHoldRef.current.session)
        ? registerHoldRef.current
        : null
    );

  const userId = resolveBusinessDataUserId(user, currentBusiness) || user?.user_id || user?.id || '';
  const businessId = resolveBusinessScopeId(currentBusiness) || normalizeBusinessId(currentBusiness?.business_id);
  const nowMs = useLiveClock(30_000);
  const actorName =
    String((user as { fullName?: string } | null)?.fullName || user?.name || user?.email || 'TPV sala').trim();
  // Código de tienda / tablet: solo operar el TPV. Cambiar local e Ir a Sala son de CEO.
  const isTabletOrCodeSession = tabletMode || Boolean(readTpvTabletBinding()?.pdvId);
  const showCeoFloorActions = !isTabletOrCodeSession;

  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [openOrdersByTable, setOpenOrdersByTable] = useState<Map<string, DiningOrder>>(() => new Map());
  const [activeRoomId, setActiveRoomId] = useState('');
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [reservedTable, setReservedTable] = useState<DiningTable | null>(null);
  const [busyId, setBusyId] = useState('');
  const [activeTable, setActiveTable] = useState<DiningTable | RestaurantTableContext | null>(null);
  const [activeOrder, setActiveOrder] = useState<DiningOrder | null>(null);
  /** Abrir TPV en carta (`order`) o cobro (`pay`). */
  const [tpvOpenIntent, setTpvOpenIntent] = useState<'order' | 'pay'>('order');
  const [seatingReservationId, setSeatingReservationId] = useState<string | null>(null);
  /** Panel de gestión de reservas dentro del TPV (no sale al CEO). */
  const [reservationsPanelOpen, setReservationsPanelOpen] = useState(false);
  const [reservationsPanelStartCreate, setReservationsPanelStartCreate] = useState(false);
  /** Cocina KDS dentro del TPV (no sale a `/saas/cocina`). */
  const [kitchenPanelOpen, setKitchenPanelOpen] = useState(false);
  const autoOpenDoneRef = useRef(false);

  const urlTableId = String(searchParams.get('mesa') || '').trim();
  const { todayReservations, reloadReservations } = useTodayReservationsPoll(userId || null);

  const reservationByTableId = useMemo(
    () => upcomingReservationsByTableId(todayReservations),
    [todayReservations],
  );

  const loadFloor = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId || !businessId) {
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      const [config, listed, orders] = await Promise.all([
        getFloorConfigRequest(userId, { businessId }).catch(() => null),
        listDiningTablesRequest(userId).catch(() => []),
        listDiningOrdersRequest(userId).catch(() => []),
      ]);
      const nextRooms = Array.isArray(config?.rooms) ? (config.rooms as SalaRoom[]) : [];
      const nextTables = tablesForBusiness(listed || [], businessId);
      const scopedOrders = (orders || []).filter((o) => {
        const bid = normalizeBusinessId(o.businessId);
        return !bid || bid === businessId;
      });
      setRooms(nextRooms);
      setTables(nextTables);
      setOpenOrdersByTable(openOrdersByTableId(scopedOrders));
      if (nextRooms.length > 0) {
        setActiveRoomId((prev) =>
          nextRooms.some((r) => r.id === prev) ? prev : nextRooms[0].id,
        );
      }
    } catch {
      if (!opts?.silent) toast.error('No se pudo cargar el plano de mesas');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    void loadFloor();
  }, [loadFloor]);

  const softReloadFloor = useCallback(() => {
    if (activeTable) return;
    void loadFloor({ silent: true });
    void reloadReservations();
  }, [activeTable, loadFloor, reloadReservations]);

  const salaSseHandlers = useMemo(
    () => ({
      'sala:table_status_changed': softReloadFloor,
      'sala:table_updated': softReloadFloor,
      'sala:tables_bulk_updated': softReloadFloor,
      'sala:order_created': softReloadFloor,
      'sala:order_updated': softReloadFloor,
      'sala:order_closed': softReloadFloor,
      'sala:order_cancelled': softReloadFloor,
      'sala:comanda_sent': softReloadFloor,
      'sala:comanda_status_changed': softReloadFloor,
    }),
    [softReloadFloor],
  );

  useSSE({
    userId: user?.user_id || user?.id || null,
    businessId: businessId || null,
    handlers: salaSseHandlers,
    enabled: Boolean(userId && businessId && !activeTable),
  });

  const sortedRooms = useMemo(() => {
    const scoped = pdvId
      ? rooms.filter((r) => {
          const roomPdv = String(r.pdvId || '').trim();
          return !roomPdv || roomPdv === pdvId;
        })
      : rooms;
    return [...scoped].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [rooms, pdvId]);

  useEffect(() => {
    if (!sortedRooms.length) {
      setActiveRoomId('');
      return;
    }
    if (!sortedRooms.some((r) => r.id === activeRoomId)) {
      setActiveRoomId(sortedRooms[0].id);
    }
  }, [sortedRooms, activeRoomId]);

  const activeRoom =
    sortedRooms.find((r) => r.id === activeRoomId) || sortedRooms[0] || null;
  const roomTables = activeRoom ? tablesForRoom(tables, activeRoom) : [];

  const visibleTables = useMemo(() => {
    const list = activeRoom
      ? roomTables
      : tables
          .filter((t) => t.active !== false && t.status !== 'hidden')
          .sort((a, b) => (a.sortOrder || a.number) - (b.sortOrder || b.number));
    return list;
  }, [activeRoom, roomTables, tables]);

  const { activeTables, freeTables } = useMemo(() => {
    const active: DiningTable[] = [];
    const free: DiningTable[] = [];
    for (const table of visibleTables) {
      const tid = String(table._id || table.id || '');
      const openOrder = openOrdersByTable.get(tid) || null;
      const visual = resolveTpvFloorVisualStatus(table, openOrder);
      if (isOccupiedStatus(visual) || visual === 'reserved' || visual === 'unavailable') {
        active.push(table);
      } else {
        free.push(table);
      }
    }
    active.sort((a, b) => {
      const oa = openOrdersByTable.get(String(a._id || a.id || '')) || null;
      const ob = openOrdersByTable.get(String(b._id || b.id || '')) || null;
      const ka = tableSortKey(a, oa);
      const kb = tableSortKey(b, ob);
      if (ka !== kb) return ka - kb;
      return (a.sortOrder || a.number) - (b.sortOrder || b.number);
    });
    return { activeTables: active, freeTables: free };
  }, [visibleTables, openOrdersByTable]);

  const pendingPaymentCount = useMemo(
    () =>
      activeTables.filter((t) => {
        const openOrder = openOrdersByTable.get(String(t._id || t.id || '')) || null;
        return resolveTpvFloorVisualStatus(t, openOrder) === 'pending_payment';
      }).length,
    [activeTables, openOrdersByTable],
  );

  const clearMesaParam = useCallback(() => {
    if (!searchParams.has('mesa')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('mesa');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openOrderPanel = useCallback(
    (
      table: DiningTable | RestaurantTableContext,
      order: DiningOrder | null,
      intent: 'order' | 'pay' = 'order',
    ) => {
      // Antes del lazy TPV: el gate mantiene la caja sticky (CEO bar).
      if (!accountLockHeldRef.current) {
        orderFlowLock.acquire();
        accountLockHeldRef.current = true;
      }
      setTpvOpenIntent(intent);
      setActiveTable(table);
      setActiveOrder(order);
      setSeatTable(null);
      setReservedTable(null);
      setBusyId('');
      clearMesaParam();
    },
    [clearMesaParam, orderFlowLock],
  );

  /**
   * MVP: abrir el TPV core al instante (carta o cobro), y sincronizar cuenta/estado en segundo plano.
   * No bloquear la UI en “Abriendo…” si la API va lenta o falla.
   */
  const openAccount = useCallback(
    async (table: DiningTable, guests?: number, intent: 'order' | 'pay' = 'order') => {
      const tableId = String(table._id || table.id || '').trim();
      if (!tableId) {
        toast.error('No se puede abrir la mesa');
        return;
      }
      const guestCount =
        guests
        ?? (table.currentGuests > 0 ? table.currentGuests : Math.min(2, resolveTableCapacity(table)));

      // Abrir ya con la cuenta del plano (si hay) para que Cobrar no espere al round-trip.
      const knownOrder = openOrdersByTable.get(tableId) || null;
      openOrderPanel(table, knownOrder, intent);
      setBusyId(tableId);

      if (!userId || !businessId) {
        toast.error('Falta sesión de empresa para guardar la cuenta de la mesa');
        setBusyId('');
        return;
      }

      try {
        const order = await ensureOpenDiningOrder({
          userId,
          businessId,
          tableId,
          tableNumber: table.number,
          tableName: table.name || `Mesa ${table.number}`,
          guests: guestCount,
          createdBy: userId,
          createdByName: actorName,
          zone: table.zone || activeRoom?.name || '',
        });

        let nextTable = table;
        if (!isOccupiedStatus(table.status) || guests != null) {
          try {
            const nextStatus = tableStatusOnOpen(table.status);
            nextTable = await changeTableStatusRequest(userId, tableId, nextStatus, {
              currentGuests: guestCount,
            });
            setTables((prev) => patchTableList(prev, nextTable));
          } catch {
            /* la carta ya está abierta */
          }
        }

        const fresh = (await loadOpenDiningOrderForTable(userId, tableId)) || order;
        writeSalaTpvOpenTable({ tableId, orderId: fresh._id });
        setActiveTable(nextTable);
        setActiveOrder(fresh);
        setTpvOpenIntent(intent);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo crear la cuenta de la mesa');
      } finally {
        setBusyId('');
      }
    },
    [userId, businessId, actorName, activeRoom?.name, openOrderPanel, openOrdersByTable],
  );

  const handleSeatReservation = useCallback(
    async (reservation: RestaurantReservation) => {
      if (!userId || !businessId) {
        toast.error('Falta sesión de empresa');
        return;
      }
      const tableId = String(reservation.tableId || '').trim();
      if (!tableId) {
        toast.error('Asigna una mesa a la reserva antes de sentar');
        return;
      }
      setSeatingReservationId(reservation._id);
      setBusyId(tableId);
      try {
        const result = await seatGuest(
          userId,
          reservation,
          { userId, userName: actorName },
          businessId,
        );
        const partySize = parseInt(String(reservation.partySize || '2'), 10) || 2;
        const listed = await listDiningTablesRequest(userId).catch(() => tables);
        const nextTable =
          tablesForBusiness(listed || [], businessId).find(
            (t) => String(t._id || t.id) === result.tableId,
          )
          || tables.find((t) => String(t._id || t.id) === result.tableId);
        if (!nextTable) {
          toast.error('Mesa no encontrada tras sentar');
          return;
        }
        const occupiedTable: DiningTable = {
          ...nextTable,
          status: 'occupied',
          currentGuests: partySize,
          occupiedBy: reservation.guestName || nextTable.occupiedBy,
        };
        const freshOrder =
          (await loadOpenDiningOrderForTable(userId, result.tableId)) || null;
        setTables((prev) => patchTableList(prev, occupiedTable));
        writeSalaTpvOpenTable({ tableId: result.tableId, orderId: result.orderId });
        await reloadReservations();
        setReservedTable(null);
        setSeatTable(null);
        openOrderPanel(occupiedTable, freshOrder, 'order');
        const place =
          String(result.reservation.tableName || '').trim()
          || occupiedTable.name
          || `Mesa ${occupiedTable.number}`;
        toast.success(`Sentado en ${place}`, {
          description: `${reservation.guestName || 'Cliente'} · ${partySize} pers. · pedido abierto`,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo sentar al cliente');
      } finally {
        setSeatingReservationId(null);
        setBusyId('');
      }
    },
    [userId, businessId, actorName, tables, openOrderPanel, reloadReservations],
  );

  useRestaurantTpvReservationAlerts(todayReservations, handleSeatReservation);

  // Solo abrir carta con ?mesa= (p. ej. desde Sala).
  // TPV Rápido sin mesa → plano de mesas (no reabrir la última cuenta por token viejo).
  useEffect(() => {
    if (autoOpenDoneRef.current || loading || activeTable || !userId || tables.length === 0) {
      return;
    }
    if (!urlTableId) {
      consumeSalaTpvOpenTable();
      return;
    }
    const match = tables.find((t) => String(t._id || t.id) === urlTableId);
    if (!match) {
      // Mesas aún no cargadas / otro local: no consumir el token ni borrar ?mesa=.
      return;
    }
    autoOpenDoneRef.current = true;
    consumeSalaTpvOpenTable();
    void openAccount(match);
  }, [loading, activeTable, userId, tables, urlTableId, openAccount]);

  const handleTableClick = (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId || busyId === tableId || Boolean(activeTable)) return;

    // Mesa libre: pedir comensales y luego abrir carta.
    if (table.status === 'available') {
      setSeatTable(table);
      return;
    }
    if (table.status === 'reserved') {
      const hint = reservationByTableId.get(tableId);
      const reservation = hint
        ? todayReservations.find((r) => r._id === hint.reservationId)
        : null;
      if (reservation) {
        void handleSeatReservation(reservation);
        return;
      }
      setReservedTable(table);
      return;
    }
    if (table.status === 'unavailable') {
      void (async () => {
        setBusyId(tableId);
        try {
          const updated = await changeTableStatusRequest(userId, tableId, 'available', {
            currentGuests: 0,
          });
          setTables((prev) => patchTableList(prev, updated));
          toast.success('Mesa marcada como libre');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'No se pudo liberar la mesa');
        } finally {
          setBusyId('');
        }
      })();
      return;
    }
    // Ocupada / cuenta / cualquier otro estado operativo → TPV core.
    void openAccount(table);
  };

  const handleBackFromAccount = () => {
    if (accountLockHeldRef.current) {
      orderFlowLock.release();
      accountLockHeldRef.current = false;
    }
    setActiveTable(null);
    setActiveOrder(null);
    setTpvOpenIntent('order');
    void loadFloor();
    void reloadReservations();
  };

  const openReservationsPanel = useCallback((startCreate = false) => {
    setReservationsPanelStartCreate(startCreate);
    setReservationsPanelOpen(true);
  }, []);

  const handleReservationsChanged = useCallback(() => {
    void reloadReservations();
    void loadFloor();
  }, [reloadReservations, loadFloor]);

  const handleOpenCounter = () => {
    const ctx = buildCounterTableContext();
    openOrderPanel(ctx, null, 'order');
    if (!userId || !businessId) {
      toast.error('Falta sesión de empresa para el cobro de mostrador');
      return;
    }
    void (async () => {
      try {
        const order = await ensureOpenDiningOrder({
          userId,
          businessId,
          tableId: RESTAURANT_COUNTER_TABLE_ID,
          tableNumber: 0,
          tableName: 'Mostrador',
          guests: 1,
          createdBy: userId,
          createdByName: actorName,
          zone: 'Mostrador',
        });
        setActiveTable(ctx);
        setActiveOrder(order);
        setTpvOpenIntent('order');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo abrir el mostrador');
        setActiveTable(null);
        setActiveOrder(null);
      }
    })();
  };

  // Panel TPV core (carta) — portal a body para salir del overflow del gate.
  // z debe quedar POR DEBAJO de TpvModalRoot (z-70+) o los modales de producto
  // quedan tapados y parece que el TPV no responde a clics.
  if (activeTable) {
    const tableAccount = (
      <RestaurantTpvTableAccount
        userId={userId}
        table={activeTable}
        order={activeOrder}
        tabletMode={tabletMode}
        openIntent={tpvOpenIntent}
        registerOverride={registerForTableAccount}
        onBack={handleBackFromAccount}
        onOrderChange={setActiveOrder}
        onTableChange={(nextTable, nextOrder) => {
          setActiveTable(nextTable);
          setActiveOrder(nextOrder);
          if ('_id' in nextTable || ('type' in nextTable && (nextTable as DiningTable).type === 'dining_table')) {
            setTables((prev) => patchTableList(prev, nextTable as DiningTable));
          }
        }}
      />
    );
    return createPortal(
      <div className="fixed inset-0 z-[55] flex min-h-0 flex-col bg-gray-50 dark:bg-gray-950">
        {registerForTableAccount ? (
          <TpvRegisterProvider value={registerForTableAccount}>
            {tableAccount}
          </TpvRegisterProvider>
        ) : (
          tableAccount
        )}
      </div>,
      document.body,
    );
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
        <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto max-w-6xl">
            <div className="h-5 w-40 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />
            <div className="mt-1.5 h-3.5 w-56 animate-pulse rounded-md bg-stone-100 dark:bg-stone-800/60" />
          </div>
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
              />
            ))}
          </div>
          <p className="sr-only">Cargando plano de mesas…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-stone-900 dark:text-stone-50">
              {pdvName || 'Tu local'}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                {freeTables.length} libres
              </span>
              <span className="inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-300">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
                {activeTables.length} en servicio
              </span>
              {pendingPaymentCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--v-blue,#2563eb)] dark:text-blue-400">
                  <span className="h-2 w-2 rounded-full bg-[var(--v-blue,#2563eb)]" aria-hidden />
                  {pendingPaymentCount} por cobrar
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => openReservationsPanel(false)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
            >
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
              Reservas
              {todayReservations.length > 0 ? (
                <span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {todayReservations.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setKitchenPanelOpen(true)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-200 px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200"
            >
              <ChefHat className="h-3.5 w-3.5" strokeWidth={1.75} />
              Cocina
            </button>
            {showCeoFloorActions ? (
              <>
                {onChangeStore ? (
                  <button
                    type="button"
                    onClick={onChangeStore}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-200 px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Local
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate('/saas/sala')}
                  className="inline-flex h-9 items-center rounded-lg border border-stone-200 px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200"
                >
                  Sala
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <RestaurantTpvReservationsStrip
        reservations={todayReservations}
        seatingId={seatingReservationId}
        onSeat={handleSeatReservation}
        onManage={() => openReservationsPanel(false)}
        onCreate={() => openReservationsPanel(true)}
        defaultOpen={todayReservations.some((r) => reservationMinutesUntil(r) <= 30)}
      />

      <div className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        {sortedRooms.length === 0 && tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center dark:border-stone-700 dark:bg-stone-900">
            <LayoutGrid className="h-8 w-8 text-stone-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-100">
              Aún no hay mesas en este local
            </p>
            <p className="mt-1 max-w-sm text-xs text-stone-500">
              {showCeoFloorActions
                ? 'Cobro rápido en mostrador (sin cocina), o configura mesas en Sala.'
                : 'Cobro rápido en mostrador (sin mesa ni cocina).'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleOpenCounter}
                className={VERTIAL_BTN_PRIMARY}
              >
                Cobro rápido mostrador
              </button>
              {showCeoFloorActions ? (
                <button
                  type="button"
                  onClick={() => navigate('/saas/sala')}
                  className="h-10 rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
                >
                  Configurar Sala
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleOpenCounter}
              className="mb-3 flex min-h-11 w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/50 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--v-blue,#2563eb)] text-white shadow-sm shadow-blue-600/20">
                <Store className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-stone-900 dark:text-stone-50">
                  Cobro rápido · mostrador
                </span>
                <span className="block text-[11px] text-stone-500">
                  Sin mesa ni cocina · para llevar / barra
                </span>
              </span>
              <Plus className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={2} aria-hidden />
            </button>

            {sortedRooms.length > 0 && (
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
                {sortedRooms.map((room) => {
                  const count = tablesForRoom(tables, room).length;
                  const selected = (activeRoom?.id || '') === room.id;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setActiveRoomId(room.id)}
                      className={`h-9 shrink-0 rounded-lg border px-3 text-left text-xs transition-colors ${
                        selected
                          ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white shadow-sm shadow-blue-600/20'
                          : 'border-stone-200 bg-white text-stone-800 hover:border-blue-200 hover:text-[var(--v-blue,#2563eb)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100'
                      }`}
                    >
                      <span className="font-semibold">{room.name}</span>
                      <span className={`ml-1.5 ${selected ? 'text-blue-100' : 'text-stone-500'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {visibleTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center dark:border-stone-700 dark:bg-stone-900">
                <LayoutGrid className="h-7 w-7 text-stone-300" strokeWidth={1.5} />
                <p className="mt-2 text-sm font-medium text-stone-800 dark:text-stone-100">
                  No hay mesas en esta zona
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeTables.length > 0 ? (
                  <section>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        En servicio
                      </h2>
                      <span className="text-[11px] text-stone-400">{activeTables.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {activeTables.map((table) => {
                        const tableId = String(table._id || table.id || '');
                        const openOrder = openOrdersByTable.get(tableId) || null;
                        const visualStatus = resolveTpvFloorVisualStatus(table, openOrder);
                        const ui = STATUS_UI[visualStatus] || STATUS_UI.occupied;
                        const capacity = resolveTableCapacity(table);
                        const busy = busyId === tableId;
                        const ticket = buildTableTicket(openOrder);
                        const minsVal = occupiedMinutes(table, nowMs);
                        const mins = formatOccupiedTime(minsVal);
                        const longStay =
                          visualStatus !== 'reserved' && (minsVal ?? 0) >= LONG_STAY_MIN;
                        const guests = table.currentGuests > 0 ? table.currentGuests : 0;
                        const tableTitle = table.name?.trim() || `Mesa ${table.number}`;
                        const visibleLines = ticket?.lines.slice(0, 6) || [];
                        const hiddenLines = Math.max(0, (ticket?.lines.length || 0) - visibleLines.length);
                        const reservationHint = reservationByTableId.get(tableId) || null;
                        const linkedReservation = reservationHint
                          ? todayReservations.find((r) => r._id === reservationHint.reservationId) || null
                          : null;
                        const seatingThis =
                          Boolean(linkedReservation) && seatingReservationId === linkedReservation?._id;
                        return (
                          <div
                            key={tableId}
                            className={`relative flex flex-col overflow-hidden rounded-2xl border p-3 pl-4 text-left shadow-sm ${ui.card}`}
                          >
                            <span
                              className={`absolute inset-y-0 left-0 w-1.5 ${ui.accent}`}
                              aria-hidden
                            />
                            <button
                              type="button"
                              disabled={busy || seatingThis}
                              onClick={() => {
                                if (visualStatus === 'reserved') {
                                  handleTableClick(table);
                                  return;
                                }
                                if (visualStatus === 'unavailable') {
                                  handleTableClick(table);
                                  return;
                                }
                                void openAccount(table, undefined, 'order');
                              }}
                              className="w-full text-left transition-opacity hover:opacity-95 disabled:opacity-60"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-base font-bold leading-tight">{tableTitle}</p>
                                  <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                                    {visualStatus === 'reserved' && reservationHint ? (
                                      `${formatReservationHint(reservationHint)} · ${reservationHint.partySize} pers.`
                                    ) : (
                                      <>
                                        {guests > 0 ? `${guests} sentados` : `${capacity} pax`}
                                        {mins ? (
                                          <>
                                            {' · '}
                                            <span
                                              className={
                                                longStay
                                                  ? 'font-bold text-amber-700 dark:text-amber-400'
                                                  : undefined
                                              }
                                            >
                                              {mins}
                                            </span>
                                          </>
                                        ) : null}
                                        {ticket ? ` · ${ticket.itemCount} art.` : ''}
                                      </>
                                    )}
                                  </p>
                                </div>
                                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ui.badge}`}>
                                  {ui.label}
                                </span>
                              </div>

                              {ticket && ticket.lines.length > 0 ? (
                                <div className="mt-2.5 rounded-lg border border-stone-200/80 bg-stone-50/80 px-2.5 py-2 dark:border-stone-700 dark:bg-stone-950/50">
                                  <ul className="space-y-1">
                                    {visibleLines.map((line) => (
                                      <li
                                        key={line.key}
                                        className="flex items-baseline justify-between gap-2 text-[12px] leading-snug"
                                      >
                                        <span className="min-w-0 truncate font-medium text-stone-800 dark:text-stone-100">
                                          {line.label}
                                        </span>
                                        <span className="shrink-0 tabular-nums text-stone-600 dark:text-stone-300">
                                          {formatTableMoney(line.amount)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  {hiddenLines > 0 ? (
                                    <p className="mt-1 text-[11px] font-medium text-stone-500">
                                      +{hiddenLines} más en la cuenta
                                    </p>
                                  ) : null}
                                  <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 dark:border-stone-700">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                                      Total
                                    </span>
                                    <span className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">
                                      {formatTableMoney(ticket.due)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-3 text-xs text-stone-500">
                                  {visualStatus === 'reserved'
                                    ? reservationHint
                                      ? `${formatReservationHint(reservationHint)} · tocar para sentar`
                                      : 'Reservada · tocar para sentar'
                                    : visualStatus === 'unavailable'
                                      ? 'Pendiente de limpiar'
                                      : 'Sin artículos aún'}
                                </p>
                              )}
                            </button>

                            {visualStatus === 'reserved' ? (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  disabled={busy || seatingThis}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (linkedReservation) {
                                      void handleSeatReservation(linkedReservation);
                                      return;
                                    }
                                    setReservedTable(table);
                                  }}
                                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--v-blue,#2563eb)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                  <Users className="h-4 w-4 shrink-0" strokeWidth={2} />
                                  {seatingThis
                                    ? 'Sentando…'
                                    : linkedReservation
                                      ? `Sentar · ${formatReservationSeatPlace(linkedReservation)}`
                                      : `Sentar · ${tableTitle}`}
                                </button>
                              </div>
                            ) : visualStatus !== 'unavailable' ? (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openAccount(table, undefined, 'order');
                                  }}
                                  className={`${VERTIAL_BTN_SECONDARY} !px-3`}
                                >
                                  <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
                                  Añadir
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || !ticket || ticket.itemCount <= 0 || ticket.due <= 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!ticket || ticket.itemCount <= 0) {
                                      toast.message('Añade productos antes de cobrar');
                                      return;
                                    }
                                    void openAccount(table, undefined, 'pay');
                                  }}
                                  className={`${VERTIAL_BTN_PRIMARY} !px-3`}
                                >
                                  <Wallet className="h-4 w-4 shrink-0" strokeWidth={2} />
                                  Cobrar
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {freeTables.length > 0 ? (
                  <section>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Libres
                      </h2>
                      <span className="text-[11px] text-stone-400">{freeTables.length}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                      {freeTables.map((table) => {
                        const tableId = String(table._id || table.id || '');
                        const busy = busyId === tableId;
                        const capacity = resolveTableCapacity(table);
                        const tableTitle = table.name?.trim() || `Mesa ${table.number}`;
                        return (
                          <button
                            key={tableId}
                            type="button"
                            disabled={busy}
                            onClick={() => handleTableClick(table)}
                            className="min-h-16 rounded-xl border border-emerald-200 bg-emerald-50/80 px-2.5 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-100/80 disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
                          >
                            <p className="truncate text-sm font-bold text-emerald-950 dark:text-emerald-50">
                              {tableTitle}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-800/80 dark:text-emerald-200/70">
                              <Users className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                              {capacity} pax
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {seatTable
        && createPortal(
          <RestaurantSeatGuestsModal
            tableLabel={seatTable.name || `Mesa ${seatTable.number}`}
            capacity={resolveTableCapacity(seatTable)}
            defaultGuests={Math.min(2, resolveTableCapacity(seatTable))}
            onCancel={() => {
              setSeatTable(null);
              clearMesaParam();
            }}
            onConfirm={(guests) => void openAccount(seatTable, guests)}
          />,
          document.body,
        )}

      {reservedTable
        && createPortal(
          <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-stone-900 dark:text-stone-50">
                    {reservedTable.name || `Mesa ${reservedTable.number}`}
                  </h2>
                  {(() => {
                    const rid = String(reservedTable._id || reservedTable.id || '');
                    const hint = reservationByTableId.get(rid);
                    return hint ? (
                      <p className="text-sm text-violet-700 dark:text-violet-300">
                        {formatReservationHint(hint)} · {hint.partySize} pers.
                      </p>
                    ) : (
                      <p className="text-sm text-stone-500">Mesa reservada</p>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => setReservedTable(null)}
                  className="rounded-lg p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={Boolean(seatingReservationId)}
                  onClick={() => {
                    const rid = String(reservedTable._id || reservedTable.id || '');
                    const hint = reservationByTableId.get(rid);
                    const reservation = hint
                      ? todayReservations.find((r) => r._id === hint.reservationId)
                      : null;
                    if (reservation) {
                      void handleSeatReservation(reservation);
                      return;
                    }
                    setSeatTable(reservedTable);
                    setReservedTable(null);
                  }}
                  className="w-full rounded-xl bg-[var(--v-blue,#2563eb)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {(() => {
                    const rid = String(reservedTable._id || reservedTable.id || '');
                    const hint = reservationByTableId.get(rid);
                    const reservation = hint
                      ? todayReservations.find((r) => r._id === hint.reservationId)
                      : null;
                    const place = reservation
                      ? formatReservationSeatPlace(reservation)
                      : reservedTable.name || `Mesa ${reservedTable.number}`;
                    return `Sentar en ${place} y abrir pedido`;
                  })()}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReservedTable(null);
                    openReservationsPanel(false);
                  }}
                  className="w-full rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-800 dark:border-violet-800 dark:text-violet-200"
                >
                  Gestionar reservas
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => {
                    const table = reservedTable;
                    const tableId = String(table._id || table.id || '').trim();
                    if (!userId || !tableId) return;
                    void (async () => {
                      setBusyId(tableId);
                      try {
                        const { cancelled } = await cancelActiveReservationsForTable(userId, tableId, {
                          userId,
                          userName: actorName,
                        });
                        const updated = await changeTableStatusRequest(userId, tableId, 'available', {
                          currentGuests: 0,
                        });
                        setTables((prev) => patchTableList(prev, updated));
                        setReservedTable(null);
                        void reloadReservations();
                        toast.success(
                          cancelled > 0 ? 'Reserva cancelada · mesa libre' : 'Mesa liberada',
                        );
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'No se pudo cancelar la reserva');
                      } finally {
                        setBusyId('');
                      }
                    })();
                  }}
                  className="w-full rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
                >
                  Cancelar reserva
                </button>
                <button
                  type="button"
                  onClick={() => setReservedTable(null)}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <RestaurantTpvReservationsPanel
        open={reservationsPanelOpen}
        onClose={() => {
          setReservationsPanelOpen(false);
          setReservationsPanelStartCreate(false);
        }}
        userId={userId}
        businessId={businessId}
        actor={{ userId, userName: actorName }}
        tables={tables}
        seatingId={seatingReservationId}
        onSeat={handleSeatReservation}
        onChanged={handleReservationsChanged}
        startCreate={reservationsPanelStartCreate}
      />
      <RestaurantTpvKitchenPanel
        open={kitchenPanelOpen}
        onClose={() => setKitchenPanelOpen(false)}
      />
    </div>
  );
}
