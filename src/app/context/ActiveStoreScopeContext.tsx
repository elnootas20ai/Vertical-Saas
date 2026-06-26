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
import { useLocation } from 'react-router';
import { useAuthOptional, type AuthContextType } from './AuthContext';
import { useBusinessOptional, type BusinessContextType } from './BusinessContext';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  coerceSelectedPdvId,
  notifyDeliveryActiveStoreChanged,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../lib/deliveryOpsPdvSelection';
import {
  dedupePointsOfSale,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../lib/deliveryApi';
import { readTpvTabletBinding } from '../lib/tpvTabletSession';
import { filterStoresForWorkerAssignment, isInvitedWorkerUser } from '../lib/pdvScope';
import type { AuthUser } from '../lib/authApi';
import {
  readRetailScopeCache,
  writeRetailScopeCache,
} from '../lib/retailScopeCache';
import { readSidebarRetailCache } from '../lib/sidebarRetailCache';
import { shouldSkipEmptyStoreApply } from '../lib/retailScopeApply';
import type { WorkCenter } from '../lib/workCentersApi';
import {
  shouldUseDeliveryStores,
  loadTpvPointsOfSaleForBusiness,
  resolveBusinessScopeId,
  filterPointsOfSaleForWorkCenters,
  filterWorkCentersForBusinessScope,
  dedupeRetailWorkCentersForBusiness,
} from '../lib/deliverySetup';

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

function scopeRetailForBusiness(
  retail: WorkCenter[],
  businessId: string,
  accountBusinessCount?: number,
): WorkCenter[] {
  const picked = pickRetailWorkCenters(retail);
  if (!businessId) return picked;
  return dedupeRetailWorkCentersForBusiness(
    filterWorkCentersForBusinessScope(picked, businessId, { accountBusinessCount }),
  );
}

function scopeFromLoadState(
  workCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  authUser: AuthUser | null | undefined,
  businessId: string,
): { retail: WorkCenter[]; allPdvs: PointOfSale[] } {
  // loadTpvPointsOfSaleForBusiness ya filtra por empresa (incl. legacy sin businessId).
  let retail = pickRetailWorkCenters(workCenters);
  let allPdvs = dedupePointsOfSale(filterPointsOfSaleForWorkCenters(pointsOfSale, retail));

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

type StoreLoadOptions = { force?: boolean };

function resolveShouldUseDeliveryStores(
  biz: BusinessContextType['currentBusiness'],
  businesses: BusinessContextType['businesses'],
  bidAtStart: string,
  hasDisplayedStores: boolean,
): boolean {
  return shouldUseDeliveryStores(
    { business: biz, businesses },
    {
      tabletBusinessId: readTpvTabletBinding()?.businessId ?? null,
      hasDeliveryPdvs:
        hasDisplayedStores ||
        Boolean(readRetailScopeCache(bidAtStart)) ||
        Boolean(readSidebarRetailCache(bidAtStart)?.allPointsOfSale.length),
    },
  );
}

export function ActiveStoreScopeProvider({ children }: { children: ReactNode }) {
  const business = useBusinessOptional();
  const auth = useAuthOptional();

  if (!business || !auth) {
    return (
      <ActiveStoreScopeContext.Provider value={{ ...noopScope, loading: true }}>
        {children}
      </ActiveStoreScopeContext.Provider>
    );
  }

  return (
    <ActiveStoreScopeProviderImpl business={business} auth={auth}>
      {children}
    </ActiveStoreScopeProviderImpl>
  );
}

function ActiveStoreScopeProviderImpl({
  children,
  business,
  auth,
}: {
  children: ReactNode;
  business: BusinessContextType;
  auth: AuthContextType;
}) {
  const { user, isInitializing: authInitializing } = auth;
  const location = useLocation();
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
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const businessIdRef = useRef(businessId);
  businessIdRef.current = businessId;
  const userRef = useRef(user);
  userRef.current = user;
  const accountBusinessCountRef = useRef(accountBusinessCount);
  accountBusinessCountRef.current = accountBusinessCount;
  const businessesFetchSettledRef = useRef(businessesFetchSettled);
  businessesFetchSettledRef.current = businessesFetchSettled;
  const loadInflightRef = useRef<Promise<void> | null>(null);
  const loadSeqRef = useRef(0);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDisplayedStoresRef = useRef(false);
  const emptyRetryDoneRef = useRef(false);
  const pathnameRef = useRef(location.pathname);

  const applyStores = useCallback((retail: WorkCenter[], allPdvs: PointOfSale[]) => {
    const bid = businessIdRef.current;
    const accountN = businessesFetchSettledRef.current
      ? (accountBusinessCountRef.current ?? businessesRef.current.length)
      : undefined;
    const scopedRetail = bid ? scopeRetailForBusiness(retail, bid, accountN) : pickRetailWorkCenters(retail);
    const scopedPdvs = dedupePointsOfSale(filterPointsOfSaleForWorkCenters(allPdvs, scopedRetail));
    const activePdvs = scopedPdvs.filter((p) => p.active !== false);
    setRetailWorkCenters(scopedRetail);
    setAllPointsOfSale(scopedPdvs);
    setPointsOfSale(activePdvs);
    if (scopedRetail.length > 0 || scopedPdvs.length > 0) {
      hasDisplayedStoresRef.current = true;
    }
  }, []);

  const commitStores = useCallback(
    (retail: WorkCenter[], allPdvs: PointOfSale[], bid: string, force: boolean) => {
      if (
        shouldSkipEmptyStoreApply({
          hasDisplayedStores: hasDisplayedStoresRef.current,
          incomingRetailCount: retail.length,
          incomingPdvCount: allPdvs.length,
          force,
        })
      ) {
        return;
      }
      applyStores(retail, allPdvs);
      if (retail.length > 0 || allPdvs.length > 0) {
        const accountN = businessesFetchSettledRef.current
          ? (accountBusinessCountRef.current ?? businessesRef.current.length)
          : undefined;
        writeRetailScopeCache(
          bid,
          { retailWorkCenters: retail, allPointsOfSale: allPdvs },
          accountN !== undefined ? { accountBusinessCount: accountN } : undefined,
        );
      }
      // Nunca borrar caché en vacío: conservar última lista buena para el sidebar.
    },
    [applyStores],
  );

  useLayoutEffect(() => {
    setInitialLoading(false);
    emptyRetryDoneRef.current = false;
    if (!businessId) {
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
      hasDisplayedStoresRef.current = false;
      return;
    }
    loadInflightRef.current = null;
    const cacheOpts =
      accountBusinessCount !== undefined ? { accountBusinessCount } : undefined;
    const cached = readRetailScopeCache(businessId, cacheOpts);
    if (cached) {
      if (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0) {
        hasDisplayedStoresRef.current = true;
        applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
        return;
      }
    }
    const sidebarCached = readSidebarRetailCache(businessId, cacheOpts);
    if (
      sidebarCached &&
      (sidebarCached.allPointsOfSale.length > 0 || sidebarCached.rows.length > 0)
    ) {
      if (sidebarCached.retailWorkCenters.length > 0 || sidebarCached.allPointsOfSale.length > 0) {
        hasDisplayedStoresRef.current = true;
        applyStores(sidebarCached.retailWorkCenters, sidebarCached.allPointsOfSale);
        return;
      }
    }
    if (!hasDisplayedStoresRef.current) {
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
    }
  }, [businessId, accountBusinessCount, applyStores]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const load = useCallback(async (options?: StoreLoadOptions) => {
    if (loadInflightRef.current) {
      return loadInflightRef.current;
    }

    const force = options?.force === true;

    const run = async () => {
      const biz = currentBusinessRef.current;
      const bidAtStart = resolveBusinessScopeId(biz);
      const seq = ++loadSeqRef.current;
      const authUser = userRef.current;
      const uid = String(authUser?.user_id || authUser?.id || '').trim();

      if (!uid || !bidAtStart) {
        return;
      }

      if (
        !resolveShouldUseDeliveryStores(
          biz,
          businessesRef.current,
          bidAtStart,
          hasDisplayedStoresRef.current,
        )
      ) {
        return;
      }

      const showInitialSpinner = !hasDisplayedStoresRef.current;
      if (showInitialSpinner) setInitialLoading(true);

      const accountN = businessesFetchSettledRef.current
        ? (accountBusinessCountRef.current ?? businessesRef.current.length)
        : 1;
      const loadOpts = {
        accountBusinessCount: accountN,
      };

      try {
        const state = await loadTpvPointsOfSaleForBusiness(authUser, biz ?? null, loadOpts);

        if (seq !== loadSeqRef.current || businessIdRef.current !== bidAtStart) return;

        const { retail, allPdvs } = scopeFromLoadState(
          state.workCenters,
          state.pointsOfSale,
          authUser,
          bidAtStart,
        );
        commitStores(retail, allPdvs, bidAtStart, force);
      } catch {
        /* conservar caché / última lista */
      } finally {
        if (showInitialSpinner) {
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
  }, [commitStores]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    await loadRef.current({ force: true });
  }, []);

  useEffect(() => {
    if (authInitializing || !businessId || !businessesFetchSettled) return;
    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) return;
    void load();
  }, [authInitializing, businessId, businessesFetchSettled, user?.user_id, user?.id, load]);

  /** Un solo reintento si la lista sigue vacía tras F5 (evita bucle infinito de loading en topbar). */
  useEffect(() => {
    if (authInitializing || !businessId || !businessesFetchSettled) return;
    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) return;
    if (retailWorkCenters.length > 0 || allPointsOfSale.length > 0) {
      emptyRetryDoneRef.current = false;
      return;
    }
    if (initialLoading || loadInflightRef.current) return;
    if (emptyRetryDoneRef.current) return;
    if (
      !resolveShouldUseDeliveryStores(
        currentBusiness,
        businesses,
        businessId,
        hasDisplayedStoresRef.current,
      )
    ) {
      return;
    }

    emptyRetryDoneRef.current = true;
    const timer = window.setTimeout(() => {
      void loadRef.current({ force: true });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    authInitializing,
    businessId,
    businessesFetchSettled,
    user?.user_id,
    user?.id,
    retailWorkCenters.length,
    allPointsOfSale.length,
    initialLoading,
    currentBusiness,
    businesses,
    load,
  ]);

  useEffect(() => {
    const prev = pathnameRef.current;
    pathnameRef.current = location.pathname;
    if (prev === location.pathname) return;
    if (!businessId || !businessesFetchSettled) return;
    if (retailWorkCenters.length > 0 || allPointsOfSale.length > 0) return;

    const cacheOpts =
      accountBusinessCount !== undefined ? { accountBusinessCount } : undefined;
    const cached = readRetailScopeCache(businessId, cacheOpts);
    if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
      hasDisplayedStoresRef.current = true;
      applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
      return;
    }

    const sidebarCached = readSidebarRetailCache(businessId, cacheOpts);
    if (
      sidebarCached &&
      (sidebarCached.allPointsOfSale.length > 0 || sidebarCached.rows.length > 0)
    ) {
      hasDisplayedStoresRef.current = true;
      applyStores(sidebarCached.retailWorkCenters, sidebarCached.allPointsOfSale);
      return;
    }

    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) return;
    if (
      !resolveShouldUseDeliveryStores(
        currentBusiness,
        businesses,
        businessId,
        hasDisplayedStoresRef.current,
      )
    ) {
      return;
    }
    void load();
  }, [
    location.pathname,
    businessId,
    businessesFetchSettled,
    retailWorkCenters.length,
    allPointsOfSale.length,
    currentBusiness,
    businesses,
    user?.user_id,
    user?.id,
    accountBusinessCount,
    applyStores,
    load,
  ]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        void loadRef.current({ force: true });
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
