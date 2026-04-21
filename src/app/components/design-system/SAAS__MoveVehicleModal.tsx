import { useMemo, useState } from 'react';
import { X, Move, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { hydrateParkingZonesWithVehicles } from '../../lib/parkingZones';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newLocation: string) => void;
  currentLocation: string;
  vehicleName: string;
}

export function SAAS__MoveVehicleModal({ isOpen, onClose, onConfirm, currentLocation, vehicleName }: Props) {
  const { parkingZones, vehicles } = useApp();
  const [selectedLocation, setSelectedLocation] = useState('');

  const zones = useMemo(
    () => hydrateParkingZonesWithVehicles(parkingZones, vehicles),
    [parkingZones, vehicles],
  );

  const selectableSpots = useMemo(
    () =>
      zones.flatMap((zone) =>
        zone.spots
          .filter((s) => !s.vehicleId)
          .map((s) => ({
            id: s.number,
            zone: zone.name,
          })),
      ),
    [zones],
  );

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedLocation) {
      onConfirm(selectedLocation);
    }
  };

  const displaySuffix = (id: string) => {
    const parts = id.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : id;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Move className="w-5 h-5 text-amber-600" />
            Mover vehículo
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="font-semibold text-blue-900 mb-1">{vehicleName}</div>
            <div className="text-sm text-blue-700">
              Ubicación actual: <span className="font-semibold">{currentLocation || 'Sin asignar'}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Selecciona nueva ubicación
            </label>
            {selectableSpots.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 py-4 px-1">
                No hay plazas libres. Crea zonas y plazas en Configuración → Ubicaciones o libera una plaza antes de mover el vehículo.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {selectableSpots.map((location) => (
                  <button
                    key={`${location.zone}-${location.id}`}
                    type="button"
                    onClick={() => setSelectedLocation(location.id)}
                    className={`p-4 border-2 rounded-xl transition-all text-left ${
                      selectedLocation === location.id
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${
                          selectedLocation === location.id
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-200 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {displaySuffix(location.id)}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 dark:text-gray-100">Plaza {location.id}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{location.zone}</div>
                      </div>
                      {selectedLocation === location.id && (
                        <div className="w-5 h-5 bg-amber-600 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <strong>Consejo:</strong> Verifica que la ubicación esté libre antes de confirmar el movimiento
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirmar movimiento
          </button>
        </div>
      </div>
    </div>
  );
}
