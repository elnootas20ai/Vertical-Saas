import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Calendar, Users, Clock,
  Activity, LayoutGrid, List, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ClassType = 'yoga' | 'crossfit' | 'spinning' | 'pilates' | 'boxeo' | 'zumba';
type ViewMode = 'table' | 'schedule';
type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado';

interface GymClass extends VerticalEntity {
  nombre: string;
  instructor: string;
  horario: string;
  dia: DayOfWeek;
  capacidad: number;
  inscritos: number;
  sala: string;
  tipo: ClassType;
}

type GymClassForm = Omit<GymClass, keyof VerticalEntity>;

const CLASS_TYPE_CONFIG: Record<ClassType, { label: string; bg: string; text: string }> = {
  yoga:     { label: 'Yoga',     bg: 'bg-teal-100 dark:bg-teal-900/40',   text: 'text-teal-700 dark:text-teal-300' },
  crossfit: { label: 'CrossFit', bg: 'bg-red-100 dark:bg-red-900/40',     text: 'text-red-700 dark:text-red-300' },
  spinning: { label: 'Spinning', bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  pilates:  { label: 'Pilates',  bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  boxeo:    { label: 'Boxeo',    bg: 'bg-gray-200 dark:bg-gray-700',       text: 'text-gray-700 dark:text-gray-300' },
  zumba:    { label: 'Zumba',    bg: 'bg-pink-100 dark:bg-pink-900/40',   text: 'text-pink-700 dark:text-pink-300' },
};

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'lunes', label: 'Lunes' }, { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' }, { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' }, { key: 'sabado', label: 'Sábado' },
];

const EMPTY_FORM: GymClassForm = { nombre: '', instructor: '', horario: '08:00', dia: 'lunes', capacidad: 20, inscritos: 0, sala: '', tipo: 'yoga' };

export function GymClasses() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<GymClass>('gym', 'classes'), []);
  const userId = user?.user_id || user?.id || '';

  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ClassType | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GymClass | null>(null);
  const [form, setForm] = useState<GymClassForm>(EMPTY_FORM);
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
      setClasses(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'trainer', label: 'Monitor' },
    { key: 'schedule', label: 'Horario' },
    { key: 'capacity', label: 'Aforo' },
    { key: 'room', label: 'Sala' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'trainer', label: 'Monitor', example: '' },
    { key: 'schedule', label: 'Horario', example: '' },
    { key: 'capacity', label: 'Aforo', example: '' },
    { key: 'room', label: 'Sala', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
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
      instructor: entryStr(e, 'instructor', 'trainer') || '',
      horario: entryStr(e, 'horario', 'schedule', 'time') || '08:00',
      dia: entryStr(e, 'dia', 'day') || 'lunes',
      capacidad: entryNum(e, 'capacidad', 'capacity'),
      inscritos: entryNum(e, 'inscritos', 'enrolled'),
      sala: entryStr(e, 'sala', 'room') || '',
      tipo: entryStr(e, 'tipo', 'type') || 'yoga',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} clase creado creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => {
    return classes.filter(c => {
      if (search && !c.nombre.toLowerCase().includes(search.toLowerCase()) && !c.instructor.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== 'all' && c.tipo !== filterType) return false;
      return true;
    });
  }, [classes, search, filterType]);

  const stats = useMemo(() => {
    const totalAsistencia = classes.reduce((s, c) => s + c.inscritos, 0);
    const mediaAsistencia = classes.length ? Math.round(totalAsistencia / classes.length) : 0;
    const hoy = DAYS[new Date().getDay() === 0 ? 5 : new Date().getDay() - 1]?.key;
    const clasesHoy = classes.filter(c => c.dia === hoy).length;
    return { total: classes.length, mediaAsistencia, clasesHoy };
  }, [classes]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (c: GymClass) => { setEditing(c); setForm({ nombre: c.nombre, instructor: c.instructor, horario: c.horario, dia: c.dia, capacidad: c.capacidad, inscritos: c.inscritos, sala: c.sala, tipo: c.tipo }); setShowModal(true); };

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

  const STAT_CARDS = [
    { label: 'Clases Semanales', value: stats.total,           icon: Calendar, color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Media Asistencia', value: stats.mediaAsistencia,  icon: Users,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Clases Hoy',      value: stats.clasesHoy,        icon: Activity, color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  const scheduleByDay = useMemo(() => {
    const map: Record<string, GymClass[]> = {};
    DAYS.forEach(d => { map[d.key] = filtered.filter(c => c.dia === d.key).sort((a, b) => a.horario.localeCompare(b.horario)); });
    return map;
  }, [filtered]);

  return (
    <Layout title="Clases Grupales">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar clase o instructor..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterType} onChange={e => setFilterType(e.target.value as ClassType | 'all')} disabled={loading}>
              <option value="all">Todos los tipos</option>
              {Object.entries(CLASS_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="flex border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('table')} className={`p-1.5 ${viewMode === 'table' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'} transition`}><List className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('schedule')} className={`p-1.5 ${viewMode === 'schedule' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'} transition`}><LayoutGrid className="w-4 h-4" /></button>
            </div>
            <AddButtonDropdown
                label="Nueva clase"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de clase"
              />
          </div>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Clase</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Instructor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Horario</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Sala</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Ocupación</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
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
                ) : filtered.map(c => (
                  <tr key={c._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.instructor}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{DAYS.find(d => d.key === c.dia)?.label} {c.horario}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.sala}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${CLASS_TYPE_CONFIG[c.tipo].bg} ${CLASS_TYPE_CONFIG[c.tipo].text}`}>{CLASS_TYPE_CONFIG[c.tipo].label}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.inscritos / c.capacidad > 0.9 ? 'bg-red-500' : c.inscritos / c.capacidad > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${(c.inscritos / c.capacidad) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{c.inscritos}/{c.capacidad}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(c._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron clases.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedule View */}
      {viewMode === 'schedule' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {DAYS.map(day => (
            <div key={day.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{day.label}</h3>
              </div>
              <div className="p-3 space-y-2 min-h-[120px]">
                {scheduleByDay[day.key]?.map(c => (
                  <div key={c._id} className={`p-2.5 rounded-lg border-l-4 cursor-pointer hover:opacity-80 transition ${CLASS_TYPE_CONFIG[c.tipo].bg}`} onClick={() => openEdit(c)}>
                    <p className={`font-semibold text-xs ${CLASS_TYPE_CONFIG[c.tipo].text}`}>{c.horario}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{c.nombre}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.instructor}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{c.inscritos}/{c.capacidad} inscritos</p>
                  </div>
                ))}
                {(!scheduleByDay[day.key] || scheduleByDay[day.key].length === 0) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin clases</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Clase' : 'Nueva Clase'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre de la clase *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Instructor</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.instructor} onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Sala</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.sala} onChange={e => setForm(f => ({ ...f, sala: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Día</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.dia} onChange={e => setForm(f => ({ ...f, dia: e.target.value as DayOfWeek }))}>
                    {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Hora</label>
                  <input type="time" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as ClassType }))}>
                    {Object.entries(CLASS_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Capacidad</label>
                  <input type="number" min={1} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.capacidad} onChange={e => setForm(f => ({ ...f, capacidad: +e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Inscritos</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.inscritos} onChange={e => setForm(f => ({ ...f, inscritos: +e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Clase'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="gym_classes"
        moduleLabel="Clases"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Clases"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
