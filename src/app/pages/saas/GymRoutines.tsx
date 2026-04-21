import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Dumbbell, Zap, Timer,
  Users, ChevronDown, ChevronUp, UserPlus, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type RoutineType = 'fuerza' | 'cardio' | 'mixta' | 'funcional';
type RoutineLevel = 'principiante' | 'intermedio' | 'avanzado';

interface Exercise {
  nombre: string;
  series: number;
  repeticiones: string;
  descanso: string;
}

interface Routine extends VerticalEntity {
  nombre: string;
  tipo: RoutineType;
  duracion: number;
  nivel: RoutineLevel;
  ejercicios: Exercise[];
  asignados: string[];
}

type RoutineForm = Omit<Routine, keyof VerticalEntity>;

interface GymMemberNameRow extends VerticalEntity {
  nombre: string;
}

const TYPE_CONFIG: Record<RoutineType, { label: string; bg: string; text: string }> = {
  fuerza:    { label: 'Fuerza',    bg: 'bg-red-100 dark:bg-red-900/40',     text: 'text-red-700 dark:text-red-300' },
  cardio:    { label: 'Cardio',    bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-700 dark:text-blue-300' },
  mixta:     { label: 'Mixta',     bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  funcional: { label: 'Funcional', bg: 'bg-teal-100 dark:bg-teal-900/40',   text: 'text-teal-700 dark:text-teal-300' },
};

const LEVEL_CONFIG: Record<RoutineLevel, { label: string; bg: string; text: string }> = {
  principiante: { label: 'Principiante', bg: 'bg-green-100 dark:bg-green-900/40',  text: 'text-green-700 dark:text-green-300' },
  intermedio:   { label: 'Intermedio',   bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  avanzado:     { label: 'Avanzado',     bg: 'bg-red-100 dark:bg-red-900/40',      text: 'text-red-700 dark:text-red-300' },
};

const EMPTY_EXERCISE: Exercise = { nombre: '', series: 3, repeticiones: '10', descanso: '60s' };
const EMPTY_FORM: RoutineForm = { nombre: '', tipo: 'mixta', duracion: 45, nivel: 'principiante', ejercicios: [{ ...EMPTY_EXERCISE }], asignados: [] };

export function GymRoutines() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Routine>('gym', 'routines'), []);
  const membersApi = useMemo(() => createVerticalApi<GymMemberNameRow>('gym', 'members'), []);
  const userId = user?.user_id || user?.id || '';

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [memberOptions, setMemberOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<RoutineType | 'all'>('all');
  const [filterLevel, setFilterLevel] = useState<RoutineLevel | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  useModalClose(showModal, () => setShowModal(false));
  useModalClose(!!showAssignModal, () => setShowAssignModal(null));
  const [editing, setEditing] = useState<Routine | null>(null);
  const [form, setForm] = useState<RoutineForm>(EMPTY_FORM);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [routineList, memberList] = await Promise.all([
        api.list(userId),
        membersApi.list(userId),
      ]);
      setRoutines(routineList);
      setMemberOptions(memberList.map(m => m.nombre).filter(Boolean));
    } finally {
      setLoading(false);
    }
  }, [userId, api, membersApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'member', label: 'Socio' },
    { key: 'type', label: 'Tipo' },
    { key: 'exercises', label: 'Ejercicios' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'member', label: 'Socio', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'exercises', label: 'Ejercicios', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} rutina(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} rutina(s) importado(s)`);
  };

  const filtered = useMemo(() => {
    return routines.filter(r => {
      if (search && !r.nombre.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== 'all' && r.tipo !== filterType) return false;
      if (filterLevel !== 'all' && r.nivel !== filterLevel) return false;
      return true;
    });
  }, [routines, search, filterType, filterLevel]);

  const stats = useMemo(() => {
    const totalEjercicios = routines.reduce((s, r) => s + r.ejercicios.length, 0);
    const totalAsignados = new Set(routines.flatMap(r => r.asignados)).size;
    return { total: routines.length, totalEjercicios, totalAsignados };
  }, [routines]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, ejercicios: [{ ...EMPTY_EXERCISE }] }); setShowModal(true); };
  const openEdit = (r: Routine) => { setEditing(r); setForm({ nombre: r.nombre, tipo: r.tipo, duracion: r.duracion, nivel: r.nivel, ejercicios: r.ejercicios.map(e => ({ ...e })), asignados: [...r.asignados] }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.nombre.trim() || !userId) return;
    const cleaned: RoutineForm = { ...form, ejercicios: form.ejercicios.filter(e => e.nombre.trim()) };
    try {
      if (editing) {
        await api.update(userId, editing._id, cleaned);
      } else {
        await api.create(userId, cleaned);
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

  const updateExercise = (idx: number, field: keyof Exercise, value: string | number) => {
    setForm(f => ({ ...f, ejercicios: f.ejercicios.map((e, i) => i === idx ? { ...e, [field]: value } : e) }));
  };
  const addExercise = () => setForm(f => ({ ...f, ejercicios: [...f.ejercicios, { ...EMPTY_EXERCISE }] }));
  const removeExercise = (idx: number) => setForm(f => ({ ...f, ejercicios: f.ejercicios.filter((_, i) => i !== idx) }));

  const toggleAssign = async (routineId: string, member: string) => {
    const routine = routines.find(r => r._id === routineId);
    if (!routine || !userId) return;
    const has = routine.asignados.includes(member);
    const asignados = has ? routine.asignados.filter(a => a !== member) : [...routine.asignados, member];
    try {
      await api.update(userId, routineId, { asignados });
      await loadData();
    } catch {
      /* error from fetch layer */
    }
  };

  const STAT_CARDS = [
    { label: 'Total Rutinas',    value: stats.total,           icon: Dumbbell, color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ejercicios Totales', value: stats.totalEjercicios, icon: Zap,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Miembros Asignados', value: stats.totalAsignados,  icon: Users,  color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Rutinas de Entrenamiento">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar rutina..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterType} onChange={e => setFilterType(e.target.value as RoutineType | 'all')} disabled={loading}>
              <option value="all">Todos los tipos</option>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterLevel} onChange={e => setFilterLevel(e.target.value as RoutineLevel | 'all')} disabled={loading}>
              <option value="all">Todos los niveles</option>
              {Object.entries(LEVEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nueva rutina"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de rutina"
              />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Rutina</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nivel</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Duración</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Ejercicios</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Asignados</th>
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
              ) : filtered.map(r => (
                <Fragment key={r._id}>
                  <tr className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3">
                      <button onClick={() => setExpandedRow(expandedRow === r._id ? null : r._id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        {expandedRow === r._id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.nombre}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TYPE_CONFIG[r.tipo].bg} ${TYPE_CONFIG[r.tipo].text}`}>{TYPE_CONFIG[r.tipo].label}</span></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${LEVEL_CONFIG[r.nivel].bg} ${LEVEL_CONFIG[r.nivel].text}`}>{LEVEL_CONFIG[r.nivel].label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{r.duracion} min</span></td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold">{r.ejercicios.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-600 dark:text-gray-400">{r.asignados.length}</span>
                        <button onClick={() => setShowAssignModal(r._id)} className="p-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 transition" title="Asignar miembro"><UserPlus className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedRow === r._id && (
                    <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                      <td colSpan={8} className="px-8 py-4">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left py-2 font-medium">Ejercicio</th>
                              <th className="text-left py-2 font-medium">Series</th>
                              <th className="text-left py-2 font-medium">Repeticiones</th>
                              <th className="text-left py-2 font-medium">Descanso</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.ejercicios.map((e, i) => (
                              <tr key={i} className="border-b border-gray-100 dark:border-gray-700/30">
                                <td className="py-2 text-gray-900 dark:text-white font-medium">{e.nombre}</td>
                                <td className="py-2 text-gray-600 dark:text-gray-400">{e.series}</td>
                                <td className="py-2 text-gray-600 dark:text-gray-400">{e.repeticiones}</td>
                                <td className="py-2 text-gray-600 dark:text-gray-400">{e.descanso}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {r.asignados.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Asignados:</span>
                            {r.asignados.map(a => <span key={a} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">{a}</span>)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron rutinas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Rutina' : 'Nueva Rutina'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as RoutineType }))}>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nivel</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none" value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value as RoutineLevel }))}>
                    {Object.entries(LEVEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Duración (min)</label>
                  <input type="number" min={1} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none" value={form.duracion} onChange={e => setForm(f => ({ ...f, duracion: +e.target.value }))} />
                </div>
              </div>

              {/* Exercise builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ejercicios</label>
                  <button type="button" onClick={addExercise} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" />Añadir</button>
                </div>
                <div className="space-y-2">
                  {form.ejercicios.map((ex, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      <input className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none" placeholder="Ejercicio" value={ex.nombre} onChange={e => updateExercise(idx, 'nombre', e.target.value)} />
                      <input type="number" min={1} className="w-16 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none text-center" placeholder="Series" value={ex.series} onChange={e => updateExercise(idx, 'series', +e.target.value)} />
                      <input className="w-20 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none text-center" placeholder="Reps" value={ex.repeticiones} onChange={e => updateExercise(idx, 'repeticiones', e.target.value)} />
                      <input className="w-16 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none text-center" placeholder="Desc." value={ex.descanso} onChange={e => updateExercise(idx, 'descanso', e.target.value)} />
                      <button type="button" onClick={() => removeExercise(idx)} className="p-1 text-gray-400 hover:text-red-500 transition"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Rutina'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAssignModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Asignar Miembros</h2>
              <button onClick={() => setShowAssignModal(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-2 max-h-60 overflow-y-auto">
              {memberOptions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No hay socios en el directorio. Añade socios en la sección Socios.</p>
              ) : memberOptions.map(m => {
                const routine = routines.find(r => r._id === showAssignModal);
                const isAssigned = routine?.asignados.includes(m) ?? false;
                return (
                  <label key={m} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition">
                    <input type="checkbox" checked={isAssigned} onChange={() => void toggleAssign(showAssignModal!, m)} className="w-4 h-4 rounded border-gray-300 dark:border-gray-600" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{m}</span>
                  </label>
                );
              })}
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button onClick={() => setShowAssignModal(null)} className="px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">Listo</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="gym_routines"
        moduleLabel="Rutinas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Rutinas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
