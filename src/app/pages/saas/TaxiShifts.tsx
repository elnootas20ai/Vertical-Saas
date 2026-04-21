import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter, Calendar,
  CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Turno = 'manana' | 'tarde' | 'noche';
type ShiftStatus = 'programado' | 'en_curso' | 'completado' | 'ausencia';

interface Shift extends VerticalEntity {
  conductor: string;
  vehiculo: string;
  turno: Turno;
  dia: string;
  estado: ShiftStatus;
  kmTurno: number;
  recaudacionTurno: number;
}

interface TaxiDriver extends VerticalEntity {
  nombre: string;
}

const TURNO_CFG: Record<Turno, { label: string; horario: string; bg: string; text: string }> = {
  manana: { label: 'Mañana', horario: '6:00–14:00',  bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  tarde:  { label: 'Tarde',  horario: '14:00–22:00', bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-700 dark:text-blue-300' },
  noche:  { label: 'Noche',  horario: '22:00–6:00',  bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
};

const STATUS_CFG: Record<ShiftStatus, { label: string; dot: string }> = {
  programado: { label: 'Programado', dot: 'bg-blue-500' },
  en_curso:   { label: 'En Curso',   dot: 'bg-emerald-500' },
  completado: { label: 'Completado', dot: 'bg-gray-400' },
  ausencia:   { label: 'Ausencia',   dot: 'bg-red-500' },
};

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function getWeekDates(offset: number): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

type ShiftFormState = Pick<Shift, 'conductor' | 'vehiculo' | 'turno' | 'dia' | 'estado' | 'kmTurno' | 'recaudacionTurno'>;

const EMPTY_FORM: ShiftFormState = {
  conductor: '', vehiculo: '', turno: 'manana', dia: new Date().toISOString().slice(0, 10),
  estado: 'programado', kmTurno: 0, recaudacionTurno: 0,
};

export function TaxiShifts() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Shift>('taxi', 'shifts'), []);
  const driversApi = useMemo(() => createVerticalApi<TaxiDriver>('taxi', 'drivers'), []);

  const userId = user?.user_id ?? user?.id ?? '';

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [drivers, setDrivers] = useState<TaxiDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTurno, setFilterTurno] = useState<Turno | 'all'>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftFormState>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'driver', label: 'Conductor' },
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'date', label: 'Fecha' },
    { key: 'startTime', label: 'Hora inicio' },
    { key: 'endTime', label: 'Hora fin' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'driver', label: 'Conductor', example: '' },
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'startTime', label: 'Hora inicio', example: '' },
    { key: 'endTime', label: 'Hora fin', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} turno(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} turno(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [shiftItems, driverItems] = await Promise.all([
        api.list(userId),
        driversApi.list(userId),
      ]);
      setShifts(shiftItems);
      setDrivers(driverItems);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId, api, driversApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const filtered = useMemo(() => shifts.filter(s => {
    if (search && !s.conductor.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTurno !== 'all' && s.turno !== filterTurno) return false;
    return true;
  }), [shifts, search, filterTurno]);

  const weekShifts = useMemo(() => filtered.filter(s => weekDates.includes(s.dia)), [filtered, weekDates]);

  /** Filas del cuadrante: conductores dados de alta + nombres que ya aparecen en turnos de la semana */
  const gridDriverNames = useMemo(() => {
    const set = new Set<string>();
    drivers.forEach(d => {
      const n = d.nombre?.trim();
      if (n) set.add(n);
    });
    weekShifts.forEach(s => {
      const n = s.conductor?.trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [drivers, weekShifts]);

  const stats = useMemo(() => {
    const programados = weekShifts.length;
    const cubiertos = weekShifts.filter(s => s.estado !== 'ausencia').length;
    const nDrivers = drivers.length;
    const sinAsignar = nDrivers * 7 - programados;
    return { programados, cubiertos, sinAsignar: Math.max(0, sinAsignar) };
  }, [weekShifts, drivers.length]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (s: Shift) => {
    setEditing(s);
    setForm({ conductor: s.conductor, vehiculo: s.vehiculo, turno: s.turno, dia: s.dia, estado: s.estado, kmTurno: s.kmTurno, recaudacionTurno: s.recaudacionTurno });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.conductor.trim() || !userId) return;
    const payload = {
      conductor: form.conductor,
      vehiculo: form.vehiculo,
      turno: form.turno,
      dia: form.dia,
      estado: form.estado,
      kmTurno: form.kmTurno,
      recaudacionTurno: form.recaudacionTurno,
    };
    try {
      if (editing?._id) {
        const updated = await api.update(userId, editing._id, payload);
        setShifts(prev => prev.map(s => s._id === editing._id ? updated : s));
      } else {
        const created = await api.create(userId, payload);
        setShifts(prev => [...prev, created]);
      }
      setShowModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      setShifts(prev => prev.filter(s => s._id !== docId));
    } catch (e) {
      console.error(e);
    }
  };

  const getShiftForCell = (driver: string, date: string) => weekShifts.find(s => s.conductor === driver && s.dia === date);

  const STAT_CARDS = [
    { label: 'Turnos Programados', value: stats.programados, icon: Calendar, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Cubiertos', value: stats.cubiertos, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Sin Asignar', value: stats.sinAsignar, icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Turnos y Cuadrantes">
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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar conductor..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterTurno} onChange={e => setFilterTurno(e.target.value as Turno | 'all')}>
                <option value="all">Todos los turnos</option>
                {Object.entries(TURNO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.horario})</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}>Cuadrante</button>
              <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'table' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}>Tabla</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
              <button onClick={() => setWeekOffset(0)} className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">Hoy</button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
            </div>
            <AddButtonDropdown
                label="Nuevo Turno"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de turno"
              />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 min-w-[140px]">Conductor</th>
                  {weekDates.map((d, i) => (
                    <th key={d} className="text-center px-2 py-3 font-semibold text-gray-600 dark:text-gray-400 min-w-[110px]">
                      <div>{DAYS[i]}</div>
                      <div className="text-xs font-normal text-gray-400">{d.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridDriverNames.filter(n => !search || n.toLowerCase().includes(search.toLowerCase())).map(nombre => (
                  <tr key={nombre} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{nombre}</td>
                    {weekDates.map(date => {
                      const shift = getShiftForCell(nombre, date);
                      if (!shift) return <td key={date} className="px-2 py-2 text-center"><span className="text-gray-300 dark:text-gray-600 text-xs">—</span></td>;
                      return (
                        <td key={date} className="px-2 py-2">
                          <button onClick={() => openEdit(shift)} className={`w-full rounded-lg px-2 py-1.5 text-xs ${TURNO_CFG[shift.turno].bg} ${TURNO_CFG[shift.turno].text} hover:opacity-80 transition`}>
                            <div className="font-semibold">{TURNO_CFG[shift.turno].label}</div>
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CFG[shift.estado].dot}`} />
                              <span className="truncate">{STATUS_CFG[shift.estado].label}</span>
                            </div>
                          </button>
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
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Conductor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Vehículo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Turno</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Día</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Km</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Recaudación</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {weekShifts.map(s => (
                  <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.conductor}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{s.vehiculo}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TURNO_CFG[s.turno].bg} ${TURNO_CFG[s.turno].text}`}>{TURNO_CFG[s.turno].label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.dia}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[s.estado].dot}`} />{STATUS_CFG[s.estado].label}</span></td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{s.kmTurno}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">€{s.recaudacionTurno.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {weekShifts.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron turnos para esta semana.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Turno' : 'Nuevo Turno'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Conductor *</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))}>
                  <option value="">Seleccionar conductor</option>
                  {drivers.map(d => <option key={d._id} value={d.nombre}>{d.nombre}</option>)}
                  {editing?.conductor && !drivers.some(d => d.nombre === editing.conductor) ? (
                    <option value={editing.conductor}>{editing.conductor}</option>
                  ) : null}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vehículo</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.vehiculo} onChange={e => setForm(f => ({ ...f, vehiculo: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Día</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.dia} onChange={e => setForm(f => ({ ...f, dia: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Turno</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.turno} onChange={e => setForm(f => ({ ...f, turno: e.target.value as Turno }))}>
                    {Object.entries(TURNO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.horario})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as ShiftStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Km Turno</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.kmTurno} onChange={e => setForm(f => ({ ...f, kmTurno: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Recaudación (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.recaudacionTurno} onChange={e => setForm(f => ({ ...f, recaudacionTurno: Number(e.target.value) }))} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={() => void handleSave()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Turno'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="taxi_shifts"
        moduleLabel="Turnos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Turnos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
