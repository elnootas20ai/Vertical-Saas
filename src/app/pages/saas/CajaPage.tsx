import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { canValidateRegisterClosings } from '../../lib/restaurantTpvPermissions';
import { ensureTpvSessionIncome } from '../../lib/tpvFinanceSync';
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
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter, Download, Calendar, Eye,
  ShieldCheck, ShieldX, MessageSquare, TrendingUp, TrendingDown, Hash,
  Truck, MapPin,
  ArrowLeft, Plug, History, ShoppingBag, Radio,
} from 'lucide-react';
import {
  buildAggregatorCashRows,
  buildDailyAggregatorRows,
  getClosingAggregatorPlatforms,
  aggregatorRowsFromClosingTotals,
  sumAggregatorRows,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { AggregatorCashSummary } from '../../components/saas/AggregatorCashSummary';
import { RegisterClosingDetailPanel } from '../../components/saas/RegisterClosingDetailPanel';
import { calcTpvExpectedCash, buildTpvRegisterSummary } from '../../lib/tpvCajaMath';
import { filterOrdersForRegisterSession } from '../../lib/registerShiftSalesBreakdown';
import {
  buildTpvRegisterSummaryForDay,
  dedupeOpenRegisterSessions,
  isLocalCalendarDay,
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

/** Cierres de prueba (sin ventas ni descuadre) no bloquean la bandeja del gerente. */
function isMeaningfulPendingClose(session: TpvRegisterSession): boolean {
  if (session.status !== 'closed' || session.closingValidationStatus !== 'pending') return false;
  const sales = session.transactions?.filter((t) => t.type === 'sale').length || 0;
  const hasDiff = Math.abs(session.difference || 0) >= 0.01;
  const hasIncidents = (session.incidents?.length || 0) > 0;
  return sales > 0 || hasDiff || hasIncidents;
}

function isEmptyTestClose(session: TpvRegisterSession): boolean {
  if (session.status !== 'closed' || session.closingValidationStatus !== 'pending') return false;
  const sales = session.transactions?.filter((t) => t.type === 'sale').length || 0;
  return sales === 0 && Math.abs(session.difference || 0) < 0.01;
}

function isAutoValidatedEmptyTurn(session: TpvRegisterSession): boolean {
  if (session.status !== 'closed' || session.closingValidationStatus !== 'validated') return false;
  const sales = session.transactions?.filter((t) => t.type === 'sale').length || 0;
  return sales === 0 && Math.abs(session.difference || 0) < 0.01;
}

function sessionStatusLabel(session: TpvRegisterSession): { text: string; className: string } {
  if (session.status === 'open') {
    return { text: 'Abierta', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' };
  }
  if (session.closingValidationStatus === 'pending') {
    return { text: 'Pendiente', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
  }
  if (session.closingValidationStatus === 'validated') {
    return { text: 'Validada', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
  }
  if (session.closingValidationStatus === 'rejected') {
    return { text: 'Rechazada', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
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
  if (session.status === 'open') return 'border-l-emerald-500';
  if (session.closingValidationStatus === 'pending') return 'border-l-amber-500';
  if (session.closingValidationStatus === 'rejected') return 'border-l-red-500';
  if (session.closingValidationStatus === 'validated') return 'border-l-blue-500';
  return 'border-l-gray-300 dark:border-l-gray-600';
}

function turnBadgeClass(session: TpvRegisterSession): string {
  if (session.status === 'open') return 'bg-emerald-600 text-white ring-emerald-200 dark:ring-emerald-900';
  if (session.closingValidationStatus === 'pending') return 'bg-amber-500 text-white ring-amber-200 dark:ring-amber-900';
  if (session.closingValidationStatus === 'rejected') return 'bg-red-500 text-white ring-red-200 dark:ring-red-900';
  if (session.closingValidationStatus === 'validated') return 'bg-blue-600 text-white ring-blue-200 dark:ring-blue-900';
  return 'bg-gray-600 text-white ring-gray-200 dark:ring-gray-700';
}

function OpenRegisterHero({
  sessions,
  selectedDate,
  expandedSessionId,
  onToggleSession,
  onViewClosing,
}: {
  sessions: TpvRegisterSession[];
  selectedDate: string;
  expandedSessionId: string | null;
  onToggleSession: (id: string) => void;
  onViewClosing: (session: TpvRegisterSession) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-600 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-900 p-4 sm:p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
          <Radio className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">
            Caja abierta ahora
          </h2>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            {sessions.length === 1
              ? 'Un turno activo en este momento'
              : `${sessions.length} turnos activos en tiendas distintas`}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {sessions.map((session) => {
          const summary = buildTpvRegisterSummaryForDay(session, selectedDate);
          const expected = calcTpvExpectedCash(session);
          const expanded = expandedSessionId === session._id;
          const openedTime = new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' });

          return (
            <div
              key={session._id}
              data-caja-turn={session._id}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                expanded
                  ? 'border-emerald-600 bg-white dark:bg-gray-800 shadow-lg'
                  : 'border-emerald-300 dark:border-emerald-700 bg-white/90 dark:bg-gray-800/90'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleSession(session._id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                    {session.pointOfSaleName || 'Tienda'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {session.workerName} · {session.terminalName} · desde {openedTime}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {summary.totalSales.toFixed(2)}€
                  </div>
                  <div className="text-[10px] text-gray-500 tabular-nums">Efectivo: {expected.toFixed(2)}€</div>
                </div>
                {expanded ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
              </button>
              {expanded && (
                <div className="border-t border-emerald-100 dark:border-emerald-900/50 p-4">
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
  onValidate,
}: {
  group: StoreDayGroup;
  selectedDate: string;
  expandedSessionId: string | null;
  onToggleSession: (id: string) => void;
  onViewClosing: (session: TpvRegisterSession) => void;
  /** Solo gerente/dueño. Si no se pasa, no se muestran acciones de validación. */
  onValidate?: (session: TpvRegisterSession) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-white dark:text-gray-900" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{group.storeName}</h3>
            <p className="text-[11px] text-gray-500">
              {group.sessions.length === 0
                ? 'Sin turnos cerrados este día'
                : `${group.sessions.length} turno${group.sessions.length > 1 ? 's' : ''} cerrado${group.sessions.length > 1 ? 's' : ''} o pendiente${group.sessions.length > 1 ? 's' : ''}`}
              {group.totalSales > 0 ? ` · ${group.totalSales.toFixed(2)}€` : ''}
            </p>
          </div>
        </div>
      </div>

      {group.sessions.length === 0 ? null : (
        <div className="p-3 space-y-3 bg-gray-50/80 dark:bg-gray-900/30">
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

            const isSiblingCollapsed = Boolean(expandedSessionId && !expanded);

            return (
              <div
                key={session._id}
                data-caja-turn={session._id}
                className={`transition-all duration-300 ease-out ${turnAccentClass(session)} ${
                  expanded
                    ? 'rounded-xl border-2 border-indigo-600 dark:border-indigo-500 bg-white dark:bg-gray-800 shadow-xl shadow-indigo-200/40 dark:shadow-none scale-100 opacity-100'
                    : `rounded-lg border-2 border-dashed bg-white dark:bg-gray-800 shadow-none scale-[0.98] ${
                        isSiblingCollapsed
                          ? 'border-gray-200 dark:border-gray-700 opacity-45 hover:opacity-70'
                          : 'border-gray-300 dark:border-gray-600 opacity-100 hover:border-gray-400 hover:shadow-sm'
                      }`
                }`}
              >
                {expanded ? (
                  <>
                    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 bg-indigo-600 dark:bg-indigo-700 text-white border-b border-indigo-700 dark:border-indigo-600">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm font-bold tabular-nums">
                          {turnNumber}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide truncate">
                            Turno {turnNumber} · desplegado
                          </p>
                          <p className="text-[11px] text-indigo-100 truncate font-mono tabular-nums">
                            {timeRange} · {session.workerName}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleSession(session._id)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-indigo-700 text-xs font-bold uppercase tracking-wide hover:bg-indigo-50 transition-colors shadow-sm"
                      >
                        <ChevronUp className="w-4 h-4" />
                        Plegar
                      </button>
                    </div>

                    <div className="border-l-[4px] border-indigo-400 dark:border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20">
                      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-indigo-100 dark:border-indigo-900/50 bg-white/70 dark:bg-gray-800/70">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${status.className}`}>
                          {status.text}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {summary.totalSales.toFixed(2)}€
                        </span>
                        <span className="text-xs text-gray-500">
                          {summary.totalTransactions} movimientos · {session.terminalName}
                        </span>
                      </div>
                      <div className="p-4">
                        <RegisterCard session={session} onViewClosing={onViewClosing} detailOnly />
                      </div>
                      <div className="px-4 pb-4">
                        <button
                          type="button"
                          onClick={() => onToggleSession(session._id)}
                          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 shadow-md"
                        >
                          <ChevronUp className="w-5 h-5" />
                          Plegar turno {turnNumber}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleSession(session._id)}
                    aria-expanded={false}
                    className="w-full text-left px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`shrink-0 w-9 h-9 rounded-lg flex flex-col items-center justify-center ring-2 ${turnBadgeClass(session)} group-hover:scale-105 transition-transform`}
                        aria-hidden
                      >
                        <span className="text-[8px] font-bold uppercase leading-none opacity-80">T</span>
                        <span className="text-sm font-bold leading-none tabular-nums">{turnNumber}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-mono tabular-nums text-gray-500">{timeRange}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${status.className}`}>
                            {status.text}
                          </span>
                          {emptyAuto && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-100 text-gray-500">
                              Sin ventas
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {session.workerName}
                          <span className="text-gray-400 font-normal"> · {session.terminalName}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">{summary.totalTransactions} movimientos</p>
                      </div>

                      <div className="hidden sm:block text-right shrink-0 mr-1">
                        <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {summary.totalSales.toFixed(2)}€
                        </div>
                        <div className={`text-[10px] tabular-nums ${session.status === 'closed' && session.difference !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {session.status === 'closed' ? `Dif. ${diffLabel}` : diffLabel}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {onValidate
                          && session.status === 'closed'
                          && session.closingValidationStatus === 'pending'
                          && isMeaningfulPendingClose(session) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onValidate(session); }}
                            className="px-2 py-1 text-[9px] font-bold rounded-md bg-blue-600 text-white"
                          >
                            Revisar
                          </button>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-gray-800 dark:border-gray-200 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-[10px] font-bold uppercase tracking-wide group-hover:bg-gray-900 group-hover:text-white dark:group-hover:bg-gray-100 dark:group-hover:text-gray-900 transition-colors">
                          <ChevronDown className="w-3.5 h-3.5" />
                          Desplegar
                        </span>
                      </div>
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
      : ts.closingValidationStatus === 'pending'
        ? 'border-l-amber-400'
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
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ts.status === 'open' ? 'bg-green-100 text-green-700' : ts.closingValidationStatus === 'validated' ? 'bg-blue-100 text-blue-700' : ts.closingValidationStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                  {ts.status === 'open' ? 'Abierta' : ts.closingValidationStatus === 'validated' ? 'Validada' : ts.closingValidationStatus === 'rejected' ? 'Rechazada' : 'Cerrada'}
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

// ─── Validation Modal ──────────────────────────────────────────────────────

function ValidationModal({ session, shiftOrders, onValidate, onReject, onCancel }: {
  session: TpvRegisterSession;
  shiftOrders: DeliveryOrder[];
  onValidate: (notes: string) => void;
  onReject: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');
  const closingPlatforms = useMemo(() => getClosingAggregatorPlatforms(), []);
  const autoAggregatorRows = useMemo(
    () => buildAggregatorCashRows(closingPlatforms, session, shiftOrders),
    [closingPlatforms, session, shiftOrders],
  );
  const aggregatorRows = useMemo(() => {
    if (session.aggregatorClosingTotals && Object.keys(session.aggregatorClosingTotals).length > 0) {
      return aggregatorRowsFromClosingTotals(closingPlatforms, session.aggregatorClosingTotals);
    }
    return autoAggregatorRows;
  }, [session, closingPlatforms, autoAggregatorRows]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col min-h-0" style={{ maxHeight: '96vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-blue-500" /> Validar cierre de caja</h2>
          <p className="text-xs text-gray-500 mt-1">Revisa el cierre completo antes de validar o rechazar</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <RegisterClosingDetailPanel session={session} aggregatorRows={aggregatorRows} />

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notas del gerente</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Observaciones..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onReject(notes)} className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"><ShieldX className="w-4 h-4" /> Rechazar</button>
          <button onClick={() => onValidate(notes)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Validar cierre</button>
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
  const canValidateClosings = canValidateRegisterClosings(user);
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
  const [validatingSession, setValidatingSession] = useState<TpvRegisterSession | null>(null);
  const [viewingClosingSession, setViewingClosingSession] = useState<TpvRegisterSession | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [dismissingEmpty, setDismissingEmpty] = useState(false);
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
      if (session.status === 'closed' && session.closingValidationStatus === 'pending') {
        if (canValidateClosings) setValidatingSession(session);
        else setViewingClosingSession(session);
      } else if (session.status === 'open') {
        toast.info('Esta caja sigue abierta. El cierre se realiza desde el TPV en tienda.');
      } else {
        setViewingClosingSession(session);
      }
    } else {
      setViewingClosingSession(session);
    }
    clearDeepLink();
  }, [loading, sessions, deepLinkSessionId, validateParam, canValidateClosings, setSearchParams]);

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
  const pendingValidation = useMemo(() => sessions.filter(isMeaningfulPendingClose), [sessions]);
  const emptyPendingClosures = useMemo(() => sessions.filter(isEmptyTestClose), [sessions]);

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

  const validationShiftOrders = useMemo(() => {
    if (!validatingSession) return [];
    return filterOrdersForRegisterSession(validatingSession, ordersInRange);
  }, [validatingSession, ordersInRange]);

  const handleDismissEmptyPending = async () => {
    if (!dataUserId || emptyPendingClosures.length === 0) return;
    setDismissingEmpty(true);
    try {
      const updatedList = await Promise.all(
        emptyPendingClosures.map((s) =>
          updateTpvRegisterSessionRequest(dataUserId, {
            ...s,
            closingValidationStatus: 'validated',
            closingValidatedAt: new Date().toISOString(),
            closingValidatedBy: user?.name || user?.email || 'Gerente',
            closingValidationNotes: 'Archivado: cierre de prueba sin movimientos.',
          }),
        ),
      );
      setSessions((prev) => {
        const byId = new Map(updatedList.map((s) => [s._id, s]));
        return prev.map((s) => byId.get(s._id) || s);
      });
      toast.success(`${updatedList.length} cierre${updatedList.length > 1 ? 's' : ''} de prueba archivado${updatedList.length > 1 ? 's' : ''}`);
    } catch {
      toast.error('No se pudieron archivar los cierres vacíos');
    } finally {
      setDismissingEmpty(false);
    }
  };

  const handleValidate = async (notes: string) => {
    if (!validatingSession || !dataUserId) return;
    try {
      const updated = await updateTpvRegisterSessionRequest(dataUserId, {
        ...validatingSession,
        closingValidatedBy: user?.name || user?.email || 'Gerente',
        closingValidatedAt: new Date().toISOString(),
        closingValidationStatus: 'validated',
        closingValidationNotes: notes,
      });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setValidatingSession(null);
      try {
        const pdv = activeStoreScope.allPointsOfSale.find((p) => p._id === updated.pointOfSaleId);
        await ensureTpvSessionIncome(dataUserId, updated, {
          businessId: currentBusiness?.business_id || '',
          businessName: currentBusiness?.name || '',
          workCenterId: pdv?.workCenterId || '',
          workCenterName: pdv?.workCenterName || updated.pointOfSaleName,
          pointOfSaleId: updated.pointOfSaleId,
          pointOfSaleName: updated.pointOfSaleName,
        });
      } catch {
        // finanzas opcional; el cierre ya quedó validado
      }
      toast.success('Cierre validado correctamente');
    } catch {
      toast.error('Error al validar cierre');
    }
  };

  const handleReject = async (notes: string) => {
    if (!validatingSession || !dataUserId) return;
    try {
      const updated = await updateTpvRegisterSessionRequest(dataUserId, {
        ...validatingSession,
        closingValidatedBy: user?.name || user?.email || 'Gerente',
        closingValidatedAt: new Date().toISOString(),
        closingValidationStatus: 'rejected',
        closingValidationNotes: notes,
      });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setValidatingSession(null);
      toast.success('Cierre rechazado');
    } catch {
      toast.error('Error al rechazar cierre');
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando cajas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              if ((location.state as { returnToOps?: boolean } | null)?.returnToOps) {
                navigate('/saas/delivery-ops');
                return;
              }
              if (typeof window !== 'undefined' && window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/saas/vertical/delivery');
              }
            }}
            className="mt-0.5 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Volver"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Caja</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Arriba la caja activa; abajo el historial de turnos del día que elijas
            </p>
          </div>
          {openSessions.length > 0 && (
            <span className="shrink-0 mt-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
              {openSessions.length} caja{openSessions.length > 1 ? 's' : ''} abierta{openSessions.length > 1 ? 's' : ''}
            </span>
          )}
          {refreshing && (
            <span className="shrink-0 mt-1 text-[11px] text-gray-400">Actualizando…</span>
          )}
        </div>

        {/* ── 1. DÍA ── */}
        <section className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-indigo-900 dark:text-indigo-100 uppercase tracking-wide">1 · Día</h2>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {weekDays.map((d) => {
              const active = d === selectedDate;
              const label = d === todayStr ? 'Hoy' : new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setSelectedDate(d); setExpandedSessionId(null); }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedDate((d) => addDaysIso(d, -1))} className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 capitalize min-w-[160px] text-center">
                {formatDayHeading(selectedDate)}
              </p>
              <button
                type="button"
                onClick={() => setSelectedDate((d) => addDaysIso(d, 1))}
                disabled={selectedDate >= todayStr}
                className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-white/80 dark:bg-gray-900/50 py-3 px-2 border border-indigo-100 dark:border-indigo-900">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{dayStats.stores}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">Tiendas</div>
            </div>
            <div className="rounded-xl bg-white/80 dark:bg-gray-900/50 py-3 px-2 border border-indigo-100 dark:border-indigo-900">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{dayStats.turns}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">Turnos</div>
            </div>
            <div className="rounded-xl bg-white/80 dark:bg-gray-900/50 py-3 px-2 border border-indigo-100 dark:border-indigo-900">
              <div className="text-2xl font-bold text-emerald-600">{dayStats.openNow}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">Abiertas hoy</div>
            </div>
            <div className="rounded-xl bg-white/80 dark:bg-gray-900/50 py-3 px-2 border border-indigo-100 dark:border-indigo-900">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{dayStats.sales.toFixed(0)}€</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">Ventas caja</div>
            </div>
          </div>
        </section>

        {openOnSelectedDay.length > 0 && (
          <OpenRegisterHero
            sessions={openOnSelectedDay}
            selectedDate={selectedDate}
            expandedSessionId={expandedSessionId}
            onToggleSession={handleToggleSession}
            onViewClosing={handleViewClosing}
          />
        )}

        {canValidateClosings && pendingValidation.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <ShieldCheck className="w-4 h-4 inline mr-1" />
              {pendingValidation.length} cierre{pendingValidation.length > 1 ? 's' : ''} esperando tu validación
            </p>
            <button
              type="button"
              onClick={() => setValidatingSession(pendingValidation[0])}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 text-white"
            >
              Revisar
            </button>
          </div>
        )}

        {canValidateClosings && emptyPendingClosures.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <p className="text-xs text-gray-500">{emptyPendingClosures.length} cierres de prueba sin ventas</p>
            <button type="button" disabled={dismissingEmpty} onClick={() => void handleDismissEmptyPending()} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white disabled:opacity-50">
              {dismissingEmpty ? 'Archivando…' : 'Archivar'}
            </button>
          </div>
        )}

        {/* ── Historial del día ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                {onlyOpenNow ? 'Solo abiertas' : 'Historial del día'}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pointsOfSale.length > 0 && (
                <select
                  value={filterPdv}
                  onChange={(e) => setFilterPdv(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                >
                  <option value="">Todas las tiendas ({pointsOfSale.length})</option>
                  {pointsOfSale.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setOnlyOpenNow((v) => !v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  onlyOpenNow
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600'
                }`}
              >
                Solo abiertas ahora
              </button>
            </div>
          </div>

          {!onlyOpenNow && openOnSelectedDay.length > 0 && storeGroups.length > 0 && (
            <p className="text-xs text-gray-500 -mt-1">
              Turnos cerrados o pendientes de validación. La caja activa está arriba.
            </p>
          )}

          {onlyOpenNow && openOnSelectedDay.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-400">
              <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Ninguna caja abierta este día</p>
            </div>
          ) : onlyOpenNow ? null : storeGroups.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-400">
              <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {openOnSelectedDay.length > 0
                  ? 'Solo hay caja abierta hoy — mírala arriba'
                  : 'Ningún turno de caja este día'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {storeGroups.map((group) => (
                <StoreDayBlock
                  key={group.pdvId}
                  group={group}
                  selectedDate={selectedDate}
                  expandedSessionId={expandedSessionId}
                  onToggleSession={handleToggleSession}
                  onViewClosing={handleViewClosing}
                  onValidate={canValidateClosings ? setValidatingSession : undefined}
                />
              ))}
            </div>
          )}

          {openDriverSessions.length > 0 && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 p-4 space-y-2">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <Truck className="w-4 h-4" /> Repartidores con caja abierta
              </h3>
              {openDriverSessions.map((s) => (
                <RegisterCard key={s._id} session={s} isDriver />
              ))}
            </div>
          )}
        </section>

        {/* ── 3. Extra (opcional) ── */}
        <section>
          <button
            type="button"
            onClick={() => setShowExtras((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            <span className="flex items-center gap-2">
              {showExtras ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              3 · Pedidos y agregadores del día (opcional)
            </span>
            <span className="text-xs text-gray-400 font-normal">No es el arqueo de caja</span>
          </button>

          {showExtras && (
            <div className="mt-3 space-y-4 pl-1">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Pedidos creados hoy</h3>
                  <button type="button" onClick={() => void loadOrders()} disabled={loadingOrders} className="text-xs text-indigo-600 font-semibold">
                    {loadingOrders ? 'Cargando…' : 'Actualizar'}
                  </button>
                </div>
                {ordersInRange.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Sin pedidos</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                    {ordersInRange.map((o) => (
                      <div key={o._id} className="flex justify-between py-2">
                        <span>#{o.orderNumber} · {new Date(o.createdAt || '').toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                        <span className="font-bold">{Number(o.totalAmount || 0).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 p-4">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Plug className="w-4 h-4 text-purple-600" /> Agregadores</h3>
                <AggregatorCashSummary rows={dayAggregatorRows} title="Glovo, Uber, Just Eat…" />
              </div>
            </div>
          )}
        </section>


      </div>

      {viewingClosingSession && (
        <ClosingViewModal
          session={viewingClosingSession}
          onClose={() => setViewingClosingSession(null)}
        />
      )}

      {validatingSession && (
        <ValidationModal
          session={validatingSession}
          shiftOrders={validationShiftOrders}
          onValidate={handleValidate}
          onReject={handleReject}
          onCancel={() => setValidatingSession(null)}
        />
      )}
    </div>
  );
}
