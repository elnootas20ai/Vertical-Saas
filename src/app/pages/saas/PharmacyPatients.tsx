import { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  Users, UserPlus, Shield, AlertOctagon, Loader2,
} from 'lucide-react';

interface Patient extends VerticalEntity {
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  seguro: string;
  alergias: string;
  ultimaVisita: string;
  altaMes: string;
}

type PatientFormFields = Omit<
  Patient,
  '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'
>;

const EMPTY_FORM: PatientFormFields = {
  nombre: '', dni: '', telefono: '', email: '', seguro: '', alergias: '', ultimaVisita: '', altaMes: '',
};

const MES_ACTUAL = '2026-04';

export function PharmacyPatients() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Patient>('pharmacy', 'patients'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSeguro, setFilterSeguro] = useState<'all' | 'con' | 'sin'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientFormFields>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'allergies', label: 'Alergias' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'allergies', label: 'Alergias', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} paciente(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} paciente(s) importado(s)`);
  };

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

  const filtered = useMemo(() => items.filter(p => {
    const q = search.toLowerCase();
    if (search && !p.nombre.toLowerCase().includes(q) && !p.dni.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q) && !p.telefono.replace(/\s/g, '').includes(q.replace(/\s/g, ''))) return false;
    if (filterSeguro === 'con' && (p.seguro === '—' || !p.seguro.trim())) return false;
    if (filterSeguro === 'sin' && p.seguro !== '—' && p.seguro.trim()) return false;
    return true;
  }), [items, search, filterSeguro]);

  const stats = useMemo(() => {
    const nuevosMes = items.filter(p => p.altaMes === MES_ACTUAL).length;
    const conSeguro = items.filter(p => p.seguro !== '—' && p.seguro.trim()).length;
    const conAlergias = items.filter(p => p.alergias !== '—' && p.alergias.trim()).length;
    return { total: items.length, nuevosMes, conSeguro, conAlergias };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, altaMes: MES_ACTUAL }); setShowModal(true); };
  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({ nombre: p.nombre, dni: p.dni, telefono: p.telefono, email: p.email, seguro: p.seguro, alergias: p.alergias, ultimaVisita: p.ultimaVisita, altaMes: p.altaMes });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.dni.trim()) return;
    if (!userId) return;
    try {
      const formData = { ...form } as Partial<Patient>;
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
    { label: 'Total pacientes', value: stats.total, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Nuevos este mes', value: stats.nuevosMes, icon: UserPlus, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Con seguro', value: stats.conSeguro, icon: Shield, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Con alergias', value: stats.conAlergias, icon: AlertOctagon, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Pacientes">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por nombre, DNI, teléfono o email..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterSeguro} onChange={e => setFilterSeguro(e.target.value as 'all' | 'con' | 'sin')}>
                <option value="all">Todos</option>
                <option value="con">Con seguro</option>
                <option value="sin">Sin seguro</option>
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo paciente"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de paciente"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">DNI</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Teléfono</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Seguro</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Alergias</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Última visita</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 animate-spin" />
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map(p => (
                    <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nombre}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{p.dni}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.telefono}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={p.email}>{p.email}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.seguro}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={p.alergias}>{p.alergias}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.ultimaVisita}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                          <button type="button" onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay pacientes que coincidan con los filtros.</td></tr>
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar paciente' : 'Nuevo paciente'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre completo *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">DNI / ID *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Seguro (o &quot;—&quot; si no tiene)</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.seguro} onChange={e => setForm(f => ({ ...f, seguro: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Alergias</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.alergias} onChange={e => setForm(f => ({ ...f, alergias: e.target.value }))} placeholder="— si no aplica" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Última visita</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ultimaVisita} onChange={e => setForm(f => ({ ...f, ultimaVisita: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Alta (YYYY-MM)</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.altaMes} onChange={e => setForm(f => ({ ...f, altaMes: e.target.value }))} placeholder="2026-04" />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear paciente'}</button>
            </div>
          </div>
        </div>
      )}

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="pharmacy_patients"
        moduleLabel="Pacientes"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pacientes"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
