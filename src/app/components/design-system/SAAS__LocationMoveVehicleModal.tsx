import { useState } from 'react';
import { X, MoveRight, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Spot {
  id: string;
  number: string;
  vehicleId?: string;
}

interface Zone {
  id: string;
  name: string;
  color: string;
  spots: Spot[];
}

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  currentZone: string;
  currentSpot: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { toZoneId: string; toSpotId: string }) => void;
  vehicle: Vehicle;
  zones: Zone[];
}

const COLOR_MAP: Record<string, { pill: string; pillActive: string; spotActive: string; dot: string }> = {
  blue:   { pill: 'border-blue-200 text-blue-700',   pillActive: 'bg-blue-600 border-blue-600 text-white',   spotActive: 'bg-blue-600 border-blue-600 text-white',   dot: 'bg-blue-500' },
  green:  { pill: 'border-green-200 text-green-700', pillActive: 'bg-green-600 border-green-600 text-white', spotActive: 'bg-green-600 border-green-600 text-white', dot: 'bg-green-500' },
  amber:  { pill: 'border-amber-200 text-amber-700', pillActive: 'bg-amber-500 border-amber-500 text-white', spotActive: 'bg-amber-500 border-amber-500 text-white', dot: 'bg-amber-500' },
  purple: { pill: 'border-purple-200 text-purple-700',pillActive: 'bg-purple-600 border-purple-600 text-white',spotActive: 'bg-purple-600 border-purple-600 text-white',dot: 'bg-purple-500' },
};

function getColor(color: string) {
  return COLOR_MAP[color] ?? {
    pill: 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300',
    pillActive: 'bg-gray-800 border-gray-800 text-white',
    spotActive: 'bg-gray-800 border-gray-800 text-white',
    dot: 'bg-gray-500',
  };
}

export function SAAS__LocationMoveVehicleModal({ isOpen, onClose, onConfirm, vehicle, zones }: Props) {
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedSpotId, setSelectedSpotId] = useState('');

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const selectedZone     = zones.find(z => z.id === selectedZoneId);
  const availableSpots   = selectedZone?.spots.filter(s => !s.vehicleId) ?? [];
  const selectedSpot     = availableSpots.find(s => s.id === selectedSpotId);
  const canConfirm       = !!(selectedZoneId && selectedSpotId);

  const handleZone = (id: string) => {
    setSelectedZoneId(id);
    setSelectedSpotId('');
  };

  const handleConfirm = () => {
    if (canConfirm) onConfirm({ toZoneId: selectedZoneId, toSpotId: selectedSpotId });
  };

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* ── Sheet / Modal ─────────────────────────────────────────────────── */}
      {/* Mobile: bottom sheet · Desktop: centered modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh]">

          {/* ── Handle (mobile only) ────────────────────────────────────── */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <MoveRight className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Mover vehículo</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* ── Vehicle info card ───────────────────────────────────────── */}
          <div className="mx-5 mb-4 p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{vehicle.model.charAt(0)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-blue-900 truncate">{vehicle.model}</p>
              <p className="text-xs font-mono text-blue-600">{vehicle.plate}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <MapPin className="w-3 h-3 text-blue-400" />
              <span className="text-xs text-blue-600 font-medium truncate max-w-[100px]">
                {vehicle.currentZone}
              </span>
            </div>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 space-y-5 pb-2">

            {/* Step 1: zona */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                1 · Zona de destino
              </p>
              {/* Pills scrollables horizontal */}
              <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {zones.map(zone => {
                  const freeSpots = zone.spots.filter(s => !s.vehicleId).length;
                  const c = getColor(zone.color);
                  const isSelected = selectedZoneId === zone.id;
                  const isEmpty = freeSpots === 0;
                  return (
                    <button
                      key={zone.id}
                      onClick={() => !isEmpty && handleZone(zone.id)}
                      disabled={isEmpty}
                      className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border-2 text-sm font-semibold transition-all ${
                        isSelected
                          ? c.pillActive
                          : isEmpty
                          ? 'border-gray-100 dark:border-gray-800 text-gray-300 cursor-not-allowed bg-gray-50 dark:bg-gray-800'
                          : `bg-white dark:bg-gray-800 ${c.pill} hover:shadow-sm`
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-white/80' : c.dot} ${isEmpty ? 'bg-gray-300' : ''}`} />
                      <span>{zone.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      } ${isEmpty ? 'bg-gray-100 dark:bg-gray-700 text-gray-300' : ''}`}>
                        {freeSpots}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: plaza */}
            {selectedZoneId && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  2 · Plaza específica
                </p>
                {availableSpots.length > 0 ? (
                  <div className="grid grid-cols-5 gap-2">
                    {availableSpots.map(spot => {
                      const c = getColor(selectedZone?.color ?? 'gray');
                      const isSelected = selectedSpotId === spot.id;
                      return (
                        <button
                          key={spot.id}
                          onClick={() => setSelectedSpotId(spot.id)}
                          className={`aspect-square rounded-2xl border-2 flex items-center justify-center text-sm font-bold transition-all ${
                            isSelected
                              ? `${c.spotActive} shadow-md scale-105`
                              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {spot.number}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                    <p className="text-sm text-gray-400 dark:text-gray-500">Sin plazas libres en esta zona</p>
                  </div>
                )}
              </div>
            )}

            {/* Preview de movimiento */}
            {canConfirm && selectedZone && selectedSpot && (
              <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border-2 border-emerald-200 rounded-2xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div className="flex items-center gap-2 text-sm flex-1 flex-wrap">
                  <span className="font-medium text-gray-500 dark:text-gray-400">{vehicle.currentZone}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="font-bold text-emerald-800">
                    {selectedZone.name} · Plaza {selectedSpot.number}
                  </span>
                </div>
              </div>
            )}

            {/* Tip */}
            {!canConfirm && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
                <MapPin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Selecciona la zona y luego la plaza para confirmar el movimiento.
                </p>
              </div>
            )}
          </div>

          {/* ── Footer fijo ─────────────────────────────────────────────── */}
          <div className="flex gap-3 px-5 pt-3 pb-5 sm:pb-4 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 mt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-[2] py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-2xl transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <MoveRight className="w-4 h-4" />
              Mover aquí
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
