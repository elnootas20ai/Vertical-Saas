import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import {
  listCleaningServicesRequest,
  updateCleaningServiceRequest,
  type CleaningService,
  type CleaningServiceStatus,
  type CleaningTask,
} from '../../../lib/cleaningApi';
import { WorkerRouteView } from './WorkerRouteView';
import {
  SprayCan,
  CheckCircle,
  Clock,
  MapPin,
  User,
  Phone,
  Search,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  DollarSign,
  Calendar,
  RefreshCw,
  Check,
  ArrowLeft,
  Camera,
  FileText,
  Route,
} from 'lucide-react';

const STATUS_CONFIG: Record<CleaningServiceStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  assigned:    { label: 'Asignado',    color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200' },
  in_progress: { label: 'En progreso', color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
  completed:   { label: 'Finalizado',  color: 'text-green-700',   bg: 'bg-green-50 border-green-200' },
  cancelled:   { label: 'Cancelado',   color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200' },
};

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function getProgress(tasks: CleaningTask[]) {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
}

function ServiceCard({
  service,
  onSelect,
}: {
  service: CleaningService;
  onSelect: (s: CleaningService) => void;
}) {
  const cfg = STATUS_CONFIG[service.status];
  const progress = getProgress(service.tasks);
  const doneTasks = service.tasks.filter(t => t.done).length;

  return (
    <button
      onClick={() => onSelect(service)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${cfg.bg}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
            {service.serviceNumber}
          </span>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>
              {new Date(service.date).toLocaleDateString('es-ES')} · {service.time}
            </span>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
        <User className="w-3.5 h-3.5 text-gray-400" />
        <span className="truncate">{service.clientName}</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="truncate">{service.address}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">{doneTasks}/{service.tasks.length} tareas</span>
          <span className={`font-bold ${progress === 100 ? 'text-green-600' : 'text-blue-600'}`}>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {service.price && (
        <div className="flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <DollarSign className="w-3.5 h-3.5" />
          {formatCurrency(Number(service.price))}
        </div>
      )}
    </button>
  );
}

function ServiceDetailPanel({
  service,
  onBack,
  onUpdate,
}: {
  service: CleaningService;
  onBack: () => void;
  onUpdate: (s: CleaningService) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<CleaningTask[]>(service.tasks);
  const [notes, setNotes] = useState(service.notes || '');
  const [saving, setSaving] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(
    service.status === 'in_progress' ? new Date() : null,
  );
  const [elapsed, setElapsed] = useState(0);

  const userId = user?.user_id || user?.id || '';
  const cfg = STATUS_CONFIG[service.status];
  const progress = getProgress(tasks);

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const toggleTask = async (taskId: string) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    setTasks(updated);
    try {
      const result = await updateCleaningServiceRequest(userId, {
        ...service,
        tasks: updated,
        notes,
      } as CleaningService);
      onUpdate(result);
    } catch {
      toast.error('Error al actualizar tarea');
      setTasks(tasks);
    }
  };

  const startService = async () => {
    try {
      const result = await updateCleaningServiceRequest(userId, {
        ...service,
        status: 'in_progress',
        tasks,
        notes,
      } as CleaningService);
      onUpdate(result);
      setStartedAt(new Date());
      toast.success('Servicio iniciado');
    } catch {
      toast.error('Error al iniciar servicio');
    }
  };

  const completeService = async () => {
    const incomplete = tasks.filter(t => !t.done);
    if (incomplete.length > 0) {
      const confirm = window.confirm(`Hay ${incomplete.length} tareas sin completar. ¿Finalizar igualmente?`);
      if (!confirm) return;
    }
    try {
      const result = await updateCleaningServiceRequest(userId, {
        ...service,
        status: 'completed',
        tasks,
        notes,
      } as CleaningService);
      onUpdate(result);
      toast.success('Servicio completado');
      onBack();
    } catch {
      toast.error('Error al completar');
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      const result = await updateCleaningServiceRequest(userId, {
        ...service,
        tasks,
        notes,
      } as CleaningService);
      onUpdate(result);
      toast.success('Notas guardadas');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const formatTimer = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{service.serviceNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">{service.clientName} — {service.address}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Timer (when in progress) */}
        {(service.status === 'in_progress' || startedAt) && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold font-mono text-gray-900 dark:text-gray-100">{formatTimer(elapsed)}</p>
            <p className="text-xs text-blue-600 mt-1">Servicio en curso</p>
          </div>
        )}

        {/* Client info */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{service.clientName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-gray-400" />
            {service.address}
          </div>
          {service.clientPhone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-400" />
              <a href={`tel:${service.clientPhone}`} className="text-blue-600">{service.clientPhone}</a>
            </div>
          )}
          {service.price && (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <DollarSign className="w-4 h-4" />
              {formatCurrency(Number(service.price))}
            </div>
          )}
        </div>

        {/* Progress overview */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Progreso</span>
            <span className={`font-bold ${progress === 100 ? 'text-green-600' : 'text-blue-600'}`}>{progress}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{tasks.filter(t => t.done).length} de {tasks.length} tareas completadas</p>
        </div>

        {/* Checklist */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <SprayCan className="w-4 h-4" /> Checklist de limpieza
          </h3>
          <div className="space-y-1.5">
            {tasks.map(task => (
              <button
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                  task.done
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  task.done
                    ? 'bg-green-500 text-white'
                    : 'border-2 border-gray-300 dark:border-gray-600'
                }`}>
                  {task.done && <Check className="w-4 h-4" />}
                </div>
                <span className={`text-sm text-left flex-1 ${
                  task.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {task.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Observaciones
          </h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm p-2 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Notas sobre el servicio..."
          />
          <button
            onClick={saveNotes}
            disabled={saving}
            className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar notas'}
          </button>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
        <div className="flex gap-2">
          {service.status === 'pending' || service.status === 'assigned' ? (
            <button
              onClick={startService}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-lg"
            >
              <Play className="w-4 h-4" /> Check-in / Iniciar servicio
            </button>
          ) : service.status === 'in_progress' ? (
            <button
              onClick={completeService}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 shadow-lg"
            >
              <CheckCircle className="w-4 h-4" /> Finalizar y cobrar
            </button>
          ) : null}
        </div>
        <button
          onClick={() => navigate('/saas/cleaning-execution')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
        >
          <Clock className="w-3.5 h-3.5" /> Ver fichaje y ejecución completa
        </button>
      </div>
    </div>
  );
}

export function WorkerTpvCleaning() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'today' | 'pending' | 'completed' | 'all'>('today');
  const [selectedService, setSelectedService] = useState<CleaningService | null>(null);
  const [activeTab, setActiveTab] = useState<'services' | 'route'>('route');

  const userId = user?.user_id || user?.id || '';

  const loadServices = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listCleaningServicesRequest(userId);
      setServices(data.filter(s => s.status !== 'cancelled').sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
      ));
    } catch {
      toast.error('Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const handleUpdate = (updated: CleaningService) => {
    setServices(prev => prev.map(s => s._id === updated._id ? updated : s));
    if (selectedService?._id === updated._id) setSelectedService(updated);
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = services.filter(s => {
    if (filter === 'today') return s.date === today;
    if (filter === 'pending') return s.status === 'pending' || s.status === 'assigned';
    if (filter === 'completed') return s.status === 'completed';
    return true;
  }).filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.clientName.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.serviceNumber.toLowerCase().includes(q);
  });

  const stats = {
    today: services.filter(s => s.date === today).length,
    pending: services.filter(s => s.status === 'pending' || s.status === 'assigned').length,
    inProgress: services.filter(s => s.status === 'in_progress').length,
    completed: services.filter(s => s.status === 'completed').length,
  };

  const todayEarnings = services
    .filter(s => s.date === today && s.status === 'completed' && s.price)
    .reduce((sum, s) => sum + Number(s.price || 0), 0);

  if (selectedService) {
    return (
      <ServiceDetailPanel
        service={selectedService}
        onBack={() => setSelectedService(null)}
        onUpdate={handleUpdate}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl flex items-center justify-center">
              <SprayCan className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Limpieza</h1>
              <p className="text-xs text-gray-500">{stats.today} servicios hoy</p>
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); loadServices(); }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'Hoy', value: stats.today, color: 'bg-gray-50 text-gray-700 border-gray-200' },
            { label: 'Pendientes', value: stats.pending, color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: 'En curso', value: stats.inProgress, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'Facturado', value: formatCurrency(todayEarnings), color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-2 text-center ${s.color}`}>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1.5 mb-2">
          <button
            onClick={() => setActiveTab('route')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'route'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <Route className="w-3.5 h-3.5" /> Mi ruta
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'services'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <SprayCan className="w-3.5 h-3.5" /> Servicios
          </button>
        </div>

        {activeTab === 'services' && (
          <>
            {/* Filters */}
            <div className="flex gap-1.5 mb-2">
              {([
                { id: 'today', label: 'Hoy' },
                { id: 'pending', label: 'Pendientes' },
                { id: 'completed', label: 'Completados' },
                { id: 'all', label: 'Todos' },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filter === f.id
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente, dirección..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Route tab content */}
      {activeTab === 'route' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkerRouteView />
        </div>
      )}

      {/* Services tab content */}
      {activeTab === 'services' && (
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <SprayCan className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No hay servicios en esta vista</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(svc => (
              <ServiceCard key={svc._id} service={svc} onSelect={setSelectedService} />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
