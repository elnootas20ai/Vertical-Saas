import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import {
  listWorkOrdersRequest,
  updateWorkOrderRequest,
  createTimeEntry,
  type WorkOrder,
  type WorkOrderStatus,
  type TimeEntry,
} from '../../../lib/workshopApi';
import {
  Wrench,
  Play,
  Square,
  CheckCircle2,
  Car,
  User,
  Camera,
  Clock,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Timer,
  Phone,
  FileText,
  Save,
  Search,
  X,
  Loader2,
  RefreshCw,
  Package,
  Eye,
} from 'lucide-react';

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-300' },
  in_progress: { label: 'En curso',   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300' },
  completed:   { label: 'Completada', color: 'text-green-700',  bg: 'bg-green-50 border-green-300' },
  invoiced:    { label: 'Facturada',  color: 'text-purple-700', bg: 'bg-purple-50 border-purple-300' },
  cancelled:   { label: 'Cancelada',  color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200' },
};

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatLiveTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function calcDuration(start: string, end?: string): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.floor((e - s) / 1000);
}

function WorkOrderCard({ wo, onSelect }: { wo: WorkOrder; onSelect: (wo: WorkOrder) => void }) {
  const cfg = STATUS_CONFIG[wo.status];
  const hasActiveTimer = wo.timeEntries?.some(e => !e.endTime);
  const totalMinutes = wo.timeEntries?.reduce((s, e) => s + (e.duration || 0), 0) || 0;

  return (
    <button
      onClick={() => onSelect(wo)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${cfg.bg}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</span>
            {wo.priority === 'urgent' && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">
                <AlertTriangle className="w-3 h-3" /> URGENTE
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{new Date(wo.createdAt).toLocaleDateString('es-ES')}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveTimer && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded-full">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-blue-700">EN CURSO</span>
            </div>
          )}
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <Car className="w-4 h-4 text-gray-500" />
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          {wo.vehicleBrand} {wo.vehicleModel}
        </span>
        <span className="font-mono text-xs text-gray-600 bg-white/80 px-1.5 py-0.5 rounded border">{wo.vehiclePlate}</span>
      </div>

      {wo.clientName && (
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
          <User className="w-3 h-3" />
          {wo.clientName}
          {wo.clientPhone && <span className="text-gray-400">· {wo.clientPhone}</span>}
        </div>
      )}

      {wo.description && (
        <p className="text-xs text-gray-700 line-clamp-2 mb-2">{wo.description}</p>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
        <div className="flex items-center gap-3 text-gray-500">
          {totalMinutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatDuration(totalMinutes)}
            </span>
          )}
          {(wo.laborItems?.length || 0) > 0 && <span>{wo.laborItems.length} op.</span>}
          {(wo.materialItems?.length || 0) > 0 && <span>{wo.materialItems.length} mat.</span>}
        </div>
      </div>
    </button>
  );
}

function WorkOrderDetailPanel({
  wo,
  mechanicName,
  onBack,
  onUpdate,
}: {
  wo: WorkOrder;
  mechanicName: string;
  onBack: () => void;
  onUpdate: (updated: WorkOrder) => void;
}) {
  const { user } = useAuth();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(wo.timeEntries || []);
  const [photos, setPhotos] = useState<string[]>(wo.photos || []);
  const [notes, setNotes] = useState(wo.notes || '');
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const activeEntry = timeEntries.find(e => !e.endTime);
  const userId = user?.user_id || user?.id || '';

  useEffect(() => {
    if (!activeEntry) { setElapsed(0); return; }
    setElapsed(calcDuration(activeEntry.startTime));
    const interval = setInterval(() => setElapsed(calcDuration(activeEntry.startTime)), 1000);
    return () => clearInterval(interval);
  }, [activeEntry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = STATUS_CONFIG[wo.status];
  const totalMinutes = timeEntries.reduce((s, e) => s + (e.duration || 0), 0) + (activeEntry ? Math.floor(elapsed / 60) : 0);

  const save = async (overrides?: Partial<WorkOrder>) => {
    if (!userId) return;
    setSaving(true);
    try {
      const updated = await updateWorkOrderRequest(userId, {
        ...wo,
        timeEntries,
        photos,
        notes,
        ...overrides,
      });
      onUpdate(updated);
      if (!overrides) toast.success('Cambios guardados');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const startTimer = async () => {
    if (activeEntry) return;
    const entry = createTimeEntry({ mechanicName });
    const next = [...timeEntries, entry];
    setTimeEntries(next);
    try {
      const updated = await updateWorkOrderRequest(userId, {
        ...wo,
        timeEntries: next,
        photos,
        notes,
        status: wo.status === 'pending' ? 'in_progress' : wo.status,
        stageHistory: wo.status === 'pending'
          ? [...(wo.stageHistory || []), { status: 'in_progress' as WorkOrderStatus, date: new Date().toISOString(), user: mechanicName }]
          : wo.stageHistory,
      });
      onUpdate(updated);
      toast.success('Temporizador iniciado');
    } catch {
      toast.error('Error al iniciar');
    }
  };

  const stopTimer = async () => {
    if (!activeEntry) return;
    const endTime = new Date().toISOString();
    const next = timeEntries.map(e =>
      e.id === activeEntry.id ? { ...e, endTime, duration: Math.floor(calcDuration(e.startTime, endTime) / 60) } : e,
    );
    setTimeEntries(next);
    try {
      const updated = await updateWorkOrderRequest(userId, { ...wo, timeEntries: next, photos, notes });
      onUpdate(updated);
      toast.success('Temporizador parado');
    } catch {
      toast.error('Error al parar');
    }
  };

  const markCompleted = async () => {
    if (activeEntry) await stopTimer();
    try {
      const updated = await updateWorkOrderRequest(userId, {
        ...wo,
        timeEntries,
        photos,
        notes,
        status: 'completed',
        stageHistory: [...(wo.stageHistory || []), { status: 'completed' as WorkOrderStatus, date: new Date().toISOString(), user: mechanicName }],
      });
      onUpdate(updated);
      toast.success('OT completada');
      onBack();
    } catch {
      toast.error('Error al completar');
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setPhotos(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">
              {wo.vehicleBrand} {wo.vehicleModel} — {wo.vehiclePlate}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Timer */}
        <div className={`rounded-2xl p-4 text-center ${activeEntry ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300' : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
          <p className="text-3xl font-bold font-mono text-gray-900 dark:text-gray-100 mb-1">
            {formatLiveTimer(elapsed)}
          </p>
          <p className="text-xs text-gray-500 mb-3">Tiempo total: {formatDuration(totalMinutes)}</p>
          <div className="flex gap-2 justify-center">
            {!activeEntry ? (
              <button
                onClick={startTimer}
                disabled={wo.status === 'completed' || wo.status === 'invoiced'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 shadow-md"
              >
                <Play className="w-4 h-4" /> Iniciar
              </button>
            ) : (
              <button
                onClick={stopTimer}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 shadow-md"
              >
                <Square className="w-4 h-4" /> Parar
              </button>
            )}
          </div>
        </div>

        {/* Vehicle & Client */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium">{wo.vehicleBrand} {wo.vehicleModel}</span>
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{wo.vehiclePlate}</span>
          </div>
          {wo.clientName && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4 text-gray-400" />
              {wo.clientName}
              {wo.clientPhone && (
                <a href={`tel:${wo.clientPhone}`} className="text-blue-600 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {wo.clientPhone}
                </a>
              )}
            </div>
          )}
          {wo.description && <p className="text-sm text-gray-700 dark:text-gray-300">{wo.description}</p>}
        </div>

        {/* Tasks */}
        {(wo.laborItems?.length || 0) > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Operaciones
            </h3>
            <div className="space-y-1.5">
              {wo.laborItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-700 dark:text-gray-300">{item.description}</span>
                  {item.hours && <span className="text-xs text-gray-500">{item.hours}h</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        {(wo.materialItems?.length || 0) > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" /> Materiales
            </h3>
            <div className="space-y-1.5">
              {wo.materialItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-700 dark:text-gray-300">{item.description}</span>
                  <span className="text-xs text-gray-500">{item.quantity} uds</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Camera className="w-4 h-4" /> Fotos
          </h3>
          <div className="flex gap-2 flex-wrap mb-2">
            {photos.map((src, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white flex items-center justify-center rounded-bl-lg"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhoto} />
          <button
            onClick={() => photoInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:bg-gray-50"
          >
            <Camera className="w-3.5 h-3.5" /> Añadir foto
          </button>
        </div>

        {/* Notes */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Notas
          </h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm p-2 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Notas del mecánico..."
          />
        </div>
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
        <button
          onClick={() => save()}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {wo.status !== 'completed' && wo.status !== 'invoiced' && wo.status !== 'cancelled' && (
          <button
            onClick={markCompleted}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" /> Completar OT
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkerTpvWorkshop() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'active' | 'pending' | 'completed' | 'all'>('active');
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);

  const userId = user?.user_id || user?.id || '';
  const mechanicName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Mecánico';

  const loadOrders = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listWorkOrdersRequest(userId);
      setOrders(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      toast.error('Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleUpdate = (updated: WorkOrder) => {
    setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
    if (selectedWo?._id === updated._id) setSelectedWo(updated);
  };

  const filtered = orders.filter(o => {
    if (filter === 'active') return o.status === 'in_progress';
    if (filter === 'pending') return o.status === 'pending';
    if (filter === 'completed') return o.status === 'completed' || o.status === 'invoiced';
    return o.status !== 'cancelled';
  }).filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return o.woNumber.toLowerCase().includes(q) ||
      o.vehiclePlate.toLowerCase().includes(q) ||
      o.vehicleBrand?.toLowerCase().includes(q) ||
      o.clientName?.toLowerCase().includes(q);
  });

  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    active: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
  };

  if (selectedWo) {
    return (
      <WorkOrderDetailPanel
        wo={selectedWo}
        mechanicName={mechanicName}
        onBack={() => setSelectedWo(null)}
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
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Taller</h1>
              <p className="text-xs text-gray-500">{mechanicName}</p>
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); loadOrders(); }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Pendientes', value: stats.pending, color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: 'En curso', value: stats.active, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'Completadas', value: stats.completed, color: 'bg-green-50 text-green-700 border-green-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mb-2">
          {([
            { id: 'active', label: 'En curso' },
            { id: 'pending', label: 'Pendientes' },
            { id: 'completed', label: 'Completadas' },
            { id: 'all', label: 'Todas' },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === f.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
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
            placeholder="Buscar matrícula, cliente, OT..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Wrench className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No hay órdenes en esta vista</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(wo => (
              <WorkOrderCard key={wo._id} wo={wo} onSelect={setSelectedWo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
