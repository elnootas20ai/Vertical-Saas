/**
 * Sala en servicio en vivo — datos reales de zonas/mesas (sin mocks).
 * Modo normal: 1 clic → ficha. Libre = montar mesa (sin cobrar). Ocupada = pedir/ver cuenta.
 * Modo editar: capacidad / comensales +/- , añadir/quitar mesas y zonas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Clock, LayoutGrid, Minus, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { RestaurantSeatGuestsModal } from '../../components/saas/restaurant/RestaurantSeatGuestsModal';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import {
  changeTableStatusRequest,
  listDiningOrdersRequest,
  listDiningTablesRequest,
  listTableTicketStatsRequest,
  type DiningOrder,
  type DiningTable,
  type DiningTableStatus,
} from '../../lib/salaApi';
import { isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { ensureOpenDiningOrder, diningOrderDueAmount, countDiningOrderItems } from '../../lib/restaurantDiningTpv';
import { cancelActiveReservationsForTable } from '../../lib/restaurantReservationsApi';
import { tableStatusOnOpen } from '../../lib/restaurantTableStatus';
import { DELIVERY_CEO_TPV_PATH, RESTAURANT_CEO_TPV_PATH } from '../../lib/retailOpsPaths';
import { writeSalaTpvOpenTable } from '../../lib/salaTpvLaunch';
import type { SalaRoom, SalaRoomType } from '../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../lib/salaStudioTypes';
import { RestaurantAddTablesModal } from './RestaurantAddTablesModal';
import { RestaurantAddZoneModal } from './RestaurantAddZoneModal';
import { resolveTableCapacity } from './tableCapacity';

type Props = {
  rooms: SalaRoom[];
  tables: DiningTable[];
  storeLabel?: string;
  userId: string;
  businessId: string;
  actorName?: string;
  mapBusy?: boolean;
  onTablesChange: (tables: DiningTable[]) => void;
  onAddZone?: (input: {
    name: string;
    roomType: SalaRoomType;
    tableCount: number;
    defaultCapacity: number;
  }) => Promise<SalaRoom | void> | SalaRoom | void;
  onAddTables?: (input: {
    roomId: string;
    count: number;
    capacity: number;
  }) => Promise<void> | void;
  onUpdateTablePeople?: (input: {
    tableId: string;
    capacity?: number;
    currentGuests?: number;
  }) => Promise<void> | void;
  onRemoveTable?: (tableId: string) => Promise<void> | void;
  onRemoveZone?: (roomId: string) => Promise<void> | void;
  onRemount?: () => void;
  /** Bar/restaurante: abrir cuenta de mesa en Sala (sin pasar por elegir local / caja SaaS). */
  onOpenTableAccount?: (table: DiningTable, orderId?: string) => void;
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
    label: 'Ocupada',
    card: 'border-red-200 bg-red-50 text-red-950',
    badge: 'bg-red-600 text-white',
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

function formatEuro(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function minutesSinceIso(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

function formatDurationMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function isOpenDiningOrder(order: DiningOrder): boolean {
  return order.status === 'open' || order.status === 'served' || order.status === 'pending_payment';
}

function isOccupiedStatus(status: DiningTableStatus): boolean {
  return (
    status === 'occupied'
    || status === 'pending_order'
    || status === 'served'
    || status === 'pending_payment'
  );
}

/** Líneas del ticket TPV para la ficha de mesa. */
function diningOrderTicketLines(order: DiningOrder): Array<{
  id: string;
  label: string;
  qty: number;
  lineTotal: number;
  status: string;
}> {
  const out: Array<{ id: string; label: string; qty: number; lineTotal: number; status: string }> = [];
  for (const comanda of order.comandas || []) {
    if (comanda.status === 'cancelled') continue;
    for (const item of comanda.items || []) {
      if (item.status === 'cancelled') continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const name = String(item.name || 'Producto').trim() || 'Producto';
      const price = Number(item.price) || 0;
      out.push({
        id: String(item.id || `${comanda.id}-${name}-${out.length}`),
        label: name,
        qty,
        lineTotal: price * qty,
        status: String(item.status || comanda.status || ''),
      });
    }
  }
  return out;
}

function orderStatusLabel(status: string): string {
  if (status === 'pending_payment') return 'Pendiente de cobro';
  if (status === 'served') return 'Servido';
  if (status === 'open') return 'Abierto';
  return status || 'Abierto';
}

function itemStatusShort(status: string): string {
  if (status === 'pending' || status === 'sent_to_kitchen') return 'Cocina';
  if (status === 'in_preparation') return 'Prep.';
  if (status === 'ready') return 'Listo';
  if (status === 'served') return 'Servido';
  if (status === 'draft') return 'Borrador';
  return '';
}

function patchTableList(tables: DiningTable[], updated: DiningTable): DiningTable[] {
  const id = String(updated._id || updated.id || '');
  return tables.map((t) => (String(t._id || t.id) === id ? { ...t, ...updated } : t));
}

export function RestaurantSalaLiveView({
  rooms,
  tables,
  storeLabel,
  userId,
  businessId,
  actorName,
  mapBusy = false,
  onTablesChange,
  onAddZone,
  onAddTables,
  onUpdateTablePeople,
  onRemoveTable,
  onRemoveZone,
  onRemount,
  onOpenTableAccount,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const isDeliverySala = isStrictDeliveryBusinessType(currentBusiness?.businessType);
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms],
  );
  const [activeRoomId, setActiveRoomId] = useState(() => sortedRooms[0]?.id || '');
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [reservedTable, setReservedTable] = useState<DiningTable | null>(null);
  const [infoTable, setInfoTable] = useState<DiningTable | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoOpenOrder, setInfoOpenOrder] = useState<DiningOrder | null>(null);
  const [infoTodayAmount, setInfoTodayAmount] = useState(0);
  const [infoTodayTickets, setInfoTodayTickets] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editTable, setEditTable] = useState<DiningTable | null>(null);
  const [editCapacity, setEditCapacity] = useState(4);
  const [editGuests, setEditGuests] = useState(0);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddTables, setShowAddTables] = useState(false);
  const [busyId, setBusyId] = useState('');

  const softReloadTables = useCallback(() => {
    if (!userId || editMode) return;
    void listDiningTablesRequest(userId)
      .then((rows) => {
        const scoped = businessId
          ? rows.filter((t) => {
              const bid = String((t as { businessId?: string }).businessId || '').trim();
              return !bid || bid === businessId;
            })
          : rows;
        onTablesChange(scoped);
      })
      .catch(() => undefined);
  }, [userId, businessId, editMode, onTablesChange]);

  const salaSseHandlers = useMemo(
    () => ({
      'sala:table_status_changed': softReloadTables,
      'sala:table_updated': softReloadTables,
      'sala:tables_bulk_updated': softReloadTables,
      'sala:order_created': softReloadTables,
      'sala:order_updated': softReloadTables,
      'sala:order_closed': softReloadTables,
      'sala:order_cancelled': softReloadTables,
    }),
    [softReloadTables],
  );

  useSSE({
    userId: user?.user_id || user?.id || null,
    businessId: businessId || null,
    handlers: salaSseHandlers,
    enabled: Boolean(userId && businessId && !editMode),
  });

  const canEditMap = Boolean(
    onAddZone || onAddTables || onUpdateTablePeople || onRemoveTable || onRemoveZone || onRemount,
  );

  useEffect(() => {
    if (!sortedRooms.length) {
      setActiveRoomId('');
      return;
    }
    if (!sortedRooms.some((r) => r.id === activeRoomId)) {
      setActiveRoomId(sortedRooms[0].id);
    }
  }, [sortedRooms, activeRoomId]);

  useEffect(() => {
    if (!editTable) return;
    const id = String(editTable._id || editTable.id || '');
    if (!tables.some((t) => String(t._id || t.id) === id)) setEditTable(null);
  }, [tables, editTable]);

  useEffect(() => {
    if (!infoTable) return;
    const id = String(infoTable._id || infoTable.id || '');
    const live = tables.find((t) => String(t._id || t.id) === id);
    if (!live) {
      setInfoTable(null);
      return;
    }
    if (
      live.status !== infoTable.status
      || live.currentGuests !== infoTable.currentGuests
      || live.capacity !== infoTable.capacity
      || live.occupiedAt !== infoTable.occupiedAt
      || live.updatedAt !== infoTable.updatedAt
    ) {
      setInfoTable(live);
    }
  }, [tables, infoTable]);

  useEffect(() => {
    if (!infoTable || !userId) {
      setInfoOpenOrder(null);
      setInfoTodayAmount(0);
      setInfoTodayTickets(0);
      setInfoLoading(false);
      return;
    }
    const tableId = String(infoTable._id || infoTable.id || '').trim();
    if (!tableId) return;

    let cancelled = false;
    setInfoLoading(true);
    const day = todayYmd();

    void (async () => {
      try {
        const [orders, stats] = await Promise.all([
          listDiningOrdersRequest(userId, { tableId }),
          listTableTicketStatsRequest(userId, {
            businessId: businessId || undefined,
            tableId,
            dateFrom: day,
            dateTo: day,
          }),
        ]);
        if (cancelled) return;
        const open = orders.find(isOpenDiningOrder) || null;
        setInfoOpenOrder(open);
        setInfoTodayTickets(stats.length);
        setInfoTodayAmount(
          stats.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
        );
      } catch {
        if (!cancelled) {
          setInfoOpenOrder(null);
          setInfoTodayAmount(0);
          setInfoTodayTickets(0);
        }
      } finally {
        if (!cancelled) setInfoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [infoTable?._id, infoTable?.id, infoTable?.status, userId, businessId]);

  const activeRoom =
    sortedRooms.find((r) => r.id === activeRoomId) || sortedRooms[0] || null;
  const roomTables = activeRoom ? tablesForRoom(tables, activeRoom) : [];
  const freeCount = tables.filter((t) => t.status === 'available').length;

  const openEditTable = (table: DiningTable) => {
    setEditTable(table);
    setEditCapacity(resolveTableCapacity(table));
    setEditGuests(Math.max(0, Number(table.currentGuests) || 0));
  };

  const openTpvForTable = (table: DiningTable, orderId?: string) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId) return;
    writeSalaTpvOpenTable({ tableId, orderId });
    if (isDeliverySala) {
      navigate(`${DELIVERY_CEO_TPV_PATH}?mesa=${encodeURIComponent(tableId)}`);
      return;
    }
    // Bar/restaurante: cuenta/carta en Sala (pedir y luego cobrar).
    if (onOpenTableAccount) {
      setInfoTable(null);
      setSeatTable(null);
      setReservedTable(null);
      onOpenTableAccount(table, orderId);
      return;
    }
    navigate(`${RESTAURANT_CEO_TPV_PATH}?mesa=${encodeURIComponent(tableId)}`);
  };

  /** Solo montar mesa: ocupada + cuenta vacía. No abre cobro (nadie paga al sentarse). */
  const seatTableOnly = async (table: DiningTable, guests: number) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !businessId || !tableId) {
      toast.error('No se puede abrir la mesa');
      return;
    }
    setBusyId(tableId);
    try {
      const nextStatus = tableStatusOnOpen(table.status);
      const updated = await changeTableStatusRequest(userId, tableId, nextStatus, {
        currentGuests: guests,
      });
      onTablesChange(patchTableList(tables, updated));
      setSeatTable(null);
      setReservedTable(null);
      setInfoTable(null);

      if (isDeliverySala) {
        openTpvForTable(updated);
        return;
      }

      await ensureOpenDiningOrder({
        userId,
        businessId,
        tableId,
        tableNumber: table.number,
        tableName: table.name || `Mesa ${table.number}`,
        guests,
        createdBy: userId,
        createdByName: actorName || 'Sala',
        zone: table.zone || activeRoom?.name || '',
      });
      toast.success(
        `${updated.name || `Mesa ${updated.number}`} montada · ${guests} pax. Cuando quieras, toca la mesa para pedir.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo sentar en la mesa');
    } finally {
      setBusyId('');
    }
  };

  const markAvailable = async (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !tableId) return;
    setBusyId(tableId);
    try {
      const updated = await changeTableStatusRequest(userId, tableId, 'available', {
        currentGuests: 0,
      });
      onTablesChange(patchTableList(tables, updated));
      toast.success('Mesa marcada como libre');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo liberar la mesa');
    } finally {
      setBusyId('');
    }
  };

  const cancelTableReservation = async (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !tableId) return;
    setBusyId(tableId);
    try {
      const { cancelled } = await cancelActiveReservationsForTable(userId, tableId, {
        userId,
        userName: actorName || 'Sala',
      });
      const updated = await changeTableStatusRequest(userId, tableId, 'available', {
        currentGuests: 0,
      });
      onTablesChange(patchTableList(tables, updated));
      toast.success(
        cancelled > 0
          ? cancelled === 1
            ? 'Reserva cancelada · mesa libre'
            : `${cancelled} reservas canceladas · mesa libre`
          : 'Mesa liberada',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cancelar la reserva');
    } finally {
      setBusyId('');
    }
  };

  const handleTableClick = (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId || busyId === tableId) return;

    if (editMode) {
      openEditTable(table);
      return;
    }

    setSeatTable(null);
    setReservedTable(null);
    setInfoTable(table);
  };

  const toggleEditMode = () => {
    setEditMode((v) => {
      if (v) {
        setEditTable(null);
        setShowAddZone(false);
        setShowAddTables(false);
      } else {
        setInfoTable(null);
        setSeatTable(null);
        setReservedTable(null);
      }
      return !v;
    });
  };

  const saveEditTable = async () => {
    if (!editTable || !onUpdateTablePeople) return;
    const tableId = String(editTable._id || editTable.id || '');
    if (!tableId) return;
    const occupied = isOccupiedStatus(editTable.status);
    try {
      await Promise.resolve(
        onUpdateTablePeople({
          tableId,
          capacity: editCapacity,
          currentGuests: occupied ? editGuests : undefined,
        }),
      );
      setEditTable(null);
      toast.success('Mesa actualizada');
    } catch {
      /* toast en el padre */
    }
  };

  const canDeleteEdit =
    Boolean(onRemoveTable)
    && editTable
    && (editTable.status === 'available' || editTable.status === 'unavailable');

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Sala · En servicio
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
            {storeLabel || 'Tu local'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {sortedRooms.length} zonas · {tables.length} mesas · {freeCount} libres
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditMap && (
            <button
              type="button"
              disabled={mapBusy}
              onClick={toggleEditMode}
              className={`inline-flex items-center gap-1.5 rounded-[12px] border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                editMode
                  ? 'border-amber-500 bg-amber-50 text-amber-900'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
              }`}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
              {editMode ? 'Listo' : 'Editar'}
            </button>
          )}
          {editMode && onAddZone && (
            <button
              type="button"
              disabled={mapBusy}
              onClick={() => setShowAddZone(true)}
              className="inline-flex items-center gap-1.5 rounded-[12px] bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Nueva zona
            </button>
          )}
          {editMode && onRemount && (
            <button
              type="button"
              onClick={onRemount}
              className="rounded-[12px] border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600"
            >
              Rehacer mapa
            </button>
          )}
        </div>
      </header>

      {sortedRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[12px] border border-neutral-200 bg-white px-6 py-16 text-center">
          <LayoutGrid className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-neutral-800">
            Aún no hay zonas configuradas
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Crea la primera zona (salón, terraza, barra…) para empezar a servir.
          </p>
          {onAddZone ? (
            <button
              type="button"
              disabled={mapBusy}
              onClick={() => setShowAddZone(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Nueva zona
            </button>
          ) : onRemount ? (
            <button
              type="button"
              onClick={onRemount}
              className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Configurar sala
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {sortedRooms.map((room) => {
              const count = tablesForRoom(tables, room).length;
              const selected = (activeRoom?.id || '') === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className={`shrink-0 rounded-[12px] border px-4 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{room.name}</p>
                  <p className={`text-xs ${selected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    {SALA_ROOM_TYPE_LABELS[room.roomType] || room.roomType} · {count}{' '}
                    {room.roomType === 'barra' ? 'puestos' : 'mesas'}
                  </p>
                </button>
              );
            })}
            {editMode && onAddZone && (
              <button
                type="button"
                disabled={mapBusy}
                onClick={() => setShowAddZone(true)}
                className="shrink-0 rounded-[12px] border border-dashed border-neutral-300 bg-white px-4 py-2.5 text-left text-neutral-600 hover:border-neutral-400 disabled:opacity-50"
              >
                <p className="inline-flex items-center gap-1 text-sm font-semibold">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Zona
                </p>
                <p className="text-xs text-neutral-400">Terraza, barra…</p>
              </button>
            )}
          </div>

          {activeRoom && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-500">
                {SALA_ROOM_TYPE_LABELS[activeRoom.roomType]} · {roomTables.length}{' '}
                {activeRoom.roomType === 'barra' ? 'puestos' : 'mesas'}
                {editMode ? (
                  <span className="ml-2 font-medium text-amber-700">· Modo edición</span>
                ) : (
                  <span className="ml-2 text-neutral-400">· Libre: montar mesa · Ocupada: pedir / cobrar</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {editMode && onAddTables && (
                  <button
                    type="button"
                    disabled={mapBusy}
                    onClick={() => setShowAddTables(true)}
                    className="inline-flex items-center gap-1.5 rounded-[12px] border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:border-neutral-300 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Añadir {activeRoom.roomType === 'barra' ? 'puestos' : 'mesas'}
                  </button>
                )}
                {editMode && onRemoveZone && sortedRooms.length > 1 && (
                  <button
                    type="button"
                    disabled={mapBusy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Eliminar la zona «${activeRoom.name}»? Solo si todas sus mesas están libres.`,
                        )
                      ) {
                        return;
                      }
                      void Promise.resolve(onRemoveZone(activeRoom.id)).catch(() => undefined);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[12px] border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-500 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Quitar zona
                  </button>
                )}
              </div>
            </div>
          )}

          {editMode && (
            <div className="mb-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Toca una mesa para cambiar personas o eliminarla. Usa «Añadir» para mesas o zonas.
              Pulsa «Listo» para volver al servicio.
            </div>
          )}

          {roomTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[12px] border border-neutral-200 bg-white px-6 py-16 text-center">
              <LayoutGrid className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-neutral-800">
                Aún no hay {activeRoom?.roomType === 'barra' ? 'puestos' : 'mesas'} en esta zona
              </p>
              <p className="mt-1 max-w-sm text-sm text-neutral-500">
                {editMode
                  ? `«${activeRoom?.name}» está lista. Añade mesas o puestos de barra.`
                  : 'Pulsa «Editar» arriba para añadir mesas o puestos.'}
              </p>
              {editMode && onAddTables && activeRoom && (
                <button
                  type="button"
                  disabled={mapBusy}
                  onClick={() => setShowAddTables(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} />
                  Añadir {activeRoom.roomType === 'barra' ? 'puestos' : 'mesas'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {roomTables.map((table) => {
                const ui = STATUS_UI[table.status] || STATUS_UI.available;
                const capacity = resolveTableCapacity(table);
                const tableId = String(table._id || table.id || '');
                const busy = busyId === tableId;
                const selectedEdit =
                  editMode && editTable && String(editTable._id || editTable.id) === tableId;
                const seatedMins = minutesSinceIso(table.occupiedAt);
                return (
                  <button
                    key={tableId}
                    type="button"
                    disabled={busy || mapBusy}
                    onClick={() => handleTableClick(table)}
                    className={`relative rounded-[12px] border p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-60 ${ui.card} ${
                      selectedEdit ? 'ring-2 ring-amber-500 ring-offset-1' : ''
                    }`}
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
                        {!editMode && seatedMins != null && isOccupiedStatus(table.status) && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] opacity-70">
                            <Clock className="h-3 w-3" strokeWidth={1.5} />
                            {formatDurationMinutes(seatedMins)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ui.badge}`}
                      >
                        {editMode ? 'Editar' : ui.label}
                      </span>
                    </div>
                  </button>
                );
              })}
              {editMode && onAddTables && (
                <button
                  type="button"
                  disabled={mapBusy}
                  onClick={() => setShowAddTables(true)}
                  className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-neutral-300 bg-white/60 px-4 py-4 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-xs font-semibold">
                    Añadir {activeRoom?.roomType === 'barra' ? 'puesto' : 'mesa'}
                  </span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {infoTable && !editMode && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl sm:max-w-xl">
            {(() => {
              const ui = STATUS_UI[infoTable.status] || STATUS_UI.available;
              const capacity = resolveTableCapacity(infoTable);
              const seatedMins = minutesSinceIso(infoTable.occupiedAt);
              const openOrderId = infoOpenOrder
                ? String(infoOpenOrder._id || infoOpenOrder.id || '')
                : '';
              const ticketLines = infoOpenOrder ? diningOrderTicketLines(infoOpenOrder) : [];
              const due = infoOpenOrder ? diningOrderDueAmount(infoOpenOrder) : 0;
              const itemCount = infoOpenOrder ? countDiningOrderItems(infoOpenOrder) : 0;
              const comandaCount = (infoOpenOrder?.comandas || []).filter(
                (c) => c.status !== 'cancelled',
              ).length;
              return (
                <>
                  <div className="shrink-0 border-b border-neutral-100 px-5 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-neutral-900 sm:text-2xl">
                          {infoTable.name || `Mesa ${infoTable.number}`}
                        </h2>
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ui.badge}`}
                          >
                            {ui.label}
                          </span>
                          {activeRoom?.name || infoTable.zone || 'Sala'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInfoTable(null)}
                        className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Personas
                        </p>
                        <p className="mt-1 text-base font-semibold text-neutral-900">
                          {infoTable.currentGuests > 0
                            ? `${infoTable.currentGuests} / ${capacity}`
                            : `${capacity} pax`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Tiempo en mesa
                        </p>
                        <p className="mt-1 text-base font-semibold text-neutral-900">
                          {seatedMins != null && isOccupiedStatus(infoTable.status)
                            ? formatDurationMinutes(seatedMins)
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Facturado hoy
                        </p>
                        <p className="mt-1 text-base font-semibold text-neutral-900">
                          {infoLoading ? '…' : formatEuro(infoTodayAmount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Tickets hoy
                        </p>
                        <p className="mt-1 text-base font-semibold text-neutral-900">
                          {infoLoading ? '…' : infoTodayTickets}
                        </p>
                      </div>
                    </div>

                    <div className="mb-2 rounded-2xl border border-neutral-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Pedido TPV abierto
                        </p>
                        {infoOpenOrder ? (
                          <p className="text-xs font-medium text-neutral-500">
                            {orderStatusLabel(infoOpenOrder.status)}
                            {comandaCount > 0 ? ` · ${comandaCount} comanda${comandaCount === 1 ? '' : 's'}` : ''}
                          </p>
                        ) : null}
                      </div>

                      {infoLoading ? (
                        <p className="px-4 py-4 text-sm text-neutral-500">Cargando pedido…</p>
                      ) : infoOpenOrder ? (
                        <div className="px-4 py-3">
                          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900">
                                {formatEuro(due)}
                              </p>
                              <p className="mt-0.5 text-sm text-neutral-500">
                                {itemCount} artículo{itemCount === 1 ? '' : 's'}
                                {' · '}
                                {infoOpenOrder.guests || infoTable.currentGuests || 0} pax
                              </p>
                            </div>
                            {infoOpenOrder.createdByName ? (
                              <p className="text-xs text-neutral-400">
                                Abierto por {infoOpenOrder.createdByName}
                              </p>
                            ) : null}
                          </div>

                          {ticketLines.length > 0 ? (
                            <ul className="max-h-56 space-y-2 overflow-y-auto border-t border-neutral-100 pt-3 sm:max-h-72">
                              {ticketLines.map((line) => {
                                const st = itemStatusShort(line.status);
                                return (
                                  <li
                                    key={line.id}
                                    className="flex items-start justify-between gap-3 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium text-neutral-900">
                                        <span className="tabular-nums text-neutral-500">
                                          {line.qty}×
                                        </span>{' '}
                                        {line.label}
                                      </p>
                                      {st ? (
                                        <p className="mt-0.5 text-xs text-neutral-400">{st}</p>
                                      ) : null}
                                    </div>
                                    <p className="shrink-0 tabular-nums font-semibold text-neutral-800">
                                      {formatEuro(line.lineTotal)}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="border-t border-neutral-100 pt-3 text-sm text-neutral-500">
                              Sin líneas todavía — abre la carta para pedir.
                            </p>
                          )}

                          {infoOpenOrder.notes ? (
                            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              Nota: {infoOpenOrder.notes}
                            </p>
                          ) : null}

                          {Number(infoOpenOrder.discount) > 0 ? (
                            <p className="mt-2 text-xs text-neutral-500">
                              Descuento: −{formatEuro(Number(infoOpenOrder.discount) || 0)}
                              {infoOpenOrder.discountReason
                                ? ` (${infoOpenOrder.discountReason})`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="px-4 py-4 text-sm text-neutral-500">
                          Ningún pedido TPV abierto en esta mesa.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 space-y-2 border-t border-neutral-100 px-5 py-4 sm:px-6">
                    {infoTable.status === 'available' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSeatTable(infoTable);
                          setInfoTable(null);
                        }}
                        className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-base font-semibold text-white"
                      >
                        Montar mesa / sentar
                      </button>
                    )}
                    {infoTable.status === 'reserved' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSeatTable(infoTable);
                            setInfoTable(null);
                          }}
                          className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-base font-semibold text-white"
                        >
                          Sentar ahora
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void cancelTableReservation(infoTable).then(() => setInfoTable(null));
                          }}
                          className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-700"
                        >
                          Cancelar reserva
                        </button>
                      </>
                    )}
                    {infoTable.status === 'unavailable' && (
                      <button
                        type="button"
                        onClick={() => {
                          void markAvailable(infoTable).then(() => setInfoTable(null));
                        }}
                        className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-base font-semibold text-white"
                      >
                        Marcar libre
                      </button>
                    )}
                    {isOccupiedStatus(infoTable.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          openTpvForTable(infoTable, openOrderId || undefined);
                          setInfoTable(null);
                        }}
                        className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-base font-semibold text-white"
                      >
                        {infoOpenOrder ? 'Pedir / ver cuenta' : 'Abrir carta'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setInfoTable(null)}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-600"
                    >
                      Cerrar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {seatTable && !editMode && (
        <RestaurantSeatGuestsModal
          tableLabel={seatTable.name || `Mesa ${seatTable.number}`}
          capacity={resolveTableCapacity(seatTable)}
          defaultGuests={Math.min(2, resolveTableCapacity(seatTable))}
          confirmLabel="Montar mesa"
          onCancel={() => setSeatTable(null)}
          onConfirm={(guests) => void seatTableOnly(seatTable, guests)}
        />
      )}

      {reservedTable && !editMode && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-[12px] border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  {reservedTable.name || `Mesa ${reservedTable.number}`}
                </h2>
                <p className="text-sm text-neutral-500">Mesa reservada</p>
              </div>
              <button
                type="button"
                onClick={() => setReservedTable(null)}
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
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
                className="w-full rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Sentar ahora
              </button>
              <button
                type="button"
                onClick={() => {
                  void cancelTableReservation(reservedTable).then(() => setReservedTable(null));
                }}
                className="w-full rounded-[12px] border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700"
              >
                Cancelar reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {editTable && editMode && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-[12px] border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  {editTable.name || `Mesa ${editTable.number}`}
                </h2>
                <p className="text-sm text-neutral-500">Editar mesa</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTable(null)}
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-500">Capacidad (máx. personas)</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditCapacity((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <p className="min-w-[3rem] text-center text-2xl font-semibold tabular-nums">
                    {editCapacity}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditCapacity((n) => Math.min(40, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOccupiedStatus(editTable.status) && (
                <div>
                  <p className="mb-2 text-xs font-medium text-neutral-500">Comensales ahora</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditGuests((n) => Math.max(0, n - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <p className="min-w-[3rem] text-center text-2xl font-semibold tabular-nums">
                      {editGuests}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setEditGuests((n) => Math.min(Math.max(editCapacity, 1), n + 1))
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={mapBusy || !onUpdateTablePeople}
                onClick={() => void saveEditTable()}
                className="w-full rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Guardar
              </button>

              {canDeleteEdit && (
                <button
                  type="button"
                  disabled={mapBusy}
                  onClick={() => {
                    const id = String(editTable._id || editTable.id || '');
                    if (
                      !id
                      || !onRemoveTable
                      || !window.confirm('¿Eliminar esta mesa del mapa?')
                    ) {
                      return;
                    }
                    setEditTable(null);
                    void Promise.resolve(onRemoveTable(id)).catch(() => undefined);
                  }}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  Eliminar mesa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {onAddZone && (
        <RestaurantAddZoneModal
          open={showAddZone}
          busy={mapBusy}
          onClose={() => setShowAddZone(false)}
          onCreate={(input) => {
            void Promise.resolve(onAddZone(input)).then((created) => {
              setShowAddZone(false);
              if (created?.id) setActiveRoomId(created.id);
            });
          }}
        />
      )}

      {onAddTables && (
        <RestaurantAddTablesModal
          open={showAddTables}
          room={activeRoom}
          busy={mapBusy}
          onClose={() => setShowAddTables(false)}
          onConfirm={(input) => {
            if (!activeRoom) return;
            void Promise.resolve(
              onAddTables({ roomId: activeRoom.id, ...input }),
            ).then(() => setShowAddTables(false));
          }}
        />
      )}
    </div>
  );
}
