import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  FileText, Plus, Search, Edit3, Trash2, X, CheckCircle,
  AlertCircle, Ban, PlusCircle, MinusCircle, Pill, CalendarDays,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type PrescriptionStatus = 'activa' | 'completada' | 'cancelada';

interface Medication {
  nombre: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
}

interface Prescription extends VerticalEntity {
  paciente: string;
  doctor: string;
  fecha: string;
  medicamentos: Medication[];
  estado: PrescriptionStatus;
}

type PrescriptionForm = Omit<Prescription, keyof VerticalEntity>;

const STATUS_CONFIG: Record<PrescriptionStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  activa: { label: 'Activa', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  completada: { label: 'Completada', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelada: { label: 'Cancelada', bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-600 dark:text-gray-400', icon: <Ban className="w-3.5 h-3.5" /> },
};

const emptyMed = (): Medication => ({ nombre: '', dosis: '', frecuencia: '', duracion: '' });

const emptyForm = (): PrescriptionForm => ({
  paciente: '', doctor: '', fecha: '', medicamentos: [emptyMed()], estado: 'activa',
});

export function ClinicPrescriptions() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Prescription>('clinic', 'prescriptions'), []);
  const userId = user?.user_id || user?.id || '';

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<PrescriptionStatus | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Prescription | null>(null);
  const [form, setForm] = useState<PrescriptionForm>(emptyForm());
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
      setPrescriptions(list.map(p => {
        let meds = p.medicamentos;
        if (typeof meds === 'string') {
          try {
            meds = JSON.parse(meds) as Medication[];
          } catch {
            meds = [emptyMed()];
          }
        }
        if (!Array.isArray(meds) || meds.length === 0) meds = [emptyMed()];
        return { ...p, medicamentos: meds };
      }));
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'patient', label: 'Paciente' },
    { key: 'medication', label: 'Medicamento' },
    { key: 'dosage', label: 'Dosis' },
    { key: 'duration', label: 'Duración' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'patient', label: 'Paciente', example: '' },
    { key: 'medication', label: 'Medicamento', example: '' },
    { key: 'dosage', label: 'Dosis', example: '' },
    { key: 'duration', label: 'Duración', example: '' },
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
      dosis: entryStr(e, 'dosis') || '',
      frecuencia: entryStr(e, 'frecuencia') || '',
      duracion: entryStr(e, 'duracion') || '',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} receta creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = prescriptions.filter(p => {
    const matchSearch = p.paciente.toLowerCase().includes(search.toLowerCase()) || p.doctor.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || p.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const emitidasHoy = prescriptions.filter(p => p.fecha === todayStr).length;
  const emitidasMes = prescriptions.filter(p => p.fecha.startsWith(thisMonth)).length;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: Prescription) => {
    setEditing(p);
    setForm({
      paciente: p.paciente, doctor: p.doctor, fecha: p.fecha,
      medicamentos: p.medicamentos.map(m => ({ ...m })), estado: p.estado,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.paciente || !form.doctor || form.medicamentos.length === 0 || !userId) return;
    try {
      const payload = { ...form, medicamentos: form.medicamentos };
      if (editing) {
        await api.update(userId, editing._id, payload);
      } else {
        await api.create(userId, payload);
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

  const addMed = () => setForm(p => ({ ...p, medicamentos: [...p.medicamentos, emptyMed()] }));
  const removeMed = (idx: number) => setForm(p => ({ ...p, medicamentos: p.medicamentos.filter((_, i) => i !== idx) }));
  const updateMed = (idx: number, field: keyof Medication, value: string) => {
    setForm(p => ({ ...p, medicamentos: p.medicamentos.map((m, i) => i === idx ? { ...m, [field]: value } : m) }));
  };

  const stats = [
    { label: 'Emitidas hoy', value: emitidasHoy, icon: <FileText className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Este mes', value: emitidasMes, icon: <CalendarDays className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Activas', value: prescriptions.filter(p => p.estado === 'activa').length, icon: <AlertCircle className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Recetas">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por paciente o doctor..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los estados</option>
              {(Object.entries(STATUS_CONFIG) as [PrescriptionStatus, typeof STATUS_CONFIG[PrescriptionStatus]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <AddButtonDropdown
                label="Nueva receta"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de receta"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Doctor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Medicamentos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Duración</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
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
              ) : filtered.map(p => {
                const st = STATUS_CONFIG[p.estado];
                return (
                  <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.paciente}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.doctor}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.fecha}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.medicamentos.map((m, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                            <Pill className="w-3 h-3" />{m.nombre} {m.dosis}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{p.medicamentos[0]?.duracion || '-'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.icon}{st.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron recetas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Receta' : 'Nueva Receta'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paciente</label>
                  <input value={form.paciente} onChange={e => setForm(p => ({ ...p, paciente: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor</label>
                  <input value={form.doctor} onChange={e => setForm(p => ({ ...p, doctor: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value as PrescriptionStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(STATUS_CONFIG) as [PrescriptionStatus, typeof STATUS_CONFIG[PrescriptionStatus]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Medicamentos</label>
                  <button onClick={addMed} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                    <PlusCircle className="w-4 h-4" /> Añadir medicamento
                  </button>
                </div>
                <div className="space-y-3">
                  {form.medicamentos.map((med, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Medicamento {idx + 1}</span>
                        {form.medicamentos.length > 1 && (
                          <button onClick={() => removeMed(idx)} className="p-1 text-red-400 hover:text-red-600"><MinusCircle className="w-4 h-4" /></button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={med.nombre} onChange={e => updateMed(idx, 'nombre', e.target.value)} placeholder="Nombre" className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input value={med.dosis} onChange={e => updateMed(idx, 'dosis', e.target.value)} placeholder="Dosis" className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input value={med.frecuencia} onChange={e => updateMed(idx, 'frecuencia', e.target.value)} placeholder="Frecuencia" className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input value={med.duracion} onChange={e => updateMed(idx, 'duracion', e.target.value)} placeholder="Duración" className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                    </div>
                  ))}
                </div>
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
        module="clinic_prescriptions"
        moduleLabel="Recetas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Recetas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
