/**
 * Shell TPV sala (CEO / tablet).
 * Flujo Delivery-equivalente: local → fichaje + caja (TpvRegisterGate) → plano mesas.
 * No monta TpvRapidoPage ni WorkerTpvDelivery.
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
import {
  coerceSelectedPdvId,
  DELIVERY_ACTIVE_STORE_CHANGED,
  notifyDeliveryActiveStoreChanged,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../../lib/deliveryOpsPdvSelection';
import { needsCeoTpvStoreBootstrap } from '../../lib/ceoTpvStoreBootstrap';
import { RESTAURANT_CAJA_PATH } from '../../lib/retailOpsPaths';
import {
  bootstrapRestaurantCeoTpvStores,
  buildRestaurantCeoTpvStoreRows,
} from './ceoTpvStores';
import { RestaurantTpvFloorBoard } from './RestaurantTpvFloorBoard';

type Props = {
  tabletMode?: boolean;
};

export function RestaurantSalaTpvShell({ tabletMode = false }: Props) {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const {
    pointsOfSale,
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
  const ceoBootstrapDoneRef = useRef(false);
  const ceoBootstrapInflightRef = useRef(false);
  const lastSyncedStorePdvRef = useRef<string | null>(null);

  useEffect(() => {
    ceoBootstrapDoneRef.current = false;
    ceoBootstrapInflightRef.current = false;
  }, [businessId]);

  const storeRows = useMemo(
    () =>
      buildRestaurantCeoTpvStoreRows(
        retailWorkCenters,
        pointsOfSale,
        currentBusiness,
        businesses,
      ),
    [retailWorkCenters, pointsOfSale, currentBusiness, businesses],
  );

  const shouldBootstrap = useMemo(() => {
    if (tabletMode) return false;
    if (!businessesFetchSettled || !businessId || !dataUserId || !user || !currentBusiness) {
      return false;
    }
    return needsCeoTpvStoreBootstrap(retailWorkCenters, pointsOfSale, storeRows);
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
        await bootstrapRestaurantCeoTpvStores(user, currentBusiness, businesses, {
          accountBusinessCount: businesses.length,
        });
        if (cancelled) return;
        ceoBootstrapDoneRef.current = true;
        window.dispatchEvent(new Event('work-centers:changed'));
        await refreshStores();
      } catch {
        /* selector manual */
      } finally {
        ceoBootstrapInflightRef.current = false;
        if (!cancelled) setCeoBootstrapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ceoBootstrapInflightRef.current = false;
    };
  }, [shouldBootstrap, user, currentBusiness, businesses, refreshStores]);

  const effectiveStoresLoading = storesLoading || ceoBootstrapLoading;
  const activePdvs = useMemo(
    () => pointsOfSale.filter((p) => p.active !== false),
    [pointsOfSale],
  );

  const resolvedInitialPdvId = useMemo(() => {
    if (forceStorePicker || !businessId || !dataUserId || activePdvs.length === 0) return null;
    const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    return coerceSelectedPdvId(activePdvs, saved || activeSalesPointId);
  }, [forceStorePicker, businessId, dataUserId, activePdvs, activeSalesPointId]);

  const effectivePdvId = forceStorePicker ? null : (selectedPdvId || resolvedInitialPdvId);

  const awaitingPdvResolution =
    !tabletMode
    && !forceStorePicker
    && !effectivePdvId
    && activePdvs.length === 0
    && (effectiveStoresLoading || !businessesFetchSettled || !businessId || !dataUserId);

  useEffect(() => {
    lastSyncedStorePdvRef.current = null;
  }, [businessId]);

  useEffect(() => {
    if (forceStorePicker || !businessId || !dataUserId) return;
    const pdvId = coerceSelectedPdvId(
      activePdvs,
      readDeliveryOpsSelectedPdvId(businessId, dataUserId) || activeSalesPointId,
    );
    if (!pdvId) return;
    setSelectedPdvId((prev) => (prev === pdvId ? prev : pdvId));
    if (lastSyncedStorePdvRef.current === pdvId && activeSalesPointId === pdvId) return;
    if (activeSalesPointId !== pdvId) {
      lastSyncedStorePdvRef.current = pdvId;
      setActiveSalesPoint(pdvId);
      return;
    }
    lastSyncedStorePdvRef.current = pdvId;
  }, [
    forceStorePicker,
    businessId,
    dataUserId,
    activePdvs,
    activeSalesPointId,
    setActiveSalesPoint,
  ]);

  useEffect(() => {
    const onStore = () => {
      if (forceStorePicker || !businessId || !dataUserId) return;
      const saved = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
      const pdvId = coerceSelectedPdvId(activePdvs, saved || activeSalesPointId);
      if (pdvId) setSelectedPdvId(pdvId);
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [forceStorePicker, businessId, dataUserId, activePdvs, activeSalesPointId]);

  const selectedPdvName = useMemo(() => {
    if (!effectivePdvId) return '';
    return pointsOfSale.find((p) => p._id === effectivePdvId)?.name || '';
  }, [effectivePdvId, pointsOfSale]);

  const handleSelectStore = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id) return;
      if (businessId && dataUserId) {
        writeDeliveryOpsSelectedPdvId(businessId, dataUserId, id);
        notifyDeliveryActiveStoreChanged();
      }
      setActiveSalesPoint(id);
      setForceStorePicker(false);
      setSelectedPdvId(id);
    },
    [businessId, dataUserId, setActiveSalesPoint],
  );

  const handleChangeStore = useCallback(() => {
    if (businessId && dataUserId) {
      writeDeliveryOpsSelectedPdvId(businessId, dataUserId, null);
      notifyDeliveryActiveStoreChanged();
    }
    setForceStorePicker(true);
    setSelectedPdvId(null);
  }, [businessId, dataUserId]);

  if (awaitingPdvResolution) {
    return (
      <div className="flex h-[100svh] min-h-[100svh] items-center justify-center bg-stone-100 dark:bg-stone-950">
        <div className="px-6 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Abriendo TPV sala…</p>
        </div>
      </div>
    );
  }

  if (!tabletMode && (!effectivePdvId || forceStorePicker)) {
    return (
      <CeoTpvStorePicker
        storeName={currentBusiness?.name}
        storeRows={storeRows}
        pointsOfSale={activePdvs}
        loading={effectiveStoresLoading}
        restaurantMode
        onSelect={handleSelectStore}
        onBack={() => navigate(RESTAURANT_CAJA_PATH, { replace: true })}
      />
    );
  }

  const gatePdvId = effectivePdvId || activeSalesPointId || undefined;

  return (
    <TpvChromeScope insetBottomBar bottomBar={null}>
      <div className="fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
        <TpvOfflineBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TpvRegisterGate
            fillParent
            initialManagerPdvId={gatePdvId}
            onManagerStoreCleared={tabletMode ? undefined : handleChangeStore}
          >
            <RestaurantTpvFloorBoard
              pdvId={gatePdvId || null}
              pdvName={selectedPdvName}
              tabletMode={tabletMode}
              onChangeStore={tabletMode ? undefined : handleChangeStore}
            />
          </TpvRegisterGate>
        </div>
      </div>
    </TpvChromeScope>
  );
}
