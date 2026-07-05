import { Plus, CheckCircle2, CircleDashed } from 'lucide-react';
import type { SalaRoom } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import { roomSetupStatus } from './useSalaManager';
import { SalaManagerStat } from './SalaManagerStat';

type Props = {
  rooms: SalaRoom[];
  activeRoomId: string;
  statsForRoom: (roomId: string) => { tableCount: number; capacity: number };
  onSelect: (roomId: string) => void;
  onNewRoom: () => void;
};

export function SalaRoomListPanel({ rooms, activeRoomId, statsForRoom, onSelect, onNewRoom }: Props) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200/80 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-950/50">
      <div className="border-b border-gray-200/80 px-4 py-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Salas</h2>
        <p className="mt-0.5 text-xs text-gray-500">{rooms.length} espacio{rooms.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {rooms.map((room) => {
          const stats = statsForRoom(room.id);
          const status = roomSetupStatus(stats.tableCount);
          const active = room.id === activeRoomId;
          const configured = status === 'configured';

          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelect(room.id)}
              className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                active
                  ? 'border-gray-900 bg-white shadow-sm dark:border-white dark:bg-gray-900'
                  : 'border-gray-200/80 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{room.name}</p>
                {configured ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Configurada
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <CircleDashed className="h-3 w-3" />
                    Incompleta
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">{SALA_ROOM_TYPE_LABELS[room.roomType]}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SalaManagerStat label="Mesas" value={stats.tableCount} compact />
                <SalaManagerStat label="Capacidad" value={`${stats.capacity} p.`} compact />
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onNewRoom}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-4 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:bg-white hover:text-gray-700 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-900 dark:hover:text-gray-300"
        >
          <Plus className="h-4 w-4" />
          Nueva sala
        </button>
      </div>
    </aside>
  );
}
