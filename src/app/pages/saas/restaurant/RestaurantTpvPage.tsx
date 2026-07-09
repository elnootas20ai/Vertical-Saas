import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { toastActionError } from '../../../lib/userFacingError';
import {
  ArrowLeft,
  ClipboardCheck,
  LayoutGrid,
  LogOut,
  RefreshCw,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useVerticalCatalog } from '../../../hooks/useVerticalCatalog';
import { useTpvRegisterIfOpen } from '../../../components/saas/TpvRegisterGate';
import { RestaurantTableGrid, RESTAURANT_COUNTER_TABLE_ID } from '../../../components/saas/restaurant/RestaurantTableGrid';
import { RestaurantTpvZoneTabs } from '../../../components/saas/restaurant/RestaurantTpvZoneTabs';
import { RestaurantTpvShiftStrip } from '../../../components/saas/restaurant/RestaurantTpvShiftStrip';
import { useRestaurantTpvFloor } from '../../../hooks/useRestaurantTpvFloor';
import {
  TpvRapidoOrderFlow,
  type RestaurantTableContext,
} from '../TpvRapidoPage';
import { changeTableStatusRequest, listDiningTablesRequest, type DiningOrder } from '../../../lib/salaApi';
import { tableStatusOnPaid, tableStatusOnRelease, tableStatusOnOpen } from '../../../lib/restaurantTableStatus';
import { ensureOpenDiningOrder, loadOpenDiningOrderForTable } from '../../../lib/restaurantDiningTpv';
import { RestaurantSeatGuestsModal } from '../../../components/saas/restaurant/RestaurantSeatGuestsModal';
import { RestaurantTpvReservationsStrip } from '../../../components/saas/restaurant/RestaurantTpvReservationsStrip';
import { useRestaurantTpvReservationAlerts } from '../../../hooks/useRestaurantTpvReservationAlerts';
import { useTodayReservationsPoll } from '../../../hooks/useTodayReservationsPoll';
import type { RestaurantReservation } from '../../../lib/restaurantReservationTypes';
import type { SalaTpvOpenTablePayload } from '../../../lib/salaTpvLaunch';
import type { ExtendedDiningTable, SalaRoom } from '../../../lib/salaStudioTypes';
import { resolveTpvRegisterScope } from '../../../lib/tpvRegisterScope';
import { consumeSalaTpvOpenTable } from '../../../lib/salaTpvLaunch';
import { exitTpvTabletSessionPath, readTpvTabletBinding } from '../../../lib/tpvTabletSession';
import { requestTpvStockReviewOpen } from '../../../lib/tpvStockReview';
import { isRestaurantBusinessType } from '../../../lib/deliveryOpsTypes';
import { resolveRetailOpsHomePath } from '../../../lib/retailOpsPaths';
import { resolveRestaurantTpvPermissions } from '../../../lib/restaurantTpvPermissions';
import { WorkerTpvStaffConsumption } from '../worker/WorkerTpvStaffConsumption';

type Panel = 'floor' | 'order' | 'staff-consumption';

type SharedProps = {
  tabletMode?: boolean;
  ceoMode?: boolean;
  pdvName?: string | null;
  forcedPdvId?: string | null;
  onChangeStore?: () => void;
  staffConsumptionEnabled?: boolean;
};

type Props = SharedProps;

function toTableContext(
  table: ExtendedDiningTable,
  room?: SalaRoom | null,
  isCounter = false,
): RestaurantTableContext {
  return {
    id: isCounter ? RESTAURANT_COUNTER_TABLE_ID : table._id,
    number: isCounter ? 0 : table.number,
    name: isCounter ? 'Mostrador' : table.name || `Mesa ${table.number}`,
    capacity: isCounter ? 1 : table.capacity,
    roomName: room?.name,
    isCounter,
  };
}

function counterTableStub(): ExtendedDiningTable {
  return {
    _id: RESTAURANT_COUNTER_TABLE_ID,
    id: RESTAURANT_COUNTER_TABLE_ID,
    number: 0,
    name: 'Mostrador',
    capacity: 1,
    status: 'available',
  } as ExtendedDiningTable;
}

function RestaurantTpvFloorPanel({
  tabletMode = false,
  ceoMode = false,
  pdvName = null,
  onChangeStore,
  staffConsumptionEnabled = false,
  onOpenTable,
  onOpenStaffConsumption,
  onOpenSeatedTable,
  pendingTableOpen = null,
  onPendingTableOpenHandled,
  todayReservations = [],
  seatingReservationId = null,
  onSeatFromReservation,
}: SharedProps & {
  onOpenTable: (ctx: RestaurantTableContext, source?: ExtendedDiningTable) => void;
  onOpenStaffConsumption: () => void;
  onOpenSeatedTable: (ctx: RestaurantTableContext, order: DiningOrder | null) => void;
  pendingTableOpen?: SalaTpvOpenTablePayload | null;
  onPendingTableOpenHandled?: () => void;
  todayReservations?: RestaurantReservation[];
  seatingReservationId?: string | null;
  onSeatFromReservation?: (reservation: RestaurantReservation) => void;
}) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const { config } = useVerticalCatalog();
  const register = useTpvRegisterIfOpen();
  const navigate = useNavigate();
  const location = useLocation();

  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () =>
      resolveTpvRegisterScope({
        currentBusiness,
        tabletBinding,
        authUser: user,
        pathname: location.pathname,
      }),
    [currentBusiness, tabletBinding, user, location.pathname],
  );
  const userId = registerScope.effectiveDataUserId;
  const businessId = registerScope.scopeBusinessId;

  const { rooms, tables, liveByTableId, loading, error, reload, summary, roomStats, tablesInRoom } =
    useRestaurantTpvFloor(userId, businessId);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const floorScrollRef = useRef<HTMLDivElement>(null);
  const staleTablesCleanedRef = useRef(false);
  const pendingOpenHandledRef = useRef(false);

  useEffect(() => {
    floorScrollRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!userId || loading || staleTablesCleanedRef.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const stale = tables.filter((table) => {
      if (['available', 'unavailable', 'hidden'].includes(table.status)) return false;
      if (liveByTableId.get(table._id)?.hasOpenAccount) return false;
      const day = String(table.occupiedAt || '').slice(0, 10);
      return Boolean(day && day < today);
    });
    if (stale.length === 0) {
      staleTablesCleanedRef.current = true;
      return;
    }
    staleTablesCleanedRef.current = true;
    void (async () => {
      for (const table of stale) {
        try {
          await changeTableStatusRequest(userId, table._id, 'available', {
            currentGuests: 0,
            occupiedBy: '',
          });
        } catch {
          /* ignore */
        }
      }
      await reload();
    })();
  }, [userId, loading, tables, liveByTableId, reload]);

  useEffect(() => {
    if (pendingOpenHandledRef.current || !pendingTableOpen || loading || !userId) return;
    const table = tables.find((t) => t._id === pendingTableOpen.tableId);
    if (!table) return;
    pendingOpenHandledRef.current = true;
    void (async () => {
      try {
        const room = rooms.find((r) => r.id === table.roomId);
        const order = await loadOpenDiningOrderForTable(userId, table._id);
        onOpenSeatedTable(toTableContext(table, room), order);
        onPendingTableOpenHandled?.();
      } catch {
        pendingOpenHandledRef.current = false;
      }
    })();
  }, [pendingTableOpen, loading, userId, tables, rooms, onOpenSeatedTable, onPendingTableOpenHandled]);

  const resolvedRoomId = activeRoomId || rooms[0]?.id || null;
  const activeRoom = rooms.find((r) => r.id === resolvedRoomId) || rooms[0] || null;
  const roomTables = activeRoom ? tablesInRoom(activeRoom.id) : [];

  const storeLabel =
    pdvName ||
    register?.session?.pointOfSaleName ||
    register?.session?.terminalName ||
    'Local';

  const openAccountsCount = useMemo(
    () => [...liveByTableId.values()].filter((l) => l.hasOpenAccount).length,
    [liveByTableId],
  );

  const openTable = useCallback(
    (ctx: RestaurantTableContext, sourceTable?: ExtendedDiningTable) => {
      if (sourceTable?.status === 'unavailable') {
        toast.error('Mesa no disponible');
        return;
      }
      onOpenTable(ctx, sourceTable);
    },
    [onOpenTable],
  );

  const handleSelectTable = useCallback(
    (table: ExtendedDiningTable) => {
      void openTable(toTableContext(table, activeRoom), table);
    },
    [openTable, activeRoom],
  );

  const handleSelectCounter = useCallback(() => {
    void openTable(toTableContext(counterTableStub(), activeRoom, true));
  }, [openTable, activeRoom]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const handleGoBack = useCallback(() => {
    if (tabletBinding) {
      navigate(exitTpvTabletSessionPath(), { replace: true });
      return;
    }
    if (location.pathname.startsWith('/saas/caja')) {
      navigate('/saas/caja');
      return;
    }
    try {
      if (window.history.length > 1) {
        navigate(-1);
        return;
      }
    } catch {
      /* ignore */
    }
    navigate(resolveRetailOpsHomePath(currentBusiness?.businessType));
  }, [tabletBinding, location.pathname, navigate, currentBusiness?.businessType]);

  const handleExitCeo = useCallback(() => {
    navigate('/saas/caja', { replace: true });
  }, [navigate]);

  const showStockAction = config.features?.stock !== false;
  const toolbarBtn =
    'inline-flex shrink-0 min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 touch-manipulation transition-colors hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
      <div
        className={`shrink-0 border-b border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 ${
          tabletMode ? 'px-2 py-2' : 'px-3 py-2'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            title="Volver"
            aria-label="Volver"
            className={toolbarBtn}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <LayoutGrid className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <h1 className={`truncate font-bold text-stone-900 dark:text-stone-50 ${tabletMode ? 'text-sm' : 'text-base'}`}>
                {activeRoom?.name || 'Sala'} · {storeLabel}
              </h1>
            </div>
            <p className="truncate text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
              {summary.availableCount} libres · {summary.occupiedCount} ocupadas
              {openAccountsCount > 0 ? ` · ${openAccountsCount} para cobrar` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {staffConsumptionEnabled ? (
              <button
                type="button"
                onClick={onOpenStaffConsumption}
                title="Consumo equipo"
                aria-label="Consumo equipo"
                className={toolbarBtn}
              >
                <UtensilsCrossed className="h-4 w-4" />
              </button>
            ) : null}
            {showStockAction ? (
              <button
                type="button"
                onClick={() => requestTpvStockReviewOpen()}
                title="Revisión de stock"
                aria-label="Revisión de stock"
                className={toolbarBtn}
              >
                <ClipboardCheck className="h-4 w-4" />
              </button>
            ) : null}
            {ceoMode && onChangeStore ? (
              <button
                type="button"
                onClick={onChangeStore}
                title="Cambiar tienda"
                aria-label="Cambiar tienda"
                className={toolbarBtn}
              >
                <Store className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              title="Actualizar mesas"
              aria-label="Actualizar mesas"
              className={toolbarBtn}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {ceoMode ? (
              <button
                type="button"
                onClick={handleExitCeo}
                title="Salir del TPV"
                aria-label="Salir del TPV"
                className={`${toolbarBtn} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40`}
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <RestaurantTpvZoneTabs
        rooms={rooms}
        activeRoomId={resolvedRoomId}
        roomStats={roomStats}
        onSelectRoom={setActiveRoomId}
        compact={tabletMode}
      />

      <RestaurantTpvReservationsStrip
        reservations={todayReservations}
        seatingId={seatingReservationId}
        onSeat={(reservation) => onSeatFromReservation?.(reservation)}
        compact={tabletMode}
        defaultOpen={false}
      />

      <div
        ref={floorScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3"
      >
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-stone-500">
            Cargando mesas…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Reintentar
            </button>
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <LayoutGrid className="h-12 w-12 text-stone-400" />
            <div>
              <p className="font-semibold text-stone-800 dark:text-stone-100">Sin mesas configuradas</p>
              <p className="mt-1 text-sm text-stone-500">
                Configura salas y mesas en Sala, o usa Mostrador para cobrar al instante.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/saas/sala')}
              className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Ir a configurar sala
            </button>
            <div className="w-full max-w-md pt-4">
              <RestaurantTableGrid
                tables={[]}
                liveByTableId={liveByTableId}
                onSelectTable={() => {}}
                onSelectCounter={handleSelectCounter}
                compact={tabletMode}
              />
            </div>
          </div>
        ) : (
          <RestaurantTableGrid
            tables={roomTables}
            liveByTableId={liveByTableId}
            onSelectTable={handleSelectTable}
            onSelectCounter={handleSelectCounter}
            compact={tabletMode}
          />
        )}
      </div>

      <RestaurantTpvShiftStrip
        registerSession={register?.session}
        summary={summary}
        liveByTableId={liveByTableId}
        compact={tabletMode}
      />
    </div>
  );
}

function RestaurantTpvOrderPanel({
  table,
  diningOrder: initialDiningOrder,
  tabletMode = false,
  onBack,
  onComplete,
  onDiningOrderChange,
  onTableChange,
}: {
  table: RestaurantTableContext;
  diningOrder?: DiningOrder | null;
  tabletMode?: boolean;
  onBack: () => void;
  onComplete: () => void;
  onDiningOrderChange?: (order: DiningOrder) => void;
  onTableChange?: (table: RestaurantTableContext, order: DiningOrder) => void;
}) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const location = useLocation();
  const register = useTpvRegisterIfOpen();
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () =>
      resolveTpvRegisterScope({
        currentBusiness,
        tabletBinding,
        authUser: user,
        pathname: location.pathname,
      }),
    [currentBusiness, tabletBinding, user, location.pathname],
  );
  const userId = registerScope.effectiveDataUserId;
  const [diningOrder, setDiningOrder] = useState<DiningOrder | null>(initialDiningOrder || null);
  const permissions = useMemo(() => resolveRestaurantTpvPermissions(user), [user]);

  useEffect(() => {
    setDiningOrder(initialDiningOrder || null);
  }, [initialDiningOrder?._id, initialDiningOrder?.updatedAt]);

  useEffect(() => {
    if (!userId || table.isCounter) return;
    let cancelled = false;
    void (async () => {
      const order = await loadOpenDiningOrderForTable(userId, table.id);
      if (!cancelled && order) {
        setDiningOrder(order);
        onDiningOrderChange?.(order);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, table.id, table.isCounter, onDiningOrderChange]);

  const handleDiningOrderUpdated = useCallback(
    (order: DiningOrder) => {
      setDiningOrder(order);
      onDiningOrderChange?.(order);
    },
    [onDiningOrderChange],
  );

  const handleTableChanged = useCallback(
    (nextTable: RestaurantTableContext, order: DiningOrder) => {
      setDiningOrder(order);
      onDiningOrderChange?.(order);
      onTableChange?.(nextTable, order);
    },
    [onDiningOrderChange, onTableChange],
  );

  const handleBack = useCallback(async () => {
    onBack();
  }, [onBack]);

  const handleComplete = useCallback(async () => {
    if (!table.isCounter && userId && table.id !== RESTAURANT_COUNTER_TABLE_ID) {
      try {
        await changeTableStatusRequest(userId, table.id, tableStatusOnPaid(), {
          currentGuests: 0,
          occupiedBy: '',
        });
      } catch {
        /* silent */
      }
    }
    onComplete();
  }, [table.id, table.isCounter, userId, onComplete]);

  return (
    <TpvRapidoOrderFlow
      tabletMode={tabletMode}
      restaurantMode
      restaurantTable={table}
      restaurantDiningOrder={diningOrder}
      onRestaurantDiningOrderUpdated={handleDiningOrderUpdated}
      onRestaurantTableChange={handleTableChanged}
      restaurantPermissions={permissions}
      onBack={() => void handleBack()}
      onRestaurantOrderComplete={() => void handleComplete()}
      embeddedInRestaurantTpv
      registerOverride={register || undefined}
    />
  );
}

function RestaurantTpvStaffPanel({
  forcedPdvId = null,
  pdvName = null,
  onBack,
}: {
  forcedPdvId?: string | null;
  pdvName?: string | null;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const register = useTpvRegisterIfOpen();
  const location = useLocation();
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () =>
      resolveTpvRegisterScope({
        currentBusiness,
        tabletBinding,
        authUser: user,
        pathname: location.pathname,
      }),
    [currentBusiness, tabletBinding, user, location.pathname],
  );
  const userId = registerScope.effectiveDataUserId;

  const storeLabel =
    pdvName ||
    register?.session?.pointOfSaleName ||
    register?.session?.terminalName ||
    'Local';

  if (!register) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Abre la caja de la tienda antes de registrar consumo del equipo.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Volver al TPV
        </button>
      </div>
    );
  }

  return (
    <WorkerTpvStaffConsumption
      userId={userId || ''}
      onBack={onBack}
      register={register}
      salesPointId={forcedPdvId || register.session?.pointOfSaleId || ''}
      salesPointName={storeLabel}
    />
  );
}

export function RestaurantTpvPage({
  tabletMode = false,
  ceoMode = false,
  pdvName = null,
  forcedPdvId = null,
  onChangeStore,
  staffConsumptionEnabled = false,
}: Props) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const location = useLocation();
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () =>
      resolveTpvRegisterScope({
        currentBusiness,
        tabletBinding,
        authUser: user,
        pathname: location.pathname,
      }),
    [currentBusiness, tabletBinding, user, location.pathname],
  );
  const userId = registerScope.effectiveDataUserId;
  const businessId = registerScope.scopeBusinessId;
  const register = useTpvRegisterIfOpen();

  const [panel, setPanel] = useState<Panel>('floor');
  const [selectedTable, setSelectedTable] = useState<RestaurantTableContext | null>(null);
  const [diningOrder, setDiningOrder] = useState<DiningOrder | null>(null);
  const [seatTarget, setSeatTarget] = useState<RestaurantTableContext | null>(null);
  const [seating, setSeating] = useState(false);
  const pendingTableOpenRef = useRef(consumeSalaTpvOpenTable());
  const [seatingReservationId, setSeatingReservationId] = useState<string | null>(null);
  const { todayReservations, reloadReservations } = useTodayReservationsPoll(userId);

  const actor = useMemo(
    () => ({
      userId: user?.user_id || user?.id || '',
      userName: user?.fullName || 'TPV',
    }),
    [user],
  );

  const handleOpenSeatedTable = useCallback((ctx: RestaurantTableContext, order: DiningOrder | null) => {
    setSelectedTable(ctx);
    setDiningOrder(order);
    setPanel('order');
  }, []);

  const handleSeatFromReservation = useCallback(
    async (reservation: RestaurantReservation) => {
      if (!userId || !businessId) return;
      if (!reservation.tableId) {
        toast.error('Asigna una mesa a la reserva antes de sentar');
        return;
      }
      setSeatingReservationId(reservation._id);
      try {
        const { seatGuest } = await import('../../../lib/restaurantReservationsApi');
        const { tableId } = await seatGuest(userId, reservation, actor, businessId);
        const tablesData = await listDiningTablesRequest(userId);
        const table = tablesData.find((t) => t._id === tableId);
        if (!table) throw new Error('Mesa no encontrada');
        const order = await loadOpenDiningOrderForTable(userId, tableId);
        handleOpenSeatedTable(
          {
            id: table._id,
            number: table.number,
            name: table.name || `Mesa ${table.number}`,
            capacity: table.capacity,
            roomName: table.zone || '',
            isCounter: false,
          },
          order,
        );
        toast.success(`${reservation.guestName || 'Cliente'} sentado`);
        void reloadReservations();
      } catch (err: unknown) {
        toastActionError(err, 'sentar_cliente', 'No se pudo sentar al cliente');
      } finally {
        setSeatingReservationId(null);
      }
    },
    [userId, businessId, actor, handleOpenSeatedTable, reloadReservations],
  );

  useRestaurantTpvReservationAlerts(todayReservations, handleSeatFromReservation);

  const handlePendingTableOpenHandled = useCallback(() => {
    pendingTableOpenRef.current = null;
  }, []);

  const handleRequestOpenTable = useCallback(
    (ctx: RestaurantTableContext, sourceTable?: ExtendedDiningTable) => {
      if (ctx.isCounter) {
        setSelectedTable(ctx);
        setDiningOrder(null);
        setPanel('order');
        return;
      }
      if (sourceTable?.status === 'unavailable') {
        toast.error('Mesa no disponible');
        return;
      }

      const alreadySeated = Boolean(
        sourceTable
        && ['occupied', 'pending_order', 'pending_payment', 'served'].includes(sourceTable.status),
      );

      if (!userId) {
        if (alreadySeated) {
          handleOpenSeatedTable(ctx, null);
          return;
        }
        setSeatTarget(ctx);
        return;
      }

      void (async () => {
        try {
          let order = await loadOpenDiningOrderForTable(userId, ctx.id);
          if (!order && alreadySeated && sourceTable) {
            order = await ensureOpenDiningOrder({
              userId,
              businessId: businessId || '',
              tableId: ctx.id,
              tableNumber: ctx.number,
              tableName: ctx.name,
              guests: Math.max(1, sourceTable.currentGuests || 2),
              createdBy: register?.selectedOrderTakerId || user?.user_id || user?.id || '',
              createdByName: user?.fullName || 'TPV',
              zone: ctx.roomName || '',
            });
          }
          if (order || alreadySeated) {
            handleOpenSeatedTable(ctx, order);
            return;
          }
        } catch {
          /* abrir modal de comensales */
        }
        setSeatTarget(ctx);
      })();
    },
    [userId, businessId, register?.selectedOrderTakerId, user, handleOpenSeatedTable],
  );

  const handleConfirmSeat = useCallback(
    async (guests: number) => {
      if (!seatTarget || !userId) return;
      setSeating(true);
      try {
        let order = await loadOpenDiningOrderForTable(userId, seatTarget.id);
        if (!order) {
          order = await ensureOpenDiningOrder({
            userId,
            businessId: businessId || '',
            tableId: seatTarget.id,
            tableNumber: seatTarget.number,
            tableName: seatTarget.name,
            guests,
            createdBy: register?.selectedOrderTakerId || user?.user_id || user?.id || '',
            createdByName: user?.fullName || 'TPV',
            zone: seatTarget.roomName || '',
          });
          await changeTableStatusRequest(userId, seatTarget.id, tableStatusOnOpen('available'), {
            currentGuests: guests,
            occupiedBy: user?.fullName || 'TPV',
          });
        }
        setSelectedTable(seatTarget);
        setDiningOrder(order);
        setPanel('order');
        setSeatTarget(null);
      } catch (err: unknown) {
        toastActionError(err, 'abrir_mesa', 'No se pudo abrir la mesa');
      } finally {
        setSeating(false);
      }
    },
    [seatTarget, userId, businessId, register?.selectedOrderTakerId, user],
  );

  const handleTableChange = useCallback((ctx: RestaurantTableContext, order: DiningOrder) => {
    setSelectedTable(ctx);
    setDiningOrder(order);
  }, []);

  const handleBackToFloor = useCallback(() => {
    setPanel('floor');
    setSelectedTable(null);
    setDiningOrder(null);
  }, []);

  return (
    <>
      {seatTarget ? (
        <RestaurantSeatGuestsModal
          tableLabel={seatTarget.name || `Mesa ${seatTarget.number}`}
          capacity={seatTarget.capacity}
          defaultGuests={2}
          onConfirm={(guests) => void handleConfirmSeat(guests)}
          onCancel={() => !seating && setSeatTarget(null)}
        />
      ) : null}
      {panel === 'staff-consumption' ? (
        <RestaurantTpvStaffPanel
          forcedPdvId={forcedPdvId}
          pdvName={pdvName}
          onBack={() => setPanel('floor')}
        />
      ) : panel === 'order' && selectedTable ? (
        <RestaurantTpvOrderPanel
          table={selectedTable}
          diningOrder={diningOrder}
          tabletMode={tabletMode}
          onBack={handleBackToFloor}
          onComplete={handleBackToFloor}
          onDiningOrderChange={setDiningOrder}
          onTableChange={handleTableChange}
        />
      ) : (
        <RestaurantTpvFloorPanel
          tabletMode={tabletMode}
          ceoMode={ceoMode}
          pdvName={pdvName}
          onChangeStore={onChangeStore}
          staffConsumptionEnabled={staffConsumptionEnabled}
          onOpenTable={handleRequestOpenTable}
          onOpenStaffConsumption={() => setPanel('staff-consumption')}
          onOpenSeatedTable={handleOpenSeatedTable}
          pendingTableOpen={pendingTableOpenRef.current}
          onPendingTableOpenHandled={handlePendingTableOpenHandled}
          todayReservations={todayReservations}
          seatingReservationId={seatingReservationId}
          onSeatFromReservation={(reservation) => void handleSeatFromReservation(reservation)}
        />
      )}
    </>
  );
}
