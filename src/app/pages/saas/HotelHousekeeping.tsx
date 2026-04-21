import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Paintbrush, CheckCircle, Clock, Loader2, Eye,
  Filter, ChevronDown, AlertTriangle, User, BedDouble,
  ArrowUp, ArrowRight, ArrowDown,
} from 'lucide-react';

type CleaningStatus = 'pendiente' | 'en_proceso' | 'completada' | 'inspeccionada';
type Priority = 'alta' | 'media' | 'baja';

interface HousekeepingTask extends VerticalEntity {
  room: string;
  status: CleaningStatus;
  assignedTo: string;
  priority: Priority;
  assignedAt: string;
  notes: string;
}

const STATUS_CFG: Record<CleaningStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pendiente:     { label: 'Pendiente',     bg: 'bg-amber-100 dark:bg-amber-900/40',    text: 'text-amber-700 dark:text-amber-300',    icon: <Clock className="w-4 h-4" /> },
  en_proceso:    { label: 'En proceso',    bg: 'bg-blue-100 dark:bg-blue-900/40',      text: 'text-blue-700 dark:text-blue-300',      icon: <Loader2 className="w-4 h-4" /> },
  completada:    { label: 'Completada',    bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-4 h-4" /> },
  inspeccionada: { label: 'Inspeccionada', bg: 'bg-purple-100 dark:bg-purple-900/40',  text: 'text-purple-700 dark:text-purple-300',  icon: <Eye className="w-4 h-4" /> },
};

const PRIORITY_CFG: Record<Priority, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  alta:  { label: 'Alta',  bg: 'bg-red-100 dark:bg-red-900/40',    text: 'text-red-700 dark:text-red-300',    icon: <ArrowUp className="w-3.5 h-3.5" /> },
  media: { label: 'Media', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', icon: <ArrowRight className="w-3.5 h-3.5" /> },
  baja:  { label: 'Baja',  bg: 'bg-gray-100 dark:bg-gray-700',      text: 'text-gray-600 dark:text-gray-400',  icon: <ArrowDown className="w-3.5 h-3.5" /> },
};

const STATUS_FLOW: CleaningStatus[] = ['pendiente', 'en_proceso', 'completada', 'inspeccionada'];

export function HotelHousekeeping() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<HousekeepingTask>('hotel', 'housekeeping'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CleaningStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setData(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = data.filter(t => {
    const matchSearch = t.room.includes(search) || t.assignedTo.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchPriority = !filterPriority || t.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const stats = {
    pending: data.filter(t => t.status === 'pendiente').length,
    inProgress: data.filter(t => t.status === 'en_proceso').length,
    completedToday: data.filter(t => t.status === 'completada' || t.status === 'inspeccionada').length,
  };

  const advanceStatus = async (t: HousekeepingTask) => {
    if (!userId) return;
    const idx = STATUS_FLOW.indexOf(t.status);
    if (idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    try {
      await api.update(userId, t._id, { status: next });
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const setStatus = async (t: HousekeepingTask, status: CleaningStatus) => {
    if (!userId) return;
    try {
      await api.update(userId, t._id, { status });
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  return (
    <Layout title="Limpieza de habitaciones">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Pendientes', value: stats.pending, icon: <Clock className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
            { label: 'En proceso', value: stats.inProgress, icon: <Loader2 className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Completadas hoy', value: stats.completedToday, icon: <CheckCircle className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar habitación o empleada..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as CleaningStatus | '')} disabled={loading} className="pl-9 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm appearance-none dark:text-gray-100">
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | '')} disabled={loading} className="pl-9 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm appearance-none dark:text-gray-100">
                <option value="">Todas las prioridades</option>
                {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Habitación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Asignada a</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
                <th className="px-4 py-3 font-medium">Hora</th>
                <th className="px-4 py-3 font-medium">Notas</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
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
              ) : filtered.map(t => {
                const st = STATUS_CFG[t.status];
                const pr = PRIORITY_CFG[t.priority];
                const canAdvance = STATUS_FLOW.indexOf(t.status) < STATUS_FLOW.length - 1;
                return (
                  <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900 dark:text-gray-100">
                        <BedDouble className="w-4 h-4 text-gray-400" /> {t.room}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <span className="inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" />{t.assignedTo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${pr.bg} ${pr.text}`}>
                        {pr.icon} {pr.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.assignedAt}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{t.notes || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canAdvance && (
                          <button
                            type="button"
                            onClick={() => void advanceStatus(t)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          >
                            Avanzar →
                          </button>
                        )}
                        {t.status !== 'pendiente' && (
                          <button
                            type="button"
                            onClick={() => void setStatus(t, 'pendiente')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            Reiniciar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No se encontraron tareas de limpieza</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
