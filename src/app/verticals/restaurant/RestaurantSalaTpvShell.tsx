/**
 * Shell TPV sala (CEO / tablet).
 * Flujo: local → fichaje + caja → plano mesas → TPV de mesa.
 *
 * Importante: no disparar notify/refresh en bucle (eso “no para de abrirse”).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { TpvChromeScope } from '../../context/TpvChromeContext';
import { TpvRegisterGate } from '../../components/saas/TpvRegisterGate';
import { CeoTpvStorePicker } from '../../components/saas/CeoTpvStorePicker';
import { TpvOfflineBanner } from '../../components/saas/TpvOfflineBanner';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { coerceSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import {
  notifyRestaurantActiveStoreChanged,
  readRestaurantOpsSelectedPdvId,
  writeRestaurantOpsSelectedPdvId,
} from './restaurantOpsPdvSelection';
import { needsCeoTpvStoreBootstrap } from '../../lib/ceoTpvStoreBootstrap';
import { bootstrapRestaurantCeoTpvStores, buildRestaurantCeoTpvStoreRows } from './ceoTpvStores';
import { RestaurantTpvFloorBoard } from './RestaurantTpvFloorBoard';
import { RestaurantTabletBottomNav } from './RestaurantTabletBottomNav';
import type { DeliverySidebarStoreRow, PointOfSale } from '../../lib/deliveryApi';
import { isBrowserOnline } from '../../lib/tpvTabletOffline';
import { flushTpvOfflineQueue } from '../../lib/tpvOfflineSync';
import { WorkerTpvStockReview } from '../../pages/saas/worker/WorkerTpvStockReview';
import {
  consumeTpvStockReviewLaunch,
  TPV_OPEN_STOCK_REVIEW_EVENT,
} from '../../lib/tpvStockReview';

const SALA_PATH = '/saas/sala';
const RESTAURANT_OPS_PATH = '/saas/restaurant-ops';

type Props = {
  tabletMode?: boolean;
};

export function RestaurantSalaTpvShell({ tabletMode = false }: Props) {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const [stockOpen, setStockOpen] = useState(() => consumeTpvStockReviewLaunch());

  useEffect(() => {
    const onOpen = () => setStockOpen(true);
    window.addEventListener(TPV_OPEN_STOCK_REVIEW_EVENT, onOpen);
    return () => window.removeEventListener(TPV_OPEN_STOCK_REVIEW_EVENT, onOpen);
  }, []);

  const {
    pointsOfSale,
    allPointsOfSale,
    retailWorkCenters,
    activeSalesPointId,
    setActiveSalesPoint,
    loading: storesLoading,
    refresh: refreshStores,
  } = useActiveStoreScope();
  const navigate = useNavigate();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [forceStorePicker, setForceStorePicker] = useState(false);
  const [ceoBootstrapLoading, setCeoBootstrapLoading] = useState(false);
  const [pdvWaitTimedOut, setPdvWaitTimedOut] = useState(false);
  const [seedPdvs, setSeedPdvs] = useState<PointOfSale[]>([]);
  const [seedRows, setSeedRows] = useState<DeliverySidebarStoreRow[]>([]);
  /** Último PDV bueno: si el scope vacía la lista un instante, no desmontar el gate. */
  const [stableGatePdvId, setStableGatePdvId] = useState<string | null>(null);

  const ceoBootstrapDoneRef = useRef(false);
  const ceoBootstrapInflightRef = useRef(false);
  const lastBusinessIdRef = useRef<string | null>(null);
  const pinnedPdvRef = useRef<string | null>(null);

  // Solo al cambiar de empresa de verdad (no en cada render / Strict Mode).
  // Primer mount: no borrar pin — hidratar desde storage para no desmontar el gate.
  useEffect(() => {
    if (!businessId) return;
    if (lastBusinessIdRef.current === businessId) return;
    const prev = lastBusinessIdRef.current;
    lastBusinessIdRef.current = businessId;

    if (prev && prev !== businessId) {
      ceoBootstrapDoneRef.current = false;
      ceoBootstrapInflightRef.current = false;
      pinnedPdvRef.current = null;
      setSelectedPdvId(null);
      setForceStorePicker(false);
      setPdvWaitTimedOut(false);
      setStableGatePdvId(null);
      setSeedPdvs([]);
      setSeedRows([]);
    }

    if (!dataUserId) return;
    const saved = String(readRestaurantOpsSelectedPdvId(businessId, dataUserId) || '').trim();
    if (!saved) return;
    if (!pinnedPdvRef.current) pinnedPdvRef.current = saved;
    setStableGatePdvId((prevId) => prevId || saved);
    setSelectedPdvId((prevId) => prevId || saved);
  }, [businessId, dataUserId]);

  // Vaciar cola offline de sala al entrar en TPV con red.
  useEffect(() => {
    if (!isBrowserOnline()) return;
    void flushTpvOfflineQueue();
  }, []);

  const pdvPool = useMemo(() => {
    const fromScope = pointsOfSale.filter((p) => p.active !== false);
    if (fromScope.length > 0) return fromScope;
    const fromAll = allPointsOfSale.filter((p) => p.active !== false);
    if (fromAll.length > 0) return fromAll;
    return seedPdvs.filter((p) => p.active !== false);
  }, [pointsOfSale, allPointsOfSale, seedPdvs]);

  const storeRows = useMemo(() => {
    const built = buildRestaurantCeoTpvStoreRows(
      retailWorkCenters,
      pdvPool,
      currentBusiness,
      businesses,
    );
    if (built.length > 0) return built;
    return seedRows;
  }, [retailWorkCenters, pdvPool, currentBusiness, businesses, seedRows]);

  const shouldBootstrap = useMemo(() => {
    if (tabletMode) return false;
    if (!businessesFetchSettled || !businessId || !dataUserId || !user || !currentBusiness) {
      return false;
    }
    if (ceoBootstrapDoneRef.current) return false;
    if (pdvPool.length > 0) {
      return needsCeoTpvStoreBootstrap(retailWorkCenters, pointsOfSale, storeRows);
    }
    return true;
  }, [
    tabletMode,
    businessesFetchSettled,
    businessId,
    dataUserId,
    user,
    currentBusiness,
    retailWorkCenters,
    pointsOfSale,
    storeRows,
    pdvPool.length,
  ]);

  useEffect(() => {
    if (!shouldBootstrap || ceoBootstrapDoneRef.current || ceoBootstrapInflightRef.current) {
      return;
    }
    if (!user || !currentBusiness) return;

    let cancelled = false;
    ceoBootstrapInflightRef.current = true;
    setCeoBootstrapLoading(true);

    void (async () => {
      try {
        const state = await bootstrapRestaurantCeoTpvStores(user, currentBusiness, businesses, {
          accountBusinessCount: businesses.length,
        });
        if (cancelled) return;

        const nextRows = buildRestaurantCeoTpvStoreRows(
          state.workCenters || [],
          state.pointsOfSale || [],
          currentBusiness,
          businesses,
        );
        const rowPdvIds = new Set(
          nextRows.map((r) => String(r.pdvId || '').trim()).filter(Boolean),
        );
        const nextPdvs = (state.pointsOfSale || []).filter((p) => {
          if (p.active === false) return false;
          if (rowPdvIds.size === 0) return true;
          return rowPdvIds.has(String(p._id || '').trim());
        });

        setSeedPdvs(nextPdvs);
        setSeedRows(nextRows);
        ceoBootstrapDoneRef.current = true;

        // Refresco silencioso: SIN work-centers:changed (eso reabría el gate en bucle).
        // force:false → no pisar tiendas visibles si el fetch llega vacío un instante.
        void refreshStores({ force: false }).catch(() => null);
      } catch {
        ceoBootstrapDoneRef.current = true;
      } finally {
        ceoBootstrapInflightRef.current = false;
        if (!cancelled) setCeoBootstrapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // No resetear inflight aquí: Strict Mode cancela y relanzaría bootstrap en bucle.
    };
  }, [shouldBootstrap, user, currentBusiness, businesses, refreshStores]);

  const effectiveStoresLoading = storesLoading || ceoBootstrapLoading;
  const activePdvs = pdvPool;

  const resolvedInitialPdvId = useMemo(() => {
    if (forceStorePicker || !businessId || !dataUserId || activePdvs.length === 0) return null;
    const saved = readRestaurantOpsSelectedPdvId(businessId, dataUserId);
    return coerceSelectedPdvId(activePdvs, saved || activeSalesPointId);
  }, [forceStorePicker, businessId, dataUserId, activePdvs, activeSalesPointId]);

  const scopedSelectedPdvId = useMemo(() => {
    const id = String(selectedPdvId || '').trim();
    // Mantener id aunque el scope filtre mal un instante (enviar a cocina / refresh).
    return id || null;
  }, [selectedPdvId]);

  const effectivePdvId = forceStorePicker
    ? null
    : (scopedSelectedPdvId || resolvedInitialPdvId || pinnedPdvRef.current || stableGatePdvId);

  // Fijar PDV una vez y no cambiar (evita remount del gate).
  useEffect(() => {
    if (!effectivePdvId) return;
    if (pinnedPdvRef.current === effectivePdvId && stableGatePdvId === effectivePdvId) return;
    pinnedPdvRef.current = effectivePdvId;
    setStableGatePdvId(effectivePdvId);
  }, [effectivePdvId, stableGatePdvId]);

  const gatePdvId = useMemo(() => {
    if (forceStorePicker) return undefined;
    // Nunca soltar el PDV si ya hay pin/storage: si el scope vacía o cambia la lista
    // al mandar a cocina, desmontar el gate → «Recuperando caja» / «Tarda más…».
    const pinned = String(
      pinnedPdvRef.current || stableGatePdvId || selectedPdvId || '',
    ).trim();
    if (pinned) return pinned;
    if (businessId && dataUserId) {
      const saved = String(readRestaurantOpsSelectedPdvId(businessId, dataUserId) || '').trim();
      if (saved) return saved;
    }
    return effectivePdvId || undefined;
  }, [
    forceStorePicker,
    effectivePdvId,
    stableGatePdvId,
    selectedPdvId,
    businessId,
    dataUserId,
  ]);

  const awaitingPdvResolution =
    !tabletMode
    && !forceStorePicker
    && !gatePdvId
    && activePdvs.length === 0
    && (
      effectiveStoresLoading
      || shouldBootstrap
      || !businessesFetchSettled
      || !businessId
      || !dataUserId
    );

  const noStoresConfigured =
    !tabletMode
    && !forceStorePicker
    && !gatePdvId
    && !effectiveStoresLoading
    && businessesFetchSettled
    && Boolean(businessId)
    && Boolean(dataUserId)
    && activePdvs.length === 0
    && ceoBootstrapDoneRef.current
    && pdvWaitTimedOut;

  useEffect(() => {
    if (!awaitingPdvResolution) {
      setPdvWaitTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setPdvWaitTimedOut(true), 5000);
    return () => window.clearTimeout(timer);
  }, [awaitingPdvResolution]);

  // Elegir local UNA vez, sin notify (el notify reabría el TPV en bucle).
  useEffect(() => {
    if (tabletMode || forceStorePicker || selectedPdvId || pinnedPdvRef.current) return;
    if (!businessId || !dataUserId || activePdvs.length === 0) return;
    const saved = readRestaurantOpsSelectedPdvId(businessId, dataUserId);
    const id = coerceSelectedPdvId(activePdvs, saved || activeSalesPointId);
    if (!id) return;
    pinnedPdvRef.current = id;
    setSelectedPdvId(id);
    setStableGatePdvId(id);
    if (activeSalesPointId !== id) {
      setActiveSalesPoint(id);
    }
    writeRestaurantOpsSelectedPdvId(businessId, dataUserId, id);
  }, [
    tabletMode,
    forceStorePicker,
    selectedPdvId,
    businessId,
    dataUserId,
    activePdvs,
    activeSalesPointId,
    setActiveSalesPoint,
  ]);

  const selectedPdvName = useMemo(() => {
    const id = gatePdvId || '';
    if (!id) return '';
    return (
      pdvPool.find((p) => p._id === id)?.name
      || pointsOfSale.find((p) => p._id === id)?.name
      || allPointsOfSale.find((p) => p._id === id)?.name
      || ''
    );
  }, [gatePdvId, pdvPool, pointsOfSale, allPointsOfSale]);

  const handleSelectStore = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id) return;
      pinnedPdvRef.current = id;
      setStableGatePdvId(id);
      if (businessId && dataUserId) {
        writeRestaurantOpsSelectedPdvId(businessId, dataUserId, id);
      }
      setActiveSalesPoint(id);
      setForceStorePicker(false);
      setSelectedPdvId(id);
      // Notify solo en elección manual explícita.
      notifyRestaurantActiveStoreChanged();
    },
    [businessId, dataUserId, setActiveSalesPoint],
  );

  const handleChangeStore = useCallback(() => {
    pinnedPdvRef.current = null;
    setStableGatePdvId(null);
    if (businessId && dataUserId) {
      writeRestaurantOpsSelectedPdvId(businessId, dataUserId, null);
    }
    setForceStorePicker(true);
    setSelectedPdvId(null);
  }, [businessId, dataUserId]);

  if (noStoresConfigured) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] flex-col items-center justify-center gap-4 bg-stone-100 p-6 text-center dark:bg-stone-950">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          No hay locales configurados
        </p>
        <p className="max-w-sm text-sm text-stone-500">
          Crea el local con PDV activo en Configuración antes de abrir el TPV.
        </p>
        <button
          type="button"
          onClick={() => navigate('/saas/settings/tienda')}
          className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Configurar local
        </button>
      </div>
    );
  }

  if (awaitingPdvResolution && !pdvWaitTimedOut) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] items-center justify-center bg-stone-100 dark:bg-stone-950">
        <div className="px-6 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Abriendo TPV sala…</p>
        </div>
      </div>
    );
  }

  if (awaitingPdvResolution && pdvWaitTimedOut) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] items-center justify-center bg-stone-100 dark:bg-stone-950">
        <div className="px-6 text-center">
          <p className="mb-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
            Tarda más de lo habitual en conectar
          </p>
          <p className="mb-4 text-sm text-stone-500">
            Puedes elegir el local a mano o volver al centro operativo.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setForceStorePicker(true)}
              className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Elegir local
            </button>
            <button
              type="button"
              onClick={() => navigate(RESTAURANT_OPS_PATH)}
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 dark:border-stone-600 dark:text-stone-200"
            >
              Centro operativo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!tabletMode && (!gatePdvId || forceStorePicker)) {
    return (
      <CeoTpvStorePicker
        storeName={currentBusiness?.name}
        storeRows={storeRows}
        pointsOfSale={activePdvs}
        loading={effectiveStoresLoading}
        restaurantMode
        onSelect={handleSelectStore}
        onBack={() => navigate(SALA_PATH, { replace: true })}
      />
    );
  }

  const tabletNav = tabletMode ? (
    <RestaurantTabletBottomNav active="mesas" />
  ) : null;

  return (
    <TpvChromeScope insetBottomBar={tabletMode} bottomBar={null}>
      <div className="fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
        <TpvOfflineBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TpvRegisterGate
            fillParent
            initialManagerPdvId={gatePdvId}
            onManagerStoreCleared={tabletMode ? undefined : handleChangeStore}
          >
            {stockOpen ? (
              <WorkerTpvStockReview onBack={() => setStockOpen(false)} />
            ) : (
              <RestaurantTpvFloorBoard
                pdvId={gatePdvId || null}
                pdvName={selectedPdvName}
                tabletMode={tabletMode}
                onChangeStore={tabletMode ? undefined : handleChangeStore}
              />
            )}
          </TpvRegisterGate>
        </div>
        {tabletNav}
      </div>
    </TpvChromeScope>
  );
}
