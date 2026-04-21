import { useState } from 'react';
import { X, Square } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Zone {
  id: string;
  name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
  zones: Zone[];
  defaultZoneId?: string;
}

export function SAAS__CreateSpotModal({ isOpen, onClose, onCreate, zones, defaultZoneId }: Props) {
  const [formData, setFormData] = useState({
    zoneId: defaultZoneId || '',
    number: '',
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(formData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Square className="w-5 h-5 text-green-600" />
            Nueva plaza de aparcamiento
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Zone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Zona *
            </label>
            <select
              required
              value={formData.zoneId}
              onChange={(e) => handleChange('zoneId', e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
            >
              <option value="">Selecciona una zona</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          {/* Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Número de plaza *
            </label>
            <input
              type="text"
              required
              value={formData.number}
              onChange={(e) => handleChange('number', e.target.value.toUpperCase())}
              placeholder="A-21"
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none font-mono font-bold"
            />
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Formato recomendado: ZONA-NÚMERO (ej: A-01, B-15, EXT-03)
            </p>
          </div>

          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-800">
              💡 La plaza se creará vacía y podrás asignar vehículos posteriormente
            </p>
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
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors"
          >
            Crear plaza
          </button>
        </div>
      </div>
    </div>
  );
}
