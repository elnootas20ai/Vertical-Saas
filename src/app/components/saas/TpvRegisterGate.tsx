import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useApp } from '../../context/AppContext';
import { usePointOfSaleAccess } from '../../hooks/usePointOfSaleAccess';
import { writeBillingSelection } from '../../lib/billingSelection';
import { formatAddonPriceShort } from '../../lib/planAddonCatalog';
import {
  listTpvRegisterSessionsRequest,
  createTpvRegisterSessionRequest,
  TpvRegisterSessionConflictError,
  updateTpvRegisterSessionRequest,
  pointOfSaleDisplayLabel,
  buildDeliverySidebarStoreRows,
  ensureDeliveryPdvForWorkCenter,
  type DeliverySidebarStoreRow,
  TPV_SESSION_SYNC_EVENT,
  type TpvRegisterSession,
  type TpvRegisterTransaction,
  type CashDenominationCount,
  type TpvCashCount,
  type TpvRegisterSummary,
  type PointOfSale,
  type DeliveryOrder,
  isTpvRegisterSessionOpen,
} from '../../lib/deliveryApi';
import { calcTpvExpectedCash, buildTpvRegisterSummary, sumCashReturns, sumCashStaffConsumption } from '../../lib/tpvCajaMath';
import { consumeSalaTpvLaunch } from '../../lib/salaTpvLaunch';
import { localCalendarDayKey, registerSessionSpansMultipleDays, tpvSessionBelongsToBusiness } from '../../lib/tpvCajaScope';
import { fetchShiftOrdersForSession } from '../../lib/registerShiftOrders';
import {
  buildAggregatorCashRows,
  applyManualAggregatorTotals,
  getClosingAggregatorPlatforms,
  aggregatorRowsFromClosingTotals,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { AggregatorClosingEditor } from './AggregatorClosingEditor';
import { RegisterShiftSalesBreakdown } from './RegisterShiftSalesBreakdown';
import { AggregatorCashSummary } from './AggregatorCashSummary';
import {
  filterStoresForWorkerAssignment,
  isInvitedWorkerUser,
} from '../../lib/pdvScope';
import { readDeliveryOpsSelectedPdvId, writeDeliveryOpsSelectedPdvId, resolvePreferenceToPdvId, pickDefaultActivePdvId, DELIVERY_ACTIVE_STORE_CHANGED } from '../../lib/deliveryOpsPdvSelection';
import { resolveBusinessScopeId, repairMissingRetailDeliveryPdvs } from '../../lib/deliverySetup';
import {
  loadRetailStoresForBusiness,
  readRetailScopeCacheForBusiness,
  writeRetailScopeCacheForBusiness,
} from '../../verticals/retailScopeRegistry';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { checkRestaurantRegisterClose } from '../../lib/restaurantCloseWarnings';
import { resolveRestaurantTpvPermissions } from '../../lib/restaurantTpvPermissions';
import { evaluateTpvClockInGate, tpvClockInBlockMessage } from '../../lib/tpvClockInGate';
import type { Business } from '../../lib/businessApi';
import {
  evaluateTpvRegisterLoadGate,
  resolveTpvRegisterBidAtStart,
  resolveTpvRegisterScope,
  shouldApplyTpvRegisterLoadResult,
} from '../../lib/tpvRegisterScope';
import {
  exitTpvTabletSessionPath,
  isTpvTabletWorkerPath,
  mergeTabletBindingPdv,
  readTpvTabletBinding,
} from '../../lib/tpvTabletSession';

function isTabletTpvBootstrapReady(): boolean {
  if (typeof window === 'undefined') return false;
  const binding = readTpvTabletBinding();
  return Boolean(
    binding?.pdvId
    && binding?.businessId
    && isTpvTabletWorkerPath(window.location.pathname),
  );
}
import {
  filterUsersForStoreClockin,
  loadClockedInStoreWorkers,
  pickDefaultOrderTakerForSession,
  buildTpvActiveStaff,
  clockinIdsMatch,
  clockinValidForRegisterSession,
  type TpvClockedInWorker,
} from '../../lib/tpvClockedInWorkers';
import { pickPreferredMemberClockin, todayDateStr } from '../../lib/clockinHistoryUtils';
import { deriveEffectiveClockinStatus, isClockinPresent } from '../../lib/clockinStatus';
import { normalizeClockinUserId } from '../../lib/clockinUserId';
import { ClockedInWorkerBubbles } from './ClockedInWorkerBubbles';
import { useTpvOrderFlowActive } from '../../context/TpvChromeContext';
import { TpvCashOpsModal } from './TpvCashOpsModal';
import { TpvPrinterSetupModal, type TpvPrinterScope } from './TpvPrinterSetupPanel';
import { setActivePrinterScope } from '../../lib/vertialPrint';
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../lib/tpvTabletOffline';
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  listClockins,
  type ClockinRecord,
} from '../../lib/clockinsApi';
import type { WorkCenter } from '../../lib/workCentersApi';
import { listUsersRequest, type AuthUser } from '../../lib/authApi';
import {
  Lock, Unlock, Banknote, CreditCard, Phone as PhoneIcon, Wifi, User, Monitor,
  Printer, Smartphone, CheckCircle2, X, AlertTriangle, Calculator, ChevronDown,
  ChevronUp, Clock, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3,
  MapPin, Store, Plus, LogIn, UserCheck, Loader2, RefreshCw, Coffee, Square,
} from 'lucide-react';

// ─── Denomination config (EUR) ──────────────────────────────────────────────

const DENOMINATIONS: { key: keyof CashDenominationCount; label: string; value: number; type: 'bill' | 'coin' }[] = [
  { key: 'bills_500', label: '500€', value: 500, type: 'bill' },
  { key: 'bills_200', label: '200€', value: 200, type: 'bill' },
  { key: 'bills_100', label: '100€', value: 100, type: 'bill' },
  { key: 'bills_50', label: '50€', value: 50, type: 'bill' },
  { key: 'bills_20', label: '20€', value: 20, type: 'bill' },
  { key: 'bills_10', label: '10€', value: 10, type: 'bill' },
  { key: 'bills_5', label: '5€', value: 5, type: 'bill' },
  { key: 'coins_2', label: '2€', value: 2, type: 'coin' },
  { key: 'coins_1', label: '1€', value: 1, type: 'coin' },
  { key: 'coins_050', label: '0,50€', value: 0.50, type: 'coin' },
  { key: 'coins_020', label: '0,20€', value: 0.20, type: 'coin' },
  { key: 'coins_010', label: '0,10€', value: 0.10, type: 'coin' },
  { key: 'coins_005', label: '0,05€', value: 0.05, type: 'coin' },
  { key: 'coins_002', label: '0,02€', value: 0.02, type: 'coin' },
  { key: 'coins_001', label: '0,01€', value: 0.01, type: 'coin' },
];

function emptyCashDenominationCount(): CashDenominationCount {
  return DENOMINATIONS.reduce((acc, d) => {
    acc[d.key] = 0;
    return acc;
  }, {} as CashDenominationCount);
}

function calcDenominationTotal(counts: CashDenominationCount): number {
  return DENOMINATIONS.reduce((sum, d) => sum + (counts[d.key] || 0) * d.value, 0);
}

/** Aproxima un importe en billetes/monedas EUR para el conteo de apertura. */
function buildDenominationFromAmount(amount: number): CashDenominationCount {
  const counts = emptyCashDenominationCount();
  let remaining = Math.round(Number(amount || 0) * 100) / 100;
  if (remaining <= 0) return counts;
  for (const d of DENOMINATIONS) {
    const n = Math.floor(remaining / d.value);
    if (n > 0) {
      counts[d.key] = n;
      remaining = Math.round((remaining - n * d.value) * 100) / 100;
    }
  }
  return counts;
}

function findLastClosedTpvSession(
  sessions: TpvRegisterSession[],
  pdvId: string,
  terminalId: string,
): TpvRegisterSession | null {
  const pid = String(pdvId || '').trim();
  const tid = String(terminalId || '').trim();
  if (!pid) return null;
  const matches = sessions
    .filter((s) => s.status === 'closed' && String(s.pointOfSaleId || '').trim() === pid)
    .filter((s) => !tid || String(s.terminalId || '').trim() === tid)
    .sort(
      (a, b) =>
        new Date(b.closedAt || b.updatedAt || 0).getTime()
        - new Date(a.closedAt || a.updatedAt || 0).getTime(),
    );
  return matches[0] || null;
}

function tpvSessionMatchesStoreRef(
  session: TpvRegisterSession,
  refId: string,
  pointsOfSale: PointOfSale[],
): boolean {
  const pick = String(refId || '').trim();
  const sp = String(session.pointOfSaleId || '').trim();
  if (!pick || !sp) return false;
  if (sp === pick) return true;
  const pdv = pointsOfSale.find((p) => p._id === pick);
  if (pdv && sp === String(pdv.workCenterId || '').trim()) return true;
  const byWc = pointsOfSale.find((p) => String(p.workCenterId || '').trim() === sp);
  if (byWc && byWc._id === pick) return true;
  return false;
}

function shouldKeepTpvSessionInList(
  session: TpvRegisterSession,
  scopedPdvs: PointOfSale[],
  businessId?: string,
): boolean {
  const pdvIds = new Set(scopedPdvs.map((p) => p._id));
  if (businessId && !tpvSessionBelongsToBusiness(session, businessId, pdvIds)) {
    return false;
  }
  const pid = String(session.pointOfSaleId || '').trim();
  const matchesScopedPdv = () =>
    Boolean(pid && (scopedPdvs.some((p) => p._id === pid) || scopedPdvs.some((p) => String(p.workCenterId || '').trim() === pid)));
  if (isTpvRegisterSessionOpen(session)) {
    return matchesScopedPdv();
  }
  if (!pid) return !businessId;
  return matchesScopedPdv();
}

// ─── Cash Count Grid ────────────────────────────────────────────────────────

function CashCountGrid({ counts, onChange, compact = false }: {
  counts: CashDenominationCount;
  onChange: (counts: CashDenominationCount) => void;
  compact?: boolean;
}) {
  const total = calcDenominationTotal(counts);
  const bills = DENOMINATIONS.filter(d => d.type === 'bill');
  const coins = DENOMINATIONS.filter(d => d.type === 'coin');

  const updateCount = (key: keyof CashDenominationCount, val: number) => {
    onChange({ ...counts, [key]: Math.max(0, val) });
  };

  const renderRow = (d: typeof DENOMINATIONS[0]) => {
    const qty = counts[d.key] || 0;
    const subtotal = qty * d.value;
    return (
      <div key={d.key} className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
        <span className={`text-right font-semibold ${compact ? 'w-11 text-xs' : 'w-14 text-sm'} ${d.type === 'bill' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>{d.label}</span>
        <span className="text-gray-400 text-xs">×</span>
        <div className="flex items-center gap-1">
          <button onClick={() => updateCount(d.key, qty - 1)} className={`rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 ${compact ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-sm'}`}>-</button>
          <input type="number" min="0" value={qty || ''} onChange={e => updateCount(d.key, parseInt(e.target.value) || 0)}
            className={`text-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none ${compact ? 'w-11 h-6 text-xs' : 'w-14 h-7 text-sm'}`} />
          <button onClick={() => updateCount(d.key, qty + 1)} className={`rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 ${compact ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-sm'}`}>+</button>
        </div>
        <span className={`font-medium text-gray-600 dark:text-gray-400 text-right ${compact ? 'text-xs w-12' : 'text-sm w-16'}`}>{subtotal > 0 ? `${subtotal.toFixed(2)}€` : '—'}</span>
      </div>
    );
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      <div className={`grid grid-cols-2 ${compact ? 'gap-x-2 gap-y-1' : 'gap-4'}`}>
        <div className="min-w-0">
          <h5 className={`font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1.5 flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs mb-2'}`}><Banknote className="w-3 h-3 shrink-0" /> Billetes</h5>
          <div className={compact ? 'space-y-1' : 'space-y-1.5'}>{bills.map(renderRow)}</div>
        </div>
        <div className="min-w-0">
          <h5 className={`font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs mb-2'}`}><DollarSign className="w-3 h-3 shrink-0" /> Monedas</h5>
          <div className={compact ? 'space-y-1' : 'space-y-1.5'}>{coins.map(renderRow)}</div>
        </div>
      </div>
      <div className={`flex items-center justify-between bg-gray-900 dark:bg-gray-100 rounded-xl ${compact ? 'p-2' : 'p-3'}`}>
        <span className={`font-bold text-white dark:text-gray-900 flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}><Calculator className="w-3.5 h-3.5" /> Total contado</span>
        <span className={`font-bold text-white dark:text-gray-900 ${compact ? 'text-lg' : 'text-2xl'}`}>{total.toFixed(2)}€</span>
      </div>
    </div>
  );
}

// ─── Context for active register ────────────────────────────────────────────

export interface TpvRegisterContextType {
  session: TpvRegisterSession;
  addTransaction: (tx: Omit<TpvRegisterTransaction, 'id' | 'date'>) => Promise<void>;
  performCashCount: (countedBy: string, denominations: CashDenominationCount, notes?: string) => Promise<void>;
  addIncident: (incident: Omit<import('../../lib/deliveryApi').TpvIncident, 'id' | 'date'>) => Promise<void>;
  requestClose: () => void;
  requestCashCount: () => void;
  requestIncident: () => void;
  expectedCash: number;
  clockedInWorkers: TpvClockedInWorker[];
  clockedInWorkersLoading: boolean;
  selectedOrderTakerId: string | null;
  setSelectedOrderTakerId: (workerId: string) => void;
  refreshClockedInWorkers: () => Promise<void>;
  requestClockIn: () => void;
}

/** null = sin caja abierta (o fuera del gate) · objeto = caja activa */
const TpvRegisterContext = createContext<TpvRegisterContextType | null>(null);

/** true solo cuando el gate ya pasó la apertura de caja y muestra el tablero operativo. */
const TpvRegisterBoardReadyContext = createContext(false);

export function TpvRegisterProvider({
  value,
  children,
}: {
  value: TpvRegisterContextType;
  children: ReactNode;
}) {
  return <TpvRegisterContext.Provider value={value}>{children}</TpvRegisterContext.Provider>;
}

export function useTpvRegisterIfOpen(): TpvRegisterContextType | null {
  return useContext(TpvRegisterContext);
}

export function useTpvRegister(): TpvRegisterContextType {
  const ctx = useTpvRegisterIfOpen();
  if (!ctx) {
    throw new Error('Abre la caja antes de usar el TPV');
  }
  return ctx;
}

/** El gate solo monta el tablero TPV tras abrir caja; evita bloquear «Nuevo» por contexto desincronizado. */
export function useTpvRegisterBoardReady(): boolean {
  return useContext(TpvRegisterBoardReadyContext);
}

// ─── Opening Screen ─────────────────────────────────────────────────────────

interface OpeningData {
  workerId?: string;
  workerName: string;
  pointOfSaleId: string;
  pointOfSaleName: string;
  terminalId: string;
  terminalName: string;
  datafonName: string;
  printerName: string;
  counts: CashDenominationCount;
}

function OpeningScreen({ onOpen, loading: parentLoading, pointsOfSale, workCenters, workerOptions, registerSessions, restrictedToPdvId, onClearStorePick, isManagerView = false, isTabletMode = false, tabletStoreLabel, onOpeningPdvChange, onRequestPrinter }: {
  onOpen: (data: OpeningData) => void;
  loading: boolean;
  pointsOfSale: PointOfSale[];
  workCenters: WorkCenter[];
  workerOptions: { id: string; name: string }[];
  /** Sesiones TPV (abiertas y cerradas) para sugerir efectivo del cierre anterior. */
  registerSessions: TpvRegisterSession[];
  /** Gerente: PDV acotado (tienda elegida en Centro de operaciones o al abrir caja). */
  restrictedToPdvId?: string | null;
  onClearStorePick?: () => void;
  /** true = encargado/gerente elige tienda; false = trabajador con tienda ya asignada. */
  isManagerView?: boolean;
  /** Tablet TPV: tienda fijada en activación; solo contar efectivo y abrir. */
  isTabletMode?: boolean;
  tabletStoreLabel?: string;
  /** Sincroniza la tienda elegida en apertura para fichaje antes de abrir caja. */
  onOpeningPdvChange?: (pdvId: string) => void;
  onRequestPrinter?: (ctx: { pdvId: string; terminalId?: string }) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const [workerName, setWorkerName] = useState('');
  const [selectedPdvId, setSelectedPdvId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [counts, setCounts] = useState<CashDenominationCount>(() => emptyCashDenominationCount());
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => (
    !isTabletMode && workerOptions.length === 1 ? workerOptions[0].id : ''
  ));
  const [tabletStep, setTabletStep] = useState<1 | 2>(1);
  const salaLaunchRef = useRef<string | null>(consumeSalaTpvLaunch());
  const lastRestrictedPdvRef = useRef('');
  const onOpeningPdvChangeRef = useRef(onOpeningPdvChange);
  onOpeningPdvChangeRef.current = onOpeningPdvChange;
  const total = calcDenominationTotal(counts);
  /** 0 € de fondo inicial es válido; en tablet basta con llegar al paso 2. */
  const cashCountReady = isTabletMode ? tabletStep === 2 : true;
  const hasNonZeroCount = total > 0;

  const storeRows = useMemo(
    () => buildDeliverySidebarStoreRows(workCenters, pointsOfSale).filter((r) => !r.inactive),
    [workCenters, pointsOfSale],
  );

  const openablePdvs = useMemo(() => {
    const ids = new Set(
      storeRows.filter((r) => r.pdvId && !r.needsPdv).map((r) => String(r.pdvId)),
    );
    const linked = pointsOfSale.filter((p) => p.active !== false && ids.has(p._id));
    if (linked.length > 0) return linked;
    return pointsOfSale.filter((p) => p.active !== false);
  }, [storeRows, pointsOfSale]);

  const allActivePdvs = useMemo(() => openablePdvs, [openablePdvs]);
  const displayPdvs = useMemo(() => {
    if (!restrictedToPdvId) return allActivePdvs;
    const fromOpenable = allActivePdvs.filter((p) => p._id === restrictedToPdvId);
    if (fromOpenable.length > 0) return fromOpenable;
    const assigned = pointsOfSale.find(
      (p) => p._id === restrictedToPdvId && p.active !== false,
    );
    return assigned ? [assigned] : [];
  }, [allActivePdvs, restrictedToPdvId, pointsOfSale]);

  const hasStores = allActivePdvs.length > 0 || storeRows.some((r) => r.needsPdv);
  const pointOfSaleAccess = usePointOfSaleAccess(Math.max(allActivePdvs.length, storeRows.length));
  const selectedPdv = pointsOfSale.find(p => p._id === selectedPdvId)
    || (isTabletMode && restrictedToPdvId
      ? pointsOfSale.find((p) => p._id === restrictedToPdvId)
      : undefined);
  const availableTerminals = selectedPdv?.terminals.filter(t => t.active) || [];
  const selectedTerminal = availableTerminals.find(t => t.id === selectedTerminalId);

  const previousCloseCash = useMemo(() => {
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const terminalId = selectedTerminal?.id || (isTabletMode ? `tablet-${pdvId || 'default'}` : '');
    const last = findLastClosedTpvSession(registerSessions, pdvId, terminalId);
    if (!last) return null;
    const amount = Number(last.finalCashAmount ?? calcDenominationTotal(last.closingCashCount || {}));
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
  }, [registerSessions, selectedPdv, restrictedToPdvId, selectedTerminal, isTabletMode]);

  const previousCloseLabel = useMemo(() => {
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const terminalId = selectedTerminal?.id || (isTabletMode ? `tablet-${pdvId || 'default'}` : '');
    const last = findLastClosedTpvSession(registerSessions, pdvId, terminalId);
    if (!last?.closedAt) return '';
    try {
      return new Date(last.closedAt).toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  }, [registerSessions, selectedPdv, restrictedToPdvId, selectedTerminal, isTabletMode]);

  const effectiveTerminalName = selectedTerminal
    ? (selectedTerminal.code || selectedTerminal.name)
    : (isTabletMode ? 'Tablet' : '');
  const effectiveDatafon = selectedTerminal?.datafonName || '';
  const effectivePrinter = selectedTerminal?.printerName || '';

  const effectiveWorkerName = useCallback(() => {
    const w = workerOptions.find((x) => x.id === selectedWorkerId);
    return (w?.name || '').trim();
  }, [workerOptions, selectedWorkerId]);

  const hasWorkers = workerOptions.length > 0;
  const hasResolvedPdv = Boolean(selectedPdv) || (isTabletMode && Boolean(restrictedToPdvId));
  const canOpen = hasWorkers
    && Boolean(effectiveWorkerName())
    && hasResolvedPdv
    && (Boolean(selectedTerminal) || isTabletMode);

  const workerOptionsKey = useMemo(
    () => workerOptions.map((w) => `${w.id}:${w.name}`).join('|'),
    [workerOptions],
  );

  useEffect(() => {
    if (isTabletMode || workerOptions.length === 0) return;
    if (selectedWorkerId) return;
    if (workerOptions.length === 1) {
      setSelectedWorkerId(workerOptions[0].id);
      return;
    }
    const cached = (() => {
      try { return localStorage.getItem('vertial.tpvRapido.cashierName') || ''; } catch { return ''; }
    })().trim().toLowerCase();
    if (!cached) return;
    const match = workerOptions.find((w) => w.name.trim().toLowerCase() === cached);
    if (match) setSelectedWorkerId(match.id);
  }, [workerOptionsKey, isTabletMode, selectedWorkerId, workerOptions]);

  useEffect(() => {
    if (!restrictedToPdvId) return;
    const pdvChanged = lastRestrictedPdvRef.current !== restrictedToPdvId;
    lastRestrictedPdvRef.current = restrictedToPdvId;
    setSelectedPdvId(restrictedToPdvId);
    if (pdvChanged && !isTabletMode) setSelectedTerminalId('');
  }, [restrictedToPdvId, isTabletMode]);

  // Autoseleccionar el único PDV activo cuando solo hay uno (cuentas nuevas).
  useEffect(() => {
    if (restrictedToPdvId || selectedPdvId) return;
    if (displayPdvs.length === 1) {
      const onlyId = displayPdvs[0]._id;
      setSelectedPdvId(onlyId);
      onOpeningPdvChangeRef.current?.(onlyId);
    }
  }, [displayPdvs, selectedPdvId, restrictedToPdvId]);

  // Autoseleccionar el único terminal activo del PDV elegido.
  useEffect(() => {
    if (!selectedPdv) return;
    if (selectedTerminalId) return;
    if (availableTerminals.length === 1) {
      setSelectedTerminalId(availableTerminals[0].id);
    }
  }, [selectedPdv, selectedTerminalId, availableTerminals]);

  // Autoseleccionar terminal TPV lanzado desde Sala.
  useEffect(() => {
    const terminalId = salaLaunchRef.current;
    if (!terminalId || !selectedPdv) return;
    const match = availableTerminals.find((t) => t.id === terminalId);
    if (match) {
      setSelectedTerminalId(match.id);
      salaLaunchRef.current = null;
    }
  }, [selectedPdv, availableTerminals]);

  // Tablet: terminal fijo al activar (código sala SALA-* o primer terminal del PDV).
  useEffect(() => {
    if (!isTabletMode || !selectedPdv || selectedTerminalId) return;

    const binding = readTpvTabletBinding();
    const salaTerminalId = String(binding?.salaTerminalId || '').trim();
    if (salaTerminalId) {
      const match = availableTerminals.find((t) => t.id === salaTerminalId);
      if (match) {
        setSelectedTerminalId(match.id);
        return;
      }
    }

    if (availableTerminals.length > 0) {
      setSelectedTerminalId(availableTerminals[0].id);
    }
  }, [isTabletMode, selectedPdv, selectedTerminalId, availableTerminals]);

  const handleSelectStoreRow = async (row: DeliverySidebarStoreRow) => {
    if (row.pdvId && !row.needsPdv) {
      handleSelectPdv(row.pdvId);
      return;
    }
    const wc = workCenters.find((w) => w._id === row.workCenterId);
    if (wc && dataUserId) {
      try {
        const ensured = await ensureDeliveryPdvForWorkCenter(dataUserId, wc, {
          business: currentBusiness ?? null,
        });
        if (ensured?._id) {
          handleSelectPdv(ensured._id);
          return;
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'No se pudo activar el PDV de esta tienda',
        );
        return;
      }
    }
    toast.error('Completa la dirección de esta tienda en Ajustes (mín. 5 caracteres) y guarda.');
    navigate('/saas/settings/tienda');
  };

  const handleSelectPdv = (pdvId: string) => {
    setSelectedPdvId(pdvId);
    setSelectedTerminalId('');
    onOpeningPdvChange?.(pdvId);
  };

  const handleSubmit = () => {
    const wName = effectiveWorkerName();
    onOpen({
      workerId: selectedWorkerId || undefined,
      workerName: wName,
      pointOfSaleId: selectedPdv?._id || restrictedToPdvId || '',
      pointOfSaleName: selectedPdv ? pointOfSaleDisplayLabel(selectedPdv) : (tabletStoreLabel || ''),
      terminalId: selectedTerminal?.id || (isTabletMode ? `tablet-${selectedPdv?._id || restrictedToPdvId || 'default'}` : ''),
      terminalName: effectiveTerminalName || 'Tablet',
      datafonName: effectiveDatafon,
      printerName: effectivePrinter,
      counts,
    });
  };

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

  const goBack = () => {
    if (isTabletMode) {
      navigate(exitTpvTabletSessionPath(), { replace: true });
      return;
    }
    try {
      if (window.history.length > 1) window.history.back();
      else navigate('/saas/delivery-ops');
    } catch {
      // ignore
    }
  };

  const goToPdvBilling = () => {
    const resolvedUserId = user?.id || (user as { user_id?: string } | null)?.user_id || '';
    if (resolvedUserId) {
      writeBillingSelection(resolvedUserId, {
        selectedPlanId: 'pro',
        billingMode: 'monthly',
        requestedAddon: pointOfSaleAccess.needsPointOfSaleAddon ? 'extra_pdv' : null,
      });
    }
    navigate('/saas/settings/facturacion');
  };

  const handlePointOfSaleAction = () => {
    if (pointOfSaleAccess.canCreatePointOfSale) {
      navigate('/saas/settings/tienda?action=new-pdv');
      return;
    }
    goToPdvBilling();
  };

  const pointOfSaleActionLabel = pointOfSaleAccess.canCreatePointOfSale
    ? 'Nuevo PDV'
    : pointOfSaleAccess.needsPointOfSaleAddon
      ? 'Añadir PDV extra'
      : 'Multi-PDV (PRO)';
  const pointOfSaleActionTitle = pointOfSaleAccess.canCreatePointOfSale
    ? `Crear un nuevo punto de venta (${pointsOfSale.length}/${pointOfSaleAccess.includedPointOfSaleLimit})`
    : pointOfSaleAccess.needsPointOfSaleAddon
      ? `Tu plan PRO incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Ampliación: ${formatAddonPriceShort('extra_pdv')}.`
      : `Tu plan ${pointOfSaleAccess.planLabel} incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Sube a PRO para crear más.`;

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const terminalSectionRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const openingSteps = useMemo(() => {
    if (isTabletMode) {
      const wDone = Boolean(effectiveWorkerName());
      return [
        {
          id: 'worker',
          label: 'Quién abre',
          done: wDone && tabletStep > 1,
          current: tabletStep === 1,
        },
        {
          id: 'cash',
          label: 'Efectivo',
          done: tabletStep === 2,
          current: tabletStep === 2,
        },
        {
          id: 'tpv',
          label: 'TPV',
          done: false,
          current: false,
        },
      ];
    }
    const steps: { id: string; label: string; done: boolean; current: boolean }[] = [];
    const wDone = Boolean(effectiveWorkerName());
    steps.push({ id: 'worker', label: 'Trabajador', done: wDone, current: !wDone });
    if (isManagerView && !restrictedToPdvId && hasStores) {
      const pDone = Boolean(selectedPdvId);
      steps.push({ id: 'pdv', label: 'Tienda', done: pDone, current: wDone && !pDone });
    }
    const tDone = Boolean(selectedTerminalId);
    steps.push({
      id: 'terminal',
      label: 'Terminal',
      done: tDone,
      current: wDone && Boolean(selectedPdvId || restrictedToPdvId) && !tDone,
    });
    steps.push({
      id: 'cash',
      label: 'Efectivo',
      done: wDone && tDone,
      current: wDone && tDone && !hasNonZeroCount,
    });
    return steps;
  }, [
    isTabletMode,
    effectiveWorkerName,
    isManagerView,
    restrictedToPdvId,
    hasStores,
    selectedPdvId,
    selectedTerminalId,
    hasNonZeroCount,
    cashCountReady,
    tabletStep,
  ]);

  const updateScrollHint = useCallback(() => {
    const el = bodyScrollRef.current;
    if (!el) {
      setShowScrollHint(false);
      return;
    }
    const overflow = el.scrollHeight > el.clientHeight + 12;
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 32;
    setShowScrollHint(overflow && notAtBottom);
  }, []);

  useEffect(() => {
    updateScrollHint();
    const el = bodyScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollHint, { passive: true });
    const ro = new ResizeObserver(updateScrollHint);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollHint);
      ro.disconnect();
    };
  }, [updateScrollHint, selectedPdvId, selectedTerminalId, hasWorkers, hasStores]);

  const pdvById = useMemo(() => new Map(pointsOfSale.map((p) => [p._id, p])), [pointsOfSale]);

  useEffect(() => {
    if (!selectedPdvId || selectedTerminalId) return;
    terminalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedPdvId, selectedTerminalId]);

  const displayStoreName = selectedPdv
    ? pointOfSaleDisplayLabel(selectedPdv)
    : tabletStoreLabel || '';

  return (
    <div className="h-[100svh] bg-gray-50 dark:bg-gray-900 flex flex-col p-2 sm:p-3 overflow-hidden">
      <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${isTabletMode ? 'max-w-2xl' : 'max-w-6xl'} mx-auto flex-1 min-h-0 flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className={`border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 relative ${isTabletMode ? 'px-4 py-2.5' : 'px-5 sm:px-6 py-3 sm:py-4'}`}>
          <div className={`bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center shrink-0 ${isTabletMode ? 'w-9 h-9' : 'w-11 h-11'}`}>
            <Unlock className={`text-emerald-600 ${isTabletMode ? 'w-4 h-4' : 'w-5 h-5'}`} />
          </div>
          <div className="flex-1 min-w-0">
            {isTabletMode || selectedPdv ? (
              <>
                <h1 className={`font-bold text-gray-900 dark:text-gray-100 leading-tight flex items-center gap-2 truncate ${isTabletMode ? 'text-base' : 'text-lg sm:text-xl'}`}>
                  <Store className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="truncate">{displayStoreName || 'Tu tienda'}</span>
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                  {isTabletMode
                    ? tabletStep === 1
                      ? 'Paso 1 · Elige quién abre la caja hoy'
                      : effectiveWorkerName()
                        ? `Paso 2 · ${effectiveWorkerName()} cuenta el efectivo`
                        : 'Paso 2 · Conteo de efectivo inicial'
                    : `Apertura de caja${selectedPdv?.code ? ` · ${selectedPdv.code}` : ''}${selectedTerminal ? ` · Terminal ${selectedTerminal.code || selectedTerminal.name}` : ''}`}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Apertura de caja</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Selecciona punto de venta, terminal y cuenta el efectivo</p>
              </>
            )}
          </div>
          {cashCountReady && (
            <span className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
              Contado: {total.toFixed(2)}€
            </span>
          )}
          {onRequestPrinter && (
            <button
              type="button"
              onClick={() => onRequestPrinter({
                pdvId: selectedPdvId || restrictedToPdvId || '',
                terminalId: selectedTerminalId || undefined,
              })}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
              aria-label="Impresora"
              title="Impresora de tickets"
            >
              <Printer className="w-5 h-5 text-gray-500" />
            </button>
          )}
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
            aria-label="Salir"
            title="Salir"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Pasos visibles (scroll abajo en móvil) */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
          {isTabletMode ? (
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 text-center sm:text-left">
              {tabletStep === 1
                ? 'Tu fichaje se registra al abrir la caja · El resto puede fichar después'
                : 'Cuenta el dinero en caja antes de empezar'}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            {openingSteps.map((s, idx) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  s.current
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                    : s.done
                      ? 'border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      : 'border-gray-200 bg-white/60 text-gray-400 dark:border-gray-700 dark:bg-gray-800/40'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    s.done ? 'bg-emerald-600 text-white' : s.current ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700'
                  }`}
                >
                  {s.done ? '✓' : idx + 1}
                </span>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Body: 2 columns on lg+ (tablet = solo efectivo) */}
        <div
          ref={bodyScrollRef}
          className={`flex-1 min-h-0 ${isTabletMode ? 'flex flex-col overflow-y-auto' : 'grid grid-cols-1 lg:grid-cols-5 gap-0 overflow-y-auto lg:overflow-hidden'} relative`}
        >
          {isTabletMode && tabletStep === 1 && (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  <User className="w-3 h-3 inline mr-1" />
                  ¿Quién abre la caja? *
                </label>
                {hasWorkers ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {workerOptions.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setSelectedWorkerId(w.id)}
                        className={`p-3 min-h-[56px] rounded-xl border-2 text-left transition-all touch-manipulation ${
                          selectedWorkerId === w.id
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            selectedWorkerId === w.id
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            <User className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-base text-gray-900 dark:text-gray-100 truncate">{w.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Toca para seleccionar</div>
                          </div>
                          {selectedWorkerId === w.id && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 ml-auto" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
                    No hay miembros en el equipo. Añade trabajadores en <span className="font-bold">Equipo</span> para poder abrir caja.
                  </div>
                )}
              </div>
              {displayStoreName && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">Tienda</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                    {displayStoreName}
                  </p>
                </div>
              )}
            </div>
          )}

          {isTabletMode && tabletStep === 2 && (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 flex flex-col">
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Abre la caja</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{effectiveWorkerName()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTabletStep(1)}
                  className="text-xs font-semibold text-emerald-600 hover:underline shrink-0"
                >
                  Cambiar
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Conteo de efectivo *</label>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-md">
                  0 € también es válido
                </span>
              </div>
              {previousCloseCash != null && (
                <div className="mb-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-1">
                    Efectivo al cerrar{previousCloseLabel ? ` (${previousCloseLabel})` : ''}
                  </p>
                  <p className="text-lg font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                    {previousCloseCash.toFixed(2)}€
                  </p>
                  <button
                    type="button"
                    onClick={() => setCounts(buildDenominationFromAmount(previousCloseCash))}
                    className="mt-2 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
                  >
                    Usar como fondo inicial
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <CashCountGrid counts={counts} onChange={setCounts} compact />
              </div>
            </div>
          )}

          {/* Left panel: who + where (oculto en tablet) */}
          {!isTabletMode && (
          <div className="lg:col-span-3 p-5 sm:p-6 lg:overflow-y-auto space-y-5 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
            {/* Worker */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Trabajador *</label>
              {hasWorkers ? (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className={`${inputCls} pl-10`}
                    autoFocus
                  >
                    <option value="">Selecciona…</option>
                    {workerOptions.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                  No se detecta ningún miembro en <span className="font-bold">Equipo</span>. No puedes abrir caja hasta conectar el equipo.
                </div>
              )}
            </div>

            {/* Tiendas / PDV — solo gerente elige; trabajador entra con tienda asignada al invitar */}
            {isManagerView && !restrictedToPdvId && hasStores && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"><MapPin className="w-3 h-3 inline mr-1" />Tienda *</label>
                  <button
                    type="button"
                    onClick={handlePointOfSaleAction}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
                      pointOfSaleAccess.canCreatePointOfSale
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                        : 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                    }`}
                    title={pointOfSaleActionTitle}
                  >
                    {pointOfSaleAccess.canCreatePointOfSale && <Plus className="w-3 h-3" />}
                    {pointOfSaleActionLabel}
                  </button>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                  {(storeRows.length > 0
                    ? storeRows
                    : allActivePdvs.map((pdv) => ({
                        rowId: pdv._id,
                        pdvId: pdv._id,
                        workCenterId: pdv.workCenterId,
                        title: pointOfSaleDisplayLabel(pdv),
                        code: pdv.code,
                        inactive: false,
                        needsPdv: false,
                      }))
                  ).map((row) => {
                    const pdv = row.pdvId ? pdvById.get(row.pdvId) : undefined;
                    const selected = Boolean(row.pdvId && selectedPdvId === row.pdvId);
                    const termCount = pdv?.terminals.filter((t) => t.active).length ?? 0;
                    return (
                      <button
                        key={row.rowId}
                        type="button"
                        onClick={() => handleSelectStoreRow(row)}
                        className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : row.needsPdv
                              ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 hover:border-amber-300'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1.5 truncate">
                          <Store className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate">{row.title}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {row.needsPdv
                            ? 'Completa dirección en Ajustes'
                            : `${row.code || pdv?.code || '—'} · ${termCount} TPV${termCount !== 1 ? 's' : ''}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {restrictedToPdvId && hasStores && displayPdvs.length === 0 && onClearStorePick && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-100">
                <p className="font-semibold">Esta tienda ya no está disponible.</p>
                <button type="button" onClick={onClearStorePick} className="mt-3 px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold text-xs">
                  Elegir otra tienda
                </button>
              </div>
            )}

            {restrictedToPdvId && hasStores && displayPdvs.length > 0 && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">Tu tienda</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                  {pointOfSaleDisplayLabel(displayPdvs[0])}
                </p>
              </div>
            )}

            {isManagerView && !restrictedToPdvId && !hasStores && !parentLoading && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 text-sm text-gray-600 dark:text-gray-400">
                <p>No hay PDV activos en esta empresa.</p>
                <button
                  type="button"
                  onClick={() => navigate('/saas/settings/tienda')}
                  className="mt-2 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  Configurar tiendas en Ajustes
                </button>
              </div>
            )}

            {parentLoading && !hasStores && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 text-sm text-gray-500 dark:text-gray-400">
                Cargando tiendas y PDV…
              </div>
            )}

            {selectedPdvId && !selectedTerminalId && (
              <div className="lg:hidden flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
                <ChevronDown className="w-4 h-4 shrink-0 animate-bounce" aria-hidden />
                Siguiente: elige un terminal más abajo
              </div>
            )}

            {/* Terminal selection from PDV (required) */}
            {selectedPdv ? (
              <div ref={terminalSectionRef} className="scroll-mt-4">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"><Monitor className="w-3 h-3 inline mr-1" />Terminal *</label>
                {availableTerminals.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {availableTerminals.map(t => (
                      <button key={t.id} onClick={() => setSelectedTerminalId(t.id)}
                        className={`p-2.5 rounded-xl border-2 text-left transition-all ${selectedTerminalId === t.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                        <div className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{t.code || t.name}</div>
                        {t.name && t.code && <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{t.name}</div>}
                        <div className="flex gap-2 mt-1 text-[11px] text-gray-400 flex-wrap">
                          {t.datafonName && <span className="flex items-center gap-0.5"><Smartphone className="w-2.5 h-2.5" />{t.datafonName}</span>}
                          {t.printerName && <span className="flex items-center gap-0.5"><Printer className="w-2.5 h-2.5" />{t.printerName}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                    Este PDV no tiene terminales activos. Configúralos en Ajustes.
                  </div>
                )}
              </div>
            ) : null}

            {/* Selected terminal info summary */}
            {selectedTerminal && (
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 rounded-lg font-medium flex items-center gap-1"><Monitor className="w-3 h-3" />{selectedTerminal.code || selectedTerminal.name}</span>
                {effectiveDatafon && <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 rounded-lg font-medium flex items-center gap-1"><Smartphone className="w-3 h-3" />{effectiveDatafon}</span>}
                {effectivePrinter && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg font-medium flex items-center gap-1"><Printer className="w-3 h-3" />{effectivePrinter}</span>}
              </div>
            )}
          </div>
          )}

          {isTabletMode && parentLoading && !selectedPdv && (
            <div className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              Cargando tu tienda…
            </div>
          )}

          {/* Right panel: cash count (solo modo gerente / no tablet) */}
          {!isTabletMode && (
          <div className="lg:col-span-2 p-5 sm:p-6 bg-gray-50 dark:bg-gray-900/40 lg:overflow-y-auto flex flex-col scroll-mt-4">
            {selectedTerminalId && !hasNonZeroCount && (
              <div className="lg:hidden flex items-center justify-center gap-2 mb-3 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold">
                <ChevronDown className="w-4 h-4 shrink-0 animate-bounce" aria-hidden />
                Cuenta el efectivo en esta zona (0 € si la caja está vacía)
              </div>
            )}
            <div className="flex items-center justify-between gap-2 mb-3">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Conteo de efectivo *</label>
              {canOpen && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-md">
                  0 € también es válido
                </span>
              )}
            </div>
            {previousCloseCash != null && (
              <div className="mb-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-1">
                  Efectivo al cerrar{previousCloseLabel ? ` (${previousCloseLabel})` : ''}
                </p>
                <p className="text-lg font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                  {previousCloseCash.toFixed(2)}€
                </p>
                <button
                  type="button"
                  onClick={() => setCounts(buildDenominationFromAmount(previousCloseCash))}
                  className="mt-2 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
                >
                  Usar como fondo inicial
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <CashCountGrid counts={counts} onChange={setCounts} />
            </div>
          </div>
          )}

          {showScrollHint && !isTabletMode && (
            <button
              type="button"
              onClick={() => bodyScrollRef.current?.scrollBy({ top: 220, behavior: 'smooth' })}
              className="lg:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900/90 text-white text-xs font-semibold shadow-lg backdrop-blur-sm"
            >
              <ChevronDown className="w-4 h-4 animate-bounce" />
              Ver más abajo
            </button>
          )}
        </div>

        {/* Footer */}
        <div className={`shrink-0 border-t border-gray-200 dark:border-gray-700 flex gap-2 bg-white dark:bg-gray-800 ${isTabletMode ? 'px-4 py-2' : 'px-5 sm:px-6 py-3 sm:py-4 gap-3'}`}>
          {isTabletMode ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (tabletStep === 2) setTabletStep(1);
                  else goBack();
                }}
                className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {tabletStep === 2 ? 'Anterior' : 'Salir'}
              </button>
              {tabletStep === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!effectiveWorkerName()) return;
                    setTabletStep(2);
                  }}
                  disabled={!effectiveWorkerName() || parentLoading}
                  className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                    effectiveWorkerName()
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Siguiente — Contar efectivo
                  <ChevronDown className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canOpen || parentLoading || !cashCountReady}
                  className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                    canOpen && cashCountReady
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Unlock className="w-4 h-4" />
                  Abrir caja y entrar al TPV — {total.toFixed(2)}€
                </button>
              )}
            </>
          ) : (
            <>
          <button
            type="button"
            onClick={goBack}
            className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canOpen || parentLoading}
            className={`flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${canOpen ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
          >
            <Unlock className="w-4 h-4" /> {`Abrir caja${selectedPdv ? ` — ${pointOfSaleDisplayLabel(selectedPdv)}` : ''}`} — {total.toFixed(2)}€ de fondo
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Por encima de TpvFullscreenShell (z-50) y modales de pedidos (z-60). */
const TPV_MODAL_Z = 'z-[100]';

function TpvGatePortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

// ─── Closing Screen ─────────────────────────────────────────────────────────

function ClosingScreen({ session, dataUserId, onClose, onCancel, restaurantWarnings = [] }: {
  session: TpvRegisterSession;
  dataUserId: string;
  onClose: (counts: CashDenominationCount, notes: string, aggregatorRows: AggregatorCashRow[]) => void;
  onCancel: () => void;
  restaurantWarnings?: string[];
}) {
  const [counts, setCounts] = useState<CashDenominationCount>({});
  const [notes, setNotes] = useState('');
  const [shiftOrders, setShiftOrders] = useState<DeliveryOrder[]>([]);
  const [shiftOrdersLoading, setShiftOrdersLoading] = useState(true);
  const [manualAggregatorTotals, setManualAggregatorTotals] = useState<Record<string, string>>({});
  const [manualInitialized, setManualInitialized] = useState(false);
  const countedTotal = calcDenominationTotal(counts);
  const expected = calcTpvExpectedCash(session);
  const diff = countedTotal - expected;
  const summary = buildTpvRegisterSummary(session);
  const cashStaffConsumption = sumCashStaffConsumption(session);
  const cashReturnsTotal = sumCashReturns(session);
  const closingPlatforms = useMemo(() => getClosingAggregatorPlatforms(), []);
  const aggregatorRows = useMemo(
    () => buildAggregatorCashRows(closingPlatforms, session, shiftOrders),
    [closingPlatforms, session, shiftOrders],
  );
  const finalAggregatorRows = useMemo(
    () => applyManualAggregatorTotals(aggregatorRows, manualAggregatorTotals),
    [aggregatorRows, manualAggregatorTotals],
  );

  useEffect(() => {
    if (manualInitialized || aggregatorRows.length === 0) return;
    const initial: Record<string, string> = {};
    for (const row of aggregatorRows) {
      initial[row.platform.channel] = row.totalSales > 0 ? row.totalSales.toFixed(2) : '';
    }
    setManualAggregatorTotals(initial);
    setManualInitialized(true);
  }, [aggregatorRows, manualInitialized]);

  const handleManualAggregatorChange = useCallback((channel: string, value: string) => {
    setManualAggregatorTotals((prev) => ({ ...prev, [channel]: value }));
  }, []);

  useEffect(() => {
    if (!dataUserId) {
      setShiftOrdersLoading(false);
      return;
    }
    setShiftOrdersLoading(true);
    void fetchShiftOrdersForSession(dataUserId, session)
      .then((orders) => setShiftOrders(orders))
      .catch(() => setShiftOrders([]))
      .finally(() => setShiftOrdersLoading(false));
  }, [dataUserId, session.pointOfSaleId, session.openedAt, session.closedAt, session.status]);

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col min-h-0" style={{ maxHeight: '96vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Lock className="w-5 h-5 text-red-500" /> Cierre de caja</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}{session.terminalName} · {session.workerName} · Abierta {new Date(session.openedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
          {restaurantWarnings.length > 0 ? (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600 p-4 space-y-1">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Sala con actividad pendiente
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-0.5">
                {restaurantWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">
                Puedes cerrar la caja igualmente; revisa que no queden cuentas sin cobrar.
              </p>
            </div>
          ) : null}
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <div className="text-xs text-green-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Ventas</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-400">{summary.totalSales.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <div className="text-xs text-red-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Devoluciones</div>
              <div className="text-lg font-bold text-red-700 dark:text-red-400">{summary.totalReturns.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="text-xs text-blue-600">Entradas</div>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{summary.totalCashIn.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
              <div className="text-xs text-orange-600">Salidas</div>
              <div className="text-lg font-bold text-orange-700 dark:text-orange-400">{summary.totalCashOut.toFixed(2)}€</div>
            </div>
          </div>

          {/* Sales by method */}
          <div className="flex gap-2 flex-wrap text-xs">
            {summary.salesByMethod.efectivo > 0 && <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 rounded-lg font-medium flex items-center gap-1"><Banknote className="w-3 h-3" /> Efectivo: {summary.salesByMethod.efectivo.toFixed(2)}€</span>}
            {summary.salesByMethod.tarjeta > 0 && <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 rounded-lg font-medium flex items-center gap-1"><CreditCard className="w-3 h-3" /> Tarjeta: {summary.salesByMethod.tarjeta.toFixed(2)}€</span>}
            {summary.salesByMethod.bizum > 0 && <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 rounded-lg font-medium flex items-center gap-1"><PhoneIcon className="w-3 h-3" /> Bizum: {summary.salesByMethod.bizum.toFixed(2)}€</span>}
            {summary.salesByMethod.online > 0 && <span className="px-2.5 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 rounded-lg font-medium flex items-center gap-1"><Wifi className="w-3 h-3" /> Online: {summary.salesByMethod.online.toFixed(2)}€</span>}
            <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg font-medium flex items-center gap-1"><Receipt className="w-3 h-3" /> {summary.totalTransactions} operaciones</span>
          </div>

          <RegisterShiftSalesBreakdown
            session={session}
            orders={shiftOrders}
            loading={shiftOrdersLoading}
            registerSummary={summary}
          />

          {/* Cash flow summary */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Fondo de apertura</span><span className="font-semibold text-gray-900 dark:text-gray-100">{session.initialCashAmount.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-green-600">+ Cobros en efectivo</span><span className="font-semibold text-green-700">{summary.salesByMethod.efectivo.toFixed(2)}€</span></div>
            {cashStaffConsumption > 0 && (
              <div className="flex justify-between"><span className="text-green-600">+ Consumo equipo (efectivo)</span><span className="font-semibold text-green-700">{cashStaffConsumption.toFixed(2)}€</span></div>
            )}
            <div className="flex justify-between"><span className="text-blue-600">+ Entradas de efectivo</span><span className="font-semibold text-blue-700">{summary.totalCashIn.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-red-600">− Devoluciones efectivo</span><span className="font-semibold text-red-700">{cashReturnsTotal.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-orange-600">− Salidas de efectivo</span><span className="font-semibold text-orange-700">{summary.totalCashOut.toFixed(2)}€</span></div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
              <span className="text-gray-900 dark:text-gray-100">= Efectivo esperado</span>
              <span className="text-emerald-700 dark:text-emerald-400 text-base">{expected.toFixed(2)}€</span>
            </div>
          </div>

          {/* Cash count */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Conteo de efectivo de cierre</h4>
            <CashCountGrid counts={counts} onChange={setCounts} />
          </div>

          {/* Difference */}
          {countedTotal > 0 && (
            <div className={`p-4 rounded-xl border-2 ${diff === 0 ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : diff > 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Diferencia</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{countedTotal.toFixed(2)}€ contado − {expected.toFixed(2)}€ esperado</div>
                </div>
                <div className={`text-2xl font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}€
                </div>
              </div>
              {diff === 0 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> La caja cuadra perfectamente</p>}
              {diff !== 0 && <p className="text-xs mt-1 flex items-center gap-1 {diff > 0 ? 'text-blue-600' : 'text-red-600'}"><AlertTriangle className="w-3 h-3" /> {diff > 0 ? 'Hay un sobrante de efectivo' : 'Falta efectivo en la caja'}</p>}
            </div>
          )}

          {session.cashCounts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Arqueos realizados</h4>
              <div className="space-y-1.5">
                {session.cashCounts.map(cc => (
                  <div key={cc.id} className="flex items-center justify-between text-xs p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}</span>
                      {cc.notes && <span className="text-gray-400 ml-2">· {cc.notes}</span>}
                    </div>
                    <span className={`font-semibold ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€ {cc.difference === 0 ? '✓' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(session.incidents?.length || 0) > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Incidencias ({session.incidents.length})</h4>
              <div className="space-y-1.5">
                {session.incidents.map(inc => (
                  <div key={inc.id} className="flex items-center justify-between text-xs p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${inc.severity === 'high' ? 'bg-red-100 text-red-700' : inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{inc.severity === 'high' ? 'Alta' : inc.severity === 'medium' ? 'Media' : 'Baja'}</span>
                      <span className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{inc.description}</span>
                    </div>
                    {inc.amount != null && <span className="font-semibold text-gray-700 dark:text-gray-300">{inc.amount.toFixed(2)}€</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas de cierre</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Observaciones del cierre..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <AggregatorClosingEditor
            autoRows={aggregatorRows}
            manualByChannel={manualAggregatorTotals}
            onManualChange={handleManualAggregatorChange}
            title="Cajas agregadores (turno)"
          />
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button type="button" onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button type="button" onClick={() => onClose(counts, notes, finalAggregatorRows)}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> Confirmar cierre de caja
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fichaje (TPV tablet / mostrador) ───────────────────────────────────────

async function fetchBusinessUsers(businessId: string): Promise<AuthUser[]> {
  const data = await listUsersRequest(businessId);
  return data.users || [];
}

function ClockInModal({
  storeLabel,
  businessId,
  ownerUserId,
  pdvId,
  workCenterId,
  sessionOpenedAt,
  onCancel,
  onChanged,
}: {
  storeLabel: string;
  businessId: string;
  ownerUserId: string;
  pdvId: string;
  workCenterId: string;
  sessionOpenedAt?: string | null;
  onCancel: () => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [team, setTeam] = useState<AuthUser[]>([]);
  const [clockins, setClockins] = useState<ClockinRecord[]>([]);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError('');
    try {
      const [users, records] = await Promise.all([
        fetchBusinessUsers(businessId),
        listClockins(businessId, {
          date: todayDateStr(),
          salesPointId: pdvId || undefined,
          workCenterId: workCenterId || undefined,
          storeScope: Boolean(pdvId),
        }),
      ]);
      const storeTeam = filterUsersForStoreClockin(
        users,
        ownerUserId,
        pdvId,
        workCenterId,
      );
      let teamList = storeTeam;
      if (ownerUserId && !storeTeam.some((u) => normalizeClockinUserId(u.user_id) === normalizeClockinUserId(ownerUserId))) {
        const ownerAccount = users.find((u) => normalizeClockinUserId(u.user_id) === normalizeClockinUserId(ownerUserId));
        if (ownerAccount && ownerAccount.status !== 'inactive') {
          teamList = [...storeTeam, ownerAccount];
        }
      }
      teamList.sort((a, b) => String(a.fullName || a.email || '').localeCompare(String(b.fullName || b.email || ''), 'es'));
      setTeam(teamList);
      setClockins(records);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar fichajes');
    } finally {
      setLoading(false);
    }
  }, [businessId, ownerUserId, pdvId, workCenterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayRecords = useMemo(() => {
    const today = todayDateStr();
    const map = new Map<string, ClockinRecord>();
    for (const r of clockins) {
      if (!clockinValidForRegisterSession(r, sessionOpenedAt, today)) continue;
      const mid = normalizeClockinUserId(r.member_id);
      if (!mid) continue;
      const prev = map.get(mid);
      map.set(mid, prev ? pickPreferredMemberClockin(prev, r) : r);
    }
    return map;
  }, [clockins, sessionOpenedAt]);

  const memberKey = (member: AuthUser) =>
    normalizeClockinUserId(member.user_id || member.id);

  const clockedInCount = team.filter((m) => {
    const r = todayRecords.get(memberKey(m));
    return r && isClockinPresent(deriveEffectiveClockinStatus(r));
  }).length;

  const storeClockinOpts = { store_team_clockin: true as const };

  const handleClockIn = async (member: AuthUser) => {
    const mid = memberKey(member);
    if (!mid) {
      setActionMsg({ type: 'err', text: 'No se pudo identificar al trabajador.' });
      return;
    }
    setActingId(member.user_id);
    setActionMsg(null);
    let already = false;
    const today = todayDateStr();
    try {
      const rec = await clockIn(businessId, mid, member.fullName || member.email || 'Trabajador', {
        device_type: 'tablet',
        sales_point_id: pdvId || undefined,
        sales_point_name: storeLabel || undefined,
        work_center_id: workCenterId || undefined,
        store_team_clockin: true,
      });
      already = Boolean((rec as ClockinRecord & { alreadyActive?: boolean }).alreadyActive);
      const normalized: ClockinRecord = {
        ...rec,
        member_id: normalizeClockinUserId(rec.member_id) || mid,
        status: rec.status === 'offline' || !rec.status ? 'active' : rec.status,
      };
      setClockins((prev) => {
        const rest = prev.filter((r) => r._id !== normalized._id);
        return [...rest, normalized];
      });
      setActionMsg({
        type: 'ok',
        text: already
          ? `${member.fullName || 'Trabajador'} ya estaba fichado. Pulsa Continuar.`
          : `${member.fullName || 'Trabajador'} fichado correctamente.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo fichar';
      setError(msg);
      setActionMsg({ type: 'err', text: msg });
      toast.error(msg);
      setActingId(null);
      return;
    }
    toast.success(
      already
        ? `${member.fullName || 'Trabajador'} — ya estaba fichado`
        : `${member.fullName || 'Trabajador'} — fichaje de entrada`,
    );
    onChanged?.();
    setActingId(null);
  };

  const handleBreak = async (member: AuthUser) => {
    const record = todayRecords.get(memberKey(member));
    if (!record) return;
    setActingId(member.user_id);
    try {
      if (record.status === 'break' || deriveEffectiveClockinStatus(record) === 'break') {
        await endBreak(record, undefined, storeClockinOpts);
        toast.success(`${member.fullName || 'Trabajador'} — descanso finalizado`);
      } else {
        await startBreak(record, undefined, storeClockinOpts);
        toast.success(`${member.fullName || 'Trabajador'} — descanso iniciado`);
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar el descanso');
    } finally {
      setActingId(null);
    }
  };

  const handleFinish = async (member: AuthUser) => {
    const record = todayRecords.get(memberKey(member));
    if (!record) return;
    setActingId(member.user_id);
    try {
      await clockOut(record, undefined, storeClockinOpts);
      toast.success(`${member.fullName || 'Trabajador'} — jornada finalizada`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo finalizar');
    } finally {
      setActingId(null);
    }
  };

  const btnBase = 'flex-1 min-w-0 py-2.5 px-1.5 rounded-xl text-[11px] sm:text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex p-3 sm:p-4 items-end sm:items-center`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-auto flex flex-col overflow-hidden max-h-[min(92svh,720px)] sm:max-h-[min(88svh,680px)]">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center shrink-0">
            <LogIn className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Registro de fichaje</h2>
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
              {storeLabel || 'Tienda'} · Ficha al resto del equipo (nómina)
            </p>
          </div>
          {!loading && team.length > 0 && (
            <span className="inline-flex px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[11px] sm:text-xs font-bold shrink-0">
              {clockedInCount}/{team.length}
            </span>
          )}
          <button type="button" onClick={() => void load()} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" title="Actualizar">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onCancel} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" aria-label="Cerrar">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 sm:py-4 space-y-2.5">
          {actionMsg && (
            <div className={`p-3 rounded-xl text-sm font-medium ${
              actionMsg.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}>
              {actionMsg.text}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">{error}</div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {!loading && team.map((member) => {
            const record = todayRecords.get(memberKey(member));
            const effectiveStatus = deriveEffectiveClockinStatus(record);
            const isActive = effectiveStatus === 'active';
            const isOnBreak = effectiveStatus === 'break';
            const isWorking = isClockinPresent(effectiveStatus);
            const isDone = effectiveStatus === 'completed';
            const canFichar = !record || isDone;
            const canBreak = isWorking;
            const canFinish = isWorking;
            const clockInEntry = record?.entries.find((e) => e.type === 'clock_in');
            const clockInTime = clockInEntry
              ? new Date(clockInEntry.time).toLocaleTimeString('es-ES', { timeStyle: 'short' })
              : null;
            const busy = actingId === member.user_id;

            return (
              <div
                key={member.user_id}
                className={`p-3 sm:p-4 rounded-2xl border-2 ${
                  canFichar && !isDone
                    ? 'border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-800 ring-1 ring-violet-200/60 dark:ring-violet-900/40'
                    : isOnBreak
                      ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800'
                      : isActive
                        ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'
                        : isDone
                          ? 'border-gray-200 bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700'
                          : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isOnBreak
                      ? 'bg-amber-500 text-white'
                      : isActive
                        ? 'bg-emerald-600 text-white'
                        : isDone
                          ? 'bg-gray-300 dark:bg-gray-600 text-white'
                          : 'bg-violet-600 text-white'
                  }`}>
                    {isOnBreak ? <Coffee className="w-4 h-4" /> : isWorking ? <UserCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 truncate">
                      {member.fullName || member.email}
                    </div>
                    <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {isOnBreak && clockInTime
                        ? `En descanso · entrada ${clockInTime}`
                        : isActive && clockInTime
                          ? `Trabajando · entrada ${clockInTime}`
                          : isDone
                            ? 'Jornada finalizada — puedes volver a fichar'
                            : 'Pulsa Fichar al entrar'}
                    </div>
                  </div>
                  {canFichar && !isDone && (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wide">
                      Pendiente
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busy || !canFichar}
                    onClick={() => void handleClockIn(member)}
                    title={canFichar ? 'Registrar entrada' : 'Ya está en turno'}
                    className={`${btnBase} ${canFichar && !busy ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                  >
                    {busy && canFichar ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 shrink-0" />}
                    Fichar
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canBreak}
                    onClick={() => void handleBreak(member)}
                    className={`${btnBase} ${canBreak && !busy
                      ? isOnBreak
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                  >
                    {busy && canBreak ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4 shrink-0" />}
                    Descanso
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canFinish}
                    onClick={() => void handleFinish(member)}
                    className={`${btnBase} ${canFinish && !busy ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                  >
                    {busy && canFinish ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 shrink-0" />}
                    Finalizar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 space-y-2">
          {clockedInCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onChanged?.();
                onCancel();
              }}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Continuar ({clockedInCount} fichado{clockedInCount === 1 ? '' : 's'})
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Bar (shown when register is open) ───────────────────────────────

const TPV_CASH_TX_LABELS: Record<string, string> = {
  cash_in: 'Entrada',
  cash_out: 'Salida',
  return: 'Devolución',
};

function isTpvCashMovementTx(type: string): boolean {
  return type === 'cash_in' || type === 'cash_out' || type === 'return';
}

function RegisterCashOpsStrip({ session }: { session: TpvRegisterSession }) {
  const ops = session.transactions.filter((t) => isTpvCashMovementTx(t.type));
  if (ops.length === 0) return null;
  const recent = [...ops].slice(-5).reverse();
  return (
    <div className="relative z-10 bg-white/80 dark:bg-gray-900/50 border-b border-emerald-100 dark:border-emerald-900 px-4 py-1.5 flex items-center gap-2 overflow-x-auto text-[11px]">
      <span className="font-semibold text-gray-500 dark:text-gray-400 shrink-0">Movimientos de caja:</span>
      {recent.map((tx) => (
        <span key={tx.id} className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800">
          <span className="text-gray-400">{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{TPV_CASH_TX_LABELS[tx.type] || tx.type}</span>
          <span className={`font-bold ${tx.type === 'cash_in' ? 'text-green-600' : 'text-red-600'}`}>
            {tx.type === 'cash_in' ? '+' : '−'}{tx.amount.toFixed(2)}€
          </span>
          {tx.description && <span className="text-gray-500 truncate max-w-[140px]">{tx.description}</span>}
        </span>
      ))}
    </div>
  );
}

function RegisterStatusBar({
  session,
  onRequestClockIn,
  onRequestClose,
  onRequestCashCount,
  onRequestIncident,
  onRequestCashOps,
  onRequestPrinter,
  clockedInWorkers,
  clockedInWorkersLoading,
  selectedOrderTakerId,
  onSelectOrderTaker,
  isTabletMode = false,
  minimal = false,
}: {
  session: TpvRegisterSession;
  onRequestClockIn: () => void;
  onRequestClose: () => void;
  onRequestCashCount: () => void;
  onRequestIncident: () => void;
  onRequestCashOps: () => void;
  onRequestPrinter: () => void;
  clockedInWorkers: TpvClockedInWorker[];
  clockedInWorkersLoading: boolean;
  selectedOrderTakerId: string | null;
  onSelectOrderTaker: (workerId: string) => void;
  isTabletMode?: boolean;
  /** Tablet en flujo de pedido: una sola fila mínima para dejar espacio al catálogo. */
  minimal?: boolean;
}) {
  const expected = calcTpvExpectedCash(session);
  const txCount = session.transactions.length;
  const incidentCount = session.incidents?.filter(i => !i.resolvedAt).length || 0;
  const opsBtn = minimal
    ? 'shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-stone-200 bg-white text-stone-700 transition-colors touch-manipulation hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
    : isTabletMode
      ? 'shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-stone-200 bg-white text-stone-700 text-[11px] font-semibold transition-colors touch-manipulation whitespace-nowrap hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
      : 'px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 font-semibold transition-colors flex items-center gap-1 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200';
  const closeBtn = minimal
    ? 'shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border-2 border-red-300 bg-red-50 text-red-700 transition-colors touch-manipulation hover:bg-red-100 ml-1.5 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60'
    : isTabletMode
      ? 'shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-lg border-2 border-red-300 bg-red-50 text-red-700 text-[11px] font-bold transition-colors touch-manipulation whitespace-nowrap hover:bg-red-100 ml-2 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
      : 'px-4 py-1.5 rounded-lg border-2 border-red-300 bg-red-50 text-red-700 font-bold transition-colors flex items-center gap-1 hover:bg-red-100 ml-2 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300';
  const actionBtn = opsBtn;

  if (minimal) {
    return (
      <div className="relative z-20 border-b border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 px-2 py-1.5 flex items-center gap-2 text-[11px] min-h-[52px]">
        <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Caja</span>
        </span>
        {session.pointOfSaleName && (
          <span className="text-stone-600 dark:text-stone-400 truncate max-w-[6rem] shrink min-w-0 font-medium" title={session.pointOfSaleName}>
            {session.pointOfSaleName}
          </span>
        )}
        <span className="font-bold text-stone-900 dark:text-stone-100 tabular-nums shrink-0">{expected.toFixed(2)}€</span>
        {incidentCount > 0 && (
          <span className="text-amber-600 font-semibold flex items-center shrink-0" title={`${incidentCount} incidencia(s)`}>
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
        )}
        <div className="flex-1 min-w-0" />
        <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-hide">
          <ClockedInWorkerBubbles
            workers={clockedInWorkers}
            selectedId={selectedOrderTakerId}
            onSelect={onSelectOrderTaker}
            loading={clockedInWorkersLoading}
            compact
            ultraCompact
          />
          <button type="button" onClick={onRequestClockIn} title="Fichar equipo" className={actionBtn}>
            <LogIn className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" onClick={onRequestCashOps} title="Movimiento de caja" className={actionBtn}>
            <Banknote className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" onClick={onRequestPrinter} title="Impresora de tickets" className={actionBtn}>
            <Printer className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" onClick={onRequestCashCount} title="Arqueo" className={actionBtn}>
            <Calculator className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" onClick={onRequestIncident} title="Incidencia" className={actionBtn}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" onClick={onRequestClose} title="Cerrar caja" className={closeBtn}>
            <Lock className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative z-20 border-b border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 flex flex-col gap-2 text-xs ${isTabletMode ? 'px-2 py-2' : 'px-3 sm:px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3'}`}>
      <div className={`flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 ${isTabletMode ? 'text-[11px]' : ''}`}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> Caja abierta
        </span>
        {session.pointOfSaleName && (
          <span className="text-stone-600 dark:text-stone-400 flex items-center gap-1 min-w-0 font-medium">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[140px] sm:max-w-none">{session.pointOfSaleName}</span>
          </span>
        )}
        <span className="text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <Monitor className="w-3.5 h-3.5" /> {session.terminalName}
        </span>
        <span className="text-stone-500 dark:text-stone-400 flex items-center gap-1 tabular-nums">
          <Clock className="w-3.5 h-3.5" /> {new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
        </span>
        {txCount > 0 && (
          <span className="text-stone-500 dark:text-stone-400 flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> {txCount} ops
          </span>
        )}
        <span className="font-bold text-stone-900 dark:text-stone-100 tabular-nums">
          <Banknote className="w-3.5 h-3.5 inline mr-0.5 text-stone-500" />
          {expected.toFixed(2)}€
        </span>
        {incidentCount > 0 && (
          <span className="text-amber-700 font-semibold flex items-center gap-1 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {incidentCount}
          </span>
        )}
      </div>
      <div className={`flex items-center gap-1.5 min-w-0 ${isTabletMode ? 'overflow-x-auto scrollbar-hide -mx-1 px-1' : 'flex-wrap'}`}>
        <ClockedInWorkerBubbles
          workers={clockedInWorkers}
          selectedId={selectedOrderTakerId}
          onSelect={onSelectOrderTaker}
          loading={clockedInWorkersLoading}
          compact
          label="En tienda"
        />
        <button type="button" onClick={onRequestClockIn} title="Fichar entrada del resto del equipo" className={actionBtn}>
          <LogIn className="w-4 h-4 shrink-0" /> {isTabletMode ? 'Fichar' : 'Fichar equipo'}
        </button>
        <button type="button" onClick={onRequestCashOps} className={actionBtn}>
          <Banknote className="w-4 h-4 shrink-0" /> Mov. caja
        </button>
        <button type="button" onClick={onRequestPrinter} className={actionBtn}>
          <Printer className="w-4 h-4 shrink-0" /> Impresora
        </button>
        <button type="button" onClick={onRequestCashCount} className={actionBtn}>
          <Calculator className="w-4 h-4 shrink-0" /> Arqueo
        </button>
        <button type="button" onClick={onRequestIncident} className={actionBtn}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> Incidencia
        </button>
        <button type="button" onClick={onRequestClose} className={closeBtn}>
          <Lock className="w-4 h-4 shrink-0" /> Cerrar caja
        </button>
      </div>
    </div>
  );
}

// ─── Cash Count Modal ────────────────────────────────────────────────────────

function CashCountModal({ session, onConfirm, onCancel }: {
  session: TpvRegisterSession;
  onConfirm: (denominations: CashDenominationCount, notes: string) => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<CashDenominationCount>({});
  const [notes, setNotes] = useState('');
  const countedTotal = calcDenominationTotal(counts);
  const expected = calcTpvExpectedCash(session);
  const diff = countedTotal - expected;
  const hasCounted = countedTotal > 0;

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex p-3 sm:p-4`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl mx-auto my-auto h-[calc(100svh-1.5rem)] sm:h-[calc(100svh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Arqueo intermedio</h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}{session.terminalName} · {new Date().toLocaleTimeString('es-ES', { timeStyle: 'short' })}</p>
          </div>
          {hasCounted && (
            <span className={`hidden sm:inline-flex px-3 py-1.5 rounded-lg border text-xs font-bold ${diff === 0 ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' : diff > 0 ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'}`}>
              Diferencia: {diff >= 0 ? '+' : ''}{diff.toFixed(2)}€
            </span>
          )}
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl shrink-0" aria-label="Cerrar"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Body: 2 columns on lg+ */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-0 overflow-y-auto lg:overflow-hidden">
          {/* Left panel: summary + notes + history */}
          <div className="lg:col-span-3 p-5 sm:p-6 lg:overflow-y-auto space-y-4 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
            {/* Expected vs counted */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Efectivo esperado</div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{expected.toFixed(2)}€</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Contado ahora</div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{countedTotal.toFixed(2)}€</div>
              </div>
            </div>

            {hasCounted && (
              <div className={`p-4 rounded-xl border-2 ${diff === 0 ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : diff > 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Diferencia</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{countedTotal.toFixed(2)}€ contado − {expected.toFixed(2)}€ esperado</div>
                  </div>
                  <div className={`text-2xl font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}€
                  </div>
                </div>
                {diff === 0 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> La caja cuadra perfectamente</p>}
                {diff !== 0 && <p className="text-xs mt-1 flex items-center gap-1 text-gray-500"><AlertTriangle className="w-3 h-3" /> {diff > 0 ? 'Sobrante de efectivo' : 'Falta efectivo en la caja'}</p>}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas</label>
              <textarea rows={3} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
                placeholder="Observaciones del arqueo..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {session.cashCounts.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Arqueos anteriores</h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {session.cashCounts.map(cc => (
                    <div key={cc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <span className="text-gray-600 dark:text-gray-400 truncate">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}</span>
                      <span className={`font-semibold shrink-0 ml-2 ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right panel: cash count */}
          <div className="lg:col-span-2 p-5 sm:p-6 bg-gray-50 dark:bg-gray-900/40 lg:overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-3">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Conteo de efectivo *</label>
              {!hasCounted && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md">
                  <AlertTriangle className="w-3 h-3" /> Cuenta antes de registrar
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <CashCountGrid counts={counts} onChange={setCounts} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 bg-white dark:bg-gray-800">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onConfirm(counts, notes)} disabled={!hasCounted}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${hasCounted ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
            <Calculator className="w-4 h-4" /> Registrar arqueo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Incident Modal ──────────────────────────────────────────────────────────

const INCIDENT_TYPES: { value: import('../../lib/deliveryApi').IncidentType; label: string }[] = [
  { value: 'cash_discrepancy', label: 'Descuadre de efectivo' },
  { value: 'card_issue', label: 'Problema con datáfono/tarjeta' },
  { value: 'refund', label: 'Devolución significativa' },
  { value: 'void_transaction', label: 'Transacción anulada' },
  { value: 'system_error', label: 'Error del sistema' },
  { value: 'other', label: 'Otro' },
];

function IncidentModal({ session, onConfirm, onCancel }: {
  session: TpvRegisterSession;
  onConfirm: (incident: Omit<import('../../lib/deliveryApi').TpvIncident, 'id' | 'date'>) => void;
  onCancel: () => void;
}) {
  const [incidentType, setIncidentType] = useState<import('../../lib/deliveryApi').IncidentType>('other');
  const [severity, setSeverity] = useState<import('../../lib/deliveryApi').IncidentSeverity>('medium');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');

  const canSubmit = description.trim().length > 0;

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  const severityOptions: { value: import('../../lib/deliveryApi').IncidentSeverity; label: string; color: string }[] = [
    { value: 'low', label: 'Baja', color: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
    { value: 'medium', label: 'Media', color: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' },
    { value: 'high', label: 'Alta', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  ];

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex items-center justify-center p-4`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Registrar incidencia</h2>
            <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tipo *</label>
            <div className="grid grid-cols-2 gap-2">
              {INCIDENT_TYPES.map(t => (
                <button key={t.value} onClick={() => setIncidentType(t.value)}
                  className={`p-2.5 rounded-xl border-2 text-left text-sm transition-all ${incidentType === t.value ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Gravedad *</label>
            <div className="flex gap-2">
              {severityOptions.map(s => (
                <button key={s.value} onClick={() => setSeverity(s.value)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${severity === s.value ? s.color : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Importe afectado</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="number" step="0.01" min="0" className={`${inputCls} pl-10`} placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Descripción *</label>
            <textarea rows={3} className={`${inputCls} resize-none`}
              placeholder="Describe la incidencia..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {session.transactions.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Transacción vinculada</label>
              <select className={inputCls} value={transactionId} onChange={e => setTransactionId(e.target.value)}>
                <option value="">Ninguna</option>
                {session.transactions.slice(-20).reverse().map(tx => (
                  <option key={tx.id} value={tx.id}>
                    {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {tx.type} — {tx.amount.toFixed(2)}€ — {tx.description?.slice(0, 30) || tx.paymentMethod}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onConfirm({ type: incidentType, severity, description, reportedBy: session.workerName, amount: amount ? parseFloat(amount) : undefined, transactionId: transactionId || undefined })}
            disabled={!canSubmit}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${canSubmit ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
            <AlertTriangle className="w-4 h-4" /> Registrar incidencia
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Gate Component ────────────────────────────────────────────────────

export function TpvRegisterGate({
  children,
  fillParent = false,
  initialManagerPdvId = null,
  onManagerStoreCleared,
}: {
  children: ReactNode;
  fillParent?: boolean;
  /** CEO TPV: tienda elegida antes de abrir caja (no tablet). */
  initialManagerPdvId?: string | null;
  onManagerStoreCleared?: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled, isLoading: businessLoading, switchBusiness } = useBusiness();
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;
  const { createNotification } = useApp();
  const location = useLocation();
  const tabletBinding = useMemo(
    () => readTpvTabletBinding(),
    [location.pathname, location.key],
  );

  const registerScope = useMemo(
    () => resolveTpvRegisterScope({
      currentBusiness,
      tabletBinding,
      authUser: user,
      pathname: location.pathname,
    }),
    [currentBusiness, tabletBinding, user, location.pathname],
  );

  const isTabletSession = registerScope.isTabletSession;
  const orderFlowActive = useTpvOrderFlowActive();
  const compactRegisterChrome = isTabletSession && orderFlowActive;
  const scopeBusinessId = registerScope.scopeBusinessId;
  const dataUserId = registerScope.effectiveDataUserId;

  const scopeBusiness = useMemo((): Business | null => {
    if (!scopeBusinessId) return currentBusiness;
    if (currentBusiness && resolveBusinessScopeId(currentBusiness) === scopeBusinessId) {
      return currentBusiness;
    }
    const fromList = businesses.find(
      (b) => resolveBusinessScopeId(b) === scopeBusinessId,
    );
    if (fromList) return fromList;
    if (
      tabletBinding?.businessId
      && resolveBusinessScopeId({ business_id: tabletBinding.businessId }) === scopeBusinessId
    ) {
      return {
        business_id: scopeBusinessId,
        id: scopeBusinessId,
        name: tabletBinding.businessName || tabletBinding.pdvName || 'Tienda',
        businessType: businesses.find(
          (b) => resolveBusinessScopeId(b) === scopeBusinessId,
        )?.businessType || 'delivery',
        owner_user_id: tabletBinding.dataUserId || '',
        logo: '',
        members: [],
        branches: [],
      } as Business;
    }
    return currentBusiness;
  }, [scopeBusinessId, currentBusiness, businesses, tabletBinding]);

  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(() => !isTabletTpvBootstrapReady());
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [restaurantCloseWarnings, setRestaurantCloseWarnings] = useState<string[]>([]);
  const [showCashCount, setShowCashCount] = useState(false);
  const [showCashOps, setShowCashOps] = useState(false);
  const [showClockIn, setShowClockIn] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [showPrinter, setShowPrinter] = useState(false);
  const [openingPrinterCtx, setOpeningPrinterCtx] = useState<{ pdvId: string; terminalId?: string } | null>(null);
  const [postCloseSession, setPostCloseSession] = useState<TpvRegisterSession | null>(null);
  const [postCloseAggregatorRows, setPostCloseAggregatorRows] = useState<AggregatorCashRow[]>([]);
  const [managerPdvPickId, setManagerPdvPickId] = useState<string | null>(null);
  const [clockedInWorkers, setClockedInWorkers] = useState<TpvClockedInWorker[]>([]);
  const [clockedInWorkersLoading, setClockedInWorkersLoading] = useState(false);
  const clockedInWorkersRef = useRef<TpvClockedInWorker[]>([]);
  clockedInWorkersRef.current = clockedInWorkers;
  const [selectedOrderTakerId, setSelectedOrderTakerId] = useState<string | null>(null);
  const skipManagerAutoPdvRef = useRef(false);
  const loadSeqRef = useRef(0);
  const loadInflightRef = useRef<Promise<void> | null>(null);
  const txQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionsRef = useRef<TpvRegisterSession[]>(sessions);
  sessionsRef.current = sessions;
  const pointsOfSaleRef = useRef(pointsOfSale);
  pointsOfSaleRef.current = pointsOfSale;
  const workCentersRef = useRef(workCenters);
  workCentersRef.current = workCenters;
  const hasDisplayedStoresRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;
  const dataUserIdRef = useRef(dataUserId);
  dataUserIdRef.current = dataUserId;
  const tabletBindingRef = useRef(tabletBinding);
  tabletBindingRef.current = tabletBinding;
  const scopeBusinessIdRef = useRef(scopeBusinessId);
  scopeBusinessIdRef.current = scopeBusinessId;
  const isTabletSessionRef = useRef(isTabletSession);
  isTabletSessionRef.current = isTabletSession;
  const accountBusinessCountRef = useRef(accountBusinessCount);
  accountBusinessCountRef.current = accountBusinessCount;
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const businessId = scopeBusinessId;
  const tpvFrameClass = fillParent ? 'flex flex-col h-full min-h-0' : 'flex flex-col min-h-screen';

  const tabletRestrictedPdvId = isTabletSession ? tabletBinding!.pdvId : null;

  useEffect(() => {
    if (!tabletBinding?.businessId || !businessesFetchSettled) return;
    if (!registerScope.shouldSyncBusinessFromTablet) return;
    const norm = resolveBusinessScopeId({ business_id: tabletBinding.businessId });
    const exists = businesses.some(
      (b) => resolveBusinessScopeId(b) === norm,
    );
    if (!exists) return;
    switchBusiness(tabletBinding.businessId!);
  }, [
    tabletBinding?.businessId,
    businessesFetchSettled,
    registerScope.shouldSyncBusinessFromTablet,
    switchBusiness,
    businesses,
  ]);

  useEffect(() => {
    if (!isTabletSession || !tabletRestrictedPdvId) return;
    setManagerPdvPickId(tabletRestrictedPdvId);
    skipManagerAutoPdvRef.current = false;
    if (scopeBusinessId && tabletBinding?.dataUserId) {
      writeDeliveryOpsSelectedPdvId(scopeBusinessId, tabletBinding.dataUserId, tabletRestrictedPdvId);
    }
  }, [isTabletSession, tabletRestrictedPdvId, scopeBusinessId, tabletBinding?.dataUserId]);

  const isWorkerUser = useMemo(() => isInvitedWorkerUser(user), [user]);

  const openingWorkerOptions = useMemo(() => {
    if (isTabletSession || !isWorkerUser) {
      const memberSource = scopeBusiness?.members?.length
        ? scopeBusiness
        : businesses.find((b) => resolveBusinessScopeId(b) === scopeBusinessId) || currentBusiness;
      const members = (memberSource?.members || []).map((m: { user_id?: string; id?: string; fullName?: string; email?: string }) => ({
        id: String(m.user_id || m.id || '').trim(),
        name: String(m.fullName || m.email || 'Trabajador').trim(),
      })).filter((m) => m.id && m.name);
      const uniq = new Map<string, { id: string; name: string }>();
      for (const m of members) uniq.set(m.id, m);
      if (user?.user_id || user?.id) {
        const uid = String(user.user_id || user.id || '').trim();
        if (uid) {
          uniq.set(uid, {
            id: uid,
            name: String(user.fullName || user.email || 'Gerente').trim(),
          });
        }
      }
      return Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }
    if (user) {
      return [{
        id: String(user.user_id || user.id || '').trim(),
        name: String(user.fullName || user.email || 'Trabajador').trim(),
      }].filter((w) => w.id && w.name);
    }
    return [];
  }, [
    isTabletSession,
    isWorkerUser,
    scopeBusiness,
    scopeBusinessId,
    businesses,
    currentBusiness?.members,
    user?.user_id,
    user?.id,
    user?.fullName,
    user?.email,
  ]);

  const workerAssignedPdvId = useMemo(() => {
    if (!isWorkerUser) return null;
    return filterStoresForWorkerAssignment(
      pointsOfSale,
      workCenters,
      user?.employment?.salesPointId,
    ).assignedPdvId;
  }, [isWorkerUser, pointsOfSale, workCenters, user?.employment?.salesPointId]);

  useLayoutEffect(() => {
    if (isTabletSession || isWorkerUser || !initialManagerPdvId) return;
    const id = String(initialManagerPdvId).trim();
    if (!id) return;
    setManagerPdvPickId(id);
    skipManagerAutoPdvRef.current = true;
    const bid = resolveBusinessScopeId(currentBusiness);
    if (bid && dataUserId) {
      writeDeliveryOpsSelectedPdvId(bid, dataUserId, id);
    }
  }, [initialManagerPdvId, isTabletSession, isWorkerUser, currentBusiness, dataUserId]);

  useEffect(() => {
    if (initialManagerPdvId || isWorkerUser || managerPdvPickId || skipManagerAutoPdvRef.current) return;
    const bid = resolveBusinessScopeId(currentBusiness);
    if (bid && dataUserId) {
      const saved = readDeliveryOpsSelectedPdvId(bid, dataUserId);
      const pdvId = resolvePreferenceToPdvId(pointsOfSale, saved);
      if (pdvId) {
        setManagerPdvPickId(pdvId);
        skipManagerAutoPdvRef.current = false;
        return;
      }
    }
    const open = sessions.filter((s) => isTpvRegisterSessionOpen(s));
    if (open.length !== 1) return;
    const id = String(open[0].pointOfSaleId || '').trim();
    if (id) setManagerPdvPickId(id);
  }, [initialManagerPdvId, isWorkerUser, managerPdvPickId, sessions, pointsOfSale, dataUserId, currentBusiness?.business_id, currentBusiness?.id]);

  useEffect(() => {
    if (isWorkerUser || isTabletSession) return;
    const syncManagerPdvFromStorage = () => {
      const bid = resolveBusinessScopeId(currentBusiness);
      if (!bid || !dataUserId) return;
      const saved = readDeliveryOpsSelectedPdvId(bid, dataUserId);
      const pdvId = resolvePreferenceToPdvId(pointsOfSale, saved);
      if (pdvId) setManagerPdvPickId(pdvId);
    };
    syncManagerPdvFromStorage();
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, syncManagerPdvFromStorage);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, syncManagerPdvFromStorage);
  }, [isWorkerUser, isTabletSession, currentBusiness, dataUserId, pointsOfSale]);

  const pointsOfSaleScopeKey = useMemo(
    () => pointsOfSale.map((p) => p._id).join(','),
    [pointsOfSale],
  );

  useEffect(() => {
    if (!dataUserId) return;
    const refreshSessions = () => {
      void listTpvRegisterSessionsRequest(dataUserId, { businessId: scopeBusinessIdRef.current || undefined })
        .then((sessData) => {
          setSessions((prev) => {
            const tabletPdvId = String(tabletBindingRef.current?.pdvId || '').trim();
            const bid = scopeBusinessIdRef.current;
            let next = sessData;
            if (isTabletSessionRef.current && tabletPdvId) {
              next = sessData.filter((s) => {
                const pid = String(s.pointOfSaleId || '').trim();
                return !pid || pid === tabletPdvId;
              });
            } else if (pointsOfSaleRef.current.length > 0) {
              next = sessData.filter((s) => shouldKeepTpvSessionInList(s, pointsOfSaleRef.current, bid));
            }
            if (next.length === 0 && prev.length > 0) return prev;
            return next;
          });
        })
        .catch(() => null);
    };
    refreshSessions();
    const interval = window.setInterval(refreshSessions, 30000);
    window.addEventListener('focus', refreshSessions);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshSessions);
    };
  }, [dataUserId, pointsOfSaleScopeKey, scopeBusinessId]);

  const activeSession = useMemo(() => {
    const open = sessions.filter((s) => isTpvRegisterSessionOpen(s));
    if (isTabletSession && tabletRestrictedPdvId) {
      return open.find((s) => tpvSessionMatchesStoreRef(s, tabletRestrictedPdvId, pointsOfSale)) || null;
    }
    if (isWorkerUser) {
      if (workerAssignedPdvId) {
        return open.find((s) => tpvSessionMatchesStoreRef(s, workerAssignedPdvId, pointsOfSale)) || null;
      }
      return open[0] || null;
    }
    if (managerPdvPickId) {
      return open.find((s) => tpvSessionMatchesStoreRef(s, managerPdvPickId, pointsOfSale)) || null;
    }
    if (open.length === 1) return open[0];
    return null;
  }, [sessions, isTabletSession, tabletRestrictedPdvId, isWorkerUser, workerAssignedPdvId, managerPdvPickId, pointsOfSale]);

  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = isTpvRegisterSessionOpen(activeSession) ? activeSession?._id ?? null : null;

  useEffect(() => {
    const onSessionSync = (event: Event) => {
      const session = (event as CustomEvent<TpvRegisterSession>).detail;
      if (!session?._id) return;
      setSessions((prev) => prev.map((s) => (s._id === session._id ? session : s)));
    };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
    return () => window.removeEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
  }, []);

  const activeStoreScope = useMemo(() => {
    const pdvId = String(
      activeSession?.pointOfSaleId || tabletRestrictedPdvId || managerPdvPickId || '',
    ).trim();
    const pdv = pointsOfSale.find((p) => p._id === pdvId);
    const workCenterId = String(
      pdv?.workCenterId || tabletBinding?.workCenterId || '',
    ).trim();
    return { pdvId, workCenterId };
  }, [
    activeSession?.pointOfSaleId,
    tabletRestrictedPdvId,
    managerPdvPickId,
    pointsOfSale,
    tabletBinding?.workCenterId,
  ]);

  const printerModalScope = useMemo((): TpvPrinterScope | undefined => {
    if (!dataUserId) return undefined;
    const pdvId = String(
      activeSession?.pointOfSaleId || openingPrinterCtx?.pdvId || tabletRestrictedPdvId || managerPdvPickId || '',
    ).trim();
    const terminalId = activeSession?.terminalId || openingPrinterCtx?.terminalId;
    const pdv = pointsOfSale.find((p) => p._id === pdvId);
    if (!pdvId || !pdv) return undefined;
    const terminal = terminalId ? pdv.terminals.find((t) => t.id === terminalId) : undefined;
    return {
      userId: dataUserId,
      pdvId,
      pdv,
      terminalId,
      storeLabel: pointOfSaleDisplayLabel(pdv),
      terminalLabel: terminal ? (terminal.code || terminal.name) : undefined,
      onPdvUpdated: (updated) => {
        setPointsOfSale((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      },
    };
  }, [
    dataUserId,
    activeSession?.pointOfSaleId,
    activeSession?.terminalId,
    openingPrinterCtx,
    tabletRestrictedPdvId,
    managerPdvPickId,
    pointsOfSale,
  ]);

  useEffect(() => {
    const pdv = printerModalScope?.pdv;
    if (!pdv) {
      setActivePrinterScope({});
      return;
    }
    setActivePrinterScope({
      pdvId: pdv._id,
      terminalId: printerModalScope?.terminalId,
      pdv,
    });
    return () => setActivePrinterScope({});
  }, [printerModalScope?.pdv?._id, printerModalScope?.pdv?._rev, printerModalScope?.terminalId]);

  const handleOpeningPdvChange = useCallback((pdvId: string) => {
    const id = String(pdvId || '').trim();
    if (!id) return;
    setManagerPdvPickId((prev) => (prev === id ? prev : id));
    const bid = resolveBusinessScopeId(currentBusiness);
    if (bid && dataUserId) {
      writeDeliveryOpsSelectedPdvId(bid, dataUserId, id);
    }
  }, [currentBusiness?.business_id, currentBusiness?.id, dataUserId]);

  const refreshClockedInWorkers = useCallback(async (options?: { silent?: boolean }) => {
    if (!businessId) {
      setClockedInWorkers([]);
      return;
    }
    const { pdvId, workCenterId } = activeStoreScope;
    if (!pdvId) {
      setClockedInWorkers([]);
      return;
    }
    const ownerUserId = String(scopeBusiness?.owner_user_id || currentBusiness?.owner_user_id || '').trim();
    const silent = options?.silent ?? false;
    if (!silent && clockedInWorkersRef.current.length === 0) setClockedInWorkersLoading(true);
    try {
      const workers = await loadClockedInStoreWorkers(
        businessId,
        ownerUserId,
        pdvId,
        workCenterId,
        activeSession?.openedAt,
      );
      setClockedInWorkers(workers);
      setSelectedOrderTakerId((prev) => {
        const staff = buildTpvActiveStaff(activeSession, workers);
        const prevNorm = normalizeClockinUserId(prev);
        if (prevNorm && staff.some((w) => clockinIdsMatch(w.id, prevNorm))) return prevNorm;
        return pickDefaultOrderTakerForSession(activeSession, workers);
      });
    } catch {
      if (!silent && clockedInWorkersRef.current.length === 0) setClockedInWorkers([]);
    } finally {
      if (!silent && clockedInWorkersRef.current.length === 0) setClockedInWorkersLoading(false);
    }
  }, [businessId, scopeBusiness?.owner_user_id, currentBusiness?.owner_user_id, activeStoreScope, activeSession]);

  useEffect(() => {
    if (!isTpvRegisterSessionOpen(activeSession)) return;
    if (clockedInWorkers.length === 0 && !normalizeClockinUserId(activeSession.workerId)) return;
    setSelectedOrderTakerId((prev) => {
      const staff = buildTpvActiveStaff(activeSession, clockedInWorkers);
      const prevNorm = normalizeClockinUserId(prev);
      if (prevNorm && staff.some((w) => clockinIdsMatch(w.id, prevNorm))) return prevNorm;
      return pickDefaultOrderTakerForSession(activeSession, clockedInWorkers);
    });
  }, [activeSession?._id, activeSession?.workerId, activeSession?.workerName, activeSession?.openedAt, clockedInWorkers]);

  useEffect(() => {
    if (!isTpvRegisterSessionOpen(activeSession)) {
      return;
    }
    if (!activeStoreScope.pdvId) {
      setClockedInWorkers([]);
      setSelectedOrderTakerId(null);
      return;
    }
    void refreshClockedInWorkers();
    const interval = setInterval(() => void refreshClockedInWorkers({ silent: true }), 60000);
    return () => clearInterval(interval);
  }, [activeStoreScope.pdvId, activeSession?._id, activeSession?.status, refreshClockedInWorkers]);

  useEffect(() => {
    if (!isTpvRegisterSessionOpen(activeSession)) {
      setShowClosing(false);
      setShowCashCount(false);
      setShowCashOps(false);
      setShowIncident(false);
    }
  }, [activeSession?._id, activeSession?.status, activeSession?.openedAt]);

  const scopeBusinessRef = useRef(scopeBusiness);
  scopeBusinessRef.current = scopeBusiness;
  const layoutScopeKeyRef = useRef('');

  const buildRetailScopeCtx = useCallback(
    () => ({
      business: scopeBusinessRef.current,
      businesses: businessesRef.current,
      accountBusinessCount: accountBusinessCountRef.current,
    }),
    [],
  );

  const applyScopedStoreRows = useCallback((
    pdvs: PointOfSale[],
    workCenters: WorkCenter[],
  ) => {
    const activePdvs = mergeTabletBindingPdv(
      pdvs.filter((p) => p.active !== false),
      isTabletSessionRef.current ? tabletBindingRef.current : null,
    );
    const retail = workCenters.filter(
      (wc) =>
        !wc.deletedAt &&
        wc.active !== false &&
        (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
    );
    setPointsOfSale(activePdvs);
    setWorkCenters(retail);
    hasDisplayedStoresRef.current = activePdvs.length > 0 || retail.length > 0;
  }, []);

  useLayoutEffect(() => {
    const scopeKey = `${scopeBusinessId}|${isTabletSession ? 'tablet' : 'mgr'}`;
    const scopeChanged = layoutScopeKeyRef.current !== scopeKey;
    layoutScopeKeyRef.current = scopeKey;

    if (!scopeBusinessId) {
      hasDisplayedStoresRef.current = false;
      setPointsOfSale([]);
      setWorkCenters([]);
      setLoading(false);
      return;
    }

    if (scopeChanged) {
      loadInflightRef.current = null;
      if (!isTabletSession) {
        hasDisplayedStoresRef.current = false;
      }
    }

    if (!hasDisplayedStoresRef.current) {
      const cached = readRetailScopeCacheForBusiness(scopeBusinessId, buildRetailScopeCtx());
      if (cached && (cached.allPointsOfSale.length > 0 || cached.retailWorkCenters.length > 0)) {
        applyScopedStoreRows(cached.allPointsOfSale, cached.retailWorkCenters);
      } else if (isTabletSession && tabletBindingRef.current?.pdvId) {
        const stubPdvs = mergeTabletBindingPdv([], tabletBindingRef.current);
        setPointsOfSale(stubPdvs);
        setWorkCenters([]);
        hasDisplayedStoresRef.current = stubPdvs.length > 0;
      } else if (scopeChanged) {
        setLoading(true);
      }
    }

    if (!isTabletSession) {
      if (initialManagerPdvId) {
        const id = String(initialManagerPdvId).trim();
        if (id) {
          setManagerPdvPickId(id);
          skipManagerAutoPdvRef.current = true;
        }
      } else if (scopeChanged) {
        setManagerPdvPickId(null);
        skipManagerAutoPdvRef.current = false;
      }
    }
  }, [
    scopeBusinessId,
    isTabletSession,
    initialManagerPdvId,
    applyScopedStoreRows,
    buildRetailScopeCtx,
  ]);

  const loadData = useCallback(async () => {
    if (loadInflightRef.current) {
      return loadInflightRef.current;
    }

    const run = async () => {
      const uid = String(dataUserIdRef.current || '').trim();
      const authUser = userRef.current;
      const biz = scopeBusinessRef.current;
      const bidAtStart = resolveTpvRegisterBidAtStart({
        isTabletSession: isTabletSessionRef.current,
        tabletBinding: tabletBindingRef.current,
        scopeBusinessId: scopeBusinessIdRef.current,
      });
      const seq = ++loadSeqRef.current;

      if (!uid || !authUser || !bidAtStart) {
        if (!hasDisplayedStoresRef.current) setLoading(false);
        return;
      }

      if (!hasDisplayedStoresRef.current) {
        const tabletPdv = String(tabletBindingRef.current?.pdvId || '').trim();
        if (!(isTabletSessionRef.current && tabletPdv)) {
          setLoading(true);
        }
      }

      const loadOpts = {
        accountBusinessCount: accountBusinessCountRef.current,
        skipPdvMerge: false as const,
        ensureTabletCodes: true,
      };

      try {
        const workerUser = isInvitedWorkerUser(authUser);
        const tabletPdvId = String(tabletBindingRef.current?.pdvId || '').trim();
        const tabletFastPath = isTabletSessionRef.current && Boolean(tabletPdvId);

        let sessData: TpvRegisterSession[];
        let storeState: Awaited<ReturnType<typeof loadRetailStoresForBusiness>>;

        if (tabletFastPath) {
          if (!hasDisplayedStoresRef.current) {
            const stubPdvs = mergeTabletBindingPdv([], tabletBindingRef.current);
            setPointsOfSale(stubPdvs);
            setWorkCenters([]);
            hasDisplayedStoresRef.current = stubPdvs.length > 0;
          }
          sessData = await listTpvRegisterSessionsRequest(uid, { businessId: bidAtStart || undefined });
          storeState = {
            dataUserId: uid,
            workCenters: [],
            pointsOfSale: [],
          };
        } else {
          const bizList = businessesRef.current;
          const knownBusinessIds = bizList.map((b) => b.business_id).filter(Boolean);
          const isRestaurant = isRestaurantBusinessType(biz?.businessType);
          [sessData, storeState] = await Promise.all([
            listTpvRegisterSessionsRequest(uid, { businessId: bidAtStart || undefined }),
            hasDisplayedStoresRef.current
              ? Promise.resolve({
                  dataUserId: uid,
                  workCenters: workCentersRef.current,
                  pointsOfSale: pointsOfSaleRef.current,
                })
              : (async () => {
                  let state = await loadRetailStoresForBusiness(authUser, biz ?? null, bizList, {
                    ...loadOpts,
                    knownBusinessIds,
                    tpvBootstrap: false,
                  });
                  if (state.dataUserId) {
                    state = {
                      ...state,
                      pointsOfSale: await repairMissingRetailDeliveryPdvs(
                        state.dataUserId,
                        state.workCenters,
                        state.pointsOfSale,
                        biz ?? null,
                      ),
                    };
                  }
                  return state;
                })(),
          ]);
        }

        if (seq !== loadSeqRef.current) return;
        if (!isTabletSessionRef.current && scopeBusinessIdRef.current !== bidAtStart) return;

        if (
          !shouldApplyTpvRegisterLoadResult({
            isTabletSession: isTabletSessionRef.current,
            bidAtStart,
            activeBid: resolveBusinessScopeId(scopeBusinessRef.current),
          })
        ) {
          return;
        }

        if (tabletFastPath) {
          setSessions(
            sessData.filter((s) => {
              const pid = String(s.pointOfSaleId || '').trim();
              return !pid || pid === tabletPdvId;
            }),
          );
        } else {
          let scopedPdvs = storeState.pointsOfSale.filter((p) => p.active !== false);
          let scopedWorkCenters = storeState.workCenters.filter(
            (wc) =>
              wc.active !== false &&
              !wc.deletedAt &&
              (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
          );

          if (workerUser) {
            const scoped = filterStoresForWorkerAssignment(
              scopedPdvs,
              scopedWorkCenters,
              authUser?.employment?.salesPointId,
            );
            scopedPdvs = scoped.pointsOfSale;
            scopedWorkCenters = scoped.workCenters;
          }

          if (scopedPdvs.length > 0 || scopedWorkCenters.length > 0) {
            setWorkCenters(scopedWorkCenters);
            setPointsOfSale(
              mergeTabletBindingPdv(scopedPdvs, isTabletSessionRef.current ? tabletBindingRef.current : null),
            );
            writeRetailScopeCacheForBusiness(
              bidAtStart,
              {
                retailWorkCenters: scopedWorkCenters,
                allPointsOfSale: scopedPdvs,
              },
              buildRetailScopeCtx(),
            );
            hasDisplayedStoresRef.current = true;
          }
          setSessions(sessData.filter((s) => shouldKeepTpvSessionInList(s, scopedPdvs, bidAtStart)));
        }
      } catch {
        if (seq === loadSeqRef.current && !hasDisplayedStoresRef.current) {
          setPointsOfSale([]);
          setWorkCenters([]);
          setSessions([]);
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    };

    const promise = run().finally(() => {
      if (loadInflightRef.current === promise) {
        loadInflightRef.current = null;
      }
    });
    loadInflightRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    const gate = evaluateTpvRegisterLoadGate({
      businessLoading,
      businessesFetchSettled,
      isTabletSession,
      dataUserId,
      scopeBusinessId,
    });
    if (!gate.canLoad) {
      if (gate.shouldClearLoading) setLoading(false);
      return;
    }
    void loadData();
  }, [businessLoading, businessesFetchSettled, dataUserId, scopeBusinessId, loadData, isTabletSession]);

  useEffect(() => {
    if (!loading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const handleOpen = async (data: OpeningData) => {
    if (!dataUserId) return;
    const pdvId = String(data.pointOfSaleId || '').trim();
    const localOpen = sessions.find(
      (s) => isTpvRegisterSessionOpen(s) && tpvSessionMatchesStoreRef(s, pdvId, pointsOfSale),
    );
    if (localOpen) {
      if (!isWorkerUser && pdvId) {
        const bid = resolveBusinessScopeId(currentBusiness);
        if (bid && dataUserId) {
          writeDeliveryOpsSelectedPdvId(bid, dataUserId, pdvId);
        }
        setManagerPdvPickId(pdvId);
        skipManagerAutoPdvRef.current = false;
      }
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: localOpen }));
      toast.info(`Continuando con la caja ya abierta en ${localOpen.pointOfSaleName || 'esta tienda'}`);
      return;
    }
    const total = calcDenominationTotal(data.counts);
    try {
      const created = await createTpvRegisterSessionRequest(dataUserId, {
        business_id: scopeBusinessId || resolveBusinessScopeId(currentBusiness) || '',
        workerId: data.workerId || '',
        workerName: data.workerName,
        pointOfSaleId: data.pointOfSaleId,
        pointOfSaleName: data.pointOfSaleName,
        terminalId: data.terminalId,
        terminalName: data.terminalName,
        datafonName: data.datafonName,
        printerName: data.printerName,
        openedBy: data.workerName,
        openingCashCount: data.counts,
        initialCashAmount: total,
        status: 'open',
        transactions: [],
        cashCounts: [],
        incidents: [],
        linkedOrderIds: [],
        salesByChannel: {},
      } as Partial<TpvRegisterSession>);
      setSessions(prev => [created, ...prev]);
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: created }));
      setPostCloseSession(null);
      if (!isWorkerUser) {
        const bid = resolveBusinessScopeId(currentBusiness);
        if (bid && dataUserId && data.pointOfSaleId) {
          writeDeliveryOpsSelectedPdvId(bid, dataUserId, data.pointOfSaleId);
          setManagerPdvPickId(data.pointOfSaleId);
        }
        skipManagerAutoPdvRef.current = false;
      }
      toast.success(`Caja abierta: ${data.pointOfSaleName ? `${data.pointOfSaleName} / ` : ''}${data.terminalName} — ${total.toFixed(2)}€`);
      const openerId = normalizeClockinUserId(data.workerId);
      const bid = resolveBusinessScopeId(currentBusiness);
      const pdvDoc = pointsOfSale.find((p) => p._id === pdvId);
      const wcId = String(pdvDoc?.workCenterId || tabletBinding?.workCenterId || '').trim();
      if (bid && openerId && pdvId) {
        try {
          await clockIn(bid, openerId, data.workerName, {
            device_type: isTabletSession ? 'tablet' : 'web',
            sales_point_id: pdvId,
            sales_point_name: data.pointOfSaleName || pdvDoc?.name || '',
            work_center_id: wcId || undefined,
            store_team_clockin: true,
          });
          setSelectedOrderTakerId(openerId);
          void refreshClockedInWorkers({ silent: true });
        } catch {
          // La caja ya abrió; el resto puede fichar manualmente desde la barra.
        }
      }
      // Aviso para el campanario de notificaciones. Útil para auditoría y para que
      // un encargado vea aperturas desde el móvil. Si la llamada al backend falla
      // simplemente se ignora: el toast ya confirmó visualmente la apertura.
      void createNotification({
        level: 'success',
        category: 'tpv',
        title: 'Caja abierta',
        message: `${data.workerName} abrió ${data.pointOfSaleName || 'la caja'}${data.terminalName ? ` (${data.terminalName})` : ''} con ${total.toFixed(2)}€ de fondo`,
        entityId: created.id,
        entityType: 'tpv_session',
        route: '/saas/tpv',
        metadata: { initialCashAmount: total, pointOfSaleId: data.pointOfSaleId, terminalId: data.terminalId },
      }).catch((error) => { console.error('Error creating tpv open notification:', error); });
    } catch (err) {
      if (err instanceof TpvRegisterSessionConflictError) {
        const existing = err.existingSession;
        const pdvId = String(data.pointOfSaleId || existing.pointOfSaleId || '').trim();
        setSessions((prev) => {
          const exists = prev.some((s) => s._id === existing._id);
          if (exists) {
            return prev.map((s) => (s._id === existing._id ? existing : s));
          }
          return [existing, ...prev];
        });
        setPostCloseSession(null);
        if (!isWorkerUser && pdvId) {
          const bid = resolveBusinessScopeId(currentBusiness);
          if (bid && dataUserId) {
            writeDeliveryOpsSelectedPdvId(bid, dataUserId, pdvId);
          }
          setManagerPdvPickId(pdvId);
          skipManagerAutoPdvRef.current = false;
        }
        window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: existing }));
        toast.info(`Continuando con la caja ya abierta en ${existing.pointOfSaleName || 'esta tienda'}`);
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Error al abrir la caja');
    }
  };

  const handleClose = async (counts: CashDenominationCount, notes: string, aggregatorRows: AggregatorCashRow[] = []) => {
    if (!dataUserId || !isTpvRegisterSessionOpen(activeSession)) {
      toast.info('Abre la caja antes de cerrarla');
      setShowClosing(false);
      return;
    }
    const session = activeSession;
    const finalAmount = calcDenominationTotal(counts);
    const expected = calcTpvExpectedCash(session);
    const diff = finalAmount - expected;
    const summary = buildTpvRegisterSummary(session);
    const aggregatorClosingTotals: Record<string, number> = {};
    for (const row of aggregatorRows) {
      aggregatorClosingTotals[row.platform.channel] = row.totalSales;
      summary.salesByChannel[row.platform.channel] = row.totalSales;
    }
    const saleOps = session.transactions.filter((t) => t.type === 'sale').length;
    const autoValidated = saleOps === 0 && Math.abs(diff) < 0.01;
    const closedPayload: Partial<TpvRegisterSession> = {
      ...session,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: session.workerName,
      closingCashCount: counts,
      finalCashAmount: finalAmount,
      expectedCash: expected,
      difference: diff,
      closingNotes: notes,
      summary,
      aggregatorClosingTotals,
      closingValidationStatus: autoValidated ? 'validated' : 'pending',
      ...(autoValidated
        ? {
            closingValidatedAt: new Date().toISOString(),
            closingValidatedBy: 'Sistema (sin movimientos)',
            closingValidationNotes: 'Cierre automático: turno sin ventas ni descuadre.',
          }
        : {}),
    };
    try {
      const updated = await updateTpvRegisterSessionRequest(dataUserId, closedPayload as TpvRegisterSession);
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: updated }));
      setShowClosing(false);
      setPostCloseSession(updated);
      setPostCloseAggregatorRows(aggregatorRows);
      toast.success(
        autoValidated
          ? `Caja cerrada (sin ventas, validada automáticamente). Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`
          : `Caja cerrada. Pendiente de validación gerente. Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
      );
      if (!autoValidated) {
        void createNotification({
        level: Math.abs(diff) >= 20 ? 'warning' : 'info',
        category: 'tpv',
        title: 'Cierre de caja pendiente de validación',
        message: `${activeSession.workerName} cerró ${activeSession.pointOfSaleName || 'caja'} (${activeSession.terminalName || 'TPV'}). Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
        entityId: updated._id,
        entityType: 'tpv_register_session',
        route: '/saas/vertical/delivery/caja',
        metadata: { difference: diff, pointOfSaleId: activeSession.pointOfSaleId },
        }).catch(() => null);
      }
    } catch {
      toast.error('Error al cerrar la caja');
    }
  };

  const applySessionTransactions = useCallback((
    session: TpvRegisterSession,
    updatedTxs: TpvRegisterTransaction[],
  ) => {
    const salesByChannel: Record<string, number> = {};
    for (const t of updatedTxs) {
      if (t.type === 'sale' && t.channel) salesByChannel[t.channel] = (salesByChannel[t.channel] || 0) + t.amount;
    }
    const linkedOrderIds = [...(session.linkedOrderIds || [])];
    const lastTx = updatedTxs[updatedTxs.length - 1];
    if (lastTx?.linkedDeliveryOrderId && !linkedOrderIds.includes(lastTx.linkedDeliveryOrderId)) {
      linkedOrderIds.push(lastTx.linkedDeliveryOrderId);
    }
    return { transactions: updatedTxs, salesByChannel, linkedOrderIds };
  }, []);

  const addTransaction = useCallback(async (tx: Omit<TpvRegisterTransaction, 'id' | 'date'>) => {
    const run = async () => {
      const uid = dataUserIdRef.current;
      const sessionId = activeSessionIdRef.current;
      if (!uid || !sessionId) return;

      const fullTx: TpvRegisterTransaction = {
        ...tx,
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: new Date().toISOString(),
      };

      for (let attempt = 0; attempt < 5; attempt++) {
        const current = sessionsRef.current.find((s) => s._id === sessionId);
        if (!current || !isTpvRegisterSessionOpen(current)) return;

        const updatedTxs = [...current.transactions, fullTx];
        const patch = applySessionTransactions(current, updatedTxs);
        const nextSession = { ...current, ...patch };

        if (!isBrowserOnline()) {
          enqueueTpvOfflineItem('register_tx', { userId: uid, session: nextSession, tx: fullTx });
          setSessions((prev) => prev.map((s) => (s._id === sessionId ? nextSession : s)));
          const label = TPV_CASH_TX_LABELS[fullTx.type] || 'Movimiento';
          toast.info(`${label} guardado en cola local. Efectivo esperado: ${calcTpvExpectedCash(nextSession).toFixed(2)}€`);
          setShowCashOps(false);
          return;
        }

        try {
          const updated = await updateTpvRegisterSessionRequest(uid, nextSession);
          setSessions((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
          if (isTpvCashMovementTx(fullTx.type)) {
            const label = TPV_CASH_TX_LABELS[fullTx.type] || 'Movimiento';
            toast.success(`${label} de ${fullTx.amount.toFixed(2)}€ registrada. Efectivo esperado: ${calcTpvExpectedCash(updated).toFixed(2)}€`);
            setShowCashOps(false);
          }
          return;
        } catch {
          if (attempt < 4) {
            try {
              const refreshed = await listTpvRegisterSessionsRequest(uid, {
                businessId: scopeBusinessIdRef.current || undefined,
              });
              setSessions(refreshed.filter((s) => shouldKeepTpvSessionInList(s, pointsOfSale, scopeBusinessIdRef.current)));
            } catch {
              /* reintento con copia local */
            }
            continue;
          }
          toast.error('Error al registrar operación. El pedido puede existir sin movimiento en caja — revisa el turno.');
        }
      }
    };

    txQueueRef.current = txQueueRef.current.then(run, run);
    await txQueueRef.current;
  }, [applySessionTransactions]);

  const performCashCount = useCallback(async (countedBy: string, denominations: CashDenominationCount, notes?: string) => {
    if (!dataUserId || !activeSession) return;
    const actualCash = calcDenominationTotal(denominations);
    const expectedCash = calcTpvExpectedCash(activeSession);
    const difference = Number((actualCash - expectedCash).toFixed(2));
    const cashCount: TpvCashCount = {
      id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      countedBy,
      denominations,
      expectedCash,
      actualCash,
      difference,
      notes,
    };
    const updatedCounts = [...activeSession.cashCounts, cashCount];
    const updatedIncidents = [...(activeSession.incidents || [])];
    if (Math.abs(difference) > 20) {
      updatedIncidents.push({
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: new Date().toISOString(),
        type: 'cash_discrepancy',
        severity: Math.abs(difference) > 100 ? 'high' : 'medium',
        description: `Descuadre de ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}€ detectado en arqueo intermedio`,
        reportedBy: countedBy,
        amount: Math.abs(difference),
      });
    }
    try {
      const updated = await updateTpvRegisterSessionRequest(dataUserId, { ...activeSession, cashCounts: updatedCounts, incidents: updatedIncidents });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowCashCount(false);
      toast.success(`Arqueo registrado. Diferencia: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}€`);
    } catch {
      toast.error('Error al registrar arqueo');
    }
  }, [dataUserId, activeSession]);

  const addIncident = useCallback(async (incident: Omit<import('../../lib/deliveryApi').TpvIncident, 'id' | 'date'>) => {
    if (!dataUserId || !activeSession) return;
    const fullIncident = {
      ...incident,
      id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
    };
    const updatedIncidents = [...(activeSession.incidents || []), fullIncident];
    try {
      const updated = await updateTpvRegisterSessionRequest(dataUserId, { ...activeSession, incidents: updatedIncidents });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowIncident(false);
      toast.success('Incidencia registrada');
    } catch {
      toast.error('Error al registrar incidencia');
    }
  }, [dataUserId, activeSession]);

  const activeStaff = useMemo(
    () => buildTpvActiveStaff(activeSession, clockedInWorkers),
    [activeSession, clockedInWorkers],
  );

  const currentUserId = useMemo(
    () => normalizeClockinUserId(user?.user_id || user?.id) || '',
    [user?.user_id, user?.id],
  );

  const clockInGate = useMemo(
    () => evaluateTpvClockInGate({
      loading: clockedInWorkersLoading,
      clockedInWorkers: activeStaff,
      selectedOrderTakerId,
      currentUserId,
      isWorkerUser,
    }),
    [clockedInWorkersLoading, activeStaff, selectedOrderTakerId, currentUserId, isWorkerUser],
  );

  const isRestaurantVertical = isRestaurantBusinessType(
    scopeBusiness?.businessType || currentBusiness?.businessType,
  );
  const restaurantTpvPermissions = useMemo(() => resolveRestaurantTpvPermissions(user), [user]);
  const cajaHomePath = isRestaurantVertical ? '/saas/caja' : '/saas/vertical/delivery/caja';
  const opsHomePath = isRestaurantVertical ? '/saas/caja' : '/saas/delivery-ops';

  const handleRequestClose = useCallback(async () => {
    if (isRestaurantVertical && !restaurantTpvPermissions.canCloseRegister) {
      toast.error('Solo encargado o gerente puede cerrar la caja');
      return;
    }
    if (isRestaurantVertical && dataUserId) {
      try {
        const check = await checkRestaurantRegisterClose(dataUserId);
        setRestaurantCloseWarnings(check.warnings);
        if (check.warnings.length > 0) {
          toast.warning('Hay mesas o cuentas abiertas en sala', { duration: 5000 });
        }
      } catch {
        setRestaurantCloseWarnings([]);
      }
    } else {
      setRestaurantCloseWarnings([]);
    }
    setShowClosing(true);
  }, [isRestaurantVertical, restaurantTpvPermissions.canCloseRegister, dataUserId]);

  const requestClockIn = useCallback(() => setShowClockIn(true), []);

  const registerContextValue = useMemo((): TpvRegisterContextType | null => {
    if (!isTpvRegisterSessionOpen(activeSession)) return null;
    return {
      session: activeSession,
      addTransaction,
      performCashCount,
      addIncident,
      requestClose: () => void handleRequestClose(),
      requestCashCount: () => setShowCashCount(true),
      requestIncident: () => setShowIncident(true),
      expectedCash: calcTpvExpectedCash(activeSession),
      clockedInWorkers: activeStaff,
      clockedInWorkersLoading,
      selectedOrderTakerId,
      setSelectedOrderTakerId,
      refreshClockedInWorkers: () => refreshClockedInWorkers({ silent: true }),
      requestClockIn,
    };
  }, [
    activeSession,
    addTransaction,
    performCashCount,
    addIncident,
    activeStaff,
    clockedInWorkersLoading,
    selectedOrderTakerId,
    refreshClockedInWorkers,
    handleRequestClose,
    requestClockIn,
  ]);

  const wrapRegisterContext = (body: ReactNode) => (
    <TpvRegisterContext.Provider value={registerContextValue}>{body}</TpvRegisterContext.Provider>
  );

  const clockInStoreScope = useMemo(() => {
    const pdvId = activeStoreScope.pdvId;
    if (!pdvId) return null;
    const pdv = pointsOfSale.find((p) => p._id === pdvId);
    return {
      pdvId,
      workCenterId: activeStoreScope.workCenterId,
      storeLabel: activeSession?.pointOfSaleName || pdv?.name || tabletBinding?.pdvName || 'Tienda',
    };
  }, [
    activeStoreScope,
    pointsOfSale,
    activeSession?.pointOfSaleName,
    tabletBinding?.pdvName,
  ]);

  const clockInModalEl = showClockIn && clockInStoreScope && businessId ? (
    <TpvGatePortal>
      <ClockInModal
        storeLabel={clockInStoreScope.storeLabel}
        businessId={businessId}
        ownerUserId={String(currentBusiness?.owner_user_id || '')}
        pdvId={clockInStoreScope.pdvId}
        workCenterId={clockInStoreScope.workCenterId}
        sessionOpenedAt={activeSession?.openedAt}
        onChanged={() => void refreshClockedInWorkers({ silent: true })}
        onCancel={() => {
          setShowClockIn(false);
          void refreshClockedInWorkers({ silent: true });
        }}
      />
    </TpvGatePortal>
  ) : showClockIn ? (
    <TpvGatePortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full text-center shadow-xl">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            Selecciona la tienda en la pantalla de apertura de caja antes de fichar.
          </p>
          <button
            type="button"
            onClick={() => setShowClockIn(false)}
            className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold text-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </TpvGatePortal>
  ) : null;

  const wrapShell = (body: ReactNode) => (
    <>
      {wrapRegisterContext(body)}
      {clockInModalEl}
      {showPrinter && (
        <TpvGatePortal>
          <TpvPrinterSetupModal open onClose={() => setShowPrinter(false)} scope={printerModalScope} />
        </TpvGatePortal>
      )}
    </>
  );

  const waitForBusinessList =
    businessLoading && !(isTabletSession && scopeBusinessId);

  if (waitForBusinessList || (!scopeBusinessId && businessesFetchSettled && !isTabletSession)) {
    return wrapShell(
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Preparando empresa y tiendas…</p>
        </div>
      </div>,
    );
  }

  if (loading) {
    return wrapShell(
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center max-w-sm">
          {loadTimedOut ? (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No se pudo cargar la caja
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                El servidor puede estar ocupado o sin conexión. Reintenta en unos segundos.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoadTimedOut(false);
                  setLoading(true);
                  void loadData();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <RefreshCw className="w-4 h-4" />
                Reintentar
              </button>
            </>
          ) : (
            <>
              <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-3" />
              <p className="text-sm text-gray-500">Cargando caja...</p>
            </>
          )}
        </div>
      </div>,
    );
  }

  if (!activeSession && postCloseSession) {
    const expected = calcTpvExpectedCash(postCloseSession);
    return wrapShell(
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 text-center relative">
            <button
              type="button"
              onClick={() => {
                // Salir sin forzar apertura; volvemos a la vista anterior.
                try {
                  if (window.history.length > 1) window.history.back();
                  else navigate(opsHomePath);
                } catch {
                  // ignore
                }
              }}
              className="absolute right-3 top-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Caja cerrada</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {postCloseSession.pointOfSaleName ? `${postCloseSession.pointOfSaleName} · ` : ''}{postCloseSession.terminalName}
            </p>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Efectivo esperado</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{expected.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Efectivo contado</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{Number(postCloseSession.finalCashAmount || 0).toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Diferencia</span>
              <span className={`font-bold ${Number(postCloseSession.difference || 0) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {(postCloseSession.difference || 0) >= 0 ? '+' : ''}{Number(postCloseSession.difference || 0).toFixed(2)}€
              </span>
            </div>
            <AggregatorCashSummary
              rows={postCloseAggregatorRows.length > 0
                ? postCloseAggregatorRows
                : aggregatorRowsFromClosingTotals(
                  getClosingAggregatorPlatforms(),
                  postCloseSession.aggregatorClosingTotals || postCloseSession.summary?.salesByChannel,
                )}
              title="Cajas agregadores"
            />
          </div>
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setPostCloseSession(null)}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Abrir otra caja
            </button>
            <button
              onClick={() => navigate(cajaHomePath)}
              className="flex-1 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Ir a Caja
            </button>
            <button
              onClick={() => {
                try {
                  if (window.history.length > 1) window.history.back();
                  else navigate(opsHomePath);
                } catch { /* ignore */ }
              }}
              className="flex-1 py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>,
    );
  }

  if (!isTpvRegisterSessionOpen(activeSession)) {
    if (isWorkerUser && !isTabletSession && !loading && !user?.employment?.salesPointId?.trim()) {
      return wrapShell(
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Store className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin tienda asignada</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Tu gerente debe asignarte un local en <span className="font-semibold">Equipo</span> antes de abrir caja en el TPV.
            </p>
            <button
              type="button"
              onClick={() => navigate('/saas/worker/tasks')}
              className="w-full py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold"
            >
              Volver a Mi trabajo
            </button>
          </div>
        </div>,
      );
    }

    if (isWorkerUser && !isTabletSession && !loading && user?.employment?.salesPointId?.trim() && pointsOfSale.length === 0) {
      return wrapShell(
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Tienda no disponible</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              El local asignado aún no tiene PDV de caja listo. Pide al gerente que complete la dirección de la tienda en Ajustes.
            </p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold mb-2"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/worker/tasks')}
              className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold"
            >
              Volver a Mi trabajo
            </button>
          </div>
        </div>,
      );
    }

    const openingRestrictedPdvId = tabletRestrictedPdvId
      || (isWorkerUser ? workerAssignedPdvId : managerPdvPickId);

    const openingScreen = (
      <OpeningScreen
        onOpen={handleOpen}
        loading={loading}
        pointsOfSale={pointsOfSale}
        workCenters={workCenters}
        workerOptions={openingWorkerOptions}
        registerSessions={sessions}
        isManagerView={!isWorkerUser && !isTabletSession}
        isTabletMode={isTabletSession}
        tabletStoreLabel={tabletBinding?.pdvName}
        restrictedToPdvId={openingRestrictedPdvId}
        onOpeningPdvChange={handleOpeningPdvChange}
        onRequestPrinter={(ctx) => {
          setOpeningPrinterCtx(ctx);
          setShowPrinter(true);
        }}
        onClearStorePick={
          !isWorkerUser && !isTabletSession
            ? () => {
                const bid = resolveBusinessScopeId(currentBusiness);
                if (bid && dataUserId) writeDeliveryOpsSelectedPdvId(bid, dataUserId, null);
                skipManagerAutoPdvRef.current = true;
                setManagerPdvPickId(null);
                onManagerStoreCleared?.();
              }
            : undefined
        }
      />
    );

    return wrapShell(openingScreen);
  }

  return wrapShell(
    <TpvRegisterBoardReadyContext.Provider value>
      <div className={tpvFrameClass}>
        <RegisterStatusBar
          session={activeSession}
          onRequestClockIn={() => setShowClockIn(true)}
          onRequestClose={() => void handleRequestClose()}
          onRequestCashCount={() => setShowCashCount(true)}
          onRequestIncident={() => setShowIncident(true)}
          onRequestCashOps={() => setShowCashOps(true)}
          onRequestPrinter={() => setShowPrinter(true)}
          clockedInWorkers={activeStaff}
          clockedInWorkersLoading={clockedInWorkersLoading}
          selectedOrderTakerId={selectedOrderTakerId}
          onSelectOrderTaker={setSelectedOrderTakerId}
          isTabletMode={isTabletSession}
          minimal={compactRegisterChrome}
        />
        {!compactRegisterChrome && registerSessionSpansMultipleDays(activeSession) && (
          <div className="relative z-20 bg-amber-100 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-800 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 flex-wrap">
            <span>
              Caja abierta desde el{' '}
              <strong>{new Date(activeSession.openedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</strong>
              . Ciérrala para el cierre diario y abre una caja nueva hoy ({localCalendarDayKey()}).
            </span>
            <button
              type="button"
              onClick={() => void handleRequestClose()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700"
            >
              Cerrar caja
            </button>
          </div>
        )}
        {!compactRegisterChrome && <RegisterCashOpsStrip session={activeSession} />}
        <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col overflow-hidden relative">
          {!clockInGate.allowed && !showClockIn && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/55 backdrop-blur-[2px] p-4">
              <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mx-auto">
                  <LogIn className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Fichaje requerido</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {tpvClockInBlockMessage(clockInGate.reason, isWorkerUser)}
                  </p>
                  {clockInStoreScope?.storeLabel && (
                    <p className="text-xs text-gray-400 mt-2">
                      Local: <span className="font-semibold text-gray-600 dark:text-gray-300">{clockInStoreScope.storeLabel}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowClockIn(true)}
                  className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm"
                >
                  Fichar equipo en este local
                </button>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
      {showClosing && (
        <TpvGatePortal>
          <ClosingScreen
            session={activeSession}
            dataUserId={dataUserId}
            onClose={handleClose}
            onCancel={() => setShowClosing(false)}
            restaurantWarnings={restaurantCloseWarnings}
          />
        </TpvGatePortal>
      )}
      {showCashCount && (
        <TpvGatePortal>
          <CashCountModal session={activeSession} onConfirm={(d, n) => performCashCount(activeSession.workerName, d, n)} onCancel={() => setShowCashCount(false)} />
        </TpvGatePortal>
      )}
      {showCashOps && (
        <TpvGatePortal>
          <TpvCashOpsModal
            registeredBy={activeSession.workerName}
            onClose={() => setShowCashOps(false)}
            onConfirm={async (tx) => { await addTransaction(tx); }}
          />
        </TpvGatePortal>
      )}
      {showIncident && (
        <TpvGatePortal>
          <IncidentModal session={activeSession} onConfirm={addIncident} onCancel={() => setShowIncident(false)} />
        </TpvGatePortal>
      )}
    </TpvRegisterBoardReadyContext.Provider>,
  );
}
