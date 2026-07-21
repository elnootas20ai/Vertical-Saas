/**
 * Sala en servicio en vivo — datos reales de zonas/mesas (sin mocks).
 * Modo normal: 1 clic → personas (si libre) → TPV.
 * Modo editar: capacidad / comensales +/- y eliminar mesa.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LayoutGrid, Minus, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { RestaurantSeatGuestsModal } from '../../components/saas/restaurant/RestaurantSeatGuestsModal';
import { useBusiness } from '../../context/BusinessContext';
import {
  changeTableStatusRequest,
  type DiningTable,
  type DiningTableStatus,
} from '../../lib/salaApi';
import { isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { ensureOpenDiningOrder } from '../../lib/restaurantDiningTpv';
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
}: Props) {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const isDeliverySala = isStrictDeliveryBusinessType(currentBusiness?.businessType);
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms],
  );
  const [activeRoomId, setActiveRoomId] = useState(() => sortedRooms[0]?.id || '');
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [reservedTable, setReservedTable] = useState<DiningTable | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTable, setEditTable] = useState<DiningTable | null>(null);
  const [editCapacity, setEditCapacity] = useState(4);
  const [editGuests, setEditGuests] = useState(0);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddTables, setShowAddTables] = useState(false);
  const [busyId, setBusyId] = useState('');

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
    const live = tables.find((t) => String(t._id || t.id) === id);
    if (!live) setEditTable(null);
  }, [tables, editTable]);

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
      // Delivery: TPV delivery (mostrador / recogida). Sin comanda de sala bar.
      navigate(`${DELIVERY_CEO_TPV_PATH}?mesa=${encodeURIComponent(tableId)}`);
      return;
    }
    navigate(`${RESTAURANT_CEO_TPV_PATH}?mesa=${encodeURIComponent(tableId)}`);
  };

  const seatAndOpen = async (table: DiningTable, guests: number) => {
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

      if (isDeliverySala) {
        openTpvForTable(updated);
        return;
      }

      const order = await ensureOpenDiningOrder({
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
      openTpvForTable(updated, order._id);
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

  const handleTableClick = (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId || busyId === tableId) return;

    if (editMode) {
      openEditTable(table);
      return;
    }

    if (table.status === 'available') {
      setSeatTable(table);
      return;
    }
    if (table.status === 'reserved') {
      setReservedTable(table);
      return;
    }
    if (table.status === 'unavailable') {
      void markAvailable(table);
      return;
    }
    if (isOccupiedStatus(table.status)) {
      openTpvForTable(table);
    }
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
          {onAddZone && (
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
          {onRemount && (
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
            {onAddZone && (
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
                ) : null}
              </p>
              <div className="flex flex-wrap gap-2">
                {onAddTables && (
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
                {(onUpdateTablePeople || onRemoveTable) && (
                  <button
                    type="button"
                    disabled={mapBusy}
                    onClick={() => {
                      setEditMode((v) => {
                        if (v) setEditTable(null);
                        return !v;
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-[12px] border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                      editMode
                        ? 'border-amber-500 bg-amber-50 text-amber-900'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    {editMode ? 'Listo' : 'Editar mesa'}
                  </button>
                )}
                {onRemoveZone && sortedRooms.length > 1 && (
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
              Toca una mesa para cambiar personas o eliminarla. Pulsa «Listo» para volver al servicio.
            </div>
          )}

          {roomTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[12px] border border-neutral-200 bg-white px-6 py-16 text-center">
              <LayoutGrid className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-neutral-800">
                Aún no hay {activeRoom?.roomType === 'barra' ? 'puestos' : 'mesas'} en esta zona
              </p>
              <p className="mt-1 max-w-sm text-sm text-neutral-500">
                «{activeRoom?.name}» está lista. Añade mesas o puestos de barra para empezar
                a sentar.
              </p>
              {onAddTables && activeRoom && (
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
                return (
                  <button
                    key={tableId}
                    type="button"
                    disabled={busy || mapBusy}
                    onClick={() => handleTableClick(table)}
                    className={`relative rounded-[12px] border p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-60 ${ui.card} ${
                      selectedEdit ? 'ring-2 ring-amber-500 ring-offset-1' : ''
                    } ${editMode ? 'cursor-pointer' : ''}`}
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
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ui.badge}`}
                      >
                        {editMode ? 'Editar' : ui.label}
                      </span>
                    </div>
                  </button>
                );
              })}
              {onAddTables && (
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

      {seatTable && !editMode && (
        <RestaurantSeatGuestsModal
          tableLabel={seatTable.name || `Mesa ${seatTable.number}`}
          capacity={resolveTableCapacity(seatTable)}
          defaultGuests={Math.min(2, resolveTableCapacity(seatTable))}
          onCancel={() => setSeatTable(null)}
          onConfirm={(guests) => void seatAndOpen(seatTable, guests)}
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
                  void markAvailable(reservedTable).then(() => setReservedTable(null));
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
