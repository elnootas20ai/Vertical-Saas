/**
 * Core — panel Caja estilo timeline (diseño caja-timeline) con colores Vertial.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Table2,
} from 'lucide-react';
import type { PointOfSale, TpvRegisterSession } from '../../../lib/deliveryApi';
import { pointOfSaleDisplayLabel } from '../../../lib/deliveryApi';
import type {
  CajaDownloadFormat,
  CajaHistoryRange,
} from '../../../lib/cajaFacturacionExcelExport';
import { sessionCajaListMoney } from '../../../lib/cajaFacturacionExcelExport';
import {
  buildTpvRegisterSummaryForDay,
  isTpvRegisterSessionFromPriorCalendarDay,
  localCalendarDayKey,
  sessionBelongsToCajaDay,
} from '../../../lib/tpvCajaScope';
import {
  buildCajaTimelineTracks,
  formatClock,
  formatMoneyEs,
  minutesToPct,
  nowMinutesOfDay,
  type CajaTimelineBarKind,
} from '../../../lib/cajaTimelineLayout';

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
  dayStats: {
    stores: number;
    turns: number;
    openNow: number;
    sales: number;
    tpv?: number;
    apps?: number;
    cashIn?: number;
    cashOut?: number;
    /** Efectivo retirado en cierres del día (contado − fondo). */
    withdrawn?: number;
    /** Efectivo retirado en cierres del mes del día seleccionado. */
    withdrawnMonth?: number;
  };
  excelClosedCount: number;
  /** Un solo formato (p. ej. restaurant). Preferir onDownloadFormat en delivery. */
  onExcelClick?: () => void | Promise<void>;
  /** Menú Descargar: Excel / Google Sheets / CSV (+ alcance historial). */
  onDownloadFormat?: (
    format: CajaDownloadFormat,
    range?: CajaHistoryRange,
  ) => void | Promise<void>;
  onBack: () => void;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onForceClose?: (session: TpvRegisterSession) => void;
  forcingSessionId?: string | null;
  onViewFullClosing?: (session: TpvRegisterSession) => void;
  refreshing?: boolean;
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
  onForceClose,
  forcingSessionId,
  onViewFullClosing,
  refreshing,
  headerExtra,
  locationNoun = { singular: 'Tienda', plural: 'tiendas', filterAll: 'Todas las tiendas' },
}: CajaTimelineBoardProps) {
  const todayStr = localCalendarDayKey();
  const locSingular = locationNoun.singular;
  const locPlural = locationNoun.plural;
  const locFilterAll = locationNoun.filterAll;
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);

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
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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

  const tableRows = useMemo(() => {
    return [...daySessions].sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (b.status === 'open' && a.status !== 'open') return 1;
      return String(b.openedAt || '').localeCompare(String(a.openedAt || ''));
    });
  }, [daySessions]);

  /** Una tarjeta por tienda: total completo arriba, turnos debajo. */
  const storeSections = useMemo(() => {
    type Section = {
      key: string;
      title: string;
      sessions: TpvRegisterSession[];
      sales: number;
      openCount: number;
      closedCount: number;
    };

    const summarize = (rows: TpvRegisterSession[], title: string, key: string): Section => {
      let sales = 0;
      let openCount = 0;
      let closedCount = 0;
      for (const s of rows) {
        const summary = buildTpvRegisterSummaryForDay(s, selectedDate);
        const money = sessionCajaListMoney(s, selectedDate, summary.totalSales);
        sales += money.total;
        if (s.status === 'open') openCount += 1;
        else closedCount += 1;
      }
      return {
        key,
        title,
        sessions: rows,
        sales,
        openCount,
        closedCount,
      };
    };

    if (tableRows.length === 0) return [] as Section[];

    const byPdv = new Map<string, TpvRegisterSession[]>();
    for (const s of tableRows) {
      const id = String(s.pointOfSaleId || s.pointOfSaleName || '_sin').trim() || '_sin';
      const list = byPdv.get(id) || [];
      list.push(s);
      byPdv.set(id, list);
    }
    const sections: Section[] = [];
    for (const [id, rows] of byPdv) {
      const pdv = pointsOfSale.find((p) => p._id === id);
      const title = pdv
        ? pointOfSaleDisplayLabel(pdv)
        : (rows[0]?.pointOfSaleName || locSingular);
      sections.push(summarize(rows, title, `pdv:${id}`));
    }
    sections.sort((a, b) => {
      if (a.openCount > 0 && b.openCount === 0) return -1;
      if (b.openCount > 0 && a.openCount === 0) return 1;
      return a.title.localeCompare(b.title, 'es');
    });
    return sections;
  }, [tableRows, pointsOfSale, selectedDate, locSingular]);

  const [expandedStores, setExpandedStores] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedStores({});
  }, [selectedDate, filterPdv]);

  const isStoreExpanded = (section: { key: string; openCount: number }) => {
    if (Object.prototype.hasOwnProperty.call(expandedStores, section.key)) {
      return Boolean(expandedStores[section.key]);
    }
    return storeSections.length === 1 || section.openCount > 0;
  };

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
        {/* Head — Volver izq · fecha centro · acciones dcha */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-2 mb-1.5">
          <div className="justify-self-start">
            <button
              type="button"
              onClick={() => onBack?.()}
              aria-label="Volver"
              className="w-8 h-8 shrink-0 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 inline-flex items-center justify-center text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="justify-self-center flex items-center gap-2 flex-wrap min-w-0">
              <div className="flex items-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => onSelectedDateChange(addDaysIso(selectedDate, -1))}
                  aria-label="Día anterior"
                  className="w-6 h-6 rounded-md inline-flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1 text-[12.5px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                  {formatDayShort(selectedDate)}
                  <span className="ml-1.5 font-normal text-stone-400 tabular-nums">
                    {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES')}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onSelectedDateChange(addDaysIso(selectedDate, 1))}
                  disabled={selectedDate >= todayStr}
                  aria-label="Día siguiente"
                  className="w-6 h-6 rounded-md inline-flex items-center justify-center text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => e.target.value && onSelectedDateChange(e.target.value)}
                  aria-label="Elegir fecha"
                  className="ml-0.5 text-xs px-1.5 py-0.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300"
                />
              </div>
              {!isToday ? (
                <button
                  type="button"
                  onClick={() => onSelectedDateChange(todayStr)}
                  className="text-[11px] font-bold text-[var(--v-blue,#2563eb)] hover:underline"
                >
                  Ir a hoy
                </button>
              ) : null}
              {refreshing && <span className="text-[11px] text-stone-400">Actualizando…</span>}
          </div>
          <div className="justify-self-end flex items-center gap-2 flex-wrap">
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
                          range: 'month' as CajaHistoryRange,
                          label: 'Este mes',
                          description: 'Solo el mes del día seleccionado (rápido)',
                          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
                        },
                        {
                          id: 'excel' as const,
                          range: 'year' as CajaHistoryRange,
                          label: 'Este año',
                          description: 'Mes a mes del año + totales',
                          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600/80" />,
                        },
                        {
                          id: 'excel' as const,
                          range: 'all' as CajaHistoryRange,
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

        {/* Resumen del mes (efectivo sacado en cierres) */}
        {typeof dayStats.withdrawnMonth === 'number' ? (
          <div className="my-3 rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-2.5 dark:border-rose-900/40 dark:bg-rose-950/25">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700/80 dark:text-rose-300/80">
                  Retirado este mes
                </p>
                <p className="text-[11px] text-rose-800/70 dark:text-rose-200/70">
                  Contado − fondo dejado en caja (cierres del mes)
                </p>
              </div>
              <p className="text-xl font-black tabular-nums text-rose-800 dark:text-rose-200">
                {formatMoneyEs(dayStats.withdrawnMonth)}
              </p>
            </div>
          </div>
        ) : null}

        {/* KPIs del día seleccionado: Total = TPV + integradores */}
        <div className="my-3.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-8">
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
          <DayStat label="Total del día" value={formatMoneyEs(dayStats.sales)} />
          <DayStat label="TPV" value={formatMoneyEs(dayStats.tpv ?? 0)} />
          <DayStat label="Integradores" value={formatMoneyEs(dayStats.apps || 0)} />
          <DayStat label="Entradas / salidas" value={`${formatMoneyEs(dayStats.cashIn || 0)} / ${formatMoneyEs(dayStats.cashOut || 0)}`} />
          <DayStat label="Se retira (día)" value={formatMoneyEs(dayStats.withdrawn || 0)} />
        </div>

        {/* Filtro de tiendas: Todas / Tienda 1 / Tienda 2… */}
        {pointsOfSale.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
              {locSingular}
            </span>
            <button
              type="button"
              onClick={() => {
                onFilterPdvChange('');
                onSelectSession(null);
              }}
              className={`min-h-9 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors touch-manipulation ${
                !filterPdv
                  ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              {locFilterAll}
            </button>
            {pointsOfSale.map((p) => {
              const id = String(p._id || '').trim();
              if (!id) return null;
              const active = filterPdv === id;
              const label = pointOfSaleDisplayLabel(p) || p.name || p.code || locSingular;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onFilterPdvChange(id);
                    onSelectSession(null);
                  }}
                  title={label}
                  className={`min-h-9 max-w-[14rem] truncate rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors touch-manipulation ${
                    active
                      ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onOnlyOpenNowChange(!onlyOpenNow)}
              className={`ml-auto min-h-9 rounded-xl border px-3 py-1.5 text-xs font-bold touch-manipulation ${
                onlyOpenNow
                  ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                  : 'border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900'
              }`}
            >
              Solo abiertas
            </button>
          </div>
        ) : null}

        {/* Timeline panel */}
        <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl px-4 sm:px-5 pt-4 pb-2.5 mb-6">
          <div className="mb-1 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-stone-400 m-0">
              Turnos por {locSingular.toLowerCase()} · 00:00 – 24:00
              {filterPdv ? (
                <span className="ml-1.5 normal-case tracking-normal text-stone-500">
                  ·{' '}
                  {pointOfSaleDisplayLabel(
                    pointsOfSale.find((p) => p._id === filterPdv) || ({ _id: filterPdv, name: locSingular } as PointOfSale),
                  )}
                </span>
              ) : null}
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
            Cada barra es un turno de caja. Elige una tienda arriba para ver solo su caja; en «{locFilterAll}» ves todas.
          </p>

          {tracks.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-10">Ningún turno este día</p>
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

        {/* Resumen por tienda → turnos */}
        <div className="mb-2.5">
          <h2 className="text-[13px] font-semibold m-0">
            {filterPdv
              ? `Caja · ${pointOfSaleDisplayLabel(pointsOfSale.find((p) => p._id === filterPdv) || ({ _id: filterPdv, name: locSingular } as PointOfSale))}`
              : `Resumen por ${locSingular.toLowerCase()}`}
          </h2>
          <p className="m-0 mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
            Total del turno = TPV + apps. Detalle al abrir el cierre.
          </p>
        </div>

        {storeSections.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-10 text-center text-sm text-stone-400">
            Sin turnos{filterPdv ? ` en esta ${locSingular.toLowerCase()}` : ''}
          </div>
        ) : (
          <div className="space-y-3">
            {storeSections.map((section) => {
              const open = isStoreExpanded(section);
              return (
                <section
                  key={section.key}
                  className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedStores((prev) => ({
                        ...prev,
                        [section.key]: !isStoreExpanded(section),
                      }))
                    }
                    className="w-full text-left px-4 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors"
                  >
                    <div className="min-w-0 flex items-start gap-2.5">
                      <span className="mt-0.5 text-stone-400 shrink-0">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-stone-900 dark:text-stone-50 truncate leading-tight">
                          {section.title}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-stone-500 tabular-nums">
                          {section.sessions.length} turno{section.sessions.length === 1 ? '' : 's'}
                          {section.openCount > 0
                            ? ` · ${section.openCount} en curso`
                            : section.closedCount > 0
                              ? ' · todo cerrado'
                              : ''}
                        </p>
                      </div>
                    </div>
                    <div className="pl-7 sm:pl-0 sm:text-right shrink-0">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Total</p>
                      <p className="text-base font-black tabular-nums text-stone-900 dark:text-stone-50 leading-tight">
                        {formatMoneyEs(section.sales)}
                      </p>
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-stone-100 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
                      {section.sessions.map((s) => {
                        const kind: CajaTimelineBarKind =
                          s.status === 'open' && isTpvRegisterSessionFromPriorCalendarDay(s, now)
                            ? 'warn'
                            : s.status === 'open'
                              ? 'live'
                              : 'closed';
                        const tag = statusTag(kind);
                        const summary = buildTpvRegisterSummaryForDay(s, selectedDate);
                        const money = sessionCajaListMoney(s, selectedDate, summary.totalSales);
                        const active = selectedSessionId === s._id;
                        const busyRow = forcingSessionId === s._id;
                        const timeLabel =
                          kind === 'closed'
                            ? `${formatClock(s.openedAt)} – ${formatClock(s.closedAt)}`
                            : kind === 'warn'
                              ? `desde ${formatClock(s.openedAt)} · ${new Date(s.openedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
                              : `desde ${formatClock(s.openedAt)}`;

                        return (
                          <div
                            key={s._id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              onSelectSession(active ? null : s._id);
                              if (kind === 'closed' && onViewFullClosing) onViewFullClosing(s);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onSelectSession(active ? null : s._id);
                                if (kind === 'closed' && onViewFullClosing) onViewFullClosing(s);
                              }
                            }}
                            className={`px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between cursor-pointer transition-colors ${
                              active
                                ? 'bg-blue-50/70 dark:bg-blue-950/30'
                                : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                            }`}
                          >
                            <div className="min-w-0 flex items-start gap-2.5">
                              <span className={`mt-0.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${tag.className}`}>
                                {tag.text}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-stone-900 dark:text-stone-100 truncate">
                                  {s.workerName || 'Sin empleado'}
                                </p>
                                <p className="text-[11px] text-stone-500 tabular-nums">
                                  {timeLabel}
                                  {s.terminalName ? ` · ${s.terminalName}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 pl-[4.25rem] sm:pl-0 sm:justify-end sm:min-w-[7.5rem]">
                              {kind === 'warn' && onForceClose ? (
                                <button
                                  type="button"
                                  disabled={busyRow}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onForceClose(s);
                                  }}
                                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                >
                                  {busyRow ? '…' : 'Forzar cierre'}
                                </button>
                              ) : null}
                              <div className="text-right tabular-nums">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Total</p>
                                <p className="text-[15px] font-black text-stone-900 dark:text-stone-100 leading-tight">
                                  {formatMoneyEs(money.total)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
