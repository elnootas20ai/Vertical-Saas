import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Calendar, Clock, MapPin, Users,
  LayoutGrid, List, Building, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type DayOfWeek = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado';

interface ScheduleEntry extends VerticalEntity {
  aula: string;
  curso: string;
  profesor: string;
  dia: DayOfWeek;
  horaInicio: string;
  horaFin: string;
  capacidad: number;
}

type ScheduleForm = Omit<ScheduleEntry, keyof VerticalEntity>;

const DAYS: DayOfWeek[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

const DAY_COLORS: Record<DayOfWeek, string> = {
  Lunes:     'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200',
  Martes:    'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200',
  Miércoles: 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200',
  Jueves:    'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200',
  Viernes:   'bg-pink-100 dark:bg-pink-900/40 border-pink-300 dark:border-pink-700 text-pink-800 dark:text-pink-200',
  Sábado:    'bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200',
};

const emptyForm = (): ScheduleForm => ({
  aula: '', curso: '', profesor: '', dia: 'Lunes', horaInicio: '09:00', horaFin: '10:00', capacidad: 20,
});

export function AcademySchedule() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<ScheduleEntry>('academy', 'schedule'), []);
  const userId = user?.user_id || user?.id || '';

  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'course', label: 'Curso' },
    { key: 'day', label: 'Día' },
    { key: 'startTime', label: 'Hora inicio' },
    { key: 'endTime', label: 'Hora fin' },
    { key: 'room', label: 'Aula' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'course', label: 'Curso', example: '' },
    { key: 'day', label: 'Día', example: '' },
    { key: 'startTime', label: 'Hora inicio', example: '' },
    { key: 'endTime', label: 'Hora fin', example: '' },
    { key: 'room', label: 'Aula', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} horario(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} horario(s) importado(s)`);
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
      setSchedule(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const aulas = useMemo(() => [...new Set(schedule.map(s => s.aula))].sort(), [schedule]);

  const filtered = useMemo(() => {
    if (!search) return schedule;
    const q = search.toLowerCase();
    return schedule.filter(s => s.curso.toLowerCase().includes(q) || s.profesor.toLowerCase().includes(q) || s.aula.toLowerCase().includes(q));
  }, [schedule, search]);

  const stats = useMemo(() => {
    const totalSlots = aulas.length * HOURS.length * DAYS.length;
    const occupiedSlots = schedule.length;
    return {
      totalAulas: aulas.length,
      ocupacionMedia: totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0,
      huecosDisponibles: totalSlots - occupiedSlots,
    };
  }, [schedule, aulas]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: ScheduleEntry) => {
    setEditing(s);
    setForm({
      aula: s.aula, curso: s.curso, profesor: s.profesor, dia: s.dia,
      horaInicio: s.horaInicio, horaFin: s.horaFin, capacidad: s.capacidad,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.aula.trim() || !form.curso.trim() || !userId) return;
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

  const getEntriesForSlot = (day: DayOfWeek, hour: string) => {
    const h = parseInt(hour);
    return filtered.filter(s => {
      if (s.dia !== day) return false;
      const start = parseInt(s.horaInicio);
      const end = parseInt(s.horaFin);
      return h >= start && h < end;
    });
  };

  const isSlotStart = (entry: ScheduleEntry, hour: string) => parseInt(entry.horaInicio) === parseInt(hour);

  const statCards = [
    { label: 'Aulas Totales', value: stats.totalAulas, icon: <Building className="w-5 h-5" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Ocupación Media', value: `${stats.ocupacionMedia}%`, icon: <Calendar className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Huecos Disponibles', value: stats.huecosDisponibles, icon: <Clock className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="Aulas y Horarios">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar curso, profesor o aula..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button onClick={() => setView('grid')} className={`p-2 rounded-md transition ${view === 'grid' ? 'bg-white dark:bg-gray-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setView('list')} className={`p-2 rounded-md transition ${view === 'list' ? 'bg-white dark:bg-gray-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}><List className="w-4 h-4" /></button>
            </div>
            <AddButtonDropdown
                label="Nuevo Horario"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de horario"
              />
          </div>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-center items-center gap-2 py-24 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            Cargando…
          </div>
        ) : view === 'grid' ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-300 w-16">Hora</th>
                    {DAYS.map(d => <th key={d} className="text-center px-2 py-2.5 font-semibold text-gray-600 dark:text-gray-300 min-w-[130px]">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map(hour => (
                    <tr key={hour} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono font-medium">{hour}</td>
                      {DAYS.map(day => {
                        const entries = getEntriesForSlot(day, hour);
                        return (
                          <td key={day} className="px-1 py-1">
                            {entries.filter(e => isSlotStart(e, hour)).map(e => (
                              <button key={e._id} onClick={() => openEdit(e)} className={`w-full text-left p-1.5 rounded-lg border text-[10px] leading-tight transition hover:opacity-80 ${DAY_COLORS[day]}`}>
                                <div className="font-bold truncate">{e.curso}</div>
                                <div className="opacity-75 truncate">{e.aula} · {e.profesor}</div>
                                <div className="opacity-60">{e.horaInicio}-{e.horaFin}</div>
                              </button>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Aula</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Curso</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Profesor</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Día</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Horario</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Capacidad</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-200 font-medium"><MapPin className="w-3.5 h-3.5" /> {s.aula}</span></td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.curso}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{s.profesor}</td>
                      <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${DAY_COLORS[s.dia]}`}>{s.dia}</span></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{s.horaInicio} - {s.horaFin}</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300 hidden lg:table-cell">{s.capacidad}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"><Edit2 className="w-4 h-4 text-gray-500" /></button></td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No se encontraron horarios</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Horario' : 'Nuevo Horario'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aula *</label>
                  <input value={form.aula} onChange={e => setForm(f => ({ ...f, aula: e.target.value }))} placeholder="Aula 1" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Curso *</label>
                  <input value={form.curso} onChange={e => setForm(f => ({ ...f, curso: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profesor</label>
                  <input value={form.profesor} onChange={e => setForm(f => ({ ...f, profesor: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Día de la semana</label>
                  <select value={form.dia} onChange={e => setForm(f => ({ ...f, dia: e.target.value as DayOfWeek }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capacidad</label>
                  <input type="number" value={form.capacidad} onChange={e => setForm(f => ({ ...f, capacidad: +e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora Inicio</label>
                  <input type="time" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora Fin</label>
                  <input type="time" value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
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
        module="academy_schedules"
        moduleLabel="Horarios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Horarios"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
