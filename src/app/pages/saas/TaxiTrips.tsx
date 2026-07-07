import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter, MapPin, Navigation,
  DollarSign, Route, CreditCard, Clock, Car,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type FormaPago = 'efectivo' | 'tarjeta' | 'app' | 'cuenta_empresa';
type TipoServicio = 'urbano' | 'interurbano' | 'aeropuerto' | 'hospital' | 'reserva';

interface Trip extends VerticalEntity {
  numServicio: string;
  conductor: string;
  vehiculo: string;
  origen: string;
  destino: string;
  fechaHora: string;
  kmRecorridos: number;
  importe: number;
  formaPago: FormaPago;
  tipo: TipoServicio;
}

const PAGO_CFG: Record<FormaPago, { label: string; bg: string; text: string }> = {
  efectivo:        { label: 'Efectivo',        bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  tarjeta:         { label: 'Tarjeta',         bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-700 dark:text-blue-300' },
  app:             { label: 'App',             bg: 'bg-violet-100 dark:bg-violet-900/40',   text: 'text-violet-700 dark:text-violet-300' },
  cuenta_empresa:  { label: 'Cuenta Empresa',  bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-700 dark:text-amber-300' },
};

const TIPO_CFG: Record<TipoServicio, { label: string; bg: string; text: string }> = {
  urbano:       { label: 'Urbano',       bg: 'bg-gray-100 dark:bg-gray-700',        text: 'text-gray-700 dark:text-gray-300' },
  interurbano:  { label: 'Interurbano',  bg: 'bg-blue-100 dark:bg-blue-900/40',     text: 'text-blue-700 dark:text-blue-300' },
  aeropuerto:   { label: 'Aeropuerto',   bg: 'bg-sky-100 dark:bg-sky-900/40',       text: 'text-sky-700 dark:text-sky-300' },
  hospital:     { label: 'Hospital',     bg: 'bg-red-100 dark:bg-red-900/40',       text: 'text-red-700 dark:text-red-300' },
  reserva:      { label: 'Reserva',      bg: 'bg-amber-100 dark:bg-amber-900/40',   text: 'text-amber-700 dark:text-amber-300' },
};

const EMPTY_FORM: Omit<Trip, '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'> = {
  numServicio: '', conductor: '', vehiculo: '', origen: '', destino: '',
  fechaHora: '', kmRecorridos: 0, importe: 0, formaPago: 'efectivo', tipo: 'urbano',
};

export function TaxiTrips() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Trip>('taxi', 'trips'), []);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPago, setFilterPago] = useState<FormaPago | 'all'>('all');
  const [filterTipo, setFilterTipo] = useState<TipoServicio | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'driver', label: 'Conductor' },
    { key: 'origin', label: 'Origen' },
    { key: 'destination', label: 'Destino' },
    { key: 'fare', label: 'Tarifa' },
    { key: 'date', label: 'Fecha' },
    { key: 'payment', label: 'Forma pago' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'driver', label: 'Conductor', example: '' },
    { key: 'origin', label: 'Origen', example: '' },
    { key: 'destination', label: 'Destino', example: '' },
    { key: 'fare', label: 'Tarifa', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'payment', label: 'Forma pago', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const conductor = entryStr(e, 'conductor');
    if (!conductor) return null;
    return {
      numServicio: entryStr(e, 'numServicio') || '', conductor: '', vehiculo: '', origen: '', destino: '',
      fechaHora: entryStr(e, 'fechaHora') || '', kmRecorridos: 0, importe: 0, formaPago: 'efectivo', tipo: 'urbano',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} carrera creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    try { setLoading(true); const items = await api.list(user.user_id); setTrips(items); } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user?.user_id, api]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => trips.filter(t => {
    if (search && !t.numServicio.toLowerCase().includes(search.toLowerCase()) && !t.conductor.toLowerCase().includes(search.toLowerCase()) && !t.origen.toLowerCase().includes(search.toLowerCase()) && !t.destino.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPago !== 'all' && t.formaPago !== filterPago) return false;
    if (filterTipo !== 'all' && t.tipo !== filterTipo) return false;
    return true;
  }), [trips, search, filterPago, filterTipo]);

  const stats = useMemo(() => {
    const carrerasHoy = trips.length;
    const kmTotales = trips.reduce((s, t) => s + t.kmRecorridos, 0);
    const recaudacion = trips.reduce((s, t) => s + t.importe, 0);
    const media = trips.length ? recaudacion / trips.length : 0;
    return { carrerasHoy, kmTotales, recaudacion, media };
  }, [trips]);
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (t: Trip) => {
    setEditing(t);
    setForm({ numServicio: t.numServicio, conductor: t.conductor, vehiculo: t.vehiculo, origen: t.origen, destino: t.destino, fechaHora: t.fechaHora, kmRecorridos: t.kmRecorridos, importe: t.importe, formaPago: t.formaPago, tipo: t.tipo });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!user?.user_id) return;
    if (!form.conductor.trim() || !form.origen.trim()) return;
    try {
      if (editing) {
        await api.update(user.user_id, editing._id, { ...form });
      } else {
        await api.create(user.user_id, { ...form });
      }
      setShowModal(false);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!user?.user_id) return;
    try {
      await api.remove(user.user_id, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const STAT_CARDS = [
    { label: 'Carreras Hoy', value: stats.carrerasHoy, icon: Car, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Km Totales Hoy', value: stats.kmTotales.toFixed(1), icon: Route, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Recaudación Hoy', value: `€${stats.recaudacion.toFixed(2)}`, icon: DollarSign, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Carrera Media', value: `€${stats.media.toFixed(2)}`, icon: CreditCard, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Carreras / Servicios">
      {loading && (
        <div className="flex justify-center py-8 mb-4">
          <div className="w-8 h-8 border-4 border-gray-900 dark:border-white border-t-transparent rounded-full animate-spin" aria-label="Cargando" />
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por servicio, conductor, origen o destino..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterPago} onChange={e => setFilterPago(e.target.value as FormaPago | 'all')}>
                <option value="all">Toda forma de pago</option>
                {Object.entries(PAGO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTipo} onChange={e => setFilterTipo(e.target.value as TipoServicio | 'all')}>
                <option value="all">Todos los tipos</option>
                {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva Carrera"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de carrera"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nº Servicio</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Conductor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Vehículo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Origen</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Destino</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha/Hora</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Km</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Importe</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Pago</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white font-mono text-xs">{t.numServicio}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{t.conductor}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{t.vehiculo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-500" />{t.origen}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><Navigation className="w-3 h-3 text-red-500" />{t.destino}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{t.fechaHora}</span></td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{t.kmRecorridos.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">€{t.importe.toFixed(2)}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PAGO_CFG[t.formaPago].bg} ${PAGO_CFG[t.formaPago].text}`}>{PAGO_CFG[t.formaPago].label}</span></td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TIPO_CFG[t.tipo].bg} ${TIPO_CFG[t.tipo].text}`}>{TIPO_CFG[t.tipo].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron carreras con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Carrera' : 'Nueva Carrera'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº Servicio</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.numServicio} onChange={e => setForm(f => ({ ...f, numServicio: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Conductor *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vehículo</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.vehiculo} onChange={e => setForm(f => ({ ...f, vehiculo: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Origen *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Destino</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha/Hora</label>
                <input type="datetime-local" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaHora} onChange={e => setForm(f => ({ ...f, fechaHora: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Km Recorridos</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.kmRecorridos} onChange={e => setForm(f => ({ ...f, kmRecorridos: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Importe (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.importe} onChange={e => setForm(f => ({ ...f, importe: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Forma de Pago</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.formaPago} onChange={e => setForm(f => ({ ...f, formaPago: e.target.value as FormaPago }))}>
                    {Object.entries(PAGO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoServicio }))}>
                    {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Carrera'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="taxi_trips"
        moduleLabel="Carreras"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Carreras"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
