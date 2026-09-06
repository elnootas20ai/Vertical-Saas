import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { DeliveryOrder } from '../../lib/deliveryApi';

const PRESET_REASONS = [
  'Cliente cancela',
  'Sin stock de productos',
  'Dirección incorrecta o no localizable',
  'Pedido duplicado',
  'Demora excesiva en preparación',
  'Incidencia con el canal / plataforma',
];

interface Props {
  order: DeliveryOrder;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading?: boolean;
  /** Textos para eliminar en lugar de cancelar (misma acción en backend). */
  mode?: 'cancel' | 'delete' | 'deny';
}

export function CancelOrderModal({ order, onConfirm, onClose, loading, mode = 'cancel' }: Props) {
  const [reason, setReason] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const finalReason = selectedPreset === 'otro' ? reason : (selectedPreset || reason);
  const isValid = finalReason.trim().length >= 4;
  const isDelete = mode === 'delete';
  const isDeny = mode === 'deny';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">
                {isDeny ? 'Denegar pedido Uber' : isDelete ? 'Eliminar pedido' : 'Cancelar pedido'}
              </h3>
              <p className="text-sm text-gray-500">#{order.orderNumber} — {order.customerName}</p>
            </div>
            <button onClick={onClose} className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">{order.items.length} productos</span><span className="font-bold text-gray-900 dark:text-gray-100">{order.totalAmount.toFixed(2)}€</span></div>
          </div>

          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {isDeny ? 'Motivo de denegación *' : isDelete ? 'Motivo de eliminación *' : 'Motivo de cancelación *'}
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_REASONS.map((preset) => (
              <button key={preset} onClick={() => { setSelectedPreset(preset); setReason(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPreset === preset ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
                {preset}
              </button>
            ))}
            <button onClick={() => setSelectedPreset('otro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPreset === 'otro' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
              Otro...
            </button>
          </div>

          {selectedPreset === 'otro' && (
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Describe el motivo (mínimo 4 caracteres)..."
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-red-500 focus:outline-none resize-none" />
          )}

          {!isValid && finalReason.length > 0 && (
            <p className="text-xs text-red-500 mt-1">El motivo debe tener al menos 4 caracteres</p>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 p-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Volver
          </button>
          <button onClick={() => isValid && onConfirm(finalReason.trim())} disabled={!isValid || loading}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading
              ? (isDeny ? 'Denegando…' : isDelete ? 'Eliminando...' : 'Cancelando...')
              : (isDeny ? 'Denegar pedido' : isDelete ? 'Eliminar pedido' : 'Cancelar pedido')}
          </button>
        </div>
      </div>
    </div>
  );
}
