import { useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  vehicleName: string;
  registrationPlate: string;
}

export function SAAS__ScrapVehicleModal({ isOpen, onClose, onConfirm, vehicleName, registrationPlate }: Props) {
  const [formData, setFormData] = useState({
    reason: '',
    date: new Date().toISOString().split('T')[0],
    cost: '',
    income: '',
    notes: '',
    confirmText: '',
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConfirm = () => {
    if (formData.confirmText === registrationPlate) {
      onConfirm(formData);
    }
  };

  const isValid = formData.reason && formData.confirmText === registrationPlate;
  const netResult = (parseFloat(formData.income || '0') - parseFloat(formData.cost || '0'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between bg-red-50">
          <h2 className="text-xl font-bold text-red-900 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Desguace de vehículo (MVP)
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-red-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Warning */}
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-900 mb-1">⚠️ Acción irreversible</div>
                <div className="text-sm text-red-700">
                  El vehículo será marcado como desguazado y su estado cambiará permanentemente.
                  Esta acción no se puede deshacer.
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle info */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{vehicleName}</div>
            <div className="text-sm text-gray-700 dark:text-gray-300">Matrícula: {registrationPlate}</div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Motivo del desguace *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'siniestro', label: 'Siniestro total', emoji: '💥' },
                { value: 'averia', label: 'Avería irreparable', emoji: '🔧' },
                { value: 'antiguedad', label: 'Antigüedad', emoji: '⏳' },
                { value: 'otro', label: 'Otro motivo', emoji: '📋' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChange('reason', option.value)}
                  className={`p-4 border-2 rounded-xl transition-all text-left ${
                    formData.reason === option.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-2">{option.emoji}</div>
                  <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Fecha de desguace
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-red-500 focus:outline-none"
            />
          </div>

          {/* Cost and Income */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Coste (transporte, gestión...)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.cost}
                  onChange={(e) => handleChange('cost', e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 pr-8 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-red-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Ingreso (chatarra, piezas...)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.income}
                  onChange={(e) => handleChange('income', e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 pr-8 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
              </div>
            </div>
          </div>

          {/* Net result */}
          {(formData.cost || formData.income) && (
            <div className={`p-4 border-2 rounded-xl ${
              netResult >= 0
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="text-sm mb-1">Resultado neto</div>
              <div className={`text-2xl font-bold ${
                netResult >= 0 ? 'text-green-900' : 'text-red-900'
              }`}>
                {netResult >= 0 ? '+' : ''}{netResult.toLocaleString('es-ES')}€
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Notas adicionales
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              placeholder="Añade cualquier información relevante..."
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-red-500 focus:outline-none resize-none"
            />
          </div>

          {/* Confirmation */}
          <div>
            <label className="block text-sm font-semibold text-red-900 mb-2">
              Para confirmar, escribe la matrícula: <span className="font-mono">{registrationPlate}</span>
            </label>
            <input
              type="text"
              value={formData.confirmText}
              onChange={(e) => handleChange('confirmText', e.target.value.toUpperCase())}
              placeholder={registrationPlate}
              className="w-full px-4 py-2.5 border-2 border-red-300 rounded-xl focus:border-red-500 focus:outline-none font-mono font-bold"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirmar desguace
          </button>
        </div>
      </div>
    </div>
  );
}
