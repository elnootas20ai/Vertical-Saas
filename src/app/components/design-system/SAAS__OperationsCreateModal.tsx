import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
}

export function SAAS__OperationsCreateModal({ isOpen, onClose, onCreate }: Props) {
  const { vehicles, clients } = useApp();
  const [formData, setFormData] = useState({
    type: 'compra',
    vehicleId: '',
    clientId: '',
    responsible: 'Juan García',
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Nueva operación</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Tipo de operación */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipo de operación *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'compra' })}
                className={`p-4 border-2 rounded-xl font-semibold transition-all ${
                  formData.type === 'compra'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                📥 Compra
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'venta' })}
                className={`p-4 border-2 rounded-xl font-semibold transition-all ${
                  formData.type === 'venta'
                    ? 'border-green-500 bg-green-50 text-green-900'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                📤 Venta
              </button>
            </div>
          </div>

          {/* Vehículo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Vehículo *
            </label>
            <select
              value={formData.vehicleId}
              onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none"
              required
            >
              <option value="">Seleccionar vehículo</option>
              {vehicles.slice(0, 10).map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.brand} {vehicle.model} - {vehicle.plate}
                </option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {formData.type === 'compra' ? 'Origen/Proveedor' : 'Cliente'} *
            </label>
            <select
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none"
              required
            >
              <option value="">Seleccionar {formData.type === 'compra' ? 'origen' : 'cliente'}</option>
              {clients.slice(0, 10).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} - {client.email}
                </option>
              ))}
            </select>
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Responsable *
            </label>
            <select
              value={formData.responsible}
              onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none"
            >
              <option value="Juan García">Juan García</option>
              <option value="María López">María López</option>
              <option value="Carlos Ruiz">Carlos Ruiz</option>
            </select>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors"
            >
              Crear operación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
