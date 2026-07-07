import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Users, UserCheck, UserPlus, TrendingUp,
  Phone, Mail, CreditCard, GraduationCap, Filter, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type StudentStatus = 'activo' | 'baja' | 'egresado';

interface Student extends VerticalEntity {
  nombre: string;
  dni: string;
  email: string;
  telefono: string;
  curso: string;
  fechaMatricula: string;
  estado: StudentStatus;
  pagosAlDia: boolean;
}

type StudentForm = Omit<Student, keyof VerticalEntity>;

const STATUS_CFG: Record<StudentStatus, { label: string; bg: string; text: string }> = {
  activo:   { label: 'Activo',   bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  baja:     { label: 'Baja',     bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300' },
  egresado: { label: 'Egresado', bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300' },
};

const emptyForm = (): StudentForm => ({
  nombre: '', dni: '', email: '', telefono: '', curso: '',
  fechaMatricula: new Date().toISOString().slice(0, 10), estado: 'activo', pagosAlDia: true,
});

export function AcademyStudents() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Student>('academy', 'students'), []);
  const userId = user?.user_id || user?.id || '';

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StudentStatus | 'todos'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'birthDate', label: 'Fecha nacimiento' },
    { key: 'guardian', label: 'Tutor' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'birthDate', label: 'Fecha nacimiento', example: '' },
    { key: 'guardian', label: 'Tutor', example: '' },
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
      dni: entryStr(e, 'dni', 'document', 'id') || '',
      email: entryStr(e, 'email') || '',
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      curso: entryStr(e, 'curso', 'course', 'class') || '',
      fechaMatricula: entryStr(e, 'fechaMatricula', 'startDate', 'enrollmentDate', 'date') || new Date().toISOString().slice(0, 10),
      estado: entryStr(e, 'estado', 'status') || 'activo',
      pagosAlDia: true,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} alumno creado(s)`);
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
      setStudents(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let list = students;
    if (filterStatus !== 'todos') list = list.filter(s => s.estado === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.nombre.toLowerCase().includes(q) || s.dni.toLowerCase().includes(q) || s.curso.toLowerCase().includes(q));
    }
    return list;
  }, [students, search, filterStatus]);

  const stats = useMemo(() => ({
    total: students.length,
    activos: students.filter(s => s.estado === 'activo').length,
    nuevasMes: students.filter(s => { const d = new Date(s.fechaMatricula); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length,
    retencion: Math.round((students.filter(s => s.estado !== 'baja').length / Math.max(students.length, 1)) * 100),
  }), [students]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      nombre: s.nombre, dni: s.dni, email: s.email, telefono: s.telefono, curso: s.curso,
      fechaMatricula: s.fechaMatricula, estado: s.estado, pagosAlDia: s.pagosAlDia,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.dni.trim() || !userId) return;
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
    { label: 'Total Alumnos', value: stats.total, icon: <Users className="w-5 h-5" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Activos', value: stats.activos, icon: <UserCheck className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Nuevas Matrículas (mes)', value: stats.nuevasMes, icon: <UserPlus className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Tasa Retención', value: `${stats.retencion}%`, icon: <TrendingUp className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Estudiantes">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar alumno, DNI o curso..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <Filter className="w-4 h-4 text-gray-400 ml-2" />
              {(['todos', 'activo', 'baja', 'egresado'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${filterStatus === s ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                  {s === 'todos' ? 'Todos' : STATUS_CFG[s].label}
                </button>
              ))}
            </div>
            <AddButtonDropdown
                label="Nuevo Alumno"
                onQuickAdd={openCreate}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de alumno"
              />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">DNI</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Teléfono</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Curso</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Fecha Matrícula</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Pagos</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map(s => (
                  <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{s.dni}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{s.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">{s.telefono}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-200"><GraduationCap className="w-3.5 h-3.5" /> {s.curso}</span></td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">{s.fechaMatricula}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CFG[s.estado].bg} ${STATUS_CFG[s.estado].text}`}>{STATUS_CFG[s.estado].label}</span></td>
                    <td className="px-4 py-3">{s.pagosAlDia ? <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Al día</span> : <span className="text-red-600 dark:text-red-400 text-xs font-medium">Pendiente</span>}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"><Edit2 className="w-4 h-4 text-gray-500" /></button></td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No se encontraron alumnos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre completo *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DNI *</label>
                  <input value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Curso</label>
                  <input value={form.curso} onChange={e => setForm(f => ({ ...f, curso: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Matrícula</label>
                  <input type="date" value={form.fechaMatricula} onChange={e => setForm(f => ({ ...f, fechaMatricula: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as StudentStatus }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="activo">Activo</option>
                    <option value="baja">Baja</option>
                    <option value="egresado">Egresado</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" checked={form.pagosAlDia} onChange={e => setForm(f => ({ ...f, pagosAlDia: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <label className="text-sm text-gray-700 dark:text-gray-300">Pagos al día</label>
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
        module="academy_students"
        moduleLabel="Alumnos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Alumnos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
