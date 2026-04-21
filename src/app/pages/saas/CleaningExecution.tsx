import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import {
  listCleaningServicesRequest,
  updateCleaningServiceRequest,
  checkInServiceRequest,
  checkOutServiceRequest,
  pauseServiceRequest,
  resumeServiceRequest,
  reportExecIncidentRequest,
  resolveExecIncidentRequest,
  uploadServicePhotoRequest,
  uploadServicePhotoFileRequest,
  validateExecutionRequest,
  fetchExecutionSummaryRequest,
  type CleaningService,
  type ServiceExecution,
  type ExecutionStatus,
  type ExecIncidentType,
  type ExecIncidentSeverity,
  type ExecutionSummary,
  type ExecutionAlert,
  type CleaningTask,
} from '../../lib/cleaningApi';
import {
  Clock, Play, Square, Pause, RotateCcw, MapPin, Camera,
  AlertTriangle, FileText, CheckCircle, Loader2, X, User,
  Calendar, Timer, TrendingUp, Shield, ChevronDown, ChevronUp,
  Search, Eye, Check, XCircle, ArrowLeft, RefreshCw, Image,
  BarChart3, ClipboardCheck, SprayCan, Phone, Send,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMinutes(min: number): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? h + 'h ' + (m > 0 ? m + 'm' : '') : m + 'm';
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function deviationColor(deviation: number, planned: number): string {
  if (planned <= 0) return 'text-gray-400';
  const pct = Math.abs(deviation) / planned;
  if (deviation <= 0) return 'text-emerald-600';
  if (pct <= 0.15) return 'text-amber-500';
  return 'text-red-500';
}

function deviationBg(deviation: number, planned: number): string {
  if (planned <= 0) return 'bg-gray-200';
  const pct = Math.abs(deviation) / planned;
  if (deviation <= 0) return 'bg-emerald-500';
  if (pct <= 0.15) return 'bg-amber-500';
  return 'bg-red-500';
}

const EXEC_STATUS_LABEL: Record<ExecutionStatus, string> = {
  not_started: 'Sin iniciar',
  checked_in: 'Entrada fichada',
  in_progress: 'En curso',
  paused: 'Pausado',
  completed: 'Completado',
  validated: 'Validado',
};

const EXEC_STATUS_COLOR: Record<ExecutionStatus, { bg: string; text: string }> = {
  not_started: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500' },
  checked_in: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600' },
  paused: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600' },
  completed: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600' },
  validated: { bg: 'bg-cyan-50 dark:bg-cyan-900/30', text: 'text-cyan-600' },
};

const INCIDENT_TYPES: { value: ExecIncidentType; label: string }[] = [
  { value: 'material_missing', label: 'Falta material' },
  { value: 'access_denied', label: 'Acceso denegado' },
  { value: 'damage_found', label: 'Daños encontrados' },
  { value: 'client_absent', label: 'Cliente ausente' },
  { value: 'equipment_failure', label: 'Fallo de equipo' },
  { value: 'safety_hazard', label: 'Riesgo seguridad' },
  { value: 'scope_change', label: 'Cambio de alcance' },
  { value: 'other', label: 'Otro' },
];

const SEVERITY_OPTIONS: { value: ExecIncidentSeverity; label: string; color: string }[] = [
  { value: 'low', label: 'Baja', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Media', color: 'bg-amber-100 text-amber-700' },
  { value: 'high', label: 'Alta', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Crítica', color: 'bg-red-100 text-red-700' },
];

// ─── TimeComparison ──────────────────────────────────────────────────────────

function TimeComparison({
  plannedMinutes, realMinutes, checkInAt, checkOutAt,
  scheduledStart, scheduledEnd, compact = false,
}: {
  plannedMinutes: number;
  realMinutes: number;
  checkInAt?: string;
  checkOutAt?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  compact?: boolean;
}) {
  const deviation = realMinutes - plannedMinutes;
  const pctUsed = plannedMinutes > 0 ? Math.min((realMinutes / plannedMinutes) * 100, 150) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Timer className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-gray-600 dark:text-gray-300">
          {formatMinutes(realMinutes)} / {formatMinutes(plannedMinutes)} prev.
        </span>
        {deviation !== 0 && (
          <span className={'font-semibold ' + deviationColor(deviation, plannedMinutes)}>
            ({deviation > 0 ? '+' : ''}{formatMinutes(Math.abs(deviation))} · {plannedMinutes > 0 ? (deviation > 0 ? '+' : '') + Math.round((deviation / plannedMinutes) * 100) + '%' : ''})
          </span>
        )}
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-24">
          <div className={'h-full rounded-full transition-all ' + deviationBg(deviation, plannedMinutes)} style={{ width: Math.min(pctUsed, 100) + '%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Previsto</p>
          <p className="text-lg font-black text-gray-900 dark:text-gray-100">{formatMinutes(plannedMinutes)}</p>
          {scheduledStart && <p className="text-xs text-gray-400">{scheduledStart}{scheduledEnd ? ' – ' + scheduledEnd : ''}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Real</p>
          <p className="text-lg font-black text-gray-900 dark:text-gray-100">{formatMinutes(realMinutes)}</p>
          {checkInAt && (
            <p className="text-xs text-gray-400">
              {new Date(checkInAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              {checkOutAt ? ' – ' + new Date(checkOutAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ' – en curso'}
            </p>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Progreso</span>
          <span className={'text-xs font-bold ' + deviationColor(deviation, plannedMinutes)}>
            {deviation === 0 ? 'A tiempo' : (deviation > 0 ? '+' : '') + formatMinutes(Math.abs(deviation))}
            {plannedMinutes > 0 ? ' (' + (deviation > 0 ? '+' : '') + Math.round((deviation / plannedMinutes) * 100) + '%)' : ''}
          </span>
        </div>
        <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={'h-full rounded-full transition-all duration-500 ' + deviationBg(deviation, plannedMinutes)} style={{ width: Math.min(pctUsed, 100) + '%' }} />
        </div>
      </div>
    </div>
  );
}

// ─── WorkerView ──────────────────────────────────────────────────────────────

function WorkerView({
  services, userId, onRefresh,
}: {
  services: CleaningService[];
  userId: string;
  onRefresh: () => void;
}) {
  const { location: geoLoc, requestLocation } = useGeolocation();
  const [selected, setSelected] = useState<CleaningService | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentType, setIncidentType] = useState<ExecIncidentType>('other');
  const [incidentSeverity, setIncidentSeverity] = useState<ExecIncidentSeverity>('medium');
  const [incidentDesc, setIncidentDesc] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const todayServices = useMemo(
    () => services.filter(s => s.date === today && s.status !== 'cancelled'),
    [services, today],
  );

  useEffect(() => {
    const active = selected && (selected.execution?.status === 'checked_in' || selected.execution?.status === 'in_progress');
    if (!active) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [selected]);

  const liveSeconds = useMemo(() => {
    if (!selected?.execution?.checkInAt) return 0;
    const exec = selected.execution;
    if (exec.status === 'completed' || exec.status === 'validated') return exec.realMinutes * 60;
    const start = new Date(exec.checkInAt).getTime();
    const now = Date.now();
    let pauseMs = 0;
    for (const p of exec.pauseLog || []) {
      const ps = new Date(p.startAt).getTime();
      const pe = p.endAt ? new Date(p.endAt).getTime() : now;
      pauseMs += Math.max(0, pe - ps);
    }
    return Math.max(0, Math.floor((now - start - pauseMs) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tick]);

  async function handleCheckIn(svc: CleaningService) {
    setActionLoading(true);
    try {
      const geo = await requestLocation();
      const updated = await checkInServiceRequest(userId, svc._id, geo);
      setSelected(updated);
      onRefresh();
      toast.success('Entrada fichada');
    } catch (err: any) {
      toast.error(err.message || 'Error al fichar entrada');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut() {
    if (!selected) return;
    setActionLoading(true);
    try {
      const geo = await requestLocation();
      const updated = await checkOutServiceRequest(userId, selected._id, {
        geo, workerNotes: notesText || undefined,
      });
      setSelected(updated);
      setNotesText('');
      onRefresh();
      toast.success('Salida fichada');
    } catch (err: any) {
      toast.error(err.message || 'Error al fichar salida');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    if (!selected) return;
    setActionLoading(true);
    try {
      const updated = await pauseServiceRequest(userId, selected._id);
      setSelected(updated);
      onRefresh();
      toast.success('Servicio pausado');
    } catch (err: any) {
      toast.error(err.message || 'Error al pausar');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    if (!selected) return;
    setActionLoading(true);
    try {
      const updated = await resumeServiceRequest(userId, selected._id);
      setSelected(updated);
      onRefresh();
      toast.success('Servicio reanudado');
    } catch (err: any) {
      toast.error(err.message || 'Error al reanudar');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleTask(task: CleaningTask) {
    if (!selected) return;
    const updatedTasks = selected.tasks.map(t =>
      t.id === task.id ? { ...t, done: !t.done } : t,
    );
    try {
      const updated = await updateCleaningServiceRequest(userId, { ...selected, tasks: updatedTasks } as CleaningService);
      setSelected(updated);
      onRefresh();
    } catch { /* silent */ }
  }

  async function handleSubmitIncident() {
    if (!selected || !incidentDesc.trim()) return;
    setActionLoading(true);
    try {
      const updated = await reportExecIncidentRequest(userId, selected._id, {
        type: incidentType,
        severity: incidentSeverity,
        description: incidentDesc,
        photoUrl: '',
      });
      setSelected(updated);
      setShowIncidentForm(false);
      setIncidentDesc('');
      onRefresh();
      toast.success('Incidencia registrada');
    } catch (err: any) {
      toast.error(err.message || 'Error al reportar incidencia');
    } finally {
      setActionLoading(false);
    }
  }

  if (selected) {
    const exec = selected.execution || {} as ServiceExecution;
    const execStatus = exec.status || 'not_started';
    const isActive = execStatus === 'checked_in' || execStatus === 'in_progress';
    const isPaused = execStatus === 'paused';
    const isCompleted = execStatus === 'completed' || execStatus === 'validated';
    const tasksDone = selected.tasks.filter(t => t.done).length;

    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 self-start">
          <ArrowLeft className="w-4 h-4" /> Volver a la lista
        </button>

        {/* Service header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-gray-400">{selected.serviceNumber}</span>
                <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + EXEC_STATUS_COLOR[execStatus].bg + ' ' + EXEC_STATUS_COLOR[execStatus].text}>
                  {EXEC_STATUS_LABEL[execStatus]}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selected.clientName}</h2>
            </div>
            <SprayCan className="w-6 h-6 text-cyan-500" />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selected.address}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{selected.time || 'Sin hora'} · {selected.duration}h prev.</span>
            {selected.assignedToName && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{selected.assignedToName}</span>}
          </div>
        </div>

        {/* Timer */}
        {(isActive || isPaused) && (
          <div className={'rounded-2xl p-6 text-center border-2 ' + (isPaused ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800')}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              {isPaused ? 'Servicio pausado' : 'Tiempo trabajado'}
            </p>
            <p className={'text-4xl font-black font-mono tracking-wider ' + (isPaused ? 'text-amber-600' : 'text-blue-600')}>
              {formatTimer(liveSeconds)}
            </p>
            <div className="mt-3">
              <TimeComparison
                plannedMinutes={exec.plannedMinutes || Math.round(parseFloat(selected.duration || '0') * 60)}
                realMinutes={Math.round(liveSeconds / 60)}
                checkInAt={exec.checkInAt}
                scheduledStart={selected.time}
                compact
              />
            </div>
          </div>
        )}

        {/* Completed summary */}
        {isCompleted && (
          <TimeComparison
            plannedMinutes={exec.plannedMinutes}
            realMinutes={exec.realMinutes}
            checkInAt={exec.checkInAt}
            checkOutAt={exec.checkOutAt}
            scheduledStart={selected.time}
          />
        )}

        {/* Action buttons */}
        {!isCompleted && (isActive || isPaused) && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setShowIncidentForm(true)} className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 text-orange-600 rounded-xl border border-orange-200 dark:border-orange-800 text-sm font-semibold hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors">
              <AlertTriangle className="w-4 h-4" /> Incidencia
            </button>
            {isPaused ? (
              <button onClick={handleResume} disabled={actionLoading} className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Reanudar
              </button>
            ) : (
              <button onClick={handlePause} disabled={actionLoading} className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-xl border border-amber-200 dark:border-amber-800 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />} Pausar
              </button>
            )}
          </div>
        )}

        {/* Photo upload */}
        {(isActive || isPaused) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4" /> Fotos del servicio
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-cyan-300 dark:hover:border-cyan-700 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-colors">
                <Camera className="w-5 h-5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Antes</span>
                <span className="text-[10px] text-gray-400">({(exec.photosBefore || []).length} fotos)</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !selected) return;
                  try {
                    const geo = await requestLocation();
                    const updated = await uploadServicePhotoFileRequest(userId, selected._id, file, 'before', geo);
                    setSelected(updated);
                    onRefresh();
                    toast.success('Foto añadida');
                  } catch (err: any) { toast.error(err.message || 'Error al subir foto'); }
                  e.target.value = '';
                }} />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-cyan-300 dark:hover:border-cyan-700 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-colors">
                <Image className="w-5 h-5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Después</span>
                <span className="text-[10px] text-gray-400">({(exec.photosAfter || []).length} fotos)</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !selected) return;
                  try {
                    const geo = await requestLocation();
                    const updated = await uploadServicePhotoFileRequest(userId, selected._id, file, 'after', geo);
                    setSelected(updated);
                    onRefresh();
                    toast.success('Foto añadida');
                  } catch (err: any) { toast.error(err.message || 'Error al subir foto'); }
                  e.target.value = '';
                }} />
              </label>
            </div>
            {((exec.photosBefore || []).length > 0 || (exec.photosAfter || []).length > 0) && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {(exec.photosBefore || []).map((p, i) => (
                  <div key={'b' + i} className="aspect-square rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
                    <img src={p.url} alt={'Antes ' + (i + 1)} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">Antes</span>
                  </div>
                ))}
                {(exec.photosAfter || []).map((p, i) => (
                  <div key={'a' + i} className="aspect-square rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
                    <img src={p.url} alt={'Después ' + (i + 1)} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">Después</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Checklist */}
        {selected.tasks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> Checklist ({tasksDone}/{selected.tasks.length})
            </h3>
            <div className="space-y-2">
              {selected.tasks.map(task => (
                <label key={task.id} className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => handleToggleTask(task)}
                    disabled={isCompleted}
                    className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 w-4.5 h-4.5"
                  />
                  <span className={'text-sm ' + (task.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300')}>{task.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Incidents */}
        {(exec.incidents || []).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Incidencias ({exec.incidents.length})
            </h3>
            <div className="space-y-2">
              {exec.incidents.map(inc => (
                <div key={inc.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className={'w-2 h-2 rounded-full mt-1.5 shrink-0 ' + (inc.resolvedAt ? 'bg-emerald-500' : inc.severity === 'critical' ? 'bg-red-500' : inc.severity === 'high' ? 'bg-orange-500' : 'bg-amber-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {INCIDENT_TYPES.find(t => t.value === inc.type)?.label || inc.type}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{inc.description}</p>
                    {inc.resolvedAt && <p className="text-xs text-emerald-600 mt-1">Resuelta: {inc.resolutionNotes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {(isActive || isPaused) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Observaciones</h3>
            <textarea
              value={notesText}
              onChange={e => setNotesText(e.target.value)}
              rows={2}
              placeholder="Notas sobre el servicio..."
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>
        )}

        {isCompleted && exec.workerNotes && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Observaciones del trabajador</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">{exec.workerNotes}</p>
          </div>
        )}

        {exec.validatedBy && (
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-2xl border border-cyan-200 dark:border-cyan-800 p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-cyan-600" />
            <div>
              <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Validado</p>
              {exec.validationNotes && <p className="text-xs text-cyan-600/70">{exec.validationNotes}</p>}
            </div>
          </div>
        )}

        {/* Main action */}
        <div className="sticky bottom-4">
          {execStatus === 'not_started' && (
            <button onClick={() => handleCheckIn(selected)} disabled={actionLoading} className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-base font-bold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              Fichar entrada
              {geoLoc && <MapPin className="w-4 h-4 opacity-60" />}
            </button>
          )}
          {(isActive || isPaused) && (
            <button onClick={handleCheckOut} disabled={actionLoading} className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-base font-bold transition-colors disabled:opacity-50 shadow-lg shadow-red-200 dark:shadow-red-900/50">
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
              Registrar salida
            </button>
          )}
          {isCompleted && (
            <div className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl text-base font-bold border-2 border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="w-5 h-5" /> Servicio completado
            </div>
          )}
        </div>

        {/* Incident modal */}
        {showIncidentForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowIncidentForm(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Reportar incidencia</h3>
                <button onClick={() => setShowIncidentForm(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
                  <select value={incidentType} onChange={e => setIncidentType(e.target.value as ExecIncidentType)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Severidad</label>
                  <div className="flex gap-2">
                    {SEVERITY_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setIncidentSeverity(opt.value)} className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (incidentSeverity === opt.value ? opt.color + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción *</label>
                  <textarea value={incidentDesc} onChange={e => setIncidentDesc(e.target.value)} rows={3} placeholder="Describe la incidencia..." className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={() => setShowIncidentForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">Cancelar</button>
                <button onClick={handleSubmitIncident} disabled={!incidentDesc.trim() || actionLoading} className="px-5 py-2 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2">
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Service list for today
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Servicios de hoy ({todayServices.length})</h2>
        <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {todayServices.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <Calendar className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No tienes servicios asignados para hoy</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {todayServices.map(svc => {
            const exec = svc.execution || {} as ServiceExecution;
            const execStatus = exec.status || 'not_started';
            const stCfg = EXEC_STATUS_COLOR[execStatus];
            const tasksDone = svc.tasks.filter(t => t.done).length;
            return (
              <button key={svc._id} onClick={() => setSelected(svc)} className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-md transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-xs text-gray-400">{svc.serviceNumber}</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{svc.clientName}</p>
                  </div>
                  <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + stCfg.bg + ' ' + stCfg.text}>
                    {EXEC_STATUS_LABEL[execStatus]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{svc.address}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{svc.time || '–'} · {svc.duration}h</span>
                </div>
                {svc.tasks.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: (svc.tasks.length > 0 ? (tasksDone / svc.tasks.length) * 100 : 0) + '%' }} />
                    </div>
                    <span className="text-xs text-gray-400">{tasksDone}/{svc.tasks.length}</span>
                  </div>
                )}
                {exec.realMinutes > 0 && (
                  <div className="mt-2">
                    <TimeComparison plannedMinutes={exec.plannedMinutes} realMinutes={exec.realMinutes} compact />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ManagerView ─────────────────────────────────────────────────────────────

function ManagerView({
  services, userId, onRefresh,
}: {
  services: CleaningService[];
  userId: string;
  onRefresh: () => void;
}) {
  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<'active' | 'validate' | 'incidents' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [detailSvc, setDetailSvc] = useState<CleaningService | null>(null);
  const [validationNotes, setValidationNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const s = await fetchExecutionSummaryRequest(userId, { date: selectedDate });
      setSummary(s);
    } catch { /* silent */ } finally {
      setSummaryLoading(false);
    }
  }, [userId, selectedDate]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const dateServices = useMemo(
    () => services.filter(s => s.date === selectedDate && s.status !== 'cancelled'),
    [services, selectedDate],
  );

  const filteredServices = useMemo(() => {
    let list = dateServices;
    if (tab === 'active') list = list.filter(s => ['checked_in', 'in_progress', 'paused'].includes(s.execution?.status || ''));
    if (tab === 'validate') list = list.filter(s => s.execution?.status === 'completed');
    if (tab === 'incidents') list = list.filter(s => (s.execution?.incidents || []).length > 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.clientName.toLowerCase().includes(q) ||
        s.assignedToName.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.serviceNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dateServices, tab, search]);

  async function handleValidate(svc: CleaningService) {
    setActionLoading(true);
    try {
      await validateExecutionRequest(userId, svc._id, { validatedBy: userId, validationNotes });
      setDetailSvc(null);
      setValidationNotes('');
      onRefresh();
      loadSummary();
      toast.success('Ejecución validada');
    } catch (err: any) {
      toast.error(err.message || 'Error al validar');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolveIncident(svc: CleaningService, incidentId: string, notes: string) {
    try {
      await resolveExecIncidentRequest(userId, svc._id, incidentId, { resolvedBy: userId, resolutionNotes: notes || 'Resuelta' });
      onRefresh();
      loadSummary();
      toast.success('Incidencia resuelta');
    } catch (err: any) {
      toast.error(err.message || 'Error al resolver');
    }
  }

  const kpis = summary ? [
    { label: 'Servicios', value: summary.totalServices, bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-900 dark:text-gray-100' },
    { label: 'En curso', value: summary.inProgress, bg: 'bg-blue-50', text: 'text-blue-700' },
    { label: 'Completados', value: summary.completed, bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { label: 'Con incidencia', value: summary.withIncidents, bg: 'bg-orange-50', text: 'text-orange-700' },
    { label: 'H. previstas', value: formatMinutes(summary.totalPlannedMinutes), bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-900 dark:text-gray-100' },
    { label: 'H. reales', value: formatMinutes(summary.totalRealMinutes), bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-900 dark:text-gray-100' },
    { label: 'Desviación', value: (summary.deviationMinutes > 0 ? '+' : '') + formatMinutes(Math.abs(summary.deviationMinutes)), bg: summary.deviationMinutes > 30 ? 'bg-red-50' : summary.deviationMinutes > 0 ? 'bg-amber-50' : 'bg-emerald-50', text: summary.deviationMinutes > 30 ? 'text-red-700' : summary.deviationMinutes > 0 ? 'text-amber-700' : 'text-emerald-700' },
    { label: 'Sin fichar', value: (summary.alerts || []).filter(a => a.type === 'NO_CHECKIN').length, bg: 'bg-red-50', text: 'text-red-700' },
  ] : [];

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: 'active', label: 'En curso', count: dateServices.filter(s => ['checked_in', 'in_progress', 'paused'].includes(s.execution?.status || '')).length },
    { key: 'validate', label: 'Pendientes validar', count: dateServices.filter(s => s.execution?.status === 'completed').length },
    { key: 'incidents', label: 'Incidencias', count: dateServices.filter(s => (s.execution?.incidents || []).length > 0).length },
    { key: 'all', label: 'Todos', count: dateServices.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Date + KPIs */}
      <div className="flex items-center gap-3">
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={() => { onRefresh(); loadSummary(); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {summaryLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className={kpi.bg + ' rounded-2xl p-3 border border-gray-200 dark:border-gray-700'}>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{kpi.label}</p>
              <p className={'text-xl font-black mt-0.5 ' + kpi.text}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {summary && summary.alerts && summary.alerts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800 p-4">
          <h3 className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Alertas activas ({summary.alerts.length})
          </h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {summary.alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={'w-2 h-2 rounded-full shrink-0 ' + (alert.severity === 'critical' || alert.severity === 'high' ? 'bg-red-500' : alert.severity === 'medium' ? 'bg-amber-500' : 'bg-gray-400')} />
                <span className="text-gray-700 dark:text-gray-300">{alert.message}</span>
                <span className="text-gray-400 ml-auto shrink-0">{alert.serviceNumber}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (tab === t.key ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700')}>
              {t.label} {t.count > 0 && <span className="ml-1 opacity-60">({t.count})</span>}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-56" />
        </div>
      </div>

      {/* Service list */}
      {filteredServices.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <SprayCan className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Sin servicios en esta categoría</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredServices.map(svc => {
            const exec = svc.execution || {} as ServiceExecution;
            const execStatus = exec.status || 'not_started';
            const stCfg = EXEC_STATUS_COLOR[execStatus];
            const hasIncidents = (exec.incidents || []).length > 0;
            const unresolvedIncidents = (exec.incidents || []).filter(i => !i.resolvedAt).length;
            return (
              <div key={svc._id} onClick={() => setDetailSvc(svc)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{svc.serviceNumber}</span>
                      <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ' + stCfg.bg + ' ' + stCfg.text}>{EXEC_STATUS_LABEL[execStatus]}</span>
                      {hasIncidents && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">{unresolvedIncidents > 0 ? unresolvedIncidents + ' sin resolver' : 'resueltas'}</span>}
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{svc.clientName}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <User className="w-3 h-3" /><span>{svc.assignedToName || 'Sin asignar'}</span>
                      <MapPin className="w-3 h-3 ml-1" /><span className="truncate">{svc.address}</span>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                </div>
                {exec.realMinutes > 0 && (
                  <TimeComparison plannedMinutes={exec.plannedMinutes} realMinutes={exec.realMinutes} compact />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {detailSvc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailSvc(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs text-gray-400">{detailSvc.serviceNumber}</p>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detailSvc.clientName}</h2>
              </div>
              <button onClick={() => setDetailSvc(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" />{detailSvc.assignedToName || 'Sin asignar'}</span>
                <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" />{detailSvc.address}</span>
                <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" />{detailSvc.time || '–'} · {detailSvc.duration}h prev.</span>
                <span className="flex items-center gap-2"><SprayCan className="w-4 h-4 text-gray-400" />{detailSvc.cleaningType}</span>
              </div>

              {/* Time comparison */}
              {(detailSvc.execution?.realMinutes > 0 || detailSvc.execution?.checkInAt) && (
                <TimeComparison
                  plannedMinutes={detailSvc.execution.plannedMinutes}
                  realMinutes={detailSvc.execution.realMinutes}
                  checkInAt={detailSvc.execution.checkInAt}
                  checkOutAt={detailSvc.execution.checkOutAt}
                  scheduledStart={detailSvc.time}
                />
              )}

              {/* Geo */}
              {detailSvc.execution?.checkInGeo && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Check-in: {detailSvc.execution.checkInGeo.latitude.toFixed(4)}, {detailSvc.execution.checkInGeo.longitude.toFixed(4)}</span>
                  {detailSvc.execution.checkOutGeo && (
                    <span>Check-out: {detailSvc.execution.checkOutGeo.latitude.toFixed(4)}, {detailSvc.execution.checkOutGeo.longitude.toFixed(4)}</span>
                  )}
                </div>
              )}

              {/* Checklist */}
              {detailSvc.tasks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Checklist</h4>
                  <div className="space-y-1">
                    {detailSvc.tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-sm">
                        {t.done ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                        <span className={t.done ? 'text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}>{t.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{detailSvc.tasks.filter(t => t.done).length}/{detailSvc.tasks.length} completadas</p>
                </div>
              )}

              {/* Incidents */}
              {(detailSvc.execution?.incidents || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Incidencias</h4>
                  <div className="space-y-2">
                    {detailSvc.execution.incidents.map(inc => (
                      <div key={inc.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-start gap-3">
                        <div className={'w-2 h-2 rounded-full mt-1.5 shrink-0 ' + (inc.resolvedAt ? 'bg-emerald-500' : 'bg-orange-500')} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{INCIDENT_TYPES.find(t => t.value === inc.type)?.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{inc.description}</p>
                          {inc.resolvedAt
                            ? <p className="text-xs text-emerald-600 mt-1">Resuelta: {inc.resolutionNotes}</p>
                            : <button onClick={() => handleResolveIncident(detailSvc, inc.id, '')} className="text-xs text-cyan-600 hover:text-cyan-700 font-semibold mt-1">Resolver</button>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Worker notes */}
              {detailSvc.execution?.workerNotes && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Observaciones del trabajador</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">{detailSvc.execution.workerNotes}</p>
                </div>
              )}

              {/* Validation */}
              {detailSvc.execution?.status === 'completed' && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Validación</h4>
                  <textarea value={validationNotes} onChange={e => setValidationNotes(e.target.value)} rows={2} placeholder="Notas de validación (opcional)..." className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none mb-3" />
                  <div className="flex gap-2">
                    <button onClick={() => handleValidate(detailSvc)} disabled={actionLoading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Validar ejecución
                    </button>
                  </div>
                </div>
              )}

              {detailSvc.execution?.status === 'validated' && (
                <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border border-cyan-200 dark:border-cyan-800 p-3 flex items-center gap-3">
                  <Shield className="w-5 h-5 text-cyan-600" />
                  <div>
                    <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Ejecución validada</p>
                    {detailSvc.execution.validationNotes && <p className="text-xs text-cyan-600/70 mt-0.5">{detailSvc.execution.validationNotes}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function CleaningExecution() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id || user?.user_id || '';
  const myMember = useMemo(
    () => currentBusiness?.members?.find((m: any) => m.user_id === user?.user_id),
    [currentBusiness, user?.user_id],
  );
  const isManager = myMember?.role === 'Admin' || myMember?.role === 'Gerente';

  const loadServices = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listCleaningServicesRequest(userId);
      setServices(data);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadServices(); }, [loadServices]);

  return (
    <Layout title="Fichaje y Ejecución" subtitle={isManager ? 'Supervisión y validación de servicios' : 'Registra tu actividad en los servicios de hoy'}>
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : isManager ? (
        <ManagerView services={services} userId={userId} onRefresh={loadServices} />
      ) : (
        <WorkerView services={services} userId={userId} onRefresh={loadServices} />
      )}
    </Layout>
  );
}
