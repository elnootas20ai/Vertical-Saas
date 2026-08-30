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
  coerceSelectedPdvId,
  pickDefaultActiveStorePreference,
  resolvePreferenceToPdvId,
} from '../lib/deliveryOpsPdvSelection';
import {
  notifyOpsActiveStoreChanged,
  readOpsSelectedPdvId,
  writeOpsSelectedPdvId,
} from '../lib/opsPdvPreference';
import {
  dedupePointsOfSale,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../lib/deliveryApi';
import { shouldForceRetailStoreReload } from '../lib/retailOpsPaths';
import type { AuthUser } from '../lib/authApi';
import type { Business } from '../lib/businessApi';
import { shouldSkipEmptyStoreApply } from '../lib/retailScopeApply';
import { filterStoresForWorkerAssignment, isInvitedWorkerUser } from '../lib/pdvScope';
import type { WorkCenter } from '../lib/workCentersApi';
import {
  resolveBusinessScopeId,
  knownBusinessIdsFromList,
  filterPointsOfSaleForWorkCenters,
} from '../lib/deliverySetup';
import {
  filterRetailWorkCentersForScope,
  loadRetailStoresForBusiness,
  readRetailScopeCacheForBusiness,
  shouldLoadRetailStoresForBusiness,
  writeRetailScopeCacheForBusiness,
  type RetailScopeContext,
} from '../verticals/retailScopeRegistry';
import {
  isTpvTabletBindingAllowedForAuth,
  isTpvTabletWorkerPath,
  mergeTabletBindingPdv,
  readTpvTabletBinding,
} from '../lib/tpvTabletSession';

export type ActiveStoreRefreshOptions = { force?: boolean };

export interface ActiveStoreScopeValue {
  pointsOfSale: PointOfSale[];
  allPointsOfSale: PointOfSale[];
  retailWorkCenters: WorkCenter[];
  activeSalesPointId: string | null;
  activePreferenceRaw: string | null;
  setActiveSalesPoint: (pdvId: string) => void;
  setActiveWorkCenterPreference: (workCenterId: string) => void;
  loading: boolean;
  /** Por defecto force=true (tras crear/borrar). Sidebar/gates: `{ force: false }`. */
  refresh: (options?: ActiveStoreRefreshOptions) => Promise<void>;
  displayLabelForActive: string;
}

/** Si Couch/API no responde, no dejar spinner eterno en sidebar/ajustes. */
const RETAIL_STORE_LOAD_TIMEOUT_MS = 12_000;

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

function buildRetailScopeCtx(
  business: BusinessContextType['currentBusiness'],
  businesses: BusinessContextType['businesses'],
  accountBusinessCount?: number,
): RetailScopeContext {
  return {
    business: business ?? null,
    businesses,
    accountBusinessCount,
  };
}

function scopeFromLoadState(
  workCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  authUser: AuthUser | null | undefined,
  businessId: string,
  accountBusinessCount?: number,
): { retail: WorkCenter[]; allPdvs: PointOfSale[] } {
  // loadTpvPointsOfSaleForBusiness ya filtra por empresa (incl. legacy sin businessId).
  let retail = pickRetailWorkCenters(workCenters);
  let allPdvs = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(pointsOfSale, retail, {
      businessId,
      accountBusinessCount,
    }),
  );

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

function resolveTabletBoundStoreScope(
  pathname: string,
  businessId: string,
  authUser?: { user_id?: string; id?: string } | null,
  businesses?: Array<{
    business_id?: string;
    id?: string;
    owner_user_id?: string;
    members?: Array<{ user_id?: string }>;
  }> | null,
  businessesSettled?: boolean,
): ReturnType<typeof readTpvTabletBinding> | null {
  const binding = readTpvTabletBinding();
  if (!binding?.pdvId || !binding?.businessId) return null;
  if (!isTpvTabletWorkerPath(pathname)) return null;
  if (
    !isTpvTabletBindingAllowedForAuth({
      binding,
      authUser,
      businesses,
      businessesSettled,
    })
  ) {
    return null;
  }
  if (resolveBusinessScopeId({ business_id: binding.businessId }) !== businessId) return null;
  return binding;
}

function buildTabletScopeRows(binding: NonNullable<ReturnType<typeof readTpvTabletBinding>>): {
  retail: WorkCenter[];
  allPdvs: PointOfSale[];
} {
  const pdvs = mergeTabletBindingPdv([], binding);
  const pdv = pdvs[0];
  const wcId = String(binding.workCenterId || pdv?.workCenterId || `wc-tablet-${binding.pdvId}`).trim();
  const retail: WorkCenter[] = [
    {
      _id: wcId,
      name: binding.pdvName || pdv?.name || 'Tienda',
      centerType: 'punto_de_venta',
      businessId: binding.businessId,
      active: true,
    } as WorkCenter,
  ];
  return { retail, allPdvs: pdvs };
}

function resolveShouldLoadStores(
  biz: BusinessContextType['currentBusiness'],
  businesses: BusinessContextType['businesses'],
  bidAtStart: string,
  hasDisplayedStores: boolean,
  accountBusinessCount?: number,
  pathname?: string,
  force?: boolean,
): boolean {
  if (!biz) return false;
  const tabletBoundStore = Boolean(
    pathname && resolveTabletBoundStoreScope(pathname, bidAtStart),
  );
  return shouldLoadRetailStoresForBusiness(
    buildRetailScopeCtx(biz, businesses, accountBusinessCount),
    bidAtStart,
    { hasDisplayedStores, tabletBoundStore, force: force === true },
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
  /** businessId cuya carga (también vacía) ya terminó — evita spinner eterno al revalidar empresas. */
  const loadSettledForBusinessIdRef = useRef<string | null>(null);
  const emptyRetryDoneRef = useRef(false);
  const pathnameRef = useRef(location.pathname);
  const retailWorkCentersRef = useRef(retailWorkCenters);
  retailWorkCentersRef.current = retailWorkCenters;
  const allPointsOfSaleRef = useRef(allPointsOfSale);
  allPointsOfSaleRef.current = allPointsOfSale;

  const applyStores = useCallback((retail: WorkCenter[], allPdvs: PointOfSale[]) => {
    const bid = businessIdRef.current;
    const accountN = businessesFetchSettledRef.current
      ? (accountBusinessCountRef.current ?? businessesRef.current.length)
      : undefined;
    const biz = currentBusinessRef.current;
    const scopedRetail = bid
      ? filterRetailWorkCentersForScope(
          pickRetailWorkCenters(retail),
          buildRetailScopeCtx(biz, businessesRef.current, accountN),
        )
      : pickRetailWorkCenters(retail);
    const scopedPdvs = dedupePointsOfSale(
      filterPointsOfSaleForWorkCenters(allPdvs, scopedRetail, {
        businessId: bid,
        accountBusinessCount: accountN,
      }),
    );
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
        const biz = currentBusinessRef.current;
        const ctx = buildRetailScopeCtx(biz, businessesRef.current, accountN);
        const scopedRetail = filterRetailWorkCentersForScope(
          pickRetailWorkCenters(retail),
          ctx,
        );
        const scopedPdvs = filterPointsOfSaleForWorkCenters(allPdvs, scopedRetail, {
          businessId: bid,
          accountBusinessCount: accountN,
        });
        writeRetailScopeCacheForBusiness(
          bid,
          { retailWorkCenters: scopedRetail, allPointsOfSale: scopedPdvs },
          ctx,
        );
      }
      // Nunca borrar caché en vacío: conservar última lista buena para el sidebar.
    },
    [applyStores],
  );

  const storeBusinessIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // Tablet TPV: el código fija tienda antes de que el selector global cambie de empresa.
    // Solo si el binding pertenece a esta cuenta (no a Pau u otra).
    if (isTpvTabletWorkerPath(location.pathname)) {
      const binding = readTpvTabletBinding();
      const allowed = isTpvTabletBindingAllowedForAuth({
        binding,
        authUser: user,
        businesses,
        businessesSettled: businessesFetchSettled,
      });
      if (allowed && binding?.pdvId && binding?.businessId) {
        const { retail, allPdvs } = buildTabletScopeRows(binding);
        if (retail.length > 0 || allPdvs.length > 0) {
          hasDisplayedStoresRef.current = true;
          setInitialLoading(false);
          applyStores(retail, allPdvs);
          return;
        }
      }
    }

    if (!businessId) {
      storeBusinessIdRef.current = null;
      emptyRetryDoneRef.current = false;
      hasDisplayedStoresRef.current = false;
      loadSettledForBusinessIdRef.current = null;
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
      setInitialLoading(false);
      return;
    }

    const businessChanged = storeBusinessIdRef.current !== businessId;
    storeBusinessIdRef.current = businessId;

    // Cambio de nº de empresas en cuenta: no vaciar sidebar (evita parpadeo).
    if (!businessChanged && hasDisplayedStoresRef.current) {
      setInitialLoading(false);
      return;
    }

    const cacheCtx = buildRetailScopeCtx(
      currentBusinessRef.current,
      businessesRef.current,
      accountBusinessCount,
    );
    const cached = readRetailScopeCacheForBusiness(businessId, cacheCtx);
    if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
      emptyRetryDoneRef.current = false;
      hasDisplayedStoresRef.current = true;
      loadSettledForBusinessIdRef.current = businessId;
      setInitialLoading(false);
      applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
      return;
    }

    if (businessChanged) {
      emptyRetryDoneRef.current = false;
      hasDisplayedStoresRef.current = false;
      loadSettledForBusinessIdRef.current = null;
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
      loadInflightRef.current = null;
      // Evita un frame con loading=false y listas vacías → TPV «sin tiendas».
      setInitialLoading(true);
    } else if (
      !hasDisplayedStoresRef.current
      && retailWorkCentersRef.current.length === 0
      && allPointsOfSaleRef.current.length === 0
      // Cuenta nueva sin PDV: tras el 1.er fetch no reactivar spinner por reload de empresas.
      && loadSettledForBusinessIdRef.current !== businessId
    ) {
      // Primera carga / sin caché: no apagar el spinner mientras llega el fetch.
      setInitialLoading(true);
    }

    const tabletBinding = resolveTabletBoundStoreScope(
      location.pathname,
      businessId,
      user,
      businesses,
      businessesFetchSettled,
    );
    if (tabletBinding) {
      const { retail, allPdvs } = buildTabletScopeRows(tabletBinding);
      hasDisplayedStoresRef.current = allPdvs.length > 0 || retail.length > 0;
      applyStores(retail, allPdvs);
    }
  }, [businessId, accountBusinessCount, applyStores, location.pathname, user, businesses, businessesFetchSettled]);

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
        setInitialLoading(false);
        return;
      }

      const accountN = businessesFetchSettledRef.current
        ? (accountBusinessCountRef.current ?? businessesRef.current.length)
        : 1;

      if (
        !resolveShouldLoadStores(
          biz,
          businessesRef.current,
          bidAtStart,
          hasDisplayedStoresRef.current,
          accountN,
          pathnameRef.current,
          force,
        )
      ) {
        // Sin fetch: no dejar el spinner eterno (TPV delivery CEO se quedaba en «Tarda más…»).
        loadSettledForBusinessIdRef.current = bidAtStart;
        setInitialLoading(false);
        return;
      }

      const showInitialSpinner =
        !hasDisplayedStoresRef.current
        && retailWorkCentersRef.current.length === 0
        && allPointsOfSaleRef.current.length === 0
        && loadSettledForBusinessIdRef.current !== bidAtStart;
      if (showInitialSpinner) setInitialLoading(true);

      const loadOpts = {
        accountBusinessCount: accountN,
        knownBusinessIds: knownBusinessIdsFromList(businessesRef.current),
      };

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        // Solo lectura: el sidebar nunca crea/repara PDVs. Las reparaciones
        // viven en Ajustes → Tienda y en la apertura del TPV.
        const state = await Promise.race([
          loadRetailStoresForBusiness(
            authUser,
            biz as Business,
            businessesRef.current,
            {
              ...loadOpts,
              includeInactivePdvs: true,
              tpvBootstrap: false,
              skipPdvMerge: true,
              ensureTabletCodes: false,
            },
          ),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('retail_store_load_timeout'));
            }, RETAIL_STORE_LOAD_TIMEOUT_MS);
          }),
        ]);

        if (seq !== loadSeqRef.current || businessIdRef.current !== bidAtStart) return;

        const { retail, allPdvs } = scopeFromLoadState(
          state.workCenters,
          state.pointsOfSale,
          authUser,
          bidAtStart,
          accountBusinessCountRef.current ?? businessesRef.current.length,
        );
        commitStores(retail, allPdvs, bidAtStart, force);
      } catch {
        /* timeout / red: conservar caché / última lista */
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        // Siempre apagar spinner: early-return o timeout no deben dejar ajustes/sidebar colgados.
        if (seq === loadSeqRef.current) {
          loadSettledForBusinessIdRef.current = bidAtStart;
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

  const refresh = useCallback(async (options?: ActiveStoreRefreshOptions) => {
    await loadRef.current({ force: options?.force !== false });
  }, []);

  useEffect(() => {
    if (authInitializing || !businessId || !businessesFetchSettled) return;
    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) return;
    void load({ force: shouldForceRetailStoreReload(location.pathname) });
  }, [authInitializing, businessId, businessesFetchSettled, user?.user_id, user?.id, load, location.pathname]);

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
      !resolveShouldLoadStores(
        currentBusiness,
        businesses,
        businessId,
        hasDisplayedStoresRef.current,
        undefined,
        location.pathname,
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
    location.pathname,
  ]);

  useEffect(() => {
    const prev = pathnameRef.current;
    pathnameRef.current = location.pathname;
    if (prev === location.pathname) return;
    if (!businessId || !businessesFetchSettled) return;
    if (retailWorkCenters.length > 0 || allPointsOfSale.length > 0) return;

    const cacheCtx = buildRetailScopeCtx(currentBusiness, businesses, accountBusinessCount);
    const cached = readRetailScopeCacheForBusiness(businessId, cacheCtx);
    if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
      hasDisplayedStoresRef.current = true;
      applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
      return;
    }

    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) return;
    if (
      !resolveShouldLoadStores(
        currentBusiness,
        businesses,
        businessId,
        hasDisplayedStoresRef.current,
        accountBusinessCount,
        location.pathname,
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
    const applyCacheSnapshot = () => {
      const bid = businessIdRef.current;
      if (!bid) return;
      const accountN = businessesFetchSettledRef.current
        ? (accountBusinessCountRef.current ?? businessesRef.current.length)
        : undefined;
      const cacheCtx = buildRetailScopeCtx(
        currentBusinessRef.current,
        businessesRef.current,
        accountN,
      );
      const cached = readRetailScopeCacheForBusiness(bid, cacheCtx);
      if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
        applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
      }
    };

    const scheduleRefresh = () => {
      applyCacheSnapshot();
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
  }, [applyStores]);

  useEffect(() => {
    const onExt = () => bump();
    // Literales fijos (no import de constantes): evita ReferenceError/HMR stale.
    const events = ['vertial-delivery-active-store', 'vertial-restaurant-active-store'] as const;
    for (const ev of events) {
      window.addEventListener(ev, onExt);
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, onExt);
      }
    };
  }, [bump]);

  const businessType = currentBusiness?.businessType;

  const activePreferenceRaw = useMemo(() => {
    if (!businessId || !dataUserId) return null;
    return readOpsSelectedPdvId(businessType, businessId, dataUserId);
  }, [businessId, dataUserId, businessType, version, pointsOfSale.length, allPointsOfSale.length]);

  const activeSalesPointId = useMemo(() => {
    const pool = allPointsOfSale.length > 0 ? allPointsOfSale : pointsOfSale;
    if (pool.length === 0) return null;
    // Preferencia guardada primero; solo fallback al default si no hay preferencia.
    const activePool = pool.filter((p) => p.active !== false);
    const resolved = resolvePreferenceToPdvId(activePool, activePreferenceRaw);
    if (resolved) return resolved;
    // Preferencia a un PDV concreto (aunque inactive o aún no filtrado): respetar clic sidebar.
    const raw = String(activePreferenceRaw || '').trim();
    if (raw && !raw.startsWith('wc:')) {
      const hit = pool.find((p) => p._id === raw);
      if (hit) return hit._id;
    }
    // Si la preferencia apunta a un PDV que aún no está en la lista (refresh a medias),
    // no caer al primero (bodegeta): devolver null hasta que la lista se complete.
    if (activePreferenceRaw) return null;
    return coerceSelectedPdvId(pointsOfSale.length > 0 ? pointsOfSale : pool, null);
  }, [pointsOfSale, allPointsOfSale, activePreferenceRaw]);

  useEffect(() => {
    if (!businessId || !dataUserId) return;
    // Mientras carga, no pisar la tienda elegida con el PDV por defecto.
    if (initialLoading) return;

    const raw = String(readOpsSelectedPdvId(businessType, businessId, dataUserId) || '').trim();
    const pool = (allPointsOfSale.length > 0 ? allPointsOfSale : pointsOfSale).filter(
      (p) => p.active !== false,
    );
    const poolAll = allPointsOfSale.length > 0 ? allPointsOfSale : pointsOfSale;
    const retail = retailWorkCenters.filter((wc) => !wc.deletedAt && wc.active !== false);

    const writeIfChanged = (next: string | null, notify = false) => {
      const value = String(next || '').trim();
      if (!value || value === raw) return;
      writeOpsSelectedPdvId(businessType, businessId, dataUserId, value);
      if (notify) notifyOpsActiveStoreChanged(businessType);
      bump();
    };

    if (raw) {
      if (raw.startsWith('wc:')) {
        const resolved = resolvePreferenceToPdvId(pool, raw);
        // Solo normalizar wc→pdv si ya está en la lista; si no, esperar (no default).
        if (resolved) writeIfChanged(resolved);
        return;
      }

      // Preferencia PDV: si está en el pool (activo o no), no tocar.
      if (poolAll.some((p) => p._id === raw)) return;

      // Preferencia no está en la lista: NO resetear a la 1ª tienda.
      // Lista incompleta tras refresh / 2ª tienda recién creada — pisar aquí
      // hacía que el clic en «test1» volviera siempre a la primera.
      return;
    }

    if (pool.length === 0 && retail.length === 0) return;
    writeIfChanged(pickDefaultActiveStorePreference(pool, retail), true);
  }, [
    businessId,
    dataUserId,
    businessType,
    pointsOfSale,
    allPointsOfSale,
    retailWorkCenters,
    initialLoading,
    bump,
  ]);

  const setActiveSalesPoint = useCallback(
    (pdvId: string) => {
      if (!businessId || !dataUserId || !pdvId.trim()) return;
      const id = pdvId.trim();
      // Siempre guardar la elección del sidebar (también si el PDV está inactive
      // o el pool aún no lo tiene: antes el click en test1 / Badalona fallaba en silencio).
      writeOpsSelectedPdvId(businessType, businessId, dataUserId, id);
      notifyOpsActiveStoreChanged(businessType);
      bump();
    },
    [businessId, dataUserId, businessType, bump],
  );

  const setActiveWorkCenterPreference = useCallback(
    (workCenterId: string) => {
      if (!businessId || !dataUserId || !workCenterId.trim()) return;
      const wc = workCenterId.trim();
      const pool = allPointsOfSale.length > 0 ? allPointsOfSale : pointsOfSale;
      const linkedPdv = pool.find(
        (p) => String(p.workCenterId || '').trim() === wc && p.active !== false,
      );
      if (linkedPdv) {
        writeOpsSelectedPdvId(businessType, businessId, dataUserId, linkedPdv._id);
      } else {
        writeOpsSelectedPdvId(businessType, businessId, dataUserId, `wc:${wc}`);
      }
      notifyOpsActiveStoreChanged(businessType);
      bump();
    },
    [businessId, dataUserId, businessType, pointsOfSale, allPointsOfSale, bump],
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
      loading:
        initialLoading
        && retailWorkCenters.length === 0
        && allPointsOfSale.length === 0,
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
