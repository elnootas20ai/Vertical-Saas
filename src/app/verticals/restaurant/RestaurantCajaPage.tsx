import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from '../../lib/deliveryOpsPdvSelection';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import {
  filterRestaurantRegisterSessions,
  listRestaurantRegisterSessions,
  type TpvRegisterSession,
} from '../../lib/restaurantCajaApi';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../../lib/deliveryApi';
import {
  Banknote, CreditCard, Phone as PhoneIcon, Wifi, User,
  Store, Clock, BarChart3,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { RegisterClosingDetailPanel } from '../../components/saas/RegisterClosingDetailPanel';
import { CajaTimelineBoard } from '../../components/saas/caja/CajaTimelineBoard';
import { CajaCashMovementsList } from '../../components/saas/caja/CajaCashMovementsList';
import { resolveCajaPageExitPath } from '../../lib/retailOpsPaths';
import {
  downloadUrielCajaClosings,
  type UrielCajaDownloadFormat,
} from '../../lib/cajaUrielClosingsExcelExport';
import { getBrandBillingConfigRequest } from '../../lib/brandBillingApi';
import { listBrandsRequest } from '../../lib/brandApi';
import {
  suggestBillingSheetsFromBrands,
  syncBillingSheetsWithBrands,
} from '../../lib/brandBillingConfig';
import { calcTpvExpectedCash, buildTpvRegisterSummary } from '../../lib/tpvCajaMath';
import {
  buildTpvRegisterSummaryForDay,
  dedupeOpenRegisterSessions,
  localCalendarDayKey,
  localDayBoundsForKey,
  sessionBelongsToCajaDay,
  sortRegisterSessionsForDisplay,
} from '../../lib/tpvCajaScope';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_BADGES: Record<string, { icon: typeof Banknote; color: string; label: string }> = {
  efectivo: { icon: Banknote, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Efectivo' },
  tarjeta: { icon: CreditCard, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Tarjeta' },
  bizum: { icon: PhoneIcon, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'Bizum' },
  online: { icon: Wifi, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', label: 'Online' },
};

function todayIsoDate(): string {
  return localCalendarDayKey();
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
    const storeName = pdv?.name || rawSessions[0]?.pointOfSaleName || 'Local';
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

function sessionOnDate(session: TpvRegisterSession, isoDate: string): boolean {
  return sessionBelongsToCajaDay(session, isoDate);
}

function isAutoValidatedEmptyTurn(session: TpvRegisterSession): boolean {
  if (session.status !== 'closed' || session.closingValidationStatus !== 'validated') return false;
  const sales = session.transactions?.filter((t) => t.type === 'sale').length || 0;
  return sales === 0 && Math.abs(session.difference || 0) < 0.01;
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
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Abiertas ahora</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {sessions.length === 1 ? '1 turno activo' : `${sessions.length} turnos activos`}
        </p>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {sessions.map((session) => {
          const summary = buildTpvRegisterSummaryForDay(session, selectedDate);
          const expected = calcTpvExpectedCash(session);
          const expanded = expandedSessionId === session._id;
          const openedTime = new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' });

          return (
            <div key={session._id} data-caja-turn={session._id}>
              <button
                type="button"
                onClick={() => onToggleSession(session._id)}
                className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {session.pointOfSaleName || 'Local'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {session.workerName} · {session.terminalName} · desde {openedTime}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {summary.totalSales.toFixed(2)}€
                  </div>
                  <div className="text-[11px] text-gray-400 tabular-nums">
                    {summary.totalSales <= 0 && Number(session.initialCashAmount || 0) > 0
                      ? `Fondo ${Number(session.initialCashAmount || 0).toFixed(2)}€`
                      : `En cajón ${expected.toFixed(2)}€`}
                  </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
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
            ? 'Sin turnos'
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
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${status.className}`}>{status.text}</span>
                      <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{summary.totalSales.toFixed(2)}€</span>
                      <span className="text-xs text-gray-500">{summary.totalTransactions} mov. · {session.terminalName}</span>
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
                      <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold tabular-nums ${turnBadgeClass(session)}`}>
                        {turnNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-mono tabular-nums text-gray-500">{timeRange}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${status.className}`}>{status.text}</span>
                          {emptyAuto && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-500">Sin ventas</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                          {session.workerName}
                          <span className="text-gray-400"> · {session.terminalName}</span>
                        </p>
                      </div>
                      <div className="hidden sm:block text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{summary.totalSales.toFixed(2)}€</div>
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
  onViewClosing,
  defaultExpanded = false,
  detailOnly = false,
}: {
  session: TpvRegisterSession;
  onViewClosing?: (session: TpvRegisterSession) => void;
  defaultExpanded?: boolean;
  detailOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || detailOnly);

  const ts = session;
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
          <RegisterClosingDetailPanel session={ts} variant="restaurant" />
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
          <CajaCashMovementsList session={ts} title="Entradas y salidas" />
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
                {ts.status === 'open' && (
                  <span className="text-emerald-600 font-semibold">
                    {summary.totalSales <= 0 && Number(ts.initialCashAmount || 0) > 0
                      ? `Fondo apertura: ${Number(ts.initialCashAmount || 0).toFixed(2)}€`
                      : `En cajón: ${expected.toFixed(2)}€`}
                  </span>
                )}
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
            <p className="text-xs text-gray-500 mt-1">Resumen del turno · sala / bar</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-gray-500">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <RegisterClosingDetailPanel session={session} variant="restaurant" />
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

export function RestaurantCajaPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = useMemo(
    () => resolveBusinessScopeId(currentBusiness),
    [currentBusiness],
  );
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => todayIsoDate());
  const [filterPdv, setFilterPdv] = useState('');
  const [onlyOpenNow, setOnlyOpenNow] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [viewingClosingSession, setViewingClosingSession] = useState<TpvRegisterSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const loadGenRef = useRef(0);
  const userCollapsedOpenRef = useRef(false);

  const pointsOfSale = activeStoreScope.allPointsOfSale.length > 0
    ? activeStoreScope.allPointsOfSale
    : activeStoreScope.pointsOfSale;

  const scopedSessions = useMemo(
    () => filterRestaurantRegisterSessions(sessions, {
      businessId,
      pointOfSaleIds: pointsOfSale.map((p) => p._id),
    }),
    [sessions, businessId, pointsOfSale],
  );

  const handleViewClosing = useCallback((session: TpvRegisterSession) => {
    setViewingClosingSession(session);
  }, []);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!dataUserId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const gen = ++loadGenRef.current;
    const forUserId = dataUserId;
    const forBusinessId = businessId;
    const forDate = selectedDate;
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const deepLink = typeof window !== 'undefined'
        ? (new URLSearchParams(window.location.search).get('validate')
          || new URLSearchParams(window.location.search).get('view'))
        : null;
      let dateFrom = localDayBoundsForKey(forDate).from;
      if (deepLink) {
        const lookback = new Date();
        lookback.setDate(lookback.getDate() - 120);
        dateFrom = lookback.toISOString();
      }
      const sessData = await listRestaurantRegisterSessions(forUserId, { businessId: forBusinessId, dateFrom });
      if (gen !== loadGenRef.current) return;
      const unique = Array.from(new Map(sessData.map((s) => [s._id, s])).values());
      setSessions(unique);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (!silent && !aborted) toast.error('Error al cargar datos de caja');
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dataUserId, businessId, selectedDate]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setSessions([]);
    setFilterPdv('');
    setViewingClosingSession(null);
  }, [businessId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const validateParam = searchParams.get('validate');
  const viewParam = searchParams.get('view');
  const deepLinkSessionId = validateParam || viewParam;

  useEffect(() => {
    if (loading || !deepLinkSessionId) return;
    if (sessions.length === 0 && !loading) {
      // datos cargados pero vacíos
    }
    const session = scopedSessions.find((s) => s._id === deepLinkSessionId);
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
        toast.info('Esta caja sigue abierta. El cierre se realiza desde el TPV de sala.');
      } else {
        setViewingClosingSession(session);
      }
    } else {
      setViewingClosingSession(session);
    }
    clearDeepLink();
  }, [loading, scopedSessions, deepLinkSessionId, validateParam, setSearchParams]);

  useEffect(() => {
    const id = window.setInterval(() => { void loadData({ silent: true }); }, 30000);
    return () => window.clearInterval(id);
  }, [loadData]);

  useEffect(() => {
    const onFocus = () => { void loadData({ silent: true }); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  // Arrancar filtrado por el local activo del scope (o el único PDV, p. ej. Bodegeta).
  const didInitPdvFilter = useRef(false);
  useEffect(() => {
    if (didInitPdvFilter.current) return;
    if (pointsOfSale.length === 0) return;
    const active = String(activeStoreScope.activeSalesPointId || '').trim();
    if (active && pointsOfSale.some((p) => p._id === active)) {
      setFilterPdv(active);
      didInitPdvFilter.current = true;
      return;
    }
    if (pointsOfSale.length === 1) {
      setFilterPdv(pointsOfSale[0]._id);
      didInitPdvFilter.current = true;
    }
  }, [activeStoreScope.activeSalesPointId, pointsOfSale]);

  const handleFilterPdvChange = useCallback(
    (pdvId: string) => {
      didInitPdvFilter.current = true;
      setFilterPdv(pdvId);
      const businessId = resolveBusinessScopeId(currentBusiness);
      if (pdvId && businessId && dataUserId) {
        writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdvId);
        activeStoreScope.setActiveSalesPoint(pdvId);
        notifyDeliveryActiveStoreChanged();
      }
    },
    [currentBusiness, dataUserId, activeStoreScope],
  );

  const openOnSelectedDay = useMemo(() => {
    let list = scopedSessions.filter((s) => sessionOnDate(s, selectedDate) && s.status === 'open');
    if (filterPdv) list = list.filter((s) => s.pointOfSaleId === filterPdv);
    return dedupeOpenRegisterSessions(list);
  }, [scopedSessions, selectedDate, filterPdv]);

  const dayStats = useMemo(() => {
    const allDay = scopedSessions.filter((s) => sessionOnDate(s, selectedDate));
    const scopedDay = filterPdv ? allDay.filter((s) => s.pointOfSaleId === filterPdv) : allDay;
    const storesWithActivity = new Set(scopedDay.map((s) => s.pointOfSaleId).filter(Boolean)).size;
    const openNow = dedupeOpenRegisterSessions(scopedDay.filter((s) => s.status === 'open')).length;
    const sales = scopedDay.reduce((sum, s) => sum + buildTpvRegisterSummaryForDay(s, selectedDate).totalSales, 0);
    const cashIn = scopedDay.reduce((sum, s) => sum + buildTpvRegisterSummaryForDay(s, selectedDate).totalCashIn, 0);
    const cashOut = scopedDay.reduce((sum, s) => sum + buildTpvRegisterSummaryForDay(s, selectedDate).totalCashOut, 0);
    return {
      stores: storesWithActivity,
      turns: scopedDay.length,
      openNow,
      sales,
      cashIn,
      cashOut,
    };
  }, [scopedSessions, selectedDate, filterPdv]);

  useEffect(() => {
    userCollapsedOpenRef.current = false;
    setExpandedSessionId(null);
  }, [selectedDate]);

  useEffect(() => {
    if (loading || userCollapsedOpenRef.current) return;
    if (openOnSelectedDay.length < 1) return;
    setExpandedSessionId((prev) => {
      if (prev) {
        if (scopedSessions.some((s) => s._id === prev)) return prev;
      }
      return openOnSelectedDay[0]._id;
    });
  }, [loading, openOnSelectedDay, scopedSessions]);

  const handleToggleSession = useCallback((id: string | null) => {
    setExpandedSessionId((prev) => {
      const next = id === null ? null : (prev === id ? null : id);
      if (next === null && (id === null || openOnSelectedDay.some((s) => s._id === id))) {
        userCollapsedOpenRef.current = true;
      } else if (next !== null) {
        userCollapsedOpenRef.current = false;
      }
      return next;
    });
  }, [openOnSelectedDay]);

  const excelClosedCount = scopedSessions.filter((s) => String(s.status || '').toLowerCase() !== 'open').length;

  const handleDownload = async (format: UrielCajaDownloadFormat) => {
    const toastId = toast.loading('Descargando Excel de facturación… Puede tardar.');
    try {
      const pdvId = String(
        filterPdv
        || activeStoreScope.activeSalesPointId
        || scopedSessions.find((s) => String(s.status || '') !== 'open')?.pointOfSaleId
        || '',
      ).trim();
      if (!pdvId) {
        toast.info('Elige un local para descargar el informe de ingresos', { id: toastId });
        return;
      }
      const pdv = pointsOfSale.find((p) => p._id === pdvId);
      const yearMonth = selectedDate.slice(0, 7);

      let billingSheets = null as ReturnType<typeof suggestBillingSheetsFromBrands> | null;
      if (businessId) {
        try {
          const [cfg, brands] = await Promise.all([
            getBrandBillingConfigRequest(businessId),
            listBrandsRequest(businessId),
          ]);
          if (cfg.sheets.length > 0) {
            billingSheets = syncBillingSheetsWithBrands(cfg.sheets, brands);
          } else {
            const suggested = suggestBillingSheetsFromBrands(brands);
            if (suggested.length > 0) billingSheets = suggested;
          }
        } catch (err) {
          console.warn('Facturación marcas no disponible; descarga usa plantilla por defecto', err);
        }
      }

      toast.loading(`Cargando facturación ${yearMonth}…`, { id: toastId });
      const [y, m] = yearMonth.split('-').map((n) => Number(n));
      const lastDay = new Date(y, m, 0).getDate();
      const exportFrom = localDayBoundsForKey(`${yearMonth}-01`).from;
      const exportTo = localDayBoundsForKey(`${yearMonth}-${String(lastDay).padStart(2, '0')}`).to;
      const exportRaw = await listRestaurantRegisterSessions(dataUserId, {
        businessId,
        dateFrom: exportFrom,
        dateTo: exportTo,
        full: true,
      });
      const exportSessions = filterRestaurantRegisterSessions(exportRaw, {
        businessId,
        pointOfSaleIds: pointsOfSale.map((p) => p._id),
      });

      toast.loading('Generando archivo Excel…', { id: toastId });
      const { rows, fileName, sheetNames } = await downloadUrielCajaClosings(exportSessions, {
        pointOfSaleId: pdvId,
        pointOfSaleName: pdv ? pointOfSaleDisplayLabel(pdv) : pdvId,
        businessName: String(currentBusiness?.name || '').trim() || undefined,
        yearMonth,
        billingSheets,
        format,
      });
      if (rows === 0) {
        toast.info('Aún no hay cierres de caja en este mes para ese local', { id: toastId });
        return;
      }
      const sheetsLabel = sheetNames.length ? sheetNames.join(' + ') : 'ingresos';
      if (format === 'google-sheets') {
        toast.success(
          `Descargado ${fileName}. Súbelo a Google Drive y ábrelo con Hojas de cálculo (${rows} día${rows === 1 ? '' : 's'}).`,
          { id: toastId, duration: 7000 },
        );
        return;
      }
      if (format === 'csv') {
        toast.success(
          `CSV ${sheetsLabel}: ${fileName} (${rows} día${rows === 1 ? '' : 's'})`,
          { id: toastId },
        );
        return;
      }
      toast.success(
        `Excel ${sheetsLabel}: ${fileName} (${rows} día${rows === 1 ? '' : 's'})`,
        { id: toastId },
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la descarga', { id: toastId });
    }
  };

  if (loading) {
    return (
      <Layout title="Caja">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-stone-300 border-t-[var(--v-blue,#2563eb)] rounded-full mx-auto mb-3" />
            <p className="text-sm text-stone-500">Cargando cajas...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Caja">
      <CajaTimelineBoard
        sessions={scopedSessions}
        selectedDate={selectedDate}
        onSelectedDateChange={(d) => { setSelectedDate(d); setExpandedSessionId(null); }}
        pointsOfSale={pointsOfSale}
        filterPdv={filterPdv}
        onFilterPdvChange={handleFilterPdvChange}
        onlyOpenNow={onlyOpenNow}
        onOnlyOpenNowChange={setOnlyOpenNow}
        dayStats={dayStats}
        excelClosedCount={excelClosedCount}
        onDownloadFormat={handleDownload}
        onBack={() => {
          if (expandedSessionId) {
            setExpandedSessionId(null);
            return;
          }
          if (viewingClosingSession) {
            setViewingClosingSession(null);
            return;
          }
          navigate(resolveCajaPageExitPath(), { replace: true });
        }}
        selectedSessionId={expandedSessionId}
        onSelectSession={handleToggleSession}
        onViewFullClosing={handleViewClosing}
        refreshing={refreshing}
        locationNoun={{ singular: 'Local', plural: 'locales', filterAll: 'Todos los locales' }}
      />
      {viewingClosingSession && (
        <ClosingViewModal
          session={viewingClosingSession}
          onClose={() => setViewingClosingSession(null)}
        />
      )}
    </Layout>
  );
}
