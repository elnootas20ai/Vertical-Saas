import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  FileText, Plus, Search, Edit3, Trash2, X, ChevronDown,
  ChevronUp, Stethoscope, ClipboardList, Scissors, TestTube,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type RecordType = 'consulta' | 'prueba' | 'cirugia';

interface ClinicRecord extends VerticalEntity {
  paciente: string;
  fecha: string;
  diagnostico: string;
  doctor: string;
  tipo: RecordType;
  notas: string;
}

type ClinicRecordForm = Omit<ClinicRecord, keyof VerticalEntity>;

const TYPE_CONFIG: Record<RecordType, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  consulta: { label: 'Consulta', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: <Stethoscope className="w-3.5 h-3.5" /> },
  prueba: { label: 'Prueba', bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: <TestTube className="w-3.5 h-3.5" /> },
  cirugia: { label: 'Cirugía', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: <Scissors className="w-3.5 h-3.5" /> },
};

const emptyForm = (): ClinicRecordForm => ({
  paciente: '', fecha: '', diagnostico: '', doctor: '', tipo: 'consulta', notas: '',
});

export function ClinicHistory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<ClinicRecord>('clinic', 'history'), []);
  const userId = user?.user_id || user?.id || '';

  const [records, setRecords] = useState<ClinicRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<RecordType | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  useModalClose(showModal, () => setShowModal(false));
  const [editing, setEditing] = useState<ClinicRecord | null>(null);
  const [form, setForm] = useState<ClinicRecordForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'patient', label: 'Paciente' },
    { key: 'date', label: 'Fecha' },
    { key: 'diagnosis', label: 'Diagnóstico' },
    { key: 'treatment', label: 'Tratamiento' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'patient', label: 'Paciente', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'diagnosis', label: 'Diagnóstico', example: '' },
    { key: 'treatment', label: 'Tratamiento', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
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
      paciente,
      fecha: entryStr(e, 'fecha', 'date') || '',
      diagnostico: entryStr(e, 'diagnostico') || '',
      doctor: entryStr(e, 'doctor') || '',
      tipo: entryStr(e, 'tipo', 'type') || 'consulta',
      notas: entryStr(e, 'notas', 'notes', 'description') || '',
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

  const filtered = records.filter(r => {
    const matchSearch = r.paciente.toLowerCase().includes(search.toLowerCase()) || r.diagnostico.toLowerCase().includes(search.toLowerCase());
    const matchType = !filterType || r.tipo === filterType;
    return matchSearch && matchType;
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (r: ClinicRecord) => {
    setEditing(r);
    setForm({
      paciente: r.paciente, fecha: r.fecha, diagnostico: r.diagnostico, doctor: r.doctor, tipo: r.tipo, notas: r.notas,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.paciente || !form.diagnostico || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  return (
    <Layout title="Historial Clínico">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total registros', value: records.length, icon: <FileText className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Consultas', value: records.filter(r => r.tipo === 'consulta').length, icon: <ClipboardList className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'Cirugías', value: records.filter(r => r.tipo === 'cirugia').length, icon: <Scissors className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por paciente o diagnóstico..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los tipos</option>
              {(Object.entries(TYPE_CONFIG) as [RecordType, typeof TYPE_CONFIG[RecordType]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
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

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="w-10 px-4 py-3" />
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Diagnóstico</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Doctor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(r => {
                const tc = TYPE_CONFIG[r.tipo];
                const isExpanded = expandedId === r._id;
                return (
                  <Fragment key={r._id}>
                    <tr className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : r._id)}>
                      <td className="px-4 py-3 text-gray-400">{isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{r.paciente}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.fecha}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">{r.diagnostico}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{r.doctor}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tc.bg} ${tc.text}`}>{tc.icon}{tc.label}</span></td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => void handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-800/80">
                        <td colSpan={7} className="px-8 py-4">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">Notas clínicas:</p>
                            <p className="leading-relaxed">{r.notas}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Registro' : 'Nuevo Registro'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paciente</label>
                <input value={form.paciente} onChange={e => setForm(p => ({ ...p, paciente: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as RecordType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(TYPE_CONFIG) as [RecordType, typeof TYPE_CONFIG[RecordType]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor</label>
                <input value={form.doctor} onChange={e => setForm(p => ({ ...p, doctor: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Diagnóstico</label>
                <input value={form.diagnostico} onChange={e => setForm(p => ({ ...p, diagnostico: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas clínicas</label>
                <textarea rows={4} value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={() => void handleSave()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="clinic_history"
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
