import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  listWorkOrdersRequest,
  updateWorkOrderRequest,
  createTimeEntry,
  type WorkOrder,
  type WorkOrderStatus,
  type TimeEntry,
} from '../../lib/workshopApi';
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
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' },
  in_progress: { label: 'En curso', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300' },
  completed: { label: 'Completada', color: 'text-green-700', bg: 'bg-green-50 border-green-300' },
  invoiced: { label: 'Facturada', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-300' },
  cancelled: { label: 'Cancelada', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
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
  if (h > 0) return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function calcDuration(start: string, end?: string): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.floor((e - s) / 1000);
}

// ─── Work Order Card (mobile) ─────────────────────────────────────────────────

interface WorkOrderCardProps {
  wo: WorkOrder;
  onSelect: (wo: WorkOrder) => void;
}

function WorkOrderCard({ wo, onSelect }: WorkOrderCardProps) {
  const cfg = STATUS_CONFIG[wo.status];
  const hasActiveTimer = wo.timeEntries.some(e => !e.endTime);

  return (
    <button
      onClick={() => onSelect(wo)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${cfg.bg} active:scale-98`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date(wo.createdAt).toLocaleDateString('es-ES')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveTimer && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded-full">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-blue-700">EN CURSO</span>
            </div>
          )}
          {wo.priority === 'urgent' && (
            <span className="text-xs font-bold text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> URGENTE
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Car className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {wo.vehicleBrand} {wo.vehicleModel}
        </span>
        <span className="font-mono text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg border">
          {wo.vehiclePlate}
        </span>
      </div>

      {wo.clientName && (
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 dark:text-gray-400">
          <User className="w-4 h-4" />
          {wo.clientName}
          {wo.clientPhone && (
            <span className="text-gray-400 dark:text-gray-500">· {wo.clientPhone}</span>
          )}
        </div>
      )}

      {wo.description && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">{wo.description}</p>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {wo.laborItems.length > 0 && <span>🔧 {wo.laborItems.length} op.</span>}
          {wo.materialItems.length > 0 && <span>📦 {wo.materialItems.length} mat.</span>}
          {wo.photos.length > 0 && <span>📷 {wo.photos.length} fotos</span>}
        </div>
      </div>
    </button>
  );
}

// ─── Work Order Detail (mobile) ───────────────────────────────────────────────

interface WorkOrderDetailMobileProps {
  wo: WorkOrder;
  mechanicName: string;
  onBack: () => void;
  onUpdate: (updated: WorkOrder) => void;
}

function WorkOrderDetailMobile({ wo, mechanicName, onBack, onUpdate }: WorkOrderDetailMobileProps) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const workshopScope = useMemo(
    () => ({ businessId: currentBusiness?.id }),
    [currentBusiness?.id],
  );
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(wo.timeEntries || []);
  const [photos, setPhotos] = useState<string[]>(wo.photos || []);
  const [notes, setNotes] = useState(wo.notes || '');
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const activeEntry = timeEntries.find(e => !e.endTime);

  useEffect(() => {
    if (!activeEntry) { setElapsed(0); return; }
    setElapsed(calcDuration(activeEntry.startTime));
    const interval = setInterval(() => {
      setElapsed(calcDuration(activeEntry.startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEntry?.id]);

  const save = async (overrides?: Partial<WorkOrder>) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const updated = await updateWorkOrderRequest(user.id, {
        ...wo,
        timeEntries,
        photos,
        notes,
        ...overrides,
      }, workshopScope);
      onUpdate(updated);
      if (!overrides) toast.success('Cambios guardados');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const startTimer = async () => {
    if (activeEntry) { toast.error('Ya hay un temporizador activo'); return; }
    const entry = createTimeEntry({ mechanicName });
    const next = [...timeEntries, entry];
    setTimeEntries(next);
    if (!user?.id) return;
    try {
      const updated = await updateWorkOrderRequest(user.id, {
        ...wo,
        timeEntries: next,
        photos,
        notes,
        status: wo.status === 'pending' ? 'in_progress' : wo.status,
        stageHistory: wo.status === 'pending'
          ? [...(wo.stageHistory || []), { status: 'in_progress' as WorkOrderStatus, date: new Date().toISOString(), user: mechanicName || 'Mecánico' }]
          : wo.stageHistory,
      }, workshopScope);
      onUpdate(updated);
      toast.success('Temporizador iniciado');
    } catch {
      toast.error('Error al iniciar temporizador');
    }
  };

  const stopTimer = async () => {
    if (!activeEntry) return;
    const endTime = new Date().toISOString();
    const next = timeEntries.map(e => {
      if (e.id !== activeEntry.id) return e;
      return { ...e, endTime, duration: Math.floor(calcDuration(e.startTime, endTime) / 60) };
    });
    setTimeEntries(next);
    if (!user?.id) return;
    try {
      const updated = await updateWorkOrderRequest(user.id, { ...wo, timeEntries: next, photos, notes }, workshopScope);
      onUpdate(updated);
      toast.success('Temporizador parado');
    } catch {
      toast.error('Error al parar temporizador');
    }
  };

  const markCompleted = async () => {
    if (activeEntry) { await stopTimer(); }
    if (!user?.id) return;
    try {
      const updated = await updateWorkOrderRequest(user.id, {
        ...wo,
        timeEntries,
        photos,
        notes,
        status: 'completed',
        stageHistory: [...(wo.stageHistory || []), { status: 'completed' as WorkOrderStatus, date: new Date().toISOString(), user: mechanicName || 'Mecánico' }],
      }, workshopScope);
      onUpdate(updated);
      toast.success('OT marcada como completada');
      onBack();
    } catch {
      toast.error('Error al completar OT');
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) {
          setPhotos(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const totalTime = timeEntries
    .filter(e => e.duration)
    .reduce((s, e) => s + (e.duration || 0), 0);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 dark:text-gray-100">{wo.woNumber}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {wo.vehicleBrand} {wo.vehicleModel} · {wo.vehiclePlate}
          </div>
        </div>
        <button
          onClick={() => save()}
          disabled={saving}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-400 disabled:opacity-40"
        >
          <Save className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {/* Timer card */}
        <div className={`rounded-2xl border-2 p-5 ${activeEntry ? 'bg-blue-50 border-blue-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Timer className="w-5 h-5 text-purple-600" />
              Tiempo de trabajo
            </h3>
            {totalTime > 0 && (
              <span className="text-sm text-gray-600 dark:text-gray-400">Total: {formatDuration(totalTime)}</span>
            )}
          </div>

          {activeEntry ? (
            <div className="text-center py-3">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm font-semibold text-blue-800">{activeEntry.mechanicName || 'Trabajando'}</span>
              </div>
              <div className="text-4xl font-mono font-bold text-blue-900 my-3 tabular-nums tracking-wider">
                {formatLiveTimer(elapsed)}
              </div>
              <button
                onClick={stopTimer}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 text-lg"
              >
                <Square className="w-5 h-5" /> Parar
              </button>
            </div>
          ) : (
            <button
              onClick={startTimer}
              className="w-full py-3.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 text-lg"
            >
              <Play className="w-5 h-5" /> Iniciar temporizador
            </button>
          )}
        </div>

        {/* Description */}
        {wo.description && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              Trabajo a realizar
            </h3>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{wo.description}</p>
          </div>
        )}

        {/* Client info */}
        {(wo.clientName || wo.clientPhone) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              Cliente
            </h3>
            <div className="text-sm text-gray-800 dark:text-gray-200">{wo.clientName}</div>
            {wo.clientPhone && (
              <a
                href={`tel:${wo.clientPhone}`}
                className="flex items-center gap-2 text-sm text-blue-600 mt-1 font-medium"
              >
                <Phone className="w-4 h-4" />
                {wo.clientPhone}
              </a>
            )}
          </div>
        )}

        {/* Labor summary */}
        {wo.laborItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" />
              Mano de obra ({wo.laborItems.length} líneas)
            </h3>
            <div className="space-y-2">
              {wo.laborItems.map(li => (
                <div key={li.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{li.description}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{li.mechanicName} · {li.hours}h × {li.ratePerHour}€</div>
                  </div>
                  <div className="font-bold text-blue-900">{li.total.toLocaleString('es-ES')}€</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        {wo.materialItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              Materiales ({wo.materialItems.length})
            </h3>
            <div className="space-y-2">
              {wo.materialItems.map(mi => (
                <div key={mi.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{mi.partName}</div>
                    {mi.reference && <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{mi.reference}</div>}
                    <div className="text-xs text-gray-600 dark:text-gray-400">{mi.quantity} uds × {mi.unitCost}€</div>
                  </div>
                  <div className="font-bold text-amber-900">{mi.total.toLocaleString('es-ES')}€</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time history */}
        {timeEntries.filter(e => e.endTime).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              Tiempos registrados
            </h3>
            <div className="space-y-2">
              {timeEntries.filter(e => e.endTime).map(e => {
                const mins = e.duration || 0;
                return (
                  <div key={e.id} className="flex items-center justify-between p-2.5 bg-purple-50 rounded-xl text-sm">
                    <div>
                      <div className="font-medium text-gray-800 dark:text-gray-200">{e.mechanicName || '—'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(e.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {e.endTime ? new Date(e.endTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                      {e.notes && <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{e.notes}</div>}
                    </div>
                    <div className="font-bold text-purple-900 text-right">
                      {formatDuration(mins)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Notas del mecánico</h3>
          <textarea
            rows={3}
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none resize-none text-sm"
            placeholder="Añade observaciones, incidencias..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Photos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Camera className="w-4 h-4 text-teal-600" />
              Fotos ({photos.length})
            </h3>
            <button
              onClick={() => photoInputRef.current?.click()}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl flex items-center gap-1 transition-colors"
            >
              <Camera className="w-4 h-4" /> Foto
            </button>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhoto}
          />
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, idx) => (
                <div key={idx} className="aspect-square rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                  <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-teal-200 rounded-xl p-8 text-center cursor-pointer"
              onClick={() => photoInputRef.current?.click()}
            >
              <Camera className="w-8 h-8 text-teal-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Toca para capturar fotos del vehículo</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700 p-4 space-y-2">
        {wo.status !== 'completed' && wo.status !== 'invoiced' && wo.status !== 'cancelled' && (
          <button
            onClick={markCompleted}
            className="w-full py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 text-lg"
          >
            <CheckCircle2 className="w-6 h-6" />
            Marcar como completada
          </button>
        )}
        <button
          onClick={() => save()}
          disabled={saving}
          className="w-full py-3 border-2 border-gray-300 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Guardando...' : 'Guardar notas y fotos'}
        </button>
      </div>
    </div>
  );
}

// ─── Main: Technician App ─────────────────────────────────────────────────────

export function TechnicianView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const workshopScope = useMemo(
    () => ({ businessId: currentBusiness?.id }),
    [currentBusiness?.id],
  );
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [mechanicName, setMechanicName] = useState(
    () => localStorage.getItem('vertial_mechanic_name') || '',
  );
  const [nameSet, setNameSet] = useState(() => !!localStorage.getItem('vertial_mechanic_name'));
  const isStandalone = location.pathname === '/mecanico';

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listWorkOrdersRequest(user.id, workshopScope);
      // Technician only sees pending/in_progress
      setWorkOrders(data.filter(w => w.status === 'pending' || w.status === 'in_progress'));
    } catch {
      toast.error('Error al cargar las órdenes');
    } finally {
      setLoading(false);
    }
  }, [user?.id, workshopScope]);

  useEffect(() => { load(); }, [load]);

  const handleSetName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mechanicName.trim()) return;
    localStorage.setItem('vertial_mechanic_name', mechanicName.trim());
    setNameSet(true);
  };

  const handleUpdate = (updated: WorkOrder) => {
    setWorkOrders(prev => {
      const next = prev.map(w => w._id === updated._id ? updated : w);
      // Remove if now completed
      return next.filter(w => w.status === 'pending' || w.status === 'in_progress');
    });
    setSelected(updated.status === 'pending' || updated.status === 'in_progress' ? updated : null);
  };

  if (selected) {
    return (
      <WorkOrderDetailMobile
        wo={selected}
        mechanicName={mechanicName}
        onBack={() => { setSelected(null); load(); }}
        onUpdate={handleUpdate}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Top bar */}
      <div className="bg-gray-900 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {!isStandalone && (
            <button onClick={() => navigate('/saas/workshop')} className="p-1.5 hover:bg-gray-700 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="font-bold text-lg">Vista Mecánico</div>
            {nameSet ? (
              <div className="text-xs text-gray-400 dark:text-gray-500">Bienvenido, {mechanicName}</div>
            ) : (
              isStandalone && <div className="text-xs text-gray-400 dark:text-gray-500">Vista compartible del taller</div>
            )}
          </div>
        </div>
        <Wrench className="w-6 h-6 text-gray-400 dark:text-gray-500" />
      </div>

      {/* Name setup */}
      {!nameSet && (
        <div className="p-4">
          <form onSubmit={handleSetName} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">¿Cuál es tu nombre?</h2>
            <input
              autoFocus
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-lg focus:border-gray-900 outline-none"
              placeholder="Tu nombre"
              value={mechanicName}
              onChange={e => setMechanicName(e.target.value)}
            />
            <button
              type="submit"
              className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl text-lg"
            >
              Continuar
            </button>
          </form>
        </div>
      )}

      {/* Work orders */}
      {nameSet && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Mis órdenes de trabajo</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {workOrders.length} {workOrders.length === 1 ? 'OT' : 'OTs'}
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mb-3" />
              Cargando...
            </div>
          ) : workOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <CheckCircle2 className="w-16 h-16 text-green-400 mb-4" />
              <p className="font-bold text-lg text-gray-800 dark:text-gray-200">¡Todo al día!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">
                No tienes órdenes pendientes ni en curso
              </p>
            </div>
          ) : (
            <>
              {workOrders.filter(w => w.status === 'in_progress').length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-blue-700 uppercase">En curso</span>
                  </div>
                  <div className="space-y-3">
                    {workOrders
                      .filter(w => w.status === 'in_progress')
                      .map(wo => (
                        <WorkOrderCard key={wo._id} wo={wo} onSelect={setSelected} />
                      ))}
                  </div>
                </div>
              )}
              {workOrders.filter(w => w.status === 'pending').length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs font-bold text-amber-700 uppercase">Pendientes</span>
                  </div>
                  <div className="space-y-3">
                    {workOrders
                      .filter(w => w.status === 'pending')
                      .map(wo => (
                        <WorkOrderCard key={wo._id} wo={wo} onSelect={setSelected} />
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => {
              localStorage.removeItem('vertial_mechanic_name');
              setNameSet(false);
              setMechanicName('');
            }}
            className="w-full mt-4 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors"
          >
            Cambiar nombre de mecánico
          </button>
        </div>
      )}
    </div>
  );
}
