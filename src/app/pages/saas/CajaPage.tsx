import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  listCajaBootstrapRequest,
  updateTpvRegisterSessionRequest,
  filterDeliveryOrdersRequest,
  type TpvRegisterSession,
  type TpvRegisterSummary,
  type PointOfSale,
  type DriverCashSession,
  type TpvIncident,
  type DeliveryOrder,
} from '../../lib/deliveryApi';
import {
  Banknote, CreditCard, Phone as PhoneIcon, Wifi, User, Monitor,
  Store, Clock, BarChart3, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter, Calendar, Eye,
  MessageSquare, TrendingUp, TrendingDown, Hash,
  Truck, MapPin,
  ArrowLeft, Plug, History, ShoppingBag, Radio, Lock,
} from 'lucide-react';
import {
  buildDailyAggregatorRows,
  getClosingAggregatorPlatforms,
} from '../../lib/deliveryIntegrationsUi';
import { AggregatorCashSummary } from '../../components/saas/AggregatorCashSummary';
import { CajaTimelineBoard } from '../../components/saas/caja/CajaTimelineBoard';
import { downloadAccumulatedCajaClosingsExcel } from '../../lib/cajaClosingsExcelExport';
import { RegisterClosingDetailPanel } from '../../components/saas/RegisterClosingDetailPanel';
import { calcTpvExpectedCash, buildTpvRegisterSummary } from '../../lib/tpvCajaMath';
import {
  buildTpvRegisterSummaryForDay,
  dedupeOpenRegisterSessions,
  isLocalCalendarDay,
  isTpvRegisterSessionFromPriorCalendarDay,
  localCalendarDayKey,
  localDayBoundsForKey,
  sessionActiveOnCalendarDay,
  sortRegisterSessionsForDisplay,
} from '../../lib/tpvCajaScope';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_BADGES: Record<string, { icon: typeof Banknote; color: string; label: string }> = {
  efectivo: { icon: Banknote, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Efectivo' },
  tarjeta: { icon: CreditCard, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Tarjeta' },
  bizum: { icon: PhoneIcon, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'Bizum' },
  online: { icon: Wifi, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', label: 'Online' },
};

const TPV_TX_LABELS: Record<string, string> = {
  sale: 'Venta',
  return: 'Devolución',
  cash_in: 'Entrada',
  cash_out: 'Salida',
  expense: 'Gasto',
  tip: 'Propina',
};

function todayIsoDate(): string {
  return localCalendarDayKey();
}

function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localCalendarDayKey(d);
}

function formatDayHeading(isoDate: string): string {
  const today = todayIsoDate();
  if (isoDate === today) return 'Hoy';
  if (isoDate === addDaysIso(today, -1)) return 'Ayer';
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function sessionOnDate(session: TpvRegisterSession, isoDate: string): boolean {
  return sessionActiveOnCalendarDay(session, isoDate);
}

function isAutoValidatedEmptyTurn(session: TpvRegisterSession): boolean {
  if (session.status !== 'closed' || session.closingValidationStatus !== 'validated') return false;
  const sales = session.transactions?.filter((t) => t.type === 'sale').length || 0;
  return sales === 0 && Math.abs(session.difference || 0) < 0.01;
}

function sessionStatusLabel(session: TpvRegisterSession): { text: string; className: string } {
  if (session.status === 'open') {
    return { text: 'Abierta', className: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' };
  }
  if (session.closingValidationStatus === 'rejected') {
    return { text: 'Rechazada', className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' };
  }
  return { text: 'Cerrada', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
}

interface StoreDayGroup {
  pdvId: string;
  storeName: string;
  sessions: TpvRegisterSession[];
  openCount: number;
  totalSales: number;
}

function groupSessionsByStore(
  daySessions: TpvRegisterSession[],
  pointsOfSale: PointOfSale[],
  selectedDate: string,
  options?: { excludeOpen?: boolean },
): StoreDayGroup[] {
  const filtered = options?.excludeOpen
    ? daySessions.filter((s) => s.status !== 'open')
    : daySessions;

  const byPdv = new Map<string, TpvRegisterSession[]>();
  for (const s of filtered) {
    const id = String(s.pointOfSaleId || '_sin_tienda').trim();
    const list = byPdv.get(id) || [];
    list.push(s);
    byPdv.set(id, list);
  }

  const groups: StoreDayGroup[] = [];
  for (const [pdvId, rawSessions] of byPdv) {
    const pdv = pointsOfSale.find((p) => p._id === pdvId);
    const storeName = pdv?.name || rawSessions[0]?.pointOfSaleName || 'Tienda';
    const sessions = sortRegisterSessionsForDisplay(rawSessions);
    const openCount = sessions.filter((s) => s.status === 'open').length;
    const totalSales = sessions.reduce((sum, s) => sum + buildTpvRegisterSummaryForDay(s, selectedDate).totalSales, 0);
    groups.push({ pdvId, storeName, sessions, openCount, totalSales });
  }

  return groups.sort((a, b) => {
    if (a.openCount !== b.openCount) return b.openCount - a.openCount;
    if (a.totalSales !== b.totalSales) return b.totalSales - a.totalSales;
    return a.storeName.localeCompare(b.storeName, 'es');
  });
}

function last7Days(): string[] {
  const today = todayIsoDate();
  return Array.from({ length: 7 }, (_, i) => addDaysIso(today, -6 + i)  );
}

// ─── Vista por tienda / turno ───────────────────────────────────────────────

function turnAccentClass(session: TpvRegisterSession): string {
  if (session.status === 'open') return 'border-l-gray-900 dark:border-l-gray-100';
  if (session.closingValidationStatus === 'rejected') return 'border-l-red-500';
  return 'border-l-transparent';
}

function turnBadgeClass(session: TpvRegisterSession): string {
  if (session.status === 'open') return 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900';
  if (session.closingValidationStatus === 'rejected') return 'bg-red-600 text-white';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
}

function OpenRegisterHero({
  sessions,
  selectedDate,
  expandedSessionId,
  onToggleSession,
  onViewClosing,
  onForceClose,
  forcingSessionId,
}: {
  sessions: TpvRegisterSession[];
  selectedDate: string;
  expandedSessionId: string | null;
  onToggleSession: (id: string) => void;
  onViewClosing: (session: TpvRegisterSession) => void;
  onForceClose?: (session: TpvRegisterSession) => void;
  forcingSessionId?: string | null;
}) {
  if (sessions.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Abiertas ahora</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {sessions.length === 1
              ? '1 turno activo'
              : `${sessions.length} turnos activos`}
          </p>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {sessions.map((session) => {
          const summary = buildTpvRegisterSummaryForDay(session, selectedDate);
          const expected = calcTpvExpectedCash(session);
          const expanded = expandedSessionId === session._id;
          const openedTime = new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' });
          const stale = isTpvRegisterSessionFromPriorCalendarDay(session);
          const openedDay = new Date(session.openedAt).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
          });
          const busy = forcingSessionId === session._id;

          return (
            <div key={session._id} data-caja-turn={session._id}>
              <button
                type="button"
                onClick={() => onToggleSession(session._id)}
                className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {session.pointOfSaleName || 'Tienda'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {session.workerName} · {session.terminalName} · desde {openedTime}
                    {stale ? ` · del ${openedDay}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {summary.totalSales.toFixed(2)}€
                  </div>
                  <div className="text-[11px] text-gray-400 tabular-nums">Efectivo {expected.toFixed(2)}€</div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              {(stale || expanded) && onForceClose && (
                <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
                  {stale && (
                    <p className="w-full text-xs text-gray-600 dark:text-gray-400">
                      Caja de otro día. Ciérrala y abre un turno de hoy en el TPV.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onForceClose(session);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {busy ? 'Cerrando…' : 'Forzar cierre'}
                  </button>
                </div>
              )}
              {expanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <RegisterCard session={session} onViewClosing={onViewClosing} detailOnly />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StoreDayBlock({
  group,
  selectedDate,
  expandedSessionId,
  onToggleSession,
  onViewClosing,
}: {
  group: StoreDayGroup;
  selectedDate: string;
  expandedSessionId: string | null;
  onToggleSession: (id: string) => void;
  onViewClosing: (session: TpvRegisterSession) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{group.storeName}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {group.sessions.length === 0
            ? 'Sin turnos cerrados'
            : `${group.sessions.length} turno${group.sessions.length > 1 ? 's' : ''}`}
          {group.totalSales > 0 ? ` · ${group.totalSales.toFixed(2)}€` : ''}
        </p>
      </div>

      {group.sessions.length === 0 ? null : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {group.sessions.map((session, turnIndex) => {
            const summary = buildTpvRegisterSummaryForDay(session, selectedDate);
            const status = sessionStatusLabel(session);
            const expanded = expandedSessionId === session._id;
            const turnNumber = turnIndex + 1;
            const emptyAuto = isAutoValidatedEmptyTurn(session);
            const timeRange = `${new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}${session.closedAt ? ` – ${new Date(session.closedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}` : ' – …'}`;
            const diffLabel = session.status === 'closed'
              ? `${session.difference >= 0 ? '+' : ''}${session.difference.toFixed(2)}€`
              : `${calcTpvExpectedCash(session).toFixed(2)}€ ef.`;

            return (
              <div
                key={session._id}
                data-caja-turn={session._id}
                className={`border-l-2 ${turnAccentClass(session)}`}
              >
                {expanded ? (
                  <>
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          Turno {turnNumber} · {session.workerName}
                        </p>
                        <p className="text-[11px] text-gray-500 font-mono tabular-nums">{timeRange}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleSession(session._id)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                        Cerrar
                      </button>
                    </div>
                    <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-700">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${status.className}`}>
                        {status.text}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {summary.totalSales.toFixed(2)}€
                      </span>
                      <span className="text-xs text-gray-500">
                        {summary.totalTransactions} mov. · {session.terminalName}
                      </span>
                    </div>
                    <div className="p-4">
                      <RegisterCard session={session} onViewClosing={onViewClosing} detailOnly />
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleSession(session._id)}
                    aria-expanded={false}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold tabular-nums ${turnBadgeClass(session)}`}
                      >
                        {turnNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-mono tabular-nums text-gray-500">{timeRange}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${status.className}`}>
                            {status.text}
                          </span>
                          {emptyAuto && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-500">
                              Sin ventas
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                          {session.workerName}
                          <span className="text-gray-400"> · {session.terminalName}</span>
                        </p>
                      </div>
                      <div className="hidden sm:block text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {summary.totalSales.toFixed(2)}€
                        </div>
                        <div className={`text-[10px] tabular-nums ${session.status === 'closed' && session.difference !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {session.status === 'closed' ? `Dif. ${diffLabel}` : diffLabel}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-gray-500 inline-flex items-center gap-1">
                        Detalle <ChevronDown className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Open Register Card ──────────────────────────────────────────────────────

function RegisterCard({
  session,
  isDriver = false,
  onViewClosing,
  defaultExpanded = false,
  detailOnly = false,
}: {
  session: TpvRegisterSession | DriverCashSession;
  isDriver?: boolean;
  onViewClosing?: (session: TpvRegisterSession) => void;
  defaultExpanded?: boolean;
  detailOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || detailOnly);

  if (isDriver) {
    const ds = session as DriverCashSession;
    const expected = ds.initialFloat + (ds.transactions?.reduce((s, t) => s + (t.type === 'collection' ? t.amount : -t.amount), 0) || 0);
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {ds.driverName}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ds.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{ds.status === 'open' ? 'Abierta' : 'Cerrada'}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <span>Flotante: {ds.initialFloat.toFixed(2)}€</span>
                <span>·</span>
                <span>Esperado: {expected.toFixed(2)}€</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const ts = session as TpvRegisterSession;
  const expected = calcTpvExpectedCash(ts);
  const summary = buildTpvRegisterSummary(ts);
  const incidentCount = ts.incidents?.filter(i => !i.resolvedAt).length || 0;
  const lastCount = ts.cashCounts[ts.cashCounts.length - 1];
  const accentBorder =
    ts.status === 'open'
      ? 'border-l-emerald-500'
      : ts.closingValidationStatus === 'rejected'
        ? 'border-l-red-400'
        : 'border-l-slate-300 dark:border-l-slate-600';

  const detailBody = (
    <div className="space-y-4">
      {ts.status === 'closed' ? (
        <>
          <RegisterClosingDetailPanel session={ts} />
          {onViewClosing && (
            <button
              type="button"
              onClick={() => onViewClosing(ts)}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 underline"
            >
              Abrir cierre en pantalla completa
            </button>
          )}
        </>
      ) : (
        <>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Movimientos</h4>
            <div className="space-y-1">
              {ts.transactions.slice(-15).reverse().map(tx => (
                <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400 w-10 shrink-0">{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${tx.type === 'sale' ? 'bg-green-100 text-green-700' : tx.type === 'return' || tx.type === 'cash_out' ? 'bg-red-100 text-red-700' : tx.type === 'cash_in' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{TPV_TX_LABELS[tx.type] || tx.type}</span>
                    <span className="text-gray-600 dark:text-gray-400 truncate">{tx.description || tx.orderNumber || '—'}</span>
                  </div>
                  <span className={`font-semibold shrink-0 ml-2 ${tx.type === 'return' || tx.type === 'cash_out' || tx.type === 'expense' ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                    {tx.type === 'return' || tx.type === 'cash_out' || tx.type === 'expense' ? '-' : '+'}{tx.amount.toFixed(2)}€
                  </span>
                </div>
              ))}
              {ts.transactions.length === 0 && <div className="text-xs text-gray-400 text-center py-4">Sin movimientos</div>}
            </div>
          </div>
          {(ts.incidents?.length || 0) > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Incidencias</h4>
              {ts.incidents.map(inc => (
                <div key={inc.id} className="text-xs p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg mb-1">{inc.description}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (detailOnly) {
    return <div className="pt-1">{detailBody}</div>;
  }

  return (
    <div className={`bg-white dark:bg-gray-800/95 rounded-xl border border-gray-200 dark:border-gray-700 border-l-[4px] ${accentBorder} overflow-hidden shadow-sm`}>
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ts.status === 'open' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <Store className={`w-5 h-5 ${ts.status === 'open' ? 'text-emerald-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {ts.pointOfSaleName ? `${ts.pointOfSaleName} — ` : ''}{ts.terminalName}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ts.status === 'open' ? 'bg-green-100 text-green-700' : ts.closingValidationStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                  {ts.status === 'open' ? 'Abierta' : ts.closingValidationStatus === 'rejected' ? 'Rechazada' : 'Cerrada'}
                </span>
                {incidentCount > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">{incidentCount} inc.</span>}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ts.workerName}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ts.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}{ts.closedAt ? ` — ${new Date(ts.closedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}` : ''}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {summary.totalTransactions} ops</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{summary.totalSales.toFixed(2)}€</div>
              <div className="text-xs text-gray-500">
                {ts.status === 'closed' && (
                  <span className={`font-semibold ${ts.difference === 0 ? 'text-green-600' : Math.abs(ts.difference) > 20 ? 'text-red-600' : 'text-amber-600'}`}>
                    Dif: {ts.difference >= 0 ? '+' : ''}{ts.difference.toFixed(2)}€
                  </span>
                )}
                {ts.status === 'open' && <span className="text-emerald-600 font-semibold">Efectivo: {expected.toFixed(2)}€</span>}
              </div>
            </div>
            {ts.status === 'closed' && onViewClosing && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onViewClosing(ts); }}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90"
              >
                Ver cierre
              </button>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap mt-3">
          {Object.entries(summary.salesByMethod).map(([method, amount]) => {
            if (amount <= 0) return null;
            const badge = METHOD_BADGES[method];
            if (!badge) return null;
            const Icon = badge.icon;
            return (
              <span key={method} className={`px-2 py-0.5 rounded-lg text-[11px] font-medium flex items-center gap-1 ${badge.color}`}>
                <Icon className="w-3 h-3" /> {badge.label}: {amount.toFixed(2)}€
              </span>
            );
          })}
          {lastCount && (
            <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${lastCount.difference === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              Último arqueo: {lastCount.difference >= 0 ? '+' : ''}{lastCount.difference.toFixed(2)}€
            </span>
          )}
          {summary.totalCashIn > 0 && (
            <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Entradas: {summary.totalCashIn.toFixed(2)}€
            </span>
          )}
          {summary.totalCashOut > 0 && (
            <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              Salidas: {summary.totalCashOut.toFixed(2)}€
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-4">
          {detailBody}
        </div>
      )}
    </div>
  );
}

// ─── Cierre completo (solo lectura) ─────────────────────────────────────────

function ClosingViewModal({ session, onClose }: { session: TpvRegisterSession; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col min-h-0" style={{ maxHeight: '96vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cierre de caja</h2>
            <p className="text-xs text-gray-500 mt-1">Resumen completo del turno</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-gray-500">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <RegisterClosingDetailPanel session={session} />
        </div>
        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="w-full py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function CajaPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [driverSessions, setDriverSessions] = useState<DriverCashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => todayIsoDate());
  const [filterPdv, setFilterPdv] = useState('');
  const [onlyOpenNow, setOnlyOpenNow] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);
  const [viewingClosingSession, setViewingClosingSession] = useState<TpvRegisterSession | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [forcingSessionId, setForcingSessionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const userCollapsedOpenRef = useRef(false);

  const closingPlatforms = useMemo(() => getClosingAggregatorPlatforms(), []);
  const handleViewClosing = useCallback((session: TpvRegisterSession) => {
    setViewingClosingSession(session);
  }, []);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!dataUserId) return;
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { sessions: sessData, driverSessions: driverData } = await listCajaBootstrapRequest(dataUserId);
      const unique = Array.from(new Map(sessData.map((s) => [s._id, s])).values());
      setSessions(unique);
      setDriverSessions(driverData);
      hasLoadedOnceRef.current = true;
    } catch {
      if (!silent) toast.error('Error al cargar datos de caja');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dataUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  const validateParam = searchParams.get('validate');
  const viewParam = searchParams.get('view');
  const deepLinkSessionId = validateParam || viewParam;

  useEffect(() => {
    if (loading || !deepLinkSessionId) return;
    if (sessions.length === 0 && !loading) {
      // datos cargados pero vacíos
    }
    const session = sessions.find((s) => s._id === deepLinkSessionId);
    const clearDeepLink = () => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('validate');
        next.delete('view');
        return next;
      }, { replace: true });
    };

    if (!session) {
      if (!loading) {
        toast.error('No se encontró la sesión de caja indicada');
        clearDeepLink();
      }
      return;
    }

    if (validateParam) {
      if (session.status === 'open') {
        toast.info('Esta caja sigue abierta. Puedes forzar el cierre desde Caja (botón Forzar cierre) o cerrarla en el TPV.');
      } else {
        setViewingClosingSession(session);
      }
    } else {
      setViewingClosingSession(session);
    }
    clearDeepLink();
  }, [loading, sessions, deepLinkSessionId, validateParam, setSearchParams]);

  useEffect(() => {
    const id = window.setInterval(() => { void loadData({ silent: true }); }, 30000);
    return () => window.clearInterval(id);
  }, [loadData]);

  useEffect(() => {
    const onFocus = () => { void loadData({ silent: true }); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  const pointsOfSale = activeStoreScope.allPointsOfSale.length > 0
    ? activeStoreScope.allPointsOfSale
    : activeStoreScope.pointsOfSale;

  const loadOrders = useCallback(async () => {
    if (!dataUserId) return;
    setLoadingOrders(true);
    const pdvForApi = filterPdv?.trim() || activeStoreScope.activeSalesPointId?.trim() || undefined;
    const bounds = localDayBoundsForKey(selectedDate);
    try {
      const data = await filterDeliveryOrdersRequest(dataUserId, {
        ...(pdvForApi ? { salesPointId: pdvForApi } : {}),
        dateFrom: bounds.from,
        dateTo: bounds.to,
        limit: 500,
      });
      setOrders(data.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [dataUserId, filterPdv, activeStoreScope.activeSalesPointId, selectedDate]);

  useEffect(() => {
    if (!showExtras) return;
    void loadOrders();
  }, [showExtras, loadOrders]);

  const todayStr = todayIsoDate();
  const weekDays = useMemo(() => last7Days(), [todayStr]);

  const daySessions = useMemo(() => {
    let list = sessions.filter((s) => sessionOnDate(s, selectedDate));
    if (onlyOpenNow) list = list.filter((s) => s.status === 'open');
    if (filterPdv) list = list.filter((s) => s.pointOfSaleId === filterPdv);
    return list;
  }, [sessions, selectedDate, onlyOpenNow, filterPdv]);

  const openSessionsNow = useMemo(() => {
    let list = sessions.filter((s) => s.status === 'open');
    if (filterPdv) list = list.filter((s) => s.pointOfSaleId === filterPdv);
    return dedupeOpenRegisterSessions(list);
  }, [sessions, filterPdv]);

  const openOnSelectedDay = useMemo(() => {
    let list = sessions.filter((s) => sessionOnDate(s, selectedDate) && s.status === 'open');
    if (filterPdv) list = list.filter((s) => s.pointOfSaleId === filterPdv);
    return dedupeOpenRegisterSessions(list);
  }, [sessions, selectedDate, filterPdv]);

  const storeGroups = useMemo(() => {
    const groups = groupSessionsByStore(daySessions, pointsOfSale, selectedDate, {
      excludeOpen: openOnSelectedDay.length > 0 && !onlyOpenNow,
    });
    if (filterPdv) return groups.filter((g) => g.pdvId === filterPdv);
    return groups;
  }, [daySessions, pointsOfSale, filterPdv, selectedDate, openOnSelectedDay.length, onlyOpenNow]);

  const openSessions = openSessionsNow;
  const openDriverSessions = useMemo(() => driverSessions.filter(s => s.status === 'open'), [driverSessions]);

  const dayStats = useMemo(() => {
    const allDay = sessions.filter((s) => sessionOnDate(s, selectedDate));
    const scopedDay = filterPdv ? allDay.filter((s) => s.pointOfSaleId === filterPdv) : allDay;
    const storesWithActivity = new Set(scopedDay.map((s) => s.pointOfSaleId).filter(Boolean)).size;
    const openNow = dedupeOpenRegisterSessions(scopedDay.filter((s) => s.status === 'open')).length;
    const sales = scopedDay.reduce((sum, s) => sum + buildTpvRegisterSummaryForDay(s, selectedDate).totalSales, 0);
    const diff = scopedDay.filter((s) => s.status === 'closed').reduce((sum, s) => sum + (s.difference || 0), 0);
    return {
      stores: storesWithActivity,
      turns: scopedDay.length,
      openNow,
      sales,
      diff,
    };
  }, [sessions, selectedDate, filterPdv]);

  const dayAggregatorRows = useMemo(
    () => buildDailyAggregatorRows(closingPlatforms, orders, selectedDate, sessions),
    [closingPlatforms, orders, selectedDate, sessions],
  );

  const ordersInRange = useMemo(() => {
    return (orders || [])
      .filter((o) => isLocalCalendarDay(String(o.createdAt || ''), selectedDate))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [orders, selectedDate]);

  const handleForceCloseOpenSession = async (session: TpvRegisterSession) => {
    if (!dataUserId || session.status !== 'open') return;
    const day = new Date(session.openedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    const ok = window.confirm(
      `¿Forzar cierre de la caja de ${session.pointOfSaleName || 'esta tienda'} (abierta el ${day})?\n\nLuego abre un turno nuevo en el TPV para ver solo los pedidos de hoy.`,
    );
    if (!ok) return;
    setForcingSessionId(session._id);
    try {
      const expected = calcTpvExpectedCash(session);
      const updated = await updateTpvRegisterSessionRequest(dataUserId, {
        ...session,
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: user?.name || user?.email || 'Gerente',
        closingNotes: `Cierre forzado desde Caja (sesión abierta el ${String(session.openedAt || '').slice(0, 10)})`,
        expectedCash: expected,
        finalCashAmount: expected,
        difference: 0,
        closingValidationStatus: 'pending',
      });
      setSessions((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      toast.success('Caja cerrada. Abre un turno de hoy en el TPV.');
    } catch {
      toast.error('No se pudo forzar el cierre');
    } finally {
      setForcingSessionId(null);
    }
  };

  useEffect(() => {
    userCollapsedOpenRef.current = false;
    setExpandedSessionId(null);
  }, [selectedDate]);

  useEffect(() => {
    if (loading || userCollapsedOpenRef.current) return;
    if (openOnSelectedDay.length >= 1) {
      setExpandedSessionId((prev) => (
        prev && openOnSelectedDay.some((s) => s._id === prev) ? prev : openOnSelectedDay[0]._id
      ));
    }
  }, [loading, openOnSelectedDay]);

  const handleToggleSession = useCallback((id: string) => {
    setExpandedSessionId((prev) => {
      const next = prev === id ? null : id;
      if (next === null && openOnSelectedDay.some((s) => s._id === id)) {
        userCollapsedOpenRef.current = true;
      } else if (next !== null) {
        userCollapsedOpenRef.current = false;
      }
      if (next) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-caja-turn="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return next;
    });
  }, [openOnSelectedDay]);

  const excelClosedCount = sessions.filter((s) => String(s.status || '').toLowerCase() !== 'open').length;

  const handleExcel = () => {
    try {
      const { rows } = downloadAccumulatedCajaClosingsExcel(sessions);
      if (rows === 0) {
        toast.info('Aún no hay cierres de caja para exportar');
        return;
      }
      toast.success(`Excel generado con ${rows} cierre${rows === 1 ? '' : 's'} acumulado${rows === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo generar el Excel');
    }
  };

  const handleBack = () => {
    if ((location.state as { returnToOps?: boolean } | null)?.returnToOps) {
      navigate('/saas/delivery-ops');
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/saas/vertical/delivery');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f3f5] dark:bg-zinc-950">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-zinc-300 border-t-[#030213] rounded-full mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Cargando cajas...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CajaTimelineBoard
        sessions={sessions}
        selectedDate={selectedDate}
        onSelectedDateChange={(d) => { setSelectedDate(d); setExpandedSessionId(null); }}
        pointsOfSale={pointsOfSale}
        filterPdv={filterPdv}
        onFilterPdvChange={setFilterPdv}
        onlyOpenNow={onlyOpenNow}
        onOnlyOpenNowChange={setOnlyOpenNow}
        dayStats={dayStats}
        excelClosedCount={excelClosedCount}
        onExcelClick={handleExcel}
        onBack={handleBack}
        selectedSessionId={expandedSessionId}
        onSelectSession={setExpandedSessionId}
        onForceClose={handleForceCloseOpenSession}
        forcingSessionId={forcingSessionId}
        onViewFullClosing={handleViewClosing}
        refreshing={refreshing}
      />
      {viewingClosingSession && (
        <ClosingViewModal
          session={viewingClosingSession}
          onClose={() => setViewingClosingSession(null)}
        />
      )}
    </>
  );
}
