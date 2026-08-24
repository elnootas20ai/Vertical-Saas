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
import { useTpvStockScope } from '../../hooks/useTpvStockScope';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { writeBillingSelection } from '../../lib/billingSelection';
import { formatAddonPriceShort } from '../../lib/planAddonCatalog';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import {
  listTpvRegisterSessionsRequest,
  fetchTpvStoreOpeningHintRequest,
  createTpvRegisterSessionRequest,
  reopenTpvRegisterSessionRequest,
  TpvRegisterSessionConflictError,
  updateTpvRegisterSessionRequest,
  pointOfSaleDisplayLabel,
  buildDeliverySidebarStoreRows,
  ensureDeliveryPdvForWorkCenter,
  ensureTabletCodesForPointsOfSale,
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
import { formatMoneyEs, formatDecimalEs } from '../../lib/formatNumberEs';
import { consumeSalaTpvLaunch } from '../../lib/salaTpvLaunch';
import { RegisterShiftSalesBreakdown } from './RegisterShiftSalesBreakdown';
import {
  mergeTpvRegisterSessionsPreservingOpen,
  pickNewestOpenRegisterSessionForStore,
  filterSessionsForTabletStore,
  resolveActiveTpvRegisterSession,
  findLastClosedTpvSession,
  isTpvRegisterSessionStaleOpen,
  resolvePreviousCloseCashAmount,
  previousCloseCashIsNextDayInitial,
  resolveTpvStoreAlternateRefs,
  shouldKeepTpvSessionInClientList,
  tpvSessionBelongsToBusiness,
  tpvSessionMatchesStoreRef,
  writeTpvOpenRegisterLatch,
  clearTpvRegisterLocalSessionState,
  remoteClosedSessionAffectsStore,
  isTpvRegisterSessionClosed,
} from '../../lib/tpvCajaScope';
import { fetchShiftOrdersForSession, prefetchShiftOrdersForSession } from '../../lib/registerShiftOrders';
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
import { AggregatorClosingEditor, type AggregatorClosingSnapshot, type ManualLinesByChannel } from './AggregatorClosingEditor';
import { DeliveryFoodUnitIcon, DeliveryFoodUnitLabel } from './delivery/DeliveryFoodUnitIcon';
import { AggregatorCashSummary } from './AggregatorCashSummary';
import { sessionToCajaAmounts } from '../../lib/cajaFacturacionExcelExport';
import { closingBrandTpvTotalsFromBillingRows } from '../../lib/cajaExcelBrandTpvEnrich';
import { ShiftBrandBillingSummary } from './ShiftBrandBillingSummary';
import {
  buildShiftAppsBrandTotals,
  buildShiftBrandRevenue,
  rollupBrandRevenueToClosingSlots,
  scaleAppsBrandTotalsToAppTotal,
} from '../../lib/registerShiftBrandBilling';
import { listBrandsRequest, type Brand } from '../../lib/brandApi';
import {
  buildBrandLabelsMap,
  brandIdAliases,
  displayBrandName,
  looksLikeBrandTechnicalId,
} from '../../lib/brandLabels';

import { getBrandBillingConfigRequest } from '../../lib/brandBillingApi';
import {
  brandsForBilling,
  closingSlotsFromBillingSheets,
  resolveBillingSheetsForClosing,
  suggestBillingSheetsFromBrands,
  splitRulesFromBillingConfig,
  type BrandBillingSplitRules,
  type ClosingBillingBrandSlot,
} from '../../lib/brandBillingConfig';
import { isDefaultBrandNamePlaceholder, isDefaultCommercialBrand } from '../../lib/brandUtils';
import {
  filterStoresForWorkerAssignment,
  isInvitedWorkerUser,
} from '../../lib/pdvScope';
import { resolveEffectiveSalesPointRef } from '../../lib/workerStoreAssignment';
import { resolvePreferenceToPdvId, pickDefaultActivePdvId } from '../../lib/deliveryOpsPdvSelection';
import {
  readOpsSelectedPdvId,
  writeOpsSelectedPdvId,
  notifyOpsActiveStoreChanged,
} from '../../lib/opsPdvPreference';
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
  readTabletCajaOpeningHint,
  writeTabletCajaOpeningHint,
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
import { useTpvOrderFlowActive, useTpvSuppressBottomBar } from '../../context/TpvChromeContext';
import { TpvCashOpsModal } from './TpvCashOpsModal';
import { TpvCashMovementVoidModal } from './TpvCashMovementVoidModal';
import { CajaCashMovementsList } from './caja/CajaCashMovementsList';
import { RegisterClosingDetailPanel } from './RegisterClosingDetailPanel';
import type { TpvPrinterScope } from './TpvPrinterSetupPanel';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import { readNativePrinterDiagnosticsSync, readPrinterVerifiedHost } from '../../lib/vertialPrint/nativePrinterDiagnostics';
import { setActivePrinterScope } from '../../lib/vertialPrint/printerActiveScope';

const TpvPrinterSetupModal = lazy(() =>
  import('./TpvPrinterSetupModal').then((m) => ({ default: m.TpvPrinterSetupModal })),
);
const SaasOcrScanModal = lazy(() =>
  import('../design-system/SAAS__OcrScanModal').then((m) => ({ default: m.SAAS__OcrScanModal })),
);
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../lib/tpvTabletOffline';
import { sessionHasIdenticalSaleForOrder, isAllowMultipleSaleTx } from '../../lib/tpvLocalCajaSale';
import { requestTpvStockReviewOpen } from '../../lib/tpvStockReview';
import {
  requestTpvStoreTransfersOpen,
  emitStoreTransferSync,
  playStoreTransferSound,
  unlockStoreTransferAudio,
  isStoreTransferSoundEnabled,
  type StoreTransferLiveEvent,
} from '../../lib/tpvStoreTransfers';
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
import { requestClockinGeo } from '../../hooks/useGeolocation';
import type { WorkCenter } from '../../lib/workCentersApi';
import { listUsersRequest, type AuthUser } from '../../lib/authApi';
import { getBusinessRequest } from '../../lib/businessApi';
import {
  Lock, Unlock, Banknote, CreditCard, Phone as PhoneIcon, Wifi, WifiOff, User, Monitor,
  Printer, Smartphone, CheckCircle2, X, AlertTriangle, Calculator, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, Clock, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3,
  MapPin, Store, Plus, LogIn, UserCheck, Loader2, RefreshCw, Coffee, Square,
  MoreVertical, Save, RotateCcw, Eye, ClipboardCheck, ArrowRightLeft, ScanLine,
} from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_BTN_DANGER,
  VERTIAL_CASH_BG,
  VERTIAL_CASH_BORDER,
  VERTIAL_CASH_TEXT,
  VERTIAL_CARD_BG,
  VERTIAL_CARD_BORDER,
  VERTIAL_CARD_TEXT,
} from '../../lib/vertialUiTokens';
import { VertialLogo } from '../VertialLogo';

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

/** Slots P/B/T sin editar de verdad: vacíos o todo a 0 (borrador auto-guardado antes de cargar pedidos). */
function foodSlotsAreUntouched(food: { pizza?: string; burger?: string; taco?: string } | null | undefined): boolean {
  if (!food) return true;
  const vals = [food.pizza, food.burger, food.taco].map((v) => String(v ?? '').trim());
  return vals.every((v) => !v || v === '0');
}

/** Solo cuenta como borrador de unidades si el usuario dejó algún total > 0. */
function draftHasUserFoodCounts(food: { pizza?: string; burger?: string; taco?: string } | null | undefined): boolean {
  if (!food) return false;
  const pizza = Math.max(0, Math.floor(Number(String(food.pizza || '').trim()) || 0));
  const burger = Math.max(0, Math.floor(Number(String(food.burger || '').trim()) || 0));
  const taco = Math.max(0, Math.floor(Number(String(food.taco || '').trim()) || 0));
  return pizza + burger + taco > 0;
}

function foodSlotsFromSystemCounts(counts: FoodFamilyCounts): { pizza: string; burger: string; taco: string } {
  return {
    pizza: String(Math.max(0, Math.floor(counts.pizza || 0))),
    burger: String(Math.max(0, Math.floor(counts.burger || 0))),
    taco: String(Math.max(0, Math.floor(counts.taco || 0))),
  };
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

/** Listado ligero para el gate TPV: abiertas + cierres recientes (reabrir hoy/ayer). */
function tpvGateSessionsQueryOpts(businessId?: string): {
  businessId?: string;
  lite: boolean;
  dateFrom: string;
} {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  from.setUTCHours(0, 0, 0, 0);
  const bid = String(businessId || '').trim();
  return {
    ...(bid ? { businessId: bid } : {}),
    lite: true,
    dateFrom: from.toISOString(),
  };
}

function shouldKeepTpvSessionInList(
  session: TpvRegisterSession,
  scopedPdvs: PointOfSale[],
  businessId?: string,
): boolean {
  return shouldKeepTpvSessionInClientList(session, scopedPdvs, businessId);
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
  /** Sección del menú lateral donde se coloca (por defecto «Pedidos»). */
  section?: 'pedidos' | 'equipo';
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

/**
 * Entrada canónica a caja del TPV Delivery (CEO web, tablet por código, trabajador).
 * Misma UI: Fichaje | Quién abre | efectivo / fondo | Abrir caja.
 * Si ya hay caja abierta en ESA tienda → Continuar (misma familia de pantalla).
 */
function OpeningScreen({ onOpen, onContinueExistingOpen, loading: parentLoading, openingBusy = false, pointsOfSale, workCenters, workerOptions, registerSessions, restrictedToPdvId, onClearStorePick, isManagerView = false, tabletStoreLabel, tabletWorkCenterId = null, knownOpenSession = null, onOpeningPdvChange, restaurantOpening = false, clockInBusinessId = '', clockInOwnerUserId = '', onClockInChanged, resumeAfterClose = null }: {
  onOpen: (data: OpeningData) => void;
  /** Entrar en una caja ya abierta (aviso proactivo; no al martillar Abrir). */
  onContinueExistingOpen?: (session: TpvRegisterSession) => void;
  loading: boolean;
  /** Crear sesión en curso: desactiva Abrir y muestra feedback. */
  openingBusy?: boolean;
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
  tabletStoreLabel?: string;
  /** workCenterId del binding tablet (matcheo caja antes de hidratar PDV). */
  tabletWorkCenterId?: string | null;
  /** Caja abierta ya resuelta en el gate (tablet / Continuar). */
  knownOpenSession?: TpvRegisterSession | null;
  /** Sincroniza la tienda elegida en apertura para fichaje antes de abrir caja. */
  onOpeningPdvChange?: (pdvId: string) => void;
  /** Bar/restaurante: tienda fijada arriba, sin auto-scroll al bloque terminal. */
  restaurantOpening?: boolean;
  /** Contexto para panel de fichaje embebido en apertura. */
  clockInBusinessId?: string;
  clockInOwnerUserId?: string;
  onClockInChanged?: () => void;
  /** Tras «Abrir otra caja»: preseleccionar trabajador si se puede. */
  resumeAfterClose?: { workerId?: string } | null;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const [selectedPdvId, setSelectedPdvId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [counts, setCounts] = useState<CashDenominationCount>(() => emptyCashDenominationCount());
  const resumeWorkerId = String(resumeAfterClose?.workerId || '').trim();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => {
    if (resumeWorkerId) {
      const match = workerOptions.find((w) => clockinIdsMatch(w.id, resumeWorkerId));
      if (match) return match.id;
    }
    return workerOptions.length === 1 ? workerOptions[0].id : '';
  });
  const [vacationBlockedById, setVacationBlockedById] = useState<Record<string, string>>({});
  /** Popup al pulsar Abrir caja: confirmar arqueo o avisar al CEO. */
  const [openCashConfirm, setOpenCashConfirm] = useState<'ask' | 'ceo-alert' | null>(null);
  const salaLaunchRef = useRef<string | null>(consumeSalaTpvLaunch());
  const lastRestrictedPdvRef = useRef('');
  const onOpeningPdvChangeRef = useRef(onOpeningPdvChange);
  onOpeningPdvChangeRef.current = onOpeningPdvChange;
  const total = calcDenominationTotal(counts);
  useModalClose(Boolean(openCashConfirm), () => setOpenCashConfirm(null));
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
  // PDV operativo: listado real, o stub si el pick (Badalona/tablet) aún no hidrató —
  // misma OpeningScreen siempre; no otra UI vacía.
  const selectedPdv = useMemo(() => {
    const fromList =
      pointsOfSale.find((p) => p._id === selectedPdvId)
      || (restrictedToPdvId
        ? pointsOfSale.find((p) => p._id === restrictedToPdvId)
        : undefined);
    if (fromList) return fromList;
    const stubId = String(restrictedToPdvId || selectedPdvId || '').trim();
    if (!stubId) return undefined;
    const label = String(tabletStoreLabel || '').trim() || 'Tienda';
    return {
      _id: stubId,
      id: stubId,
      type: 'point_of_sale' as const,
      user_id: '',
      workCenterId: stubId,
      name: label,
      code: '',
      address: '',
      terminals: [
        {
          id: `tpv-${stubId}`,
          name: 'TPV-1',
          code: 'TPV-1',
          active: true,
        },
      ],
      active: true,
      createdAt: '',
      updatedAt: '',
    } as PointOfSale;
  }, [pointsOfSale, selectedPdvId, restrictedToPdvId, tabletStoreLabel]);
  // Misma regla que sala/ensurePdvHasDefaultTerminal: active undefined = activo.
  const availableTerminals = selectedPdv?.terminals.filter((t) => t.active !== false) || [];
  const selectedTerminal = availableTerminals.find(t => t.id === selectedTerminalId);

  const previousCloseHint = useMemo(() => {
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const tabletBound = Boolean(readTpvTabletBinding());
    const terminalId = selectedTerminal?.id || (tabletBound ? `tablet-${pdvId || 'default'}` : '');
    const alternateRefs = resolveTpvStoreAlternateRefs({
      pickId: pdvId,
      pointsOfSale,
      tabletWorkCenterId: tabletWorkCenterId || readTpvTabletBinding()?.workCenterId,
    });
    const last = findLastClosedTpvSession(
      registerSessions,
      pdvId,
      terminalId,
      pointsOfSale,
      alternateRefs,
    );
    if (!last) {
      const cached = readTabletCajaOpeningHint(pdvId || restrictedToPdvId || undefined);
      if (cached?.lastClosed) {
        const fromCache = findLastClosedTpvSession(
          [cached.lastClosed],
          pdvId,
          terminalId,
          pointsOfSale,
          alternateRefs,
        );
        if (fromCache) {
          let amount = resolvePreviousCloseCashAmount(fromCache);
          if (amount == null && cached.suggestedFondo != null) {
            amount = cached.suggestedFondo;
          }
          if (amount != null) {
            let label = '';
            if (fromCache.closedAt) {
              try {
                label = new Date(fromCache.closedAt).toLocaleDateString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
              } catch {
                label = '';
              }
            }
            return {
              amount,
              isNextDayInitial: previousCloseCashIsNextDayInitial(fromCache),
              label,
            };
          }
        }
        if (cached.suggestedFondo != null && Number.isFinite(cached.suggestedFondo)) {
          return {
            amount: cached.suggestedFondo,
            isNextDayInitial: true,
            label: cached.lastClosed?.closedAt
              ? new Date(cached.lastClosed.closedAt).toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })
              : '',
          };
        }
      }
      return null as null | { amount: number; isNextDayInitial: boolean; label: string };
    }
    let amount = resolvePreviousCloseCashAmount(last);
    if (amount == null) {
      const fromCount = calcDenominationTotal(last.closingCashCount || {});
      amount = Number.isFinite(fromCount) && fromCount >= 0 ? fromCount : null;
    }
    if (amount == null) return null;
    let label = '';
    if (last.closedAt) {
      try {
        label = new Date(last.closedAt).toLocaleDateString('es-ES', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
      } catch {
        label = '';
      }
    }
    return {
      amount,
      isNextDayInitial: previousCloseCashIsNextDayInitial(last),
      label,
    };
  }, [registerSessions, selectedPdv, restrictedToPdvId, selectedTerminal, pointsOfSale]);

  const previousCloseCash = previousCloseHint?.amount ?? null;
  const previousCloseLabel = previousCloseHint?.label || '';
  /** Misma UX en todas las tiendas: importe de apertura (fondo / último cierre / 0), sin teclado de billetes. */
  const openingCashAmount =
    previousCloseCash != null && Number.isFinite(previousCloseCash) && previousCloseCash >= 0
      ? previousCloseCash
      : 0;

  /** Caja abierta en esta tienda (incluye antiguas >18 h). Nunca cruzar con otra tienda. */
  const openSessionForStore = useMemo(() => {
    if (knownOpenSession && isTpvRegisterSessionOpen(knownOpenSession)) {
      return knownOpenSession;
    }
    const pdvId = String(selectedPdv?._id || restrictedToPdvId || '').trim();
    if (!pdvId) return null;
    const opens = (registerSessions || []).filter((s) => isTpvRegisterSessionOpen(s));
    const alternateRefs = resolveTpvStoreAlternateRefs({
      pickId: pdvId,
      pointsOfSale,
      tabletWorkCenterId: tabletWorkCenterId || readTpvTabletBinding()?.workCenterId,
    });
    return pickNewestOpenRegisterSessionForStore(opens, pdvId, pointsOfSale, alternateRefs);
  }, [knownOpenSession, registerSessions, selectedPdv, restrictedToPdvId, pointsOfSale, tabletWorkCenterId]);

  /** Turno vivo reciente: pantalla «Continuar» (sin pedir fondo otra vez). */
  const existingOpenForStore = useMemo(() => {
    if (!openSessionForStore || isTpvRegisterSessionStaleOpen(openSessionForStore)) return null;
    return openSessionForStore;
  }, [openSessionForStore]);

  /** Turno antiguo (>18 h): aviso + Continuar, pero se puede abrir otra si el servidor cierra la vieja. */
  const staleOpenForStore = useMemo(() => {
    if (!openSessionForStore || !isTpvRegisterSessionStaleOpen(openSessionForStore)) return null;
    return openSessionForStore;
  }, [openSessionForStore]);

  useEffect(() => {
    setCounts(buildDenominationFromAmount(openingCashAmount));
  }, [openingCashAmount, selectedPdvId, selectedTerminalId]);

  // Tras «Abrir otra»: si el trabajador llega tarde al listado, engancharlo.
  useEffect(() => {
    if (!resumeWorkerId || selectedWorkerId) return;
    const match = workerOptions.find((w) => clockinIdsMatch(w.id, resumeWorkerId));
    if (match) setSelectedWorkerId(match.id);
  }, [resumeWorkerId, workerOptions, selectedWorkerId]);

  const openActionBusy = openingBusy;
  const tabletBoundOpening = Boolean(readTpvTabletBinding());
  const effectiveTerminalName = selectedTerminal
    ? (selectedTerminal.code || selectedTerminal.name)
    : (tabletBoundOpening ? 'Tablet' : 'Terminal principal');
  const effectiveDatafon = selectedTerminal?.datafonName || '';
  const effectivePrinter = selectedTerminal?.printerName || '';

  const effectiveWorkerName = useCallback(() => {
    const sid = String(selectedWorkerId || '').trim();
    if (!sid) return '';
    const w = workerOptions.find((x) => clockinIdsMatch(x.id, sid));
    return (w?.name || '').trim();
  }, [workerOptions, selectedWorkerId]);

  const hasWorkers = workerOptions.length > 0;
  const hasResolvedPdv = Boolean(selectedPdv) || Boolean(restrictedToPdvId);
  // Tablet, bar/restaurante y CEO web (delivery): sin terminal activo se usa uno sintético al abrir.
  // ActiveStoreScope no asegura terminales; sin esto el CEO delivery queda semanas sin poder abrir caja.
  const allowSyntheticTerminal = tabletBoundOpening || restaurantOpening || isManagerView;
  const selectedWorkerVacationMsg = selectedWorkerId
    ? vacationBlockedById[selectedWorkerId] || vacationBlockedById[String(selectedWorkerId).trim()]
    : '';
  // Abrir NUNCA exige fondo dejado: si no se detecta, se abre con el conteo (0 € vale).
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
    if (workerOptions.length === 0) return;
    if (selectedWorkerId) {
      // Si el id está normalizado (sin account:) y la opción sí lo tiene, reenganchar.
      const exact = workerOptions.some((w) => w.id === selectedWorkerId);
      if (exact) return;
      const fuzzy = workerOptions.find((w) => clockinIdsMatch(w.id, selectedWorkerId));
      if (fuzzy) {
        setSelectedWorkerId(fuzzy.id);
        return;
      }
    }
    if (selectedWorkerId) return;
    if (workerOptions.length === 1) {
      const only = workerOptions[0];
      if (!vacationBlockedById[only.id] && !vacationBlockedById[String(only.id).trim()]) {
        setSelectedWorkerId(only.id);
      }
      return;
    }
    const cached = (() => {
      try { return localStorage.getItem('vertial.tpvRapido.cashierName') || ''; } catch { return ''; }
    })().trim().toLowerCase();
    if (!cached) return;
    const match = workerOptions.find((w) => w.name.trim().toLowerCase() === cached);
    if (match) setSelectedWorkerId(match.id);
  }, [workerOptionsKey, selectedWorkerId, workerOptions, vacationBlockedById]);

  useEffect(() => {
    if (!restrictedToPdvId) return;
    const pdvChanged = lastRestrictedPdvRef.current !== restrictedToPdvId;
    lastRestrictedPdvRef.current = restrictedToPdvId;
    setSelectedPdvId(restrictedToPdvId);
    if (pdvChanged) setSelectedTerminalId('');
  }, [restrictedToPdvId]);

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

  // Código tablet: terminal fijo (SALA-* o primer terminal del PDV).
  useEffect(() => {
    if (!tabletBoundOpening || !selectedPdv || selectedTerminalId) return;

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
  }, [tabletBoundOpening, selectedPdv, selectedTerminalId, availableTerminals]);

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

  const requestOpenCash = () => {
    // Solo openingBusy bloquea. parentLoading (refresco de sesiones) tragaba el
    // primer click de «Abrir caja» en silencio y había que pulsar dos veces.
    if (openingBusy) {
      toast.info('Abriendo caja…', { id: 'tpv-opening-busy', duration: 1500 });
      return;
    }
    if (existingOpenForStore) {
      toast.info('Ya hay caja abierta. Usa Continuar en esta caja.', { id: 'tpv-use-enter-banner', duration: 2500 });
      return;
    }
    const wName = effectiveWorkerName();
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    if (selectedWorkerId && vacationBlockedById[selectedWorkerId]) {
      toast.error(vacationBlockedById[selectedWorkerId]);
      return;
    }
    if (!canOpen || !wName || !pdvId) {
      toast.error(openBlockedReason || 'Completa tienda y trabajador para abrir');
      return;
    }
    setOpenCashConfirm('ask');
  };

  const performOpenCash = () => {
    if (openingBusy) {
      toast.info('Abriendo caja…', { id: 'tpv-opening-busy', duration: 1500 });
      return;
    }
    if (existingOpenForStore) {
      toast.info('Ya hay caja abierta. Usa Continuar en esta caja.', { id: 'tpv-use-enter-banner', duration: 2500 });
      return;
    }
    const wName = effectiveWorkerName();
    const pdvId = selectedPdv?._id || restrictedToPdvId || '';
    const syntheticTerminalId = allowSyntheticTerminal
      ? `${tabletBoundOpening ? 'tablet' : 'tpv'}-${pdvId || 'default'}`
      : '';
    if (selectedWorkerId && vacationBlockedById[selectedWorkerId]) {
      toast.error(vacationBlockedById[selectedWorkerId]);
      return;
    }
    if (!canOpen || !wName || !pdvId) {
      toast.error(openBlockedReason || 'Completa tienda y trabajador para abrir');
      return;
    }
    setOpenCashConfirm(null);
    onOpen({
      workerId: selectedWorkerId || undefined,
      workerName: wName,
      pointOfSaleId: pdvId,
      pointOfSaleName: selectedPdv ? pointOfSaleDisplayLabel(selectedPdv) : (tabletStoreLabel || ''),
      terminalId: selectedTerminal?.id || syntheticTerminalId,
      terminalName: effectiveTerminalName || (tabletBoundOpening ? 'Tablet' : 'Terminal principal'),
      datafonName: effectiveDatafon,
      printerName: effectivePrinter,
      counts,
    });
  };

  const inputCls = 'w-full px-2.5 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

  const goBack = () => {
    if (tabletBoundOpening) {
      void leaveTpvTabletSession(logout, { navigate });
      return;
    }
    // Bar/restaurante: no history.back() (suele devolver al dashboard/ops al instante).
    if (isRestaurantBusinessType(currentBusiness?.businessType)) {
      navigate('/saas/restaurant-ops', { replace: true });
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
      : `Tu plan ${pointOfSaleAccess.planLabel} incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Con PRO + ampliación puedes añadir más.`;

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const terminalSectionRef = useRef<HTMLDivElement>(null);

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
  const storeAlreadyFixed = Boolean(restrictedToPdvId || restaurantOpening || tabletBoundOpening);
  const terminalLabel = selectedTerminal
    ? (selectedTerminal.code || selectedTerminal.name)
    : '';

  const openBlockedReason = !hasWorkers
    ? 'Añade trabajadores en Equipo'
    : !effectiveWorkerName()
      ? 'Elige quién abre (botón Abrir en el equipo)'
      : selectedWorkerVacationMsg
        ? selectedWorkerVacationMsg
        : !hasResolvedPdv
          ? 'Elige la tienda'
          : !(selectedTerminal || allowSyntheticTerminal)
            ? 'Elige el terminal'
            : '';

  const staleOpenBanner = staleOpenForStore ? (() => {
    const who = [
      staleOpenForStore.workerName || 'Equipo',
      staleOpenForStore.terminalName || '',
      displayStoreName || staleOpenForStore.pointOfSaleName || '',
    ].filter(Boolean).join(' · ');
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          Caja abierta desde ayer
        </p>
        <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
          {who || 'Hay un turno antiguo sin cerrar.'} Puedes continuar en esa caja o abrir una nueva (se cerrará la anterior si corresponde).
        </p>
        <button
          type="button"
          onClick={() => onContinueExistingOpen?.(staleOpenForStore)}
          disabled={parentLoading || openingBusy || !onContinueExistingOpen}
          className={`w-full ${VERTIAL_BTN_PRIMARY} min-h-10 text-sm`}
        >
          {(parentLoading || openingBusy) ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <LogIn className="w-4 h-4" />
          )}
          Continuar en esta caja
        </button>
      </div>
    );
  })() : null;

  /** Misma OpeningScreen siempre: si hay caja abierta de ESTA tienda, banner Continuar (no otra pantalla). */
  const liveOpenBanner = existingOpenForStore ? (() => {
    const who = [
      existingOpenForStore.workerName || 'Equipo',
      existingOpenForStore.terminalName || '',
      displayStoreName || existingOpenForStore.pointOfSaleName || '',
    ].filter(Boolean).join(' · ');
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          Caja abierta
        </p>
        <p className="text-xs text-emerald-800/90 dark:text-emerald-200/80">
          {who || 'Saliste sin cerrar.'} Continúa en la misma caja — no hace falta contar el fondo.
        </p>
        <button
          type="button"
          onClick={() => onContinueExistingOpen?.(existingOpenForStore)}
          disabled={parentLoading || openingBusy || !onContinueExistingOpen}
          className={`w-full ${VERTIAL_BTN_PRIMARY} min-h-10 text-sm`}
        >
          {(parentLoading || openingBusy) ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <LogIn className="w-4 h-4" />
          )}
          Continuar en esta caja
        </button>
      </div>
    );
  })() : null;

  return (
    <div className="min-h-[100dvh] min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col">
      <div className="flex-1 flex items-stretch sm:items-center justify-center p-2 sm:p-3">
      <div className="relative bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg w-full max-w-4xl min-h-[min(88dvh,680px)] sm:min-h-0 sm:max-h-[min(88svh,680px)] flex flex-col">
        {/* Header — banner Continuar (CEO, tablet y código tienda: misma UI) */}
        {(liveOpenBanner || staleOpenBanner) ? (
          <div className="shrink-0 px-3 sm:px-4 pt-3 space-y-2">
            {liveOpenBanner}
            {!liveOpenBanner ? staleOpenBanner : null}
          </div>
        ) : null}
        <div className="shrink-0 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2.5 px-3 sm:px-4 py-2.5">
          <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center shrink-0 w-9 h-9">
            <Unlock className="text-emerald-600 w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-stone-900 dark:text-stone-100 leading-tight truncate text-sm sm:text-base">
              {displayStoreName || 'Apertura de caja'}
            </h1>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              {storeAlreadyFixed
                ? `Apertura${terminalLabel ? ` · ${terminalLabel}` : ''}`
                : 'Elige tienda, quién abre y cuenta el efectivo'}
            </p>
          </div>
          <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 text-[11px] font-bold tabular-nums">
            {total.toFixed(2)}€
          </span>
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
            aria-label="Salir"
            title="Salir"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div
          ref={bodyScrollRef}
          className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 md:grid-rows-1 gap-0 overflow-y-auto md:overflow-hidden relative"
        >
          {/* Columna fichaje | columna efectivo */}
              {/* Franja terminal (sin comer espacio del fichaje) */}
              {selectedPdv && availableTerminals.length > 1 ? (
                <div
                  ref={terminalSectionRef}
                  className="md:col-span-2 shrink-0 px-3 py-2 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-wrap items-center gap-2"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 shrink-0">
                    Terminal
                  </span>
                  <div className="flex flex-wrap gap-1.5 min-w-0">
                    {availableTerminals.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTerminalId(t.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          selectedTerminalId === t.id
                            ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:bg-blue-950/40 dark:text-blue-200'
                            : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                        }`}
                      >
                        {t.code || t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="p-3 md:overflow-y-auto border-b md:border-b-0 md:border-r border-stone-200 dark:border-stone-800 flex flex-col gap-2 min-h-0 min-w-0 md:h-full">
                {isManagerView && !restrictedToPdvId && hasStores ? (
                  <div className="shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                        Tienda *
                      </label>
                      <button
                        type="button"
                        onClick={handlePointOfSaleAction}
                        className="px-2 py-1 rounded-md text-[10px] font-bold border border-stone-200 text-stone-600 hover:bg-stone-50"
                        title={pointOfSaleActionTitle}
                      >
                        {pointOfSaleActionLabel}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
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
                        const selected = Boolean(row.pdvId && selectedPdvId === row.pdvId);
                        return (
                          <button
                            key={row.rowId}
                            type="button"
                            onClick={() => handleSelectStoreRow(row)}
                            className={`px-2 py-2 rounded-xl border text-left text-xs font-semibold truncate ${
                              selected
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                                : 'border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100'
                            }`}
                          >
                            {row.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {restrictedToPdvId && hasStores && displayPdvs.length === 0 && onClearStorePick ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Esta tienda ya no está disponible.</p>
                    <button type="button" onClick={onClearStorePick} className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold">
                      Elegir otra tienda
                    </button>
                  </div>
                ) : null}

                {isManagerView && !restrictedToPdvId && !hasStores && !parentLoading ? (
                  <div className="rounded-xl border border-stone-200 p-3 text-sm text-stone-600">
                    No hay PDV activos.{' '}
                    <button type="button" onClick={() => navigate('/saas/settings/tienda')} className="font-semibold text-[#2563EB] hover:underline">
                      Configurar tiendas
                    </button>
                  </div>
                ) : null}

                {parentLoading && !hasStores ? (
                  <p className="text-sm text-stone-500">Cargando tiendas…</p>
                ) : null}

                {selectedPdv && availableTerminals.length === 0 && !allowSyntheticTerminal ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Este PDV no tiene terminales activos. Configúralos en Ajustes.
                  </div>
                ) : null}

                <div className="flex-1 min-h-0 flex flex-col">
                  {clockInBusinessId && hasResolvedPdv ? (
                    <ClockInModal
                      embedded
                      storeLabel={displayStoreName || selectedPdv?.name || 'Tienda'}
                      businessId={clockInBusinessId}
                      ownerUserId={clockInOwnerUserId}
                      pdvId={String(selectedPdv?._id || restrictedToPdvId || '')}
                      workCenterId={String(selectedPdv?.workCenterId || '')}
                      onCancel={() => undefined}
                      onChanged={onClockInChanged}
                      onMemberClockedIn={(memberId) => {
                        setSelectedWorkerId(memberId);
                      }}
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-950/40 px-4 py-8 text-center">
                      <LogIn className="w-5 h-5 text-stone-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Fichaje</p>
                      <p className="text-xs text-stone-500 mt-1">
                        {clockInBusinessId ? 'Elige la tienda para ver el equipo.' : 'Cargando…'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950/50 md:overflow-y-auto flex flex-col gap-2.5 min-h-0 min-w-0 md:h-full">
                <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 space-y-1.5 shrink-0">
                  <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                    Quién abre la caja *
                  </label>
                  {hasWorkers ? (
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                      <select
                        value={selectedWorkerId}
                        onChange={(e) => setSelectedWorkerId(e.target.value)}
                        className={`${inputCls} pl-8 min-h-10 text-sm`}
                      >
                        <option value="">Selecciona…</option>
                        {workerOptions.map((w) => (
                          <option key={w.id} value={w.id} disabled={Boolean(vacationBlockedById[w.id])}>
                            {vacationBlockedById[w.id] ? `${w.name} (vacaciones/baja)` : w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700">No hay equipo. Añade trabajadores en Equipo.</p>
                  )}
                  {selectedWorkerVacationMsg ? (
                    <p className="text-[11px] text-amber-700">{selectedWorkerVacationMsg}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 shrink-0">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                    Fondo de apertura *
                  </label>
                  <span className="text-[11px] font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                    {openingCashAmount.toFixed(2)}€
                  </span>
                </div>

                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-3 shrink-0 space-y-1">
                  <p className="text-[11px] font-bold text-amber-900 dark:text-amber-100">
                    {previousCloseCash != null
                      ? `Fondo dejado${previousCloseLabel ? ` · ${previousCloseLabel}` : ''}`
                      : 'Fondo de apertura'}
                  </p>
                  <p className="text-3xl font-black tabular-nums text-amber-950 dark:text-amber-50">
                    {openingCashAmount.toFixed(2)}€
                  </p>
                  <p className="text-[10px] text-amber-800/80 dark:text-amber-200/70">
                    {previousCloseCash != null
                      ? 'Se abre con este importe.'
                      : 'Sin fondo dejado. Se abre con 0,00 €.'}
                  </p>
                </div>
              </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 flex gap-2 bg-white dark:bg-gray-800 px-3 sm:px-4 py-2">
          <button
            type="button"
            onClick={goBack}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Volver
          </button>
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            {!canOpen && !existingOpenForStore && !staleOpenForStore && openBlockedReason ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium truncate px-0.5">
                {openBlockedReason}
              </p>
            ) : null}
            <button
              type="button"
              onClick={requestOpenCash}
              disabled={!canOpen || openActionBusy || Boolean(existingOpenForStore)}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-1.5 ${
                canOpen && !openActionBusy && !existingOpenForStore
                  ? 'bg-[#2563EB] hover:bg-blue-700 text-white'
                  : 'bg-stone-200 dark:bg-stone-700 text-stone-400 cursor-not-allowed'
              }`}
            >
              {openingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              {openingBusy
                ? 'Abriendo…'
                : existingOpenForStore
                  ? 'Usa Continuar arriba'
                  : `Abrir caja — ${total.toFixed(2)}€`}
            </button>
          </div>
        </div>

        {openCashConfirm ? (
          <div
            className="absolute inset-0 z-20 flex items-end sm:items-center justify-center bg-black/45 p-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-open-cash-title"
            onClick={() => setOpenCashConfirm(null)}
          >
            <div
              className="w-full sm:max-w-md rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {openCashConfirm === 'ask' ? (
                <>
                  <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                    </div>
                    <div className="min-w-0">
                      <h3 id="confirm-open-cash-title" className="text-sm font-bold text-amber-950 dark:text-amber-100">
                        ¿Has revisado cuánto dinero hay?
                      </h3>
                      <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1 leading-snug">
                        Vas a abrir con{' '}
                        <strong className="tabular-nums">{total.toFixed(2)}€</strong>
                        . Confirma que el cajón cuadra.
                      </p>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={performOpenCash}
                      disabled={openingBusy}
                      className={`${VERTIAL_BTN_PRIMARY} !min-h-11 w-full`}
                    >
                      Sí, está bien — abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenCashConfirm('ceo-alert')}
                      className={`${VERTIAL_BTN_DANGER} !min-h-11 w-full`}
                    >
                      No, no hay tanto
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenCashConfirm(null)}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-11 w-full`}
                    >
                      Volver a contar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 py-3 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-rose-700 dark:text-rose-300" />
                    </div>
                    <div className="min-w-0">
                      <h3 id="confirm-open-cash-title" className="text-sm font-bold text-rose-950 dark:text-rose-100">
                        Alerta: el CEO tiene que revisar
                      </h3>
                      <p className="text-[11px] text-rose-800 dark:text-rose-200 mt-1 leading-snug">
                        No abras la caja con un importe que no cuadra. Avisa al responsable y
                        cuenta de nuevo cuando lo confirme.
                      </p>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        toast.warning(
                          `Cajón no cuadra (${total.toFixed(2)}€). Aviso: el CEO debe revisar antes de abrir.`,
                          { id: 'tpv-open-cash-ceo-alert', duration: 6000 },
                        );
                        setOpenCashConfirm(null);
                      }}
                      className={`${VERTIAL_BTN_PRIMARY} !min-h-11 w-full`}
                    >
                      Entendido — no abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenCashConfirm('ask')}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-11 w-full`}
                    >
                      Volver
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
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
  /** Efectivo que queda en cajón como fondo. */
  nextDayInitialSlot?: string;
  manualFood: { pizza: string; burger: string; taco: string };
  appsManualDraft: ManualLinesByChannel;
  /** Solo true si el usuario editó a mano P/B/T (no por auto-guardado del sistema). */
  foodLockedByUser?: boolean;
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

/** Resumen de dinero/unidades/marcas del cierre (Caja 1 + Caja 2). */
type ClosingBrandLine = {
  brandId: string;
  name: string;
  /** Tienda / TPV */
  caja1: number;
  /** Apps hecho en app */
  caja2: number;
  total: number;
};

type ClosingExcelLikeAmounts = {
  efectivo: number;
  tpv: number;
  x: number;
  app: number;
  uber: number;
  justEat: number;
  glovo: number;
  total: number;
  pizza: number;
  burger: number;
  taco: number;
  expected: number;
  counted: number;
  diff: number;
  unpaidCash: number;
  unpaidCard: number;
  brands: ClosingBrandLine[];
};

function sumAppsBrandTotalsBySlot(
  slots: ClosingBillingBrandSlot[],
  appsRows: Array<{ brandId: string; name: string; revenue: number }>,
  unbranded = 0,
): ClosingBrandLine[] {
  if (!slots.length && appsRows.length === 0 && unbranded <= 0) return [];

  const used = new Set<string>();
  const lines: ClosingBrandLine[] = [];

  for (const slot of slots) {
    const memberIds = slot.memberBrandIds?.length ? slot.memberBrandIds : [slot.brandId];
    const aliases = new Set<string>();
    for (const id of memberIds) {
      for (const a of brandIdAliases(id)) aliases.add(a);
    }
    const matching = appsRows.filter(
      (r) => aliases.has(r.brandId) || brandIdAliases(r.brandId).some((a) => aliases.has(a)),
    );
    for (const r of matching) used.add(r.brandId);
    const caja2 = Math.round(matching.reduce((s, r) => s + (Number(r.revenue) || 0), 0) * 100) / 100;
    if (caja2 <= 0) continue;
    lines.push({
      brandId: slot.brandId,
      name: slot.name,
      caja1: 0,
      caja2,
      total: caja2,
    });
  }

  let leftover = unbranded;
  for (const r of appsRows) {
    if (used.has(r.brandId)) continue;
    leftover = Math.round((leftover + (Number(r.revenue) || 0)) * 100) / 100;
  }
  if (leftover > 0 && lines.length > 0) {
    lines[0] = {
      ...lines[0],
      caja2: Math.round((lines[0].caja2 + leftover) * 100) / 100,
      total: Math.round((lines[0].total + leftover) * 100) / 100,
    };
  } else if (leftover > 0) {
    for (const r of appsRows) {
      if (used.has(r.brandId)) continue;
      const caja2 = Math.round((Number(r.revenue) || 0) * 100) / 100;
      if (caja2 <= 0) continue;
      lines.push({
        brandId: r.brandId,
        name: r.name || r.brandId,
        caja1: 0,
        caja2,
        total: caja2,
      });
    }
  }

  return lines.filter((l) => l.total > 0);
}

function mergeClosingBrandLines(
  caja1Rows: Array<{ brandId: string; name: string; revenue: number }>,
  caja2Lines: ClosingBrandLine[],
  slots: ClosingBillingBrandSlot[],
): ClosingBrandLine[] {
  const byId = new Map<string, ClosingBrandLine>();

  const ensure = (brandId: string, name: string) => {
    let row = byId.get(brandId);
    if (!row) {
      row = { brandId, name, caja1: 0, caja2: 0, total: 0 };
      byId.set(brandId, row);
    }
    return row;
  };

  for (const slot of slots) {
    ensure(slot.brandId, slot.name);
  }

  for (const r of caja1Rows) {
    const slot =
      slots.find(
        (s) =>
          s.brandId === r.brandId
          || (s.memberBrandIds || []).some((id) => brandIdAliases(id).includes(r.brandId))
          || brandIdAliases(r.brandId).includes(s.brandId),
      ) || null;
    const id = slot?.brandId || r.brandId;
    const name = slot?.name || r.name;
    const row = ensure(id, name);
    row.caja1 = Math.round((row.caja1 + (Number(r.revenue) || 0)) * 100) / 100;
  }

  for (const r of caja2Lines) {
    const row = ensure(r.brandId, r.name);
    row.caja2 = Math.round((row.caja2 + (Number(r.caja2) || 0)) * 100) / 100;
  }

  return [...byId.values()]
    .map((r) => ({
      ...r,
      total: Math.round((r.caja1 + r.caja2) * 100) / 100,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function brandsFromClosedSession(
  session: TpvRegisterSession,
  brandLabels: Record<string, string> = {},
): ClosingBrandLine[] {
  const labels = {
    ...(session.closingBrandLabels || {}),
    ...brandLabels,
  };
  const byId = new Map<string, ClosingBrandLine>();
  const ensure = (brandId: string) => {
    let row = byId.get(brandId);
    if (!row) {
      row = {
        brandId,
        name: displayBrandName(brandId, labels),
        caja1: 0,
        caja2: 0,
        total: 0,
      };
      byId.set(brandId, row);
    }
    return row;
  };

  // Caja 1 = misma foto que dashboard/resumen al cerrar (efectivo + tarjeta por marca).
  for (const [brandId, pay] of Object.entries(session.closingBrandTpvTotals || {})) {
    const id = String(brandId || '').trim();
    if (!id || !pay || typeof pay !== 'object') continue;
    const caja1 = Math.round(
      ((Number(pay.efectivo) || 0) + (Number(pay.tarjeta) || 0)) * 100,
    ) / 100;
    if (caja1 <= 0) continue;
    const row = ensure(id);
    row.caja1 = Math.round((row.caja1 + caja1) * 100) / 100;
  }

  for (const perBrand of Object.values(session.aggregatorClosingBrandTotals || {})) {
    if (!perBrand || typeof perBrand !== 'object') continue;
    for (const [brandId, raw] of Object.entries(perBrand)) {
      const n = Number(raw) || 0;
      if (n <= 0) continue;
      const row = ensure(brandId);
      row.caja2 = Math.round((row.caja2 + n) * 100) / 100;
    }
  }

  return [...byId.values()]
    .map((r) => ({
      ...r,
      total: Math.round((r.caja1 + r.caja2) * 100) / 100,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Si el snapshot de apps no trae marcas, reparte totales de marca en CADA canal
 * con peso del € del canal (nunca todo al primer canal).
 */
function brandTotalsByChannelFromAppsRows(
  rows: Array<{ brandId: string; revenue: number }>,
  channelKeys: string[],
  channelAmounts: Record<string, number> = {},
): Record<string, Record<string, number>> {
  const positive = rows.filter((r) => (Number(r.revenue) || 0) > 0 && String(r.brandId || '').trim());
  if (positive.length === 0) return {};
  const channels = channelKeys.map((c) => String(c || '').trim()).filter(Boolean);
  if (channels.length === 0) return {};
  const byBrand: Record<string, number> = {};
  for (const r of positive) {
    const id = String(r.brandId).trim();
    byBrand[id] = Math.round(((byBrand[id] || 0) + (Number(r.revenue) || 0)) * 100) / 100;
  }
  const weights: Record<string, number> = {};
  let weightSum = 0;
  for (const ch of channels) {
    const w = Math.max(0, Number(channelAmounts[ch]) || 0);
    weights[ch] = w;
    weightSum += w;
  }
  if (weightSum <= 0) {
    const eq = 1 / channels.length;
    for (const ch of channels) weights[ch] = eq;
    weightSum = 1;
  }
  const out: Record<string, Record<string, number>> = {};
  for (const ch of channels) {
    const scale = weights[ch] / weightSum;
    const per: Record<string, number> = {};
    for (const [id, amt] of Object.entries(byBrand)) {
      const v = Math.round(amt * scale * 100) / 100;
      if (v > 0) per[id] = v;
    }
    if (Object.keys(per).length > 0) out[ch] = per;
  }
  return out;
}

function excelLikeAmountsFromClosedSession(
  session: TpvRegisterSession,
  brandLabels: Record<string, string> = {},
): ClosingExcelLikeAmounts {
  const amounts = sessionToCajaAmounts(session);
  const expected = Number(session.expectedCash ?? calcTpvExpectedCash(session)) || 0;
  const counted = Number(session.finalCashAmount) || 0;
  const diff = Number.isFinite(Number(session.difference))
    ? Number(session.difference)
    : counted - expected;
  const unpaidCash = Math.round(
    Object.values(session.aggregatorClosingCash || {}).reduce((s, n) => s + (Number(n) || 0), 0) * 100,
  ) / 100;
  const unpaidCard = Math.round(
    Object.values(session.aggregatorClosingCard || {}).reduce((s, n) => s + (Number(n) || 0), 0) * 100,
  ) / 100;
  /** TOTAL = canales (TPV + apps). No pagado es desglose del cajón, ya va en Glovo/Uber/… */
  const total = amounts.total;
  return {
    efectivo: amounts.efectivo,
    tpv: amounts.tpv,
    x: amounts.x,
    app: amounts.app,
    uber: amounts.uber,
    justEat: amounts.justEat,
    glovo: amounts.glovo,
    total,
    pizza: amounts.totalPizza,
    burger: amounts.totalBurger,
    taco: amounts.totalTaco,
    expected,
    counted,
    diff,
    unpaidCash,
    unpaidCard,
    brands: brandsFromClosedSession(session, brandLabels),
  };
}

function ClosingExcelLikeSummary({
  amounts,
  brandLabels = {},
  compact = false,
}: {
  amounts: ClosingExcelLikeAmounts;
  brandLabels?: Record<string, string>;
  compact?: boolean;
}) {
  // NO PAG. efectivo/tarjeta: no se listan (confunden). Ya van dentro de App/Uber/JE/Glovo
  // y del TOTAL; no suman otra vez.
  const moneyLines: Array<{ label: string; hint: string; value: number; emphasize?: boolean }> = [
    { label: 'EFECTIVO', hint: 'Cobros en efectivo de la tienda (TPV)', value: amounts.efectivo },
    { label: 'TPV', hint: 'Tarjeta cobrada en tienda', value: amounts.tpv },
    { label: 'X', hint: 'Bizum y otros pagos locales', value: amounts.x },
    { label: 'App', hint: 'Flipdish / app propia', value: amounts.app },
    { label: 'UBER', hint: 'Uber Eats (hecho en apps)', value: amounts.uber },
    { label: 'JUST EAT', hint: 'Just Eat (hecho en apps)', value: amounts.justEat },
    { label: 'GLOVO', hint: 'Glovo (hecho en apps)', value: amounts.glovo },
  ];
  const visibleMoney = moneyLines.filter(
    (l) => l.value > 0 || l.label === 'EFECTIVO' || l.label === 'TPV',
  );
  const unpaidIncludedHint =
    (Number(amounts.unpaidCash) || 0) > 0 || (Number(amounts.unpaidCard) || 0) > 0;
  const brandLines = (amounts.brands || []).map((b) => {
    const resolved = displayBrandName(b.brandId, brandLabels);
    const name =
      resolved
      && resolved !== 'Marca'
        ? resolved
        : (!looksLikeBrandTechnicalId(b.name) && String(b.name || '').trim())
          || resolved
          || 'Marca';
    return { ...b, name };
  });
  const diffLabel = amounts.diff === 0 ? 'Cuadra' : amounts.diff > 0 ? 'Sobra' : 'Falta';

  return (
    <div className={`rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 overflow-hidden ${compact ? '' : 'shadow-sm'}`}>
      <div className={`border-b border-stone-100 dark:border-stone-800 ${compact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
        <p className={`font-bold text-stone-900 dark:text-stone-100 ${compact ? 'text-sm' : 'text-base'}`}>
          Resumen del cierre
        </p>
        {!compact ? (
          <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
            Canales, marcas (Vertial + Integraciones) y unidades del día
          </p>
        ) : null}
      </div>

      <div className={compact ? 'px-3 py-2 space-y-1' : 'px-3.5 py-2.5 space-y-1.5'}>
        {visibleMoney.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-bold text-stone-800 dark:text-stone-100 ${compact ? 'text-xs' : 'text-sm'}`}>
                {line.label}
              </p>
              {!compact ? (
                <p className="text-[10px] text-stone-500 truncate">{line.hint}</p>
              ) : null}
            </div>
            <span className={`font-black tabular-nums text-stone-900 dark:text-stone-50 shrink-0 ${compact ? 'text-sm' : 'text-base'}`}>
              {formatMoneyEs(line.value)}
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-2 border-t border-stone-200 dark:border-stone-700 pt-2 mt-1">
          <div>
            <p className={`font-black text-stone-900 dark:text-stone-50 ${compact ? 'text-sm' : 'text-base'}`}>TOTAL</p>
            {!compact ? (
              <p className="text-[10px] text-stone-500">
                {unpaidIncludedHint
                  ? 'Suma de canales · no pag. apps ya va dentro (no suma aparte)'
                  : 'Suma de canales'}
              </p>
            ) : null}
          </div>
          <span className={`font-black tabular-nums text-[#2563EB] shrink-0 ${compact ? 'text-lg' : 'text-2xl'}`}>
            {formatMoneyEs(amounts.total)}
          </span>
        </div>
      </div>

      {brandLines.length > 0 ? (
        <div className={`border-t border-stone-100 dark:border-stone-800 ${compact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
            Marcas
          </p>
          <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
            {brandLines.map((b) => (
              <div key={b.brandId} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`font-bold text-stone-800 dark:text-stone-100 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                    {b.name}
                  </p>
                  {!compact ? (
                    <p className="text-[10px] text-stone-500 tabular-nums">
                      Vertial {formatMoneyEs(b.caja1)}
                      <span className="mx-1 text-stone-300">·</span>
                      Integraciones {formatMoneyEs(b.caja2)}
                    </p>
                  ) : (
                    <p className="text-[9px] text-stone-400 tabular-nums">
                      Vertial {formatMoneyEs(b.caja1)} · Integraciones {formatMoneyEs(b.caja2)}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 font-black tabular-nums text-stone-900 dark:text-stone-50 ${compact ? 'text-sm' : 'text-base'}`}>
                  {formatMoneyEs(b.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`grid grid-cols-3 gap-px bg-stone-100 dark:bg-stone-800 border-t border-stone-100 dark:border-stone-800`}>
        {([
          { label: 'Pizzas', value: amounts.pizza },
          { label: 'Burgers', value: amounts.burger },
          { label: 'Tacos', value: amounts.taco },
        ]).map((u) => (
          <div key={u.label} className={`bg-white dark:bg-stone-950 text-center ${compact ? 'px-1 py-1.5' : 'px-2 py-2'}`}>
            <p className="text-[10px] font-semibold text-stone-500">{u.label}</p>
            <p className={`font-black tabular-nums text-stone-900 dark:text-stone-50 ${compact ? 'text-base' : 'text-xl'}`}>
              {u.value}
            </p>
          </div>
        ))}
      </div>

      <div className={`border-t border-stone-100 dark:border-stone-800 space-y-1 ${compact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
          Arqueo del cajón
        </p>
        <div className="flex justify-between gap-2 text-xs text-stone-600 dark:text-stone-300">
          <span>Esperado en cajón</span>
          <span className="font-bold tabular-nums text-stone-900 dark:text-stone-100">{formatMoneyEs(amounts.expected)}</span>
        </div>
        <div className="flex justify-between gap-2 text-xs text-stone-600 dark:text-stone-300">
          <span>Contado</span>
          <span className="font-bold tabular-nums text-stone-900 dark:text-stone-100">{formatMoneyEs(amounts.counted)}</span>
        </div>
        <div className={`flex justify-between gap-2 text-xs font-bold ${
          amounts.diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'
        }`}>
          <span>{diffLabel}</span>
          <span className="tabular-nums">
            {amounts.diff >= 0 ? '+' : ''}{formatMoneyEs(amounts.diff)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ClosingScreen({ session, dataUserId, onClose, onCancel, restaurantWarnings = [], busy = false, showDeliveryClosingSlots = true }: {
  session: TpvRegisterSession;
  dataUserId: string;
  onClose: (
    counts: CashDenominationCount,
    notes: string,
    aggregatorRows: AggregatorCashRow[],
    productClosingCounts: NonNullable<TpvRegisterSession['productClosingCounts']>,
    appsClosingExtras?: {
      brandTotalsByChannel?: Record<string, Record<string, number>>;
      unpaidCashByBrandByChannel?: Record<string, Record<string, number>>;
      unpaidCardByBrandByChannel?: Record<string, Record<string, number>>;
      closingBrandLabels?: Record<string, string>;
      /** Total MM/BB → id hoja Excel (mismas 4 pestañas marca×tienda). */
      closingBrandSheetIds?: Record<string, string>;
      /** Caja 1 efectivo/tarjeta por marca (Excel = finales de caja). */
      brandTpvTotals?: Record<string, { efectivo: number; tarjeta: number }>;
    },
    nextDayInitialCash?: number,
  ) => void;
  onCancel: () => void;
  restaurantWarnings?: string[];
  busy?: boolean;
  /** Delivery: slots Efectivo + pizzas/burgers/tacos editables. */
  showDeliveryClosingSlots?: boolean;
}) {
  const { currentBusiness } = useBusiness();
  /**
   * Cierre = empresa de la sesión de caja (PDV), no la del selector del menú.
   * Si no, con inmobiliaria/otra empresa activa no cargan marcas → solo «Total app».
   */
  const businessId =
    String(session.business_id || (session as { businessId?: string }).businessId || '').trim()
    || resolveBusinessScopeId(currentBusiness);
  const sessionId = String(session._id || '').trim();
  const savedDraft = useMemo(() => readClosingFormDraft(sessionId), [sessionId]);
  const [counts, setCounts] = useState<CashDenominationCount>(() => savedDraft?.counts || {});
  const [notes, setNotes] = useState(() => savedDraft?.notes || '');
  const [shiftOrders, setShiftOrders] = useState<DeliveryOrder[]>([]);
  const [shiftOrdersLoading, setShiftOrdersLoading] = useState(true);
  const [cashSlot, setCashSlot] = useState(() => savedDraft?.cashSlot || '');
  const [cashSlotFocused, setCashSlotFocused] = useState(false);
  const [nextDayInitialSlot, setNextDayInitialSlot] = useState(
    () => savedDraft?.nextDayInitialSlot || '',
  );
  /** Calculadora billetes/monedas del fondo que queda (independiente del conteo del cajón). */
  const [fondoCounts, setFondoCounts] = useState<CashDenominationCount>(() => {
    const parsed = parseAggregatorAmount(savedDraft?.nextDayInitialSlot || '');
    if (parsed == null || parsed < 0) return {};
    return buildDenominationFromAmount(parsed);
  });
  /**
   * P/B/T solo se restauran del borrador si el usuario los editó a mano.
   * Si no, empiezan vacíos y el sistema los rellena al cargar pedidos (nunca se congelan a media jornada).
   */
  const draftFoodLocked = savedDraft?.foodLockedByUser === true;
  const [manualFood, setManualFood] = useState(() => {
    if (draftFoodLocked && draftHasUserFoodCounts(savedDraft?.manualFood) && savedDraft?.manualFood) {
      return {
        pizza: String(savedDraft.manualFood.pizza || ''),
        burger: String(savedDraft.manualFood.burger || ''),
        taco: String(savedDraft.manualFood.taco || ''),
      };
    }
    return { pizza: '', burger: '', taco: '' };
  });
  const [foodLockedByUser, setFoodLockedByUser] = useState(() => draftFoodLocked);
  const [appsSnapshot, setAppsSnapshot] = useState<AggregatorClosingSnapshot | null>(null);
  const [appsManualDraft, setAppsManualDraft] = useState<ManualLinesByChannel>(
    () => savedDraft?.appsManualDraft || {},
  );
  const [draftRestored] = useState(() => Boolean(savedDraft));
  const [showExtraDetail, setShowExtraDetail] = useState(false);
  /** Movimientos de caja en paso cierre: plegado por defecto. */
  const [cashMovesOpen, setCashMovesOpen] = useState(false);
  /** Aviso final antes de cerrar la caja de verdad. */
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  /** Delivery: Tienda → Glovo → Uber → Just → Flip → Cierre. Bar/restaurante: un solo paso (1 caja). */
  const [closingStep, setClosingStep] = useState(1);
  const appClosingPlatforms = useMemo(
    () => (showDeliveryClosingSlots ? getClosingAggregatorPlatforms() : []),
    [showDeliveryClosingSlots],
  );
  const closingMaxStep = showDeliveryClosingSlots ? 1 + appClosingPlatforms.length + 1 : 1;
  const closingStepLabels = useMemo(() => {
    if (!showDeliveryClosingSlots) return ['Cierre'] as string[];
    const shortApp = (channel: string, label: string) => {
      if (channel === 'ubereats') return 'Uber';
      if (channel === 'justeat') return 'Just';
      if (channel === 'flipdish') return 'Flip';
      if (channel === 'glovo') return 'Glovo';
      return label;
    };
    return [
      'Vertial',
      ...appClosingPlatforms.map((p) => shortApp(p.channel, p.label)),
      'Cierre',
    ];
  }, [showDeliveryClosingSlots, appClosingPlatforms]);
  const deliveryAppStepIndex =
    showDeliveryClosingSlots && closingStep >= 2 && closingStep <= 1 + appClosingPlatforms.length
      ? closingStep - 2
      : -1;
  const focusAppChannel =
    deliveryAppStepIndex >= 0
      ? appClosingPlatforms[deliveryAppStepIndex]?.channel || null
      : null;
  const isDeliveryAppsStep = deliveryAppStepIndex >= 0;
  const isDeliveryCierreStep =
    showDeliveryClosingSlots && closingStep === closingMaxStep;
  /** Bar/restaurante: un solo paso, sin apps ni arqueo por billetes. */
  const isRestaurantCierreStep = !showDeliveryClosingSlots;
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const nextDayInitialInputRef = useRef<HTMLInputElement | null>(null);
  /** Resalta «Fondo que queda» si intentan avanzar/confirmar sin rellenarlo. */
  const [nextDayFondoHighlight, setNextDayFondoHighlight] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() => isBrowserOnline());
  const [brandLabels, setBrandLabels] = useState<Record<string, string>>({});
  /** Catálogo de marcas (para hojas de Facturación / 2ª caja). */
  const [catalogBrands, setCatalogBrands] = useState<Brand[]>([]);
  /** Hojas de Facturación resueltas (tacos pueden ir con Black Burger). */
  const [billingSheetsResolved, setBillingSheetsResolved] = useState<
    ReturnType<typeof resolveBillingSheetsForClosing>
  >([]);
  const [billingRules, setBillingRules] = useState<BrandBillingSplitRules>(() =>
    splitRulesFromBillingConfig(null),
  );

  useEffect(() => {
    const sync = () => setBrowserOnline(isBrowserOnline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    setShowExtraDetail(false);
    const el = bodyScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [closingStep]);

  const focusNextDayFondo = useCallback(() => {
    setNextDayFondoHighlight(true);
    window.requestAnimationFrame(() => {
      const el = nextDayInitialInputRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    });
  }, []);

  const goClosingStep = useCallback((next: number) => {
    const clamped = Math.min(closingMaxStep, Math.max(1, next));
    setClosingStep(clamped);
  }, [closingMaxStep]);
  const countedTotal = calcDenominationTotal(counts);
  const expectedTpv = calcTpvExpectedCash(session);
  const summary = buildTpvRegisterSummary(session);
  const cashReturnsTotal = sumCashReturns(session);
  const cashStaffConsumption = sumCashStaffConsumption(session);
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
    nextDayInitialSlot,
    // Sin edición manual: no persistir P/B/T (evita reabrir el cierre con números viejos).
    manualFood: foodLockedByUser
      ? manualFood
      : { pizza: '', burger: '', taco: '' },
    appsManualDraft,
    foodLockedByUser,
  }), [counts, notes, cashSlot, nextDayInitialSlot, manualFood, appsManualDraft, foodLockedByUser]);

  const persistDraft = useCallback(() => {
    if (!sessionId) return;
    writeClosingFormDraft(sessionId, buildDraftPayload());
  }, [sessionId, buildDraftPayload]);

  const handleSaveForLater = useCallback(() => {
    if (busy) return;
    persistDraft();
    toast.success('Cierre guardado para luego. Sigue cuando quieras desde Cerrar caja.');
    onCancel();
  }, [busy, persistDraft, onCancel]);

  // Auto-guarda mientras rellenan (por si cierran con la X / salen del modal).
  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(() => {
      writeClosingFormDraft(sessionId, buildDraftPayload());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [sessionId, buildDraftPayload]);

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
  const tpvAllSales = Math.round((Number(summary.totalSales) || 0) * 100) / 100;
  /** Caja 2 = solo hecho en apps. */
  const hechoAppsTotal = Math.round(
    (appsSnapshot?.appTotal
      ?? finalAggregatorRows.reduce((s, r) => s + (Number(r.totalSales) || 0), 0)) * 100,
  ) / 100;
  const integratorsTotal = hechoAppsTotal;
  /**
   * Caja 1 (Vertial) = solo ventas del TPV.
   * El «no pagado» apps se muestra aparte (cajón / info) y NO suma aquí:
   * ese dinero ya va en los totales Glovo/Uber/Just/Flip de Caja 2.
   */
  const caja1Total = tpvAllSales;
  /** Esperado físico en cajón = efectivo TPV (fondo+cobros+entradas−salidas) + no pagado efectivo apps. */
  const dayDrawerExpected = expected;
  /** Cobros tarjeta tienda (informativo). La tarjeta no pagada apps no infla Caja 1. */
  const dayCardCollected = tpvCardSales;
  /** Facturación día = Caja 1 Vertial + Caja 2 integraciones (sin doble contar no pagado). */
  const dayMoneyTotal = Math.round((caja1Total + integratorsTotal) * 100) / 100;
  /** Fila tipo resumen con los totales del cierre en vivo. */
  const excelDaySummaryBase = useMemo((): ClosingExcelLikeAmounts => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const ch = (channel: string) => {
      const row = finalAggregatorRows.find((x) => x.platform.channel === channel);
      return r2(Number(row?.totalSales) || 0);
    };
    const efectivo = tpvCashSales;
    const tpv = tpvCardSales;
    const x = r2(
      (Number(summary.salesByMethod.bizum) || 0) + (Number(summary.salesByMethod.otro) || 0),
    );
    const app = r2(ch('flipdish') + ch('app'));
    const uber = ch('ubereats');
    const justEat = ch('justeat');
    const glovo = ch('glovo');
    const unpaidCash = aggregatorCashTotal;
    const unpaidCard = aggregatorCardTotal;
    return {
      efectivo,
      tpv,
      x,
      app,
      uber,
      justEat,
      glovo,
      // No sumar unpaid: ya está en app/uber/justEat/glovo.
      total: r2(efectivo + tpv + x + app + uber + justEat + glovo),
      pizza: closingFood.pizza,
      burger: closingFood.burger,
      taco: closingFood.taco,
      expected: dayDrawerExpected,
      counted: countedTotal,
      diff,
      unpaidCash,
      unpaidCard,
      brands: [],
    };
  }, [
    finalAggregatorRows,
    tpvCashSales,
    tpvCardSales,
    summary.salesByMethod.bizum,
    summary.salesByMethod.otro,
    closingFood.pizza,
    closingFood.burger,
    closingFood.taco,
    dayDrawerExpected,
    countedTotal,
    diff,
    aggregatorCashTotal,
    aggregatorCardTotal,
  ]);
  const cashSlotDisplay = cashSlotFocused
    ? cashSlot
    : countedTotal > 0
      ? countedTotal.toFixed(2)
      : cashSlot;

  // Rellenar P/B/T del TPV cuando llegan los pedidos. No bloquear por borrador con "0"
  // (el auto-guardado lo escribía antes de cargar y dejaba el paso 1 vacío/a cero).
  useEffect(() => {
    if (!showDeliveryClosingSlots || foodLockedByUser || shiftOrdersLoading) return;
    setManualFood((prev) => {
      if (!foodSlotsAreUntouched(prev)) return prev;
      const next = foodSlotsFromSystemCounts(tpvSystemFood);
      if (prev.pizza === next.pizza && prev.burger === next.burger && prev.taco === next.taco) {
        return prev;
      }
      return next;
    });
  }, [showDeliveryClosingSlots, foodLockedByUser, shiftOrdersLoading, tpvSystemFood]);

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

  const nextDayInitialParsed = useMemo(() => {
    const parsed = parseAggregatorAmount(nextDayInitialSlot);
    if (parsed == null || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
  }, [nextDayInitialSlot]);
  const nextDayInitialReady = nextDayInitialParsed != null;
  const nextDayInitialAmount = nextDayInitialParsed ?? 0;

  useEffect(() => {
    if (nextDayInitialReady) setNextDayFondoHighlight(false);
  }, [nextDayInitialReady]);

  const handleNextDayInitialChange = useCallback((value: string) => {
    const formatted = formatMoneyAsYouType(value, true);
    setNextDayInitialSlot(formatted);
    const parsed = parseAggregatorAmount(formatted);
    if (parsed == null) {
      if (!String(formatted || '').trim()) setFondoCounts({});
      return;
    }
    setFondoCounts(buildDenominationFromAmount(parsed));
  }, []);

  const handleFondoCountsChange = useCallback((next: CashDenominationCount) => {
    setFondoCounts(next);
    const total = calcDenominationTotal(next);
    setNextDayInitialSlot(total.toFixed(2));
  }, []);

  const nextDayFondoCardClass = nextDayInitialReady
    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20'
    : nextDayFondoHighlight
      ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-400/60 dark:ring-amber-500/50'
      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950';

  const nextDayFondoInputClass = nextDayInitialReady
    ? 'border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-50 focus:ring-emerald-500/25 focus:border-emerald-500'
    : nextDayFondoHighlight
      ? 'border-amber-500 dark:border-amber-400 text-amber-950 dark:text-amber-50 focus:ring-amber-500/40 focus:border-amber-500'
      : 'border-stone-300 dark:border-stone-600 text-stone-900 dark:text-stone-100 focus:ring-blue-500/25 focus:border-blue-500';

  const handleFoodSlotChange = useCallback((key: keyof FoodFamilyCounts, value: string) => {
    const cleaned = value.replace(/[^\d]/g, '');
    setFoodLockedByUser(true);
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
        const list = (brands || []).filter((b) => b && !b.deletedAt);
        // Catálogo + etiquetas ya guardadas en la sesión (por si el listado tarda o falla).
        setBrandLabels({
          ...(session.closingBrandLabels || {}),
          ...buildBrandLabelsMap(list),
        });
        setCatalogBrands(list);
        setBillingSheetsResolved(
          resolveBillingSheetsForClosing(billingConfig?.sheets, list),
        );
        setBillingRules(splitRulesFromBillingConfig(billingConfig));
      })
      .catch(() => {
        if (!cancelled) {
          setBrandLabels({});
          setCatalogBrands([]);
          setBillingSheetsResolved([]);
          setBillingRules(splitRulesFromBillingConfig(null));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, showDeliveryClosingSlots, session.closingBrandLabels]);

  const brandBillingRaw = useMemo(
    () => buildShiftBrandRevenue(session, shiftOrders, brandLabels, billingRules),
    [session, shiftOrders, brandLabels, billingRules],
  );

  const appsBrandBilling = useMemo(
    () => buildShiftAppsBrandTotals(session, shiftOrders, brandLabels, billingRules),
    [session, shiftOrders, brandLabels, billingRules],
  );

  /**
   * 2ª caja = hojas de Facturación (no marcas sueltas).
   * Ejemplo Pau: pizza + Black Burger + tacos → 2 slots; tacos bajo el nombre de Black Burger.
   * Fallback: marcas activas del catálogo → nunca dejar solo «Total app» si hay 2 marcas.
   */
  const closingBrands = useMemo((): ClosingBillingBrandSlot[] => {
    // Siempre por hojas (como prod): tacos van con burger, no fila «Tacos».
    const sheets = billingSheetsResolved.length > 0
      ? billingSheetsResolved
      : suggestBillingSheetsFromBrands(catalogBrands);
    const fromSheets = closingSlotsFromBillingSheets(sheets, catalogBrands);
    if (fromSheets.length > 0) {
      return fromSheets.map((slot) => {
        const slotName = String(slot.name || '').trim();
        const resolved = displayBrandName(slot.brandId, brandLabels, slotName || 'Marca');
        return {
          ...slot,
          name:
            slotName && !looksLikeBrandTechnicalId(slotName)
              ? slotName
              : resolved,
        };
      });
    }

    const fromCatalog = brandsForBilling(catalogBrands)
      .filter((b) => !(isDefaultCommercialBrand(b) && isDefaultBrandNamePlaceholder(b.name)))
      .map((b) => {
        const brandId = String(b.id || b._id || '').trim();
        const rawName = String(b.name || '').trim();
        const name =
          rawName && !looksLikeBrandTechnicalId(rawName)
            ? rawName
            : displayBrandName(brandId, brandLabels, rawName || 'Marca');
        return {
          brandId,
          name,
          memberBrandIds: [brandId],
        };
      })
      .filter((b) => b.brandId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (fromCatalog.length > 0) return fromCatalog;

    // Último recurso: etiquetas ya guardadas en la sesión de caja.
    return Object.entries(brandLabels)
      .filter(([id, name]) => {
        const n = String(name || '').trim();
        return Boolean(id) && n && !looksLikeBrandTechnicalId(n);
      })
      .map(([id, name]) => ({
        brandId: id,
        name: String(name).trim(),
        memberBrandIds: [id],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [billingSheetsResolved, catalogBrands, brandLabels]);

  /** Filas «Por marca» según hojas + regla de sueltos (Facturación). */
  const brandBilling = useMemo(
    () => rollupBrandRevenueToClosingSlots(
      brandBillingRaw,
      closingBrands,
      billingRules,
      brandLabels,
    ),
    [brandBillingRaw, closingBrands, billingRules, brandLabels],
  );

  /** Resumen final con marcas (Caja 1 tienda + Caja 2 apps). */
  const excelDaySummary = useMemo((): ClosingExcelLikeAmounts => {
    const snapshotBrandMap = appsSnapshot?.brandTotalsByChannel;
    let caja2Lines: ClosingBrandLine[] = [];
    if (snapshotBrandMap && Object.keys(snapshotBrandMap).length > 0) {
      const byBrand: Record<string, number> = {};
      for (const perBrand of Object.values(snapshotBrandMap)) {
        if (!perBrand || typeof perBrand !== 'object') continue;
        for (const [brandId, raw] of Object.entries(perBrand)) {
          const n = Number(raw) || 0;
          if (n <= 0) continue;
          byBrand[brandId] = Math.round(((byBrand[brandId] || 0) + n) * 100) / 100;
        }
      }
      const appsRows = Object.entries(byBrand).map(([brandId, revenue]) => ({
        brandId,
        name: displayBrandName(brandId, brandLabels),
        revenue,
      }));
      caja2Lines = sumAppsBrandTotalsBySlot(closingBrands, appsRows, 0);
    }
    if (caja2Lines.length === 0) {
      const scaled = scaleAppsBrandTotalsToAppTotal(
        appsBrandBilling.rows,
        appsBrandBilling.unbranded,
        hechoAppsTotal,
      );
      caja2Lines = sumAppsBrandTotalsBySlot(closingBrands, scaled.rows, scaled.unbranded);
    }
    const brands = mergeClosingBrandLines(brandBilling.rows, caja2Lines, closingBrands);
    return { ...excelDaySummaryBase, brands };
  }, [
    excelDaySummaryBase,
    appsSnapshot?.brandTotalsByChannel,
    closingBrands,
    brandLabels,
    appsBrandBilling.rows,
    appsBrandBilling.unbranded,
    hechoAppsTotal,
    brandBilling.rows,
  ]);

  const closingSlotAliasSet = useCallback((slot: ClosingBillingBrandSlot) => {
    const ids = slot.memberBrandIds?.length ? slot.memberBrandIds : [slot.brandId];
    const aliases = new Set<string>();
    for (const id of ids) {
      for (const a of brandIdAliases(id)) aliases.add(a);
    }
    return aliases;
  }, []);

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-3`}>
      <div
        className="relative bg-white dark:bg-stone-900 sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl flex flex-col min-h-0 h-[100dvh] sm:h-auto sm:max-h-[min(96dvh,920px)]"
      >
        <div className="flex-shrink-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-stone-500 shrink-0" /> Cierre
                {closingMaxStep > 1 ? (
                  <>
                    <span className="font-semibold text-stone-400">
                      {closingStep}/{closingMaxStep}
                    </span>
                    <span className="text-stone-500 font-medium truncate">
                      · {closingStepLabels[closingStep - 1]}
                    </span>
                  </>
                ) : (
                  <span className="text-stone-500 font-medium truncate">
                    · {session.pointOfSaleName || 'Caja'}
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                {closingMaxStep > 1 && session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}
                {session.terminalName}
                {!browserOnline ? ' · Sin red' : ''}
                {draftRestored ? ' · Borrador' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveForLater}
              disabled={busy}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !min-w-9 !px-0 shrink-0`}
              aria-label="Guardar para luego y cerrar"
              title="Guardar para luego"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {closingMaxStep > 1 ? (
          <div className="mt-1.5 flex gap-0.5" role="list" aria-label="Pasos del cierre">
            {closingStepLabels.map((label, i) => {
              const n = i + 1;
              const done = n < closingStep;
              const current = n === closingStep;
              return (
                <button
                  key={`${n}-${label}`}
                  type="button"
                  role="listitem"
                  disabled={busy || n > closingStep}
                  onClick={() => {
                    if (n <= closingStep) goClosingStep(n);
                  }}
                  className={`min-w-0 flex-1 rounded-lg px-0.5 py-1 text-center transition-colors ${
                    current
                      ? 'bg-[var(--v-blue,#2563eb)] text-white'
                      : done
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                        : 'bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500'
                  } ${n <= closingStep && !busy ? 'cursor-pointer' : 'cursor-default'}`}
                  title={`${n}. ${label}`}
                >
                  <span className="block text-[9px] font-black tabular-nums leading-none opacity-80">
                    {n}
                  </span>
                  <span className="block text-[9px] font-bold truncate leading-tight mt-0.5">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          ) : null}
        </div>

        <div
          ref={bodyScrollRef}
          className="flex-1 min-h-0 overflow-hidden px-2 py-1.5 flex flex-col"
        >
          {restaurantWarnings.length > 0 && closingStep === 1 ? (
            <div className="shrink-0 mb-1 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-2 py-1.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> Sala pendiente
              </p>
              {restaurantWarnings.map((w) => (
                <p key={w} className="pl-4 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
                  {w}
                </p>
              ))}
            </div>
          ) : null}

          {/* Delivery paso 1 — Caja 1 (tienda / TPV) */}
          {showDeliveryClosingSlots && closingStep === 1 ? (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto overscroll-contain pb-1">
              <div className="shrink-0">
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  Vertial · Tienda
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  Lo cobrado en el TPV del local (efectivo y tarjeta). Contar el cajón es al final.
                </p>
              </div>

              <div className="shrink-0 grid grid-cols-2 gap-2">
                <div className={`rounded-xl border ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} px-3 py-2`}>
                  <p className={`text-[10px] font-semibold flex items-center gap-1 ${VERTIAL_CASH_TEXT}`}>
                    <Banknote className="w-3.5 h-3.5" /> Efectivo
                  </p>
                  <p className={`text-xl font-black tabular-nums tracking-tight ${VERTIAL_CASH_TEXT}`}>
                    {formatMoneyEs(summary.salesByMethod.efectivo)}
                  </p>
                  <p className="text-[10px] text-stone-500 mt-0.5">Cobrado en TPV</p>
                </div>
                <div className={`rounded-xl border ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} px-3 py-2`}>
                  <p className={`text-[10px] font-semibold flex items-center gap-1 ${VERTIAL_CARD_TEXT}`}>
                    <CreditCard className="w-3.5 h-3.5" /> Tarjeta
                  </p>
                  <p className={`text-xl font-black tabular-nums tracking-tight ${VERTIAL_CARD_TEXT}`}>
                    {formatMoneyEs(summary.salesByMethod.tarjeta)}
                  </p>
                  <p className="text-[10px] text-stone-500 mt-0.5">Cobrado en TPV</p>
                </div>
              </div>

              <div className="shrink-0">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    Unidades del turno
                  </p>
                  {shiftOrdersLoading ? (
                    <span className="text-[10px] font-semibold text-stone-400 animate-pulse">
                      Cargando ventas…
                    </span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] font-semibold tabular-nums text-stone-400">
                      <span>Sistema</span>
                      <DeliveryFoodUnitLabel unit="pizza" count={tpvSystemFood.pizza} size="xs" />
                      <DeliveryFoodUnitLabel unit="burger" count={tpvSystemFood.burger} size="xs" />
                      <DeliveryFoodUnitLabel unit="taco" count={tpvSystemFood.taco} size="xs" />
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'pizza' as const, label: 'Pizzas' },
                    { key: 'burger' as const, label: 'Burgers' },
                    { key: 'taco' as const, label: 'Tacos' },
                  ]).map((u) => (
                    <label
                      key={u.key}
                      className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950/40 px-2 py-1.5 flex flex-col gap-1 cursor-text"
                    >
                      <span className="text-[10px] font-semibold text-stone-500 inline-flex items-center gap-1">
                        <DeliveryFoodUnitIcon unit={u.key} className="w-3.5 h-3.5" />
                        {u.label}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={shiftOrdersLoading ? '…' : '0'}
                        disabled={busy || shiftOrdersLoading}
                        value={manualFood[u.key]}
                        onChange={(e) => handleFoodSlotChange(u.key, e.target.value)}
                        className="w-full min-h-10 px-1.5 py-1 text-base font-black tabular-nums border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="shrink-0">
                <ShiftBrandBillingSummary
                  rows={brandBilling.rows}
                  unbranded={brandBilling.unbranded}
                  total={brandBilling.total}
                  loading={shiftOrdersLoading}
                  dense
                  title="Vertial · por marca"
                />
              </div>
            </div>
          ) : null}

          {/* Apps: montado siempre (snapshot); visible en pasos Glovo/Uber/Just/Flip */}
          {showDeliveryClosingSlots ? (
            <div
              className={
                isDeliveryAppsStep
                  ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
                  : 'hidden'
              }
              aria-hidden={!isDeliveryAppsStep}
            >
              <AggregatorClosingEditor
                autoRows={aggregatorRows}
                foodByChannel={foodReport.byAggregator}
                initialManualDraft={
                  savedDraft?.appsManualDraft && Object.keys(savedDraft.appsManualDraft).length > 0
                    ? savedDraft.appsManualDraft
                    : appsManualDraft && Object.keys(appsManualDraft).length > 0
                      ? appsManualDraft
                      : null
                }
                onSnapshotChange={handleAppsSnapshotChange}
                onManualDraftChange={handleAppsManualDraftChange}
                title="Apps"
                startStep={2}
                appsBrandRows={appsBrandBilling.rows}
                appsBrandUnbranded={appsBrandBilling.unbranded}
                closingBrands={closingBrands}
                dense
                fillHeight
                focusChannel={focusAppChannel}
              />
            </div>
          ) : null}

          {/* Bar/restaurante — 1 caja, un solo paso (como delivery cierre, sin apps ni billetes) */}
          {isRestaurantCierreStep ? (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto overscroll-contain pb-1">
              <div className="shrink-0 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Caja
                    </p>
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      Lo cobrado en el TPV
                    </p>
                  </div>
                  <p className="text-lg font-black tabular-nums text-stone-900 dark:text-stone-50">
                    {formatMoneyEs(summary.totalSales)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-xl border ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} px-3 py-2`}>
                    <p className={`text-[10px] font-semibold flex items-center gap-1 ${VERTIAL_CASH_TEXT}`}>
                      <Banknote className="w-3.5 h-3.5" /> Efectivo
                    </p>
                    <p className={`text-xl font-black tabular-nums tracking-tight ${VERTIAL_CASH_TEXT}`}>
                      {formatMoneyEs(summary.salesByMethod.efectivo)}
                    </p>
                  </div>
                  <div className={`rounded-xl border ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} px-3 py-2`}>
                    <p className={`text-[10px] font-semibold flex items-center gap-1 ${VERTIAL_CARD_TEXT}`}>
                      <CreditCard className="w-3.5 h-3.5" /> Tarjeta
                    </p>
                    <p className={`text-xl font-black tabular-nums tracking-tight ${VERTIAL_CARD_TEXT}`}>
                      {formatMoneyEs(summary.salesByMethod.tarjeta)}
                    </p>
                  </div>
                </div>
                {(summary.salesByMethod.bizum || 0) + (summary.salesByMethod.otro || 0) > 0 ? (
                  <div className="flex justify-between gap-2 text-[11px] text-stone-500">
                    <span>Bizum / otros</span>
                    <span className="font-bold tabular-nums">
                      {formatMoneyEs(
                        (summary.salesByMethod.bizum || 0) + (summary.salesByMethod.otro || 0),
                      )}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="shrink-0">
                <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Contar el cajón</p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  Indica el efectivo que hay ahora en caja (sin contar billete a billete).
                </p>
              </div>

              <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 p-3 space-y-3">
                <label className="block cursor-text">
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${VERTIAL_CASH_TEXT}`}>
                    <Banknote className="w-3.5 h-3.5" /> Efectivo contado
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
                    className={`mt-1.5 w-full min-h-14 px-3 py-2 text-3xl font-black tabular-nums tracking-tight border ${VERTIAL_CASH_BORDER} rounded-xl ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT} focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500`}
                  />
                </label>

                <div className={`flex justify-between gap-2 items-baseline ${VERTIAL_CASH_TEXT}`}>
                  <span className="font-bold text-[12px]">Esperado en cajón</span>
                  <span className="text-xl font-black tabular-nums">{formatMoneyEs(expected)}</span>
                </div>

                {countedTotal > 0 ? (
                  <div className={`px-3 py-2 rounded-xl border ${diff === 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100 inline-flex items-center gap-1.5">
                        {diff === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                        {diff === 0 ? 'Cuadra' : diff > 0 ? 'Sobra' : 'Falta'}
                      </span>
                      <span className={`text-lg font-black tabular-nums ${diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}`}>
                        {diff >= 0 ? '+' : ''}{formatMoneyEs(diff)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2.5 space-y-1 text-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Cómo sale el efectivo en caja
                </p>
                <div className="flex justify-between gap-2 text-stone-500">
                  <span>Fondo apertura</span>
                  <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {formatMoneyEs(session.initialCashAmount)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>+ Cobros efectivo</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.efectivo)}</span>
                </div>
                {cashStaffConsumption > 0 ? (
                  <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                    <span>+ Consumo equipo</span>
                    <span className="font-semibold tabular-nums">{formatMoneyEs(cashStaffConsumption)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>+ Entradas</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.totalCashIn)}</span>
                </div>
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>− Devoluciones</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(cashReturnsTotal)}</span>
                </div>
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>− Salidas</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.totalCashOut)}</span>
                </div>
                <div className="border-t border-stone-100 dark:border-stone-800 pt-1.5 flex justify-between gap-2 font-bold text-stone-900 dark:text-stone-100">
                  <span>= Esperado en cajón</span>
                  <span className="tabular-nums">{formatMoneyEs(expectedTpv)}</span>
                </div>
              </div>

              {(() => {
                const cashOps = session.transactions.filter((t) => isTpvCashMovementTx(t.type));
                const voided = (session.voidedCashMovements || []).slice().sort(
                  (a, b) => new Date(a.voidedAt).getTime() - new Date(b.voidedAt).getTime(),
                );
                const totalShown = cashOps.length + voided.length;
                return (
                  <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCashMovesOpen((v) => !v)}
                      aria-expanded={cashMovesOpen}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/50 transition-colors"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Movimientos de caja ({totalShown})
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500">
                        {cashMovesOpen ? 'Ocultar' : 'Ver'}
                        {cashMovesOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>
                    {cashMovesOpen ? (
                      totalShown === 0 ? (
                        <p className="border-t border-stone-100 px-3 py-2.5 text-xs text-stone-400 dark:border-stone-800">
                          Sin entradas ni salidas en este turno
                        </p>
                      ) : (
                      <div className="space-y-1 border-t border-stone-100 px-3 py-2.5 dark:border-stone-800 max-h-44 overflow-y-auto">
                        {[...cashOps].reverse().map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-900"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-stone-400 mr-1.5">
                                {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                              </span>
                              <span className="font-semibold text-stone-700 dark:text-stone-200">
                                {cashMovementLabel(tx)}
                              </span>
                              {tx.description ? (
                                <span className="text-stone-500 ml-1.5 truncate">{tx.description}</span>
                              ) : null}
                            </div>
                            <span className={`shrink-0 font-black tabular-nums ${
                              tx.type === 'cash_in' || tx.type === 'sale'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }`}>
                              {tx.type === 'cash_out' || tx.type === 'return' ? '−' : '+'}
                              {formatMoneyEs(tx.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                      )
                    ) : null}
                  </div>
                );
              })()}

              <div className={`shrink-0 rounded-2xl border px-3 py-3 space-y-2 ${nextDayFondoCardClass}`}>
                <div>
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    nextDayFondoHighlight && !nextDayInitialReady
                      ? 'text-amber-900 dark:text-amber-100'
                      : 'text-stone-800 dark:text-stone-100'
                  }`}>
                    <Banknote className={`w-3.5 h-3.5 ${
                      nextDayFondoHighlight && !nextDayInitialReady
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`} />
                    Fondo que queda para mañana *
                  </span>
                  <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400 leading-snug">
                    ¿Cuánto efectivo dejas en el cajón? Ese importe será el fondo al abrir.
                  </p>
                </div>
                <CashCountGrid compact counts={fondoCounts} onChange={handleFondoCountsChange} />
                <label className="block cursor-text">
                  <span className="sr-only">Importe del fondo</span>
                  <input
                    ref={nextDayInitialInputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej. 100,00"
                    value={nextDayInitialSlot}
                    onChange={(e) => handleNextDayInitialChange(e.target.value)}
                    className={`w-full min-h-14 px-3 py-2 text-3xl font-black tabular-nums tracking-tight border rounded-xl bg-white dark:bg-stone-950 focus:outline-none focus:ring-2 ${nextDayFondoInputClass}`}
                  />
                </label>
                {nextDayInitialReady ? (
                  <p className="text-sm font-black tabular-nums text-stone-800 dark:text-stone-100">
                    Quedan {formatMoneyEs(nextDayInitialAmount)}
                    {countedTotal > 0 && Math.abs(nextDayInitialAmount - countedTotal) > 0.009 ? (
                      nextDayInitialAmount > countedTotal ? (
                        <span className="ml-1.5 font-semibold text-amber-800 dark:text-amber-200">
                          · falta meter {formatMoneyEs(nextDayInitialAmount - countedTotal)}
                        </span>
                      ) : (
                        <span className="ml-1.5 font-semibold text-rose-600 dark:text-rose-400">
                          · se retira {formatMoneyEs(countedTotal - nextDayInitialAmount)}
                        </span>
                      )
                    ) : null}
                  </p>
                ) : (
                  <p className={`text-[11px] font-semibold ${
                    nextDayFondoHighlight
                      ? 'text-amber-800 dark:text-amber-200'
                      : 'text-stone-500'
                  }`}>
                    {nextDayFondoHighlight
                      ? 'Obligatorio: indica el fondo que queda en caja.'
                      : 'Indica el importe para poder cerrar.'}
                  </p>
                )}
                {countedTotal > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNextDayInitialSlot(countedTotal.toFixed(2));
                      setFondoCounts(buildDenominationFromAmount(countedTotal));
                    }}
                    className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 underline"
                  >
                    Usar el contado ({formatMoneyEs(countedTotal)})
                  </button>
                ) : null}
              </div>

              <input
                type="text"
                className="w-full min-h-9 px-2.5 py-1.5 border border-stone-200 dark:border-stone-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-xs"
                placeholder="Notas (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          ) : null}

          {/* Delivery paso final — Contar cajón + resumen limpio */}
          {isDeliveryCierreStep ? (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto overscroll-contain pb-1">
              {/* Detalle Caja 1 / Caja 2 */}
              <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Vertial
                      </p>
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                        Tienda (TPV)
                      </p>
                    </div>
                    <p className="text-lg font-black tabular-nums text-stone-900 dark:text-stone-50">
                      {formatMoneyEs(caja1Total)}
                    </p>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className={`flex justify-between gap-2 ${VERTIAL_CASH_TEXT}`}>
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Banknote className="w-3 h-3" /> Efectivo
                      </span>
                      <span className="font-black tabular-nums">
                        {formatMoneyEs(summary.salesByMethod.efectivo)}
                      </span>
                    </div>
                    <div className={`flex justify-between gap-2 ${VERTIAL_CARD_TEXT}`}>
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <CreditCard className="w-3 h-3" /> Tarjeta
                      </span>
                      <span className="font-black tabular-nums">
                        {formatMoneyEs(summary.salesByMethod.tarjeta)}
                      </span>
                    </div>
                    {(summary.salesByMethod.bizum || 0) + (summary.salesByMethod.otro || 0) > 0 ? (
                      <div className="flex justify-between gap-2 text-stone-500">
                        <span>Bizum / otros</span>
                        <span className="font-bold tabular-nums">
                          {formatMoneyEs(
                            (summary.salesByMethod.bizum || 0) + (summary.salesByMethod.otro || 0),
                          )}
                        </span>
                      </div>
                    ) : null}
                    {aggregatorCashTotal > 0 ? (
                      <div className={`flex justify-between gap-2 ${VERTIAL_CASH_TEXT}`}>
                        <span className="font-semibold">No pagado efectivo → cajón</span>
                        <span className="font-black tabular-nums">
                          {formatMoneyEs(aggregatorCashTotal)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={`rounded-xl border px-2.5 py-2 ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG}`}
                  >
                    <div className={`flex items-center justify-between gap-2 ${VERTIAL_CARD_TEXT}`}>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                        <CreditCard className="w-3.5 h-3.5" />
                        Tarjeta no pagado
                      </span>
                      <span className="text-base font-black tabular-nums">
                        {formatMoneyEs(aggregatorCardTotal)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">
                      Apps · no suma al total (ya en integradores)
                    </p>
                  </div>
                  {brandBilling.rows.length > 0 ? (
                    <div className="border-t border-stone-100 dark:border-stone-800 pt-1.5 space-y-1">
                      {brandBilling.rows.map((row) => {
                        const cash = Number(row.revenueEfectivo) || 0;
                        const card = Number(row.revenueTarjeta) || 0;
                        return (
                          <div
                            key={row.brandId}
                            className="flex items-start justify-between gap-2 rounded-lg bg-stone-50 px-2 py-1.5 dark:bg-stone-900/70"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-bold text-stone-900 dark:text-stone-100">
                                {row.name}
                              </p>
                              <p className="text-[10px] font-semibold tabular-nums leading-snug">
                                <span className={VERTIAL_CASH_TEXT}>
                                  Efectivo {formatMoneyEs(cash)}
                                </span>
                                <span className="mx-1 text-stone-300">·</span>
                                <span className={VERTIAL_CARD_TEXT}>
                                  Tarjeta {formatMoneyEs(card)}
                                </span>
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-black tabular-nums text-stone-900 dark:text-stone-50">
                              {formatMoneyEs(row.revenue)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-stone-500">
                    <DeliveryFoodUnitLabel unit="pizza" count={tpvClosingFood.pizza} size="xs" />
                    <DeliveryFoodUnitLabel unit="burger" count={tpvClosingFood.burger} size="xs" />
                    <DeliveryFoodUnitLabel unit="taco" count={tpvClosingFood.taco} size="xs" />
                    <span className="font-semibold text-stone-500 tabular-nums">
                      ·{' '}
                      {tpvClosingFood.pizza + tpvClosingFood.burger + tpvClosingFood.taco}{' '}
                      uds
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 px-3 py-2.5 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600/80 dark:text-blue-300/80">
                        Integraciones
                      </p>
                      <p className="text-sm font-bold text-blue-950 dark:text-blue-50">
                        Hecho en app
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black tabular-nums text-blue-950 dark:text-blue-50 leading-none">
                        {formatMoneyEs(integratorsTotal)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    {(appsSnapshot?.rows?.length
                      ? appsSnapshot.rows
                      : finalAggregatorRows
                    ).map((r) => {
                      const amt = Number(r.totalSales) || 0;
                      if (amt <= 0) return null;
                      return (
                        <div
                          key={r.platform.channel}
                          className="flex justify-between gap-2 text-blue-900/80 dark:text-blue-100/80"
                        >
                          <span className="font-semibold truncate">{r.platform.label}</span>
                          <span className="font-black tabular-nums shrink-0">
                            {formatMoneyEs(amt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {appsBrandBilling.rows.length > 0 ? (
                    <div className="border-t border-blue-200/60 dark:border-blue-900/40 pt-1.5 space-y-0.5">
                      {appsBrandBilling.rows.map((row) => (
                        <div
                          key={row.brandId}
                          className="flex justify-between gap-2 text-[10px] text-blue-900/70 dark:text-blue-100/70"
                        >
                          <span className="truncate font-medium">{row.name}</span>
                          <span className="shrink-0 tabular-nums font-bold">
                            {formatMoneyEs(row.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-blue-700/70 dark:text-blue-200/60">
                    <DeliveryFoodUnitLabel unit="pizza" count={appsFoodTotals.pizza} size="xs" muted />
                    <DeliveryFoodUnitLabel unit="burger" count={appsFoodTotals.burger} size="xs" muted />
                    <DeliveryFoodUnitLabel unit="taco" count={appsFoodTotals.taco} size="xs" muted />
                    <span className="ml-0.5 font-semibold text-blue-800/80 dark:text-blue-100/80 tabular-nums">
                      ·{' '}
                      {appsFoodTotals.pizza + appsFoodTotals.burger + appsFoodTotals.taco}{' '}
                      uds
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Contar el cajón</p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  Esperado cajón = efectivo TPV + no pagado efectivo apps. El no pagado no infla el total de Vertial (ya va en Glovo/Uber/…).
                </p>
              </div>

              <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 p-3 space-y-3">
                <label className="block cursor-text">
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${VERTIAL_CASH_TEXT}`}>
                    <Banknote className="w-3.5 h-3.5" /> Efectivo contado
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
                    className={`mt-1.5 w-full min-h-14 px-3 py-2 text-3xl font-black tabular-nums tracking-tight border ${VERTIAL_CASH_BORDER} rounded-xl ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT} focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500`}
                  />
                </label>

                <div className="space-y-1 text-[12px]">
                  <div className="flex justify-between gap-2 items-baseline text-stone-600 dark:text-stone-300">
                    <span>Efectivo Vertial (TPV)</span>
                    <span className="font-bold tabular-nums">{formatMoneyEs(expectedTpv)}</span>
                  </div>
                  <div className="flex justify-between gap-2 items-baseline text-stone-600 dark:text-stone-300">
                    <span>+ No pagado efectivo apps</span>
                    <span className="font-bold tabular-nums">{formatMoneyEs(aggregatorCashTotal)}</span>
                  </div>
                  <div className={`flex justify-between gap-2 items-baseline border-t border-stone-100 dark:border-stone-800 pt-1.5 ${VERTIAL_CASH_TEXT}`}>
                    <span className="font-bold">Esperado en cajón</span>
                    <span className="text-xl font-black tabular-nums">{formatMoneyEs(expected)}</span>
                  </div>
                </div>

                {countedTotal > 0 ? (
                  <div className={`px-3 py-2 rounded-xl border ${diff === 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100 inline-flex items-center gap-1.5">
                        {diff === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                        {diff === 0 ? 'Cuadra' : diff > 0 ? 'Sobra' : 'Falta'}
                      </span>
                      <span className={`text-lg font-black tabular-nums ${diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}`}>
                        {diff >= 0 ? '+' : ''}{formatMoneyEs(diff)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Cómo se forma el efectivo TPV + movimientos (arriba, no escondido) */}
              <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2.5 space-y-1 text-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Cómo sale el efectivo TPV
                </p>
                <div className="flex justify-between gap-2 text-stone-500">
                  <span>Fondo apertura</span>
                  <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {formatMoneyEs(session.initialCashAmount)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>+ Cobros efectivo</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.efectivo)}</span>
                </div>
                {cashStaffConsumption > 0 ? (
                  <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                    <span>+ Consumo equipo</span>
                    <span className="font-semibold tabular-nums">{formatMoneyEs(cashStaffConsumption)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>+ Entradas</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.totalCashIn)}</span>
                </div>
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>− Devoluciones</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(cashReturnsTotal)}</span>
                </div>
                <div className="flex justify-between gap-2 text-stone-600 dark:text-stone-300">
                  <span>− Salidas</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.totalCashOut)}</span>
                </div>
                <div className="border-t border-stone-100 dark:border-stone-800 pt-1.5 flex justify-between gap-2 font-bold text-stone-900 dark:text-stone-100">
                  <span>= Efectivo TPV</span>
                  <span className="tabular-nums">{formatMoneyEs(expectedTpv)}</span>
                </div>
              </div>

              {(() => {
                const cashOps = session.transactions.filter((t) => isTpvCashMovementTx(t.type));
                const voided = (session.voidedCashMovements || []).slice().sort(
                  (a, b) => new Date(a.voidedAt).getTime() - new Date(b.voidedAt).getTime(),
                );
                if (cashOps.length === 0 && voided.length === 0) return null;
                const totalShown = cashOps.length + voided.length;
                return (
                  <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCashMovesOpen((v) => !v)}
                      aria-expanded={cashMovesOpen}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/50 transition-colors"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Movimientos de caja ({totalShown})
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500">
                        {cashMovesOpen ? 'Ocultar' : 'Ver'}
                        {cashMovesOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>
                    {cashMovesOpen ? (
                      <div className="space-y-2 border-t border-stone-100 px-3 py-2.5 dark:border-stone-800">
                        {cashOps.length > 0 ? (
                          <div className="space-y-1 max-h-44 overflow-y-auto">
                            {[...cashOps].reverse().map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-900"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-stone-400 mr-1.5">
                                    {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                                  </span>
                                  <span className="font-semibold text-stone-700 dark:text-stone-200">
                                    {cashMovementLabel(tx)}
                                  </span>
                                  {tx.description ? (
                                    <span className="text-stone-500 ml-1.5 truncate">{tx.description}</span>
                                  ) : null}
                                </div>
                                <span className="shrink-0 font-bold tabular-nums">
                                  {tx.type === 'cash_in' ? '+' : '−'}
                                  {formatMoneyEs(tx.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {voided.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 mb-1.5">
                              Movimientos eliminados ({voided.length})
                            </p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {voided.map((v) => (
                                <div
                                  key={v.id}
                                  className="text-xs p-2 rounded-lg border border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/30"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-stone-800 dark:text-stone-100">
                                        {TPV_CASH_TX_LABELS[v.type] || v.type} anulada
                                        {v.originalDescription ? ` · ${v.originalDescription}` : ''}
                                      </p>
                                      <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5 break-words">
                                        Motivo: {v.voidReason}
                                      </p>
                                    </div>
                                    <span className="shrink-0 font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                                      {v.type === 'cash_in' ? '+' : '−'}
                                      {formatMoneyEs(Number(v.amount || 0))}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Unidades = Tienda (paso 1) + Glovo+Uber+Just+Flip (pasos 2–5) */}
              <div className="shrink-0 rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/40 px-3 py-2.5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Unidades del día · todo lo hecho
                    </p>
                    <div className="text-[10px] text-stone-500 mt-0.5 leading-snug space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Vertial</span>
                        <DeliveryFoodUnitLabel unit="pizza" count={tpvClosingFood.pizza} size="xs" />
                        <DeliveryFoodUnitLabel unit="burger" count={tpvClosingFood.burger} size="xs" />
                        <DeliveryFoodUnitLabel unit="taco" count={tpvClosingFood.taco} size="xs" />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">Integraciones</span>
                        <DeliveryFoodUnitLabel unit="pizza" count={appsFoodTotals.pizza} size="xs" />
                        <DeliveryFoodUnitLabel unit="burger" count={appsFoodTotals.burger} size="xs" />
                        <DeliveryFoodUnitLabel unit="taco" count={appsFoodTotals.taco} size="xs" />
                      </div>
                    </div>
                  </div>
                  <p className="shrink-0 text-[11px] font-black tabular-nums text-stone-700 dark:text-stone-200">
                    {closingFood.pizza + closingFood.burger + closingFood.taco} uds
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'pizza' as const, label: 'Pizzas' },
                    { key: 'burger' as const, label: 'Burgers' },
                    { key: 'taco' as const, label: 'Tacos' },
                  ]).map((u) => (
                    <div
                      key={u.key}
                      className="rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 px-2 py-2 text-center"
                    >
                      <p className="text-[10px] font-semibold text-stone-500">{u.label}</p>
                      <p className="mt-0.5 inline-flex items-center justify-center gap-1.5 text-2xl font-black tabular-nums text-stone-900 dark:text-stone-50 leading-none">
                        {closingFood[u.key]}
                        <DeliveryFoodUnitIcon unit={u.key} className="w-5 h-5" />
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <input
                type="text"
                className="shrink-0 w-full min-h-10 px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm"
                placeholder="Notas (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              {/* Resumen final — misma fila que el Excel de Facturación */}
              <div className="shrink-0 space-y-2">
                <ClosingExcelLikeSummary amounts={excelDaySummary} brandLabels={brandLabels} />
                <p className="text-[11px] text-stone-500 px-0.5 tabular-nums">
                  Comprobación: Vertial {formatMoneyEs(caja1Total)} + Integraciones {formatMoneyEs(integratorsTotal)}
                  {' = '}
                  <strong className="text-stone-800 dark:text-stone-100">{formatMoneyEs(dayMoneyTotal)}</strong>
                  {dayCardCollected > 0 ? (
                    <>
                      {' · '}
                      <span className={VERTIAL_CARD_TEXT}>Tarjeta cobrada {formatMoneyEs(dayCardCollected)}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowExtraDetail((v) => !v)}
                className={`shrink-0 w-full min-h-10 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between touch-manipulation border ${
                  showExtraDetail
                    ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-500'
                    : 'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  {showExtraDetail ? 'Ocultar detalle del turno' : 'Detalle del turno'}
                </span>
                {showExtraDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showExtraDetail ? (
                <div className="rounded-xl border-2 border-[var(--v-blue,#2563eb)]/40 bg-blue-50/50 dark:bg-blue-950/20 p-2.5 space-y-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="p-2 rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40">
                      <div className="text-[10px] text-zinc-500">Ventas TPV</div>
                      <div className="text-sm font-semibold tabular-nums">{formatMoneyEs(summary.totalSales)}</div>
                    </div>
                    <div className="p-2 rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40">
                      <div className="text-[10px] text-zinc-500">Devoluciones</div>
                      <div className="text-sm font-semibold tabular-nums">{formatMoneyEs(summary.totalReturns)}</div>
                    </div>
                    <div className="p-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
                      <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Entradas</div>
                      <div className="text-sm font-black tabular-nums text-emerald-800 dark:text-emerald-200">{formatMoneyEs(summary.totalCashIn)}</div>
                    </div>
                    <div className="p-2 rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40">
                      <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">Salidas</div>
                      <div className="text-sm font-black tabular-nums text-rose-800 dark:text-rose-200">{formatMoneyEs(summary.totalCashOut)}</div>
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap text-[11px]">
                    {summary.salesByMethod.efectivo > 0 ? (
                      <span className={`px-2 py-1 rounded-md font-semibold border tabular-nums ${VERTIAL_CASH_BORDER} ${VERTIAL_CASH_BG} ${VERTIAL_CASH_TEXT}`}>
                        Efectivo: {formatMoneyEs(summary.salesByMethod.efectivo)}
                      </span>
                    ) : null}
                    {summary.salesByMethod.tarjeta > 0 ? (
                      <span className={`px-2 py-1 rounded-md font-semibold border tabular-nums ${VERTIAL_CARD_BORDER} ${VERTIAL_CARD_BG} ${VERTIAL_CARD_TEXT}`}>
                        Tarjeta: {formatMoneyEs(summary.salesByMethod.tarjeta)}
                      </span>
                    ) : null}
                    {summary.salesByMethod.bizum > 0 ? (
                      <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                        Bizum: {formatMoneyEs(summary.salesByMethod.bizum)}
                      </span>
                    ) : null}
                    {summary.salesByMethod.online > 0 ? (
                      <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                        Online: {formatMoneyEs(summary.salesByMethod.online)}
                      </span>
                    ) : null}
                    <span className="px-2 py-1 rounded-md font-medium border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                      {summary.totalTransactions} operaciones
                    </span>
                  </div>

                  <RegisterShiftSalesBreakdown
                    session={session}
                    orders={shiftOrders}
                    loading={shiftOrdersLoading}
                    registerSummary={summary}
                  />

                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Billetes / monedas (opcional)
                    </h4>
                    <CashCountGrid
                      compact
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

                  {session.cashCounts.length > 0 ? (
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Arqueos del turno
                      </h4>
                      <div className="space-y-1">
                        {session.cashCounts.map((cc) => (
                          <div
                            key={cc.id}
                            className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg gap-2"
                          >
                            <span className="text-gray-500 truncate">
                              {new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}
                            </span>
                            <span className="font-semibold tabular-nums shrink-0">
                              {cc.difference >= 0 ? '+' : ''}
                              {formatMoneyEs(cc.difference)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(session.incidents?.length || 0) > 0 ? (
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Incidencias ({session.incidents!.length})
                      </h4>
                      <div className="space-y-1">
                        {session.incidents!.map((inc) => (
                          <div
                            key={inc.id}
                            className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg gap-2"
                          >
                            <span className="text-gray-600 truncate">{inc.description}</span>
                            {inc.amount != null ? (
                              <span className="font-semibold tabular-nums shrink-0">{formatMoneyEs(inc.amount)}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={`shrink-0 rounded-2xl border px-3 py-3 space-y-2 ${nextDayFondoCardClass}`}>
                <div>
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    nextDayFondoHighlight && !nextDayInitialReady
                      ? 'text-amber-900 dark:text-amber-100'
                      : 'text-stone-800 dark:text-stone-100'
                  }`}>
                    <Banknote className={`w-3.5 h-3.5 ${
                      nextDayFondoHighlight && !nextDayInitialReady
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`} />
                    Fondo que queda en caja *
                  </span>
                  <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400 leading-snug">
                    ¿Cuánto efectivo dejas en el cajón? Ese importe será el fondo al abrir.
                  </p>
                </div>
                <CashCountGrid compact counts={fondoCounts} onChange={handleFondoCountsChange} />
                <label className="block cursor-text">
                  <span className="sr-only">Importe del fondo</span>
                  <input
                    ref={nextDayInitialInputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej. 100,00"
                    value={nextDayInitialSlot}
                    onChange={(e) => handleNextDayInitialChange(e.target.value)}
                    className={`w-full min-h-14 px-3 py-2 text-3xl font-black tabular-nums tracking-tight border rounded-xl bg-white dark:bg-stone-950 focus:outline-none focus:ring-2 ${nextDayFondoInputClass}`}
                  />
                </label>
                {nextDayInitialReady ? (
                  <p className="text-sm font-black tabular-nums text-stone-800 dark:text-stone-100">
                    Quedan {formatMoneyEs(nextDayInitialAmount)}
                    {countedTotal > 0 && Math.abs(nextDayInitialAmount - countedTotal) > 0.009 ? (
                      nextDayInitialAmount > countedTotal ? (
                        <span className="ml-1.5 font-semibold text-amber-800 dark:text-amber-200">
                          · falta meter {formatMoneyEs(nextDayInitialAmount - countedTotal)}
                        </span>
                      ) : (
                        <span className="ml-1.5 font-semibold text-rose-600 dark:text-rose-400">
                          · se retira {formatMoneyEs(countedTotal - nextDayInitialAmount)}
                        </span>
                      )
                    ) : null}
                  </p>
                ) : (
                  <p className={`text-[11px] font-semibold ${
                    nextDayFondoHighlight
                      ? 'text-amber-800 dark:text-amber-200'
                      : 'text-stone-500'
                  }`}>
                    {nextDayFondoHighlight
                      ? 'Obligatorio: indica el fondo que queda en caja.'
                      : 'Indica el importe para poder cerrar.'}
                  </p>
                )}
                {countedTotal > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNextDayInitialSlot(countedTotal.toFixed(2));
                      setFondoCounts(buildDenominationFromAmount(countedTotal));
                    }}
                    className="text-[11px] font-bold text-[#2563EB] underline"
                  >
                    Usar el contado ({formatMoneyEs(countedTotal)})
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-shrink-0 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex gap-1.5">
            {closingStep > 1 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => goClosingStep(closingStep - 1)}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-11 min-w-[5.5rem]`}
              >
                <ChevronLeft className="w-4 h-4" />
                Atrás
              </button>
            ) : null}
            {closingStep < closingMaxStep ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => goClosingStep(closingStep + 1)}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-11 flex-1`}
              >
                Siguiente
                {closingStepLabels[closingStep] ? (
                  <span className="font-semibold opacity-90">· {closingStepLabels[closingStep]}</span>
                ) : null}
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!nextDayInitialReady) {
                    toast.error('Indica el fondo que queda en caja antes de cerrar');
                    focusNextDayFondo();
                    return;
                  }
                  setConfirmCloseOpen(true);
                }}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-11 flex-1 ${
                  !nextDayInitialReady && !busy
                    ? '!bg-amber-600 hover:!bg-amber-700'
                    : ''
                }`}
              >
                <Lock className="w-4 h-4" />
                {busy
                  ? 'Cerrando…'
                  : !nextDayInitialReady
                    ? 'Falta fondo en caja'
                    : !browserOnline
                      ? 'Confirmar (sin red)'
                      : 'Confirmar cierre'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveForLater}
            disabled={busy}
            className={`${VERTIAL_BTN_SECONDARY} !min-h-11 w-full !text-xs`}
          >
            <Save className="w-3.5 h-3.5" />
            Guardar para luego
          </button>
        </div>

        {confirmCloseOpen ? (
          <div
            className="absolute inset-0 z-20 flex items-end sm:items-center justify-center bg-black/45 p-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-close-title"
          >
            <div className="w-full sm:max-w-lg max-h-[min(92svh,720px)] rounded-2xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-stone-900 shadow-xl overflow-hidden flex flex-col">
              <div className="shrink-0 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                </div>
                <div className="min-w-0">
                  <h3 id="confirm-close-title" className="text-sm font-bold text-amber-950 dark:text-amber-100">
                    ¿Seguro que quieres cerrar la caja?
                  </h3>
                  <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1 leading-snug">
                    Revisa el resumen (como el Excel). Luego solo podrás mirarlo; reabrir es solo si fue un error.
                  </p>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <div className="space-y-2">
                  {showDeliveryClosingSlots ? (
                    <ClosingExcelLikeSummary
                      amounts={excelDaySummary}
                      brandLabels={brandLabels}
                      compact
                    />
                  ) : (
                    <div className="rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2.5 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 font-semibold ${VERTIAL_CASH_TEXT}`}>
                          <Banknote className="w-3.5 h-3.5" /> Efectivo
                        </span>
                        <span className="font-bold tabular-nums">{formatMoneyEs(summary.salesByMethod.efectivo)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 font-semibold ${VERTIAL_CARD_TEXT}`}>
                          <CreditCard className="w-3.5 h-3.5" /> Tarjeta
                        </span>
                        <span className="font-bold tabular-nums">{formatMoneyEs(summary.salesByMethod.tarjeta)}</span>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-stone-100 dark:border-stone-800 pt-1.5">
                        <span className="text-stone-500">Total caja</span>
                        <span className="font-black tabular-nums">{formatMoneyEs(summary.totalSales)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-stone-500">Esperado cajón</span>
                        <span className="font-bold tabular-nums">{formatMoneyEs(expected)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-stone-500">Contado</span>
                        <span className="font-bold tabular-nums">{formatMoneyEs(countedTotal)}</span>
                      </div>
                      <div className="flex justify-between gap-2 font-bold">
                        <span>{diff === 0 ? 'Cuadra' : diff > 0 ? 'Sobra' : 'Falta'}</span>
                        <span className="tabular-nums">{diff >= 0 ? '+' : ''}{formatMoneyEs(diff)}</span>
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/25 px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-100">
                      Fondo para mañana
                    </span>
                    <span className="text-lg font-black tabular-nums text-emerald-950 dark:text-emerald-50">
                      {formatMoneyEs(nextDayInitialAmount)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="shrink-0 p-3 border-t border-stone-200 dark:border-stone-700 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmCloseOpen(false)}
                  className={`${VERTIAL_BTN_SECONDARY} !min-h-11 flex-1`}
                >
                  No, seguir revisando
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmCloseOpen(false);
                    const snapBrands = appsSnapshot?.brandTotalsByChannel || {};
                    const hasSnapBrands = Object.keys(snapBrands).some(
                      (ch) => Object.keys(snapBrands[ch] || {}).length > 0,
                    );
                    // Fallback: lo que se ve en el resumen (sistema/escalado) si el snapshot
                    // de inputs por marca llegó vacío — el cierre NO puede perder marcas.
                    const fallbackChannels = finalAggregatorRows
                      .filter((r) => (Number(r.totalSales) || 0) > 0);
                    const fallbackBrandTotals = hasSnapBrands
                      ? snapBrands
                      : brandTotalsByChannelFromAppsRows(
                        scaleAppsBrandTotalsToAppTotal(
                          appsBrandBilling.rows,
                          appsBrandBilling.unbranded,
                          hechoAppsTotal,
                        ).rows,
                        fallbackChannels.map((r) => r.platform.channel),
                        Object.fromEntries(
                          fallbackChannels.map((r) => [
                            r.platform.channel,
                            Number(r.totalSales) || 0,
                          ]),
                        ),
                      );
                    const labelMap: Record<string, string> = { ...brandLabels };
                    for (const slot of closingBrands) {
                      const n = String(slot.name || '').trim();
                      if (!n || looksLikeBrandTechnicalId(n)) continue;
                      for (const id of brandIdAliases(slot.brandId)) labelMap[id] = n;
                      for (const mid of slot.memberBrandIds || []) {
                        for (const id of brandIdAliases(mid)) labelMap[id] = n;
                      }
                    }
                    for (const row of excelDaySummary.brands || []) {
                      const n = String(row.name || '').trim();
                      if (!n || looksLikeBrandTechnicalId(n)) continue;
                      for (const id of brandIdAliases(row.brandId)) labelMap[id] = n;
                    }
                    onClose(
                      counts,
                      notes,
                      finalAggregatorRows,
                      {
                        pizza: closingFood.pizza,
                        burger: closingFood.burger,
                        taco: closingFood.taco,
                        byChannel: closingFoodByChannel,
                      },
                      {
                        brandTotalsByChannel: fallbackBrandTotals,
                        unpaidCashByBrandByChannel: appsSnapshot?.unpaidCashByBrandByChannel,
                        unpaidCardByBrandByChannel: appsSnapshot?.unpaidCardByBrandByChannel,
                        closingBrandLabels: labelMap,
                        closingBrandSheetIds: (() => {
                          const map: Record<string, string> = {};
                          for (const slot of closingBrands) {
                            const sid = String(slot.sheetId || '').trim();
                            if (!sid) continue;
                            for (const id of brandIdAliases(slot.brandId)) map[id] = sid;
                            for (const mid of slot.memberBrandIds || []) {
                              for (const id of brandIdAliases(mid)) map[id] = sid;
                            }
                          }
                          return map;
                        })(),
                        brandTpvTotals: (() => {
                          const totals = closingBrandTpvTotalsFromBillingRows(
                            brandBilling.rows,
                            tpvCashSales,
                            tpvCardSales,
                          );
                          if (Object.keys(totals).length === 0) return undefined;
                          return totals;
                        })(),
                      },
                      nextDayInitialAmount,
                    );
                  }}
                  className={`${VERTIAL_BTN_PRIMARY} !min-h-11 flex-1 !bg-amber-600 hover:!bg-amber-700`}
                >
                  <Lock className="w-4 h-4" />
                  Sí, cerrar caja
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Fichaje (TPV tablet / mostrador) ───────────────────────────────────────

async function fetchBusinessUsers(businessId: string): Promise<AuthUser[]> {
  try {
    const data = await listUsersRequest(businessId);
    return data.users || [];
  } catch (primaryErr) {
    try {
      const biz = await getBusinessRequest(businessId);
      const business = biz.business;
      const fromMembers = (business?.members || []).map((m) => ({
        user_id: m.user_id,
        id: m.user_id,
        fullName: m.fullName,
        email: m.email,
        role: m.role,
        status: 'active' as const,
      }));
      if (fromMembers.length > 0) return fromMembers;
    } catch {
      /* fallback secundario */
    }
    throw primaryErr;
  }
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
  onMemberClockedIn,
  embedded = false,
}: {
  storeLabel: string;
  businessId: string;
  ownerUserId: string;
  pdvId: string;
  workCenterId: string;
  sessionOpenedAt?: string | null;
  onCancel: () => void;
  onChanged?: () => void;
  /** Tras fichar entrada o elegir a alguien ya en turno (quién abre la caja). */
  onMemberClockedIn?: (memberId: string) => void;
  /** Panel dentro de apertura de caja (sin popup a pantalla completa). */
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [team, setTeam] = useState<AuthUser[]>([]);
  const [clockins, setClockins] = useState<ClockinRecord[]>([]);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [vacationBlockedById, setVacationBlockedById] = useState<Record<string, string>>({});
  /** Quién abre la caja (puede estar ya fichado; no hace falta volver a fichar). */
  const [selectedOpenerId, setSelectedOpenerId] = useState('');
  const didAutoSelectOpenerRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!businessId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
      setError('');
    }
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
      if (!silent) {
        const msg = extractErrorMessage(e, 'Error al cargar el equipo para fichar');
        setError(
          msg === 'No se pudo completar la solicitud. Inténtalo de nuevo.'
            ? 'No se pudo cargar el equipo. Recarga la página o vuelve a iniciar sesión.'
            : msg,
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [businessId, ownerUserId, pdvId, workCenterId]);

  const clockinScopeKey = `${businessId}|${ownerUserId}|${pdvId}|${workCenterId}`;
  const clockinScopeKeyRef = useRef('');

  useEffect(() => {
    const scopeChanged = clockinScopeKeyRef.current !== clockinScopeKey;
    clockinScopeKeyRef.current = clockinScopeKey;
    if (scopeChanged) {
      didAutoSelectOpenerRef.current = false;
      setSelectedOpenerId('');
    }
    // Misma tienda: no spinner ni reset (evita pantallazos si el PDV se rehidrata).
    void load({ silent: !scopeChanged });
  }, [clockinScopeKey, load]);

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

  const selectOpener = useCallback(
    (memberId: string, opts?: { silent?: boolean; alreadyOnShift?: boolean }) => {
      const mid = normalizeClockinUserId(memberId);
      if (!mid) return;
      if (vacationBlockedById[mid]) {
        if (!opts?.silent) {
          setActionMsg({ type: 'err', text: vacationBlockedById[mid] });
        }
        return;
      }
      setSelectedOpenerId(mid);
      onMemberClockedIn?.(mid);
      if (!opts?.silent) {
        const member = team.find((m) => memberKey(m) === mid);
        const label = member?.fullName || member?.email || 'Trabajador';
        setActionMsg({
          type: 'ok',
          text: opts?.alreadyOnShift
            ? `${label} abrirá la caja (ya en turno — no hace falta fichar otra vez).`
            : `${label} abrirá la caja (puedes fichar después).`,
        });
      }
    },
    [onMemberClockedIn, team, vacationBlockedById],
  );

  // Embedded: elegir quién abre sin exigir fichaje (turno presente o primer miembro disponible).
  useEffect(() => {
    if (!embedded || loading || didAutoSelectOpenerRef.current) return;
    const present = team
      .map((m) => {
        const mid = memberKey(m);
        const r = todayRecords.get(mid);
        const st = deriveEffectiveClockinStatus(r);
        return mid && isClockinPresent(st) && !vacationBlockedById[mid] ? mid : '';
      })
      .filter(Boolean);
    const available = team
      .map((m) => {
        const mid = memberKey(m);
        return mid && !vacationBlockedById[mid] ? mid : '';
      })
      .filter(Boolean);
    const pool = present.length > 0 ? present : available;
    if (pool.length === 0) return;
    didAutoSelectOpenerRef.current = true;
    const ownerNorm = normalizeClockinUserId(ownerUserId);
    const prefer =
      (selectedOpenerId && pool.includes(selectedOpenerId) && selectedOpenerId)
      || (ownerNorm && pool.includes(ownerNorm) && ownerNorm)
      || pool[0];
    selectOpener(prefer, { silent: true, alreadyOnShift: present.includes(prefer) });
  }, [
    embedded,
    loading,
    team,
    todayRecords,
    vacationBlockedById,
    selectedOpenerId,
    ownerUserId,
    selectOpener,
  ]);

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
    if (actingId) {
      toast.info('Fichando…', { id: 'tpv-clockin-busy', duration: 1200 });
      return;
    }
    setActingId(member.user_id);
    setActionMsg(null);
    let already = false;
    try {
      // GPS opcional y con tope corto: si esperamos 12s el 1er click parece muerto.
      const geo = await Promise.race([
        requestClockinGeo(),
        new Promise<undefined>((resolve) => {
          window.setTimeout(() => resolve(undefined), 600);
        }),
      ]);
      const rec = await clockIn(businessId, mid, member.fullName || member.email || 'Trabajador', {
        device_type: 'tablet',
        sales_point_id: pdvId || undefined,
        sales_point_name: storeLabel || undefined,
        work_center_id: workCenterId || undefined,
        store_team_clockin: true,
        geo,
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
    selectOpener(mid, { silent: true });
    onChanged?.();
    setActingId(null);
  };

  const handleBreak = async (member: AuthUser) => {
    const record = todayRecords.get(memberKey(member));
    if (!record) return;
    setActingId(member.user_id);
    try {
      const geo = await requestClockinGeo();
      if (record.status === 'break' || deriveEffectiveClockinStatus(record) === 'break') {
        await endBreak(record, geo, storeClockinOpts);
        toast.success(`${member.fullName || 'Trabajador'} — descanso finalizado`);
      } else {
        await startBreak(record, geo, storeClockinOpts);
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
      const geo = await requestClockinGeo();
      await clockOut(record, geo, storeClockinOpts);
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

  const panel = (
    <div
      className={
        embedded
          ? 'bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 w-full flex flex-col overflow-hidden min-h-0 flex-1'
          : 'bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-auto flex flex-col overflow-hidden max-h-[min(92svh,720px)] sm:max-h-[min(88svh,680px)]'
      }
    >
        <div className={`border-b border-stone-200 dark:border-stone-700 flex items-center gap-2.5 shrink-0 ${embedded ? 'px-3 py-2 bg-stone-50 dark:bg-stone-950/50' : 'px-4 sm:px-6 py-3 sm:py-4 border-violet-200 dark:border-violet-800'}`}>
          <div
            className={`rounded-xl flex items-center justify-center shrink-0 ${
              embedded
                ? 'w-8 h-8 bg-[#2563EB]'
                : 'w-10 h-10 sm:w-11 sm:h-11 bg-violet-100 dark:bg-violet-900/30'
            }`}
          >
            <LogIn className={embedded ? 'w-4 h-4 text-white' : 'w-5 h-5 text-violet-600'} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`font-bold text-stone-900 dark:text-stone-100 ${embedded ? 'text-sm' : 'text-base sm:text-lg'}`}>
              {embedded ? 'Fichaje' : 'Registro de fichaje'}
            </h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              {embedded
                ? 'Pulsa Abrir en tu nombre (fichar es opcional)'
                : `${storeLabel || 'Tienda'} · Pulsa Fichar al entrar`}
            </p>
          </div>
          {!loading && team.length > 0 && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
              embedded ? 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100' : 'bg-violet-600 text-white'
            }`}>
              {clockedInCount}/{team.length}
            </span>
          )}
          <button type="button" onClick={() => void load()} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 shrink-0" title="Actualizar">
            <RefreshCw className={`w-4 h-4 text-stone-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!embedded && (
            <button type="button" onClick={onCancel} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" aria-label="Cerrar">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${embedded ? 'px-2.5 py-2 space-y-2' : 'px-4 sm:px-6 py-3 sm:py-4 space-y-2.5'}`}>
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

            if (embedded) {
              const isOpener = Boolean(mid && selectedOpenerId === mid);
              return (
                <div
                  key={member.user_id}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${
                    onVacation
                      ? 'border-sky-200 bg-sky-50/70 dark:bg-sky-950/20'
                      : isOpener
                        ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200 dark:ring-blue-900'
                      : isActive
                        ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                        : isOnBreak
                          ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
                          : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    onVacation ? 'bg-sky-500 text-white'
                      : isOpener ? 'bg-[#2563EB] text-white'
                      : isOnBreak ? 'bg-amber-500 text-white'
                        : isActive ? 'bg-emerald-600 text-white'
                          : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-200'
                  }`}>
                    {isOnBreak ? <Coffee className="w-3.5 h-3.5" /> : isWorking ? <UserCheck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {member.fullName || member.email}
                    </p>
                    <p className="text-[10px] text-stone-500 truncate">
                      {onVacation
                        ? (vacationMsg || 'Ausente')
                        : isOpener
                          ? 'Abre la caja'
                        : isOnBreak && clockInTime
                          ? `Descanso · ${clockInTime}`
                          : isActive && clockInTime
                            ? `En turno · ${clockInTime}`
                            : isDone
                              ? 'Jornada fin'
                              : 'Sin fichar'}
                    </p>
                  </div>
                  {canFichar ? (
                    <div className="shrink-0 flex gap-1">
                      <button
                        type="button"
                        disabled={busy || onVacation || isOpener}
                        onClick={() => selectOpener(mid, { alreadyOnShift: false })}
                        className={`min-h-9 px-2.5 rounded-lg text-[10px] font-bold disabled:opacity-40 ${
                          isOpener
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#2563EB] hover:bg-blue-700 text-white'
                        }`}
                        title="Abrir la caja con este trabajador (sin fichar)"
                      >
                        {isOpener ? 'Elegido' : 'Abrir'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleClockIn(member)}
                        className="min-h-9 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold disabled:opacity-40 inline-flex items-center gap-1"
                        title="Registrar entrada (opcional)"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                        Fichar
                      </button>
                    </div>
                  ) : (
                    <div className="shrink-0 flex gap-1">
                      {!isOpener ? (
                        <button
                          type="button"
                          disabled={busy || onVacation}
                          onClick={() => selectOpener(mid, { alreadyOnShift: isWorking })}
                          className="min-h-9 px-2.5 rounded-lg text-[10px] font-bold bg-[#2563EB] hover:bg-blue-700 text-white disabled:opacity-40"
                          title="Usar este trabajador para abrir la caja"
                        >
                          Abrir
                        </button>
                      ) : (
                        <span className="min-h-9 px-2.5 rounded-lg text-[10px] font-bold bg-emerald-600 text-white inline-flex items-center">
                          Elegido
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={busy || !canBreak}
                        onClick={() => void handleBreak(member)}
                        className="min-h-9 px-2 rounded-lg text-[10px] font-semibold border border-amber-200 bg-amber-50 text-amber-800 disabled:opacity-40"
                      >
                        {isOnBreak ? 'Fin desc.' : 'Descanso'}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !canFinish}
                        onClick={() => void handleFinish(member)}
                        className="min-h-9 px-2 rounded-lg text-[10px] font-semibold border border-stone-200 bg-stone-100 text-stone-700 disabled:opacity-40"
                      >
                        Fin
                      </button>
                    </div>
                  )}
                </div>
              );
            }

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

        {!embedded && (
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
        )}
        {embedded && selectedOpenerId ? (
          <div className="shrink-0 px-3 py-1.5 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950/40">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 text-center">
              Listo · pulsa «Abrir caja» abajo
              {clockedInCount > 0
                ? ` · ${clockedInCount} fichado${clockedInCount === 1 ? '' : 's'}`
                : ' · sin fichar también vale'}
            </p>
          </div>
        ) : embedded ? (
          <div className="shrink-0 px-3 py-1.5 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950/40">
            <p className="text-[11px] font-medium text-stone-600 dark:text-stone-300 text-center">
              Pulsa <strong>Abrir</strong> en tu nombre (no hace falta fichar)
            </p>
          </div>
        ) : null}
    </div>
  );

  if (embedded) return panel;

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} bg-black/40 backdrop-blur-sm flex p-3 sm:p-4 items-end sm:items-center`}>
      {panel}
    </div>
  );
}

// ─── Status Bar (shown when register is open) ───────────────────────────────

const TPV_CASH_TX_LABELS: Record<string, string> = {
  cash_in: 'Entrada',
  cash_out: 'Salida',
  return: 'Devolución',
};

function cashMovementLabel(tx: { type: string; description?: string; workerName?: string }): string {
  if (tx.type === 'cash_out' && /^pago trabajador/i.test(String(tx.description || ''))) {
    return 'Pago trabajador';
  }
  return TPV_CASH_TX_LABELS[tx.type] || tx.type;
}

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
              {cashMovementLabel(tx)}
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
  const [invoiceOcrOpen, setInvoiceOcrOpen] = useState(false);
  useModalClose(menuOpen, () => setMenuOpen(false));

  const runMenuAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  type TpvMenuEntry = {
    id: string;
    label: string;
    title?: string;
    danger?: boolean;
    active?: boolean;
    tone?: 'default' | 'amber';
    icon: ReactNode;
    onClick: () => void;
  };

  const quickToEntry = (a: TpvStatusBarQuickAction): TpvMenuEntry => ({
    id: a.id,
    label: a.label,
    title: a.title,
    active: a.active,
    tone: a.tone,
    icon: a.icon,
    onClick: a.onClick,
  });
  const equipoQuickEntries = (quickActions || []).filter((a) => a.section === 'equipo').map(quickToEntry);
  const pedidoEntries = (quickActions || []).filter((a) => a.section !== 'equipo').map(quickToEntry);

  const menuSections: { id: string; label: string; items: TpvMenuEntry[] }[] = [
    {
      id: 'equipo',
      label: 'Equipo',
      items: [
        {
          id: 'clockin',
          label: 'Fichar equipo',
          title: 'Fichar entrada del resto del equipo',
          icon: <UserCheck className="w-5 h-5" />,
          onClick: onRequestClockIn,
        },
        ...equipoQuickEntries,
        {
          id: 'incident',
          label: 'Incidencia',
          title: 'Registrar incidencia',
          icon: <AlertTriangle className="w-5 h-5" />,
          onClick: onRequestIncident,
        },
      ],
    },
    {
      id: 'caja',
      label: 'Caja',
      items: [
        {
          id: 'cashops',
          label: 'Movimiento de caja',
          title: 'Entrada o salida de efectivo',
          icon: <Banknote className="w-5 h-5" />,
          onClick: onRequestCashOps,
        },
        {
          id: 'cashcount',
          label: 'Arqueo',
          title: 'Contar efectivo de la caja',
          icon: <Calculator className="w-5 h-5" />,
          onClick: onRequestCashCount,
        },
        {
          id: 'close',
          label: 'Cerrar caja',
          title: 'Cerrar caja del turno',
          danger: true,
          icon: <Lock className="w-5 h-5" />,
          onClick: onRequestClose,
        },
      ],
    },
    {
      id: 'stock',
      label: 'Stock',
      items: [
        {
          id: 'stock-review',
          label: 'Revisión stock',
          title: 'Pasar lista del inventario de la tienda',
          icon: <ClipboardCheck className="w-5 h-5" />,
          onClick: () => requestTpvStockReviewOpen(),
        },
        {
          id: 'invoice-scan',
          label: 'Escanear factura',
          title: 'Foto a la factura del proveedor: entra en compras y stock',
          icon: <ScanLine className="w-5 h-5" />,
          onClick: () => setInvoiceOcrOpen(true),
        },
        {
          id: 'store-transfer',
          label: 'Movimiento tienda',
          title: 'Traspasos de stock entre tiendas',
          icon: <ArrowRightLeft className="w-5 h-5" />,
          onClick: () => requestTpvStoreTransfersOpen(),
        },
      ],
    },
    ...(pedidoEntries.length > 0
      ? [{ id: 'pedidos', label: 'Pedidos', items: pedidoEntries }]
      : []),
    ...(showNativePrinter && onRequestPrinterSetup
      ? [{
          id: 'dispositivo',
          label: 'Dispositivo',
          items: [{
            id: 'printer',
            label: 'Ajustes impresora',
            title: nativePrinterReady ? 'Ajustes impresora' : 'Configurar impresora WiFi',
            icon: <Printer className="w-5 h-5" />,
            onClick: onRequestPrinterSetup,
          }],
        }]
      : []),
  ];

  const menuRowBase =
    'group w-full flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-left touch-manipulation transition-colors border border-transparent';
  const menuRowDefault =
    `${menuRowBase} bg-[var(--v-surface,#f5f7fb)] text-[var(--v-ink,#0b1220)] hover:bg-blue-50/70 hover:border-blue-100 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-blue-950/30 dark:hover:border-blue-900/50`;
  const menuRowActive =
    `${menuRowBase} bg-blue-50 border-blue-200 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300`;
  const menuRowWarn =
    `${menuRowBase} bg-amber-50/90 border-amber-200/80 text-amber-950 hover:bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-100`;
  const menuRowDanger =
    `${menuRowBase} bg-rose-50 border-rose-200/80 text-[var(--v-rose,#e11d48)] hover:bg-rose-100/80 dark:bg-rose-950/35 dark:border-rose-900/50 dark:text-rose-200`;
  const menuIconWell =
    'shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200/80 text-slate-600 shadow-sm dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 [&>svg]:h-5 [&>svg]:w-5';

  // Overlay a la derecha del panel (no absolute encima): el diseño Vertial + hits correctos en los ítems.
  const menuPanel = menuOpen ? (
    <TpvGatePortal>
      <div
        className="fixed inset-0 z-[120] flex vsaas-page"
        role="dialog"
        aria-modal="true"
        aria-label="Menú TPV"
      >
        <aside className="relative z-10 flex h-full w-[min(20.5rem,90vw)] shrink-0 flex-col bg-[var(--v-surface-elevated,#fff)] shadow-[var(--v-shadow)] border-r border-[var(--v-border)] dark:bg-[var(--v-surface-elevated)] pt-[max(0px,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="vsaas-brand-bar rounded-none opacity-100" />
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 border-b border-[var(--v-border)]">
            <div className="min-w-0 flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0 opacity-90">
                <VertialLogo size="sm" />
              </div>
              <div className="min-w-0">
                <p className="vsaas-title text-[15px]">Menú TPV</p>
                <p className="vsaas-subtitle text-[11px] truncate mt-0.5">
                  {storeLabel || 'Tienda'}
                  {terminalLabel ? ` · ${terminalLabel}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-11 !min-w-11 !px-0 shrink-0`}
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-5">
            {menuSections.map((section) => (
              <div key={section.id}>
                <p className="px-1 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--v-muted)]">
                  {section.label}
                </p>
                <div className="space-y-1.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => runMenuAction(item.onClick)}
                      className={
                        item.danger
                          ? menuRowDanger
                          : item.active
                            ? menuRowActive
                            : item.tone === 'amber'
                              ? menuRowWarn
                              : menuRowDefault
                      }
                    >
                      <span
                        className={`${menuIconWell} ${
                          item.danger
                            ? 'border-rose-200 text-[var(--v-rose,#e11d48)] dark:border-rose-800'
                            : item.active
                              ? 'border-blue-200 text-[var(--v-blue,#2563eb)] dark:border-blue-800'
                              : item.tone === 'amber'
                                ? 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300'
                                : ''
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold leading-tight tracking-tight">{item.label}</span>
                        {item.title && item.title !== item.label ? (
                          <span className="block text-[11px] font-medium text-[var(--v-muted)] mt-0.5 leading-snug opacity-90">
                            {item.title}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <button
          type="button"
          className="min-w-0 flex-1 border-0 bg-[var(--v-ink,#0b1220)]/40 backdrop-blur-[2px] touch-manipulation"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      </div>
    </TpvGatePortal>
  ) : null;

  const invoiceOcrModal = invoiceOcrOpen ? (
    <TpvGatePortal>
      <TpvInvoiceOcrModal session={session} onClose={() => setInvoiceOcrOpen(false)} />
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
      {invoiceOcrModal}
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
    {invoiceOcrModal}
    </>
  );
}

// ─── OCR factura desde TPV: foto → proveedor + artículos + stock de la tienda ─

function TpvInvoiceOcrModal({ session, onClose }: { session: TpvRegisterSession; onClose: () => void }) {
  const { currentBusiness } = useBusiness();
  const activeStore = useActiveStoreScope();
  const tpvScope = useTpvStockScope({
    pdvId: String(session.pointOfSaleId || '').trim() || undefined,
    storeLabel: String(session.pointOfSaleName || '').trim() || undefined,
  });
  const pdv = activeStore.pointsOfSale.find((p) => p._id === tpvScope.pdvId);
  const binding = readTpvTabletBinding();
  const bindingWorkCenterId =
    binding?.pdvId && binding.pdvId === tpvScope.pdvId ? String(binding.workCenterId || '') : '';
  const workCenterId = String(pdv?.workCenterId || bindingWorkCenterId || '').trim();
  const businessName = String(currentBusiness?.name || binding?.businessName || '').trim();

  if (!tpvScope.dataUserId) return null;

  return (
    <Suspense fallback={null}>
      <SaasOcrScanModal
        isOpen
        onClose={onClose}
        userId={tpvScope.dataUserId}
        targetModule="compras"
        context={{
          workCenterId,
          workCenterName: tpvScope.storeLabel,
          costCenterId: workCenterId,
          costCenterName: tpvScope.storeLabel,
          businessId: tpvScope.businessId,
          businessName,
        }}
        onDocumentCreated={async (payload) => {
          onClose();
          const fx = payload?.sideEffects as {
            stockUpdated?: number;
            matchedLines?: number;
            totalLines?: number;
            financeMovementId?: string;
          } | undefined;
          const unmatched =
            fx?.totalLines != null && fx?.matchedLines != null
              ? Math.max(0, fx.totalLines - fx.matchedLines)
              : 0;
          if (fx?.stockUpdated && fx.stockUpdated > 0) {
            if (unmatched > 0) {
              toast.warning(
                `Factura guardada: ${fx.stockUpdated} artículo(s) en stock. ${unmatched} línea(s) sin vínculo — no subieron stock.`,
              );
            } else {
              toast.success(
                `Factura procesada: ${fx.stockUpdated} artículo(s) al stock de ${tpvScope.storeLabel}`,
              );
            }
          } else if (fx?.financeMovementId) {
            toast.warning(
              'Factura y gasto registrados, pero ninguna línea subió stock. Se puede revisar en Compras.',
            );
          } else {
            toast.success('Factura procesada. Quedará revisable en Compras.');
          }
        }}
      />
    </Suspense>
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
  const hasTabletStoreCode = registerScope.hasTabletStoreCode;
  /** Mismo TPV caja con código tienda (tablet) o ruta worker — no solo CEO. */
  const isTabletCajaScope = hasTabletStoreCode || isTabletSession;
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
  /**
   * Tras pintar Abrir caja una vez, no volver a «Recuperando caja…» por poll/SSE/pick.
   * Sin esto: pantallazos OpeningScreen ↔ Recuperando en bucle.
   */
  const [openingScreenUnlocked, setOpeningScreenUnlocked] = useState(false);
  const openingScreenUnlockedRef = useRef(false);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  /** Snapshot de la caja a cerrar: el modal no debe desaparecer si activeSession parpadea. */
  const [closingSession, setClosingSession] = useState<TpvRegisterSession | null>(null);
  const [closingBusy, setClosingBusy] = useState(false);
  const [restaurantCloseWarnings, setRestaurantCloseWarnings] = useState<string[]>([]);
  const [showCashCount, setShowCashCount] = useState(false);
  const [showCashOps, setShowCashOps] = useState(false);
  const [voidCashTx, setVoidCashTx] = useState<TpvRegisterTransaction | null>(null);
  const [voidCashBusy, setVoidCashBusy] = useState(false);
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
  /** Detalle ampliado del cierre (sin reabrir). */
  const [postCloseShowDetail, setPostCloseShowDetail] = useState(false);
  /** Nombres de marca para el resumen «Caja cerrada» (no mostrar brand-uuid). */
  const [postCloseBrandLabels, setPostCloseBrandLabels] = useState<Record<string, string>>({});
  /** Tras cerrar → «Abrir otra»: ir a contar fondo (mismo trabajador si se puede). */
  const [openingResume, setOpeningResume] = useState<{
    workerId?: string;
    key: number;
  } | null>(null);
  /**
   * Al reentrar al TPV con caja ya abierta, hay que pulsar «Continuar en esta caja».
   * Se resetea al desmontar el gate (salir del TPV). Tras Abrir / Continuar queda marcado.
   */
  const [ackedOpenSessionId, setAckedOpenSessionId] = useState<string | null>(null);
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
  const initialManagerPdvIdRef = useRef(initialManagerPdvId);
  initialManagerPdvIdRef.current = initialManagerPdvId;
  const managerPdvPickIdRef = useRef(managerPdvPickId);
  managerPdvPickIdRef.current = managerPdvPickId;
  const tabletBindingRef = useRef(tabletBinding);
  tabletBindingRef.current = tabletBinding;
  const scopeBusinessIdRef = useRef(scopeBusinessId);
  scopeBusinessIdRef.current = scopeBusinessId;
  const isTabletSessionRef = useRef(isTabletSession);
  isTabletSessionRef.current = isTabletSession;
  const isTabletCajaScopeRef = useRef(isTabletCajaScope);
  isTabletCajaScopeRef.current = isTabletCajaScope;
  const hasTabletStoreCodeRef = useRef(hasTabletStoreCode);
  hasTabletStoreCodeRef.current = hasTabletStoreCode;
  const accountBusinessCountRef = useRef(accountBusinessCount);
  accountBusinessCountRef.current = accountBusinessCount;
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const businessId = scopeBusinessId;
  const tpvFrameClass = fillParent ? 'flex flex-col h-full min-h-0' : 'flex flex-col min-h-screen';

  const tabletRestrictedPdvId = isTabletCajaScope
    ? String(tabletBinding?.pdvId || initialManagerPdvId || '').trim() || null
    : null;

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
      writeOpsSelectedPdvId(currentBusiness?.businessType, scopeBusinessId, tabletBinding.dataUserId, tabletRestrictedPdvId);
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
    const salesPointRef = resolveEffectiveSalesPointRef({
      employmentSalesPointId: user?.employment?.salesPointId,
      workCenters,
      pointsOfSale,
    });
    return filterStoresForWorkerAssignment(
      pointsOfSale,
      workCenters,
      salesPointRef,
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
      writeOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId, id);
    }
  }, [initialManagerPdvId, isTabletSession, isWorkerUser, currentBusiness, dataUserId]);

  useEffect(() => {
    if (initialManagerPdvId || isWorkerUser || managerPdvPickId || skipManagerAutoPdvRef.current) return;
    const bid = resolveBusinessScopeId(currentBusiness);
    if (bid && dataUserId) {
      const saved = readOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId);
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
      const saved = readOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId);
      const pdvId = resolvePreferenceToPdvId(pointsOfSale, saved);
      if (pdvId) setManagerPdvPickId(pdvId);
    };
    syncManagerPdvFromStorage();
    const events = ['vertial-delivery-active-store', 'vertial-restaurant-active-store'] as const;
    for (const ev of events) {
      window.addEventListener(ev, syncManagerPdvFromStorage);
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, syncManagerPdvFromStorage);
      }
    };
  }, [isWorkerUser, isTabletSession, currentBusiness, dataUserId, pointsOfSale]);

  const pointsOfSaleScopeKey = useMemo(
    () => pointsOfSale.map((p) => p._id).join(','),
    [pointsOfSale],
  );

  useEffect(() => {
    if (!dataUserId) return;
    const refreshSessions = () => {
      void listTpvRegisterSessionsRequest(
        dataUserId,
        tpvGateSessionsQueryOpts(scopeBusinessIdRef.current || undefined),
      )
        .then((sessData) => {
          setSessions((prev) => {
            const tabletPdvId = String(tabletBindingRef.current?.pdvId || '').trim();
            const bid = scopeBusinessIdRef.current;
            let next = sessData;
            if (isTabletCajaScopeRef.current && tabletPdvId) {
              const pdvs = mergeTabletBindingPdv(
                pointsOfSaleRef.current,
                tabletBindingRef.current,
              );
              next = filterSessionsForTabletStore(
                sessData,
                tabletPdvId,
                pdvs,
                tabletBindingRef.current?.workCenterId,
              );
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
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshSessions();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshSessions);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dataUserId, pointsOfSaleScopeKey, scopeBusinessId]);

  /** Última caja abierta conocida: no perder el tablero si el pick de tienda parpadea. */
  const stickyOpenSessionRef = useRef<TpvRegisterSession | null>(null);

  // Tablet/código: mostrar apertura al momento (no bloquear en «Recuperando caja…»).
  useEffect(() => {
    if (!hasTabletStoreCode && !readTpvTabletBinding()?.pdvId) return;
    openingScreenUnlockedRef.current = true;
    setOpeningScreenUnlocked(true);
    setOpeningRecoverHold(false);
    setAckedOpenSessionId(null);
  }, [hasTabletStoreCode]);

  const hydrateTabletCajaFromHint = useCallback(async () => {
    if (!isTabletCajaScopeRef.current) return;
    const binding = tabletBindingRef.current;
    const uid = String(dataUserIdRef.current || binding?.dataUserId || '').trim();
    const pdvId = String(binding?.pdvId || initialManagerPdvIdRef.current || '').trim();
    const bid = String(scopeBusinessIdRef.current || binding?.businessId || '').trim();
    if (!uid || !pdvId) return;

    const cached = readTabletCajaOpeningHint(pdvId);
    const cachedMerge = [cached?.openSession, cached?.lastClosed].filter(
      (s): s is TpvRegisterSession => Boolean(s?._id),
    );
    if (cachedMerge.length > 0) {
      setSessions((prev) => mergeTpvRegisterSessionsPreservingOpen(prev, cachedMerge));
    }

    try {
      const hint = await fetchTpvStoreOpeningHintRequest(uid, {
        pointOfSaleId: pdvId,
        workCenterId: binding?.workCenterId,
        businessId: bid || undefined,
      });
      writeTabletCajaOpeningHint({
        pdvId,
        businessId: bid || undefined,
        openSession: hint.openSession,
        lastClosed: hint.lastClosed,
        suggestedFondo: hint.suggestedFondo,
        fetchedAt: new Date().toISOString(),
      });
      const fresh = [hint.openSession, hint.lastClosed].filter(
        (s): s is TpvRegisterSession => Boolean(s?._id),
      );
      if (fresh.length > 0) {
        setSessions((prev) => mergeTpvRegisterSessionsPreservingOpen(prev, fresh));
      }
    } catch {
      // Mantener caché local si la red falla en tablet.
    }
  }, []);

  useEffect(() => {
    if (!isTabletCajaScope || !dataUserId) return;
    void hydrateTabletCajaFromHint();
  }, [isTabletCajaScope, dataUserId, scopeBusinessId, tabletBinding?.pdvId, hydrateTabletCajaFromHint]);

  // Bar/restaurante CEO: sin sticky el pick de PDV puede soltar la caja un frame
  // al abrir mesa → TPV embebido se queda en «Recuperando la caja…».
  const holdStickyWhileOpen = Boolean(
    isTabletCajaScope || isWorkerUser || orderFlowActive || isRestaurantVerticalChrome,
  );

  /**
   * Tienda operativa del gate: tablet / trabajador / CEO.
   * Incluye `initialManagerPdvId` en el mismo render (sin esperar al useLayoutEffect
   * de managerPdvPickId) para que Continuar/Abrir no carguen con tienda vacía o ajena.
   */
  const resolvedStorePickId = useMemo(() => {
    if (isTabletCajaScope) return tabletRestrictedPdvId;
    if (isWorkerUser) return workerAssignedPdvId;
    const fromProp = String(initialManagerPdvId || '').trim();
    if (fromProp) return fromProp;
    return managerPdvPickId;
  }, [
    isTabletCajaScope,
    tabletRestrictedPdvId,
    isWorkerUser,
    workerAssignedPdvId,
    initialManagerPdvId,
    managerPdvPickId,
  ]);

  const resolvedStorePickIdRef = useRef(resolvedStorePickId);
  resolvedStorePickIdRef.current = resolvedStorePickId;

  const activeSession = useMemo(() => {
    const alternateRefs = resolveTpvStoreAlternateRefs({
      pickId: resolvedStorePickId,
      pointsOfSale,
      tabletWorkCenterId: isTabletCajaScope ? tabletBinding?.workCenterId : null,
    });
    const { session, nextSticky } = resolveActiveTpvRegisterSession({
      sessions,
      sticky: stickyOpenSessionRef.current,
      pickId: resolvedStorePickId,
      pointsOfSale,
      holdStickyWhileOpen,
      alternateRefIds: alternateRefs,
    });
    // Ref en el mismo render: si el pick parpadea en el siguiente update, sticky ya está.
    stickyOpenSessionRef.current = nextSticky;
    return session;
  }, [
    sessions,
    resolvedStorePickId,
    pointsOfSale,
    holdStickyWhileOpen,
    isTabletCajaScope,
    tabletBinding?.workCenterId,
  ]);

  /**
   * Sesión operativa del tablero: si el pick del CEO parpadea, activeSession puede
   * ser null un frame aunque sticky siga open. Sin esto → OpeningScreen a mitad
   * de pedido y el cobro cree que no hay caja.
   */
  const boardSession = useMemo(() => {
    if (isTpvRegisterSessionOpen(activeSession)) return activeSession;
    if (
      holdStickyWhileOpen
      && isTpvRegisterSessionOpen(stickyOpenSessionRef.current)
    ) {
      return stickyOpenSessionRef.current;
    }
    return null;
  }, [activeSession, holdStickyWhileOpen]);

  /** Caja abierta de esta tienda (para Continuar en tablet / apertura). */
  const openingKnownOpenSession = useMemo(() => {
    if (isTpvRegisterSessionOpen(boardSession)) return boardSession;
    const pick = String(resolvedStorePickId || '').trim();
    if (!pick) return null;
    const alternateRefs = resolveTpvStoreAlternateRefs({
      pickId: pick,
      pointsOfSale,
      tabletWorkCenterId: isTabletCajaScope ? tabletBinding?.workCenterId : null,
    });
    const opens = sessions.filter((s) => isTpvRegisterSessionOpen(s));
    const fromList = pickNewestOpenRegisterSessionForStore(opens, pick, pointsOfSale, alternateRefs);
    if (fromList) return fromList;
    if (isTabletCajaScope) {
      const cached = readTabletCajaOpeningHint(pick);
      if (cached?.openSession && isTpvRegisterSessionOpen(cached.openSession)) {
        return cached.openSession;
      }
    }
    return null;
  }, [
    boardSession,
    sessions,
    resolvedStorePickId,
    pointsOfSale,
    isTabletCajaScope,
    tabletBinding?.workCenterId,
  ]);

  /** Caja open detectada, pero el usuario aún no ha confirmado Continuar en esta visita. */
  const needsResumeAck = Boolean(
    isTpvRegisterSessionOpen(boardSession)
    && boardSession?._id
    && ackedOpenSessionId !== boardSession._id,
  );

  // Código / apertura: no mostrar Stock·Salir encima de Abrir caja (antes parpadeaban).
  useTpvSuppressBottomBar(
    !isTpvRegisterSessionOpen(boardSession) || needsResumeAck,
    'gate-register',
  );

  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = isTpvRegisterSessionOpen(activeSession) ? activeSession?._id ?? null : null;

  const applyRemoteSessionClose = useCallback((session: TpvRegisterSession): boolean => {
    if (!isTpvRegisterSessionClosed(session)) return false;
    const pick = String(resolvedStorePickIdRef.current || '').trim();
    if (!pick) return false;
    const alternateRefs = resolveTpvStoreAlternateRefs({
      pickId: pick,
      pointsOfSale: pointsOfSaleRef.current,
      tabletWorkCenterId: isTabletCajaScopeRef.current ? tabletBindingRef.current?.workCenterId : null,
    });
    if (!remoteClosedSessionAffectsStore(session, pick, pointsOfSaleRef.current, alternateRefs)) {
      return false;
    }
    stickyOpenSessionRef.current = null;
    clearTpvRegisterLocalSessionState();
    setAckedOpenSessionId(null);
    openingScreenUnlockedRef.current = false;
    setOpeningScreenUnlocked(false);
    setOpeningRecoverHold(true);
    setShowClosing(false);
    setClosingSession(null);
    if (activeSessionIdRef.current) {
      toast.message('Caja cerrada desde otro terminal. Abre caja para el nuevo turno.', { duration: 6000 });
    }
    return true;
  }, []);

  useEffect(() => {
    const onSessionSync = (event: Event) => {
      const session = (event as CustomEvent<TpvRegisterSession>).detail;
      if (!session?._id) return;
      applyRemoteSessionClose(session);
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s._id === session._id);
        if (idx < 0) return [session, ...prev];
        return prev.map((s) => (s._id === session._id ? session : s));
      });
    };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
    return () => window.removeEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
  }, [applyRemoteSessionClose]);

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
    applyRemoteSessionClose(session);
    window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: session }));
  }, [applyRemoteSessionClose]);

  // El navegador bloquea el audio hasta el primer gesto: desbloquear una vez
  // para que el sonido de traspaso entrante suene aunque llegue por SSE.
  useEffect(() => {
    const unlock = () => unlockStoreTransferAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Traspasos entre tiendas: el PDV activo se resuelve más abajo (activeStoreScope);
  // el handler solo lo lee cuando llega un evento SSE, por eso basta un ref.
  const storeTransferPdvIdRef = useRef('');
  const seenStoreTransferEventsRef = useRef<Set<string>>(new Set());
  const applyStoreTransferLive = useCallback((raw: unknown) => {
    const data = raw as StoreTransferLiveEvent | null;
    if (!data?.id) return;
    // El evento llega por usuario y por empresa: no sonar/avisar dos veces.
    const key = `${data.id}:${data.kind || ''}:${data.updatedAt || ''}`;
    if (seenStoreTransferEventsRef.current.has(key)) return;
    seenStoreTransferEventsRef.current.add(key);
    if (seenStoreTransferEventsRef.current.size > 200) {
      seenStoreTransferEventsRef.current = new Set([key]);
    }

    emitStoreTransferSync(data);

    const myPdvId = storeTransferPdvIdRef.current;
    if (!myPdvId) return;
    if (data.kind === 'incoming' && data.toPdvId === myPdvId) {
      if (isStoreTransferSoundEnabled()) playStoreTransferSound();
      toast.info(
        `Traspaso en camino desde ${data.fromPdvName || 'otra tienda'}`,
        {
          duration: 10_000,
          action: {
            label: 'Ver',
            onClick: () => requestTpvStoreTransfersOpen(),
          },
        },
      );
    } else if (data.kind === 'received' && data.fromPdvId === myPdvId) {
      toast.success(`${data.toPdvName || 'La otra tienda'} recibió el traspaso`);
    } else if (data.kind === 'cancelled' && data.toPdvId === myPdvId) {
      toast.message(`${data.fromPdvName || 'La otra tienda'} canceló el traspaso en camino`);
    }
  }, []);

  useSSE({
    userId: sseAuthUserId,
    token: sseToken,
    businessId: scopeBusinessId || null,
    enabled: Boolean(sseAuthUserId && dataUserId),
    handlers: useMemo(
      () => ({
        tpv_session_updated: applyLiveSession,
        store_transfer_updated: applyStoreTransferLive,
      }),
      [applyLiveSession, applyStoreTransferLive],
    ),
  });

  const activeStoreScope = useMemo(() => {
    const rawId = String(
      activeSession?.pointOfSaleId || resolvedStorePickId || '',
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
    resolvedStorePickId,
    pointsOfSale,
    tabletBinding?.workCenterId,
  ]);
  storeTransferPdvIdRef.current = activeStoreScope.pdvId;

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
    // Si el manager elige otra tienda en el panel de impresora, esa manda
    // (si no, con caja abierta en la 1ª nunca podías guardar/probar la 2ª).
    const preferredId = String(
      resolvedStorePickId || activeSession?.pointOfSaleId || '',
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
    resolvedStorePickId,
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
    skipManagerAutoPdvRef.current = true;
    setManagerPdvPickId(id);
    const bid = resolveBusinessScopeId(currentBusiness);
    if (bid && dataUserId) {
      writeOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId, id);
      notifyOpsActiveStoreChanged(currentBusiness?.businessType);
    }
  }, [currentBusiness?.business_id, currentBusiness?.id, currentBusiness?.businessType, dataUserId]);

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

  // Cache pedidos del turno para poder cerrar apps/marcas sin red.
  useEffect(() => {
    if (!dataUserId || !isTpvRegisterSessionOpen(activeSession)) return;
    prefetchShiftOrdersForSession(dataUserId, activeSession);
    const t = window.setInterval(() => {
      prefetchShiftOrdersForSession(dataUserId, activeSession);
    }, 120_000);
    return () => window.clearInterval(t);
  }, [dataUserId, activeSession?._id, activeSession?.openedAt, activeSession?.pointOfSaleId]);

  // Catálogo de marcas → nombres legibles en resumen «Caja cerrada» / Marcas.
  useEffect(() => {
    const bid = String(scopeBusinessId || '').trim();
    if (!bid) {
      setPostCloseBrandLabels({});
      return;
    }
    let cancelled = false;
    void listBrandsRequest(bid)
      .then((brands) => {
        if (cancelled) return;
        setPostCloseBrandLabels(buildBrandLabelsMap((brands || []).filter((b) => b && !b.deletedAt)));
      })
      .catch(() => {
        if (!cancelled) setPostCloseBrandLabels({});
      });
    return () => {
      cancelled = true;
    };
  }, [scopeBusinessId]);

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
      } else if (isTabletCajaScope && tabletBindingRef.current?.pdvId) {
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
    isTabletCajaScope,
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
        hasTabletStoreCode: hasTabletStoreCodeRef.current,
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
        if (!(isTabletCajaScopeRef.current && tabletPdv)) {
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
        const tabletPdvId = String(
          tabletBindingRef.current?.pdvId
          || initialManagerPdvIdRef.current
          || '',
        ).trim();
        const tabletFastPath = isTabletCajaScopeRef.current && Boolean(tabletPdvId);

        if (tabletFastPath) {
          void hydrateTabletCajaFromHint();
        }

        if (tabletFastPath && !hasDisplayedStoresRef.current) {
          const stubPdvs = mergeTabletBindingPdv([], tabletBindingRef.current);
          setPointsOfSale(stubPdvs);
          setWorkCenters([]);
          hasDisplayedStoresRef.current = stubPdvs.length > 0;
        }

        // 1) Sesiones ligeras (crítico para recuperar caja). Sin lite el desktop se queda en «Recuperando caja…».
        const sessData = await listTpvRegisterSessionsRequest(
          uid,
          tpvGateSessionsQueryOpts(bidAtStart || undefined),
        );

        if (seq !== loadSeqRef.current) return;
        if (!isTabletCajaScopeRef.current && scopeBusinessIdRef.current !== bidAtStart) return;
        if (
          !shouldApplyTpvRegisterLoadResult({
            isTabletSession: isTabletSessionRef.current,
            hasTabletStoreCode: hasTabletStoreCodeRef.current,
            bidAtStart,
            activeBid: resolveBusinessScopeId(scopeBusinessRef.current),
          })
        ) {
          return;
        }

        if (tabletFastPath) {
          const pdvsForMatch = mergeTabletBindingPdv(
            pointsOfSaleRef.current,
            tabletBindingRef.current,
          );
          setSessions((prev) =>
            mergeTpvRegisterSessionsPreservingOpen(
              prev,
              filterSessionsForTabletStore(
                sessData,
                tabletPdvId,
                pdvsForMatch,
                tabletBindingRef.current?.workCenterId,
              ),
            ),
          );
        } else {
          setSessions((prev) =>
            mergeTpvRegisterSessionsPreservingOpen(
              prev,
              sessData.filter((s) =>
                shouldKeepTpvSessionInList(s, pointsOfSaleRef.current, bidAtStart),
              ),
            ),
          );
        }

        // UI libre → OpeningScreen (core entrada delivery: fichaje + abrir / continuar).
        // Tablet: no cortar aquí; sigue cargando tiendas reales en segundo plano
        // para que Badalona/test1 tengan la misma apertura que el CEO.
        if (seq === loadSeqRef.current) setLoading(false);

        // 2) Tiendas / códigos tablet (tablet ya mostró OpeningScreen; esto hidrata PDV real).
        const bizList = businessesRef.current;
        const knownBusinessIds = bizList.map((b) => b.business_id).filter(Boolean);
        const cachedPdvs = pointsOfSaleRef.current;
        const cachedMissingTerminal = cachedPdvs.some(
          (p) =>
            p.active !== false
            && !(Array.isArray(p.terminals) && p.terminals.some((t) => t.active !== false)),
        );
        const needFreshStores =
          !tabletFastPath
          && (!hasDisplayedStoresRef.current || cachedMissingTerminal);
        const needTabletHydrate = tabletFastPath;

        let storeState: Awaited<ReturnType<typeof loadRetailStoresForBusiness>>;
        if (needFreshStores || needTabletHydrate) {
          let state = await loadRetailStoresForBusiness(authUser, biz ?? null, bizList, {
            ...loadOpts,
            knownBusinessIds,
            tpvBootstrap: true,
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
          storeState = state;
        } else {
          let pdvs = cachedPdvs;
          try {
            pdvs = await ensureTabletCodesForPointsOfSale(uid, pdvs);
          } catch {
            /* conservar caché */
          }
          storeState = {
            dataUserId: uid,
            workCenters: workCentersRef.current,
            pointsOfSale: pdvs,
          };
        }

        if (seq !== loadSeqRef.current) return;
        if (!isTabletCajaScopeRef.current && scopeBusinessIdRef.current !== bidAtStart) return;

        let scopedPdvs = storeState.pointsOfSale.filter((p) => p.active !== false);
        let scopedWorkCenters = storeState.workCenters.filter(
          (wc) =>
            wc.active !== false &&
            !wc.deletedAt &&
            (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
        );

        if (workerUser && !isTabletCajaScopeRef.current) {
          const salesPointRef = resolveEffectiveSalesPointRef({
            employmentSalesPointId: authUser?.employment?.salesPointId,
            workCenters: scopedWorkCenters,
            pointsOfSale: scopedPdvs,
          });
          const scoped = filterStoresForWorkerAssignment(
            scopedPdvs,
            scopedWorkCenters,
            salesPointRef,
          );
          scopedPdvs = scoped.pointsOfSale;
          scopedWorkCenters = scoped.workCenters;
        }

        // Código tablet delivery: solo la tienda del código (misma OpeningScreen por código).
        if (isTabletCajaScopeRef.current && tabletPdvId) {
          scopedPdvs = scopedPdvs.filter(
            (p) => p._id === tabletPdvId || String(p.workCenterId || '').trim() === tabletPdvId,
          );
          if (scopedPdvs.length === 0) {
            scopedPdvs = mergeTabletBindingPdv([], tabletBindingRef.current);
          }
        } else {
          // CEO: si el pick (Badalona) no entró en el scope, reinyectarlo desde el fetch completo.
          const pickId = String(
            initialManagerPdvIdRef.current || managerPdvPickIdRef.current || '',
          ).trim();
          if (
            pickId
            && !scopedPdvs.some(
              (p) => p._id === pickId || String(p.workCenterId || '').trim() === pickId,
            )
          ) {
            const fromAll = storeState.pointsOfSale.find(
              (p) =>
                p.active !== false
                && (p._id === pickId || String(p.workCenterId || '').trim() === pickId),
            );
            if (fromAll) scopedPdvs = [...scopedPdvs, fromAll];
          }
        }

        if (scopedPdvs.length > 0 || scopedWorkCenters.length > 0) {
          setWorkCenters(scopedWorkCenters);
          setPointsOfSale(
            mergeTabletBindingPdv(scopedPdvs, isTabletCajaScopeRef.current ? tabletBindingRef.current : null),
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

        // Re-filtrar sesiones con PDVs frescos (misma lista, scope más preciso).
        const mergedPdvs = mergeTabletBindingPdv(
          scopedPdvs,
          isTabletCajaScopeRef.current ? tabletBindingRef.current : null,
        );
        setSessions((prev) =>
          mergeTpvRegisterSessionsPreservingOpen(
            prev,
            isTabletCajaScopeRef.current && tabletPdvId
              ? filterSessionsForTabletStore(
                  sessData,
                  tabletPdvId,
                  mergedPdvs,
                  tabletBindingRef.current?.workCenterId,
                )
              : sessData.filter((s) => shouldKeepTpvSessionInList(s, mergedPdvs, bidAtStart)),
          ),
        );
      } catch {
        if (
          seq === loadSeqRef.current
          && !hasDisplayedStoresRef.current
          && !sessionsRef.current.some((s) => isTpvRegisterSessionOpen(s))
          && !isTabletCajaScopeRef.current
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
      hasTabletStoreCode,
      dataUserId,
      scopeBusinessId,
    });
    if (!gate.canLoad) {
      if (gate.shouldClearLoading) setLoading(false);
      return;
    }
    void loadData();
  }, [businessLoading, businessesFetchSettled, dataUserId, scopeBusinessId, loadData, isTabletSession, hasTabletStoreCode]);

  useEffect(() => {
    if (!loading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // Hold de recuperación al montar / cambiar empresa.
  useEffect(() => {
    openingScreenUnlockedRef.current = false;
    setOpeningScreenUnlocked(false);
    setOpeningRecoverHold(true);
  }, [scopeBusinessId, dataUserId]);

  // Cambio real de tienda (test1 → Badalona): limpiar sticky/ack.
  // No disparar en el primer set del pick (null → id) ni si el pick parpadea
  // al mismo valor: eso devolvía a Continuar a mitad de pedido en tablet/iOS.
  const prevStorePickRef = useRef<string | null>(null);
  useEffect(() => {
    const pick = String(resolvedStorePickId || '').trim() || null;
    const prev = prevStorePickRef.current;
    if (prev === pick) return;
    prevStorePickRef.current = pick;
    if (!prev || !pick) return;
    stickyOpenSessionRef.current = null;
    setAckedOpenSessionId(null);
    openingScreenUnlockedRef.current = false;
    setOpeningScreenUnlocked(false);
    setOpeningRecoverHold(true);
  }, [resolvedStorePickId]);

  useEffect(() => {
    if (isTpvRegisterSessionOpen(activeSession)) {
      writeTpvOpenRegisterLatch(activeSession);
      setOpeningRecoverHold(false);
      // Caja operativa en esta tienda: al cerrar sí se permite un hold breve.
      openingScreenUnlockedRef.current = false;
      setOpeningScreenUnlocked(false);
      return;
    }
    if (loading) {
      if (isTpvRegisterSessionOpen(stickyOpenSessionRef.current)) {
        writeTpvOpenRegisterLatch(stickyOpenSessionRef.current);
      }
      if (!openingScreenUnlockedRef.current) {
        setOpeningRecoverHold(true);
      }
      return;
    }
    // Sin caja en el pick actual → Abrir caja. Mantener latch si sticky sigue open
    // (otra tienda / ghost), pero NO quedar sin latch a mitad de turno.
    if (isTpvRegisterSessionOpen(stickyOpenSessionRef.current)) {
      writeTpvOpenRegisterLatch(stickyOpenSessionRef.current);
    } else if (!orderFlowActiveRef.current) {
      writeTpvOpenRegisterLatch(null);
    }
    if (openingScreenUnlockedRef.current) {
      setOpeningRecoverHold(false);
      return;
    }
    setOpeningRecoverHold(true);
    const timer = window.setTimeout(() => {
      setOpeningRecoverHold(false);
      openingScreenUnlockedRef.current = true;
      setOpeningScreenUnlocked(true);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loading, activeSession?._id, activeSession?.status]);

  const attachOpenSession = useCallback((
    existing: TpvRegisterSession,
    opts?: { preferredStoreId?: string; toastMessage?: string | null; allowStale?: boolean },
  ) => {
    if (!existing?._id) return false;
    if (!opts?.allowStale && isTpvRegisterSessionStaleOpen(existing)) {
      toast.error(
        'Hay una caja antigua abierta (más de 18 h). Pulsa «Continuar en esta caja» o ciérrala en Caja.',
        { id: 'tpv-stale-open', duration: 5000 },
      );
      return false;
    }
    const storeId = String(opts?.preferredStoreId || existing.pointOfSaleId || '').trim();
    stickyOpenSessionRef.current = existing;
    setAckedOpenSessionId(existing._id);
    writeTpvOpenRegisterLatch(existing);
    {
      const oid = normalizeClockinUserId(existing.workerId);
      const oname = String(existing.workerName || '').trim();
      if (oid && oname) {
        setClockedInWorkers([{ id: oid, name: oname, status: 'active' }]);
        setSelectedOrderTakerId(oid);
        setClockedInWorkersLoading(false);
      }
    }
    if (!isWorkerUser && storeId) {
      const bid = resolveBusinessScopeId(currentBusiness);
      if (bid && dataUserId) writeOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId, storeId);
      setManagerPdvPickId(storeId);
      skipManagerAutoPdvRef.current = false;
    }
    setPostCloseSession(null);
    setPostCloseAggregatorRows([]);
    setPostCloseShowDetail(false);
    setOpeningResume(null);
    setSessions((prev) => {
      const exists = prev.some((s) => s._id === existing._id);
      if (exists) return prev.map((s) => (s._id === existing._id ? existing : s));
      return [existing, ...prev];
    });
    window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: existing }));
    if (opts?.toastMessage !== null) {
      toast.info(opts?.toastMessage || 'Entrando en la caja ya abierta', {
        id: 'tpv-continue-register',
        duration: 2500,
      });
    }
    return true;
  }, [currentBusiness, dataUserId, isWorkerUser]);

  const handleContinueExistingOpen = useCallback((existing: TpvRegisterSession) => {
    attachOpenSession(existing, {
      allowStale: isTpvRegisterSessionStaleOpen(existing),
    });
  }, [attachOpenSession]);

  const startOpenAnotherAfterClose = useCallback((closed: TpvRegisterSession | null) => {
    const storeId = String(closed?.pointOfSaleId || '').trim();
    if (!isWorkerUser && storeId) {
      const bid = resolveBusinessScopeId(currentBusiness);
      if (bid && dataUserId) writeOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId, storeId);
      setManagerPdvPickId(storeId);
      skipManagerAutoPdvRef.current = false;
    }
    setOpeningResume({
      workerId: String(closed?.workerId || '').trim() || undefined,
      key: Date.now(),
    });
    setPostCloseSession(null);
    setPostCloseAggregatorRows([]);
    setPostCloseShowDetail(false);
  }, [currentBusiness, dataUserId, isWorkerUser]);

  const handleReopenClosed = async (closedSession: TpvRegisterSession) => {
    if (!dataUserId || !closedSession?._id) return;
    if (openingInFlightRef.current) {
      toast.info('Reabriendo…', { id: 'tpv-reopening-busy', duration: 1500 });
      return;
    }
    openingInFlightRef.current = true;
    try {
      const reopened = await reopenTpvRegisterSessionRequest(
        dataUserId,
        closedSession._id,
        'Cierre accidental',
      );
      if (!attachOpenSession(reopened, { toastMessage: null })) return;
      toast.success(
        `Caja reabierta: ${reopened.pointOfSaleName || 'tienda'}${reopened.terminalName ? ` / ${reopened.terminalName}` : ''}`,
      );
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo reabrir la caja'));
    } finally {
      openingInFlightRef.current = false;
    }
  };

  const handleOpen = async (data: OpeningData) => {
    if (!dataUserId) return;
    if (openingInFlightRef.current) {
      toast.info('Abriendo caja…', { id: 'tpv-opening-busy', duration: 1500 });
      return;
    }
    openingInFlightRef.current = true;
    setOpeningBusy(true);

    const releaseOpenLock = () => {
      openingInFlightRef.current = false;
      setOpeningBusy(false);
    };

    try {
    const pdvId = String(data.pointOfSaleId || '').trim();
    const openAlternateRefs = resolveTpvStoreAlternateRefs({
      pickId: pdvId,
      pointsOfSale,
      tabletWorkCenterId: isTabletCajaScope ? tabletBinding?.workCenterId : null,
    });

    const localOpen = pickNewestOpenRegisterSessionForStore(
      sessions,
      pdvId,
      pointsOfSale,
      openAlternateRefs,
    );
    // Seguro: si otra tablet abrió mientras, entrar (turnos viejos >18 h se abren vía Continuar o cierre automático al crear).
    if (localOpen && !isTpvRegisterSessionStaleOpen(localOpen)) {
      attachOpenSession(localOpen, { preferredStoreId: pdvId });
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
      // Enganchar YA (pick + sticky) antes del fichaje: si no, el botón se queda
      // bloqueado en silencio y hay que pulsar Abrir varias veces.
      stickyOpenSessionRef.current = created;
      setAckedOpenSessionId(created._id);
      writeTpvOpenRegisterLatch(created);
      if (!isWorkerUser) {
        const bid = resolveBusinessScopeId(currentBusiness);
        if (bid && dataUserId && data.pointOfSaleId) {
          writeOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId, data.pointOfSaleId);
        }
        if (data.pointOfSaleId) setManagerPdvPickId(data.pointOfSaleId);
        skipManagerAutoPdvRef.current = false;
      }
      setPostCloseSession(null);
      setOpeningResume(null);
      setSessions(prev => [created, ...prev]);
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: created }));
      toast.success(`Caja abierta: ${data.pointOfSaleName ? `${data.pointOfSaleName} / ` : ''}${data.terminalName} — ${total.toFixed(2)}€`);

      const bid = resolveBusinessScopeId(currentBusiness);
      const pdvDoc = pointsOfSale.find((p) => p._id === pdvId);
      const wcId = String(pdvDoc?.workCenterId || tabletBinding?.workCenterId || '').trim();
      // Fichaje en paralelo: no alarga el candado de «Abrir» si la geo/red va lenta.
      // No abrir el modal antiguo de fichaje solo: toast + barra de caja bastan.
      if (openerId && data.workerName) {
        setClockedInWorkers([{ id: openerId, name: data.workerName, status: 'active' }]);
        setSelectedOrderTakerId(openerId);
        setClockedInWorkersLoading(false);
      }
      const clockInPromise = (bid && openerId && pdvId)
        ? (async () => {
          try {
            const geo = await requestClockinGeo();
            await clockIn(bid, openerId, data.workerName, {
              device_type: isTabletSession ? 'tablet' : 'web',
              sales_point_id: pdvId,
              sales_point_name: data.pointOfSaleName || pdvDoc?.name || '',
              work_center_id: wcId || undefined,
              store_team_clockin: true,
              geo,
            });
            setSelectedOrderTakerId(openerId);
            void refreshClockedInWorkers({ silent: true });
          } catch {
            toast.warning('Caja abierta. Ficha al equipo desde el menú de caja si hace falta.', {
              id: 'tpv-clockin-needed',
              duration: 5000,
            });
          }
        })()
        : Promise.resolve();
      void clockInPromise;
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
        if (!isTpvRegisterSessionStaleOpen(conflictExisting)) {
          attachOpenSession(conflictExisting, { preferredStoreId: pdvId });
        } else {
          toast.info(
            'Hay una caja abierta desde ayer. Pulsa «Continuar en esta caja» arriba o abre una nueva.',
            { id: 'tpv-stale-open-hint', duration: 4500 },
          );
        }
        return;
      }
      const msg = extractErrorMessage(err);
      if (/ya hay una caja abierta/i.test(msg)) {
        try {
          const fresh = await listTpvRegisterSessionsRequest(
            dataUserId,
            tpvGateSessionsQueryOpts(scopeBusinessIdRef.current || undefined),
          );
          const merged = mergeTpvRegisterSessionsPreservingOpen(sessions, fresh);
          setSessions(merged);
          const again = pickNewestOpenRegisterSessionForStore(
            merged,
            pdvId,
            pointsOfSale,
            openAlternateRefs,
          );
          if (again && !isTpvRegisterSessionStaleOpen(again)) {
            attachOpenSession(again, { preferredStoreId: pdvId });
            return;
          }
        } catch {
          /* ignore */
        }
        toast.info('Ya hay una caja abierta en esta tienda', { id: 'tpv-continue-register', duration: 2500 });
        return;
      }
      toast.error(toUserFacingMessage(err, 'No se pudo abrir la caja'));
    }
    } finally {
      releaseOpenLock();
    }
  };

  const handleClose = async (
    counts: CashDenominationCount,
    notes: string,
    aggregatorRows: AggregatorCashRow[] = [],
    productClosingCounts?: TpvRegisterSession['productClosingCounts'],
    appsClosingExtras?: {
      brandTotalsByChannel?: Record<string, Record<string, number>>;
      unpaidCashByBrandByChannel?: Record<string, Record<string, number>>;
      unpaidCardByBrandByChannel?: Record<string, Record<string, number>>;
      closingBrandLabels?: Record<string, string>;
      brandTpvTotals?: Record<string, { efectivo: number; tarjeta: number }>;
    },
    nextDayInitialCash?: number,
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
    if (nextDayInitialCash == null || !Number.isFinite(Number(nextDayInitialCash)) || Number(nextDayInitialCash) < 0) {
      toast.error('Indica el fondo que queda en caja antes de cerrar');
      return;
    }
    setClosingBusy(true);
    const leaveForTomorrow = Math.max(0, Math.round(Number(nextDayInitialCash) * 100) / 100);
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
    const brandTotalsByChannel = appsClosingExtras?.brandTotalsByChannel;
    const unpaidCashByBrandByChannel = appsClosingExtras?.unpaidCashByBrandByChannel;
    const unpaidCardByBrandByChannel = appsClosingExtras?.unpaidCardByBrandByChannel;
    const closingBrandLabels = appsClosingExtras?.closingBrandLabels;
    const closingBrandSheetIds = appsClosingExtras?.closingBrandSheetIds;
    const brandTpvTotals = appsClosingExtras?.brandTpvTotals;
    const hasBrandTotals = Boolean(
      brandTotalsByChannel
      && Object.values(brandTotalsByChannel).some((m) => m && Object.keys(m).length > 0),
    );
    const hasUnpaidCashByBrand = Boolean(
      unpaidCashByBrandByChannel
      && Object.values(unpaidCashByBrandByChannel).some((m) => m && Object.keys(m).length > 0),
    );
    const hasUnpaidCardByBrand = Boolean(
      unpaidCardByBrandByChannel
      && Object.values(unpaidCardByBrandByChannel).some((m) => m && Object.keys(m).length > 0),
    );
    const hasClosingLabels = Boolean(
      closingBrandLabels && Object.keys(closingBrandLabels).length > 0,
    );
    const hasClosingSheetIds = Boolean(
      closingBrandSheetIds && Object.keys(closingBrandSheetIds).length > 0,
    );
    const hasBrandTpvTotals = Boolean(
      brandTpvTotals
      && Object.values(brandTpvTotals).some(
        (p) => p && (Number(p.efectivo) > 0 || Number(p.tarjeta) > 0),
      ),
    );
    // P/B/T: siempre persistir lo declarado en el cierre (aunque sea 0).
    const productCountsToSave: NonNullable<TpvRegisterSession['productClosingCounts']> = {
      pizza: Math.max(0, Math.floor(Number(productClosingCounts?.pizza) || 0)),
      burger: Math.max(0, Math.floor(Number(productClosingCounts?.burger) || 0)),
      taco: Math.max(0, Math.floor(Number(productClosingCounts?.taco) || 0)),
      ...(productClosingCounts?.byChannel
        ? { byChannel: productClosingCounts.byChannel }
        : {}),
    };
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
      nextDayInitialCash: leaveForTomorrow,
      summary,
      aggregatorClosingTotals,
      aggregatorClosingCash,
      aggregatorClosingCard,
      productClosingCounts: productCountsToSave,
      ...(hasBrandTotals ? { aggregatorClosingBrandTotals: brandTotalsByChannel } : {}),
      ...(hasUnpaidCashByBrand
        ? { aggregatorClosingUnpaidCashByBrand: unpaidCashByBrandByChannel }
        : {}),
      ...(hasUnpaidCardByBrand
        ? { aggregatorClosingUnpaidCardByBrand: unpaidCardByBrandByChannel }
        : {}),
      ...(hasClosingLabels ? { closingBrandLabels } : {}),
      ...(hasClosingSheetIds ? { closingBrandSheetIds } : {}),
      ...(hasBrandTpvTotals ? { closingBrandTpvTotals: brandTpvTotals } : {}),
      closingValidationStatus: autoValidated ? 'validated' : 'pending',
      ...(autoValidated
        ? {
            closingValidatedAt: new Date().toISOString(),
            closingValidatedBy: 'Sistema (sin movimientos)',
            closingValidationNotes: 'Cierre automático: turno sin ventas ni descuadre.',
          }
        : {}),
    };
    const applyClosedLocally = (updated: TpvRegisterSession, opts?: { offline?: boolean }) => {
      stickyOpenSessionRef.current = null;
      writeTpvOpenRegisterLatch(null);
      clearClosingFormDraft(String(updated._id || session._id || ''));
      setSessions((prev) => {
        const id = String(updated._id || '');
        const exists = prev.some((s) => s._id === id);
        return exists
          ? prev.map((s) => (s._id === id ? updated : s))
          : [...prev, updated];
      });
      window.dispatchEvent(new CustomEvent(TPV_SESSION_SYNC_EVENT, { detail: updated }));
      setShowClosing(false);
      setClosingSession(null);
      setPostCloseSession(updated);
      setPostCloseAggregatorRows(aggregatorRows);
      setPostCloseShowDetail(false);
      if (updated.closingBrandLabels && Object.keys(updated.closingBrandLabels).length > 0) {
        setPostCloseBrandLabels((prev) => ({ ...prev, ...updated.closingBrandLabels }));
      }
      if (opts?.offline) {
        toast.success(
          `Caja cerrada sin red. Se subirá al volver la conexión. Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
        );
        return;
      }
      toast.success(
        autoValidated
          ? `Caja cerrada (sin ventas, validada automáticamente). Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`
          : `Caja cerrada. Pendiente de validación gerente. Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
      );
      // El Excel de Facturación no se descarga al cerrar: queda en el servidor;
      // el CEO lo baja a mano desde Caja → Facturación.
      if (!autoValidated) {
        void createNotification({
          level: Math.abs(diff) >= 20 ? 'warning' : 'info',
          category: 'tpv',
          title: 'Cierre de caja pendiente de validación',
          message: `${session.workerName} cerró ${session.pointOfSaleName || 'caja'} (${session.terminalName || 'TPV'}). Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`,
          entityId: updated._id,
          entityType: 'tpv_register_session',
          route: isRestaurantBusinessType(currentBusiness?.businessType)
            ? '/saas/caja'
            : '/saas/vertical/delivery/caja',
          metadata: { difference: diff, pointOfSaleId: session.pointOfSaleId },
        }).catch(() => null);
      }
    };

    try {
      const offlineClose = !isBrowserOnline();
      if (offlineClose) {
        const closedLocal = {
          ...(closedPayload as TpvRegisterSession),
          _id: session._id,
          _rev: session._rev,
        };
        enqueueTpvOfflineItem('register_close', { userId: dataUserId, session: closedLocal });
        applyClosedLocally(closedLocal, { offline: true });
        return;
      }
      const updated = await updateTpvRegisterSessionRequest(dataUserId, closedPayload as TpvRegisterSession);
      applyClosedLocally(updated);
    } catch (error) {
      const msg = extractErrorMessage(error);
      const looksNetwork =
        !isBrowserOnline()
        || /failed to fetch|network|timeout|offline|ERR_INTERNET|Load failed/i.test(msg);
      if (looksNetwork) {
        const closedLocal = {
          ...(closedPayload as TpvRegisterSession),
          _id: session._id,
          _rev: session._rev,
        };
        enqueueTpvOfflineItem('register_close', { userId: dataUserId, session: closedLocal });
        applyClosedLocally(closedLocal, { offline: true });
      } else {
        toast.error(toUserFacingMessage(error, 'Error al cerrar la caja. Inténtalo de nuevo.'));
      }
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

      const writeSessionsLocal = (nextSession: TpvRegisterSession) => {
        sessionsRef.current = sessionsRef.current.map((s) =>
          s._id === nextSession._id ? nextSession : s,
        );
        setSessions((prev) => prev.map((s) => (s._id === nextSession._id ? nextSession : s)));
      };

      for (let attempt = 0; attempt < 5; attempt++) {
        const current = sessionsRef.current.find((s) => s._id === sessionId);
        if (!current || !isTpvRegisterSessionOpen(current)) return;

        // Mismo pedido+método+importe ya en caja → no volver a sumar (race airbag/409).
        // Pagos divididos (allowMultiple) no pasan por este corte.
        if (
          fullTx.type === 'sale'
          && !isAllowMultipleSaleTx(tx)
        ) {
          const oid = String(fullTx.orderId || fullTx.linkedDeliveryOrderId || '').trim();
          if (
            oid
            && sessionHasIdenticalSaleForOrder(
              current,
              oid,
              fullTx.paymentMethod,
              Number(fullTx.amount || 0),
            )
          ) {
            return;
          }
        }

        const updatedTxs = [...(current.transactions || []), fullTx];
        const patch = applySessionTransactions(current, updatedTxs);
        const nextSession = { ...current, ...patch };

        // Airbag: sin red o Couch caído → caja local siempre; sync después.
        if (!isBrowserOnline()) {
          enqueueTpvOfflineItem('register_tx', { userId: uid, session: nextSession, tx: fullTx });
          writeSessionsLocal(nextSession);
          if (isTpvCashMovementTx(fullTx.type)) {
            const label = TPV_CASH_TX_LABELS[fullTx.type] || 'Movimiento';
            toast.info(`${label} en modo local. Efectivo esperado: ${calcTpvExpectedCash(nextSession).toFixed(2)}€`);
            setShowCashOps(false);
          }
          return;
        }

        try {
          const updated = await updateTpvRegisterSessionRequest(uid, nextSession);
          writeSessionsLocal(updated);
          if (isTpvCashMovementTx(fullTx.type)) {
            const label = TPV_CASH_TX_LABELS[fullTx.type] || 'Movimiento';
            toast.success(`${label} de ${fullTx.amount.toFixed(2)}€ registrada. Efectivo esperado: ${calcTpvExpectedCash(updated).toFixed(2)}€`);
            setShowCashOps(false);
          }
          return;
        } catch {
          if (attempt < 4) {
            try {
              const refreshed = await listTpvRegisterSessionsRequest(
                uid,
                tpvGateSessionsQueryOpts(scopeBusinessIdRef.current || undefined),
              );
              const nextList = mergeTpvRegisterSessionsPreservingOpen(
                sessionsRef.current,
                refreshed.filter((s) =>
                  shouldKeepTpvSessionInList(s, pointsOfSale, scopeBusinessIdRef.current),
                ),
              );
              sessionsRef.current = nextList;
              setSessions(nextList);
            } catch {
              /* reintento con copia local */
            }
            continue;
          }
          // Couch/API caído con “online”: no romper TPV — queda en local y cola.
          enqueueTpvOfflineItem('register_tx', { userId: uid, session: nextSession, tx: fullTx });
          writeSessionsLocal(nextSession);
          if (isTpvCashMovementTx(fullTx.type)) {
            toast.info(
              `Servidor no disponible — movimiento en local. Efectivo esperado: ${calcTpvExpectedCash(nextSession).toFixed(2)}€`,
            );
            setShowCashOps(false);
          }
        }
      }
    };

    txQueueRef.current = txQueueRef.current.then(run, run);
    await txQueueRef.current;
  }, [applySessionTransactions, pointsOfSale]);

  const removeCashMovement = useCallback(async (txId: string, voidReason: string) => {
    const reason = String(voidReason || '').trim();
    if (reason.length < 2) {
      toast.error('Indica el motivo de la eliminación');
      return;
    }
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
        const voidedEntry = {
          id: `void-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          originalTransactionId: target.id,
          type: target.type as 'cash_in' | 'cash_out' | 'return',
          amount: Math.round(Number(target.amount || 0) * 100) / 100,
          originalDescription: String(target.description || '').trim(),
          voidReason: reason,
          voidedAt: new Date().toISOString(),
          voidedBy: String(target.registeredBy || current.workerName || 'Tablet').trim() || 'Tablet',
          originalDate: String(target.date || ''),
        };
        const nextSession: TpvRegisterSession = {
          ...current,
          ...patch,
          summary: buildTpvRegisterSummary({ ...current, ...patch }),
          voidedCashMovements: [...(current.voidedCashMovements || []), voidedEntry],
          removedTransactionIds: [id],
        };

        if (!isBrowserOnline()) {
          enqueueTpvOfflineItem('register_tx', { userId: uid, session: nextSession, removedTransactionId: id });
          setSessions((prev) =>
            prev.map((s) => (s._id === sessionId ? { ...nextSession, removedTransactionIds: undefined } : s)),
          );
          const label = TPV_CASH_TX_LABELS[target.type] || 'Movimiento';
          toast.info(
            `${label} eliminado en cola local. Efectivo esperado: ${calcTpvExpectedCash(nextSession).toFixed(2)}€`,
          );
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
              const refreshed = await listTpvRegisterSessionsRequest(
                uid,
                tpvGateSessionsQueryOpts(scopeBusinessIdRef.current || undefined),
              );
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
      // Código tablet: quien abre es el elegido en apertura, no la cuenta del dispositivo.
      isWorkerUser: isWorkerUser && !isTabletSession,
      vacationBlockedIds,
    }),
    [clockedInWorkersLoading, activeStaff, selectedOrderTakerId, currentUserId, isWorkerUser, isTabletSession, vacationBlockedIds],
  );

  /** Evita el flash de «Fichaje requerido / Comprobando…» (~1s) al abrir o recuperar caja. */
  const [clockInGateSettled, setClockInGateSettled] = useState(false);
  useEffect(() => {
    if (clockInGate.allowed || clockInGate.reason === 'loading') {
      setClockInGateSettled(false);
      return;
    }
    const t = window.setTimeout(() => setClockInGateSettled(true), 500);
    return () => window.clearTimeout(t);
  }, [clockInGate.allowed, clockInGate.reason]);
  const showClockInGateOverlay =
    clockInGateSettled
    && !clockInGate.allowed
    && clockInGate.reason !== 'loading'
    && !showClockIn;

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
          toast.warning(`Sala pendiente: ${check.warnings.join(' · ')}`, { duration: 6000 });
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
      void leaveTpvTabletSession(logout, { navigate });
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isTabletSession, showClosing, logout, navigate]);

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
    // Tablet / código de tienda: saltar YA al código (no vaciar UI antes → flash blanco).
    if (isTabletSession) {
      void leaveTpvTabletSession(logout, { navigate });
      return;
    }
    setPostCloseSession(null);
    setPostCloseAggregatorRows([]);
    setPostCloseShowDetail(false);
    setOpeningResume(null);
    // Bar/restaurante CEO: quedarse en el TPV para reabrir caja (no saltar a Sala/SaaS).
    if (isRestaurantVertical) {
      return;
    }
    // Delivery CEO / gerente web: salir del TPV a la operativa SaaS.
    if (!isWorkerUser) {
      navigate(opsHomePath, { replace: true });
      return;
    }
    // Trabajador web: se queda en apertura de caja (mismo gate), sin ir al SaaS CEO.
  }, [isTabletSession, isRestaurantVertical, isWorkerUser, logout, navigate, opsHomePath]);

  const requestClockIn = useCallback(() => setShowClockIn(true), []);

  const registerContextValue = useMemo((): TpvRegisterContextType | null => {
    // Si activeSession parpadea un frame, mantener el contexto con sticky (pedido / «+»).
    const session =
      (isTpvRegisterSessionOpen(boardSession) ? boardSession : null)
      || (isTpvRegisterSessionOpen(activeSession) ? activeSession : null)
      || (
        isTpvRegisterSessionOpen(stickyOpenSessionRef.current)
          ? stickyOpenSessionRef.current
          : null
      );
    if (!session) return null;
    return {
      session,
      addTransaction,
      performCashCount,
      addIncident,
      requestClose: () => void handleRequestClose(),
      requestCashCount: () => setShowCashCount(true),
      requestIncident: () => setShowIncident(true),
      expectedCash: calcTpvExpectedCash(session),
      clockedInWorkers: activeStaff,
      clockedInWorkersLoading,
      selectedOrderTakerId,
      setSelectedOrderTakerId,
      refreshClockedInWorkers: () => refreshClockedInWorkers({ silent: true }),
      requestClockIn,
    };
  }, [
    boardSession,
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
    businessLoading && !(isTabletCajaScope && scopeBusinessId);

  if (waitForBusinessList || (!scopeBusinessId && businessesFetchSettled && !isTabletCajaScope)) {
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
    !hasTabletStoreCode
    && !openingScreenUnlocked
    && (loading || openingRecoverHold)
    && !isTpvRegisterSessionOpen(boardSession)
    && !isTpvRegisterSessionOpen(stickyOpenSessionRef.current)
    && !isTpvRegisterSessionOpen(openingKnownOpenSession)
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
                  openingScreenUnlockedRef.current = false;
                  setOpeningScreenUnlocked(false);
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

  if (postCloseSession && !isTpvRegisterSessionOpen(boardSession)) {
    const excelClosed = excelLikeAmountsFromClosedSession(postCloseSession, {
      ...postCloseBrandLabels,
      ...(postCloseSession.closingBrandLabels || {}),
    });
    const restaurantSummary = postCloseSession.summary;
    const postCloseAggRows = postCloseAggregatorRows.length > 0
      ? postCloseAggregatorRows
      : aggregatorRowsFromClosingTotals(
        getClosingAggregatorPlatforms(),
        postCloseSession.aggregatorClosingTotals || postCloseSession.summary?.salesByChannel,
        postCloseSession.aggregatorClosingCash,
        postCloseSession.aggregatorClosingCard,
      );
    return wrapShell(
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xl w-full max-w-lg max-h-[min(92svh,780px)] flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-800 relative">
            {!isWorkerUser && !isTabletSession ? (
              <button
                type="button"
                onClick={leavePostCloseScreen}
                className="absolute right-2 top-2 p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="Salir del TPV"
                title="Salir del TPV"
              >
                <X className="w-5 h-5 text-stone-500" />
              </button>
            ) : null}
            <div className="flex items-center gap-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-stone-700 dark:text-stone-300" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-stone-900 dark:text-stone-100">Caja cerrada</h1>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {postCloseSession.pointOfSaleName ? `${postCloseSession.pointOfSaleName} · ` : ''}
                  {postCloseSession.terminalName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
            {postCloseShowDetail ? (
              <div className="space-y-3 min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Detalle del turno
                  </p>
                  <button
                    type="button"
                    onClick={() => setPostCloseShowDetail(false)}
                    className="text-xs font-semibold text-[#2563EB] hover:underline shrink-0"
                  >
                    Volver al resumen
                  </button>
                </div>
                {!isRestaurantVertical ? (
                  <AggregatorCashSummary
                    rows={postCloseAggRows}
                    title="Apps del cierre"
                  />
                ) : null}
                <RegisterClosingDetailPanel
                  session={postCloseSession}
                  aggregatorRows={postCloseAggRows}
                  variant={isRestaurantVertical ? 'restaurant' : 'delivery'}
                />
              </div>
            ) : isRestaurantVertical ? (
              restaurantSummary ? (
                <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950/40 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Resumen del turno
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Ventas</span>
                    <span className="font-bold tabular-nums">{formatMoneyEs(Number(restaurantSummary.totalSales || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Efectivo</span>
                    <span className="font-bold tabular-nums">{formatMoneyEs(Number(restaurantSummary.salesByMethod?.efectivo || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Tarjeta</span>
                    <span className="font-bold tabular-nums">{formatMoneyEs(Number(restaurantSummary.salesByMethod?.tarjeta || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Entradas</span>
                    <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                      +{formatMoneyEs(Number(restaurantSummary.totalCashIn || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Salidas</span>
                    <span className="font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      −{formatMoneyEs(Number(restaurantSummary.totalCashOut || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-stone-200 dark:border-stone-700 pt-2">
                    <span className="text-stone-500">Contado / esperado</span>
                    <span className="font-bold tabular-nums">
                      {formatMoneyEs(excelClosed.counted)} / {formatMoneyEs(excelClosed.expected)}
                    </span>
                  </div>
                  <div className={`flex justify-between text-sm font-bold ${
                    excelClosed.diff === 0 ? 'text-emerald-700' : 'text-amber-800'
                  }`}>
                    <span>{excelClosed.diff === 0 ? 'Cuadra' : excelClosed.diff > 0 ? 'Sobra' : 'Falta'}</span>
                    <span className="tabular-nums">
                      {excelClosed.diff >= 0 ? '+' : ''}{formatMoneyEs(excelClosed.diff)}
                    </span>
                  </div>
                  <CajaCashMovementsList session={postCloseSession} title="Detalle entradas / salidas" />
                </div>
              ) : null
            ) : (
              <ClosingExcelLikeSummary
                amounts={excelClosed}
                brandLabels={postCloseBrandLabels}
              />
            )}
          </div>

          <div className="shrink-0 p-3 sm:p-4 border-t border-stone-200 dark:border-stone-800 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPostCloseShowDetail((v) => !v)}
              className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              {postCloseShowDetail ? 'Volver al resumen' : 'Más detalle del turno'}
            </button>
            <button
              type="button"
              onClick={() => void handleReopenClosed(postCloseSession)}
              className="w-full py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reabrir por error
            </button>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => startOpenAnotherAfterClose(postCloseSession)}
                className="flex-1 py-3 rounded-xl border-2 border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-[#2563EB] dark:text-blue-200 font-semibold hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
              >
                Abrir otra caja
              </button>
              {isTabletSession || isWorkerUser ? (
                <button
                  type="button"
                  onClick={leavePostCloseScreen}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {isTabletSession ? 'Salir a Vertial' : 'Volver'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={leavePostCloseScreen}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Salir a Vertial
                </button>
              )}
            </div>
          </div>
        </div>
      </div>,
    );
  }

  if (!isTpvRegisterSessionOpen(boardSession) || needsResumeAck) {
    if (isWorkerUser && !isTabletSession && !loading && !resolveEffectiveSalesPointRef({
      employmentSalesPointId: user?.employment?.salesPointId,
      workCenters,
      pointsOfSale,
    })) {
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

    if (isWorkerUser && !isTabletSession && !loading && resolveEffectiveSalesPointRef({
      employmentSalesPointId: user?.employment?.salesPointId,
      workCenters,
      pointsOfSale,
    }) && pointsOfSale.length === 0) {
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

    const openingRestrictedPdvId = resolvedStorePickId
      || (needsResumeAck ? String(boardSession?.pointOfSaleId || '').trim() : '')
      || null;

    // Entrada por código TPV: misma UI de apertura que tienda/CEO, pero sin
    // poderes de gerente (cambiar tienda / volver a cuenta).
    const tabletEntryLocked = Boolean(isTabletCajaScope || tabletBinding);

    const openingStoreLabel =
      tabletBinding?.pdvName
      || tabletBinding?.businessName
      || pointsOfSale.find((p) => p._id === openingRestrictedPdvId)?.name
      || workCenters.find((w) => w._id === openingRestrictedPdvId)?.name
      || (openingRestrictedPdvId ? 'Tienda' : undefined);

    const openingScreen = (
      <OpeningScreen
        key={
          openingResume
            ? `resume-${openingResume.key}-${openingRestrictedPdvId || 'none'}`
            : `opening-${openingRestrictedPdvId || 'none'}`
        }
        onOpen={handleOpen}
        onContinueExistingOpen={handleContinueExistingOpen}
        loading={loading}
        openingBusy={openingBusy}
        pointsOfSale={pointsOfSale}
        workCenters={workCenters}
        workerOptions={openingWorkerOptions}
        registerSessions={sessions}
        isManagerView={!isWorkerUser && !tabletEntryLocked}
        tabletStoreLabel={openingStoreLabel}
        tabletWorkCenterId={tabletBinding?.workCenterId || null}
        knownOpenSession={openingKnownOpenSession}
        restrictedToPdvId={openingRestrictedPdvId}
        restaurantOpening={isRestaurantVerticalChrome}
        onOpeningPdvChange={handleOpeningPdvChange}
        clockInBusinessId={businessId || ''}
        clockInOwnerUserId={dataUserId || ''}
        resumeAfterClose={openingResume}
        onClockInChanged={() => {
          void refreshClockedInWorkers({ silent: true });
        }}
        onClearStorePick={
          !isWorkerUser && !tabletEntryLocked
            ? () => {
                const bid = resolveBusinessScopeId(currentBusiness);
                if (bid && dataUserId) writeOpsSelectedPdvId(currentBusiness?.businessType, bid, dataUserId, null);
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

  // Tras el guard, boardSession es la caja open (active o sticky).
  const openBoardSession = boardSession!;
  writeTpvOpenRegisterLatch(openBoardSession);

  return wrapShell(
    <TpvRegisterBoardReadyContext.Provider value={true}>
      <TpvStatusBarQuickActionsContext.Provider value={statusBarQuickActionsApi}>
      <div className={tpvFrameClass}>
        <RegisterStatusBar
          session={openBoardSession}
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
        <RegisterCashOpsStrip
          session={openBoardSession}
          compact={compactRegisterChrome}
          onRemove={(txId) => {
            const tx = (openBoardSession.transactions || []).find((t) => t.id === txId);
            if (!tx || !isTpvCashMovementTx(tx.type)) {
              toast.error('Solo se pueden eliminar entradas, salidas o devoluciones');
              return;
            }
            setVoidCashTx(tx);
          }}
          removingId={voidCashBusy && voidCashTx ? voidCashTx.id : null}
        />
        <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col overflow-hidden relative">
          {!showClockInGateOverlay ? null : (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/55 backdrop-blur-[2px] p-4">
              <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mx-auto">
                    <LogIn className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {clockInGate.reason === 'vacation_blocked' ? 'No disponible' : 'Fichaje requerido'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {tpvClockInBlockMessage(clockInGate.reason, isWorkerUser && !isTabletSession)}
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
      {showCashCount && (
        <TpvGatePortal>
          <CashCountModal session={openBoardSession} onConfirm={(d, n) => performCashCount(openBoardSession.workerName, d, n)} onCancel={() => setShowCashCount(false)} />
        </TpvGatePortal>
      )}
      {showCashOps && (
        <TpvGatePortal>
          <TpvCashOpsModal
            registeredBy={openBoardSession.workerName}
            workers={clockedInWorkers}
            workersLoading={clockedInWorkersLoading}
            onClose={() => setShowCashOps(false)}
            onConfirm={async (tx) => { await addTransaction(tx); }}
          />
        </TpvGatePortal>
      )}
      {voidCashTx && (
        <TpvGatePortal>
          <TpvCashMovementVoidModal
            tx={voidCashTx}
            loading={voidCashBusy}
            onClose={() => {
              if (voidCashBusy) return;
              setVoidCashTx(null);
            }}
            onConfirm={async (reason) => {
              setVoidCashBusy(true);
              try {
                await removeCashMovement(voidCashTx.id, reason);
                setVoidCashTx(null);
              } finally {
                setVoidCashBusy(false);
              }
            }}
          />
        </TpvGatePortal>
      )}
      {showIncident && (
        <TpvGatePortal>
          <IncidentModal session={openBoardSession} onConfirm={addIncident} onCancel={() => setShowIncident(false)} />
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
