import { useState } from 'react';
import { Clock, Loader2, X } from 'lucide-react';
import type { DeliveryOrder } from '../../lib/deliveryApi';
import { useModalClose } from '../../hooks/useModalClose';

const QUICK_MINUTES = [10, 15, 20, 30, 45];

export function UberAcceptTimeModal({
  order,
  loading,
  onConfirm,
  onClose,
}: {
  order: DeliveryOrder;
  loading: boolean;
  onConfirm: (minutes: number) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(
    Math.max(5, Math.round(Number(order.estimatedDeliveryMinutes || 20))),
  );
  useModalClose(!loading, onClose);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={loading ? undefined : onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl p-5">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-3 top-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-3 pr-8">
          <span className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
            <Clock className="w-5 h-5 text-green-700 dark:text-green-300" />
          </span>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Aceptar pedido Uber</h3>
            <p className="text-xs text-gray-500">#{order.orderNumber} · tiempo de preparación</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-1.5">
          {QUICK_MINUTES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMinutes(value)}
              disabled={loading}
              className={`min-h-[44px] rounded-xl border-2 text-sm font-bold ${
                minutes === value
                  ? 'bg-[var(--v-blue,#2563eb)] border-[var(--v-blue,#2563eb)] text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-xs font-semibold text-gray-600 dark:text-gray-300">
          Minutos
          <input
            type="number"
            min={5}
            max={180}
            step={5}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            disabled={loading}
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </label>
        <button
          type="button"
          onClick={() => onConfirm(Math.min(180, Math.max(5, Math.round(minutes || 20))))}
          disabled={loading || !Number.isFinite(minutes) || minutes < 5 || minutes > 180}
          className="mt-4 w-full min-h-[46px] rounded-xl bg-[var(--v-blue,#2563eb)] hover:bg-[#1d4ed8] text-white font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Aceptar · listo en {minutes || 20} min
        </button>
      </div>
    </div>
  );
}
