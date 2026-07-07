import { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  FileText, Clock, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react';

type PrescriptionStatus = 'pendiente' | 'dispensada' | 'caducada';

interface Prescription extends VerticalEntity {
  paciente: string;
  medico: string;
  medicamento: string;
  dosis: string;
  fecha: string;
  estado: PrescriptionStatus;
}

type PrescriptionFormFields = Omit<
  Prescription,
  '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'
>;

const STATUS_CFG: Record<PrescriptionStatus, { label: string; dot: string }> = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500' },
  dispensada: { label: 'Dispensada', dot: 'bg-emerald-500' },
  caducada: { label: 'Caducada', dot: 'bg-red-500' },
};

const HOY = '2026-04-01';

const EMPTY_FORM: PrescriptionFormFields = {
  paciente: '', medico: '', medicamento: '', dosis: '', fecha: '', estado: 'pendiente',
};

export function PharmacyPrescriptions() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Prescription>('pharmacy', 'prescriptions'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<PrescriptionStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Prescription | null>(null);
  const [form, setForm] = useState<PrescriptionFormFields>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'patient', label: 'Paciente' },
    { key: 'medication', label: 'Medicamento' },
    { key: 'dosage', label: 'Dosis' },
    { key: 'doctor', label: 'Médico' },
    { key: 'date', label: 'Fecha' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'patient', label: 'Paciente', example: '' },
    { key: 'medication', label: 'Medicamento', example: '' },
    { key: 'dosage', label: 'Dosis', example: '' },
    { key: 'doctor', label: 'Médico', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
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

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await api.list(userId);
      setItems(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(r => {
    const q = search.toLowerCase();
    if (search && !r.paciente.toLowerCase().includes(q) && !r.medico.toLowerCase().includes(q) && !r.medicamento.toLowerCase().includes(q)) return false;
    if (filterStatus !== 'all' && r.estado !== filterStatus) return false;
    return true;
  }), [items, search, filterStatus]);

  const stats = useMemo(() => {
    const pendientes = items.filter(r => r.estado === 'pendiente').length;
    const dispensadasHoy = items.filter(r => r.estado === 'dispensada' && r.fecha === HOY).length;
    const caducadas = items.filter(r => r.estado === 'caducada').length;
    return { total: items.length, pendientes, dispensadasHoy, caducadas };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (r: Prescription) => {
    setEditing(r);
    setForm({ paciente: r.paciente, medico: r.medico, medicamento: r.medicamento, dosis: r.dosis, fecha: r.fecha, estado: r.estado });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.paciente.trim() || !form.medicamento.trim()) return;
    if (!userId) return;
    try {
      const formData = { ...form } as Partial<Prescription>;
      if (editing) {
        await api.update(userId, editing._id, formData);
      } else {
        await api.create(userId, formData);
      }
      await loadData();
      setShowModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const STAT_CARDS = [
    { label: 'Total recetas', value: stats.total, icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Pendientes', value: stats.pendientes, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Dispensadas hoy', value: stats.dispensadasHoy, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Caducadas', value: stats.caducadas, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Recetas">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por paciente, médico o medicamento..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as PrescriptionStatus | 'all')}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
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
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Paciente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Médico</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Medicamento</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Dosis</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 animate-spin" />
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map(r => (
                    <tr key={r._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.paciente}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.medico}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{r.medicamento}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={r.dosis}>{r.dosis}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.fecha}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[r.estado].dot}`} />{STATUS_CFG[r.estado].label}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                          <button type="button" onClick={() => handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay recetas que coincidan con los filtros.</td></tr>
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar receta' : 'Nueva receta'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Paciente *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.paciente} onChange={e => setForm(f => ({ ...f, paciente: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Médico</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.medico} onChange={e => setForm(f => ({ ...f, medico: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Medicamento *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.medicamento} onChange={e => setForm(f => ({ ...f, medicamento: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Dosis</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.dosis} onChange={e => setForm(f => ({ ...f, dosis: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as PrescriptionStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear receta'}</button>
            </div>
          </div>
        </div>
      )}

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="pharmacy_prescriptions"
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
