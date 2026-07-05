import type { SalaRoom } from '../../../lib/salaStudioTypes';
import { occupancyBarColor } from './restaurantTableTileUi';

type RoomStats = {
  tableCount: number;
  occupiedCount: number;
};

type Props = {
  rooms: SalaRoom[];
  activeRoomId: string | null;
  roomStats: (roomId: string) => RoomStats;
  onSelectRoom: (roomId: string) => void;
  compact?: boolean;
};

export function RestaurantTpvZoneTabs({
  rooms,
  activeRoomId,
  roomStats,
  onSelectRoom,
  compact = false,
}: Props) {
  if (rooms.length <= 1) return null;

  return (
    <div
      className={`shrink-0 border-b border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-950 ${
        compact ? 'px-2 py-2' : 'px-3 py-2.5'
      }`}
    >
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {rooms.map((room) => {
          const stats = roomStats(room.id);
          const free = Math.max(0, stats.tableCount - stats.occupiedCount);
          const ratio = stats.tableCount > 0 ? stats.occupiedCount / stats.tableCount : 0;
          const active = room.id === activeRoomId;
          const barColor = occupancyBarColor(ratio);

          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelectRoom(room.id)}
              className={`shrink-0 min-w-[140px] max-w-[200px] rounded-xl border px-3 py-2.5 text-left transition-colors touch-manipulation min-h-[56px] ${
                active
                  ? 'border-stone-800 bg-stone-50 dark:border-stone-300 dark:bg-stone-900'
                  : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900/40 dark:hover:border-stone-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: room.color || '#78716c' }}
                />
                <span
                  className={`truncate text-sm font-semibold ${
                    active ? 'text-stone-900 dark:text-stone-50' : 'text-stone-700 dark:text-stone-200'
                  }`}
                >
                  {room.name}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
                {free} libre{free === 1 ? '' : 's'} · {stats.occupiedCount}/{stats.tableCount}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
