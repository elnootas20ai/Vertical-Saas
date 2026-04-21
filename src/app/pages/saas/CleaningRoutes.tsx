import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listCleaningRoutesRequest,
  generateCleaningRoutesRequest,
  reorderCleaningRouteRequest,
  reassignCleaningRouteRequest,
  deleteCleaningRouteRequest,
  listCleaningServicesRequest,
  type CleaningRoute,
  type CleaningRouteStatus,
  type RouteEntry,
  type RouteEntryStatus,
  type CleaningService,
  type GenerateRoutesResult,
} from '../../lib/cleaningApi';
import {
  Route, ChevronLeft, ChevronRight, CalendarDays, Clock,
  MapPin, Search, Filter, Loader2, AlertTriangle, Users,
  ChevronDown, ChevronUp, GripVertical, ArrowRightLeft,
  Trash2, LayoutList, Timer, Zap, X, Check, User,
  AlertCircle, RefreshCw, Sparkles,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROUTE_STATUS_CONFIG: Record<CleaningRouteStatus, { label: string; bg: string; text: string }> = {
  draft:     { label: 'Borrador',   bg: 'bg-gray-100 dark:bg-gray-700',          text: 'text-gray-600 dark:text-gray-300' },
  active:    { label: 'Activa',     bg: 'bg-blue-50 dark:bg-blue-950/40',        text: 'text-blue-700 dark:text-blue-400' },
  completed: { label: 'Completada', bg: 'bg-emerald-50 dark:bg-emerald-950/40',  text: 'text-emerald-700 dark:text-emerald-400' },
  cancelled: { label: 'Cancelada',  bg: 'bg-red-50 dark:bg-red-950/40',          text: 'text-red-700 dark:text-red-400' },
};

const ENTRY_STATUS_CONFIG: Record<RouteEntryStatus, { label: string; bg: string; text: string }> = {
  pending:     { label: 'Pendiente',   bg: 'bg-gray-100 dark:bg-gray-700',          text: 'text-gray-600 dark:text-gray-300' },
  in_transit:  { label: 'En transito', bg: 'bg-sky-50 dark:bg-sky-950/40',          text: 'text-sky-700 dark:text-sky-400' },
  in_progress: { label: 'En curso',    bg: 'bg-blue-50 dark:bg-blue-950/40',        text: 'text-blue-700 dark:text-blue-400' },
  completed:   { label: 'Completado',  bg: 'bg-emerald-50 dark:bg-emerald-950/40',  text: 'text-emerald-700 dark:text-emerald-400' },
  skipped:     { label: 'Omitido',     bg: 'bg-amber-50 dark:bg-amber-950/40',      text: 'text-amber-700 dark:text-amber-400' },
};

const TIMELINE_START = 6;
const TIMELINE_END = 22;
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;
const DND_ITEM_TYPE = 'ROUTE_ENTRY';

interface DragItem {
  serviceId: string;
  index: number;
  routeId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function timeToDecimal(timeStr: string): number {
  if (!timeStr) return 0;
  try {
    const d = parseISO(timeStr);
    if (!isNaN(d.getTime())) return d.getHours() + d.getMinutes() / 60;
  } catch { /* fallback */ }
  const parts = timeStr.split(':');
  return Number(parts[0]) + Number(parts[1] || 0) / 60;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '--:--';
  try {
    const d = parseISO(timeStr);
    if (!isNaN(d.getTime())) return format(d, 'HH:mm');
  } catch { /* fallback */ }
  return timeStr.slice(0, 5);
}

function parseDurationMinutes(duration: string): number {
  if (!duration) return 0;
  const num = parseInt(duration, 10);
  if (!isNaN(num)) return num;
  const hMatch = duration.match(/(\d+)\s*h/i);
  const mMatch = duration.match(/(\d+)\s*m/i);
  return (hMatch ? parseInt(hMatch[1], 10) * 60 : 0) + (mMatch ? parseInt(mMatch[1], 10) : 0);
}

// ─── Draggable Route Entry ──────────────────────────────────────────────────

function DraggableRouteEntry({
  entry, index, routeId, moveEntry,
}: {
  entry: RouteEntry; index: number; routeId: string;
  moveEntry: (dragIdx: number, hoverIdx: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entryCfg = ENTRY_STATUS_CONFIG[entry.status] || ENTRY_STATUS_CONFIG.pending;
  const duration = parseDurationMinutes(entry.duration);

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_ITEM_TYPE,
    item: (): DragItem => ({ serviceId: entry.serviceId, index, routeId }),
    collect: m => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop<DragItem>({
    accept: DND_ITEM_TYPE,
    hover(item, monitor) {
      if (!ref.current || item.routeId !== routeId) return;
      const dragIdx = item.index;
      const hoverIdx = index;
      if (dragIdx === hoverIdx) return;
      const rect = ref.current.getBoundingClientRect();
      const midY = (rect.bottom - rect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const offsetY = clientOffset.y - rect.top;
      if (dragIdx < hoverIdx && offsetY < midY) return;
      if (dragIdx > hoverIdx && offsetY > midY) return;
      moveEntry(dragIdx, hoverIdx);
      item.index = hoverIdx;
    },
  });

  preview(drop(ref));

  return (
    <div
      ref={ref}
      className={`flex items-start gap-3 p-3 rounded-xl transition-all ${
        entry.overlap
          ? 'border-2 border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-950/20'
          : 'border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
      } ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}`}
    >
      <div ref={drag} className="cursor-grab active:cursor-grabbing pt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 text-xs font-bold shrink-0 mt-0.5">
        {entry.order}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{entry.clientName}</span>
          {entry.priority === 'urgent' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
              </span>
              Urgente
            </span>
          )}
          {entry.overlap && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3" />
              Solapamiento
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(entry.estimatedStartTime)} – {formatTime(entry.estimatedEndTime)}</span>
          <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3" />{duration}min</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{entry.address}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
            {entry.cleaningType}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${entryCfg.bg} ${entryCfg.text}`}>
            {entryCfg.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Route Card ─────────────────────────────────────────────────────────────

function RouteCard({
  route, onReassign, onDelete, onReorder,
}: {
  route: CleaningRoute;
  onReassign: (r: CleaningRoute) => void;
  onDelete: (r: CleaningRoute) => void;
  onReorder: (routeId: string, entries: RouteEntry[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const statusCfg = ROUTE_STATUS_CONFIG[route.status] || ROUTE_STATUS_CONFIG.draft;
  const completedCount = route.entries.filter(e => e.status === 'completed').length;
  const totalCount = route.entries.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasOverlaps = route.entries.some(e => e.overlap);

  const moveEntry = useCallback(
    (dragIdx: number, hoverIdx: number) => {
      const updated = [...route.entries];
      const [removed] = updated.splice(dragIdx, 1);
      updated.splice(hoverIdx, 0, removed);
      onReorder(route._id, updated.map((e, i) => ({ ...e, order: i + 1 })));
    },
    [route.entries, route._id, onReorder],
  );

  return (
    <div className={`bg-white dark:bg-gray-800 border rounded-2xl overflow-hidden transition-shadow hover:shadow-lg ${
      hasOverlaps ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {getInitials(route.workerName)}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">{route.workerName}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{totalCount} paradas</span>
                <span className="select-none">·</span>
                <span>{route.totalEstimatedMinutes}min</span>
                {route.zone && <><span className="select-none">·</span><span>{route.zone}</span></>}
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusCfg.bg} ${statusCfg.text}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{completedCount}/{totalCount} completados</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? 'Ocultar paradas' : 'Ver paradas'}
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => onReassign(route)} className="p-2 rounded-lg text-gray-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Reasignar">
              <ArrowRightLeft className="w-4 h-4" />
            </button>
            <button onClick={() => onDelete(route)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Eliminar">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {expanded && route.entries.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-2">
          {[...route.entries].sort((a, b) => a.order - b.order).map((entry, idx) => (
            <DraggableRouteEntry key={entry.serviceId} entry={entry} index={idx} routeId={route._id} moveEntry={moveEntry} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Block ─────────────────────────────────────────────────────────

function TimelineBlock({ entry, onClick }: { entry: RouteEntry; onClick: (e: RouteEntry) => void }) {
  const startH = timeToDecimal(entry.estimatedStartTime);
  const durH = parseDurationMinutes(entry.duration) / 60;
  const leftPct = ((startH - TIMELINE_START) / TIMELINE_HOURS) * 100;
  const widthPct = (durH / TIMELINE_HOURS) * 100;

  const colors: Record<RouteEntryStatus, string> = {
    pending:     'bg-gray-300 dark:bg-gray-600',
    in_transit:  'bg-sky-400 dark:bg-sky-700',
    in_progress: 'bg-blue-500 dark:bg-blue-600',
    completed:   'bg-emerald-500 dark:bg-emerald-600',
    skipped:     'bg-amber-400 dark:bg-amber-600',
  };

  return (
    <button
      onClick={() => onClick(entry)}
      className={`absolute top-1 bottom-1 rounded-lg text-[10px] font-semibold text-white px-1.5 truncate transition-transform hover:scale-[1.02] hover:z-10 ${
        colors[entry.status] || colors.pending
      } ${entry.overlap ? 'ring-2 ring-red-500 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
      style={{ left: `${Math.max(0, leftPct)}%`, width: `${Math.max(2, widthPct)}%` }}
      title={`${entry.clientName} · ${formatTime(entry.estimatedStartTime)}–${formatTime(entry.estimatedEndTime)}`}
    >
      {entry.clientName}
    </button>
  );
}

// ─── Timeline Detail Popover ────────────────────────────────────────────────

function TimelineDetail({ entry, onClose }: { entry: RouteEntry; onClose: () => void }) {
  const cfg = ENTRY_STATUS_CONFIG[entry.status] || ENTRY_STATUS_CONFIG.pending;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white">{entry.clientName}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" />{entry.address}</div>
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" />{formatTime(entry.estimatedStartTime)} – {formatTime(entry.estimatedEndTime)}</div>
          <div className="flex items-center gap-2"><Timer className="w-4 h-4 text-gray-400" />{parseDurationMinutes(entry.duration)}min</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400">{entry.cleaningType}</span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
          {entry.priority === 'urgent' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400">Urgente</span>
          )}
        </div>
        {entry.overlap && (
          <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-2.5">
            <AlertCircle className="w-4 h-4" />Conflicto de horario detectado
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reassign Modal ─────────────────────────────────────────────────────────

function ReassignModal({
  route, workers, onConfirm, onClose, saving,
}: {
  route: CleaningRoute;
  workers: { id: string; name: string }[];
  onConfirm: (workerId: string, workerName: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [selectedWorker, setSelectedWorker] = useState('');
  const available = workers.filter(w => w.id !== route.workerId);
  const selected = available.find(w => w.id === selectedWorker);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reasignar ruta</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Trabajador actual</label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-white">
                {getInitials(route.workerName)}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{route.workerName}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Nuevo trabajador</label>
            <select
              value={selectedWorker}
              onChange={e => setSelectedWorker(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Seleccionar trabajador...</option>
              {available.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => selected && onConfirm(selected.id, selected.name)}
            disabled={!selectedWorker || saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CleaningRoutes() {
  const { user } = useAuth();

  const [routes, setRoutes] = useState<CleaningRoute[]>([]);
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [warnings, setWarnings] = useState<GenerateRoutesResult['warnings']>([]);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');

  const [reassignRoute, setReassignRoute] = useState<CleaningRoute | null>(null);
  const [reassignSaving, setReassignSaving] = useState(false);
  const [timelineDetail, setTimelineDetail] = useState<RouteEntry | null>(null);

  // ─── Data loading ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const [routesData, servicesData] = await Promise.all([
        listCleaningRoutesRequest(user.id, { date: selectedDate }),
        listCleaningServicesRequest(user.id),
      ]);
      setRoutes(routesData);
      setServices(servicesData);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar rutas');
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Derived data ────────────────────────────────────────────────────

  const workers = useMemo(() => {
    const map = new Map<string, string>();
    routes.forEach(r => { if (r.workerId && r.workerName) map.set(r.workerId, r.workerName); });
    services.forEach(s => { if (s.assignedTo && s.assignedToName) map.set(s.assignedTo, s.assignedToName); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [routes, services]);

  const zones = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { if (r.zone) set.add(r.zone); r.entries.forEach(e => { if (e.zone) set.add(e.zone); }); });
    return Array.from(set).sort();
  }, [routes]);

  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      if (workerFilter !== 'all' && r.workerId !== workerFilter) return false;
      if (zoneFilter !== 'all' && r.zone !== zoneFilter && !r.entries.some(e => e.zone === zoneFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchR = r.workerName.toLowerCase().includes(q) || r.zone?.toLowerCase().includes(q);
        const matchE = r.entries.some(e =>
          e.clientName.toLowerCase().includes(q) || e.address.toLowerCase().includes(q) || e.cleaningType.toLowerCase().includes(q),
        );
        if (!matchR && !matchE) return false;
      }
      return true;
    });
  }, [routes, workerFilter, zoneFilter, search]);

  const stats = useMemo(() => ({
    activeRoutes: routes.filter(r => r.status === 'active' || r.status === 'draft').length,
    totalServices: routes.reduce((s, r) => s + r.entries.length, 0),
    unassigned: warnings.filter(w => w.type === 'unassigned').length,
    urgent: routes.reduce((s, r) => s + r.entries.filter(e => e.priority === 'urgent').length, 0),
  }), [routes, warnings]);

  // ─── Actions ─────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!user?.id) return;
    try {
      setGenerating(true);
      const result = await generateCleaningRoutesRequest(user.id, selectedDate);
      setRoutes(result.routes);
      setWarnings(result.warnings);
      if (result.warnings.length > 0) {
        toast.warning(`Rutas generadas con ${result.warnings.length} advertencia(s)`);
      } else {
        toast.success(`${result.routes.length} ruta(s) generada(s) correctamente`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al generar rutas');
    } finally {
      setGenerating(false);
    }
  }, [user?.id, selectedDate]);

  const handleReorder = useCallback(async (routeId: string, entries: RouteEntry[]) => {
    setRoutes(prev => prev.map(r => r._id === routeId ? { ...r, entries } : r));
    if (!user?.id) return;
    try {
      await reorderCleaningRouteRequest(user.id, routeId, entries.map(e => e.serviceId));
    } catch (err: any) {
      toast.error(err.message || 'Error al reordenar');
      loadData();
    }
  }, [user?.id, loadData]);

  const handleReassign = useCallback(async (workerId: string, workerName: string) => {
    if (!user?.id || !reassignRoute) return;
    try {
      setReassignSaving(true);
      const updated = await reassignCleaningRouteRequest(user.id, reassignRoute._id, workerId, workerName);
      setRoutes(prev => prev.map(r => r._id === updated._id ? updated : r));
      setReassignRoute(null);
      toast.success('Ruta reasignada correctamente');
    } catch (err: any) {
      toast.error(err.message || 'Error al reasignar');
    } finally {
      setReassignSaving(false);
    }
  }, [user?.id, reassignRoute]);

  const handleDelete = useCallback(async (route: CleaningRoute) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar la ruta de ${route.workerName}?`)) return;
    try {
      await deleteCleaningRouteRequest(user.id, route._id);
      setRoutes(prev => prev.filter(r => r._id !== route._id));
      toast.success('Ruta eliminada');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar ruta');
    }
  }, [user?.id]);

  const navigateDate = (dir: -1 | 1) => {
    const d = dir === 1 ? addDays(parseISO(selectedDate), 1) : subDays(parseISO(selectedDate), 1);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  };

  const goToday = () => setSelectedDate(new Date().toISOString().slice(0, 10));

  const dateLabel = (() => {
    const d = parseISO(selectedDate);
    if (isToday(d)) return 'Hoy \u00b7 ' + format(d, "EEEE d 'de' MMMM", { locale: es });
    return format(d, "EEEE d 'de' MMMM yyyy", { locale: es });
  })();

  const timelineHours = useMemo(() => Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => TIMELINE_START + i), []);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <Layout title="Planificacion de rutas" subtitle="Organiza y optimiza las rutas de limpieza">
      <div className="flex flex-col gap-5">

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{warnings.length} advertencia(s) en la generacion de rutas</p>
              <ul className="space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">{w.type === 'unassigned' ? <Users className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}</span>
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setWarnings([])} className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shrink-0">
              <X className="w-4 h-4 text-amber-500" />
            </button>
          </div>
        )}

        {/* Date nav + Stats */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => navigateDate(-1)} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="relative">
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer hover:border-cyan-400 transition-colors">
                  <CalendarDays className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{dateLabel}</span>
                </div>
              </div>
              <button onClick={() => navigateDate(1)} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              {!isToday(parseISO(selectedDate)) && (
                <button onClick={goToday} className="px-3 py-2 rounded-xl text-xs font-semibold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors">
                  Hoy
                </button>
              )}
            </div>
            <button onClick={loadData} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors self-start" title="Refrescar">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: <Route className="w-4 h-4 text-cyan-500" />, label: 'Rutas activas', value: stats.activeRoutes, accent: false },
              { icon: <MapPin className="w-4 h-4 text-blue-500" />, label: 'Servicios', value: stats.totalServices, accent: false },
              { icon: <Users className="w-4 h-4 text-amber-500" />, label: 'Sin asignar', value: stats.unassigned, accent: stats.unassigned > 0 },
              { icon: <Zap className="w-4 h-4 text-red-500" />, label: 'Urgentes', value: stats.urgent, accent: stats.urgent > 0 },
            ].map((s, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span></div>
                <span className={`text-2xl font-bold ${
                  s.accent
                    ? s.label === 'Urgentes' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-900 dark:text-white'
                }`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 shrink-0">
            {(['list', 'timeline'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  view === v ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {v === 'list' ? <LayoutList className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                {v === 'list' ? 'Lista' : 'Timeline'}
              </button>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-60 shrink-0"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generar rutas
          </button>

          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <select
              value={workerFilter}
              onChange={e => setWorkerFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">Todos los trabajadores</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            <select
              value={zoneFilter}
              onChange={e => setZoneFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">Todas las zonas</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>

            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente, direccion..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        )}

        {/* Empty state */}
        {!loading && routes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Route className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No hay rutas para este dia</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-sm">
              Genera rutas automaticamente a partir de los servicios programados para el {format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })}.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generar rutas
            </button>
          </div>
        )}

        {/* List view */}
        {!loading && filteredRoutes.length > 0 && view === 'list' && (
          <DndProvider backend={HTML5Backend}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredRoutes.map(route => (
                <RouteCard key={route._id} route={route} onReassign={setReassignRoute} onDelete={handleDelete} onReorder={handleReorder} />
              ))}
            </div>
          </DndProvider>
        )}

        {/* Timeline view */}
        {!loading && filteredRoutes.length > 0 && view === 'timeline' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <div className="w-40 shrink-0 px-4 py-2 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Trabajador</span>
                </div>
                <div className="flex-1 relative h-10">
                  {timelineHours.map(h => (
                    <div key={h} className="absolute top-0 bottom-0 flex items-center" style={{ left: `${((h - TIMELINE_START) / TIMELINE_HOURS) * 100}%` }}>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 -translate-x-1/2 font-medium">{String(h).padStart(2, '0')}:00</span>
                    </div>
                  ))}
                </div>
              </div>

              {filteredRoutes.map(route => (
                <div key={route._id} className="flex border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                  <div className="w-40 shrink-0 px-4 py-3 border-r border-gray-200 dark:border-gray-700 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {getInitials(route.workerName)}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{route.workerName}</span>
                  </div>
                  <div className="flex-1 relative h-14">
                    {timelineHours.map(h => (
                      <div key={h} className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-700/40" style={{ left: `${((h - TIMELINE_START) / TIMELINE_HOURS) * 100}%` }} />
                    ))}
                    {route.entries.map(entry => (
                      <TimelineBlock key={entry.serviceId} entry={entry} onClick={setTimelineDetail} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results after filtering */}
        {!loading && routes.length > 0 && filteredRoutes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Filter className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron rutas con los filtros aplicados.</p>
          </div>
        )}
      </div>

      {/* Reassign modal */}
      {reassignRoute && (
        <ReassignModal route={reassignRoute} workers={workers} onConfirm={handleReassign} onClose={() => setReassignRoute(null)} saving={reassignSaving} />
      )}

      {/* Timeline detail popover */}
      {timelineDetail && (
        <TimelineDetail entry={timelineDetail} onClose={() => setTimelineDetail(null)} />
      )}
    </Layout>
  );
}
