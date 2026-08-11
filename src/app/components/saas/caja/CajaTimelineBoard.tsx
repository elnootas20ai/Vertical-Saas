/**
 * Core — panel Caja estilo timeline (diseño caja-timeline) con colores Vertial.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Table2,
  X,
} from 'lucide-react';
import type { PointOfSale, TpvRegisterSession, TpvRegisterSummary } from '../../../lib/deliveryApi';
import type {
  UrielCajaDownloadFormat,
  UrielCajaHistoryRange,
} from '../../../lib/cajaUrielClosingsExcelExport';
import { calcTpvExpectedCash, sumCashReturns, sumCashStaffConsumption } from '../../../lib/tpvCajaMath';
import {
  buildTpvRegisterSummaryForDay,
  isTpvRegisterSessionFromPriorCalendarDay,
  localCalendarDayKey,
  sessionBelongsToCajaDay,
  sessionWorkDayKey,
} from '../../../lib/tpvCajaScope';
import {
  buildCajaTimelineTracks,
  formatClock,
  formatMoneyEs,
  minutesToPct,
  nowMinutesOfDay,
  type CajaTimelineBarKind,
} from '../../../lib/cajaTimelineLayout';
import { CajaCashMovementsList } from './CajaCashMovementsList';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

/** KPI del día, mismo patrón de tabla densa que los paneles de Dashboard. */
function DayStat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/60 px-2.5 py-1.5 dark:border-stone-800 dark:bg-stone-800/40">
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p
        className={`mt-0.5 text-[15px] font-black tabular-nums leading-tight ${
          good ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-900 dark:text-stone-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  online: 'Online',
  otro: 'Otros',
};

const CHANNEL_LABELS: Record<string, string> = {
  glovo: 'Glovo',
  ubereats: 'Uber Eats',
  uber: 'Uber Eats',
  justeat: 'Just Eat',
  flipdish: 'Flipdish',
  app: 'App',
  web: 'Web',
  phone: 'Teléfono',
  tpv: 'TPV',
  local: 'Local',
};

function channelLabel(key: string): string {
  const k = String(key || '').toLowerCase().trim();
  return CHANNEL_LABELS[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Canal');
}

/** Fila etiqueta → importe del desglose. */
function DetailRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: 'plus' | 'minus' | 'muted';
  strong?: boolean;
}) {
  const valueTone =
    tone === 'plus'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'minus'
        ? 'text-amber-800 dark:text-amber-300'
        : 'text-stone-900 dark:text-stone-100';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-[12px] ${strong ? 'font-semibold text-stone-700 dark:text-stone-200' : 'text-stone-500 dark:text-stone-400'}`}>
        {label}
      </span>
      <span className={`text-[12.5px] font-semibold tabular-nums ${valueTone}`}>{value}</span>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-900/50 p-3 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{title}</p>
      {children}
    </div>
  );
}

/** Desglose completo del turno (métodos, canales, productos y arqueo). */
function CajaTurnBreakdown({
  session,
  summary,
  expected,
  kind,
}: {
  session: TpvRegisterSession;
  summary: TpvRegisterSummary;
  expected: number;
  kind: CajaTimelineBarKind;
}) {
  const methods = Object.entries(summary.salesByMethod || {}).filter(([, v]) => (Number(v) || 0) > 0);

  const channelSource =
    session.aggregatorClosingTotals && Object.keys(session.aggregatorClosingTotals).length > 0
      ? session.aggregatorClosingTotals
      : summary.salesByChannel || {};
  const channels = Object.entries(channelSource)
    .map(([key, v]) => [key, Number(v) || 0] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const food = session.productClosingCounts;
  const hasFood =
    Boolean(food) && ((food?.pizza || 0) + (food?.burger || 0) + (food?.taco || 0)) > 0;

  const cashReturns = sumCashReturns(session);
  const cashStaff = sumCashStaffConsumption(session);
  const isClosed = kind === 'closed';

  return (
    <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <DetailCard title="Ventas por método">
        {methods.length === 0 ? (
          <p className="text-[12px] text-stone-400">Sin ventas registradas</p>
        ) : (
          methods.map(([method, amount]) => (
            <DetailRow
              key={method}
              label={METHOD_LABELS[method] || method}
              value={formatMoneyEs(Number(amount) || 0)}
            />
          ))
        )}
        <div className="border-t border-stone-200 dark:border-stone-700 pt-1.5 space-y-1.5">
          <DetailRow label="Total ventas" value={formatMoneyEs(summary.totalSales)} strong />
          <DetailRow label="Operaciones" value={String(summary.totalTransactions || 0)} tone="muted" />
          <DetailRow label="Ticket medio" value={formatMoneyEs(summary.averageTicket || 0)} tone="muted" />
          {(summary.totalTips || 0) > 0 ? (
            <DetailRow label="Propinas" value={formatMoneyEs(summary.totalTips)} tone="muted" />
          ) : null}
          {(summary.totalReturns || 0) > 0 ? (
            <DetailRow label="Devoluciones" value={formatMoneyEs(summary.totalReturns)} tone="minus" />
          ) : null}
        </div>
      </DetailCard>

      {channels.length > 0 ? (
        <DetailCard title="Canales e integradores">
          {channels.map(([key, amount]) => (
            <DetailRow key={key} label={channelLabel(key)} value={formatMoneyEs(amount)} />
          ))}
          {session.aggregatorClosingTotals && Object.keys(session.aggregatorClosingTotals).length > 0 ? (
            <p className="text-[10px] text-stone-400 pt-0.5">Declarado en el cierre (Caja 2)</p>
          ) : null}
        </DetailCard>
      ) : null}

      {hasFood ? (
        <DetailCard title="Conteo de productos">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold tabular-nums text-stone-900 dark:text-stone-100">
            <span>🍕 Pizzas: {food?.pizza ?? 0}</span>
            <span>🍔 Burgers: {food?.burger ?? 0}</span>
            <span>🌮 Tacos: {food?.taco ?? 0}</span>
          </div>
        </DetailCard>
      ) : null}

      <DetailCard title="Arqueo de efectivo">
        <DetailRow label="Fondo de apertura" value={formatMoneyEs(session.initialCashAmount || 0)} />
        <DetailRow label="+ Cobros en efectivo" value={formatMoneyEs(summary.salesByMethod?.efectivo || 0)} tone="plus" />
        {cashStaff > 0 ? (
          <DetailRow label="+ Consumo equipo (efectivo)" value={formatMoneyEs(cashStaff)} tone="plus" />
        ) : null}
        {(summary.totalCashIn || 0) > 0 ? (
          <DetailRow label="+ Entradas de efectivo" value={formatMoneyEs(summary.totalCashIn)} tone="plus" />
        ) : null}
        {cashReturns > 0 ? (
          <DetailRow label="− Devoluciones efectivo" value={formatMoneyEs(cashReturns)} tone="minus" />
        ) : null}
        {(summary.totalCashOut || 0) > 0 ? (
          <DetailRow label="− Salidas de efectivo" value={formatMoneyEs(summary.totalCashOut)} tone="minus" />
        ) : null}
        <div className="border-t border-stone-200 dark:border-stone-700 pt-1.5 space-y-1.5">
          <DetailRow label={isClosed ? 'Efectivo esperado' : 'En cajón ahora'} value={formatMoneyEs(expected)} strong />
          {isClosed ? (
            <>
              <DetailRow label="Efectivo contado" value={formatMoneyEs(session.finalCashAmount || 0)} strong />
              <DetailRow
                label="Diferencia"
                value={`${(Number(session.difference) || 0) >= 0 ? '+' : ''}${formatMoneyEs(session.difference || 0)}`}
                tone={(Number(session.difference) || 0) === 0 ? 'muted' : (Number(session.difference) || 0) > 0 ? 'plus' : 'minus'}
                strong
              />
            </>
          ) : null}
          {session.nextDayInitialCash != null ? (
            <DetailRow label="Inicial para mañana" value={formatMoneyEs(session.nextDayInitialCash)} tone="muted" />
          ) : null}
        </div>
      </DetailCard>

      {session.closingNotes ? (
        <DetailCard title="Notas del turno">
          <p className="text-[12.5px] text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
            {session.closingNotes}
          </p>
        </DetailCard>
      ) : null}
    </div>
  );
}

function statusTag(kind: CajaTimelineBarKind): { text: string; className: string } {
  if (kind === 'live') {
    return { text: 'En curso', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' };
  }
  if (kind === 'warn') {
    return { text: 'De otro día', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' };
  }
  return { text: 'Cerrada', className: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400' };
}

function barClass(kind: CajaTimelineBarKind, selected: boolean): string {
  const base =
    'absolute top-0.5 h-[22px] rounded-[5px] cursor-pointer flex items-center px-2 text-[10.5px] font-semibold tabular-nums whitespace-nowrap overflow-hidden border transition-shadow hover:shadow-sm';
  const sel = selected ? ' outline outline-2 outline-[var(--v-blue,#2563eb)] dark:outline-blue-400 outline-offset-1 z-10' : '';
  if (kind === 'live') {
    return `${base}${sel} bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800`;
  }
  if (kind === 'warn') {
    return `${base}${sel} text-amber-800 border-amber-300 dark:text-amber-300 dark:border-amber-700`;
  }
  return `${base}${sel} bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700`;
}

export type CajaTimelineBoardProps = {
  sessions: TpvRegisterSession[];
  selectedDate: string;
  onSelectedDateChange: (iso: string) => void;
  pointsOfSale: PointOfSale[];
  filterPdv: string;
  onFilterPdvChange: (id: string) => void;
  onlyOpenNow: boolean;
  onOnlyOpenNowChange: (v: boolean) => void;
  dayStats: { stores: number; turns: number; openNow: number; sales: number; cashIn?: number; cashOut?: number };
  excelClosedCount: number;
  /** Un solo formato (p. ej. restaurant). Preferir onDownloadFormat en delivery. */
  onExcelClick?: () => void | Promise<void>;
  /** Menú Descargar: Excel / Google Sheets / CSV (+ alcance historial). */
  onDownloadFormat?: (
    format: UrielCajaDownloadFormat,
    range?: UrielCajaHistoryRange,
  ) => void | Promise<void>;
  onBack: () => void;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onViewFullClosing?: (session: TpvRegisterSession) => void;
  refreshing?: boolean;
  /** Primera carga del día seleccionado (paginación por día): spinner en vez de "sin turnos". */
  dayLoading?: boolean;
  /** Precarga las cajas de un mes (YYYY-MM) para pintar el calendario. */
  onEnsureMonth?: (ym: string) => void;
  /** Mes (YYYY-MM) que se está cargando para el calendario. */
  monthLoadingYm?: string | null;
  /** Extra actions next to Excel (restaurant: Sala / TPV) */
  headerExtra?: ReactNode;
  /** Etiqueta de PDV en UI (delivery: tienda; restaurant: local). */
  locationNoun?: { singular: string; plural: string; filterAll: string };
};

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localCalendarDayKey(d);
}

// ─── Calendario de días ───────────────────────────────────────────────────────

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function addMonthsYm(ym: string, delta: number): string {
  const d = new Date(`${ym}-01T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelEs(ym: string): string {
  const label = new Date(`${ym}-01T12:00:00`).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Semanas del mes (lunes primero); null = hueco de otro mes. */
function buildMonthGrid(ym: string): Array<Array<string | null>> {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: Array<string | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

type CalendarDayInfo = { turns: number; open: number; sales: number; badDiff: boolean };

function formatDayShort(iso: string): string {
  const today = localCalendarDayKey();
  if (iso === today) return 'Hoy';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function CajaTimelineBoard({
  sessions,
  selectedDate,
  onSelectedDateChange,
  pointsOfSale,
  filterPdv,
  onFilterPdvChange,
  onlyOpenNow,
  onOnlyOpenNowChange,
  dayStats,
  excelClosedCount,
  onExcelClick,
  onDownloadFormat,
  onBack,
  selectedSessionId,
  onSelectSession,
  onViewFullClosing,
  refreshing,
  dayLoading,
  onEnsureMonth,
  monthLoadingYm,
  headerExtra,
  locationNoun = { singular: 'Tienda', plural: 'tiendas', filterAll: 'Todas las tiendas' },
}: CajaTimelineBoardProps) {
  const todayStr = localCalendarDayKey();
  const locSingular = locationNoun.singular;
  const locPlural = locationNoun.plural;
  const locFilterAll = locationNoun.filterAll;
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYm, setCalendarYm] = useState(() => localCalendarDayKey().slice(0, 7));
  const downloadRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!downloadOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [downloadOpen]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [calendarOpen]);

  // Con el calendario abierto, precargar el mes visible (colores + días al instante).
  useEffect(() => {
    if (!calendarOpen) return;
    onEnsureMonth?.(calendarYm);
  }, [calendarOpen, calendarYm, onEnsureMonth]);

  /** Resumen por día del mes visible (turnos, ventas, descuadres, abiertas). */
  const calendarDayInfo = useMemo(() => {
    const map = new Map<string, CalendarDayInfo>();
    if (!calendarOpen) return map;
    for (const s of sessions) {
      if (filterPdv && s.pointOfSaleId !== filterPdv) continue;
      const key = sessionWorkDayKey(s);
      if (!key || !key.startsWith(calendarYm)) continue;
      const info = map.get(key) || { turns: 0, open: 0, sales: 0, badDiff: false };
      info.turns += 1;
      if (s.status === 'open') info.open += 1;
      info.sales += buildTpvRegisterSummaryForDay(s, key).totalSales;
      if (s.status === 'closed' && Math.abs(Number(s.difference) || 0) >= 0.5) info.badDiff = true;
      map.set(key, info);
    }
    return map;
  }, [calendarOpen, calendarYm, sessions, filterPdv]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    const id = window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [selectedSessionId]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const isToday = selectedDate === todayStr;
  const nowPct = isToday ? minutesToPct(nowMinutesOfDay(now)) : null;
  const nowClock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const daySessions = useMemo(() => {
    let list = sessions.filter((s) => sessionBelongsToCajaDay(s, selectedDate));
    if (filterPdv) list = list.filter((s) => s.pointOfSaleId === filterPdv);
    if (onlyOpenNow) list = list.filter((s) => s.status === 'open');
    return list;
  }, [sessions, selectedDate, filterPdv, onlyOpenNow]);

  const tracks = useMemo(
    () => buildCajaTimelineTracks(daySessions, selectedDate, now),
    [daySessions, selectedDate, now],
  );

  const selected = useMemo(
    () => (selectedSessionId ? sessions.find((s) => s._id === selectedSessionId) || null : null),
    [sessions, selectedSessionId],
  );

  const selectedKind: CajaTimelineBarKind | null = selected
    ? selected.status === 'open' && isTpvRegisterSessionFromPriorCalendarDay(selected, now)
      ? 'warn'
      : selected.status === 'open'
        ? 'live'
        : 'closed'
    : null;

  const tableRows = useMemo(() => {
    return [...daySessions].sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (b.status === 'open' && a.status !== 'open') return 1;
      return String(b.openedAt || '').localeCompare(String(a.openedAt || ''));
    });
  }, [daySessions]);

  const selectedSummary = selected ? buildTpvRegisterSummaryForDay(selected, selectedDate) : null;
  const selectedExpected = selected ? calcTpvExpectedCash(selected) : 0;
  const [excelDownloading, setExcelDownloading] = useState(false);

  const runExcelDownload = async (job: () => void | Promise<void>) => {
    if (excelDownloading) return;
    setDownloadOpen(false);
    setExcelDownloading(true);
    try {
      await job();
    } finally {
      setExcelDownloading(false);
    }
  };

  return (
    <div className="text-stone-900 dark:text-stone-100">
      <div className="mx-auto w-full max-w-[1100px] pb-12">
        {/* Head — Volver SOLO a la izquierda (sin flechas de día al lado, que confunde) */}
        <div className="flex items-center justify-between flex-wrap gap-3.5 mb-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => onBack?.()}
              aria-label="Volver"
              className="w-8 h-8 shrink-0 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 inline-flex items-center justify-center text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[15px] font-bold text-stone-900 dark:text-stone-100">Caja</span>
          </div>

          {/* Selector de día — píldora centrada, separada del Volver */}
          <div className="flex items-center gap-2 flex-wrap">
            <div ref={calendarRef} className="relative">
              <div className="flex items-center gap-0.5 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-1.5 py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => onSelectedDateChange(addDaysIso(selectedDate, -1))}
                  aria-label="Día anterior"
                  title="Día anterior"
                  className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {onEnsureMonth ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarOpen) {
                          setCalendarOpen(false);
                          return;
                        }
                        setCalendarYm(selectedDate.slice(0, 7));
                        setCalendarOpen(true);
                      }}
                      aria-label="Abrir calendario"
                      aria-expanded={calendarOpen}
                      title="Elegir día en el calendario"
                      className={`h-9 px-3 rounded-xl inline-flex items-center gap-2 ${
                        calendarOpen
                          ? 'bg-blue-50 dark:bg-blue-950/40'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      <CalendarDays className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
                      <span className="text-[13.5px] font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                        {formatDayShort(selectedDate)}
                      </span>
                      <span className="text-[12px] text-stone-400 tabular-nums whitespace-nowrap">
                        {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES')}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-stone-400 transition-transform ${calendarOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {calendarOpen && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[19.5rem] max-w-[calc(100vw-1.5rem)] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl z-30 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => setCalendarYm(addMonthsYm(calendarYm, -1))}
                            aria-label="Mes anterior"
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-900 dark:text-stone-100">
                            {monthLabelEs(calendarYm)}
                            {monthLoadingYm === calendarYm && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCalendarYm(addMonthsYm(calendarYm, 1))}
                            disabled={calendarYm >= todayStr.slice(0, 7)}
                            aria-label="Mes siguiente"
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 mb-1">
                          {WEEKDAY_HEADERS.map((d, i) => (
                            <span key={`${d}-${i}`} className="text-center text-[9.5px] font-bold uppercase text-stone-400">
                              {d}
                            </span>
                          ))}
                        </div>
                        <div className="space-y-1">
                          {buildMonthGrid(calendarYm).map((week, wi) => (
                            <div key={wi} className="grid grid-cols-7 gap-1">
                              {week.map((key, di) => {
                                if (!key) return <span key={`empty-${di}`} />;
                                const isFuture = key > todayStr;
                                const isSelected = key === selectedDate;
                                const isTodayCell = key === todayStr;
                                const info = calendarDayInfo.get(key);
                                const tone = isSelected
                                  ? 'bg-[var(--v-blue,#2563eb)] text-white'
                                  : isFuture
                                    ? 'text-stone-300 dark:text-stone-600 cursor-default'
                                    : info
                                      ? info.badDiff
                                        ? 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60'
                                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60'
                                      : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800';
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    disabled={isFuture}
                                    onClick={() => {
                                      onSelectedDateChange(key);
                                      setCalendarOpen(false);
                                    }}
                                    title={
                                      info
                                        ? `${info.turns} turno${info.turns === 1 ? '' : 's'} · ${formatMoneyEs(info.sales)}${info.badDiff ? ' · con descuadre' : ''}${info.open > 0 ? ' · caja abierta' : ''}`
                                        : isFuture
                                          ? undefined
                                          : 'Sin turnos'
                                    }
                                    className={`relative h-10 rounded-lg flex flex-col items-center justify-center leading-none ${tone} ${
                                      isTodayCell && !isSelected ? 'ring-1 ring-[var(--v-blue,#2563eb)]' : ''
                                    }`}
                                  >
                                    <span className="text-[12px] font-semibold tabular-nums">{Number(key.slice(8, 10))}</span>
                                    {info && info.sales > 0 ? (
                                      <span className={`mt-0.5 text-[8px] font-medium tabular-nums ${isSelected ? 'text-white/85' : 'opacity-75'}`}>
                                        {Math.round(info.sales).toLocaleString('es-ES')}€
                                      </span>
                                    ) : null}
                                    {info && info.open > 0 ? (
                                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-800 text-[9.5px] text-stone-500">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-emerald-100 border border-emerald-300" />
                            Día cuadrado
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-red-100 border border-red-300" />
                            Con descuadre
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Caja abierta
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <span className="px-2 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                      {formatDayShort(selectedDate)}
                      <span className="ml-1.5 font-normal text-stone-400 tabular-nums">
                        {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES')}
                      </span>
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      max={todayStr}
                      onChange={(e) => e.target.value && onSelectedDateChange(e.target.value)}
                      aria-label="Elegir fecha"
                      className="text-xs px-1.5 py-0.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onSelectedDateChange(addDaysIso(selectedDate, 1))}
                  disabled={selectedDate >= todayStr}
                  aria-label="Día siguiente"
                  title="Día siguiente"
                  className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {!isToday ? (
              <button
                type="button"
                onClick={() => onSelectedDateChange(todayStr)}
                className="h-9 px-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-[12px] font-bold text-[var(--v-blue,#2563eb)] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60"
              >
                Ir a hoy
              </button>
            ) : null}
            {refreshing && <span className="text-[11px] text-stone-400">Actualizando…</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {headerExtra}
            {onDownloadFormat ? (
              <div ref={downloadRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (excelDownloading) return;
                    setDownloadOpen((v) => !v);
                  }}
                  disabled={excelDownloading}
                  aria-busy={excelDownloading}
                  title={
                    excelDownloading
                      ? 'Cargando facturación mes a mes…'
                      : 'Descargar Excel de Facturación (por defecto: este mes)'
                  }
                  className={`inline-flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-[12.5px] font-medium disabled:cursor-wait ${
                    excelDownloading
                      ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}
                >
                  {excelDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {excelDownloading ? 'Descargando…' : 'Facturación'}
                  {!excelDownloading && excelClosedCount > 0 ? (
                    <span className="text-stone-400">({excelClosedCount})</span>
                  ) : null}
                  {!excelDownloading ? (
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${downloadOpen ? 'rotate-180' : ''}`} />
                  ) : null}
                </button>
                {downloadOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDownloadOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-[19rem] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl overflow-hidden z-20">
                      <div className="px-3.5 py-2 border-b border-stone-100 dark:border-stone-800 space-y-1">
                        <p className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                          Facturación · Excel
                        </p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-snug">
                          Se carga mes a mes. Empieza por este mes; año/historial van por trozos.
                        </p>
                      </div>
                      {([
                        {
                          id: 'excel' as const,
                          range: 'month' as UrielCajaHistoryRange,
                          label: 'Este mes',
                          description: 'Solo el mes del día seleccionado (rápido)',
                          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
                        },
                        {
                          id: 'excel' as const,
                          range: 'year' as UrielCajaHistoryRange,
                          label: 'Este año',
                          description: 'Mes a mes del año + totales',
                          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600/80" />,
                        },
                        {
                          id: 'excel' as const,
                          range: 'all' as UrielCajaHistoryRange,
                          label: 'Historial (por meses)',
                          description: 'Hasta ~3 años, cargando mes a mes (no de golpe)',
                          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600/60" />,
                        },
                      ]).map((opt) => (
                        <button
                          key={`excel-${opt.range}`}
                          type="button"
                          disabled={excelDownloading}
                          onClick={() => {
                            void runExcelDownload(() => onDownloadFormat(opt.id, opt.range));
                          }}
                          className="w-full px-3.5 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 text-left transition-colors flex items-start gap-2.5 border-b border-stone-100 dark:border-stone-800 disabled:opacity-50"
                        >
                          <div className="mt-0.5 shrink-0">{opt.icon}</div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[13px] text-stone-900 dark:text-stone-100">
                              {opt.label}
                              {opt.range === 'month' ? (
                                <span className="ml-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                  por defecto
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">{opt.description}</p>
                          </div>
                        </button>
                      ))}
                      <div className="px-3.5 py-2 border-b border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                          Otros formatos (este mes)
                        </p>
                      </div>
                      {([
                        {
                          id: 'google-sheets' as const,
                          label: 'Google Sheets',
                          description: 'Mismo .xlsx del mes: súbelo a Drive y ábrelo con Hojas',
                          icon: <Table2 className="w-4 h-4 text-green-600" />,
                        },
                        {
                          id: 'csv' as const,
                          label: 'CSV (ZIP)',
                          description: 'Una hoja por archivo CSV del mes',
                          icon: <Download className="w-4 h-4 text-sky-600" />,
                        },
                      ]).map((opt, i, arr) => (
                        <div key={opt.id}>
                          <button
                            type="button"
                            disabled={excelDownloading}
                            onClick={() => {
                              void runExcelDownload(() => onDownloadFormat(opt.id, 'month'));
                            }}
                            className="w-full px-3.5 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 text-left transition-colors flex items-start gap-2.5 disabled:opacity-50"
                          >
                            <div className="mt-0.5 shrink-0">{opt.icon}</div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[13px] text-stone-900 dark:text-stone-100">{opt.label}</p>
                              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">{opt.description}</p>
                            </div>
                          </button>
                          {i < arr.length - 1 && <div className="border-t border-stone-100 dark:border-stone-800" />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!onExcelClick) return;
                  void runExcelDownload(() => onExcelClick());
                }}
                disabled={excelClosedCount === 0 || !onExcelClick || excelDownloading}
                title={excelDownloading ? 'Generando Excel…' : 'Descargar informe del mes'}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-[12.5px] font-medium disabled:opacity-40 ${
                  excelDownloading
                    ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                {excelDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {excelDownloading ? 'Descargando…' : `Descargar (${excelClosedCount})`}
              </button>
            )}
          </div>
        </div>

        {excelDownloading ? (
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-30 mb-3 mt-2 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-900 shadow-sm dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
          >
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Descargando Excel de facturación…</p>
              <p className="text-[11px] text-blue-800/80 dark:text-blue-200/80 mt-0.5">
                Puede tardar un poco con mucho historial. No cierres la página.
              </p>
            </div>
          </div>
        ) : null}

        {/* KPIs del día seleccionado */}
        <div className="my-3.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
          <DayStat
            label={locPlural.charAt(0).toUpperCase() + locPlural.slice(1)}
            value={String(dayStats.stores)}
          />
          <DayStat label="Turnos de caja" value={String(dayStats.turns)} />
          <DayStat
            label="Abiertas ahora"
            value={String(dayStats.openNow)}
            good={dayStats.openNow > 0}
          />
          <DayStat label="Ventas del día" value={formatMoneyEs(dayStats.sales)} />
          <DayStat label="Entradas" value={formatMoneyEs(dayStats.cashIn || 0)} />
          <DayStat label="Salidas" value={formatMoneyEs(dayStats.cashOut || 0)} />
        </div>

        {/* Timeline panel */}
        <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl px-4 sm:px-5 pt-4 pb-2.5 mb-6">
          <div className="mb-1 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-stone-400 m-0">
              Turnos por {locSingular.toLowerCase()} · 00:00 – 24:00
            </p>
            <div className="flex items-center gap-3 text-[10.5px] text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-600" />
                En curso
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-stone-400" />
                Cerrada
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-sm border border-amber-300"
                  style={{
                    background: 'repeating-linear-gradient(135deg,#fffbeb,#fffbeb 2px,#fde68a 2px,#fde68a 4px)',
                  }}
                />
                De otro día
              </span>
              {isToday && (
                <span className="tabular-nums font-semibold text-stone-900 dark:text-stone-100">
                  {nowClock}
                </span>
              )}
            </div>
          </div>
          <p className="m-0 mb-4 text-[10px] text-stone-400">
            Cada barra es un turno de caja: empieza al abrir y termina al cerrar. Toca una barra para ver su detalle y movimientos.
          </p>

          {tracks.length === 0 ? (
            dayLoading ? (
              <p className="flex items-center justify-center gap-2 text-sm text-stone-400 text-center py-10">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando turnos del día…
              </p>
            ) : (
              <p className="text-sm text-stone-400 text-center py-10">Ningún turno este día</p>
            )
          ) : (
            <div className="overflow-x-auto -mx-0.5 px-0.5">
              <div className="min-w-[640px]">
                <div
                  className="grid tabular-nums text-[10px] text-stone-400 mb-1.5"
                  style={{ gridTemplateColumns: '120px repeat(24, 1fr)' }}
                >
                  <span />
                  {HOURS.map((h) => (
                    <span key={h} className="border-l border-transparent pl-0.5 hidden sm:inline odd:inline">
                      {h}
                    </span>
                  ))}
                </div>

                {tracks.map((track) => (
                  <div
                    key={track.pdvId}
                    className="grid items-center min-h-[46px] border-t border-stone-100 dark:border-stone-800"
                    style={{ gridTemplateColumns: '120px repeat(24, 1fr)' }}
                  >
                    <div className="pr-2.5">
                      <div className="text-[12.5px] font-semibold truncate">{track.storeName}</div>
                      <div className="text-[10.5px] text-stone-400 tabular-nums truncate">{track.subLabel}</div>
                    </div>
                    <div className="relative h-[26px]" style={{ gridColumn: '2 / span 24' }}>
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
                        {HOURS.map((h) => (
                          <div key={h} className="border-l border-stone-100 dark:border-stone-800" />
                        ))}
                      </div>
                      {track.bars.map((bar) => (
                        <button
                          key={bar.sessionId}
                          type="button"
                          title={bar.title}
                          aria-label={bar.title}
                          onClick={() => onSelectSession(bar.sessionId === selectedSessionId ? null : bar.sessionId)}
                          className={barClass(bar.kind, bar.sessionId === selectedSessionId)}
                          style={{
                            left: `${bar.leftPct}%`,
                            width: `${bar.widthPct}%`,
                            ...(bar.kind === 'warn'
                              ? {
                                  background:
                                    'repeating-linear-gradient(135deg,#fffbeb,#fffbeb 6px,#fde68a 6px,#fde68a 12px)',
                                }
                              : undefined),
                          }}
                        >
                          {bar.kind === 'live' && bar.sessionId === selectedSessionId && (
                            <span className="inline-block w-[5px] h-[5px] rounded-full bg-emerald-700 mr-1 shrink-0 animate-pulse" />
                          )}
                          {bar.label}
                        </button>
                      ))}
                      {nowPct != null && (
                        <div
                          className="absolute top-[-4px] bottom-[-4px] w-px bg-[var(--v-blue,#2563eb)] dark:bg-blue-400 z-[2] pointer-events-none"
                          style={{ left: `${nowPct}%` }}
                        >
                          <span className="absolute top-[-18px] -translate-x-1/2 text-[9.5px] font-semibold text-[var(--v-blue,#2563eb)] dark:text-blue-400">
                            ahora
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Table */}
        <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
          <h2 className="text-[13px] font-semibold m-0">Todos los turnos</h2>
          <div className="flex gap-2">
            {pointsOfSale.length > 0 && (
              <select
                value={filterPdv}
                onChange={(e) => onFilterPdvChange(e.target.value)}
                className="border border-stone-200 dark:border-stone-700 rounded-md px-2.5 py-1.5 text-xs bg-white dark:bg-stone-900 text-stone-500"
              >
                <option value="">{locFilterAll}</option>
                {pointsOfSale.map((p) => (
                  <option key={p._id} value={p._id}>{p.name || p.code || locSingular}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => onOnlyOpenNowChange(!onlyOpenNow)}
              className={`border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${
                onlyOpenNow
                  ? 'bg-[var(--v-blue,#2563eb)] text-white border-[var(--v-blue,#2563eb)]'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500'
              }`}
            >
              Solo abiertas
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                {['Estado', locSingular, 'Empleado', 'Horario', 'Total', 'Efectivo', 'Diferencia'].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left text-[10.5px] uppercase tracking-wide text-stone-400 font-semibold px-3.5 py-2.5 border-b border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800/80 ${
                      i >= 4 ? 'text-right' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-8 text-center text-sm text-stone-400">
                    {dayLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cargando turnos…
                      </span>
                    ) : (
                      'Sin turnos'
                    )}
                  </td>
                </tr>
              ) : (
                tableRows.map((s) => {
                  const kind: CajaTimelineBarKind =
                    s.status === 'open' && isTpvRegisterSessionFromPriorCalendarDay(s, now)
                      ? 'warn'
                      : s.status === 'open'
                        ? 'live'
                        : 'closed';
                  const tag = statusTag(kind);
                  const summary = buildTpvRegisterSummaryForDay(s, selectedDate);
                  const expected = calcTpvExpectedCash(s);
                  const active = selectedSessionId === s._id;
                  const timeLabel =
                    kind === 'closed'
                      ? `${formatClock(s.openedAt)} – ${formatClock(s.closedAt)}`
                      : kind === 'warn'
                        ? `desde ${formatClock(s.openedAt)} · ${new Date(s.openedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
                        : `desde ${formatClock(s.openedAt)}`;

                  return (
                    <tr
                      key={s._id}
                      tabIndex={0}
                      onClick={() => onSelectSession(active ? null : s._id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSelectSession(active ? null : s._id);
                      }}
                      className={`cursor-pointer ${
                        active
                          ? 'bg-blue-50/70 dark:bg-blue-950/30 [&>td:first-child]:shadow-[inset_2px_0_0_#2563eb]'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800">
                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full inline-block ${tag.className}`}>
                          {tag.text}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800">
                        {s.pointOfSaleName || locSingular}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800">
                        <div className="font-medium">{s.workerName}</div>
                        <div className="text-[11px] text-stone-400">{s.terminalName}</div>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800 tabular-nums">
                        {timeLabel}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800 text-right tabular-nums">
                        {formatMoneyEs(summary.totalSales)}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800 text-right tabular-nums">
                        {formatMoneyEs(expected)}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-stone-100 dark:border-stone-800 text-right tabular-nums">
                        {s.status === 'closed' ? (
                          <span className={s.difference >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                            {s.difference >= 0 ? '+' : ''}{formatMoneyEs(s.difference)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Detalle debajo de la tabla: al click se ve al momento */}
        {selected && selectedKind && selectedSummary && (
          <section
            ref={detailRef}
            data-caja-turn={selected._id}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl px-4 sm:px-5 py-4 mt-4"
          >
            <div className="flex justify-between items-start flex-wrap gap-3 mb-3.5">
              <div>
                <div className="text-[15px] font-semibold">
                  {selected.pointOfSaleName || locSingular}
                  <span className="text-stone-400 font-normal">
                    {' '}· {selectedKind === 'live' ? 'en curso' : selectedKind === 'warn' ? 'caja de otro día' : 'cerrada'}
                  </span>
                </div>
                <div className="text-[12.5px] text-stone-500 tabular-nums mt-0.5">
                  {selected.workerName} · {selected.terminalName} ·{' '}
                  {selectedKind === 'closed'
                    ? `${formatClock(selected.openedAt)} – ${formatClock(selected.closedAt)}`
                    : `desde ${formatClock(selected.openedAt)}${
                        selectedKind === 'warn'
                          ? ` · ${new Date(selected.openedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
                          : ''
                      }`}
                </div>
              </div>
              <div className="flex items-start gap-3.5">
                <div className="flex gap-6">
                  <div className="text-right">
                    <div className="tabular-nums text-base font-bold">{formatMoneyEs(selectedSummary.totalSales)}</div>
                    <div className="text-[10.5px] text-stone-400 uppercase tracking-wide mt-0.5">Total</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums text-base font-bold">{formatMoneyEs(selectedExpected)}</div>
                    <div className="text-[10.5px] text-stone-400 uppercase tracking-wide mt-0.5">Efectivo</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatMoneyEs(selectedSummary.totalCashIn)}
                    </div>
                    <div className="text-[10.5px] text-stone-400 uppercase tracking-wide mt-0.5">Entradas</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums text-base font-bold text-amber-800 dark:text-amber-300">
                      {formatMoneyEs(selectedSummary.totalCashOut)}
                    </div>
                    <div className="text-[10.5px] text-stone-400 uppercase tracking-wide mt-0.5">Salidas</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar detalle"
                  onClick={() => onSelectSession(null)}
                  className="p-0.5 rounded-md text-stone-400 hover:text-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {selectedKind === 'warn' && (
              <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="flex-1 min-w-[200px]">
                  Caja de otro día. Ciérrala y abre un turno de hoy en el TPV.
                </span>
              </div>
            )}

            {selected.status === 'closed' && onViewFullClosing && (
              <button
                type="button"
                onClick={() => onViewFullClosing(selected)}
                className="text-xs font-medium text-stone-500 underline mb-3 hover:text-stone-900"
              >
                Ver cierre completo
              </button>
            )}

            <CajaTurnBreakdown
              session={selected}
              summary={selectedSummary}
              expected={selectedExpected}
              kind={selectedKind}
            />

            <CajaCashMovementsList
              session={selected}
              dayKey={selectedDate}
              compact
              title="Entradas y salidas"
            />
          </section>
        )}
      </div>
    </div>
  );
}
