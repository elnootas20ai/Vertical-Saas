import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { computeEqualSplitAmounts } from '../../../lib/restaurantDiningTpv';

function formatEuro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

type Props = {
  total: number;
  onConfirm: (parts: number) => void;
  onClose: () => void;
  submitting?: boolean;
};

export function RestaurantSplitBillModal({ total, onConfirm, onClose, submitting = false }: Props) {
  const [parts, setParts] = useState(2);

  const preview = useMemo(
    () => computeEqualSplitAmounts(total, parts),
    [total, parts],
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Dividir cuenta</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total a dividir: <span className="font-bold tabular-nums">{formatEuro(total)}</span>
          </p>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              ¿Entre cuántos?
            </label>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setParts(n)}
                  className={`min-w-[44px] min-h-[44px] rounded-xl border-2 font-bold text-sm touch-manipulation ${
                    parts === n
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 space-y-1">
            {preview.map((amount, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Parte {i + 1}</span>
                <span className="font-bold tabular-nums">{formatEuro(amount)}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={submitting || total <= 0}
            onClick={() => onConfirm(parts)}
            className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold disabled:opacity-50 touch-manipulation"
          >
            {submitting ? 'Dividiendo…' : 'Confirmar división'}
          </button>
        </div>
      </div>
    </div>
  );
}
