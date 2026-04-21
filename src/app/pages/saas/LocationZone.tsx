import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { SAAS__AssignVehicleToSpotModal } from '../../components/design-system/SAAS__AssignVehicleToSpotModal';
import { SAAS__CreateSpotModal } from '../../components/design-system/SAAS__CreateSpotModal';
import { SAAS__LocationMoveVehicleModal } from '../../components/design-system/SAAS__LocationMoveVehicleModal';
import { ZONE_COLOR_MAP, hydrateParkingZonesWithVehicles, type ParkingSpot, type ParkingZone } from '../../lib/parkingZones';
import { ArrowLeft, Plus, Car, Square, Move, Eye } from 'lucide-react';

type MoveVehiclePayload = {
  id: string;
  plate: string;
  model: string;
  currentZone: string;
  currentSpot: string;
};

export function LocationZone() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vehicles, parkingZones, updateVehicle } = useApp();
  const [showCreateSpot, setShowCreateSpot] = useState(false);
  const [showMoveVehicle, setShowMoveVehicle] = useState<MoveVehiclePayload | null>(null);
  const [assignSpot, setAssignSpot] = useState<ParkingSpot | null>(null);

  const zones = useMemo<ParkingZone[]>(
    () => hydrateParkingZonesWithVehicles(parkingZones, vehicles),
    [parkingZones, vehicles],
  );

  const zone = zones.find((item) => item.id === id);

  if (!zone) {
    return (
      <Layout title="Zona no encontrada" subtitle="">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Zona no encontrada</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">La zona que buscas no existe.</p>
          <button
            onClick={() => navigate('/saas/vehicles?tab=ubicaciones')}
            className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-medium transition-colors"
          >
            Volver a Ubicaciones
          </button>
        </div>
      </Layout>
    );
  }

  const occupied = zone.spots.filter(s => s.vehicleId).length;
  const available = zone.capacity - occupied;

  const colors = ZONE_COLOR_MAP[zone.color] ?? ZONE_COLOR_MAP.blue;

  const handleCreateSpot = (data: any) => {
    console.log('Create spot:', data);
    setShowCreateSpot(false);
  };

  const handleMoveVehicle = async (data: { toZoneId: string; toSpotId: string }) => {
    if (!showMoveVehicle) return;
    const destZone = zones.find((z) => z.id === data.toZoneId);
    const destSpot = destZone?.spots.find((s) => s.id === data.toSpotId);
    if (!destZone || !destSpot) return;
    await updateVehicle(showMoveVehicle.id, { location: destSpot.number });
    setShowMoveVehicle(null);
  };

  const handleAssignToSpot = async (vehicleId: string) => {
    if (!assignSpot) return;
    await updateVehicle(vehicleId, { location: assignSpot.number });
    setAssignSpot(null);
  };

  const openPlazaModal = (spot: ParkingSpot) => {
    if (spot.vehicleId) {
      setShowMoveVehicle({
        id: spot.vehicleId,
        plate: spot.vehiclePlate ?? '',
        model: spot.vehicleModel ?? '',
        currentZone: zone.name,
        currentSpot: spot.number,
      });
    } else {
      setAssignSpot(spot);
    }
  };

  return (
    <Layout title={zone.name} subtitle={zone.description}>
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/saas/vehicles?tab=ubicaciones')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Ubicaciones
        </button>

        {/* Header */}
        <div className={`${colors.bg} rounded-2xl border-2 ${colors.border} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className={`text-2xl font-bold ${colors.text} mb-2`}>{zone.name}</h2>
              <p className={`${colors.light}`}>{zone.description}</p>
            </div>
            <button
              onClick={() => setShowCreateSpot(true)}
              className={`px-4 py-2.5 ${colors.accent} hover:opacity-90 text-white rounded-xl flex items-center gap-2 font-medium transition-all`}
            >
              <Plus className="w-5 h-5" />
              Añadir plaza
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{zone.capacity}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total plazas</div>
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl text-center">
              <div className="text-3xl font-bold text-blue-600">{occupied}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ocupadas</div>
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl text-center">
              <div className="text-3xl font-bold text-green-600">{available}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Libres</div>
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl text-center">
              <div className="text-3xl font-bold text-amber-600">
                {((occupied / zone.capacity) * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ocupación</div>
            </div>
          </div>
        </div>

        {/* Grid of spots */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Plazas de aparcamiento</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {zone.spots.map((spot) => (
              <div
                key={spot.id}
                role="button"
                tabIndex={0}
                onClick={() => openPlazaModal(spot)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPlazaModal(spot);
                  }
                }}
                className={`relative p-4 border-2 rounded-xl transition-all cursor-pointer ${
                  spot.vehicleId
                    ? `${colors.border} ${colors.bg} ${colors.hover}`
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {/* Spot number */}
                <div className={`text-center mb-3 pb-3 border-b ${
                  spot.vehicleId ? colors.border : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <div className={`inline-block px-3 py-1 rounded-lg font-bold text-sm ${
                    spot.vehicleId 
                      ? `${colors.accent} text-white`
                      : 'bg-gray-300 text-gray-700 dark:text-gray-300'
                  }`}>
                    {spot.number}
                  </div>
                </div>

                {/* Content */}
                {spot.vehicleId ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center mb-2">
                      <Car className={`w-8 h-8 ${colors.light}`} />
                    </div>
                    <div className="text-center">
                      <div className={`font-mono text-xs font-bold ${colors.text} mb-1`}>
                        {spot.vehiclePlate}
                      </div>
                      <div className={`text-xs ${colors.light} line-clamp-2`}>
                        {spot.vehicleModel}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-1 pt-2 border-t border-current/20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/saas/vehicles/${spot.vehicleId}`);
                        }}
                        className="flex-1 p-1.5 hover:bg-white/50 rounded transition-colors"
                        title="Ver vehículo"
                      >
                        <Eye className="w-4 h-4 mx-auto" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPlazaModal(spot);
                        }}
                        className="flex-1 p-1.5 hover:bg-white/50 rounded transition-colors"
                        title="Mover vehículo"
                      >
                        <Move className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center mb-2">
                      <Square className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                      Plaza libre
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 ${colors.accent} rounded`} />
              <span className="text-gray-700 dark:text-gray-300">Plaza ocupada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-300 rounded" />
              <span className="text-gray-700 dark:text-gray-300">Plaza libre</span>
            </div>
          </div>
        </div>
      </div>

      <SAAS__CreateSpotModal
        isOpen={showCreateSpot}
        onClose={() => setShowCreateSpot(false)}
        onCreate={handleCreateSpot}
        zones={[zone] as Array<{ id: string; name: string; spots: ParkingSpot[] }>}
        defaultZoneId={zone.id}
      />

      {showMoveVehicle && (
        <SAAS__LocationMoveVehicleModal
          key={showMoveVehicle.id}
          isOpen={true}
          onClose={() => setShowMoveVehicle(null)}
          onConfirm={handleMoveVehicle}
          vehicle={showMoveVehicle}
          zones={zones as Array<{ id: string; name: string; color: string; spots: ParkingSpot[] }>}
        />
      )}

      {assignSpot && (
        <SAAS__AssignVehicleToSpotModal
          isOpen={true}
          onClose={() => setAssignSpot(null)}
          onConfirm={handleAssignToSpot}
          zoneName={zone.name}
          spotNumber={assignSpot.number}
          vehicles={vehicles}
        />
      )}
    </Layout>
  );
}