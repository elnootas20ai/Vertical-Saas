import { useState, useEffect } from 'react';
import { X, Edit2 } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface CostCenter {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
}

interface DocumentData {
  id: string;
  name: string;
  category: string;
  status: string;
  notes?: string;
  costCenterId?: string;
  vehicleId?: string;
  vehicleName?: string;
  costCenterName?: string;
  expiresAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { id: string; name: string; category: string; notes: string; costCenterId: string; vehicleId: string; expiresAt: string }) => void;
  document: DocumentData;
  costCenters: CostCenter[];
  vehicles: Vehicle[];
}

const CATEGORY_OPTIONS = [
  { value: 'society',       label: 'Sociedad' },
  { value: 'contracts',     label: 'Contratos y alquileres' },
  { value: 'licenses',      label: 'Licencias' },
  { value: 'financial',     label: 'Impuestos' },
  { value: 'user-expenses', label: 'Gastos del usuario' },
  { value: 'other',         label: 'Otros documentos' },
];

export function SAAS__EditDocumentModal({ isOpen, onClose, onSave, document, costCenters, vehicles }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'other',
    notes: '',
    costCenterId: '',
    vehicleId: '',
    expiresAt: '',
  });

  useEffect(() => {
    if (isOpen && document) {
      setFormData({
        name: document.name || '',
        category: document.category || 'other',
        notes: document.notes || '',
        costCenterId: document.costCenterId || '',
        vehicleId: document.vehicleId || '',
        expiresAt: document.expiresAt || '',
      });
    }
  }, [isOpen, document]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: document.id, ...formData });
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-blue-600" />
            Editar documento
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nombre del documento *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Nombre del documento"
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Categoría *
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fecha de vencimiento
              </label>
              <input
                type="date"
                value={formData.expiresAt}
                onChange={(e) => handleChange('expiresAt', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Vehículo asociado
              </label>
              <select
                value={formData.vehicleId}
                onChange={(e) => handleChange('vehicleId', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              >
                <option value="">Sin vehículo</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.brand} {v.model}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Centro de coste
              </label>
              <select
                value={formData.costCenterId}
                onChange={(e) => handleChange('costCenterId', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              >
                <option value="">Sin centro de coste</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>{center.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notas
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Información adicional..."
                rows={3}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none text-sm"
              />
            </div>
          </div>
        </form>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name.trim()}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
