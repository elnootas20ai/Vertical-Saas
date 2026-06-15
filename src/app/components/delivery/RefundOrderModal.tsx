import { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { DeliveryOrder } from '../../lib/deliveryApi';

const PRESET_REASONS = [
  'Producto incorrecto o en mal estado',
  'Cliente devuelve el pedido',
  'Error en el cobro',
  'Pedido duplicado',
  'Incidencia en la entrega',
];

interface Props {
  order: DeliveryOrder;
  onConfirm: (reason: string, refundAmount: number) => void;
  onClose: () => void;
  loading?: boolean;
}

export function RefundOrderModal({ order, onConfirm, onClose, loading }: Props) {
  const maxAmount = Number(order.paidAmount || order.totalAmount || 0);
  const [reason, setReason] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const finalReason = selectedPreset === 'otro' ? reason : (selectedPreset || reason);
  const refundAmount = Number(amount);
  const isValid = finalReason.trim().length >= 10 && Number.isFinite(refundAmount) && refundAmount > 0 && refundAmount <= maxAmount + 0.001;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Devolver pedido</h3>
              <p className="text-sm text-gray-500">#{order.orderNumber} — {order.customerName}</p>
            </div>
            <button onClick={onClose} className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-5 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Cobrado</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">{maxAmount.toFixed(2)}€</span>
            </div>
            {order.ticketNumber && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ticket</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{order.ticketNumber}</span>
              </div>
            )}
          </div>

          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Importe a devolver (€)
          </label>
          <input
            type="number"
            min="0.01"
            max={maxAmount}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none mb-4"
          />

          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Motivo de devolución *
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => { setSelectedPreset(preset); setReason(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPreset === preset ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedPreset('otro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPreset === 'otro' ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >
              Otro...
            </button>
          </div>

          {selectedPreset === 'otro' && (
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe el motivo (mínimo 10 caracteres)..."
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none resize-none"
            />
          )}

          {!isValid && finalReason.length > 0 && (
            <p className="text-xs text-red-500 mt-1">Revisa el motivo (mín. 10 caracteres) y el importe.</p>
          )}

          <p className="text-xs text-gray-500 mt-3">
            Se repone el stock del pedido y se registra la devolución en caja si está abierta.
          </p>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 p-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => isValid && onConfirm(finalReason.trim(), refundAmount)}
            disabled={!isValid || loading}
            className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Procesando...' : 'Confirmar devolución'}
          </button>
        </div>
      </div>
    </div>
  );
}
