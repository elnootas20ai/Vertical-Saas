import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Users, Star, Clock,
  Phone, Mail, Award, Activity, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Trainer extends VerticalEntity {
  nombre: string;
  especialidad: string;
  telefono: string;
  email: string;
  clientesAsignados: number;
  horario: string;
  certificaciones: string[];
  valoracion: number;
}

type TrainerForm = Omit<Trainer, keyof VerticalEntity>;

const EMPTY_FORM: TrainerForm = { nombre: '', especialidad: '', telefono: '', email: '', clientesAsignados: 0, horario: '', certificaciones: [], valoracion: 5 };

export function GymTrainers() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Trainer>('gym', 'trainers'), []);
  const userId = user?.user_id || user?.id || '';

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [form, setForm] = useState<TrainerForm>(EMPTY_FORM);
  const [certInput, setCertInput] = useState('');
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
      setTrainers(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'specialty', label: 'Especialidad' },
    { key: 'schedule', label: 'Horario' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'specialty', label: 'Especialidad', example: '' },
    { key: 'schedule', label: 'Horario', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} entrenador(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} entrenador(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => {
    return trainers.filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return t.nombre.toLowerCase().includes(q) || t.especialidad.toLowerCase().includes(q);
    });
  }, [trainers, search]);

  const stats = useMemo(() => {
    const sesionesHoy = trainers.reduce((s, t) => s + Math.floor(t.clientesAsignados * 0.3), 0);
    const avgRating = trainers.length ? (trainers.reduce((s, t) => s + t.valoracion, 0) / trainers.length).toFixed(1) : '0';
    return { total: trainers.length, sesionesHoy, avgRating };
  }, [trainers]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setCertInput(''); setShowModal(true); };
  const openEdit = (t: Trainer) => { setEditing(t); setForm({ nombre: t.nombre, especialidad: t.especialidad, telefono: t.telefono, email: t.email, clientesAsignados: t.clientesAsignados, horario: t.horario, certificaciones: [...t.certificaciones], valoracion: t.valoracion }); setCertInput(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.nombre.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch layer */
    }
  };

  const addCert = () => {
    if (!certInput.trim()) return;
    setForm(f => ({ ...f, certificaciones: [...f.certificaciones, certInput.trim()] }));
    setCertInput('');
  };
  const removeCert = (idx: number) => setForm(f => ({ ...f, certificaciones: f.certificaciones.filter((_, i) => i !== idx) }));

  const STAT_CARDS = [
    { label: 'Total Entrenadores', value: stats.total,       icon: Users,    color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Sesiones Hoy',      value: stats.sesionesHoy,  icon: Activity, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Valoración Media',   value: `${stats.avgRating} ★`, icon: Star, color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  const renderStars = (val: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(val) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />)}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{val}</span>
    </div>
  );

  return (
    <Layout title="Entrenadores">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por nombre o especialidad..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <AddButtonDropdown
                label="Nuevo Entrenador"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de entrenador"
              />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Especialidad</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Contacto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Clientes</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Horario</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Certificaciones</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Valoración</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(t => (
                <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{t.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.especialidad}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400 text-xs"><Phone className="w-3 h-3" />{t.telefono}</span>
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400 text-xs"><Mail className="w-3 h-3" />{t.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold">{t.clientesAsignados}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{t.horario}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.certificaciones.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium flex items-center gap-1"><Award className="w-3 h-3" />{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{renderStars(t.valoracion)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron entrenadores.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Entrenador' : 'Nuevo Entrenador'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Especialidad</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" placeholder="CrossFit, Yoga, Musculación..." value={form.especialidad} onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <input type="email" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Horario</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" placeholder="07:00 - 15:00" value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Valoración</label>
                  <input type="number" step="0.1" min={0} max={5} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.valoracion} onChange={e => setForm(f => ({ ...f, valoracion: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Certificaciones</label>
                <div className="flex gap-2 mb-2">
                  <input className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" placeholder="Añadir certificación..." value={certInput} onChange={e => setCertInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCert())} />
                  <button type="button" onClick={addCert} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.certificaciones.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                      {c}
                      <button type="button" onClick={() => removeCert(i)} className="hover:text-red-500 transition"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Entrenador'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="gym_trainers"
        moduleLabel="Entrenadores"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Entrenadores"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
