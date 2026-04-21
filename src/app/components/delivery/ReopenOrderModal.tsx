import { useState } from 'react';
import { X, RotateCcw, AlertTriangle } from 'lucide-react';
import type { DeliveryOrder } from '../../lib/deliveryApi';

interface Props {
  order: DeliveryOrder;
  onConfirm: (notes: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export function ReopenOrderModal({ order, onConfirm, onClose, loading }: Props) {
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Reabrir pedido</h3>
              <p className="text-sm text-gray-500">#{order.orderNumber} — {order.customerName}</p>
            </div>
            <button onClick={onClose} className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900 dark:text-gray-100">{order.totalAmount.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Estado actual</span><span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{order.status === 'cancelled' ? 'Cancelado' : 'Entregado'}</span></div>
          </div>

          {order.cancelReason && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 mb-4">
              <p className="text-xs font-bold text-red-600 uppercase mb-1">Motivo de cancelación</p>
              <p className="text-sm text-red-700 dark:text-red-400">{order.cancelReason}</p>
            </div>
          )}

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">El pedido volverá al estado <strong>"Nuevo"</strong> y aparecerá en el listado activo.</p>
          </div>

          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas (opcional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Motivo de reapertura..."
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none resize-none" />
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 p-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onConfirm(notes.trim())} disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
            {loading ? 'Reabriendo...' : 'Reabrir pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
