import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { ClearableNumberInput } from './ClearableNumberInput';
import { defaultCapacityForRoomType } from './restaurantSalaLiveEdit';

type Props = {
  open: boolean;
  room: SalaRoom | null;
  onClose: () => void;
  busy?: boolean;
  onConfirm: (input: { count: number; capacity: number }) => void;
};

export function RestaurantAddTablesModal({ open, room, onClose, busy, onConfirm }: Props) {
  const [count, setCount] = useState(2);
  const [capacity, setCapacity] = useState(4);

  useEffect(() => {
    if (!open || !room) return;
    setCount(2);
    setCapacity(defaultCapacityForRoomType(room.roomType));
  }, [open, room]);

  if (!open || !room) return null;

  const unit = room.roomType === 'barra' ? 'puestos de barra' : 'mesas';

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-[12px] border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Añadir {unit}</h2>
            <p className="mt-0.5 text-sm text-neutral-500">En «{room.name}»</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Cantidad
            </label>
            <ClearableNumberInput
              min={1}
              max={40}
              value={count}
              disabled={busy}
              autoFocus
              aria-label="Cantidad"
              onCommit={setCount}
              className="w-full rounded-[10px] border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Pax cada una
            </label>
            <ClearableNumberInput
              min={1}
              max={20}
              value={capacity}
              disabled={busy}
              aria-label="Pax cada una"
              onCommit={setCapacity}
              className="w-full rounded-[10px] border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(room.roomType === 'barra' ? [1, 2] : [2, 4, 6, 8]).map((pax) => (
            <button
              key={pax}
              type="button"
              disabled={busy}
              onClick={() => setCapacity(pax)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                capacity === pax
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 text-neutral-600'
              }`}
            >
              {pax} pax
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || count < 1}
          onClick={() => onConfirm({ count, capacity })}
          className="w-full rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Añadiendo…' : `Añadir ${count} ${unit}`}
        </button>
      </div>
    </div>
  );
}
