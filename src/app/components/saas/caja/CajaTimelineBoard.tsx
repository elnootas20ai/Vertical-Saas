/**
 * Core — panel Caja estilo timeline (diseño caja-timeline) con colores Vertial.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from 'lucide-react';
import type { PointOfSale, TpvRegisterSession } from '../../../lib/deliveryApi';
import { calcTpvExpectedCash } from '../../../lib/tpvCajaMath';
import {
  buildTpvRegisterSummaryForDay,
  isTpvRegisterSessionFromPriorCalendarDay,
  localCalendarDayKey,
  sessionActiveOnCalendarDay,
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

function statusTag(kind: CajaTimelineBarKind): { text: string; className: string } {
  if (kind === 'live') {
    return { text: 'En curso', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' };
  }
  if (kind === 'warn') {
    return { text: 'Arrastrada', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' };
  }
  return { text: 'Cerrada', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' };
}

function barClass(kind: CajaTimelineBarKind, selected: boolean): string {
  const base =
    'absolute top-0.5 h-[22px] rounded-[5px] cursor-pointer flex items-center px-2 text-[10.5px] font-semibold font-mono whitespace-nowrap overflow-hidden border transition-shadow hover:shadow-sm';
  const sel = selected ? ' outline outline-2 outline-[#030213] dark:outline-zinc-100 outline-offset-1 z-10' : '';
  if (kind === 'live') {
    return `${base}${sel} bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800`;
  }
  if (kind === 'warn') {
    return `${base}${sel} text-amber-800 border-amber-300 dark:text-amber-300 dark:border-amber-700`;
  }
  return `${base}${sel} bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700`;
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
  dayStats: { stores: number; turns: number; openNow: number; sales: number };
  excelClosedCount: number;
  onExcelClick: () => void;
  onBack: () => void;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onForceClose?: (session: TpvRegisterSession) => void;
  forcingSessionId?: string | null;
  onViewFullClosing?: (session: TpvRegisterSession) => void;
  refreshing?: boolean;
  /** Extra actions next to Excel (restaurant: Sala / TPV) */
  headerExtra?: ReactNode;
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
  onBack,
  selectedSessionId,
  onSelectSession,
  onForceClose,
  forcingSessionId,
  onViewFullClosing,
  refreshing,
  headerExtra,
}: CajaTimelineBoardProps) {
  const todayStr = localCalendarDayKey();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [confirmForce, setConfirmForce] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setConfirmForce(false);
  }, [selectedSessionId]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const isToday = selectedDate === todayStr;
  const nowPct = isToday ? minutesToPct(nowMinutesOfDay(now)) : null;
  const nowClock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const daySessions = useMemo(() => {
    let list = sessions.filter((s) => sessionActiveOnCalendarDay(s, selectedDate));
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
  const selectedMoves = selected?.transactions?.slice(-8).reverse() || [];
  const busyForce = forcingSessionId === selected?._id;

  return (
    <div className="min-h-screen bg-[#f3f3f5] dark:bg-zinc-950 text-[#030213] dark:text-zinc-100">
      <div className="max-w-[980px] mx-auto px-4 sm:px-6 py-8 pb-20">
        {/* Head — Volver a la izquierda (mismo patrón que TPV / resto de Vertial) */}
        <div className="flex items-center justify-between flex-wrap gap-3.5 mb-1.5">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver"
              className="w-8 h-8 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-baseline gap-3.5 flex-wrap min-w-0">
              <h1 className="font-mono text-[19px] font-bold uppercase tracking-tight m-0 text-[#030213] dark:text-zinc-50">
                Caja
              </h1>
              <div className="flex flex-wrap gap-4 text-[13px] text-zinc-500 dark:text-zinc-400">
                <span><b className="font-mono font-semibold text-[#030213] dark:text-zinc-100">{dayStats.stores}</b> tiendas</span>
                <span><b className="font-mono font-semibold text-[#030213] dark:text-zinc-100">{dayStats.turns}</b> turnos</span>
                <span><b className="font-mono font-semibold text-[#030213] dark:text-zinc-100">{dayStats.openNow}</b> abiertas</span>
                <span><b className="font-mono font-semibold text-[#030213] dark:text-zinc-100">{Math.round(dayStats.sales)}€</b> ventas</span>
              </div>
              {refreshing && <span className="text-[11px] text-zinc-400">Actualizando…</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {headerExtra}
            <button
              type="button"
              onClick={onExcelClick}
              disabled={excelClosedCount === 0}
              title="Descarga Excel del mes: hoja Modomio + hoja Black Burger (plantilla Uriel)"
              className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Excel ({excelClosedCount})
            </button>
          </div>
        </div>

        {/* Date + legend */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 my-3.5 mb-5">
          <div className="flex items-center gap-2.5 text-[13px] text-zinc-500">
            <button
              type="button"
              onClick={() => onSelectedDateChange(addDaysIso(selectedDate, -1))}
              className="w-[22px] h-[22px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className={`font-semibold ${isToday ? 'text-[#030213] dark:text-zinc-100' : ''}`}>
              {formatDayShort(selectedDate)}
            </span>
            <span className="font-mono text-zinc-600 dark:text-zinc-300">
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES')}
            </span>
            <button
              type="button"
              onClick={() => onSelectedDateChange(addDaysIso(selectedDate, 1))}
              disabled={selectedDate >= todayStr}
              className="w-[22px] h-[22px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 inline-flex items-center justify-center disabled:opacity-40"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => e.target.value && onSelectedDateChange(e.target.value)}
              className="ml-1 text-xs px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="flex gap-4 text-[11.5px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-emerald-700" />
              en curso
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-zinc-400" />
              cerrada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-sm border border-amber-300"
                style={{
                  background: 'repeating-linear-gradient(135deg,#fffbeb,#fffbeb 2px,#fde68a 2px,#fde68a 4px)',
                }}
              />
              arrastrada
            </span>
          </div>
        </div>

        {/* Timeline panel */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-[10px] px-4 sm:px-5 pt-5 pb-2.5 mb-6">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-zinc-400 m-0 mb-4 flex items-center justify-between gap-2">
            <span>Turnos · 00:00 – 24:00</span>
            {isToday && (
              <span className="font-mono font-semibold tracking-normal normal-case text-[#030213] dark:text-zinc-100">
                {nowClock}
              </span>
            )}
          </p>

          {tracks.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-10">Ningún turno este día</p>
          ) : (
            <div className="overflow-x-auto -mx-0.5 px-0.5">
              <div className="min-w-[640px]">
                <div
                  className="grid font-mono text-[10px] text-zinc-400 mb-1.5"
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
                    className="grid items-center min-h-[46px] border-t border-zinc-100 dark:border-zinc-800"
                    style={{ gridTemplateColumns: '120px repeat(24, 1fr)' }}
                  >
                    <div className="pr-2.5">
                      <div className="text-[12.5px] font-semibold truncate">{track.storeName}</div>
                      <div className="text-[10.5px] text-zinc-400 font-mono truncate">{track.subLabel}</div>
                    </div>
                    <div className="relative h-[26px]" style={{ gridColumn: '2 / span 24' }}>
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
                        {HOURS.map((h) => (
                          <div key={h} className="border-l border-zinc-100 dark:border-zinc-800" />
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
                          className="absolute top-[-4px] bottom-[-4px] w-px bg-[#030213] dark:bg-zinc-100 z-[2] pointer-events-none"
                          style={{ left: `${nowPct}%` }}
                        >
                          <span className="absolute top-[-18px] -translate-x-1/2 text-[9.5px] font-mono font-semibold text-[#030213] dark:text-zinc-100">
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

        {/* Detail */}
        {selected && selectedKind && selectedSummary && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-[10px] px-4 sm:px-5 py-4 mb-6">
            <div className="flex justify-between items-start flex-wrap gap-3 mb-3.5">
              <div>
                <div className="text-[15px] font-semibold">
                  {selected.pointOfSaleName || 'Tienda'}
                  <span className="text-zinc-400 font-normal">
                    {' '}· {selectedKind === 'live' ? 'en curso' : selectedKind === 'warn' ? 'arrastrada' : 'cerrada'}
                  </span>
                </div>
                <div className="text-[12.5px] text-zinc-500 font-mono mt-0.5">
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
                    <div className="font-mono text-base font-bold">{formatMoneyEs(selectedSummary.totalSales)}</div>
                    <div className="text-[10.5px] text-zinc-400 uppercase tracking-wide mt-0.5">Total</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-base font-bold">{formatMoneyEs(selectedExpected)}</div>
                    <div className="text-[10.5px] text-zinc-400 uppercase tracking-wide mt-0.5">Efectivo</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar detalle"
                  onClick={() => onSelectSession(null)}
                  className="p-0.5 rounded-md text-zinc-400 hover:text-[#030213] hover:bg-[#f3f3f5] dark:hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {selectedKind === 'warn' && onForceClose && (
              <div
                className={`flex flex-wrap items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3 ${
                  confirmForce
                    ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
              >
                <span className="flex-1 min-w-[200px]">
                  Caja de otro día. Ciérrala y abre un turno de hoy en el TPV.
                </span>
                {!confirmForce ? (
                  <button
                    type="button"
                    disabled={busyForce}
                    onClick={() => setConfirmForce(true)}
                    className="border border-amber-300 bg-white dark:bg-zinc-900 text-amber-800 text-[11.5px] font-semibold px-2.5 py-1 rounded-md"
                  >
                    Forzar cierre
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyForce}
                      onClick={() => onForceClose(selected)}
                      className="border border-red-300 bg-white dark:bg-zinc-900 text-red-800 text-[11.5px] font-semibold px-2.5 py-1 rounded-md disabled:opacity-60"
                    >
                      {busyForce ? 'Cerrando…' : 'Sí, forzar cierre'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmForce(false)}
                      className="border border-zinc-200 text-zinc-500 text-[11.5px] font-medium px-2.5 py-1 rounded-md"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            )}

            {selected.status === 'closed' && onViewFullClosing && (
              <button
                type="button"
                onClick={() => onViewFullClosing(selected)}
                className="text-xs font-medium text-zinc-500 underline mb-3 hover:text-[#030213]"
              >
                Ver cierre completo
              </button>
            )}

            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-zinc-400 m-0 mb-2">
              Movimientos
            </p>
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
              {selectedMoves.length === 0 ? (
                <p className="text-[12.5px] text-zinc-400 text-center py-2.5">Sin movimientos</p>
              ) : (
                selectedMoves.map((t) => (
                  <div key={t.id || `${t.date}-${t.amount}`} className="flex justify-between text-[12.5px] py-1.5 text-zinc-500">
                    <span className="truncate pr-3">
                      {t.type === 'sale' ? 'Venta' : t.type}
                      {t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
                      {t.orderNumber ? ` · #${t.orderNumber}` : ''}
                    </span>
                    <span className="font-mono font-medium text-[#030213] dark:text-zinc-100 shrink-0">
                      {t.amount >= 0 ? '+' : ''}{formatMoneyEs(t.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Table */}
        <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
          <h2 className="text-[13px] font-semibold m-0">Todos los turnos</h2>
          <div className="flex gap-2">
            {pointsOfSale.length > 0 && (
              <select
                value={filterPdv}
                onChange={(e) => onFilterPdvChange(e.target.value)}
                className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 text-zinc-500"
              >
                <option value="">Todas las tiendas</option>
                {pointsOfSale.map((p) => (
                  <option key={p._id} value={p._id}>{p.name || p.code || 'Tienda'}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => onOnlyOpenNowChange(!onlyOpenNow)}
              className={`border rounded-md px-2.5 py-1.5 text-xs cursor-pointer ${
                onlyOpenNow
                  ? 'bg-[#030213] text-white border-[#030213] dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500'
              }`}
            >
              Solo abiertas
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-[10px] overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                {['Estado', 'Tienda', 'Empleado', 'Horario', 'Total', 'Efectivo', 'Diferencia'].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left text-[10.5px] uppercase tracking-wide text-zinc-400 font-semibold px-3.5 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/80 ${
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
                  <td colSpan={7} className="px-3.5 py-8 text-center text-sm text-zinc-400">
                    Sin turnos
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
                          ? 'bg-[#f3f1e9] dark:bg-zinc-800 [&>td:first-child]:shadow-[inset_2px_0_0_#030213] dark:[&>td:first-child]:shadow-[inset_2px_0_0_#fafafa]'
                          : 'hover:bg-[#f3f3f5] dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800">
                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full inline-block ${tag.className}`}>
                          {tag.text}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800">
                        {s.pointOfSaleName || 'Tienda'}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800">
                        <div className="font-medium">{s.workerName}</div>
                        <div className="text-[11px] text-zinc-400">{s.terminalName}</div>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800 font-mono">
                        {timeLabel}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800 text-right font-mono">
                        {formatMoneyEs(summary.totalSales)}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800 text-right font-mono">
                        {formatMoneyEs(expected)}
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] border-b border-zinc-100 dark:border-zinc-800 text-right font-mono">
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
      </div>
    </div>
  );
}
