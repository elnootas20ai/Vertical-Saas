import { useState } from 'react';
import { Users, X } from 'lucide-react';

type Props = {
  tableLabel: string;
  capacity?: number;
  defaultGuests?: number;
  /** Texto del botón principal. Por defecto: Abrir mesa. */
  confirmLabel?: string;
  onConfirm: (guests: number) => void;
  onCancel: () => void;
};

const QUICK = [1, 2, 3, 4, 5, 6, 8, 10];

export function RestaurantSeatGuestsModal({
  tableLabel,
  capacity = 4,
  defaultGuests = 2,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [guests, setGuests] = useState(Math.min(Math.max(defaultGuests, 1), capacity || 12));

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">{tableLabel}</h2>
              <p className="text-xs text-gray-500">¿Cuántos comensales?</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {QUICK.filter((n) => !capacity || n <= capacity).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGuests(n)}
                className={`min-h-[48px] rounded-xl border-2 font-bold text-lg transition-all touch-manipulation ${
                  guests === n
                    ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">Otro:</label>
            <input
              type="number"
              min={1}
              max={capacity || 99}
              value={guests}
              onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-center font-bold"
            />
          </div>
          {capacity ? (
            <p className="text-xs text-center text-gray-400">Capacidad máxima: {capacity} personas</p>
          ) : null}
          <button
            type="button"
            onClick={() => onConfirm(guests)}
            className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm touch-manipulation"
          >
            {confirmLabel
              ? `${confirmLabel} · ${guests} comensal${guests === 1 ? '' : 'es'}`
              : `Abrir mesa · ${guests} comensal${guests === 1 ? '' : 'es'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
