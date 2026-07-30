import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, createContext, useContext, lazy, Suspense, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { toUserFacingMessage, extractErrorMessage } from '../../lib/userFacingError';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useApp } from '../../context/AppContext';
import { usePointOfSaleAccess } from '../../hooks/usePointOfSaleAccess';
import { writeBillingSelection } from '../../lib/billingSelection';
import { formatAddonPriceShort } from '../../lib/planAddonCatalog';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
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
import { calcTpvExpectedCash, buildTpvRegisterSummary, calcTpvShiftCollectionsTotal, countNetSaleOperations, sumCashReturns, sumCashStaffConsumption } from '../../lib/tpvCajaMath';
import { formatMoneyAsYouType } from '../../lib/workCenterMoneyInput';
import { consumeSalaTpvLaunch } from '../../lib/salaTpvLaunch';
import {
  mergeTpvRegisterSessionsPreservingOpen,
  pickNewestOpenRegisterSessionForStore,
  resolveActiveTpvRegisterSession,
  findLastClosedTpvSession,
  resolvePreviousCloseCashAmount,
  tpvSessionBelongsToBusiness,
  tpvSessionMatchesStoreRef,
} from '../../lib/tpvCajaScope';
import { fetchShiftOrdersForSession } from '../../lib/registerShiftOrders';
import {
  buildAggregatorCashRows,
  getClosingAggregatorPlatforms,
  aggregatorRowsFromClosingTotals,
  parseAggregatorAmount,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import {
  buildShiftFoodFamilyReportForSession,
  emptyFoodFamilyCounts,
  mergeTpvAndAppsFoodCounts,
  tpvOnlyFoodFromReport,
  type FoodFamilyCounts,
} from '../../lib/shiftFoodFamilyCounts';
import {
  buildShiftSalesBreakdown,
  filterOrdersForRegisterSession,
} from '../../lib/registerShiftSalesBreakdown';
import { AggregatorClosingEditor, type AggregatorClosingSnapshot, type ManualLinesByChannel } from './AggregatorClosingEditor';
import { DeliveryFoodUnitIcon } from './delivery/DeliveryFoodUnitIcon';
import { RegisterShiftSalesBreakdown } from './RegisterShiftSalesBreakdown';
import { AggregatorCashSummary } from './AggregatorCashSummary';
import { ShiftBrandBillingSummary } from './ShiftBrandBillingSummary';
import { buildShiftBrandRevenue, getOrderBrandShares } from '../../lib/registerShiftBrandBilling';
import { listBrandsRequest } from '../../lib/brandApi';
import { getBrandBillingConfigRequest } from '../../lib/brandBillingApi';
import {
  splitRulesFromBillingConfig,
  type BrandBillingSplitRules,
} from '../../lib/brandBillingConfig';
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
import { useSSE } from '../../hooks/useSSE';
import { getAuthHeaders } from '../../lib/authApi';
import {
  evaluateTpvRegisterLoadGate,
  resolveTpvRegisterBidAtStart,
  resolveTpvRegisterScope,
  resolveRetailOpsWriteBusinessId,
  shouldApplyTpvRegisterLoadResult,
} from '../../lib/tpvRegisterScope';
import {
  leaveTpvTabletSession,
  mergeTabletBindingPdv,
  readTpvTabletBinding,
} from '../../lib/tpvTabletSession';

import {
  filterUsersForStoreClockin,
  loadClockedInStoreWorkers,
  pickDefaultOrderTakerForSession,
  buildTpvActiveStaff,
  clockinIdsMatch,
  clockinValidForRegisterSession,
  type TpvClockedInWorker,
} from '../../lib/tpvClockedInWorkers';
import { pickPreferredMemberClockin, todayDateStr, dateDaysAgo } from '../../lib/clockinHistoryUtils';
import { deriveEffectiveClockinStatus, isClockinPresent } from '../../lib/clockinStatus';
import { normalizeClockinUserId } from '../../lib/clockinUserId';
import { ClockedInWorkerBubbles } from './ClockedInWorkerBubbles';
import { useTpvOrderFlowActive } from '../../context/TpvChromeContext';
import { TpvCashOpsModal } from './TpvCashOpsModal';
import type { TpvPrinterScope } from './TpvPrinterSetupPanel';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import { readNativePrinterDiagnosticsSync, readPrinterVerifiedHost } from '../../lib/vertialPrint/nativePrinterDiagnostics';
import { setActivePrinterScope } from '../../lib/vertialPrint/printerActiveScope';

const TpvPrinterSetupModal = lazy(() =>
  import('./TpvPrinterSetupModal').then((m) => ({ default: m.TpvPrinterSetupModal })),
);
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../lib/tpvTabletOffline';
import {
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  listClockins,
  fetchMemberWorkBlock,
  fetchMembersWorkBlocks,
  type ClockinRecord,
} from '../../lib/clockinsApi';
import type { WorkCenter } from '../../lib/workCentersApi';
import { listUsersRequest, type AuthUser } from '../../lib/authApi';
import {
  Lock, Unlock, Banknote, CreditCard, Phone as PhoneIcon, Wifi, User, Monitor,
  Printer, Smartphone, CheckCircle2, X, AlertTriangle, Calculator, ChevronDown,
  ChevronUp, Clock, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3,
  MapPin, Store, Plus, LogIn, UserCheck, Loader2, RefreshCw, Coffee, Square,
  MoreVertical, Save,
} from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

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

function parseClosingCountInput(raw: string, fallback = 0): number {
  const t = String(raw || '').trim().replace(',', '.');
  if (!t) return Math.max(0, Math.floor(fallback));
  const n = Math.floor(Number(t));
  return Number.isFinite(n) && n >= 0 ? n : Math.max(0, Math.floor(fallback));
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
  // Si el listado de tiendas aún no cargó, no borrar cajas abiertas (evita OpeningScreen eterno).
  if (isTpvRegisterSessionOpen(session)) {
    if (scopedPdvs.length === 0) return true;
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

/** Atajos del vertical (p. ej. delivery) a la izquierda del tick verde / nombre de tienda. */
export type TpvStatusBarQuickAction = {
  id: string;
  label: string;
  title?: string;
  active?: boolean;
  /** Resalte opcional (p. ej. consumo equipo). */
  tone?: 'default' | 'amber';
  onClick: () => void;
  icon: ReactNode;
};

type TpvStatusBarQuickActionsApi = {
  setQuickActions: (actions: TpvStatusBarQuickAction[] | null) => void;
};

const TpvStatusBarQuickActionsContext = createContext<TpvStatusBarQuickActionsApi | null>(null);

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

/** Registra botones junto al tick verde de caja abierta (barra superior). */
export function useTpvStatusBarQuickActions(): TpvStatusBarQuickActionsApi['setQuickActions'] | null {
  return useContext(TpvStatusBarQuickActionsContext)?.setQuickActions ?? null;
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

function OpeningScreen({ onOpen, loading: parentLoading, pointsOfSale, workCenters, workerOptions, registerSessions, restrictedToPdvId, onClearStorePick, isManagerView = false, isTabletMode = false, tabletStoreLabel, onOpeningPdvChange, restaurantOpening = false }: {
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
  /** Bar/restaurante: tienda fijada arriba, sin auto-scroll al bloque terminal. */
  restaurantOpening?: boolean;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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
  const [vacationBlockedById, setVacationBlockedById] = useState<Record<string, string>>({});
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
  // Misma regla que sala/ensurePdvHasDefaultTerminal: active undefined = activo.
  const availableTerminals = selectedPdv?.terminals.filter((t) => t.active !== false) || [];
  const selectedTerminal = availableTerminals.find(t => t.id === selectedTerminalId);

  const previousCloseCash = useMemo(() => {
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const terminalId = selectedTerminal?.id || (isTabletMode ? `tablet-${pdvId || 'default'}` : '');
    const last = findLastClosedTpvSession(registerSessions, pdvId, terminalId, pointsOfSale);
    const fromFinal = resolvePreviousCloseCashAmount(last);
    if (fromFinal != null) return fromFinal;
    if (!last) return null;
    const amount = calcDenominationTotal(last.closingCashCount || {});
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
  }, [registerSessions, selectedPdv, restrictedToPdvId, selectedTerminal, isTabletMode, pointsOfSale]);

  const previousCloseLabel = useMemo(() => {
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const terminalId = selectedTerminal?.id || (isTabletMode ? `tablet-${pdvId || 'default'}` : '');
    const last = findLastClosedTpvSession(registerSessions, pdvId, terminalId, pointsOfSale);
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
  }, [registerSessions, selectedPdv, restrictedToPdvId, selectedTerminal, isTabletMode, pointsOfSale]);

  const didPrefillFromPreviousCloseRef = useRef(false);
  useEffect(() => {
    didPrefillFromPreviousCloseRef.current = false;
  }, [selectedPdvId, selectedTerminalId, previousCloseCash]);

  useEffect(() => {
    if (previousCloseCash == null) return;
    if (didPrefillFromPreviousCloseRef.current) return;
    didPrefillFromPreviousCloseRef.current = true;
    setCounts(buildDenominationFromAmount(previousCloseCash));
  }, [previousCloseCash]);

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
  // Bar/restaurante y tablet: si no hay terminal configurado, se usa uno sintético al abrir.
  const allowSyntheticTerminal = isTabletMode || restaurantOpening;
  const selectedWorkerVacationMsg = selectedWorkerId
    ? vacationBlockedById[selectedWorkerId] || vacationBlockedById[String(selectedWorkerId).trim()]
    : '';
  const canOpen = hasWorkers
    && Boolean(effectiveWorkerName())
    && hasResolvedPdv
    && (Boolean(selectedTerminal) || allowSyntheticTerminal)
    && !selectedWorkerVacationMsg;

  const openingBusinessId = useMemo(
    () => resolveBusinessScopeId(currentBusiness) || '',
    [currentBusiness],
  );

  const workerOptionsKey = useMemo(
    () => workerOptions.map((w) => `${w.id}:${w.name}`).join('|'),
    [workerOptions],
  );

  useEffect(() => {
    let cancelled = false;
    const ids = workerOptions.map((w) => w.id).filter(Boolean);
    if (!openingBusinessId || ids.length === 0) {
      setVacationBlockedById({});
      return;
    }
    void fetchMembersWorkBlocks(openingBusinessId, ids)
      .then((blocks) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [id, info] of Object.entries(blocks || {})) {
          if (info?.blocked) {
            next[id] = info.message || 'De vacaciones o baja — no puede abrir caja';
          }
        }
        setVacationBlockedById(next);
      })
      .catch(() => {
        if (!cancelled) setVacationBlockedById({});
      });
    return () => {
      cancelled = true;
    };
  }, [openingBusinessId, workerOptionsKey]);

  useEffect(() => {
    if (!selectedWorkerId || !vacationBlockedById[selectedWorkerId]) return;
    const firstOk = workerOptions.find((w) => !vacationBlockedById[w.id]);
    setSelectedWorkerId(firstOk?.id || '');
  }, [vacationBlockedById, selectedWorkerId, workerOptions]);

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
          toUserFacingMessage(err, 'No se pudo activar el PDV de esta tienda'),
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
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const syntheticTerminalId = allowSyntheticTerminal
      ? `${isTabletMode ? 'tablet' : 'tpv'}-${pdvId || 'default'}`
      : '';
    if (selectedWorkerId && vacationBlockedById[selectedWorkerId]) {
      toast.error(vacationBlockedById[selectedWorkerId]);
      return;
    }
    onOpen({
      workerId: selectedWorkerId || undefined,
      workerName: wName,
      pointOfSaleId: pdvId,
      pointOfSaleName: selectedPdv ? pointOfSaleDisplayLabel(selectedPdv) : (tabletStoreLabel || ''),
      terminalId: selectedTerminal?.id || syntheticTerminalId,
      terminalName: effectiveTerminalName || (isTabletMode ? 'Tablet' : 'Terminal principal'),
      datafonName: effectiveDatafon,
      printerName: effectivePrinter,
      counts,
    });
  };

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

  const goBack = () => {
    if (isTabletMode) {
      void leaveTpvTabletSession(logout);
      return;
    }
    try {
      if (window.history.length > 1) window.history.back();
      else if (isRestaurantBusinessType(currentBusiness?.businessType)) navigate('/saas/sala');
      else navigate('/saas/delivery-ops');
    } catch {
      // ignore
    }
  };

  const goToPdvBilling = () => {
    if (isIosCustomerAccessOnlyApp()) {
      toast.info('En iOS no se amplía el plan. Contacta con soporte si necesitas más PDV.');
      return;
    }
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
    if (restaurantOpening && restrictedToPdvId) return;
    terminalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedPdvId, selectedTerminalId, restaurantOpening, restrictedToPdvId]);

  useEffect(() => {
    if (!restaurantOpening) return;
    bodyScrollRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [restaurantOpening, selectedPdvId]);

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
                    {workerOptions.map((w) => {
                      const vacationMsg = vacationBlockedById[w.id];
                      const blocked = Boolean(vacationMsg);
                      return (
                      <button
                        key={w.id}
                        type="button"
                        disabled={blocked}
                        onClick={() => !blocked && setSelectedWorkerId(w.id)}
                        className={`p-3 min-h-[56px] rounded-xl border-2 text-left transition-all touch-manipulation ${
                          blocked
                            ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900/60 opacity-60 cursor-not-allowed'
                            : selectedWorkerId === w.id
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            blocked
                              ? 'bg-gray-300 dark:bg-gray-600 text-white'
                              : selectedWorkerId === w.id
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            <User className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-base text-gray-900 dark:text-gray-100 truncate">{w.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {blocked ? 'Vacaciones / baja' : 'Toca para seleccionar'}
                            </div>
                          </div>
                          {selectedWorkerId === w.id && !blocked && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 ml-auto" />
                          )}
                        </div>
                      </button>
                      );
                    })}
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
                <div className="relative space-y-2">
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
                        <option key={w.id} value={w.id} disabled={Boolean(vacationBlockedById[w.id])}>
                          {vacationBlockedById[w.id] ? `${w.name} (vacaciones/baja)` : w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedWorkerVacationMsg ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">{selectedWorkerVacationMsg}</p>
                  ) : null}
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
                    const termCount = pdv?.terminals.filter((t) => t.active !== false).length ?? 0;
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
                ) : allowSyntheticTerminal ? (
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                    Se usará el terminal principal de esta tienda al abrir caja.
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

type ClosingFormDraft = {
  v: 1;
  counts: CashDenominationCount;
  notes: string;
  cashSlot: string;
  manualFood: { pizza: string; burger: string; taco: string };
  appsManualDraft: ManualLinesByChannel;
};

function closingDraftStorageKey(sessionId: string): string {
  return `vertial.tpv.closingDraft.${String(sessionId || '').trim()}`;
}

function readClosingFormDraft(sessionId: string): ClosingFormDraft | null {
  const id = String(sessionId || '').trim();
  if (!id || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(closingDraftStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClosingFormDraft;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeClosingFormDraft(sessionId: string, draft: ClosingFormDraft): void {
  const id = String(sessionId || '').trim();
  if (!id || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(closingDraftStorageKey(id), JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

function clearClosingFormDraft(sessionId: string): void {
  const id = String(sessionId || '').trim();
  if (!id || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(closingDraftStorageKey(id));
  } catch {
    /* ignore */
  }
}

function ClosingScreen({ session, dataUserId, onClose, onCancel, restaurantWarnings = [], busy = false, showDeliveryClosingSlots = true }: {
  session: TpvRegisterSession;
  dataUserId: string;
  onClose: (
    counts: CashDenominationCount,
    notes: string,
    aggregatorRows: AggregatorCashRow[],
    productClosingCounts: NonNullable<TpvRegisterSession['productClosingCounts']>,
  ) => void;
  onCancel: () => void;
  restaurantWarnings?: string[];
  busy?: boolean;
  /** Delivery: slots Efectivo + pizzas/burgers/tacos editables. */
  showDeliveryClosingSlots?: boolean;
}) {
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness) || '';
  const sessionId = String(session._id || '').trim();
  const savedDraft = useMemo(() => readClosingFormDraft(sessionId), [sessionId]);
  const [counts, setCounts] = useState<CashDenominationCount>(() => savedDraft?.counts || {});
  const [notes, setNotes] = useState(() => savedDraft?.notes || '');
  const [shiftOrders, setShiftOrders] = useState<DeliveryOrder[]>([]);
  const [shiftOrdersLoading, setShiftOrdersLoading] = useState(true);
  const [cashSlot, setCashSlot] = useState(() => savedDraft?.cashSlot || '');
  const [cashSlotFocused, setCashSlotFocused] = useState(false);
  const [manualFood, setManualFood] = useState(
    () => savedDraft?.manualFood || { pizza: '', burger: '', taco: '' },
  );
  const draftHasFood = Boolean(
    savedDraft?.manualFood
    && (
      String(savedDraft.manualFood.pizza || '').trim()
      || String(savedDraft.manualFood.burger || '').trim()
      || String(savedDraft.manualFood.taco || '').trim()
    ),
  );
  const [foodSlotsInitialized, setFoodSlotsInitialized] = useState(() => draftHasFood);
  const [appsSnapshot, setAppsSnapshot] = useState<AggregatorClosingSnapshot | null>(null);
  const [appsManualDraft, setAppsManualDraft] = useState<ManualLinesByChannel>(
    () => savedDraft?.appsManualDraft || {},
  );
  const [draftRestored] = useState(() => Boolean(savedDraft));
  const [showExtraDetail, setShowExtraDetail] = useState(false);
  const [showDayOrders, setShowDayOrders] = useState(true);
  const [brandLabels, setBrandLabels] = useState<Record<string, string>>({});
  const [billingRules, setBillingRules] = useState<BrandBillingSplitRules>(() =>
    splitRulesFromBillingConfig(null),
  );
  const countedTotal = calcDenominationTotal(counts);
  const expectedTpv = calcTpvExpectedCash(session);
  const summary = buildTpvRegisterSummary(session);
  const cashStaffConsumption = sumCashStaffConsumption(session);
  const cashReturnsTotal = sumCashReturns(session);
  const closingPlatforms = useMemo(() => getClosingAggregatorPlatforms(), []);
  const aggregatorRows = useMemo(
    () => buildAggregatorCashRows(closingPlatforms, session, shiftOrders),
    [closingPlatforms, session, shiftOrders],
  );
  const foodReport = useMemo(
    () => buildShiftFoodFamilyReportForSession(session, shiftOrders),
    [session, shiftOrders],
  );
  const tpvSystemFood = useMemo(() => tpvOnlyFoodFromReport(foodReport), [foodReport]);
  const dayOrdersBreakdown = useMemo(() => {
    const scoped = filterOrdersForRegisterSession(session, shiftOrders);
    return buildShiftSalesBreakdown(scoped);
  }, [session, shiftOrders]);

  const orderBrandSharesById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getOrderBrandShares>>();
    const scoped = filterOrdersForRegisterSession(session, shiftOrders);
    for (const order of scoped) {
      const id = String(order._id || order.id || '').trim();
      if (!id) continue;
      map.set(id, getOrderBrandShares(order, brandLabels, billingRules));
    }
    return map;
  }, [session, shiftOrders, brandLabels, billingRules]);

  const handleAppsSnapshotChange = useCallback((snap: AggregatorClosingSnapshot) => {
    setAppsSnapshot(snap);
  }, []);

  const handleAppsManualDraftChange = useCallback((draft: ManualLinesByChannel) => {
    setAppsManualDraft(draft);
  }, []);

  const buildDraftPayload = useCallback((): ClosingFormDraft => ({
    v: 1,
    counts,
    notes,
    cashSlot,
    manualFood,
    appsManualDraft,
  }), [counts, notes, cashSlot, manualFood, appsManualDraft]);

  const persistDraft = useCallback(() => {
    if (!sessionId) return;
    writeClosingFormDraft(sessionId, buildDraftPayload());
  }, [sessionId, buildDraftPayload]);

  const handleSaveForLater = useCallback(() => {
    if (busy) return;
    persistDraft();
    toast.success('Cierre guardado. Puedes seguir luego desde Cerrar caja.');
    onCancel();
  }, [busy, persistDraft, onCancel]);

  // Auto-guarda mientras rellenan (por si cierran con Atrás / Cancelar).
  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(() => {
      writeClosingFormDraft(sessionId, {
        v: 1,
        counts,
        notes,
        cashSlot,
        manualFood,
        appsManualDraft,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [sessionId, counts, notes, cashSlot, manualFood, appsManualDraft]);

  const closingFoodByChannel = appsSnapshot?.foodByChannel ?? {};
  const appsFoodTotals = appsSnapshot?.foodTotals ?? emptyFoodFamilyCounts();
  const finalAggregatorRows = appsSnapshot?.rows ?? aggregatorRows;
  const aggregatorCashTotal = appsSnapshot?.cashTotal ?? 0;
  const aggregatorCardTotal = appsSnapshot?.cardTotal ?? 0;

  const tpvClosingFood: FoodFamilyCounts = useMemo(() => {
    if (!showDeliveryClosingSlots) return foodReport.total;
    return {
      pizza: parseClosingCountInput(manualFood.pizza, tpvSystemFood.pizza),
      burger: parseClosingCountInput(manualFood.burger, tpvSystemFood.burger),
      taco: parseClosingCountInput(manualFood.taco, tpvSystemFood.taco),
    };
  }, [showDeliveryClosingSlots, manualFood, tpvSystemFood, foodReport.total]);

  const closingFood: FoodFamilyCounts = useMemo(() => {
    if (!showDeliveryClosingSlots) return foodReport.total;
    return mergeTpvAndAppsFoodCounts(tpvClosingFood, closingFoodByChannel);
  }, [showDeliveryClosingSlots, foodReport.total, tpvClosingFood, closingFoodByChannel]);

  const expected = Math.round((expectedTpv + aggregatorCashTotal) * 100) / 100;
  const diff = countedTotal - expected;
  const tpvCashSales = Math.round((Number(summary.salesByMethod.efectivo) || 0) * 100) / 100;
  const tpvCardSales = Math.round((Number(summary.salesByMethod.tarjeta) || 0) * 100) / 100;
  const tpvBizumSales = Math.round((Number(summary.salesByMethod.bizum) || 0) * 100) / 100;
  const tpvOnlineSales = Math.round((Number(summary.salesByMethod.online) || 0) * 100) / 100;
  const tpvOtherSales = Math.round((Number(summary.salesByMethod.otro) || 0) * 100) / 100;
  const tpvAllSales = Math.round((Number(summary.totalSales) || 0) * 100) / 100;
  const dayCashTotal = Math.round((tpvCashSales + aggregatorCashTotal) * 100) / 100;
  const dayCardTotal = Math.round((tpvCardSales + aggregatorCardTotal) * 100) / 100;
  const appsMoneyTotal = Math.round((aggregatorCashTotal + aggregatorCardTotal) * 100) / 100;
  const dayMoneyTotal = Math.round((tpvAllSales + appsMoneyTotal) * 100) / 100;
  const cashSlotDisplay = cashSlotFocused
    ? cashSlot
    : countedTotal > 0
      ? countedTotal.toFixed(2)
      : cashSlot;

  useEffect(() => {
    if (!showDeliveryClosingSlots || foodSlotsInitialized) return;
    if (draftHasFood) {
      setFoodSlotsInitialized(true);
      return;
    }
    setManualFood({
      pizza: String(tpvSystemFood.pizza || 0),
      burger: String(tpvSystemFood.burger || 0),
      taco: String(tpvSystemFood.taco || 0),
    });
    setFoodSlotsInitialized(true);
  }, [showDeliveryClosingSlots, foodSlotsInitialized, tpvSystemFood, draftHasFood]);

  useEffect(() => {
    if (!showDeliveryClosingSlots || !foodSlotsInitialized || shiftOrdersLoading || draftHasFood) return;
    setManualFood((prev) => {
      const stillDefault = prev.pizza === '0' && prev.burger === '0' && prev.taco === '0';
      if (!stillDefault) return prev;
      if (tpvSystemFood.pizza === 0 && tpvSystemFood.burger === 0 && tpvSystemFood.taco === 0) return prev;
      return {
        pizza: String(tpvSystemFood.pizza || 0),
        burger: String(tpvSystemFood.burger || 0),
        taco: String(tpvSystemFood.taco || 0),
      };
    });
  }, [showDeliveryClosingSlots, foodSlotsInitialized, shiftOrdersLoading, tpvSystemFood, draftHasFood]);

  const handleCashSlotChange = useCallback((value: string) => {
    const formatted = formatMoneyAsYouType(value, true);
    setCashSlot(formatted);
    const parsed = parseAggregatorAmount(formatted);
    if (parsed == null) {
      if (!String(formatted || '').trim()) setCounts({});
      return;
    }
    setCounts(buildDenominationFromAmount(parsed));
  }, []);

  const handleFoodSlotChange = useCallback((key: keyof FoodFamilyCounts, value: string) => {
    const cleaned = value.replace(/[^\d]/g, '');
    setManualFood((prev) => ({ ...prev, [key]: cleaned }));
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

  useEffect(() => {
    if (!businessId || !showDeliveryClosingSlots) return;
    let cancelled = false;
    void Promise.all([
      listBrandsRequest(businessId),
      getBrandBillingConfigRequest(businessId).catch(() => null),
    ])
      .then(([brands, billingConfig]) => {
        if (cancelled) return;
        const labels: Record<string, string> = {};
        for (const b of brands) {
          const id = String(b._id || b.id || '').trim();
          if (id) labels[id] = b.name;
        }
        setBrandLabels(labels);
        setBillingRules(splitRulesFromBillingConfig(billingConfig));
      })
      .catch(() => {
        if (!cancelled) {
          setBrandLabels({});
          setBillingRules(splitRulesFromBillingConfig(null));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, showDeliveryClosingSlots]);

  const brandBilling = useMemo(
    () => buildShiftBrandRevenue(session, shiftOrders, brandLabels, billingRules),
    [session, shiftOrders, brandLabels, billingRules],
  );

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col min-h-0" style={{ maxHeight: '96vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Lock className="w-5 h-5 text-zinc-600" /> Cierre de caja</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}{session.terminalName} · {session.workerName}
                {showDeliveryClosingSlots ? ' · Contar efectivo + apps' : ''}
              </p>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
          {draftRestored ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Borrador recuperado — lo que guardaste antes sigue aquí.
            </p>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {restaurantWarnings.length > 0 ? (
            <div className="rounded-xl border border-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-600 p-4 space-y-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Sala con actividad pendiente
              </p>
              <ul className="text-xs text-zinc-700 dark:text-zinc-300 list-disc pl-5 space-y-0.5">
                {restaurantWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                Puedes cerrar la caja igualmente; revisa que no queden cuentas sin cobrar.
              </p>
            </div>
          ) : null}

          {/* 1) Totales del día */}
          {showDeliveryClosingSlots ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/30 p-3 sm:p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">1. Totales del día</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Efectivo y tarjeta del TPV, y unidades vendidas en TPV (sin apps).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border-2 border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/25 p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5" /> Efectivo total
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-emerald-900 dark:text-emerald-100">
                    {summary.salesByMethod.efectivo.toFixed(2)}€
                  </p>
                  <p className="text-[10px] text-emerald-800/70 dark:text-emerald-200/60 mt-0.5">Cobros en efectivo (caja)</p>
                </div>
                <div className="rounded-xl border-2 border-sky-200/80 dark:border-sky-800/60 bg-sky-50/70 dark:bg-sky-950/25 p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Tarjeta total
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-sky-900 dark:text-sky-100">
                    {summary.salesByMethod.tarjeta.toFixed(2)}€
                  </p>
                  <p className="text-[10px] text-sky-800/70 dark:text-sky-200/60 mt-0.5">Cobros con tarjeta (caja)</p>
                </div>
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Toca para editar unidades
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label className="rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900 p-3 flex flex-col gap-1 cursor-text shadow-sm hover:border-indigo-500 hover:shadow-md hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-all active:scale-[0.99]">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5">
                    <DeliveryFoodUnitIcon unit="pizza" className="w-4 h-4" />
                    Pizzas
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={manualFood.pizza}
                    onChange={(e) => handleFoodSlotChange('pizza', e.target.value)}
                    className="w-full px-2.5 py-2.5 text-base font-bold tabular-nums border-2 border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/40 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {Number(manualFood.pizza || 0) !== tpvSystemFood.pizza ? (
                    <span className="text-[10px] text-zinc-500">Sistema: {tpvSystemFood.pizza}</span>
                  ) : null}
                </label>
                <label className="rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900 p-3 flex flex-col gap-1 cursor-text shadow-sm hover:border-indigo-500 hover:shadow-md hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-all active:scale-[0.99]">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5">
                    <DeliveryFoodUnitIcon unit="burger" className="w-4 h-4" />
                    Burgers
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={manualFood.burger}
                    onChange={(e) => handleFoodSlotChange('burger', e.target.value)}
                    className="w-full px-2.5 py-2.5 text-base font-bold tabular-nums border-2 border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/40 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {Number(manualFood.burger || 0) !== tpvSystemFood.burger ? (
                    <span className="text-[10px] text-zinc-500">Sistema: {tpvSystemFood.burger}</span>
                  ) : null}
                </label>
                <label className="rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900 p-3 flex flex-col gap-1 cursor-text shadow-sm hover:border-indigo-500 hover:shadow-md hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-all active:scale-[0.99]">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5">
                    <DeliveryFoodUnitIcon unit="taco" className="w-4 h-4" />
                    Tacos
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={manualFood.taco}
                    onChange={(e) => handleFoodSlotChange('taco', e.target.value)}
                    className="w-full px-2.5 py-2.5 text-base font-bold tabular-nums border-2 border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/40 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {Number(manualFood.taco || 0) !== tpvSystemFood.taco ? (
                    <span className="text-[10px] text-zinc-500">Sistema: {tpvSystemFood.taco}</span>
                  ) : null}
                </label>
              </div>

              <ShiftBrandBillingSummary
                rows={brandBilling.rows}
                unbranded={brandBilling.unbranded}
                total={brandBilling.total}
                loading={shiftOrdersLoading}
                compact
              />

              <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowDayOrders((v) => !v)}
                  className={`w-full px-3 py-3 flex items-center justify-between text-left transition-all active:scale-[0.99] cursor-pointer ${
                    showDayOrders
                      ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                      : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/70'
                  }`}
                >
                  <span className={`text-xs font-bold ${showDayOrders ? 'text-white' : 'text-indigo-900 dark:text-indigo-100'}`}>
                    Pedidos del turno
                    <span className={`ml-1.5 font-semibold ${showDayOrders ? 'text-indigo-100' : 'text-indigo-600 dark:text-indigo-300'}`}>
                      ({dayOrdersBreakdown.orderCount})
                    </span>
                    <span className={`ml-2 text-[10px] font-semibold uppercase tracking-wide ${showDayOrders ? 'text-indigo-200' : 'text-indigo-500'}`}>
                      {showDayOrders ? 'Plegar' : 'Toca para abrir'}
                    </span>
                  </span>
                  {showDayOrders ? (
                    <ChevronUp className="w-5 h-5 text-white shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-indigo-600 dark:text-indigo-300 shrink-0" />
                  )}
                </button>
                {showDayOrders && (
                  <div className="border-t border-gray-100 dark:border-gray-800 max-h-[42vh] overflow-y-auto">
                    {shiftOrdersLoading ? (
                      <p className="px-3 py-3 text-[11px] text-gray-500">Cargando…</p>
                    ) : dayOrdersBreakdown.orders.length === 0 ? (
                      <p className="px-3 py-3 text-[11px] text-gray-500">Sin pedidos en este turno</p>
                    ) : (
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dayOrdersBreakdown.orders.map((order) => {
                          const time = order.createdAt
                            ? new Date(order.createdAt).toLocaleTimeString('es-ES', {
                                timeStyle: 'short',
                              })
                            : '—';
                          const brandShares = orderBrandSharesById.get(order.orderId) || [];
                          return (
                            <li key={order.orderId} className="px-3 py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    #{order.orderNumber} · {order.customerName || 'Cliente'}
                                  </p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    {time} · {order.channel || '—'} · {order.itemCount} uds
                                  </p>
                                  <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                                    {order.items
                                      .map((it) => `${it.quantity}× ${it.name}`)
                                      .join(' · ')}
                                  </p>
                                  {brandShares.length > 0 ? (
                                    <div className="mt-1.5 space-y-1">
                                      {brandShares.map((s) => {
                                        const showWhy =
                                          brandShares.length > 1 || s.sharedAssigned > 0;
                                        return (
                                          <div
                                            key={`${order.orderId}-${s.brandId || 'none'}`}
                                            className="rounded-md bg-gray-900/5 px-1.5 py-1 dark:bg-white/10"
                                          >
                                            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-gray-800 dark:text-gray-100">
                                              <span className="truncate max-w-[8rem]">{s.name}</span>
                                              <span className="tabular-nums shrink-0">
                                                {s.amount.toFixed(2)}€
                                              </span>
                                            </div>
                                            {showWhy && s.why ? (
                                              <p className="mt-0.5 text-[9px] leading-snug text-gray-500 dark:text-gray-400">
                                                {s.why}
                                              </p>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                                <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">
                                  {order.total.toFixed(2)}€
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Conteo de efectivo de cierre
              </h4>
              <CashCountGrid
                counts={counts}
                onChange={(next) => {
                  setCounts(next);
                  if (!cashSlotFocused) {
                    const total = calcDenominationTotal(next);
                    setCashSlot(total > 0 ? total.toFixed(2) : '');
                  }
                }}
              />
            </div>
          )}

          {/* 2–5) Integraciones por app */}
          {showDeliveryClosingSlots && (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Apps de delivery</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Por app: línea de pizzas, línea de burgers y línea de tacos (cantidad + efectivo + tarjeta).
                </p>
              </div>
              <AggregatorClosingEditor
                autoRows={aggregatorRows}
                foodByChannel={foodReport.byAggregator}
                initialManualDraft={
                  savedDraft?.appsManualDraft && Object.keys(savedDraft.appsManualDraft).length > 0
                    ? savedDraft.appsManualDraft
                    : null
                }
                onSnapshotChange={handleAppsSnapshotChange}
                onManualDraftChange={handleAppsManualDraftChange}
                title="Por integración"
                startStep={2}
              />
            </div>
          )}

          {/* Arqueo */}
          <div className="rounded-xl border-2 border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900/50 p-4 space-y-3 shadow-sm">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {showDeliveryClosingSlots ? `${1 + closingPlatforms.length + 1}. Arqueo` : 'Arqueo'}
            </p>

            {showDeliveryClosingSlots && (
              <label className="block rounded-xl border-2 border-dashed border-emerald-400 dark:border-emerald-600 bg-white dark:bg-zinc-900 p-3 cursor-text shadow-md hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all active:scale-[0.99]">
                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" /> Efectivo contado · toca para escribir
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={cashSlotDisplay}
                  onFocus={() => {
                    setCashSlotFocused(true);
                    setCashSlot(countedTotal > 0 ? countedTotal.toFixed(2) : cashSlot);
                  }}
                  onBlur={() => setCashSlotFocused(false)}
                  onChange={(e) => handleCashSlotChange(e.target.value)}
                  className="mt-1.5 w-full px-2.5 py-3 text-2xl font-black tabular-nums border-2 border-emerald-300 dark:border-emerald-700 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500">Lo que hay físicamente en la caja</span>
              </label>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Efectivo TPV (pedidos + fondo − salidas)</span>
              <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{expectedTpv.toFixed(2)}€</span>
            </div>
            {showDeliveryClosingSlots && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">+ Efectivo integraciones</span>
                <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{aggregatorCashTotal.toFixed(2)}€</span>
              </div>
            )}
            {showDeliveryClosingSlots && aggregatorCardTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Tarjeta apps (info)</span>
                <span className="font-bold tabular-nums text-sky-700 dark:text-sky-300">{aggregatorCardTotal.toFixed(2)}€</span>
              </div>
            )}
            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 flex justify-between items-baseline">
              <span className="text-zinc-900 dark:text-zinc-100 font-bold">Esperado en caja</span>
              <span className="text-emerald-800 dark:text-emerald-200 text-xl font-black tabular-nums">{expected.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Contado</span>
              <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{countedTotal.toFixed(2)}€</span>
            </div>
            {countedTotal > 0 && (
              <div className={`mt-1 p-3 rounded-xl border-2 ${diff === 0 ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-700' : 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Diferencia</span>
                  <span className={`text-2xl font-black tabular-nums ${diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}€
                  </span>
                </div>
                {diff === 0 && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> La caja cuadra
                  </p>
                )}
                {diff !== 0 && (
                  <p className="text-xs mt-1 flex items-center gap-1 text-amber-800 dark:text-amber-200 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" /> {diff > 0 ? 'Sobrante' : 'Falta efectivo'}
                  </p>
                )}
              </div>
            )}
            {showDeliveryClosingSlots && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                El total del día (TPV + apps) está abajo en «Total del día».
              </p>
            )}
          </div>

          {/* Detalle opcional (plegado) */}
          <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setShowExtraDetail((v) => !v)}
              className={`w-full px-3 py-3 flex items-center justify-between text-left text-xs font-bold transition-all active:scale-[0.99] cursor-pointer ${
                showExtraDetail
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/70'
              }`}
            >
              <span>
                {showExtraDetail ? 'Ocultar detalle del turno' : 'Ver detalle del turno (ventas, salidas…)'}
                {!showExtraDetail ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-indigo-500 dark:text-indigo-300">Toca</span>
                ) : null}
              </span>
              {showExtraDetail ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />}
            </button>
            {showExtraDetail && (
              <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <div className="text-[10px] text-zinc-500">Ventas</div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{summary.totalSales.toFixed(2)}€</div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <div className="text-[10px] text-zinc-500">Devoluciones</div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{summary.totalReturns.toFixed(2)}€</div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <div className="text-[10px] text-zinc-500">Entradas</div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{summary.totalCashIn.toFixed(2)}€</div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <div className="text-[10px] text-zinc-500">Salidas</div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{summary.totalCashOut.toFixed(2)}€</div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap text-[11px]">
                  {summary.salesByMethod.efectivo > 0 && <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">Efectivo: {summary.salesByMethod.efectivo.toFixed(2)}€</span>}
                  {summary.salesByMethod.tarjeta > 0 && <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">Tarjeta: {summary.salesByMethod.tarjeta.toFixed(2)}€</span>}
                  {summary.salesByMethod.bizum > 0 && <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">Bizum: {summary.salesByMethod.bizum.toFixed(2)}€</span>}
                  {summary.salesByMethod.online > 0 && <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">Online: {summary.salesByMethod.online.toFixed(2)}€</span>}
                  <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">{summary.totalTransactions} operaciones</span>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-zinc-500">Fondo apertura</span><span className="font-semibold">{session.initialCashAmount.toFixed(2)}€</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Cobros efectivo</span><span className="font-semibold">{summary.salesByMethod.efectivo.toFixed(2)}€</span></div>
                  {cashStaffConsumption > 0 && (
                    <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Consumo equipo</span><span className="font-semibold">{cashStaffConsumption.toFixed(2)}€</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Entradas</span><span className="font-semibold">{summary.totalCashIn.toFixed(2)}€</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">− Devoluciones</span><span className="font-semibold">{cashReturnsTotal.toFixed(2)}€</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">− Salidas</span><span className="font-semibold">{summary.totalCashOut.toFixed(2)}€</span></div>
                  <div className="border-t border-zinc-200 dark:border-zinc-700 pt-1.5 flex justify-between font-semibold">
                    <span>= Efectivo TPV</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{expectedTpv.toFixed(2)}€</span>
                  </div>
                </div>

                <RegisterShiftSalesBreakdown
                  session={session}
                  orders={shiftOrders}
                  loading={shiftOrdersLoading}
                  registerSummary={summary}
                />

                {(() => {
                  const cashOps = session.transactions.filter((t) => isTpvCashMovementTx(t.type));
                  if (cashOps.length === 0) {
                    return (
                      <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-400">
                        Sin movimientos de caja (entradas / salidas / devoluciones) en este turno.
                      </div>
                    );
                  }
                  return (
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Movimientos de caja ({cashOps.length})
                      </h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {[...cashOps].reverse().map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between gap-2 text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-gray-400 mr-1.5">
                                {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                              </span>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">
                                {TPV_CASH_TX_LABELS[tx.type] || tx.type}
                              </span>
                              {tx.description ? (
                                <span className="text-gray-500 ml-1.5 truncate">{tx.description}</span>
                              ) : null}
                            </div>
                            <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                              {tx.type === 'cash_in' ? '+' : '−'}
                              {tx.amount.toFixed(2)}€
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {showDeliveryClosingSlots && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Billetes / monedas (opcional)</h4>
                    <CashCountGrid
                      counts={counts}
                      onChange={(next) => {
                        setCounts(next);
                        if (!cashSlotFocused) {
                          const total = calcDenominationTotal(next);
                          setCashSlot(total > 0 ? total.toFixed(2) : '');
                        }
                      }}
                    />
                  </div>
                )}

                {session.cashCounts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Arqueos del turno</h4>
                    <div className="space-y-1">
                      {session.cashCounts.map((cc) => (
                        <div key={cc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <span className="text-gray-500">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}</span>
                          <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                            {cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(session.incidents?.length || 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Incidencias ({session.incidents.length})</h4>
                    <div className="space-y-1">
                      {session.incidents.map((inc) => (
                        <div key={inc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <span className="text-gray-600 truncate max-w-[220px]">{inc.description}</span>
                          {inc.amount != null && <span className="font-semibold">{inc.amount.toFixed(2)}€</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas (opcional)</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Observaciones del cierre..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {showDeliveryClosingSlots ? (
            <div className="rounded-2xl border border-zinc-800 dark:border-zinc-200 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 p-4 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide">Total del día</p>
                  <p className="text-[11px] opacity-70 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>TPV + apps</span>
                    <span className="inline-flex items-center gap-1 opacity-90">
                      <DeliveryFoodUnitIcon unit="pizza" className="w-3.5 h-3.5" muted />
                      {closingFood.pizza}
                    </span>
                    <span className="inline-flex items-center gap-1 opacity-90">
                      <DeliveryFoodUnitIcon unit="burger" className="w-3.5 h-3.5" muted />
                      {closingFood.burger}
                    </span>
                    <span className="inline-flex items-center gap-1 opacity-90">
                      <DeliveryFoodUnitIcon unit="taco" className="w-3.5 h-3.5" muted />
                      {closingFood.taco}
                    </span>
                  </p>
                </div>
                <p className="text-3xl font-black tabular-nums shrink-0 tracking-tight">{dayMoneyTotal.toFixed(2)}€</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-emerald-400/25 dark:bg-emerald-500/20 px-3 py-2.5 border border-emerald-300/40">
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">Efectivo</p>
                  <p className="text-xl font-black tabular-nums">{dayCashTotal.toFixed(2)}€</p>
                  <p className="text-[10px] opacity-60">
                    TPV {tpvCashSales.toFixed(2)} + apps {aggregatorCashTotal.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-400/25 dark:bg-sky-500/20 px-3 py-2.5 border border-sky-300/40">
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">Tarjeta</p>
                  <p className="text-xl font-black tabular-nums">{dayCardTotal.toFixed(2)}€</p>
                  <p className="text-[10px] opacity-60">
                    TPV {tpvCardSales.toFixed(2)} + apps {aggregatorCardTotal.toFixed(2)}
                  </p>
                </div>
              </div>
              {(tpvBizumSales > 0 || tpvOnlineSales > 0 || tpvOtherSales > 0) ? (
                <p className="text-[11px] opacity-75">
                  Otros cobros TPV:{' '}
                  {tpvBizumSales > 0 ? `Bizum ${tpvBizumSales.toFixed(2)}€ ` : ''}
                  {tpvOnlineSales > 0 ? `Online ${tpvOnlineSales.toFixed(2)}€ ` : ''}
                  {tpvOtherSales > 0 ? `Otros ${tpvOtherSales.toFixed(2)}€` : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {showDeliveryClosingSlots ? (
          <div className="flex-shrink-0 px-4 py-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-900 text-white dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-zinc-300">Total en vivo</span>
            <span className="tabular-nums font-semibold">
              {dayMoneyTotal.toFixed(2)}€
              <span className="ml-2 font-medium opacity-80">
                Ef. {dayCashTotal.toFixed(2)} · Tarj. {dayCardTotal.toFixed(2)}
              </span>
            </span>
          </div>
        ) : null}

        <div className="flex-shrink-0 p-4 sm:p-6 border-t border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-3 border-2 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveForLater}
            disabled={busy}
            className="px-4 py-3 border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 rounded-xl font-bold hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Guardar para luego
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose(counts, notes, finalAggregatorRows, {
              pizza: closingFood.pizza,
              burger: closingFood.burger,
              taco: closingFood.taco,
              byChannel: closingFoodByChannel,
            })}
            className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 ring-2 ring-indigo-400/40 ring-offset-2 ring-offset-white dark:ring-offset-zinc-800"
          >
            <Lock className="w-4 h-4" /> {busy ? 'Cerrando…' : 'Confirmar cierre de caja'}
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
  const [vacationBlockedById, setVacationBlockedById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError('');
    try {
      const today = todayDateStr();
      const yesterday = dateDaysAgo(1);
      const listOpts = {
        salesPointId: pdvId || undefined,
        workCenterId: workCenterId || undefined,
        storeScope: Boolean(pdvId),
        recordsOnly: true as const,
      };
      const [users, recordsToday, recordsYesterday] = await Promise.all([
        fetchBusinessUsers(businessId),
        listClockins(businessId, { ...listOpts, date: today }),
        listClockins(businessId, { ...listOpts, date: yesterday }),
      ]);
      const byId = new Map<string, ClockinRecord>();
      for (const r of [...recordsYesterday, ...recordsToday]) {
        if (r?._id) byId.set(r._id, r);
      }
      const records = Array.from(byId.values());
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
      const memberIds = teamList
        .map((m) => normalizeClockinUserId(m.user_id || m.id))
        .filter(Boolean);
      try {
        const blocks = await fetchMembersWorkBlocks(businessId, memberIds);
        const next: Record<string, string> = {};
        for (const [id, info] of Object.entries(blocks || {})) {
          if (info?.blocked) {
            next[id] = info.message || 'De vacaciones o baja — no puede fichar';
          }
        }
        setVacationBlockedById(next);
      } catch {
        setVacationBlockedById({});
      }
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
    const vacationMsg = vacationBlockedById[mid];
    if (vacationMsg) {
      setActionMsg({ type: 'err', text: vacationMsg });
      toast.error(vacationMsg, { id: 'tpv-clockin-vacation' });
      return;
    }
    setActingId(member.user_id);
    setActionMsg(null);
    let already = false;
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
      // Recargar hoy+ayer: el fichaje puede ser de anoche (UTC/local) y si no, no aparece.
      await load();
      setActionMsg({
        type: 'ok',
        text: already
          ? `${member.fullName || 'Trabajador'} ya estaba fichado. Usa Finalizar si acabó la jornada, o Continuar.`
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
            const mid = memberKey(member);
            const record = todayRecords.get(mid);
            const vacationMsg = vacationBlockedById[mid];
            const onVacation = Boolean(vacationMsg);
            const effectiveStatus = deriveEffectiveClockinStatus(record);
            const isActive = effectiveStatus === 'active';
            const isOnBreak = effectiveStatus === 'break';
            const isWorking = isClockinPresent(effectiveStatus);
            const isDone = effectiveStatus === 'completed';
            const canFichar = !onVacation && (!record || isDone);
            const canBreak = !onVacation && isWorking;
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
                  onVacation
                    ? 'border-sky-200 bg-sky-50/70 dark:bg-sky-950/20 dark:border-sky-900'
                    : canFichar && !isDone
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
                    onVacation
                      ? 'bg-sky-500 text-white'
                      : isOnBreak
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
                      {onVacation
                        ? (vacationMsg || 'Vacaciones / baja — no puede fichar ni operar')
                        : isOnBreak && clockInTime
                        ? `En descanso · entrada ${clockInTime}`
                        : isActive && clockInTime
                          ? `Trabajando · entrada ${clockInTime}`
                          : isDone
                            ? 'Jornada finalizada — puedes volver a fichar'
                            : 'Pulsa Fichar al entrar'}
                    </div>
                  </div>
                  {onVacation ? (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-bold uppercase tracking-wide">
                      Ausente
                    </span>
                  ) : canFichar && !isDone ? (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wide">
                      Pendiente
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busy || !canFichar}
                    onClick={() => void handleClockIn(member)}
                    title={onVacation ? vacationMsg || 'De vacaciones' : canFichar ? 'Registrar entrada' : 'Ya está en turno'}
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

function RegisterCashOpsStrip({
  session,
  compact = false,
  onRemove,
  removingId = null,
}: {
  session: TpvRegisterSession;
  compact?: boolean;
  onRemove?: (txId: string) => void;
  removingId?: string | null;
}) {
  const ops = session.transactions.filter((t) => isTpvCashMovementTx(t.type));
  const recent = [...ops].reverse();
  return (
    <div
      className={`relative z-10 bg-white/90 dark:bg-gray-900/60 border-b border-emerald-100 dark:border-emerald-900 px-3 ${
        compact ? 'py-1' : 'py-1.5'
      } flex items-center gap-2 overflow-x-auto text-[11px]`}
    >
      <span className="font-semibold text-gray-500 dark:text-gray-400 shrink-0">
        Movimientos de caja{ops.length > 0 ? ` (${ops.length})` : ''}:
      </span>
      {ops.length === 0 ? (
        <span className="text-gray-400 dark:text-gray-500">Sin entradas ni salidas aún</span>
      ) : (
        recent.map((tx) => (
          <span
            key={tx.id}
            className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800"
          >
            <span className="text-gray-400">
              {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
            </span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {TPV_CASH_TX_LABELS[tx.type] || tx.type}
            </span>
            <span className={`font-bold ${tx.type === 'cash_in' ? 'text-green-600' : 'text-red-600'}`}>
              {tx.type === 'cash_in' ? '+' : '−'}
              {tx.amount.toFixed(2)}€
            </span>
            {tx.description && (
              <span className="text-gray-500 truncate max-w-[140px]">{tx.description}</span>
            )}
            {onRemove ? (
              <button
                type="button"
                title="Eliminar movimiento (se descuenta de la caja)"
                disabled={removingId === tx.id}
                onClick={() => onRemove(tx.id)}
                className="ml-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </span>
        ))
      )}
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
  onRequestPrinterSetup,
  showNativePrinter = false,
  nativePrinterReady = false,
  clockedInWorkers,
  clockedInWorkersLoading,
  selectedOrderTakerId,
  onSelectOrderTaker,
  isTabletMode = false,
  minimal = false,
  quickActions = null,
}: {
  session: TpvRegisterSession;
  onRequestClockIn: () => void;
  onRequestClose: () => void;
  onRequestCashCount: () => void;
  onRequestIncident: () => void;
  onRequestCashOps: () => void;
  onRequestPrinterSetup?: () => void;
  showNativePrinter?: boolean;
  /** Ticket de prueba OK en la IP guardada de este dispositivo. */
  nativePrinterReady?: boolean;
  clockedInWorkers: TpvClockedInWorker[];
  clockedInWorkersLoading: boolean;
  selectedOrderTakerId: string | null;
  onSelectOrderTaker: (workerId: string) => void;
  isTabletMode?: boolean;
  /** Tablet en flujo de pedido: una sola fila mínima para dejar espacio al catálogo. */
  minimal?: boolean;
  /** Atajos del tablero (Buscar / Avisos / Historial…) a la izq. del tick verde. */
  quickActions?: TpvStatusBarQuickAction[] | null;
}) {
  const expected = calcTpvExpectedCash(session);
  const collections = calcTpvShiftCollectionsTotal(session);
  const txCount = countNetSaleOperations(session);
  const incidentCount = session.incidents?.filter(i => !i.resolvedAt).length || 0;
  const storeLabel = String(session.pointOfSaleName || '').trim();
  const terminalLabel = String(session.terminalName || '').trim();
  const collectionsTitle = [
    `Efectivo: ${collections.efectivo.toFixed(2)}€`,
    `Tarjeta: ${collections.tarjeta.toFixed(2)}€`,
    collections.cashIn > 0 ? `Entradas: +${collections.cashIn.toFixed(2)}€` : '',
    collections.cashOut > 0 ? `Salidas: −${collections.cashOut.toFixed(2)}€` : '',
    `Caja efectivo (arqueo): ${expected.toFixed(2)}€`,
  ]
    .filter(Boolean)
    .join(' · ');
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
  const [menuOpen, setMenuOpen] = useState(false);
  useModalClose(menuOpen, () => setMenuOpen(false));

  const runMenuAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  const cajaMenuItems: { id: string; label: string; title?: string; danger?: boolean; icon: ReactNode; onClick: () => void }[] = [
    {
      id: 'clockin',
      label: 'Fichar equipo',
      title: 'Fichar entrada del resto del equipo',
      icon: <UserCheck className="w-5 h-5" />,
      onClick: onRequestClockIn,
    },
    {
      id: 'cashops',
      label: 'Movimiento de caja',
      title: 'Entrada o salida de efectivo',
      icon: <Banknote className="w-5 h-5" />,
      onClick: onRequestCashOps,
    },
    ...(showNativePrinter && onRequestPrinterSetup
      ? [{
          id: 'printer',
          label: 'Ajustes impresora',
          title: nativePrinterReady ? 'Ajustes impresora' : 'Configurar impresora WiFi',
          icon: <Printer className="w-5 h-5" />,
          onClick: onRequestPrinterSetup,
        }]
      : []),
    {
      id: 'cashcount',
      label: 'Arqueo',
      title: 'Contar efectivo de la caja',
      icon: <Calculator className="w-5 h-5" />,
      onClick: onRequestCashCount,
    },
    {
      id: 'incident',
      label: 'Incidencia',
      title: 'Registrar incidencia',
      icon: <AlertTriangle className="w-5 h-5" />,
      onClick: onRequestIncident,
    },
    {
      id: 'close',
      label: 'Cerrar caja',
      title: 'Cerrar caja del turno',
      danger: true,
      icon: <Lock className="w-5 h-5" />,
      onClick: onRequestClose,
    },
  ];

  const menuPanel = menuOpen ? (
    <TpvGatePortal>
      <div className="fixed inset-0 z-[120] flex" role="dialog" aria-modal="true" aria-label="Menú TPV">
        <button
          type="button"
          className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
        <aside className="relative z-10 flex h-full w-[min(20rem,88vw)] flex-col bg-white dark:bg-stone-900 shadow-2xl border-r border-stone-200 dark:border-stone-700 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between gap-2 px-4 pb-3 border-b border-stone-200 dark:border-stone-700">
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Menú TPV</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                {storeLabel || 'Tienda'}
                {terminalLabel ? ` · ${terminalLabel}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 touch-manipulation"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
            {quickActions && quickActions.length > 0 ? (
              <div>
                <p className="px-1 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">Pedidos</p>
                <div className="space-y-1">
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => runMenuAction(action.onClick)}
                      className={`w-full flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-left touch-manipulation transition-colors ${
                        action.active
                          ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200'
                          : action.tone === 'amber'
                            ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                            : 'bg-stone-50 text-stone-800 hover:bg-stone-100 dark:bg-stone-800/60 dark:text-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span className="[&>svg]:w-5 [&>svg]:h-5 shrink-0 opacity-90">{action.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold leading-tight">{action.label}</span>
                        {action.title && action.title !== action.label ? (
                          <span className="block text-[11px] opacity-70 mt-0.5 leading-snug">{action.title}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <p className="px-1 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">Caja</p>
              <div className="space-y-1">
                {cajaMenuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => runMenuAction(item.onClick)}
                    className={`w-full flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-left touch-manipulation transition-colors ${
                      item.danger
                        ? 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60'
                        : 'bg-stone-50 text-stone-800 hover:bg-stone-100 dark:bg-stone-800/60 dark:text-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span className="shrink-0 opacity-90">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-tight">{item.label}</span>
                      {item.title && item.title !== item.label ? (
                        <span className="block text-[11px] opacity-70 mt-0.5 leading-snug">{item.title}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </TpvGatePortal>
  ) : null;

  const menuTrigger = (
    <button
      type="button"
      onClick={() => setMenuOpen(true)}
      title="Abrir menú TPV"
      aria-label="Abrir menú TPV"
      aria-expanded={menuOpen}
      className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-stone-200 bg-white text-stone-700 transition-colors touch-manipulation hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
    >
      <MoreVertical className="w-5 h-5" />
    </button>
  );

  if (minimal) {
    return (
      <>
      <div className="relative z-20 border-b border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 px-2 py-1.5 flex items-center gap-1.5 text-[11px] min-h-[52px] pt-[max(0.375rem,env(safe-area-inset-top))] overflow-visible">
        {menuTrigger}
        <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="sr-only">Caja abierta</span>
        </span>
        <div className="min-w-0 flex-1 flex flex-col justify-center leading-tight overflow-hidden">
          <span className="text-stone-800 dark:text-stone-100 font-semibold truncate" title={[storeLabel, terminalLabel].filter(Boolean).join(' · ')}>
            {storeLabel || 'Tienda'}
            {terminalLabel ? (
              <span className="font-normal text-stone-500 dark:text-stone-400"> · {terminalLabel}</span>
            ) : null}
          </span>
          <span
            className="font-bold text-stone-900 dark:text-stone-50 tabular-nums text-sm tracking-tight truncate"
            title={collectionsTitle}
          >
            {collections.total.toFixed(2)}€
            <span className="ml-1.5 font-medium text-[10px] text-stone-500 dark:text-stone-400">
              Ef {collections.efectivo.toFixed(0)} · Tj {collections.tarjeta.toFixed(0)}
              {(collections.cashIn > 0 || collections.cashOut > 0)
                ? ` · Mov ${(collections.cashIn - collections.cashOut).toFixed(0)}`
                : ''}
            </span>
          </span>
        </div>
        {incidentCount > 0 && (
          <span className="text-amber-600 font-semibold flex items-center shrink-0" title={`${incidentCount} incidencia(s)`}>
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
        )}
        {/* Bolitas fuera del scroll: el overflow cortaba el anillo de selección. */}
        <div className="flex items-center gap-1 shrink-0 overflow-visible pl-0.5">
          <ClockedInWorkerBubbles
            workers={clockedInWorkers}
            selectedId={selectedOrderTakerId}
            onSelect={onSelectOrderTaker}
            loading={clockedInWorkersLoading}
            compact
            ultraCompact
          />
          <button type="button" onClick={onRequestClockIn} title="Fichar equipo" className={actionBtn} aria-label="Fichar equipo">
            <UserCheck className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
      {menuPanel}
      </>
    );
  }

  return (
    <>
    <div className={`relative z-20 border-b border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 flex flex-col gap-2 text-xs pt-[max(0px,env(safe-area-inset-top))] ${isTabletMode ? 'px-2 py-2' : 'px-3 sm:px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3'}`}>
      <div className={`flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 ${isTabletMode ? 'text-[11px]' : ''}`}>
        {menuTrigger}
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> Caja abierta
        </span>
        {storeLabel && (
          <span className="text-stone-600 dark:text-stone-400 flex items-center gap-1 min-w-0 font-medium">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[180px] sm:max-w-[240px]" title={storeLabel}>{storeLabel}</span>
          </span>
        )}
        {terminalLabel && (
          <span className="text-stone-500 dark:text-stone-400 flex items-center gap-1 shrink-0">
            <Monitor className="w-3.5 h-3.5" /> {terminalLabel}
          </span>
        )}
        <span className="text-stone-500 dark:text-stone-400 flex items-center gap-1 tabular-nums">
          <Clock className="w-3.5 h-3.5" /> {new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
        </span>
        {txCount > 0 && (
          <span className="text-stone-500 dark:text-stone-400 flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> {txCount} ops
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-1 font-bold text-stone-900 dark:text-stone-100 tabular-nums"
          title={collectionsTitle}
        >
          <Banknote className="w-3.5 h-3.5 text-stone-500" />
          {collections.total.toFixed(2)}€
          <span className="font-medium text-[10px] text-stone-500 dark:text-stone-400">
            Ef {collections.efectivo.toFixed(2)} · Tj {collections.tarjeta.toFixed(2)}
            {(collections.cashIn > 0 || collections.cashOut > 0)
              ? ` · Mov ${(collections.cashIn - collections.cashOut).toFixed(2)}`
              : ''}
          </span>
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
          <UserCheck className="w-4 h-4 shrink-0" /> {isTabletMode ? 'Fichar' : 'Fichar equipo'}
        </button>
        <button type="button" onClick={onRequestCashOps} className={actionBtn}>
          <Banknote className="w-4 h-4 shrink-0" /> Mov. caja
        </button>
        {showNativePrinter && onRequestPrinterSetup && (
          <button
            type="button"
            onClick={onRequestPrinterSetup}
            title={nativePrinterReady ? 'Ajustes impresora' : 'Configurar impresora WiFi'}
            className={`${actionBtn} relative`}
          >
            <Printer className="w-4 h-4 shrink-0" /> Impresora
            {nativePrinterReady ? (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-stone-900" />
            ) : null}
          </button>
        )}
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
    {menuPanel}
    </>
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
  const { user, logout } = useAuth();
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
      businesses,
      businessesSettled: businessesFetchSettled,
    }),
    [currentBusiness, tabletBinding, user, location.pathname, businesses, businessesFetchSettled],
  );

  const isTabletSession = registerScope.isTabletSession;
  const orderFlowActive = useTpvOrderFlowActive();
  const isRestaurantVerticalChrome = isRestaurantBusinessType(currentBusiness?.businessType);
  const compactRegisterChrome = isTabletSession || orderFlowActive || isRestaurantVerticalChrome;
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
  /** Siempre true al montar: evita flash de Abrir caja/Fichar mientras llega la sesión abierta. */
  const [loading, setLoading] = useState(true);
  /**
   * Tras el primer load sin caja abierta, espera un instante por si la lista
   * llega un tick tarde (reentrada al TPV) antes de mostrar OpeningScreen.
   */
  const [openingRecoverHold, setOpeningRecoverHold] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  /** Snapshot de la caja a cerrar: el modal no debe desaparecer si activeSession parpadea. */
  const [closingSession, setClosingSession] = useState<TpvRegisterSession | null>(null);
  const [closingBusy, setClosingBusy] = useState(false);
  const [restaurantCloseWarnings, setRestaurantCloseWarnings] = useState<string[]>([]);
  const [showCashCount, setShowCashCount] = useState(false);
  const [showCashOps, setShowCashOps] = useState(false);
  const [showClockIn, setShowClockIn] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [printerBarTick, setPrinterBarTick] = useState(0);
  const [statusBarQuickActions, setStatusBarQuickActions] = useState<TpvStatusBarQuickAction[] | null>(null);
  const statusBarQuickActionsApi = useMemo<TpvStatusBarQuickActionsApi>(
    () => ({ setQuickActions: setStatusBarQuickActions }),
    [],
  );
  const isNativeApp = isVertialNativeApp();
  const nativePrinterReady = useMemo(() => {
    if (!isNativeApp) return false;
    void printerBarTick;
    const diag = readNativePrinterDiagnosticsSync();
    const verified = readPrinterVerifiedHost();
    return diag.ready && verified === diag.savedHost;
  }, [isNativeApp, printerBarTick]);
  const [postCloseSession, setPostCloseSession] = useState<TpvRegisterSession | null>(null);
  const [postCloseAggregatorRows, setPostCloseAggregatorRows] = useState<AggregatorCashRow[]>([]);
  const [managerPdvPickId, setManagerPdvPickId] = useState<string | null>(null);
  const [clockedInWorkers, setClockedInWorkers] = useState<TpvClockedInWorker[]>([]);
  const [clockedInWorkersLoading, setClockedInWorkersLoading] = useState(false);
  const [vacationBlockedIds, setVacationBlockedIds] = useState<string[]>([]);
  const clockedInWorkersRef = useRef<TpvClockedInWorker[]>([]);
  clockedInWorkersRef.current = clockedInWorkers;
  const [selectedOrderTakerId, setSelectedOrderTakerId] = useState<string | null>(null);
  const openingInFlightRef = useRef(false);
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

  const orderFlowActiveRef = useRef(orderFlowActive);
  orderFlowActiveRef.current = orderFlowActive;

  useEffect(() => {
    if (isWorkerUser || isTabletSession) return;
    const syncManagerPdvFromStorage = () => {
      // No cambiar de tienda a mitad de un pedido: evita volver a «Abrir caja».
      if (orderFlowActiveRef.current) return;
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
                return !pid || tpvSessionMatchesStoreRef(s, tabletPdvId, pointsOfSaleRef.current);
              });
            } else if (pointsOfSaleRef.current.length > 0) {
              next = sessData.filter((s) => shouldKeepTpvSessionInList(s, pointsOfSaleRef.current, bid));
            }
            return mergeTpvRegisterSessionsPreservingOpen(prev, next);
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

  /** Última caja abierta conocida: no perder el tablero si el pick de tienda parpadea. */
  const stickyOpenSessionRef = useRef<TpvRegisterSession | null>(null);

  const activeSession = useMemo(() => {
    const pickId = isTabletSession
      ? tabletRestrictedPdvId
      : isWorkerUser
        ? workerAssignedPdvId
        : managerPdvPickId;

    const holdStickyWhileOpen = Boolean(
      isTabletSession || isWorkerUser || orderFlowActive,
    );

    const { session, nextSticky } = resolveActiveTpvRegisterSession({
      sessions,
      sticky: stickyOpenSessionRef.current,
      pickId,
      pointsOfSale,
      holdStickyWhileOpen,
    });
    // Ref en el mismo render: si el pick parpadea en el siguiente update, sticky ya está.
    stickyOpenSessionRef.current = nextSticky;
    return session;
  }, [
    sessions,
    isTabletSession,
    tabletRestrictedPdvId,
    isWorkerUser,
    workerAssignedPdvId,
    managerPdvPickId,
    pointsOfSale,
    orderFlowActive,
  ]);

  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = isTpvRegisterSessionOpen(activeSession) ? activeSession?._id ?? null : null;

  useEffect(() => {
    const onSessionSync = (event: Event) => {
      const session = (event as CustomEvent<TpvRegisterSession>).detail;
      if (!session?._id) return;
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s._id === session._id);
        if (idx < 0) return [session, ...prev];
        return prev.map((s) => (s._id === session._id ? session : s));
      });
    };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
    return () => window.removeEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
  }, []);

  const sseAuthUserId = String(user?.user_id || user?.id || '').trim() || null;
  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [sseAuthUserId]);

  const applyLiveSession = useCallback((raw: unknown) => {
    const session = raw as TpvRegisterSession | null;
    if (!session?._id) return;
    window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: session }));
  }, []);

  useSSE({
    userId: sseAuthUserId,
    token: sseToken,
    businessId: scopeBusinessId || null,
    enabled: Boolean(sseAuthUserId && dataUserId),
    handlers: useMemo(
      () => ({
        tpv_session_updated: applyLiveSession,
      }),
      [applyLiveSession],
    ),
  });

  const activeStoreScope = useMemo(() => {
    const rawId = String(
      activeSession?.pointOfSaleId || tabletRestrictedPdvId || managerPdvPickId || '',
    ).trim();
    const pdv =
      pointsOfSale.find((p) => p._id === rawId)
      || pointsOfSale.find((p) => String(p.workCenterId || '').trim() === rawId)
      || null;
    const pdvId = String(pdv?._id || rawId || '').trim();
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

  const printerStores = useMemo(() => {
    const active = pointsOfSale.filter((p) => p.active !== false);
    const restricted = String(tabletRestrictedPdvId || '').trim();
    if (restricted) {
      return active.filter((p) => p._id === restricted);
    }
    return active;
  }, [pointsOfSale, tabletRestrictedPdvId]);

  const handlePrinterStoreSelect = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id) return;
      setManagerPdvPickId(id);
      const pdv = pointsOfSale.find((p) => p._id === id);
      if (pdv) {
        setActivePrinterScope({
          pdvId: id,
          pdv,
          terminalId: activeSession?.terminalId,
        });
      }
    },
    [pointsOfSale, activeSession?.terminalId],
  );

  const printerModalScope = useMemo((): TpvPrinterScope | undefined => {
    if (!dataUserId) return undefined;
    const preferredId = String(
      activeSession?.pointOfSaleId || tabletRestrictedPdvId || managerPdvPickId || '',
    ).trim();
    const pdv =
      printerStores.find((p) => p._id === preferredId)
      || printerStores[0]
      || pointsOfSale.find((p) => p._id === preferredId)
      || null;
    if (!pdv) {
      return {
        userId: dataUserId,
        pdvId: preferredId,
        availableStores: printerStores,
        onStoreSelect: handlePrinterStoreSelect,
      };
    }
    const terminalId = activeSession?.terminalId;
    const terminal = terminalId ? pdv.terminals.find((t) => t.id === terminalId) : undefined;
    return {
      userId: dataUserId,
      pdvId: pdv._id,
      pdv,
      terminalId,
      storeLabel: pointOfSaleDisplayLabel(pdv),
      terminalLabel: terminal ? (terminal.code || terminal.name) : undefined,
      availableStores: printerStores,
      onStoreSelect: handlePrinterStoreSelect,
      onPdvUpdated: (updated) => {
        setPointsOfSale((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      },
    };
  }, [
    dataUserId,
    activeSession?.pointOfSaleId,
    activeSession?.terminalId,
    tabletRestrictedPdvId,
    managerPdvPickId,
    pointsOfSale,
    printerStores,
    handlePrinterStoreSelect,
  ]);

  useEffect(() => {
    const pdv = printerModalScope?.pdv;
    if (!pdv) return;
    setActivePrinterScope({
      pdvId: pdv._id,
      terminalId: printerModalScope?.terminalId,
      pdv,
    });
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
      setClockedInWorkersLoading(false);
      return;
    }
    const { pdvId, workCenterId } = activeStoreScope;
    if (!pdvId) {
      setClockedInWorkers([]);
      setClockedInWorkersLoading(false);
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
      const openerId = normalizeClockinUserId(activeSession?.workerId);
      const selfId = normalizeClockinUserId(user?.user_id || user?.id);
      const idsToCheck = [
        ...workers.map((w) => w.id),
        ...(openerId ? [openerId] : []),
        ...(selfId ? [selfId] : []),
      ];
      let blockedIds: string[] = [];
      try {
        const blocks = await fetchMembersWorkBlocks(businessId, idsToCheck);
        blockedIds = Object.entries(blocks || {})
          .filter(([, info]) => info?.blocked)
          .map(([id]) => id);
      } catch {
        blockedIds = [];
      }
      setVacationBlockedIds(blockedIds);
      const blockedSet = new Set(blockedIds.map((id) => normalizeClockinUserId(id)).filter(Boolean));
      const filteredWorkers = workers.filter((w) => !blockedSet.has(normalizeClockinUserId(w.id)));
      const sessionForStaff =
        openerId && blockedSet.has(openerId)
          ? { workerId: '', workerName: '' }
          : activeSession;
      setClockedInWorkers(filteredWorkers);
      setSelectedOrderTakerId((prev) => {
        const staff = buildTpvActiveStaff(sessionForStaff, filteredWorkers);
        const prevNorm = normalizeClockinUserId(prev);
        if (prevNorm && staff.some((w) => clockinIdsMatch(w.id, prevNorm))) return prevNorm;
        return pickDefaultOrderTakerForSession(sessionForStaff, filteredWorkers);
      });
    } catch {
      if (!silent && clockedInWorkersRef.current.length === 0) setClockedInWorkers([]);
    } finally {
      if (!silent) setClockedInWorkersLoading(false);
    }
  }, [
    businessId,
    scopeBusiness?.owner_user_id,
    currentBusiness?.owner_user_id,
    activeStoreScope.pdvId,
    activeStoreScope.workCenterId,
    activeSession?._id,
    activeSession?.openedAt,
    activeSession?.workerId,
    activeSession?.workerName,
    user?.user_id,
    user?.id,
  ]);

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
      setClockedInWorkersLoading(false);
      return;
    }
    const hasWorkers = clockedInWorkersRef.current.length > 0;
    // Solo forzar spinner de fichaje en la primera carga; refrescos silenciosos no parpadean.
    if (!hasWorkers) setClockedInWorkersLoading(true);
    void refreshClockedInWorkers({ silent: hasWorkers });
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
      if (sessionsRef.current.some((s) => isTpvRegisterSessionOpen(s)) || orderFlowActiveRef.current) {
        return;
      }
      hasDisplayedStoresRef.current = false;
      setPointsOfSale([]);
      setWorkCenters([]);
      setLoading(false);
      return;
    }

    if (scopeChanged) {
      loadInflightRef.current = null;
      // No resetear tiendas si ya hay caja abierta: evita spinner/OpeningScreen a mitad de pedido.
      const hasOpen = sessionsRef.current.some((s) => isTpvRegisterSessionOpen(s));
      if (!isTabletSession && !hasOpen) {
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
      } else if (scopeChanged && !sessionsRef.current.some((s) => isTpvRegisterSessionOpen(s))) {
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
      } else if (
        scopeChanged
        && !orderFlowActiveRef.current
        && !sessionsRef.current.some((s) => isTpvRegisterSessionOpen(s))
      ) {
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
                    // Restaurante/bar: asegurar PDV + terminal al abrir TPV (sin esto la caja no abre).
                    tpvBootstrap: isRestaurant,
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
          setSessions((prev) =>
            mergeTpvRegisterSessionsPreservingOpen(
              prev,
              sessData.filter((s) => {
                const pid = String(s.pointOfSaleId || '').trim();
                return !pid || tpvSessionMatchesStoreRef(s, tabletPdvId, pointsOfSaleRef.current);
              }),
            ),
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
          setSessions((prev) =>
            mergeTpvRegisterSessionsPreservingOpen(
              prev,
              sessData.filter((s) => shouldKeepTpvSessionInList(s, scopedPdvs, bidAtStart)),
            ),
          );
        }
      } catch {
        if (
          seq === loadSeqRef.current
          && !hasDisplayedStoresRef.current
          && !sessionsRef.current.some((s) => isTpvRegisterSessionOpen(s))
        ) {
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

  // No mostrar Abrir caja hasta confirmar que no hay sesión open (o timeout corto).
  // Si sticky sigue abierta (pick/PDV parpadeando), no forzar «Recuperando caja…».
  useEffect(() => {
    if (isTpvRegisterSessionOpen(activeSession)) {
      setOpeningRecoverHold(false);
      return;
    }
    if (isTpvRegisterSessionOpen(stickyOpenSessionRef.current)) {
      setOpeningRecoverHold(false);
      return;
    }
    if (loading) {
      setOpeningRecoverHold(true);
      return;
    }
    setOpeningRecoverHold(true);
    const timer = window.setTimeout(() => setOpeningRecoverHold(false), 450);
    return () => window.clearTimeout(timer);
  }, [loading, activeSession?._id, activeSession?.status]);

  const handleOpen = async (data: OpeningData) => {
    if (!dataUserId) return;
    if (openingInFlightRef.current) return;
    openingInFlightRef.current = true;
    try {
    const pdvId = String(data.pointOfSaleId || '').trim();

    const attachExistingOpen = (existing: TpvRegisterSession) => {
      const storeId = String(data.pointOfSaleId || existing.pointOfSaleId || '').trim();
      if (!isWorkerUser && storeId) {
        const bid = resolveBusinessScopeId(currentBusiness);
        if (bid && dataUserId) {
          writeDeliveryOpsSelectedPdvId(bid, dataUserId, storeId);
        }
        setManagerPdvPickId(storeId);
        skipManagerAutoPdvRef.current = false;
      }
      setSessions((prev) => {
        const exists = prev.some((s) => s._id === existing._id);
        if (exists) {
          return prev.map((s) => (s._id === existing._id ? existing : s));
        }
        return [existing, ...prev];
      });
      setPostCloseSession(null);
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: existing }));
      // Un solo aviso (id fijo = sonner no apila cientos).
      toast.info('Entrando en la caja ya abierta', { id: 'tpv-continue-register', duration: 2500 });
    };

    const localOpen = pickNewestOpenRegisterSessionForStore(sessions, pdvId, pointsOfSale);
    // Salir del TPV no cierra: si hay caja abierta en esta tienda, siempre reenganchar.
    if (localOpen) {
      attachExistingOpen(localOpen);
      return;
    }
    const openerId = normalizeClockinUserId(data.workerId);
    const bidForVacation = resolveBusinessScopeId(currentBusiness);
    if (bidForVacation && openerId) {
      try {
        const block = await fetchMemberWorkBlock(bidForVacation, openerId);
        if (block.blocked) {
          toast.error(block.message || 'No puedes abrir el TPV: estás de vacaciones o de baja.');
          return;
        }
      } catch {
        // Si falla la comprobación, el servidor vuelve a validar al crear la sesión.
      }
    }
    const total = calcDenominationTotal(data.counts);
    try {
      const writeBusinessId = resolveRetailOpsWriteBusinessId(
        scopeBusinessId || resolveBusinessScopeId(currentBusiness) || '',
        businesses,
      );
      const created = await createTpvRegisterSessionRequest(dataUserId, {
        business_id: writeBusinessId || scopeBusinessId || resolveBusinessScopeId(currentBusiness) || '',
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
          // La caja ya abrió; sin fichaje el TPV se bloquea — abrir modal y avisar.
          toast.warning('Caja abierta. Ficha al equipo para poder vender.', {
            id: 'tpv-clockin-needed',
            duration: 7000,
          });
          setShowClockIn(true);
        }
      } else if (isTpvRegisterSessionOpen(created)) {
        toast.warning('Caja abierta. Ficha al equipo para poder vender.', {
          id: 'tpv-clockin-needed',
          duration: 7000,
        });
        setShowClockIn(true);
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
      const conflictExisting =
        (err instanceof TpvRegisterSessionConflictError && err.existingSession)
        || (
          err
          && typeof err === 'object'
          && (err as { name?: string }).name === 'TpvRegisterSessionConflictError'
          && (err as TpvRegisterSessionConflictError).existingSession
        )
        || null;
      if (conflictExisting) {
        // Ya hay caja abierta → entrar en esa (nunca abrir otra hasta cerrar).
        attachExistingOpen(conflictExisting);
        return;
      }
      const msg = extractErrorMessage(err);
      if (/ya hay una caja abierta/i.test(msg)) {
        // Sin existingSession en payload: no spamear toast; el usuario puede reintentar.
        toast.info('Ya hay una caja abierta en esta tienda', { id: 'tpv-continue-register', duration: 2500 });
        return;
      }
      toast.error(toUserFacingMessage(err, 'No se pudo abrir la caja'));
    }
    } finally {
      openingInFlightRef.current = false;
    }
  };

  const handleClose = async (
    counts: CashDenominationCount,
    notes: string,
    aggregatorRows: AggregatorCashRow[] = [],
    productClosingCounts?: TpvRegisterSession['productClosingCounts'],
  ) => {
    const snapshotId = String(closingSession?._id || activeSession?._id || '').trim();
    const live = snapshotId
      ? sessions.find((s) => String(s._id || '').trim() === snapshotId)
      : null;
    const session =
      (isTpvRegisterSessionOpen(live) ? live : null)
      || (isTpvRegisterSessionOpen(closingSession) ? closingSession : null)
      || (isTpvRegisterSessionOpen(activeSession) ? activeSession : null);
    if (!dataUserId || !isTpvRegisterSessionOpen(session)) {
      toast.info('Abre la caja antes de cerrarla');
      setShowClosing(false);
      setClosingSession(null);
      return;
    }
    if (closingBusy) return;
    setClosingBusy(true);
    const finalAmount = calcDenominationTotal(counts);
    const expectedTpv = calcTpvExpectedCash(session);
    const summary = buildTpvRegisterSummary(session);
    const aggregatorClosingTotals: Record<string, number> = {};
    const aggregatorClosingCash: Record<string, number> = {};
    const aggregatorClosingCard: Record<string, number> = {};
    let aggregatorCashSum = 0;
    for (const row of aggregatorRows) {
      aggregatorClosingTotals[row.platform.channel] = row.totalSales;
      const cash = Math.max(0, Number(row.cashSales) || 0);
      const card = Math.max(0, Number(row.cardSales) || 0);
      aggregatorClosingCash[row.platform.channel] = cash;
      aggregatorClosingCard[row.platform.channel] = card;
      aggregatorCashSum += cash;
      summary.salesByChannel[row.platform.channel] = row.totalSales;
    }
    aggregatorCashSum = Math.round(aggregatorCashSum * 100) / 100;
    const expected = Math.round((expectedTpv + aggregatorCashSum) * 100) / 100;
    const diff = finalAmount - expected;
    const saleOps = session.transactions.filter((t) => t.type === 'sale').length;
    const autoValidated = saleOps === 0 && Math.abs(diff) < 0.01 && aggregatorCashSum === 0;
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
      aggregatorClosingCash,
      aggregatorClosingCard,
      ...(productClosingCounts ? { productClosingCounts } : {}),
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
      stickyOpenSessionRef.current = null;
      clearClosingFormDraft(String(updated._id || session._id || ''));
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: updated }));
      setShowClosing(false);
      setClosingSession(null);
      setPostCloseSession(updated);
      setPostCloseAggregatorRows(aggregatorRows);
      toast.success(
        autoValidated
          ? `Caja cerrada (sin ventas, validada automáticamente). Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`
          : `Caja cerrada. Pendiente de validación gerente. Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
      );
      // El Excel Uriel no se descarga al cerrar: queda guardado en el servidor;
      // el CEO lo baja a mano desde Caja → Excel.
      if (!autoValidated) {
        void createNotification({
        level: Math.abs(diff) >= 20 ? 'warning' : 'info',
        category: 'tpv',
        title: 'Cierre de caja pendiente de validación',
        message: `${session.workerName} cerró ${session.pointOfSaleName || 'caja'} (${session.terminalName || 'TPV'}). Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
        entityId: updated._id,
        entityType: 'tpv_register_session',
        route: '/saas/vertical/delivery/caja',
        metadata: { difference: diff, pointOfSaleId: session.pointOfSaleId },
        }).catch(() => null);
      }
    } catch (error) {
      toast.error(toUserFacingMessage(error, 'Error al cerrar la caja. Inténtalo de nuevo.'));
    } finally {
      setClosingBusy(false);
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
              setSessions((prev) =>
                mergeTpvRegisterSessionsPreservingOpen(
                  prev,
                  refreshed.filter((s) =>
                    shouldKeepTpvSessionInList(s, pointsOfSale, scopeBusinessIdRef.current),
                  ),
                ),
              );
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

  const removeCashMovement = useCallback(async (txId: string) => {
    const run = async () => {
      const uid = dataUserIdRef.current;
      const sessionId = activeSessionIdRef.current;
      const id = String(txId || '').trim();
      if (!uid || !sessionId || !id) return;

      for (let attempt = 0; attempt < 5; attempt++) {
        const current = sessionsRef.current.find((s) => s._id === sessionId);
        if (!current || !isTpvRegisterSessionOpen(current)) return;
        const target = (current.transactions || []).find((t) => t.id === id);
        if (!target || !isTpvCashMovementTx(target.type)) {
          toast.error('Solo se pueden eliminar entradas, salidas o devoluciones');
          return;
        }
        const updatedTxs = (current.transactions || []).filter((t) => t.id !== id);
        const patch = applySessionTransactions(current, updatedTxs);
        const nextSession: TpvRegisterSession = {
          ...current,
          ...patch,
          summary: buildTpvRegisterSummary({ ...current, ...patch }),
          removedTransactionIds: [id],
        };

        if (!isBrowserOnline()) {
          enqueueTpvOfflineItem('register_tx', { userId: uid, session: nextSession, removedTransactionId: id });
          setSessions((prev) => prev.map((s) => (s._id === sessionId ? { ...nextSession, removedTransactionIds: undefined } : s)));
          const label = TPV_CASH_TX_LABELS[target.type] || 'Movimiento';
          toast.info(`${label} eliminado en cola local. Efectivo esperado: ${calcTpvExpectedCash(nextSession).toFixed(2)}€`);
          return;
        }

        try {
          const updated = await updateTpvRegisterSessionRequest(uid, nextSession);
          setSessions((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
          const label = TPV_CASH_TX_LABELS[target.type] || 'Movimiento';
          toast.success(
            `${label} de ${Number(target.amount || 0).toFixed(2)}€ eliminada. Efectivo esperado: ${calcTpvExpectedCash(updated).toFixed(2)}€`,
          );
          return;
        } catch {
          if (attempt < 4) {
            try {
              const refreshed = await listTpvRegisterSessionsRequest(uid, {
                businessId: scopeBusinessIdRef.current || undefined,
              });
              setSessions((prev) =>
                mergeTpvRegisterSessionsPreservingOpen(
                  prev,
                  refreshed.filter((s) =>
                    shouldKeepTpvSessionInList(s, pointsOfSale, scopeBusinessIdRef.current),
                  ),
                ),
              );
            } catch {
              /* reintento */
            }
            continue;
          }
          toast.error('No se pudo eliminar el movimiento de caja');
        }
      }
    };

    txQueueRef.current = txQueueRef.current.then(run, run);
    await txQueueRef.current;
  }, [applySessionTransactions, pointsOfSale]);

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

  const activeStaff = useMemo(() => {
    const blockedSet = new Set(
      vacationBlockedIds.map((id) => normalizeClockinUserId(id)).filter(Boolean),
    );
    const openerId = normalizeClockinUserId(activeSession?.workerId);
    const sessionForStaff =
      openerId && blockedSet.has(openerId)
        ? { workerId: '', workerName: '' }
        : activeSession;
    return buildTpvActiveStaff(sessionForStaff, clockedInWorkers).filter(
      (w) => !blockedSet.has(normalizeClockinUserId(w.id)),
    );
  }, [activeSession, clockedInWorkers, vacationBlockedIds]);

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
      vacationBlockedIds,
    }),
    [clockedInWorkersLoading, activeStaff, selectedOrderTakerId, currentUserId, isWorkerUser, vacationBlockedIds],
  );

  const isRestaurantVertical = isRestaurantBusinessType(
    scopeBusiness?.businessType || currentBusiness?.businessType,
  );
  const restaurantTpvPermissions = useMemo(() => resolveRestaurantTpvPermissions(user), [user]);
  /** Home operativo bar/restaurante = Sala (no Caja). */
  const opsHomePath = isRestaurantVertical ? '/saas/sala' : '/saas/delivery-ops';

  const handleRequestClose = useCallback(async () => {
    if (isRestaurantVertical && !restaurantTpvPermissions.canCloseRegister) {
      toast.error('Solo encargado o gerente puede cerrar la caja');
      return;
    }
    const session = activeSession;
    if (!isTpvRegisterSessionOpen(session)) {
      toast.info('No hay una caja abierta para cerrar');
      return;
    }
    setClosingSession(session);
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
  }, [isRestaurantVertical, restaurantTpvPermissions.canCloseRegister, dataUserId, activeSession]);

  const dismissClosing = useCallback(() => {
    if (closingBusy) return;
    setShowClosing(false);
    setClosingSession(null);
    setRestaurantCloseWarnings([]);
  }, [closingBusy]);

  const closingBusyRef = useRef(closingBusy);
  closingBusyRef.current = closingBusy;

  /**
   * Tablet: el gesto/botón Atrás del navegador debe salir al código de tienda.
   * Si no, history.back() cae en /saas con sesión activa y parece que «no deja volver».
   * Mientras el modal de cierre está abierto, manda el trap de abajo.
   */
  useEffect(() => {
    if (!isTabletSession || showClosing) return;
    window.history.pushState({ tpvTabletSession: true }, '');
    const onPopState = () => {
      void leaveTpvTabletSession(logout);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isTabletSession, showClosing, logout]);

  /** Evita que el botón/gesto Atrás de la tablet cierre el modal y salte al dashboard CEO. */
  useEffect(() => {
    if (!showClosing) return;
    window.history.pushState({ tpvClosingModal: true }, '');
    const onPopState = () => {
      // Re-apilar para no abandonar la ruta TPV (evita dashboard CEO).
      window.history.pushState({ tpvClosingModal: true }, '');
      if (closingBusyRef.current) return;
      setShowClosing(false);
      setClosingSession(null);
      setRestaurantCloseWarnings([]);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [showClosing]);

  const leavePostCloseScreen = useCallback(() => {
    setPostCloseSession(null);
    setPostCloseAggregatorRows([]);
    // Tablet / código de tienda: salir del SaaS a la pantalla de código (antes del TPV).
    if (isTabletSession) {
      void leaveTpvTabletSession(logout);
      return;
    }
    // CEO / back office: volver a la operativa (no al TPV).
    navigate(opsHomePath, { replace: true });
  }, [isTabletSession, logout, navigate, opsHomePath]);

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
      {showClosing && closingSession ? (
        <TpvGatePortal>
          <ClosingScreen
            session={closingSession}
            dataUserId={dataUserId}
            onClose={handleClose}
            onCancel={dismissClosing}
            restaurantWarnings={restaurantCloseWarnings}
            busy={closingBusy}
            showDeliveryClosingSlots={!isRestaurantVertical}
          />
        </TpvGatePortal>
      ) : null}
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

  if (
    (loading || openingRecoverHold)
    && !isTpvRegisterSessionOpen(activeSession)
    && !isTpvRegisterSessionOpen(stickyOpenSessionRef.current)
  ) {
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
                  setOpeningRecoverHold(true);
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
              <p className="text-sm text-gray-500">Recuperando caja…</p>
            </>
          )}
        </div>
      </div>,
    );
  }

  if (!activeSession && postCloseSession) {
    const expected = calcTpvExpectedCash(postCloseSession);
    const restaurantSummary = postCloseSession.summary;
    return wrapShell(
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 text-center relative">
            <button
              type="button"
              onClick={leavePostCloseScreen}
              className="absolute right-3 top-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-zinc-700 dark:text-zinc-300" />
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
              <span className={`font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 ${Number(postCloseSession.difference || 0) !== 0 ? 'underline decoration-zinc-400 underline-offset-2' : ''}`}>
                {(postCloseSession.difference || 0) >= 0 ? '+' : ''}{Number(postCloseSession.difference || 0).toFixed(2)}€
              </span>
            </div>
            {isRestaurantVertical ? (
              restaurantSummary ? (
                <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/40 p-3 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Turno TPV sala
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Ventas del turno</span>
                    <span className="font-semibold text-stone-900 dark:text-stone-100">
                      {Number(restaurantSummary.totalSales || 0).toFixed(2)}€
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Efectivo</span>
                    <span className="font-semibold">{Number(restaurantSummary.salesByMethod?.efectivo || 0).toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Tarjeta</span>
                    <span className="font-semibold">{Number(restaurantSummary.salesByMethod?.tarjeta || 0).toFixed(2)}€</span>
                  </div>
                </div>
              ) : null
            ) : (
              <AggregatorCashSummary
                rows={postCloseAggregatorRows.length > 0
                  ? postCloseAggregatorRows
                  : aggregatorRowsFromClosingTotals(
                    getClosingAggregatorPlatforms(),
                    postCloseSession.aggregatorClosingTotals || postCloseSession.summary?.salesByChannel,
                    postCloseSession.aggregatorClosingCash,
                    postCloseSession.aggregatorClosingCard,
                  )}
                title="Cajas agregadores"
              />
            )}
          </div>
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setPostCloseSession(null);
                setPostCloseAggregatorRows([]);
              }}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Abrir otra caja
            </button>
            <button
              onClick={leavePostCloseScreen}
              className="flex-1 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              {isTabletSession ? 'Salir al código' : 'Volver'}
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
        restaurantOpening={isRestaurantVerticalChrome}
        onOpeningPdvChange={handleOpeningPdvChange}
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
      <TpvStatusBarQuickActionsContext.Provider value={statusBarQuickActionsApi}>
      <div className={tpvFrameClass}>
        <RegisterStatusBar
          session={activeSession}
          onRequestClockIn={() => setShowClockIn(true)}
          onRequestClose={() => void handleRequestClose()}
          onRequestCashCount={() => setShowCashCount(true)}
          onRequestIncident={() => setShowIncident(true)}
          onRequestCashOps={() => setShowCashOps(true)}
          onRequestPrinterSetup={() => setShowPrinterSetup(true)}
          showNativePrinter={isNativeApp}
          nativePrinterReady={nativePrinterReady}
          clockedInWorkers={activeStaff}
          clockedInWorkersLoading={clockedInWorkersLoading}
          selectedOrderTakerId={selectedOrderTakerId}
          onSelectOrderTaker={setSelectedOrderTakerId}
          isTabletMode={isTabletSession}
          minimal={compactRegisterChrome}
          quickActions={statusBarQuickActions}
        />
        {!isRestaurantVerticalChrome && (
          <RegisterCashOpsStrip
            session={activeSession}
            compact={compactRegisterChrome}
            onRemove={(txId) => { void removeCashMovement(txId); }}
          />
        )}
        <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col overflow-hidden relative">
          {!clockInGate.allowed && !showClockIn && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/55 backdrop-blur-[2px] p-4">
              {clockInGate.reason === 'loading' ? (
                <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6 text-center space-y-3">
                  <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-violet-600 rounded-full mx-auto" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Comprobando fichajes…</p>
                </div>
              ) : (
                <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mx-auto">
                    <LogIn className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {clockInGate.reason === 'vacation_blocked' ? 'No disponible' : 'Fichaje requerido'}
                    </h2>
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
              )}
            </div>
          )}
          {children}
        </div>
      </div>
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
      {showPrinterSetup && (
        <TpvGatePortal>
          <Suspense
            fallback={(
              <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-200">
                <p className="text-sm font-semibold">Cargando configuración de impresora…</p>
              </div>
            )}
          >
            <TpvPrinterSetupModal
              scope={printerModalScope}
              onClose={() => {
                setShowPrinterSetup(false);
                setPrinterBarTick((t) => t + 1);
              }}
            />
          </Suspense>
        </TpvGatePortal>
      )}
    </TpvStatusBarQuickActionsContext.Provider>
    </TpvRegisterBoardReadyContext.Provider>,
  );
}
