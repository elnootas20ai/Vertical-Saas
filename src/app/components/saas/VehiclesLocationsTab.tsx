import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Tabs } from './Tabs';
import { useApp } from '../../context/AppContext';
import { SAAS__CreateZoneModal } from '../design-system/SAAS__CreateZoneModal';
import { SAAS__CreateSpotModal } from '../design-system/SAAS__CreateSpotModal';
import { SAAS__LocationMoveVehicleModal } from '../design-system/SAAS__LocationMoveVehicleModal';
import { ZONE_COLOR_MAP, ZONE_COLOR_OPTIONS, hydrateParkingZonesWithVehicles, type ParkingZone, type ParkingSpot } from '../../lib/parkingZones';
import {
  Plus, Eye, Edit2, History, Grid3x3,
  ArrowRight, MapPin, Car, Map,
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

export function VehiclesLocationsTab() {
  const navigate = useNavigate();
  const { vehicles, parkingZones, addParkingZone } = useApp();
  const [subTab, setSubTab] = useState('zones');
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [showCreateSpot, setShowCreateSpot] = useState(false);
  const [showMoveVehicle, setShowMoveVehicle] = useState<any>(null);

  const zones = useMemo<ParkingZone[]>(
    () => hydrateParkingZonesWithVehicles(parkingZones, vehicles),
    [parkingZones, vehicles],
  );

  const movements: Movement[] = [];

  const getStats = (z: ParkingZone) => {
    const occupied = z.spots.filter(s => s.vehicleId).length;
    return { occupied, available: z.capacity - occupied, rate: (occupied / z.capacity) * 100 };
  };

  const totalCapacity = zones.reduce((s, z) => s + z.capacity, 0);
  const totalOccupied = zones.reduce((s, z) => s + getStats(z).occupied, 0);
  const totalFree     = totalCapacity - totalOccupied;

  const subTabs = [
    { id: 'zones',   label: 'Zonas',    icon: <Grid3x3 className="w-4 h-4" /> },
    { id: 'map',     label: 'Mapa',     icon: <Map className="w-4 h-4" /> },
    { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" />, count: movements.length },
  ];

  return (
    <div className="space-y-5">

      {/* ── KPIs de capacidad ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Plazas totales',   value: totalCapacity, color: 'text-gray-900 dark:text-gray-100',   bg: 'bg-gray-50 dark:bg-gray-800',    icon: '🅿️' },
          { label: 'Ocupadas',         value: totalOccupied, color: 'text-blue-600',   bg: 'bg-blue-50',    icon: '🚗' },
          { label: 'Disponibles',      value: totalFree,     color: 'text-emerald-600',bg: 'bg-emerald-50', icon: '✅' },
          { label: 'Ocupación total',  value: `${totalCapacity ? ((totalOccupied/totalCapacity)*100).toFixed(0) : 0}%`, color: 'text-amber-600', bg: 'bg-amber-50', icon: '📊' },
        ].map(({ label, value, color, bg, icon }) => (
          <div key={label} className={`${bg} rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3`}>
            <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm dark:shadow-gray-900/30">{icon}</div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`text-xl font-bold leading-none mt-0.5 ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs ───────────────────────────────────────────────────── */}
      <Tabs tabs={subTabs} activeTab={subTab} onChange={setSubTab} />

      {/* ── TAB: Zonas ────────────────────────────────────────────────── */}
      {subTab === 'zones' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-gray-100">{zones.length}</span> zonas configuradas</p>
            <button
              onClick={() => setShowCreateZone(true)}
              className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva zona
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zones.map(zone => {
              const stats  = getStats(zone);
              const colors = ZONE_COLOR_MAP[zone.color] ?? ZONE_COLOR_MAP.blue;
              return (
                <div
                  key={zone.id}
                  onClick={() => navigate(`/saas/locations/${zone.id}`)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl border-2 ${colors.border} overflow-hidden hover:shadow-lg transition-all cursor-pointer`}
                >
                  {/* Header zona */}
                  <div className={`${colors.bg} border-b ${colors.border} px-6 py-4`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className={`text-lg font-bold ${colors.text} mb-0.5`}>{zone.name}</h3>
                        <p className={`text-sm ${colors.light}`}>{zone.description}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); }}
                        className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                        title="Editar zona"
                      >
                        <Edit2 className={`w-4 h-4 ${colors.light}`} />
                      </button>
                    </div>
                  </div>

                  {/* Stats zona */}
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label: 'Total',      val: zone.capacity,      cls: 'text-gray-900 dark:text-gray-100' },
                        { label: 'Libres',     val: stats.available,    cls: 'text-emerald-600' },
                        { label: 'Ocupadas',   val: stats.occupied,     cls: 'text-blue-600' },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="text-center">
                          <div className={`text-2xl font-bold ${cls}`}>{val}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Barra de ocupación */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>Ocupación</span>
                        <span className="font-semibold">{stats.rate.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${colors.accent} transition-all`} style={{ width: `${stats.rate}%` }} />
                      </div>
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/saas/locations/${zone.id}`); }}
                      className={`w-full mt-4 px-4 py-2.5 ${colors.accent} hover:opacity-90 text-white rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all`}
                    >
                      <Eye className="w-4 h-4" />
                      Ver plazas
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: Mapa Visual ──────────────────────────────────────────── */}
      {subTab === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Vista visual del plano de aparcamiento. Cada bloque es una plaza.</p>

          {zones.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Map className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No hay zonas configuradas aún</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5 space-y-6">
              {/* Legend */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Leyenda:</span>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div className="w-4 h-4 rounded bg-gray-800 flex items-center justify-center"><Car className="w-2.5 h-2.5 text-white" /></div>Ocupada
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div className="w-4 h-4 rounded border-2 border-dashed border-gray-300 bg-gray-50 dark:bg-gray-800" />Libre
                </div>
                {ZONE_COLOR_OPTIONS.slice(0, 4).map(c => (
                  <div key={c.value} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <div className={`w-3 h-3 rounded ${c.bg}`} />
                    {c.label}
                  </div>
                ))}
              </div>

              {/* Floor plan */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {zones.map(zone => {
                  const colorOpt = ZONE_COLOR_OPTIONS.find(c => c.value === zone.color) ?? ZONE_COLOR_OPTIONS[0];
                  const stats = {
                    occupied: zone.spots.filter(s => s.vehicleId).length,
                    available: zone.capacity - zone.spots.filter(s => s.vehicleId).length,
                  };
                  const occupancyPct = zone.capacity > 0 ? (stats.occupied / zone.capacity) * 100 : 0;
                  const spotsPerRow = Math.ceil(Math.sqrt(zone.capacity));

                  return (
                    <div key={zone.id} className="space-y-3">
                      {/* Zone header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${colorOpt.bg}`} />
                          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{zone.name}</span>
                          {zone.description && <span className="text-xs text-gray-400 dark:text-gray-500">· {zone.description}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{stats.occupied}/{zone.capacity}</span>
                          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${occupancyPct > 80 ? 'bg-red-100 text-red-700' : occupancyPct > 50 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {occupancyPct.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* Visual grid floor plan */}
                      <div
                        className={`p-3 rounded-xl border-2 ${colorOpt.border} bg-gray-50 dark:bg-gray-800 relative`}
                        style={{ minHeight: '80px' }}
                      >
                        {/* Entry/exit indicator */}
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] font-bold px-2 py-0.5 rounded-full z-10">
                          ENTRADA
                        </div>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-2 bg-amber-400" />

                        <div
                          className="grid gap-1.5"
                          style={{ gridTemplateColumns: `repeat(${Math.min(spotsPerRow, 8)}, minmax(0, 1fr))` }}
                        >
                          {zone.spots.slice(0, zone.capacity).map((spot) => {
                            const isOccupied = !!spot.vehicleId;
                            return (
                              <div
                                key={spot.id}
                                title={isOccupied ? `${spot.vehiclePlate} · ${spot.vehicleModel}` : `Plaza ${spot.number} · Libre`}
                                onClick={() => {
                                  if (isOccupied && spot.vehicleId) navigate(`/saas/vehicles/${spot.vehicleId}`);
                                }}
                                onKeyDown={(e) => {
                                  if (!isOccupied || !spot.vehicleId) return;
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(`/saas/vehicles/${spot.vehicleId}`);
                                  }
                                }}
                                role={isOccupied ? 'button' : undefined}
                                tabIndex={isOccupied ? 0 : undefined}
                                className={`relative aspect-[2/1] rounded-md border flex items-center justify-center transition-all group ${
                                  isOccupied
                                    ? `${colorOpt.spotOccupied} border-transparent shadow-sm dark:shadow-gray-900/30 cursor-pointer`
                                    : 'bg-white dark:bg-gray-800 border-dashed border-gray-300 hover:border-gray-400 cursor-default'
                                }`}
                              >
                                {isOccupied ? (
                                  <Car className="w-2.5 h-2.5 text-white" />
                                ) : (
                                  <span className="text-[6px] text-gray-400 dark:text-gray-500 font-bold">{spot.number}</span>
                                )}
                                {/* Tooltip on hover */}
                                {isOccupied && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 whitespace-nowrap bg-gray-900 text-white text-[9px] px-2 py-1 rounded-lg shadow-lg dark:shadow-gray-900/40 pointer-events-none">
                                    <div className="font-bold">{spot.vehiclePlate}</div>
                                    <div className="opacity-75">{spot.vehicleModel}</div>
                                    <div className="opacity-60">Plaza {spot.number}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {/* Empty placeholders if spots < capacity */}
                          {zone.spots.length < zone.capacity && Array.from({ length: zone.capacity - zone.spots.length }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-[2/1] rounded-md border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50" />
                          ))}
                        </div>
                      </div>

                      {/* Occupancy bar */}
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${colorOpt.spotOccupied}`}
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                {[
                  { label: 'Plazas totales', value: totalCapacity, color: 'text-gray-900 dark:text-gray-100' },
                  { label: 'Ocupadas', value: totalOccupied, color: 'text-blue-600' },
                  { label: 'Libres', value: totalFree, color: 'text-emerald-600' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Historial ────────────────────────────────────────────── */}
      {subTab === 'history' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{movements.length}</span> movimientos registrados
          </p>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  {['Vehículo', 'Origen', '', 'Destino', 'Fecha / Hora', 'Usuario'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {movements.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{m.vehicleModel}</p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{m.vehiclePlate}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{m.fromZone}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Plaza {m.fromSpot}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500 mx-auto" />
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-emerald-800 text-sm">{m.toZone}</p>
                      <p className="text-xs text-emerald-600">Plaza {m.toSpot}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{m.date}</td>
                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{m.movedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {movements.map(m => (
              <div key={m.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{m.vehicleModel}</p>
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{m.vehiclePlate}</p>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{m.movedBy}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 text-center">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{m.fromZone}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.fromSpot}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="flex-1 bg-emerald-50 rounded-xl p-2 text-center">
                    <p className="font-medium text-emerald-800">{m.toZone}</p>
                    <p className="text-xs text-emerald-600">{m.toSpot}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 text-right">{m.date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modales ───────────────────────────────────────────────────── */}
      <SAAS__CreateZoneModal
        isOpen={showCreateZone}
        onClose={() => setShowCreateZone(false)}
        onCreate={(data) => {
          addParkingZone(data);
          setShowCreateZone(false);
        }}
      />
      <SAAS__CreateSpotModal
        isOpen={showCreateSpot}
        onClose={() => setShowCreateSpot(false)}
        onCreate={() => setShowCreateSpot(false)}
        zones={zones as Array<{ id: string; name: string; spots: ParkingSpot[] }>}
      />
      {showMoveVehicle && (
        <SAAS__LocationMoveVehicleModal
          isOpen={true}
          onClose={() => setShowMoveVehicle(null)}
          onConfirm={() => setShowMoveVehicle(null)}
          vehicle={showMoveVehicle}
          zones={zones as Array<{ id: string; name: string; color: string; spots: ParkingSpot[] }>}
        />
      )}
    </div>
  );
}
