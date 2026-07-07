import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter, Users, UserCheck,
  Star, Clock, Phone, Mail, BadgeCheck,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Turno = 'manana' | 'tarde' | 'noche' | 'partido';
type DriverStatus = 'activo' | 'vacaciones' | 'baja' | 'disponible';

interface Driver extends VerticalEntity {
  id: string;
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  numLicenciaTaxi: string;
  vehiculoAsignado: string;
  turno: Turno;
  estado: DriverStatus;
  antiguedad: string;
  valoracion: number;
}

const TURNO_CFG: Record<Turno, { label: string; bg: string; text: string }> = {
  manana:  { label: 'Mañana',  bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  tarde:   { label: 'Tarde',   bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-700 dark:text-blue-300' },
  noche:   { label: 'Noche',   bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  partido: { label: 'Partido', bg: 'bg-gray-100 dark:bg-gray-700',      text: 'text-gray-700 dark:text-gray-300' },
};

const STATUS_CFG: Record<DriverStatus, { label: string; dot: string }> = {
  activo:     { label: 'Activo',     dot: 'bg-emerald-500' },
  vacaciones: { label: 'Vacaciones', dot: 'bg-blue-400' },
  baja:       { label: 'Baja',       dot: 'bg-red-500' },
  disponible: { label: 'Disponible', dot: 'bg-violet-500' },
};

const EMPTY_FORM: Omit<Driver, 'id' | keyof VerticalEntity> = {
  nombre: '', dni: '', telefono: '', email: '', numLicenciaTaxi: '',
  vehiculoAsignado: '', turno: 'manana', estado: 'activo', antiguedad: '', valoracion: 5.0,
};

export function TaxiDrivers() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Driver>('taxi', 'drivers'), []);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTurno, setFilterTurno] = useState<Turno | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<DriverStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  useModalClose(showModal, () => setShowModal(false));
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'license', label: 'Licencia' },
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'license', label: 'Licencia', example: '' },
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const nombre = entryStr(e, 'nombre', 'name');
    if (!nombre) return null;
    return {
      nombre,
      vehiculoAsignado: entryStr(e, 'vehiculoAsignado') || '', turno: 'manana', estado: 'activo', antiguedad: '', valoracion: 5.0,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} conductor creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const loadData = useCallback(async () => {
    if (!user?.user_id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const items = await api.list(user.user_id);
      setDrivers(items.map(doc => ({ ...doc, id: doc._id })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => drivers.filter(d => {
    if (search && !d.nombre.toLowerCase().includes(search.toLowerCase()) && !d.dni.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTurno !== 'all' && d.turno !== filterTurno) return false;
    if (filterStatus !== 'all' && d.estado !== filterStatus) return false;
    return true;
  }), [drivers, search, filterTurno, filterStatus]);

  const stats = useMemo(() => {
    const activos = drivers.filter(d => d.estado === 'activo').length;
    const enServicio = drivers.filter(d => d.estado === 'activo' && d.vehiculoAsignado).length;
    const valMedia = drivers.length ? (drivers.reduce((s, d) => s + d.valoracion, 0) / drivers.length).toFixed(1) : '0';
    const turnosHoy = drivers.filter(d => d.estado === 'activo').length;
    return { activos, enServicio, valMedia, turnosHoy };
  }, [drivers]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (d: Driver) => {
    setEditing(d);
    setForm({ nombre: d.nombre, dni: d.dni, telefono: d.telefono, email: d.email, numLicenciaTaxi: d.numLicenciaTaxi, vehiculoAsignado: d.vehiculoAsignado, turno: d.turno, estado: d.estado, antiguedad: d.antiguedad, valoracion: d.valoracion });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.dni.trim() || !user?.user_id) return;
    try {
      if (editing) {
        const docId = editing._id ?? editing.id;
        await api.update(user.user_id, docId, form);
      } else {
        await api.create(user.user_id, form);
      }
      await loadData();
      setShowModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user?.user_id) return;
    const d = drivers.find(x => x.id === id);
    const docId = d?._id ?? d?.id ?? id;
    try {
      await api.remove(user.user_id, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const renderStars = (val: number) => (
    <span className="inline-flex items-center gap-0.5">
      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
      <span className="text-sm font-medium">{val.toFixed(1)}</span>
    </span>
  );

  const STAT_CARDS = [
    { label: 'Conductores Activos', value: stats.activos, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'En Servicio Ahora', value: stats.enServicio, icon: UserCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Valoración Media', value: stats.valMedia, icon: Star, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Turnos Cubiertos Hoy', value: stats.turnosHoy, icon: Clock, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Conductores">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" aria-hidden />
              <span className="text-sm font-medium">Cargando conductores…</span>
            </div>
          </div>
        )}
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por nombre o DNI..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTurno} onChange={e => setFilterTurno(e.target.value as Turno | 'all')}>
                <option value="all">Todos los turnos</option>
                {Object.entries(TURNO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as DriverStatus | 'all')}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo Conductor"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de conductor"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">DNI</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Contacto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Licencia Taxi</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Vehículo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Turno</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Antigüedad</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Valoración</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{d.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{d.dni}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{d.telefono}</span>
                      <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{d.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5 text-blue-500" />{d.numLicenciaTaxi}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.vehiculoAsignado || <span className="text-gray-400 italic">Sin asignar</span>}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TURNO_CFG[d.turno].bg} ${TURNO_CFG[d.turno].text}`}>{TURNO_CFG[d.turno].label}</span></td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[d.estado].dot}`} />{STATUS_CFG[d.estado].label}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.antiguedad}</td>
                  <td className="px-4 py-3">{renderStars(d.valoracion)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron conductores con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Conductor' : 'Nuevo Conductor'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">DNI *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <input type="email" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº Licencia Taxi</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.numLicenciaTaxi} onChange={e => setForm(f => ({ ...f, numLicenciaTaxi: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Turno</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.turno} onChange={e => setForm(f => ({ ...f, turno: e.target.value as Turno }))}>
                    {Object.entries(TURNO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as DriverStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vehículo Asignado</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.vehiculoAsignado} onChange={e => setForm(f => ({ ...f, vehiculoAsignado: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Antigüedad</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.antiguedad} onChange={e => setForm(f => ({ ...f, antiguedad: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Valoración (1-5)</label>
                <input type="number" min="1" max="5" step="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.valoracion} onChange={e => setForm(f => ({ ...f, valoracion: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Conductor'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="taxi_drivers"
        moduleLabel="Conductores"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Conductores"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
