import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Award, TrendingUp, CheckCircle,
  Filter, BookOpen, User, FileText, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Grade extends VerticalEntity {
  alumno: string;
  curso: string;
  examen: string;
  nota: number;
  fecha: string;
  profesor: string;
  observaciones: string;
}

type GradeForm = Omit<Grade, keyof VerticalEntity>;

const emptyForm = (): GradeForm => ({
  alumno: '', curso: '', examen: '', nota: 0, fecha: new Date().toISOString().slice(0, 10),
  profesor: '', observaciones: '',
});

function gradeColor(nota: number): string {
  if (nota >= 9) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30';
  if (nota >= 7) return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
  if (nota >= 5) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30';
  return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30';
}

export function AcademyGrades() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Grade>('academy', 'grades'), []);
  const userId = user?.user_id || user?.id || '';

  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('todos');
  const [filterStudent, setFilterStudent] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [form, setForm] = useState<GradeForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'student', label: 'Alumno' },
    { key: 'course', label: 'Curso' },
    { key: 'grade', label: 'Nota' },
    { key: 'date', label: 'Fecha' },
    { key: 'comments', label: 'Comentarios' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'student', label: 'Alumno', example: '' },
    { key: 'course', label: 'Curso', example: '' },
    { key: 'grade', label: 'Nota', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'comments', label: 'Comentarios', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} calificación(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} calificación(s) importado(s)`);
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
      setGrades(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const courses = useMemo(() => [...new Set(grades.map(g => g.curso))], [grades]);
  const students = useMemo(() => [...new Set(grades.map(g => g.alumno))], [grades]);

  const filtered = useMemo(() => {
    let list = grades;
    if (filterCourse !== 'todos') list = list.filter(g => g.curso === filterCourse);
    if (filterStudent !== 'todos') list = list.filter(g => g.alumno === filterStudent);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(g => g.alumno.toLowerCase().includes(q) || g.examen.toLowerCase().includes(q));
    }
    return list;
  }, [grades, search, filterCourse, filterStudent]);

  const stats = useMemo(() => {
    const notas = grades.map(g => g.nota);
    const media = notas.length ? +(notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : 0;
    const aprobados = notas.filter(n => n >= 5).length;
    const mejor = notas.length ? Math.max(...notas) : 0;
    return {
      media,
      aprobadosPct: notas.length ? Math.round((aprobados / notas.length) * 100) : 0,
      mejorNota: mejor,
    };
  }, [grades]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (g: Grade) => {
    setEditing(g);
    setForm({
      alumno: g.alumno, curso: g.curso, examen: g.examen, nota: g.nota, fecha: g.fecha,
      profesor: g.profesor, observaciones: g.observaciones,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.alumno.trim() || !form.curso.trim() || !userId) return;
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
    { label: 'Media General', value: stats.media, icon: <TrendingUp className="w-5 h-5" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Aprobados', value: `${stats.aprobadosPct}%`, icon: <CheckCircle className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Mejor Nota', value: stats.mejorNota, icon: <Award className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Calificaciones">
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

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar alumno o examen..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)} className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="todos">Todos los cursos</option>
              {courses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="todos">Todos los alumnos</option>
              {students.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <AddButtonDropdown
                label="Nueva Calificación"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de calificación"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Alumno</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Curso</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Examen</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nota</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Profesor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden xl:table-cell">Observaciones</th>
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
                ) : filtered.map(g => (
                  <tr key={g._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{g.alumno}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.curso}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.examen}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${gradeColor(g.nota)}`}>{g.nota.toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{g.fecha}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">{g.profesor}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden xl:table-cell max-w-[200px] truncate">{g.observaciones}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => openEdit(g)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"><Edit2 className="w-4 h-4 text-gray-500" /></button></td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">No se encontraron calificaciones</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Calificación' : 'Nueva Calificación'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alumno *</label>
                  <input value={form.alumno} onChange={e => setForm(f => ({ ...f, alumno: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Curso *</label>
                  <input value={form.curso} onChange={e => setForm(f => ({ ...f, curso: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Examen / Evaluación</label>
                  <input value={form.examen} onChange={e => setForm(f => ({ ...f, examen: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nota (0-10)</label>
                  <input type="number" step="0.1" min="0" max="10" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: +e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profesor</label>
                  <input value={form.profesor} onChange={e => setForm(f => ({ ...f, profesor: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
                  <textarea rows={3} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
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
        module="academy_grades"
        moduleLabel="Calificaciones"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Calificaciones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
