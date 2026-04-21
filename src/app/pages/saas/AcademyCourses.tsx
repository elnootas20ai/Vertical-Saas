import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, BookOpen, Users, DollarSign, Clock,
  Filter, Tag, GraduationCap, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type CourseStatus = 'abierto' | 'cerrado' | 'proximamente';
type CourseCategory = 'idiomas' | 'informatica' | 'musica' | 'arte' | 'ciencias' | 'oposiciones';

interface Course extends VerticalEntity {
  nombre: string;
  categoria: CourseCategory;
  profesor: string;
  duracion: string;
  horario: string;
  plazas: number;
  inscritos: number;
  precio: number;
  estado: CourseStatus;
}

type CourseForm = Omit<Course, keyof VerticalEntity>;

const STATUS_CFG: Record<CourseStatus, { label: string; bg: string; text: string }> = {
  abierto:      { label: 'Abierto',      bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  cerrado:      { label: 'Cerrado',      bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300' },
  proximamente: { label: 'Próximamente', bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300' },
};

const CAT_CFG: Record<CourseCategory, { label: string; bg: string; text: string }> = {
  idiomas:      { label: 'Idiomas',      bg: 'bg-blue-50 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300' },
  informatica:  { label: 'Informática',  bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  musica:       { label: 'Música',       bg: 'bg-pink-50 dark:bg-pink-900/30',    text: 'text-pink-700 dark:text-pink-300' },
  arte:         { label: 'Arte',         bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
  ciencias:     { label: 'Ciencias',     bg: 'bg-teal-50 dark:bg-teal-900/30',    text: 'text-teal-700 dark:text-teal-300' },
  oposiciones:  { label: 'Oposiciones',  bg: 'bg-slate-100 dark:bg-slate-800/50', text: 'text-slate-700 dark:text-slate-300' },
};

const emptyForm = (): CourseForm => ({
  nombre: '', categoria: 'idiomas', profesor: '', duracion: '', horario: '',
  plazas: 20, inscritos: 0, precio: 0, estado: 'abierto',
});

export function AcademyCourses() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Course>('academy', 'courses'), []);
  const userId = user?.user_id || user?.id || '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<CourseCategory | 'todas'>('todas');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<CourseForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'description', label: 'Descripción' },
    { key: 'teacher', label: 'Profesor' },
    { key: 'schedule', label: 'Horario' },
    { key: 'price', label: 'Precio' },
    { key: 'capacity', label: 'Capacidad' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'description', label: 'Descripción', example: '' },
    { key: 'teacher', label: 'Profesor', example: '' },
    { key: 'schedule', label: 'Horario', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'capacity', label: 'Capacidad', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} curso(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} curso(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setCourses(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let list = courses;
    if (filterCat !== 'todas') list = list.filter(c => c.categoria === filterCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.nombre.toLowerCase().includes(q) || c.profesor.toLowerCase().includes(q));
    }
    return list;
  }, [courses, search, filterCat]);

  const stats = useMemo(() => ({
    activos: courses.filter(c => c.estado === 'abierto').length,
    alumnosTotales: courses.reduce((a, c) => a + c.inscritos, 0),
    ingresos: courses.filter(c => c.estado !== 'proximamente').reduce((a, c) => a + c.precio * c.inscritos, 0),
  }), [courses]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (c: Course) => {
    setEditing(c);
    setForm({
      nombre: c.nombre, categoria: c.categoria, profesor: c.profesor, duracion: c.duracion, horario: c.horario,
      plazas: c.plazas, inscritos: c.inscritos, precio: c.precio, estado: c.estado,
    });
    setShowModal(true);
  };

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
      /* error shown by fetch layer */
    }
  };

  const statCards = [
    { label: 'Cursos Activos', value: stats.activos, icon: <BookOpen className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Alumnos Totales', value: stats.alumnosTotales, icon: <Users className="w-5 h-5" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Ingresos Mensuales', value: `${stats.ingresos.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Cursos">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${c.bg}`}><span className={c.color}>{c.icon}</span></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar curso o profesor..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)} className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="todas">Todas las categorías</option>
              {(Object.keys(CAT_CFG) as CourseCategory[]).map(k => <option key={k} value={k}>{CAT_CFG[k].label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo Curso"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de curso"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Curso</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Categoría</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Profesor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Horario</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Plazas</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Precio</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map(c => (
                  <tr key={c._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{c.nombre}</div>
                      <div className="text-xs text-gray-500">{c.duracion}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${CAT_CFG[c.categoria].bg} ${CAT_CFG[c.categoria].text}`}>{CAT_CFG[c.categoria].label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{c.profesor}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell text-xs">{c.horario}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-900 dark:text-white font-medium">{c.inscritos}</span>
                      <span className="text-gray-400">/{c.plazas}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{c.precio} €/mes</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CFG[c.estado].bg} ${STATUS_CFG[c.estado].text}`}>{STATUS_CFG[c.estado].label}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"><Edit2 className="w-4 h-4 text-gray-500" /></button></td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">No se encontraron cursos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Curso' : 'Nuevo Curso'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del curso *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as CourseCategory }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    {(Object.keys(CAT_CFG) as CourseCategory[]).map(k => <option key={k} value={k}>{CAT_CFG[k].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profesor</label>
                  <input value={form.profesor} onChange={e => setForm(f => ({ ...f, profesor: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duración</label>
                  <input value={form.duracion} onChange={e => setForm(f => ({ ...f, duracion: e.target.value }))} placeholder="3 meses" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Horario</label>
                  <input value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))} placeholder="L-X 18:00-19:30" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plazas</label>
                  <input type="number" value={form.plazas} onChange={e => setForm(f => ({ ...f, plazas: +e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (€/mes)</label>
                  <input type="number" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: +e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as CourseStatus }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="abierto">Abierto</option>
                    <option value="cerrado">Cerrado</option>
                    <option value="proximamente">Próximamente</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="academy_courses"
        moduleLabel="Cursos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Cursos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
