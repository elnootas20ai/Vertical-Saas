import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Car,
  Cog,
  Boxes,
  FileText,
  Search,
  X,
  Plus,
  ChevronRight,
  Package,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  RefreshCw,
  Tag,
  Recycle,
} from 'lucide-react';

type VehicleStatus = 'recepcion' | 'despiece' | 'catalogado' | 'baja_tramitada' | 'completado';
type PartStatus = 'disponible' | 'reservada' | 'vendida' | 'defectuosa';

interface ScrapVehicle {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  anio: string;
  bastidor: string;
  fechaEntrada: string;
  estado: VehicleStatus;
  notas: string;
  fotos: string[];
  piezasExtraidas: number;
}

interface ScrapPart {
  id: string;
  vehicleId: string;
  referencia: string;
  nombre: string;
  ubicacion: string;
  precio: number;
  estado: PartStatus;
  fechaExtraccion: string;
}

const VEHICLE_STATUS_CFG: Record<VehicleStatus, { label: string; color: string; bg: string }> = {
  recepcion:      { label: 'Recepción',       color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300' },
  despiece:       { label: 'En despiece',      color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-300' },
  catalogado:     { label: 'Catalogado',       color: 'text-violet-700', bg: 'bg-violet-50 border-violet-300' },
  baja_tramitada: { label: 'Baja tramitada',   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300' },
  completado:     { label: 'Completado',       color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200' },
};

const PART_STATUS_CFG: Record<PartStatus, { label: string; dot: string }> = {
  disponible:  { label: 'Disponible',  dot: 'bg-emerald-500' },
  reservada:   { label: 'Reservada',   dot: 'bg-amber-500' },
  vendida:     { label: 'Vendida',     dot: 'bg-blue-500' },
  defectuosa:  { label: 'Defectuosa',  dot: 'bg-red-500' },
};

type ActiveTab = 'vehiculos' | 'piezas' | 'nuevo_vehiculo' | 'detalle_vehiculo' | 'nueva_pieza';

function VehicleCard({ v, onSelect }: { v: ScrapVehicle; onSelect: (v: ScrapVehicle) => void }) {
  const cfg = VEHICLE_STATUS_CFG[v.estado];
  return (
    <button
      onClick={() => onSelect(v)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${cfg.bg}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{v.matricula}</span>
          <p className="text-xs text-gray-500 mt-0.5">{new Date(v.fechaEntrada).toLocaleDateString('es-ES')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.color} border`}>{cfg.label}</span>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <Car className="w-4 h-4 text-gray-500" />
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{v.marca} {v.modelo}</span>
        <span className="text-xs text-gray-500">{v.anio}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1"><Cog className="w-3 h-3" /> {v.piezasExtraidas} piezas</span>
        {v.notas && <span className="truncate max-w-[150px]">{v.notas}</span>}
      </div>
    </button>
  );
}

export function WorkerTpvScrapyard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Operario';

  const [tab, setTab] = useState<ActiveTab>('vehiculos');
  const [vehicles, setVehicles] = useState<ScrapVehicle[]>([]);
  const [parts, setParts] = useState<ScrapPart[]>([]);
  const [search, setSearch] = useState('');
  const [filterVehicle, setFilterVehicle] = useState<VehicleStatus | 'all'>('all');
  const [filterPart, setFilterPart] = useState<PartStatus | 'all'>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<ScrapVehicle | null>(null);

  const [vForm, setVForm] = useState({ matricula: '', marca: '', modelo: '', anio: '', bastidor: '', notas: '' });
  const [pForm, setPForm] = useState({ vehicleId: '', referencia: '', nombre: '', ubicacion: '', precio: 0 });

  const filteredVehicles = useMemo(() => vehicles.filter(v => {
    const q = search.toLowerCase();
    if (search && !v.matricula.toLowerCase().includes(q) && !v.marca.toLowerCase().includes(q) && !v.modelo.toLowerCase().includes(q) && !v.bastidor.toLowerCase().includes(q)) return false;
    if (filterVehicle !== 'all' && v.estado !== filterVehicle) return false;
    return true;
  }), [vehicles, search, filterVehicle]);

  const filteredParts = useMemo(() => parts.filter(p => {
    const q = search.toLowerCase();
    if (search && !p.referencia.toLowerCase().includes(q) && !p.nombre.toLowerCase().includes(q) && !p.ubicacion.toLowerCase().includes(q)) return false;
    if (filterPart !== 'all' && p.estado !== filterPart) return false;
    return true;
  }), [parts, search, filterPart]);

  const vehicleStats = useMemo(() => ({
    recepcion: vehicles.filter(v => v.estado === 'recepcion').length,
    despiece: vehicles.filter(v => v.estado === 'despiece').length,
    catalogado: vehicles.filter(v => v.estado === 'catalogado').length,
    total: vehicles.length,
  }), [vehicles]);

  const partStats = useMemo(() => ({
    disponibles: parts.filter(p => p.estado === 'disponible').length,
    reservadas: parts.filter(p => p.estado === 'reservada').length,
    vendidas: parts.filter(p => p.estado === 'vendida').length,
    total: parts.length,
  }), [parts]);

  const handleAddVehicle = () => {
    if (!vForm.matricula.trim() || !vForm.marca.trim()) return;
    setVehicles(prev => [...prev, {
      id: uuidv4(), ...vForm,
      fechaEntrada: new Date().toISOString(),
      estado: 'recepcion',
      fotos: [],
      piezasExtraidas: 0,
    }]);
    setVForm({ matricula: '', marca: '', modelo: '', anio: '', bastidor: '', notas: '' });
    setTab('vehiculos');
  };

  const handleAddPart = () => {
    if (!pForm.nombre.trim() || !pForm.vehicleId) return;
    setParts(prev => [...prev, {
      id: uuidv4(), ...pForm,
      estado: 'disponible',
      fechaExtraccion: new Date().toISOString(),
    }]);
    const vid = pForm.vehicleId;
    setVehicles(prev => prev.map(v => v.id === vid ? { ...v, piezasExtraidas: v.piezasExtraidas + 1 } : v));
    setPForm({ vehicleId: '', referencia: '', nombre: '', ubicacion: '', precio: 0 });
    setTab('piezas');
  };

  const advanceVehicleStatus = (id: string) => {
    const flow: VehicleStatus[] = ['recepcion', 'despiece', 'catalogado', 'baja_tramitada', 'completado'];
    setVehicles(prev => prev.map(v => {
      if (v.id !== id) return v;
      const idx = flow.indexOf(v.estado);
      if (idx < flow.length - 1) return { ...v, estado: flow[idx + 1] };
      return v;
    }));
  };

  const updatePartStatus = (id: string, estado: PartStatus) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
  };

  const selectVehicleDetail = (v: ScrapVehicle) => {
    setSelectedVehicle(v);
    setTab('detalle_vehiculo');
  };

  const vehicleParts = selectedVehicle ? parts.filter(p => p.vehicleId === selectedVehicle.id) : [];

  // ── Render ──

  if (tab === 'nuevo_vehiculo') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setTab('vehiculos')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo vehículo</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Matrícula *</label>
              <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={vForm.matricula} onChange={e => setVForm(f => ({ ...f, matricula: e.target.value.toUpperCase() }))} placeholder="1234 ABC" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Año</label>
              <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={vForm.anio} onChange={e => setVForm(f => ({ ...f, anio: e.target.value }))} placeholder="2018" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Marca *</label>
              <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={vForm.marca} onChange={e => setVForm(f => ({ ...f, marca: e.target.value }))} placeholder="Seat" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Modelo</label>
              <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={vForm.modelo} onChange={e => setVForm(f => ({ ...f, modelo: e.target.value }))} placeholder="León" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nº Bastidor</label>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm font-mono" value={vForm.bastidor} onChange={e => setVForm(f => ({ ...f, bastidor: e.target.value.toUpperCase() }))} placeholder="VSSZZZ6KZYR000000" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notas</label>
            <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm min-h-[80px]" value={vForm.notas} onChange={e => setVForm(f => ({ ...f, notas: e.target.value }))} placeholder="Estado del vehículo, observaciones..." />
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button onClick={() => setTab('vehiculos')} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button onClick={handleAddVehicle} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md">Registrar vehículo</button>
        </div>
      </div>
    );
  }

  if (tab === 'nueva_pieza') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setTab('piezas')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva pieza</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Vehículo de origen *</label>
            <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={pForm.vehicleId} onChange={e => setPForm(f => ({ ...f, vehicleId: e.target.value }))}>
              <option value="">Seleccionar vehículo...</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.matricula} — {v.marca} {v.modelo}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Referencia</label>
              <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm font-mono" value={pForm.referencia} onChange={e => setPForm(f => ({ ...f, referencia: e.target.value }))} placeholder="REF-001" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Precio (€)</label>
              <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={pForm.precio} onChange={e => setPForm(f => ({ ...f, precio: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombre de la pieza *</label>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={pForm.nombre} onChange={e => setPForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Motor, puerta, alternador..." />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Ubicación en almacén</label>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" value={pForm.ubicacion} onChange={e => setPForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Estantería A-3, Nave 2..." />
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button onClick={() => setTab('piezas')} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button onClick={handleAddPart} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md">Registrar pieza</button>
        </div>
      </div>
    );
  }

  if (tab === 'detalle_vehiculo' && selectedVehicle) {
    const cfg = VEHICLE_STATUS_CFG[selectedVehicle.estado];
    const flow: VehicleStatus[] = ['recepcion', 'despiece', 'catalogado', 'baja_tramitada', 'completado'];
    const canAdvance = flow.indexOf(selectedVehicle.estado) < flow.length - 1;
    const nextLabel = canAdvance ? VEHICLE_STATUS_CFG[flow[flow.indexOf(selectedVehicle.estado) + 1]].label : '';

    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedVehicle(null); setTab('vehiculos'); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{selectedVehicle.matricula}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
              </div>
              <p className="text-xs text-gray-500">{selectedVehicle.marca} {selectedVehicle.modelo} · {selectedVehicle.anio}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Progress */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Progreso del vehículo</h3>
            <div className="flex gap-1">
              {flow.map((s, i) => {
                const idx = flow.indexOf(selectedVehicle.estado);
                const done = i <= idx;
                return (
                  <div key={s} className={`flex-1 h-2 rounded-full ${done ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              {flow.map(s => (
                <span key={s} className="text-[9px] text-gray-400">{VEHICLE_STATUS_CFG[s].label}</span>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">{selectedVehicle.marca} {selectedVehicle.modelo} ({selectedVehicle.anio})</span>
            </div>
            {selectedVehicle.bastidor && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Tag className="w-4 h-4 text-gray-400" />
                <span className="font-mono text-xs">{selectedVehicle.bastidor}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>Entrada: {new Date(selectedVehicle.fechaEntrada).toLocaleDateString('es-ES')}</span>
            </div>
            {selectedVehicle.notas && <p className="text-sm text-gray-700 dark:text-gray-300">{selectedVehicle.notas}</p>}
          </div>

          {/* Parts from this vehicle */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Cog className="w-4 h-4" /> Piezas extraídas ({vehicleParts.length})
              </h3>
              <button
                onClick={() => { setPForm(f => ({ ...f, vehicleId: selectedVehicle.id })); setTab('nueva_pieza'); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
              >
                <Plus className="w-3 h-3" /> Añadir
              </button>
            </div>
            {vehicleParts.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No hay piezas extraídas aún</p>
            ) : (
              <div className="space-y-1.5">
                {vehicleParts.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="min-w-0">
                      <span className="text-gray-700 dark:text-gray-300">{p.nombre}</span>
                      {p.referencia && <span className="text-xs text-gray-400 ml-2 font-mono">{p.referencia}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{p.precio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full ${PART_STATUS_CFG[p.estado].dot}`} />
                        {PART_STATUS_CFG[p.estado].label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button
            onClick={() => { setPForm(f => ({ ...f, vehicleId: selectedVehicle.id })); setTab('nueva_pieza'); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <Cog className="w-4 h-4" /> Extraer pieza
          </button>
          {canAdvance && (
            <button
              onClick={() => {
                advanceVehicleStatus(selectedVehicle.id);
                setSelectedVehicle(prev => prev ? { ...prev, estado: flow[flow.indexOf(prev.estado) + 1] } : prev);
              }}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" /> {nextLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Main tabs: vehículos / piezas ──

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <Recycle className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Desguace</h1>
              <p className="text-xs text-gray-500">{workerName}</p>
            </div>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={() => { setTab('vehiculos'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'vehiculos' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <Car className="w-4 h-4" /> Vehículos
          </button>
          <button
            onClick={() => { setTab('piezas'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'piezas' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <Cog className="w-4 h-4" /> Piezas
          </button>
        </div>

        {/* Stats */}
        {tab === 'vehiculos' ? (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Recepción', value: vehicleStats.recepcion, color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'En despiece', value: vehicleStats.despiece, color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'Catalogados', value: vehicleStats.catalogado, color: 'bg-violet-50 text-violet-700 border-violet-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.color}`}>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Disponibles', value: partStats.disponibles, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: 'Reservadas', value: partStats.reservadas, color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'Vendidas', value: partStats.vendidas, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.color}`}>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {tab === 'vehiculos' && (
          <div className="flex gap-1.5 mb-2">
            {([{ id: 'all', label: 'Todos' }, { id: 'recepcion', label: 'Recepción' }, { id: 'despiece', label: 'Despiece' }, { id: 'catalogado', label: 'Catalogados' }] as const).map(f => (
              <button key={f.id} onClick={() => setFilterVehicle(f.id)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterVehicle === f.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        {tab === 'piezas' && (
          <div className="flex gap-1.5 mb-2">
            {([{ id: 'all', label: 'Todas' }, { id: 'disponible', label: 'Disponibles' }, { id: 'reservada', label: 'Reservadas' }, { id: 'vendida', label: 'Vendidas' }] as const).map(f => (
              <button key={f.id} onClick={() => setFilterPart(f.id)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterPart === f.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'vehiculos' ? 'Buscar matrícula, marca, modelo...' : 'Buscar referencia, pieza, ubicación...'}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'vehiculos' ? (
          filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Car className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay vehículos en esta vista</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredVehicles.map(v => (
                <VehicleCard key={v.id} v={v} onSelect={selectVehicleDetail} />
              ))}
            </div>
          )
        ) : (
          filteredParts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Cog className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay piezas en esta vista</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredParts.map(p => {
                const vehicle = vehicles.find(v => v.id === p.vehicleId);
                return (
                  <div key={p.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{p.nombre}</span>
                        {p.referencia && <span className="font-mono text-xs text-gray-400">{p.referencia}</span>}
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{p.precio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-3">
                        {vehicle && <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {vehicle.matricula}</span>}
                        {p.ubicacion && <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {p.ubicacion}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${PART_STATUS_CFG[p.estado].dot}`} />
                          {PART_STATUS_CFG[p.estado].label}
                        </span>
                        {p.estado === 'disponible' && (
                          <button onClick={() => updatePartStatus(p.id, 'reservada')} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold hover:bg-amber-200">Reservar</button>
                        )}
                        {p.estado === 'reservada' && (
                          <button onClick={() => updatePartStatus(p.id, 'vendida')} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold hover:bg-blue-200">Vender</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* FAB */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
        <button
          onClick={() => setTab(tab === 'vehiculos' ? 'nuevo_vehiculo' : 'nueva_pieza')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 shadow-md transition"
        >
          <Plus className="w-4 h-4" /> {tab === 'vehiculos' ? 'Nuevo vehículo' : 'Nueva pieza'}
        </button>
      </div>
    </div>
  );
}
