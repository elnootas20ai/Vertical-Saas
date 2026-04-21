import { useEffect, useMemo, useState } from 'react';
import { X, Car, MapPin, Search } from 'lucide-react';
import type { Vehicle } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (vehicleId: string) => void;
  zoneName: string;
  spotNumber: string;
  vehicles: Vehicle[];
}

export function SAAS__AssignVehicleToSpotModal({
  isOpen,
  onClose,
  onConfirm,
  zoneName,
  spotNumber,
  vehicles,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedId(null);
    }
  }, [isOpen, zoneName, spotNumber]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles
      .filter((v) => v.status !== 'sold' && v.status !== 'scrapped')
      .filter((v) => {
        if (!q) return true;
        const hay = `${v.registrationPlate} ${v.brand} ${v.model}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
  }, [vehicles, query]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedId) onConfirm(selectedId);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh]">
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <Car className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">Asignar vehículo</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">
                    {zoneName} · Plaza {spotNumber}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="px-5 pt-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por matrícula o modelo…"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-[200px]">
            {list.length === 0 ? (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-8">
                No hay vehículos que coincidan con la búsqueda.
              </p>
            ) : (
              list.map((v) => {
                const active = selectedId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`w-full text-left p-3 rounded-2xl border-2 transition-all ${
                      active
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {v.brand} {v.model}
                    </div>
                    <div className="font-mono text-xs text-gray-600 dark:text-gray-400 mt-0.5">{v.registrationPlate}</div>
                    {v.location && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                        Ubicación actual: {v.location}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex gap-3 px-5 pt-3 pb-5 sm:pb-4 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedId}
              className="flex-[2] py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-2xl transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Aparcar aquí
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
