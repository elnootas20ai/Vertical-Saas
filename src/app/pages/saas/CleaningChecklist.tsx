import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listCleaningServicesRequest,
  updateCleaningServiceRequest,
  type CleaningService,
  type CleaningTask,
} from '../../lib/cleaningApi';
import {
  ClipboardCheck, CheckCircle, Clock, MapPin, Loader2, Search,
  ChevronDown, ChevronUp, SprayCan,
} from 'lucide-react';

export function CleaningChecklist() {
  const { user } = useAuth();
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listCleaningServicesRequest(user.id);
      setServices(data.filter(s => s.tasks.length > 0 && s.status !== 'cancelled'));
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar checklists');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleTask = async (svc: CleaningService, taskId: string) => {
    if (!user?.id) return;
    const updatedTasks = svc.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    try {
      const updated = await updateCleaningServiceRequest(user.id, { ...svc, tasks: updatedTasks } as CleaningService);
      setServices(prev => prev.map(s => s._id === updated._id ? updated : s));
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar tarea');
    }
  };

  const getProgress = (tasks: CleaningTask[]) => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
  };

  const filtered = services.filter(svc => {
    const progress = getProgress(svc.tasks);
    if (filter === 'done' && progress < 100) return false;
    if (filter === 'pending' && progress >= 100) return false;
    if (search) {
      const q = search.toLowerCase();
      return svc.clientName.toLowerCase().includes(q) || svc.address.toLowerCase().includes(q) || svc.serviceNumber.toLowerCase().includes(q);
    }
    return true;
  });

  const totalTasks = services.reduce((acc, s) => acc + s.tasks.length, 0);
  const doneTasks = services.reduce((acc, s) => acc + s.tasks.filter(t => t.done).length, 0);
  const fullDone = services.filter(s => getProgress(s.tasks) === 100).length;

  return (
    <Layout title="Checklist de Limpieza" subtitle="Tareas y verificación de servicios">
      <div className="flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Servicios', value: services.length, bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-900 dark:text-gray-100' },
            { label: 'Tareas totales', value: totalTasks, bg: 'bg-blue-50', text: 'text-blue-700' },
            { label: 'Tareas hechas', value: doneTasks, bg: 'bg-emerald-50', text: 'text-emerald-700' },
            { label: 'Completados', value: fullDone, bg: 'bg-violet-50', text: 'text-violet-700' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 border border-gray-200 dark:border-gray-700`}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
              <p className={`text-2xl font-black mt-1 ${stat.text}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {([['all', 'Todos'], ['pending', 'Pendientes'], ['done', 'Completados']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === key ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-64" />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <ClipboardCheck className="w-8 h-8 text-violet-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin checklists</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Crea servicios con tareas para ver los checklists aquí.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(svc => {
              const progress = getProgress(svc.tasks);
              const isExpanded = expandedId === svc._id;
              return (
                <div key={svc._id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedId(isExpanded ? null : svc._id)} className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center shrink-0">
                        <ClipboardCheck className="w-5 h-5 text-violet-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{svc.clientName}</p>
                          <span className="text-xs text-gray-400">{svc.serviceNumber}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{svc.address}</span>
                          <span className="flex items-center gap-1 text-xs text-gray-500"><Clock className="w-3 h-3" />{svc.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${progress === 100 ? 'text-emerald-600' : 'text-gray-600 dark:text-gray-300'}`}>{progress}%</p>
                        <p className="text-xs text-gray-400">{svc.tasks.filter(t => t.done).length}/{svc.tasks.length}</p>
                      </div>
                      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-violet-500'}`} style={{ width: `${progress}%` }} />
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                      <div className="space-y-1.5">
                        {svc.tasks.map(task => (
                          <label key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => toggleTask(svc, task.id)}
                              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 w-4 h-4"
                            />
                            <span className={`text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{task.label}</span>
                            {task.done && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
