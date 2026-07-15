import { useState } from 'react';
import { X } from 'lucide-react';
import { DecimalNumpadField } from '../DecimalNumpadField';
import { parseDecimalPadValue } from '../../../lib/decimalNumpadInput';

function formatEuro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

type Props = {
  subtotal: number;
  currentDiscount?: number;
  currentDiscountPercent?: number;
  onApply: (payload: { discountPercent?: number; discount?: number; reason: string }) => void;
  onClear: () => void;
  onClose: () => void;
  submitting?: boolean;
};

export function RestaurantAccountDiscountModal({
  subtotal,
  currentDiscount = 0,
  currentDiscountPercent = 0,
  onApply,
  onClear,
  onClose,
  submitting = false,
}: Props) {
  const [mode, setMode] = useState<'percent' | 'fixed'>(
    currentDiscountPercent > 0 ? 'percent' : 'fixed',
  );
  const [value, setValue] = useState(
    String(currentDiscountPercent > 0 ? currentDiscountPercent : currentDiscount || ''),
  );
  const [reason, setReason] = useState('');

  const preview = (() => {
    const num = parseDecimalPadValue(value);
    if (isNaN(num) || num <= 0) return 0;
    if (mode === 'percent') {
      return Math.round(subtotal * Math.min(num, 100) / 100 * 100) / 100;
    }
    return Math.min(num, subtotal);
  })();

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Descuento en cuenta</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Subtotal: <span className="font-bold tabular-nums">{formatEuro(subtotal)}</span>
          </p>
          <div className="flex gap-2">
            {(['percent', 'fixed'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 min-h-[40px] rounded-lg border-2 text-sm font-semibold ${
                  mode === m
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {m === 'percent' ? '% Porcentaje' : '€ Importe'}
              </button>
            ))}
          </div>
          <DecimalNumpadField
            value={value}
            onChange={setValue}
            placeholder={mode === 'percent' ? '10' : '5.00'}
            showNumpad
            maxDecimals={mode === 'percent' ? 2 : 2}
            inputClassName="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
          />
          {preview > 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
              Descuento: -{formatEuro(preview)}
            </p>
          ) : null}
          <div className="flex gap-2">
            {(currentDiscount > 0 || currentDiscountPercent > 0) ? (
              <button
                type="button"
                disabled={submitting}
                onClick={onClear}
                className="flex-1 min-h-[44px] rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-sm"
              >
                Quitar
              </button>
            ) : null}
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                const num = parseDecimalPadValue(value);
                if (isNaN(num) || num <= 0) return;
                if (mode === 'percent') {
                  onApply({ discountPercent: Math.min(100, num), reason });
                } else {
                  onApply({ discount: num, reason });
                }
              }}
              className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
            >
              {submitting ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
