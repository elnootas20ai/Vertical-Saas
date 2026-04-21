import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Car, Wrench, Filter,
  Activity, Gauge, Loader2,
} from 'lucide-react';

type VehicleStatus = 'activo' | 'en_taller' | 'baja_temporal' | 'reserva';

interface Vehicle extends VerticalEntity {
  id: string;
  numLicencia: string;
  matricula: string;
  marcaModelo: string;
  anio: number;
  km: number;
  estado: VehicleStatus;
  conductorAsignado: string;
  ultimaItv: string;
  proximaRevision: string;
}

type VehicleFormFields = Omit<
  Vehicle,
  'id' | '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'
>;

const STATUS_CFG: Record<VehicleStatus, { label: string; dot: string }> = {
  activo:        { label: 'Activo',        dot: 'bg-emerald-500' },
  en_taller:     { label: 'En Taller',     dot: 'bg-amber-500' },
  baja_temporal: { label: 'Baja Temporal', dot: 'bg-red-500' },
  reserva:       { label: 'Reserva',       dot: 'bg-blue-400' },
};

const EMPTY_FORM: VehicleFormFields = {
  numLicencia: '', matricula: '', marcaModelo: '', anio: new Date().getFullYear(),
  km: 0, estado: 'activo', conductorAsignado: '', ultimaItv: '', proximaRevision: '',
};

function normalizeVehicle(raw: Vehicle): Vehicle {
  const docId = raw._id || raw.id;
  return { ...raw, id: docId };
}

function docIdForApi(v: Vehicle): string {
  return v._id ?? v.id;
}

export function TaxiFleet() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Vehicle>('taxi', 'vehicles'), []);
  const { isInitializing } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<VehicleStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormFields>(EMPTY_FORM);

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!user?.user_id) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const items = await api.list(user.user_id);
      setVehicles(items.map(i => normalizeVehicle(i as Vehicle)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => vehicles.filter(v => {
    if (search && !v.matricula.toLowerCase().includes(search.toLowerCase()) && !v.marcaModelo.toLowerCase().includes(search.toLowerCase()) && !v.numLicencia.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== 'all' && v.estado !== filterStatus) return false;
    return true;
  }), [vehicles, search, filterStatus]);

  const stats = useMemo(() => {
    const activos = vehicles.filter(v => v.estado === 'activo').length;
    const enTaller = vehicles.filter(v => v.estado === 'en_taller').length;
    const kmMedio = vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.km, 0) / vehicles.length) : 0;
    return { total: vehicles.length, activos, enTaller, kmMedio };
  }, [vehicles]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setForm({ numLicencia: v.numLicencia, matricula: v.matricula, marcaModelo: v.marcaModelo, anio: v.anio, km: v.km, estado: v.estado, conductorAsignado: v.conductorAsignado, ultimaItv: v.ultimaItv, proximaRevision: v.proximaRevision }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.numLicencia.trim() || !form.matricula.trim()) return;
    if (!user?.user_id) return;
    try {
      const formData = { ...form } as Partial<Vehicle>;
      if (editing) {
        await api.update(user.user_id, docIdForApi(editing), formData);
      } else {
        await api.create(user.user_id, formData);
      }
      await loadData();
      setShowModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user?.user_id) return;
    try {
      await api.remove(user.user_id, id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const STAT_CARDS = [
    { label: 'Total Vehículos', value: stats.total, icon: Car, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Activos', value: stats.activos, icon: Activity, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'En Taller', value: stats.enTaller, icon: Wrench, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Km Medio Flota', value: stats.kmMedio.toLocaleString('es-ES'), icon: Gauge, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  if (isInitializing) {
    return (
      <Layout title="Flota de Vehículos">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-gray-900 dark:text-white animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!user?.user_id) {
    return (
      <Layout title="Flota de Vehículos">
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 dark:text-gray-400 text-center px-4">
          <p>Inicia sesión para ver y gestionar la flota de vehículos.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Flota de Vehículos">
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-gray-900 dark:text-white animate-spin" />
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por licencia, matrícula o modelo..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as VehicleStatus | 'all')}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">
              <Plus className="w-4 h-4" /> Nuevo Vehículo
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nº Licencia</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Matrícula</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Marca / Modelo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Año</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Km</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Conductor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Última ITV</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Próx. Revisión</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{v.numLicencia}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{v.matricula}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{v.marcaModelo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.anio}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{v.km.toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[v.estado].dot}`} />{STATUS_CFG[v.estado].label}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.conductorAsignado || <span className="text-gray-400 italic">Sin asignar</span>}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.ultimaItv}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.proximaRevision}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(docIdForApi(v))} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron vehículos con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº Licencia *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.numLicencia} onChange={e => setForm(f => ({ ...f, numLicencia: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Matrícula *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Marca / Modelo</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.marcaModelo} onChange={e => setForm(f => ({ ...f, marcaModelo: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Año</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.anio} onChange={e => setForm(f => ({ ...f, anio: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Kilómetros</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.km} onChange={e => setForm(f => ({ ...f, km: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as VehicleStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Conductor Asignado</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.conductorAsignado} onChange={e => setForm(f => ({ ...f, conductorAsignado: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Última ITV</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ultimaItv} onChange={e => setForm(f => ({ ...f, ultimaItv: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Próxima Revisión</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.proximaRevision} onChange={e => setForm(f => ({ ...f, proximaRevision: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={() => void handleSave()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Vehículo'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
