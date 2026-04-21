import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useApp } from '../../context/AppContext';
import { SAAS__CreateZoneModal } from '../../components/design-system/SAAS__CreateZoneModal';
import { SAAS__CreateSpotModal } from '../../components/design-system/SAAS__CreateSpotModal';
import { SAAS__LocationMoveVehicleModal } from '../../components/design-system/SAAS__LocationMoveVehicleModal';
import { ZONE_COLOR_MAP, hydrateParkingZonesWithVehicles, type ParkingSpot, type ParkingZone } from '../../lib/parkingZones';
import { 
  MapPin, Plus, Square, Car, Clock, ArrowRight,
  Grid3x3, Eye, Edit2, History
} from 'lucide-react';

interface Movement {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  fromZone: string;
  fromSpot: string;
  toZone: string;
  toSpot: string;
  date: string;
  movedBy: string;
}

export function Locations() {
  const navigate = useNavigate();
  const { vehicles, parkingZones, addParkingZone } = useApp();
  const [activeTab, setActiveTab] = useState('zones');
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [showCreateSpot, setShowCreateSpot] = useState(false);
  const [showMoveVehicle, setShowMoveVehicle] = useState<any>(null);

  const zones = useMemo<ParkingZone[]>(
    () => hydrateParkingZonesWithVehicles(parkingZones, vehicles),
    [parkingZones, vehicles],
  );

  const movements = useMemo<Movement[]>(() => [], []);

  const tabsConfig = [
    { id: 'zones', label: 'Zonas', icon: <Grid3x3 className="w-4 h-4" /> },
    { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" />, count: movements.length },
  ];

  const getZoneStats = (zone: ParkingZone) => {
    const occupied = zone.spots.filter(s => s.vehicleId).length;
    const available = zone.capacity - occupied;
    const occupancyRate = (occupied / zone.capacity) * 100;
    return { occupied, available, occupancyRate };
  };

  const handleCreateZone = (data: any) => {
    addParkingZone(data);
    setShowCreateZone(false);
  };

  const handleCreateSpot = (data: any) => {
    console.log('Create spot:', data);
    setShowCreateSpot(false);
  };

  const handleMoveVehicle = (data: any) => {
    console.log('Move vehicle:', data);
    setShowMoveVehicle(null);
  };

  const renderZonesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {zones.length} zonas configuradas
        </div>
        <button
          onClick={() => setShowCreateZone(true)}
          className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva zona
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {zones.map((zone) => {
          const stats = getZoneStats(zone);
          const colors = ZONE_COLOR_MAP[zone.color] ?? ZONE_COLOR_MAP.blue;

          return (
            <div
              key={zone.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl border-2 ${colors.border} overflow-hidden hover:shadow-lg transition-all cursor-pointer`}
              onClick={() => navigate(`/saas/locations/${zone.id}`)}
            >
              {/* Header */}
              <div className={`${colors.bg} border-b ${colors.border} px-6 py-4`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className={`text-xl font-bold ${colors.text} mb-1`}>{zone.name}</h3>
                    <p className={`text-sm ${colors.light}`}>{zone.description}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('Edit zone:', zone.id);
                    }}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <Edit2 className={`w-4 h-4 ${colors.light}`} />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{zone.capacity}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.available}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Libres</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.occupied}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Ocupadas</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>Ocupación</span>
                    <span className="font-semibold">{stats.occupancyRate.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors.accent} transition-all`}
                      style={{ width: `${stats.occupancyRate}%` }}
                    />
                  </div>
                </div>

                {/* Action button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/saas/locations/${zone.id}`);
                  }}
                  className={`w-full mt-4 px-4 py-2.5 ${colors.accent} hover:opacity-90 text-white rounded-lg flex items-center justify-center gap-2 font-medium transition-all`}
                >
                  <Eye className="w-4 h-4" />
                  Ver plazas
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick stats summary */}
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Resumen general</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {zones.reduce((sum, z) => sum + z.capacity, 0)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Plazas totales</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="text-3xl font-bold text-blue-600">
              {zones.reduce((sum, z) => sum + getZoneStats(z).occupied, 0)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ocupadas</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="text-3xl font-bold text-green-600">
              {zones.reduce((sum, z) => sum + getZoneStats(z).available, 0)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Disponibles</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="text-3xl font-bold text-amber-600">
              {(() => {
                const cap = zones.reduce((sum, z) => sum + z.capacity, 0);
                if (cap <= 0) return '0';
                const occ = zones.reduce((sum, z) => sum + getZoneStats(z).occupied, 0);
                return ((occ / cap) * 100).toFixed(0);
              })()}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Ocupación total</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {movements.length} movimientos registrados
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vehículo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Origen</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">→</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Destino</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha/Hora</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {movements.map((movement) => (
              <tr key={movement.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-4 py-4">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{movement.vehicleModel}</div>
                  <div className="text-sm font-mono text-gray-600 dark:text-gray-400">{movement.vehiclePlate}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{movement.fromZone}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Plaza {movement.fromSpot}</div>
                </td>
                <td className="px-4 py-4 text-center">
                  <ArrowRight className="w-5 h-5 text-gray-400 dark:text-gray-500 mx-auto" />
                </td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-green-900">{movement.toZone}</div>
                  <div className="text-sm text-green-600">Plaza {movement.toSpot}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{movement.date}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{movement.movedBy}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Layout title="Ubicaciones" subtitle="Control de plazas y aparcamiento">
      <div className="space-y-6">
        <Tabs
          tabs={tabsConfig}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === 'zones' && renderZonesTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>

      <SAAS__CreateZoneModal
        isOpen={showCreateZone}
        onClose={() => setShowCreateZone(false)}
        onCreate={handleCreateZone}
      />

      <SAAS__CreateSpotModal
        isOpen={showCreateSpot}
        onClose={() => setShowCreateSpot(false)}
        onCreate={handleCreateSpot}
        zones={zones as Array<{ id: string; name: string; spots: ParkingSpot[] }>}
      />

      {showMoveVehicle && (
        <SAAS__LocationMoveVehicleModal
          isOpen={true}
          onClose={() => setShowMoveVehicle(null)}
          onConfirm={handleMoveVehicle}
          vehicle={showMoveVehicle}
          zones={zones as Array<{ id: string; name: string; color: string; spots: ParkingSpot[] }>}
        />
      )}
    </Layout>
  );
}
