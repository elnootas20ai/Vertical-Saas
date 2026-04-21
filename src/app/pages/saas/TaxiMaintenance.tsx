import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter, Wrench, DollarSign,
  Car, CalendarClock, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type MaintenanceType = 'itv' | 'aceite' | 'frenos' | 'neumaticos' | 'revision_general' | 'averia' | 'chapa';
type MaintenanceStatus = 'programado' | 'en_taller' | 'completado';

interface Maintenance extends VerticalEntity {
  vehiculo: string;
  tipo: MaintenanceType;
  fecha: string;
  km: number;
  taller: string;
  coste: number;
  estado: MaintenanceStatus;
  proximoMantenimiento: string;
}

function normalizeMaintenance(raw: Maintenance): Maintenance {
  return {
    ...raw,
    km: typeof raw.km === 'number' ? raw.km : Number(raw.km) || 0,
    coste: typeof raw.coste === 'number' ? raw.coste : Number(raw.coste) || 0,
    tipo: raw.tipo as MaintenanceType,
    estado: raw.estado as MaintenanceStatus,
  };
}

const TIPO_CFG: Record<MaintenanceType, { label: string; bg: string; text: string }> = {
  itv:              { label: 'ITV',              bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  aceite:           { label: 'Aceite',           bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  frenos:           { label: 'Frenos',           bg: 'bg-red-100 dark:bg-red-900/40',      text: 'text-red-700 dark:text-red-300' },
  neumaticos:       { label: 'Neumáticos',       bg: 'bg-gray-100 dark:bg-gray-700',       text: 'text-gray-700 dark:text-gray-300' },
  revision_general: { label: 'Revisión General', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  averia:           { label: 'Avería',           bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  chapa:            { label: 'Chapa',            bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' },
};

const STATUS_CFG: Record<MaintenanceStatus, { label: string; dot: string }> = {
  programado: { label: 'Programado', dot: 'bg-blue-500' },
  en_taller:  { label: 'En Taller',  dot: 'bg-amber-500' },
  completado: { label: 'Completado', dot: 'bg-emerald-500' },
};

const EMPTY_FORM: Omit<Maintenance, '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'> = {
  vehiculo: '', tipo: 'revision_general', fecha: new Date().toISOString().slice(0, 10),
  km: 0, taller: '', coste: 0, estado: 'programado', proximoMantenimiento: '',
};

export function TaxiMaintenance() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Maintenance>('taxi', 'maintenance'), []);

  const [items, setItems] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<MaintenanceType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Maintenance | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'type', label: 'Tipo' },
    { key: 'date', label: 'Fecha' },
    { key: 'cost', label: 'Coste' },
    { key: 'workshop', label: 'Taller' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'cost', label: 'Coste', example: '' },
    { key: 'workshop', label: 'Taller', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} mantenimiento(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} mantenimiento(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!user?.user_id) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await api.list(user.user_id);
      setItems(list.map(normalizeMaintenance));
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => items.filter(m => {
    if (search && !m.vehiculo.toLowerCase().includes(search.toLowerCase()) && !m.taller.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTipo !== 'all' && m.tipo !== filterTipo) return false;
    if (filterStatus !== 'all' && m.estado !== filterStatus) return false;
    return true;
  }), [items, search, filterTipo, filterStatus]);

  const stats = useMemo(() => {
    const pendientes = items.filter(m => m.estado === 'programado').length;
    const costeMes = items.filter(m => m.fecha.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, m) => s + m.coste, 0);
    const enTaller = items.filter(m => m.estado === 'en_taller').length;
    const proxItv = items.filter(m => m.tipo === 'itv' && m.estado === 'programado').sort((a, b) => a.fecha.localeCompare(b.fecha))[0]?.fecha || 'N/A';
    return { pendientes, costeMes, enTaller, proxItv };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (m: Maintenance) => {
    setEditing(m);
    setForm({ vehiculo: m.vehiculo, tipo: m.tipo, fecha: m.fecha, km: m.km, taller: m.taller, coste: m.coste, estado: m.estado, proximoMantenimiento: m.proximoMantenimiento });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vehiculo.trim() || !user?.user_id) return;
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
    { label: 'Mant. Pendientes', value: stats.pendientes, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Coste Este Mes', value: `€${stats.costeMes.toFixed(2)}`, icon: DollarSign, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Vehículos en Taller', value: stats.enTaller, icon: Wrench, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Próxima ITV', value: stats.proxItv, icon: CalendarClock, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="Mantenimiento de Flota">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por matrícula o taller..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTipo} onChange={e => setFilterTipo(e.target.value as MaintenanceType | 'all')}>
                <option value="all">Todos los tipos</option>
                {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as MaintenanceStatus | 'all')}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo Mantenimiento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de mantenimiento"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Vehículo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Km</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Taller</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Coste</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Próximo Mant.</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">Cargando registros de mantenimiento…</td></tr>
              ) : (
                <>
                  {filtered.map(m => (
                    <tr key={m._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white"><span className="inline-flex items-center gap-1.5"><Car className="w-3.5 h-3.5 text-gray-400" />{m.vehiculo}</span></td>
                      <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TIPO_CFG[m.tipo].bg} ${TIPO_CFG[m.tipo].text}`}>{TIPO_CFG[m.tipo].label}</span></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.fecha}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{m.km.toLocaleString('es-ES')}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.taller}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">€{m.coste.toFixed(2)}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[m.estado].dot}`} />{STATUS_CFG[m.estado].label}</span></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.proximoMantenimiento || <span className="text-gray-400 italic">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(m._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron registros de mantenimiento.</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Mantenimiento' : 'Nuevo Mantenimiento'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vehículo (Matrícula) *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.vehiculo} onChange={e => setForm(f => ({ ...f, vehiculo: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as MaintenanceType }))}>
                    {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Kilómetros</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.km} onChange={e => setForm(f => ({ ...f, km: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Taller</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.taller} onChange={e => setForm(f => ({ ...f, taller: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Coste (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.coste} onChange={e => setForm(f => ({ ...f, coste: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as MaintenanceStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Próximo Mantenimiento</label>
                <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.proximoMantenimiento} onChange={e => setForm(f => ({ ...f, proximoMantenimiento: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Mantenimiento'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="taxi_maintenance"
        moduleLabel="Mantenimiento"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Mantenimiento"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
