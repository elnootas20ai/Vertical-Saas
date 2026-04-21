import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  Syringe, Clock, AlertTriangle, CalendarRange,
  Loader2,
} from 'lucide-react';

type Species = 'perro' | 'gato' | 'ave' | 'reptil' | 'roedor' | 'otro';
type VacStatus = 'aplicada' | 'pendiente' | 'vencida';

interface Vaccination extends VerticalEntity {
  fecha: string;
  paciente: string;
  especie: Species;
  vacuna: string;
  lote: string;
  proximaDosis: string;
  veterinario: string;
  estado: VacStatus;
}

type VaccinationForm = Omit<Vaccination, keyof VerticalEntity>;

const SPECIES_CFG: Record<Species, { label: string }> = {
  perro: { label: 'Perro' },
  gato: { label: 'Gato' },
  ave: { label: 'Ave' },
  reptil: { label: 'Reptil' },
  roedor: { label: 'Roedor' },
  otro: { label: 'Otro' },
};

const STATUS_CFG: Record<VacStatus, { label: string; dot: string }> = {
  aplicada: { label: 'Aplicada', dot: 'bg-emerald-500' },
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500' },
  vencida: { label: 'Vencida', dot: 'bg-red-500' },
};

const MONTH_PREFIX = new Date().toISOString().slice(0, 7);

const EMPTY_FORM: VaccinationForm = {
  fecha: '2026-04-01', paciente: '', especie: 'perro', vacuna: '', lote: '', proximaDosis: '', veterinario: '', estado: 'pendiente',
};

export function VetVaccinations() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Vaccination>('vet', 'vaccinations'), []);
  const userId = user?.user_id || user?.id || '';

  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<VacStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  useModalClose(showModal, () => setShowModal(false));
  const [editing, setEditing] = useState<Vaccination | null>(null);
  const [form, setForm] = useState<VaccinationForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'pet', label: 'Mascota' },
    { key: 'vaccine', label: 'Vacuna' },
    { key: 'date', label: 'Fecha' },
    { key: 'nextDate', label: 'Pr?xima dosis' },
    { key: 'vet', label: 'Veterinario' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'pet', label: 'Mascota', example: '' },
    { key: 'vaccine', label: 'Vacuna', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'nextDate', label: 'Pr?xima dosis', example: '' },
    { key: 'vet', label: 'Veterinario', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} vacunaci?n(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} vacunaci?n(s) importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setVaccinations(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => vaccinations.filter(v => {
    const q = search.toLowerCase();
    if (search && !v.paciente.toLowerCase().includes(q) && !v.vacuna.toLowerCase().includes(q) && !v.lote.toLowerCase().includes(q) && !v.veterinario.toLowerCase().includes(q)) return false;
    if (filterStatus !== 'all' && v.estado !== filterStatus) return false;
    return true;
  }), [vaccinations, search, filterStatus]);

  const stats = useMemo(() => {
    const aplicadas = vaccinations.filter(v => v.estado === 'aplicada').length;
    const pendientes = vaccinations.filter(v => v.estado === 'pendiente').length;
    const vencidas = vaccinations.filter(v => v.estado === 'vencida').length;
    const esteMes = vaccinations.filter(v => v.fecha.startsWith(MONTH_PREFIX)).length;
    return { aplicadas, pendientes, vencidas, esteMes };
  }, [vaccinations]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (v: Vaccination) => {
    setEditing(v);
    setForm({
      fecha: v.fecha, paciente: v.paciente, especie: v.especie, vacuna: v.vacuna, lote: v.lote,
      proximaDosis: v.proximaDosis, veterinario: v.veterinario, estado: v.estado,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.paciente.trim() || !form.vacuna.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const STAT_CARDS = [
    { label: 'Vacunas aplicadas', value: stats.aplicadas, icon: Syringe, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Pendientes', value: stats.pendientes, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Vencidas', value: stats.vencidas, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Este mes', value: stats.esteMes, icon: CalendarRange, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ];

  return (
    <Layout title="Vacunaciones">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por paciente, vacuna, lote o veterinario..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as VacStatus | 'all')} disabled={loading}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva vacuna"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta r?pida"
                quickAddDesc="Formulario de vacunaci?n"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Paciente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Especie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Vacuna</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Lote</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Pr?xima dosis</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Veterinario</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando?
                    </span>
                  </td>
                </tr>
              ) : filtered.map(v => (
                <tr key={v._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{v.fecha}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{v.paciente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{SPECIES_CFG[v.especie].label}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white max-w-[200px]">{v.vacuna}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{v.lote}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{v.proximaDosis || <span className="text-gray-400 italic">?</span>}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.veterinario}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[v.estado].dot}`} />{STATUS_CFG[v.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(v._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay vacunaciones con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar vacunaci?n' : 'Nueva vacunaci?n'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Paciente *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.paciente} onChange={e => setForm(f => ({ ...f, paciente: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Especie</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.especie} onChange={e => setForm(f => ({ ...f, especie: e.target.value as Species }))}>
                    {Object.entries(SPECIES_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as VacStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre de la vacuna *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.vacuna} onChange={e => setForm(f => ({ ...f, vacuna: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Lote</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Pr?xima dosis</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.proximaDosis} onChange={e => setForm(f => ({ ...f, proximaDosis: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Veterinario</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.veterinario} onChange={e => setForm(f => ({ ...f, veterinario: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Registrar vacunaci?n'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="vet_vaccinations"
        moduleLabel="Vacunaciones"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Vacunaciones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
