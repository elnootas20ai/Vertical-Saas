import { useMemo, useState } from 'react';
import { useModalClose } from '../../../../hooks/useModalClose';
import { X } from 'lucide-react';
import type { ExtendedDiningTable, SalaRoom } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import { computeRoomStats, tablesForRoom } from '../../../../lib/salaRooms';
import { resolveRestaurantTableLiveInfo } from '../../../../lib/restaurantTableDisplay';
import { RestaurantTableGrid } from '../../restaurant/RestaurantTableGrid';
import { RestaurantTpvZoneTabs } from '../../restaurant/RestaurantTpvZoneTabs';

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: SalaRoom[];
  tables: ExtendedDiningTable[];
};

export function SalaManagerPreviewModal({ open, onClose, rooms, tables }: Props) {
  useModalClose(open, onClose);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const visibleTables = useMemo(
    () => tables.filter((t) => t.active !== false && t.status !== 'hidden'),
    [tables],
  );

  const liveByTableId = useMemo(() => {
    const live = new Map<string, ReturnType<typeof resolveRestaurantTableLiveInfo>>();
    for (const table of visibleTables) {
      live.set(table._id, resolveRestaurantTableLiveInfo(table, null, null));
    }
    return live;
  }, [visibleTables]);

  const roomStats = useMemo(
    () => (roomId: string) => computeRoomStats(visibleTables, roomId),
    [visibleTables],
  );

  const resolvedRoomId = activeRoomId || rooms[0]?.id || null;
  const activeRoom = rooms.find((r) => r.id === resolvedRoomId) || rooms[0] || null;
  const roomTables = activeRoom
    ? tablesForRoom(visibleTables, activeRoom.id).sort((a, b) => a.number - b.number)
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-stone-100 shadow-2xl dark:bg-stone-950">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Vista previa TPV</h2>
            <p className="text-sm text-stone-500">Así verá el camarero las mesas en el TPV</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <RestaurantTpvZoneTabs
          rooms={rooms}
          activeRoomId={resolvedRoomId}
          roomStats={roomStats}
          onSelectRoom={setActiveRoomId}
        />

        {rooms.length <= 1 && activeRoom ? (
          <div className="shrink-0 border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
              {activeRoom.name}
              <span className="ml-2 text-xs font-normal text-stone-500">
                {SALA_ROOM_TYPE_LABELS[activeRoom.roomType]}
              </span>
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {visibleTables.length === 0 ? (
            <p className="py-12 text-center text-sm text-stone-500">No hay mesas visibles en esta sala.</p>
          ) : (
            <RestaurantTableGrid
              tables={roomTables}
              liveByTableId={liveByTableId}
              onSelectTable={() => {}}
              onSelectCounter={() => {}}
              readOnly
            />
          )}
        </div>

        <div className="shrink-0 border-t border-stone-200 bg-white px-4 py-2 text-[11px] text-stone-500 dark:border-stone-800 dark:bg-stone-900">
          Vista estática · en el TPV también verás cuentas abiertas y reservas del día
        </div>
      </div>
    </div>
  );
}
