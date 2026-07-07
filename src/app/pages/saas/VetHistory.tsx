import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  FileText, Calendar, Users, Stethoscope,
  Loader2,
} from 'lucide-react';

interface ClinicalRecord extends VerticalEntity {
  fecha: string;
  paciente: string;
  veterinario: string;
  diagnostico: string;
  tratamiento: string;
  medicacion: string;
  proximaVisita: string;
  adjuntos: number;
}

type ClinicalRecordForm = Omit<ClinicalRecord, keyof VerticalEntity>;

const MONTH_PREFIX = new Date().toISOString().slice(0, 7);

const EMPTY_FORM: ClinicalRecordForm = {
  fecha: '2026-04-01', paciente: '', veterinario: '', diagnostico: '', tratamiento: '',
  medicacion: '', proximaVisita: '', adjuntos: 0,
};

export function VetHistory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<ClinicalRecord>('vet', 'history'), []);
  const userId = user?.user_id || user?.id || '';

  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterVet, setFilterVet] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ClinicalRecord | null>(null);
  const [form, setForm] = useState<ClinicalRecordForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'pet', label: 'Mascota' },
    { key: 'date', label: 'Fecha' },
    { key: 'diagnosis', label: 'Diagnóstico' },
    { key: 'treatment', label: 'Tratamiento' },
    { key: 'vet', label: 'Veterinario' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'pet', label: 'Mascota', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'diagnosis', label: 'Diagnóstico', example: '' },
    { key: 'treatment', label: 'Tratamiento', example: '' },
    { key: 'vet', label: 'Veterinario', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const paciente = entryStr(e, 'paciente');
    if (!paciente) return null;
    return {
      fecha: entryStr(e, 'fecha', 'date') || '2026-04-01', paciente: '', veterinario: '', diagnostico: '', tratamiento: '',
      medicacion: entryStr(e, 'medicacion') || '', proximaVisita: '', adjuntos: 0,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} registro creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setRecords(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const vets = useMemo(() => {
    const s = new Set(records.map(r => r.veterinario).filter(Boolean));
    return Array.from(s).sort();
  }, [records]);

  const filtered = useMemo(() => records.filter(r => {
    const q = search.toLowerCase();
    if (search && !r.paciente.toLowerCase().includes(q) && !r.diagnostico.toLowerCase().includes(q) && !r.tratamiento.toLowerCase().includes(q) && !r.medicacion.toLowerCase().includes(q)) return false;
    if (filterVet !== 'all' && r.veterinario !== filterVet) return false;
    return true;
  }), [records, search, filterVet]);

  const stats = useMemo(() => {
    const esteMes = records.filter(r => r.fecha.startsWith(MONTH_PREFIX)).length;
    const pacientesAtendidos = new Set(records.map(r => r.paciente)).size;
    const counts = new Map<string, number>();
    records.forEach(r => {
      counts.set(r.diagnostico, (counts.get(r.diagnostico) ?? 0) + 1);
    });
    const diagnosticosFrecuentes = [...counts.values()].filter(c => c > 1).length;
    return { total: records.length, esteMes, pacientesAtendidos, diagnosticosFrecuentes };
  }, [records]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (r: ClinicalRecord) => {
    setEditing(r);
    setForm({
      fecha: r.fecha, paciente: r.paciente, veterinario: r.veterinario, diagnostico: r.diagnostico,
      tratamiento: r.tratamiento, medicacion: r.medicacion, proximaVisita: r.proximaVisita, adjuntos: r.adjuntos,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.paciente.trim() || !form.diagnostico.trim() || !userId) return;
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
    { label: 'Total registros', value: stats.total, icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Este mes', value: stats.esteMes, icon: Calendar, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Pacientes atendidos', value: stats.pacientesAtendidos, icon: Users, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Diagnósticos frecuentes', value: stats.diagnosticosFrecuentes, icon: Stethoscope, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Historial Clínico">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por paciente, diagnóstico, tratamiento..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none min-w-[10rem]" value={filterVet} onChange={e => setFilterVet(e.target.value)} disabled={loading}>
                <option value="all">Todos los veterinarios</option>
                {vets.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo registro"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de registro"
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
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Veterinario</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Diagnóstico</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tratamiento</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Medicación</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Próxima visita</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Adjuntos</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{r.fecha}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{r.paciente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.veterinario}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white max-w-[180px]">{r.diagnostico}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[160px] truncate" title={r.tratamiento}>{r.tratamiento}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={r.medicacion}>{r.medicacion}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.proximaVisita || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{r.adjuntos}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay registros con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar registro' : 'Nuevo registro clínico'}</h2>
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
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Veterinario</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.veterinario} onChange={e => setForm(f => ({ ...f, veterinario: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Diagnóstico *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.diagnostico} onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tratamiento</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-y" value={form.tratamiento} onChange={e => setForm(f => ({ ...f, tratamiento: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Medicación</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.medicacion} onChange={e => setForm(f => ({ ...f, medicacion: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Próxima visita</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.proximaVisita} onChange={e => setForm(f => ({ ...f, proximaVisita: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº adjuntos</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.adjuntos} onChange={e => setForm(f => ({ ...f, adjuntos: Number(e.target.value) }))} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear registro'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="vet_history"
        moduleLabel="Historial"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Historial"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
