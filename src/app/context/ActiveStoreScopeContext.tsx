import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useBusinessOptional, type BusinessContextType } from './BusinessContext';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  coerceSelectedPdvId,
  notifyDeliveryActiveStoreChanged,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../lib/deliveryOpsPdvSelection';
import { dedupePointsOfSale, pointOfSaleDisplayLabel, type PointOfSale } from '../lib/deliveryApi';
import {
  isDeliveryAccountFromSources,
  shouldUseDeliveryStores,
  loadDeliveryStores,
  loadTpvPointsOfSaleForBusiness,
  resolveBusinessScopeId,
} from '../lib/deliverySetup';
import { readTpvTabletBinding } from '../lib/tpvTabletSession';
import { filterStoresForWorkerAssignment, isInvitedWorkerUser } from '../lib/pdvScope';
import type { AuthUser } from '../lib/authApi';
import {
  readRetailScopeCache,
  writeRetailScopeCache,
  clearRetailScopeCache,
} from '../lib/retailScopeCache';
import type { WorkCenter } from '../lib/workCentersApi';

export interface ActiveStoreScopeValue {
  pointsOfSale: PointOfSale[];
  allPointsOfSale: PointOfSale[];
  retailWorkCenters: WorkCenter[];
  activeSalesPointId: string | null;
  activePreferenceRaw: string | null;
  setActiveSalesPoint: (pdvId: string) => void;
  setActiveWorkCenterPreference: (workCenterId: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  displayLabelForActive: string;
}

const noopScope: ActiveStoreScopeValue = {
  pointsOfSale: [],
  allPointsOfSale: [],
  retailWorkCenters: [],
  activeSalesPointId: null,
  activePreferenceRaw: null,
  setActiveSalesPoint: () => {},
  setActiveWorkCenterPreference: () => {},
  loading: false,
  refresh: async () => {},
  displayLabelForActive: '',
};

const ActiveStoreScopeContext = createContext<ActiveStoreScopeValue>(noopScope);

function pickRetailWorkCenters(workCenters: WorkCenter[]): WorkCenter[] {
  return workCenters.filter(
    (wc) =>
      !wc.deletedAt &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );
}

function scopeFromLoadState(
  workCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  authUser: AuthUser | null | undefined,
): { retail: WorkCenter[]; allPdvs: PointOfSale[] } {
  let retail = pickRetailWorkCenters(workCenters);
  let allPdvs = dedupePointsOfSale(pointsOfSale);

  if (authUser && isInvitedWorkerUser(authUser)) {
    const scoped = filterStoresForWorkerAssignment(
      allPdvs,
      retail,
      authUser.employment?.salesPointId,
    );
    allPdvs = scoped.pointsOfSale;
    retail = scoped.workCenters;
  }

  return { retail, allPdvs };
}

export function ActiveStoreScopeProvider({ children }: { children: ReactNode }) {
  const business = useBusinessOptional();
  if (!business) {
    return <>{children}</>;
  }
  return <ActiveStoreScopeProviderImpl business={business}>{children}</ActiveStoreScopeProviderImpl>;
}

function ActiveStoreScopeProviderImpl({
  children,
  business,
}: {
  children: ReactNode;
  business: BusinessContextType;
}) {
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled, businesses } = business;
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [allPointsOfSale, setAllPointsOfSale] = useState<PointOfSale[]>([]);
  const [retailWorkCenters, setRetailWorkCenters] = useState<WorkCenter[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user?.user_id, user?.id, currentBusiness?.business_id, currentBusiness?.id],
  );

  const currentBusinessRef = useRef(currentBusiness);
  currentBusinessRef.current = currentBusiness;
  const businessIdRef = useRef(businessId);
  businessIdRef.current = businessId;
  const userRef = useRef(user);
  userRef.current = user;
  const accountBusinessCountRef = useRef(accountBusinessCount);
  accountBusinessCountRef.current = accountBusinessCount;
  const loadInflightRef = useRef<Promise<void> | null>(null);
  const loadSeqRef = useRef(0);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDisplayedStoresRef = useRef(false);

  const applyStores = useCallback((retail: WorkCenter[], allPdvs: PointOfSale[]) => {
    const activePdvs = allPdvs.filter((p) => p.active !== false);
    setRetailWorkCenters(retail);
    setAllPointsOfSale(allPdvs);
    setPointsOfSale(activePdvs);
    if (retail.length > 0 || allPdvs.length > 0) {
      hasDisplayedStoresRef.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    setInitialLoading(false);
    if (!businessId) {
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
      hasDisplayedStoresRef.current = false;
      return;
    }
    loadInflightRef.current = null;
    const cached = readRetailScopeCache(businessId);
    if (cached) {
      hasDisplayedStoresRef.current = true;
      applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
    } else {
      hasDisplayedStoresRef.current = false;
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
    }
  }, [businessId, applyStores]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const load = useCallback(async () => {
    if (loadInflightRef.current) {
      return loadInflightRef.current;
    }

    const run = async () => {
      const biz = currentBusinessRef.current;
      const bidAtStart = resolveBusinessScopeId(biz);
      const seq = ++loadSeqRef.current;
      const authUser = userRef.current;
      const uid = String(authUser?.user_id || authUser?.id || '').trim();

      if (!uid || !bidAtStart) {
        if (!hasDisplayedStoresRef.current) {
          setPointsOfSale([]);
          setAllPointsOfSale([]);
          setRetailWorkCenters([]);
        }
        return;
      }

      if (!shouldUseDeliveryStores(
        { business: biz },
        { tabletBusinessId: readTpvTabletBinding()?.businessId ?? null },
      )) {
        setPointsOfSale([]);
        setAllPointsOfSale([]);
        setRetailWorkCenters([]);
        hasDisplayedStoresRef.current = false;
        return;
      }

      const showInitialSpinner = !hasDisplayedStoresRef.current;
      if (showInitialSpinner) setInitialLoading(true);

      const loadOpts = {
        accountBusinessCount: accountBusinessCountRef.current,
        skipPdvMerge: true as const,
      };

      try {
        const workerUser = isInvitedWorkerUser(authUser);
        const state = workerUser
          ? await loadTpvPointsOfSaleForBusiness(authUser, biz ?? null, loadOpts)
          : await loadDeliveryStores(authUser, biz ?? null, loadOpts);

        if (seq !== loadSeqRef.current || businessIdRef.current !== bidAtStart) return;

        const { retail, allPdvs } = scopeFromLoadState(
          state.workCenters,
          state.pointsOfSale,
          authUser,
        );
        applyStores(retail, allPdvs);
        writeRetailScopeCache(bidAtStart, { retailWorkCenters: retail, allPointsOfSale: allPdvs });

        if (!workerUser) {
          void loadDeliveryStores(authUser, biz ?? null, {
            accountBusinessCount: accountBusinessCountRef.current,
          })
            .then((full) => {
              if (seq !== loadSeqRef.current || businessIdRef.current !== bidAtStart) return;
              const enriched = scopeFromLoadState(full.workCenters, full.pointsOfSale, authUser);
              applyStores(enriched.retail, enriched.allPdvs);
              writeRetailScopeCache(bidAtStart, {
                retailWorkCenters: enriched.retail,
                allPointsOfSale: enriched.allPdvs,
              });
            })
            .catch(() => {
              /* mantener carga rápida */
            });
        }
      } catch {
        /* conservar caché / última lista */
      } finally {
        if (seq === loadSeqRef.current && showInitialSpinner) {
          setInitialLoading(false);
        }
      }
    };

    const promise = run();
    loadInflightRef.current = promise;
    try {
      await promise;
    } finally {
      if (loadInflightRef.current === promise) {
        loadInflightRef.current = null;
      }
    }
  }, [applyStores]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    await loadRef.current();
  }, []);

  useEffect(() => {
    if (!businessId || !businessesFetchSettled) return;
    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) return;
    void load();
  }, [businessId, businessesFetchSettled, user?.user_id, user?.id, load]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        if (businessIdRef.current) clearRetailScopeCache(businessIdRef.current);
        void loadRef.current();
      }, 250);
    };
    window.addEventListener('work-centers:changed', scheduleRefresh);
    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      window.removeEventListener('work-centers:changed', scheduleRefresh);
    };
  }, []);

  useEffect(() => {
    const onExt = () => bump();
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onExt);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onExt);
  }, [bump]);

  const activePreferenceRaw = useMemo(() => {
    if (!businessId || !dataUserId) return null;
    return readDeliveryOpsSelectedPdvId(businessId, dataUserId);
  }, [businessId, dataUserId, version, pointsOfSale.length, allPointsOfSale.length]);

  const activeSalesPointId = useMemo(() => {
    if (pointsOfSale.length === 0) return null;
    return coerceSelectedPdvId(pointsOfSale, activePreferenceRaw);
  }, [pointsOfSale, activePreferenceRaw]);

  useEffect(() => {
    if (!businessId || !dataUserId || pointsOfSale.length === 0) return;
    const raw = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    const targetId = coerceSelectedPdvId(pointsOfSale, raw);
    if (!targetId) {
      if (raw) {
        writeDeliveryOpsSelectedPdvId(businessId, dataUserId, null);
        bump();
      }
      return;
    }
    if (raw !== targetId) {
      writeDeliveryOpsSelectedPdvId(businessId, dataUserId, targetId);
      bump();
    }
  }, [businessId, dataUserId, pointsOfSale, bump]);

  const setActiveSalesPoint = useCallback(
    (pdvId: string) => {
      if (!businessId || !dataUserId || !pdvId.trim()) return;
      writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdvId.trim());
      notifyDeliveryActiveStoreChanged();
      bump();
    },
    [businessId, dataUserId, bump],
  );

  const setActiveWorkCenterPreference = useCallback(
    (workCenterId: string) => {
      if (!businessId || !dataUserId || !workCenterId.trim()) return;
      writeDeliveryOpsSelectedPdvId(businessId, dataUserId, `wc:${workCenterId.trim()}`);
      notifyDeliveryActiveStoreChanged();
      bump();
    },
    [businessId, dataUserId, bump],
  );

  const displayLabelForActive = useMemo(() => {
    if (!activeSalesPointId) return '';
    const p = pointsOfSale.find((x) => x._id === activeSalesPointId);
    return p ? pointOfSaleDisplayLabel(p) : '';
  }, [activeSalesPointId, pointsOfSale]);

  const value = useMemo<ActiveStoreScopeValue>(
    () => ({
      pointsOfSale,
      allPointsOfSale,
      retailWorkCenters,
      activeSalesPointId,
      activePreferenceRaw,
      setActiveSalesPoint,
      setActiveWorkCenterPreference,
      loading: initialLoading,
      refresh,
      displayLabelForActive,
    }),
    [
      pointsOfSale,
      allPointsOfSale,
      retailWorkCenters,
      activeSalesPointId,
      activePreferenceRaw,
      setActiveSalesPoint,
      setActiveWorkCenterPreference,
      initialLoading,
      refresh,
      displayLabelForActive,
    ],
  );

  return <ActiveStoreScopeContext.Provider value={value}>{children}</ActiveStoreScopeContext.Provider>;
}

export function useActiveStoreScope(): ActiveStoreScopeValue {
  return useContext(ActiveStoreScopeContext);
}
