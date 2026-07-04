import { useModalClose } from '../../../../hooks/useModalClose';
import { X } from 'lucide-react';
import type { ExtendedDiningTable, SalaRoom } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import { STATUS_LABELS } from './useSalaManager';
import { tablesForRoom } from '../../../../lib/salaRooms';

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: SalaRoom[];
  tables: ExtendedDiningTable[];
};

export function SalaManagerPreviewModal({ open, onClose, rooms, tables }: Props) {
  useModalClose(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Vista previa TPV</h2>
            <p className="text-sm text-gray-500">Así verá el camarero las mesas</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {rooms.map((room) => {
            const roomTables = tablesForRoom(tables, room.id).sort((a, b) => a.number - b.number);
            if (roomTables.length === 0) return null;
            return (
              <div key={room.id}>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{room.name}</h3>
                <p className="text-xs text-gray-500">{SALA_ROOM_TYPE_LABELS[room.roomType]}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {roomTables.map((t) => (
                    <div
                      key={t._id}
                      className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{t.number}</span>
                      <span className="text-[10px] text-gray-500">{t.capacity}p</span>
                      <span className="mt-1 text-[9px] text-gray-400">{STATUS_LABELS[t.status]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
