import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  listCleaningRoutesRequest,
  updateCleaningRouteRequest,
  type CleaningRoute,
  type RouteEntry,
  type RouteEntryStatus,
} from '../../../lib/cleaningApi';
import {
  Route,
  MapPin,
  Clock,
  Zap,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Navigation,
  Flag,
  RefreshCw,
  CircleDot,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const ENTRY_STATUS_CONFIG: Record<RouteEntryStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
  in_transit: { label: 'En tránsito', color: 'text-indigo-700 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' },
  in_progress: { label: 'En curso', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  completed: { label: 'Completada', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  skipped: { label: 'Omitida', color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
};

function ProgressRing({ percent, size = 56, stroke = 5 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-gray-200 dark:text-gray-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-cyan-500 transition-all duration-500"
      />
    </svg>
  );
}

function getNextStatus(current: RouteEntryStatus): RouteEntryStatus | null {
  if (current === 'pending') return 'in_transit';
  if (current === 'in_transit') return 'in_progress';
  if (current === 'in_progress') return 'completed';
  return null;
}

function getActionLabel(status: RouteEntryStatus): string | null {
  if (status === 'pending') return 'En tránsito';
  if (status === 'in_transit') return 'He llegado';
  if (status === 'in_progress') return 'Finalizar parada';
  return null;
}

function getActionIcon(status: RouteEntryStatus) {
  if (status === 'pending') return Navigation;
  if (status === 'in_transit') return MapPin;
  if (status === 'in_progress') return Flag;
  return null;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function parseDurationMinutes(duration: string): number {
  const parts = duration.match(/(\d+)/);
  return parts ? parseInt(parts[1], 10) : 0;
}

export function WorkerRouteView() {
  const { user } = useAuth();
  const [route, setRoute] = useState<CleaningRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [routeModified, setRouteModified] = useState(false);
  const loadedAtRef = useRef<string>('');

  const userId = user?.user_id || user?.id || '';
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });

  const loadRoute = useCallback(async () => {
    if (!userId) return;
    try {
      const routes = await listCleaningRoutesRequest(userId, { date: today });
      const myRoute = routes.find(r => r.workerId === userId && !r.deletedAt) || null;
      setRoute(myRoute);
      loadedAtRef.current = new Date().toISOString();
      setRouteModified(false);
    } catch {
      toast.error('Error al cargar la ruta');
    } finally {
      setLoading(false);
    }
  }, [userId, today]);

  useEffect(() => { loadRoute(); }, [loadRoute]);

  useEffect(() => {
    if (!route) return;
    const interval = setInterval(async () => {
      try {
        const routes = await listCleaningRoutesRequest(userId, { date: today });
        const fresh = routes.find(r => r._id === route._id);
        if (fresh && fresh.updatedAt > loadedAtRef.current) {
          setRouteModified(true);
        }
      } catch { /* silent */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [route, userId, today]);

  const handleStatusAdvance = async (entry: RouteEntry) => {
    if (!route) return;
    const nextStatus = getNextStatus(entry.status);
    if (!nextStatus) return;

    setActionLoading(entry.serviceId);
    try {
      const updatedEntries = route.entries.map(e => {
        if (e.serviceId !== entry.serviceId) return e;
        const patched = { ...e, status: nextStatus };
        if (nextStatus === 'in_progress') patched.actualStartTime = new Date().toISOString();
        if (nextStatus === 'completed') patched.actualEndTime = new Date().toISOString();
        return patched;
      });

      const completedCount = updatedEntries.filter(e => e.status === 'completed').length;
      const allDone = completedCount === updatedEntries.length;

      const updated = await updateCleaningRouteRequest(userId, {
        ...route,
        entries: updatedEntries,
        status: allDone ? 'completed' : 'active',
      });
      setRoute(updated);
      loadedAtRef.current = new Date().toISOString();

      const labels: Record<string, string> = {
        in_transit: 'En tránsito hacia la parada',
        in_progress: 'Has llegado a la parada',
        completed: 'Parada completada',
      };
      toast.success(labels[nextStatus] || 'Estado actualizado');
    } catch {
      toast.error('Error al actualizar el estado');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setRouteModified(false);
    await loadRoute();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando tu ruta...</p>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 px-6">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
          <Route className="w-8 h-8" />
        </div>
        <p className="text-base font-semibold text-gray-600 dark:text-gray-300 mb-1">Sin ruta asignada</p>
        <p className="text-sm text-center">No tienes ninguna ruta programada para hoy.</p>
        <button
          onClick={handleRefresh}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  const entries = [...route.entries].sort((a, b) => a.order - b.order);
  const completedCount = entries.filter(e => e.status === 'completed').length;
  const currentEntry = entries.find(e => e.status !== 'completed' && e.status !== 'skipped');
  const percent = entries.length > 0 ? Math.round((completedCount / entries.length) * 100) : 0;

  const remainingEntries = entries.filter(e => e.status !== 'completed' && e.status !== 'skipped');
  const remainingMinutes = remainingEntries.reduce((sum, e) => {
    return sum + parseDurationMinutes(e.duration) + (e.travelTimeMin || 0);
  }, 0);

  const nextEntry = remainingEntries.length > 1 ? remainingEntries[1] : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Route modified banner */}
      {routeModified && (
        <button
          onClick={handleRefresh}
          className="shrink-0 w-full px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">Tu ruta ha sido modificada. Toca para actualizar.</span>
        </button>
      )}

      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl flex items-center justify-center">
              <Route className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi ruta de hoy</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{todayFormatted}</p>
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <ProgressRing percent={percent} />
            <span className="absolute text-xs font-bold text-gray-900 dark:text-gray-100">{percent}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{completedCount}/{entries.length}</span> paradas completadas
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-4 space-y-0">
          {entries.map((entry, idx) => {
            const isCompleted = entry.status === 'completed' || entry.status === 'skipped';
            const isCurrent = currentEntry?.serviceId === entry.serviceId;
            const isFuture = !isCompleted && !isCurrent;
            const cfg = ENTRY_STATUS_CONFIG[entry.status];
            const isLast = idx === entries.length - 1;

            const startTime = entry.estimatedStartTime
              ? format(parseISO(entry.estimatedStartTime), 'HH:mm')
              : '--:--';
            const endTime = entry.estimatedEndTime
              ? format(parseISO(entry.estimatedEndTime), 'HH:mm')
              : '--:--';

            const ActionIcon = isCurrent ? getActionIcon(entry.status) : null;
            const actionLabel = isCurrent ? getActionLabel(entry.status) : null;
            const isActioning = actionLoading === entry.serviceId;

            return (
              <div key={entry.serviceId} className="relative flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center shrink-0 w-10">
                  {/* Dot */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 border-2 ${
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white'
                        : isCurrent
                          ? 'bg-cyan-500 border-cyan-500 text-white animate-pulse'
                          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      entry.order
                    )}
                  </div>
                  {/* Connecting line */}
                  {!isLast && (
                    <div
                      className={`w-0.5 flex-1 min-h-[16px] ${
                        isCompleted ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  )}
                </div>

                {/* Card */}
                <div
                  className={`flex-1 mb-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'border-cyan-300 dark:border-cyan-700 bg-cyan-50/50 dark:bg-cyan-900/10 shadow-md border-l-4 border-l-cyan-500'
                      : isCompleted
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 opacity-75'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                  } ${isCurrent ? 'p-4' : 'p-3'}`}
                >
                  {/* Time + status row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{startTime} – {endTime}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Client name */}
                  <p className={`font-semibold mb-1 ${
                    isCompleted
                      ? 'text-gray-500 dark:text-gray-500'
                      : 'text-gray-900 dark:text-gray-100'
                  } ${isCurrent ? 'text-base' : 'text-sm'}`}>
                    {entry.clientName}
                  </p>

                  {/* Address */}
                  <div className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{entry.address}</span>
                  </div>

                  {/* Type + duration */}
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 font-medium">
                      {entry.cleaningType}
                    </span>
                    <span>{entry.duration}</span>
                  </div>

                  {/* Priority badge */}
                  {entry.priority === 'urgent' && (
                    <div className="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-2 py-1 mb-2 w-fit">
                      <Zap className="w-3 h-3" />
                      Urgente
                    </div>
                  )}

                  {/* Overlap warning */}
                  {entry.overlap && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1 mb-2">
                      <AlertTriangle className="w-3 h-3" />
                      Solapamiento horario
                    </div>
                  )}

                  {/* Action button for current entry */}
                  {isCurrent && actionLabel && (
                    <button
                      onClick={() => handleStatusAdvance(entry)}
                      disabled={isActioning}
                      className={`w-full mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-lg disabled:opacity-60 ${
                        entry.status === 'pending'
                          ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                          : entry.status === 'in_transit'
                            ? 'bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800'
                            : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
                      }`}
                    >
                      {isActioning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        ActionIcon && <ActionIcon className="w-4 h-4" />
                      )}
                      {isActioning ? 'Actualizando...' : actionLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary footer */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDuration(remainingMinutes)}</span>
              <span className="hidden sm:inline">restante</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <CircleDot className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">{remainingEntries.length}</span>
              <span className="hidden sm:inline">paradas</span>
            </div>
          </div>
          {nextEntry && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 max-w-[45%]">
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cyan-500" />
              <span className="truncate">
                {nextEntry.clientName} · {nextEntry.estimatedStartTime ? format(parseISO(nextEntry.estimatedStartTime), 'HH:mm') : '--:--'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
