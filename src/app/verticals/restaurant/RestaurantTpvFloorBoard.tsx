/**
 * Plano de mesas del TPV sala (tras fichaje + caja abierta).
 * Tocar mesa → abre al instante el TPV core (carta/cobro) de esa mesa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  LayoutGrid,
  Loader2,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { RestaurantSeatGuestsModal } from '../../components/saas/restaurant/RestaurantSeatGuestsModal';
import {
  changeTableStatusRequest,
  getFloorConfigRequest,
  listDiningTablesRequest,
  type DiningOrder,
  type DiningTable,
  type DiningTableStatus,
} from '../../lib/salaApi';
import { ensureOpenDiningOrder, loadOpenDiningOrderForTable } from '../../lib/restaurantDiningTpv';
import { tableStatusOnOpen } from '../../lib/restaurantTableStatus';
import {
  writeSalaTpvOpenTable,
  consumeSalaTpvOpenTable,
  peekSalaTpvOpenTable,
} from '../../lib/salaTpvLaunch';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { readTpvTabletBinding } from '../../lib/tpvTabletSession';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../lib/salaStudioTypes';
import { resolveTableCapacity } from './tableCapacity';
import {
  RestaurantTpvTableAccount,
  buildCounterTableContext,
} from './RestaurantTpvTableAccount';
import type { RestaurantTableContext } from '../../components/saas/tpv/RestaurantTableTpvFlow';

type Props = {
  pdvId: string | null;
  pdvName?: string;
  tabletMode?: boolean;
  onChangeStore?: () => void;
};

const STATUS_UI: Record<
  DiningTableStatus,
  { label: string; card: string; badge: string }
> = {
  available: {
    label: 'Libre',
    card: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    badge: 'bg-emerald-600 text-white',
  },
  occupied: {
    label: 'Ocupada',
    card: 'border-red-200 bg-red-50 text-red-950',
    badge: 'bg-red-600 text-white',
  },
  pending_order: {
    label: 'Ocupada',
    card: 'border-red-200 bg-red-50 text-red-950',
    badge: 'bg-red-600 text-white',
  },
  served: {
    label: 'Ocupada',
    card: 'border-red-200 bg-red-50 text-red-950',
    badge: 'bg-red-600 text-white',
  },
  pending_payment: {
    label: 'Cuenta',
    card: 'border-amber-200 bg-amber-50 text-amber-950',
    badge: 'bg-amber-600 text-white',
  },
  unavailable: {
    label: 'Por limpiar',
    card: 'border-neutral-200 bg-neutral-100 text-neutral-800',
    badge: 'bg-neutral-500 text-white',
  },
  reserved: {
    label: 'Reservada',
    card: 'border-amber-200 bg-amber-50 text-amber-950',
    badge: 'bg-amber-500 text-white',
  },
  hidden: {
    label: 'Oculta',
    card: 'border-neutral-200 bg-neutral-50 text-neutral-700',
    badge: 'bg-neutral-400 text-white',
  },
};

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

  const userId = resolveBusinessDataUserId(user, currentBusiness) || user?.user_id || user?.id || '';
  const businessId = resolveBusinessScopeId(currentBusiness) || normalizeBusinessId(currentBusiness?.business_id);
  const actorName =
    String((user as { fullName?: string } | null)?.fullName || user?.name || user?.email || 'TPV sala').trim();
  // Código de tienda / tablet: solo operar el TPV. Cambiar local e Ir a Sala son de CEO.
  const isTabletOrCodeSession = tabletMode || Boolean(readTpvTabletBinding()?.pdvId);
  const showCeoFloorActions = !isTabletOrCodeSession;

  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [reservedTable, setReservedTable] = useState<DiningTable | null>(null);
  const [busyId, setBusyId] = useState('');
  const [activeTable, setActiveTable] = useState<DiningTable | RestaurantTableContext | null>(null);
  const [activeOrder, setActiveOrder] = useState<DiningOrder | null>(null);
  const autoOpenDoneRef = useRef(false);

  const urlTableId = String(searchParams.get('mesa') || '').trim();

  const loadFloor = useCallback(async () => {
    if (!userId || !businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [config, listed] = await Promise.all([
        getFloorConfigRequest(userId, { businessId }).catch(() => null),
        listDiningTablesRequest(userId).catch(() => []),
      ]);
      const nextRooms = Array.isArray(config?.rooms) ? (config.rooms as SalaRoom[]) : [];
      const nextTables = tablesForBusiness(listed || [], businessId);
      setRooms(nextRooms);
      setTables(nextTables);
      if (nextRooms.length > 0) {
        setActiveRoomId((prev) =>
          nextRooms.some((r) => r.id === prev) ? prev : nextRooms[0].id,
        );
      }
    } catch {
      toast.error('No se pudo cargar el plano de mesas');
    } finally {
      setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    void loadFloor();
  }, [loadFloor]);

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
  const freeCount = tables.filter((t) => t.status === 'available').length;

  const clearMesaParam = useCallback(() => {
    if (!searchParams.has('mesa')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('mesa');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openOrderPanel = useCallback(
    (table: DiningTable | RestaurantTableContext, order: DiningOrder | null) => {
      setActiveTable(table);
      setActiveOrder(order);
      setSeatTable(null);
      setReservedTable(null);
      setBusyId('');
      clearMesaParam();
    },
    [clearMesaParam],
  );

  /**
   * MVP: abrir el TPV core al instante (carta), y sincronizar cuenta/estado en segundo plano.
   * No bloquear la UI en “Abriendo…” si la API va lenta o falla.
   */
  const openAccount = useCallback(
    async (table: DiningTable, guests?: number) => {
      const tableId = String(table._id || table.id || '').trim();
      if (!tableId) {
        toast.error('No se puede abrir la mesa');
        return;
      }
      const guestCount =
        guests
        ?? (table.currentGuests > 0 ? table.currentGuests : Math.min(2, resolveTableCapacity(table)));

      // 1) Carta YA (mismo TPV funcional que core).
      openOrderPanel(table, null);
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
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo crear la cuenta de la mesa');
      } finally {
        setBusyId('');
      }
    },
    [userId, businessId, actorName, activeRoom?.name, openOrderPanel],
  );

  // Abrir mesa desde URL (?mesa=) o launch token de Sala.
  useEffect(() => {
    if (autoOpenDoneRef.current || loading || activeTable || !userId || tables.length === 0) {
      return;
    }
    const peeked = peekSalaTpvOpenTable()?.tableId || '';
    const tableId = urlTableId || peeked;
    if (!tableId) {
      return;
    }
    const match = tables.find((t) => String(t._id || t.id) === tableId);
    if (!match) {
      // Mesas aún no cargadas / otro local: no consumir el token ni borrar ?mesa=.
      return;
    }
    autoOpenDoneRef.current = true;
    consumeSalaTpvOpenTable();
    // Libre u ocupada: abrir TPV core al momento (comensales por defecto si está libre).
    void openAccount(match);
  }, [loading, activeTable, userId, tables, urlTableId, openAccount]);

  const handleTableClick = (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId || busyId === tableId || Boolean(activeTable)) return;

    // Mesa libre (como Mesa 1): un click → TPV core (carta). Sin modal previo.
    if (table.status === 'available') {
      void openAccount(table);
      return;
    }
    if (table.status === 'reserved') {
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
    setActiveTable(null);
    setActiveOrder(null);
    void loadFloor();
  };

  const handleOpenCounter = () => {
    openOrderPanel(buildCounterTableContext(), null);
  };

  // Panel TPV core (carta) — portal a body para no quedar atrapado por overflow/z-index del gate.
  if (activeTable) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex min-h-0 flex-col bg-gray-50 dark:bg-gray-950">
        <RestaurantTpvTableAccount
          userId={userId}
          table={activeTable}
          order={activeOrder}
          tabletMode
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
      </div>,
      document.body,
    );
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-stone-100 dark:bg-stone-950">
        <div className="px-6 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-stone-400" />
          <p className="text-sm text-stone-500">Cargando plano de mesas…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
              TPV sala · Elige dónde cobrar
            </p>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
              {pdvName || 'Tu local'}
            </h1>
            <p className="mt-0.5 text-sm text-stone-500">
              Toca una mesa o el mostrador para abrir el TPV (carta)
            </p>
          </div>
          {showCeoFloorActions ? (
            <div className="flex flex-wrap items-center gap-2">
              {onChangeStore ? (
                <button
                  type="button"
                  onClick={onChangeStore}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Cambiar local
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('/saas/sala')}
                className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Ir a Sala
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-5">
        {sortedRooms.length === 0 && tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-14 text-center dark:border-stone-700 dark:bg-stone-900">
            <LayoutGrid className="h-8 w-8 text-stone-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-100">
              Aún no hay mesas en este local
            </p>
            <p className="mt-1 max-w-sm text-sm text-stone-500">
              {showCeoFloorActions
                ? 'Puedes cobrar ya en el mostrador, o configurar mesas en Sala.'
                : 'Puedes cobrar ya en el mostrador.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleOpenCounter}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir TPV mostrador
              </button>
              {showCeoFloorActions ? (
                <button
                  type="button"
                  onClick={() => navigate('/saas/sala')}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
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
              className="mb-4 flex w-full items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Store className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-emerald-950 dark:text-emerald-50">
                  Mostrador
                </span>
                <span className="block text-sm text-emerald-800/80 dark:text-emerald-200/80">
                  Abrir TPV sin mesa (para llevar / barra)
                </span>
              </span>
            </button>

            {sortedRooms.length > 0 && (
              <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                {sortedRooms.map((room) => {
                  const count = tablesForRoom(tables, room).length;
                  const selected = (activeRoom?.id || '') === room.id;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setActiveRoomId(room.id)}
                      className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-stone-900 bg-stone-900 text-white'
                          : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100'
                      }`}
                    >
                      <p className="text-sm font-semibold">{room.name}</p>
                      <p className={`text-xs ${selected ? 'text-stone-300' : 'text-stone-500'}`}>
                        {SALA_ROOM_TYPE_LABELS[room.roomType] || room.roomType} · {count} mesas
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {(activeRoom ? roomTables : tables.filter((t) => t.active !== false && t.status !== 'hidden')).length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center dark:border-stone-700 dark:bg-stone-900">
                <LayoutGrid className="h-8 w-8 text-stone-300" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-100">
                  No hay mesas en esta zona
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  Puedes usar el Mostrador de arriba o configurar mesas en Sala.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {(activeRoom
                  ? roomTables
                  : tables
                      .filter((t) => t.active !== false && t.status !== 'hidden')
                      .sort((a, b) => (a.sortOrder || a.number) - (b.sortOrder || b.number))
                ).map((table) => {
                  const ui = STATUS_UI[table.status] || STATUS_UI.available;
                  const capacity = resolveTableCapacity(table);
                  const tableId = String(table._id || table.id || '');
                  const busy = busyId === tableId;
                  return (
                    <button
                      key={tableId}
                      type="button"
                      disabled={busy}
                      onClick={() => handleTableClick(table)}
                      className={`rounded-xl border p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-60 ${ui.card}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold">
                            {table.name || `Mesa ${table.number}`}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs opacity-80">
                            <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {capacity} pax
                            {table.currentGuests > 0 ? ` · ${table.currentGuests} sentados` : ''}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ui.badge}`}>
                          {ui.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
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
                  <p className="text-sm text-stone-500">Mesa reservada</p>
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
                  onClick={() => {
                    setSeatTable(reservedTable);
                    setReservedTable(null);
                  }}
                  className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Sentar y abrir pedido
                </button>
                <button
                  type="button"
                  onClick={() => setReservedTable(null)}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
