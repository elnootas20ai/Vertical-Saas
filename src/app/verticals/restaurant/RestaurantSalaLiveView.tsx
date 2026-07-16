/**
 * Sala en servicio en vivo — datos reales de zonas/mesas (sin mocks).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LayoutGrid, Plus, Users, X } from 'lucide-react';
import { RestaurantSeatGuestsModal } from '../../components/saas/restaurant/RestaurantSeatGuestsModal';
import {
  changeTableStatusRequest,
  type DiningTable,
  type DiningTableStatus,
} from '../../lib/salaApi';
import { ensureOpenDiningOrder } from '../../lib/restaurantDiningTpv';
import { tableStatusOnOpen } from '../../lib/restaurantTableStatus';
import { writeSalaTpvOpenTable } from '../../lib/salaTpvLaunch';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../lib/salaStudioTypes';
import { resolveTableCapacity } from './tableCapacity';

type Props = {
  rooms: SalaRoom[];
  tables: DiningTable[];
  storeLabel?: string;
  userId: string;
  businessId: string;
  actorName?: string;
  onTablesChange: (tables: DiningTable[]) => void;
  onAddFirstTable?: (roomId: string) => void;
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
  onTablesChange,
  onAddFirstTable,
  onRemount,
}: Props) {
  const navigate = useNavigate();
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms],
  );
  const [activeRoomId, setActiveRoomId] = useState(() => sortedRooms[0]?.id || '');
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [reservedTable, setReservedTable] = useState<DiningTable | null>(null);
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

  const activeRoom =
    sortedRooms.find((r) => r.id === activeRoomId) || sortedRooms[0] || null;
  const roomTables = activeRoom ? tablesForRoom(tables, activeRoom) : [];
  const freeCount = tables.filter((t) => t.status === 'available').length;

  const openTpvForTable = (table: DiningTable, orderId?: string) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId) return;
    writeSalaTpvOpenTable({ tableId, orderId });
    // TPV propio de sala (nunca /vertical/delivery/tpv).
    navigate(`/saas/caja/tpv?mesa=${encodeURIComponent(tableId)}`);
  };

  const seatAndOpen = async (table: DiningTable, guests: number) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !businessId || !tableId) {
      toast.error('No se puede abrir la mesa');
      return;
    }
    setBusyId(tableId);
    try {
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
      const nextStatus = tableStatusOnOpen(table.status);
      const updated = await changeTableStatusRequest(userId, tableId, nextStatus, {
        currentGuests: guests,
      });
      onTablesChange(patchTableList(tables, updated));
      setSeatTable(null);
      setReservedTable(null);
      // Nos quedamos en Sala (no saltar a /caja/tpv): al recargar sigues en sala.
      // Clic en mesa ocupada abre el TPV.
      writeSalaTpvOpenTable({ tableId, orderId: order._id });
      toast.success(`Mesa abierta · ${guests} comensal${guests === 1 ? '' : 'es'}`);
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
        {onRemount && (
          <button
            type="button"
            onClick={onRemount}
            className="rounded-[12px] border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600"
          >
            Rehacer mapa
          </button>
        )}
      </header>

      {sortedRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[12px] border border-neutral-200 bg-white px-6 py-16 text-center">
          <LayoutGrid className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-neutral-800">
            Aún no hay zonas configuradas
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Vuelve al asistente para crear la primera zona y sus mesas.
          </p>
          {onRemount && (
            <button
              type="button"
              onClick={onRemount}
              className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Configurar sala
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
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
                    {SALA_ROOM_TYPE_LABELS[room.roomType] || room.roomType} · {count} mesas
                  </p>
                </button>
              );
            })}
          </div>

          {roomTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[12px] border border-neutral-200 bg-white px-6 py-16 text-center">
              <LayoutGrid className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-neutral-800">
                Aún no hay mesas en esta zona
              </p>
              <p className="mt-1 max-w-sm text-sm text-neutral-500">
                «{activeRoom?.name}» está creada, pero sin mesas. Añade la primera para
                empezar a servir.
              </p>
              {onAddFirstTable && activeRoom && (
                <button
                  type="button"
                  onClick={() => onAddFirstTable(activeRoom.id)}
                  className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} />
                  Añadir la primera
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
                return (
                  <button
                    key={tableId}
                    type="button"
                    disabled={busy}
                    onClick={() => handleTableClick(table)}
                    className={`rounded-[12px] border p-4 text-left transition-opacity hover:opacity-90 disabled:opacity-60 ${ui.card}`}
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

      {seatTable && (
        <RestaurantSeatGuestsModal
          tableLabel={seatTable.name || `Mesa ${seatTable.number}`}
          capacity={resolveTableCapacity(seatTable)}
          defaultGuests={Math.min(2, resolveTableCapacity(seatTable))}
          onCancel={() => setSeatTable(null)}
          onConfirm={(guests) => void seatAndOpen(seatTable, guests)}
        />
      )}

      {reservedTable && (
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
    </div>
  );
}
