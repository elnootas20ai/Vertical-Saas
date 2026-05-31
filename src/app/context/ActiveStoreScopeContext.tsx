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
  notifyDeliveryActiveStoreChanged,
  normalizeStoredPdvPreference,
  pickDefaultActivePdvId,
  readDeliveryOpsSelectedPdvId,
  resolvePreferenceToPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../lib/deliveryOpsPdvSelection';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../lib/deliveryApi';
import { isDeliveryBusinessType, loadDeliveryStores } from '../lib/deliverySetup';
import type { WorkCenter } from '../lib/workCentersApi';

export interface ActiveStoreScopeValue {
  /** PDV activos (filtro operativo / pedidos / caja). */
  pointsOfSale: PointOfSale[];
  /** Todos los PDV de la empresa (sidebar: incluye inactivos). */
  allPointsOfSale: PointOfSale[];
  /** Centros retail de la empresa (para sidebar aunque falte PDV). */
  retailWorkCenters: WorkCenter[];
  /** `_id` del documento PDV delivery (resuelto desde preferencia `wc:` o id). */
  activeSalesPointId: string | null;
  activePreferenceRaw: string | null;
  setActiveSalesPoint: (pdvId: string) => void;
  setActiveWorkCenterPreference: (workCenterId: string) => void;
  /** Solo true en la primera carga sin datos en pantalla (no en refrescos). */
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

interface CachedStores {
  retailWorkCenters: WorkCenter[];
  allPointsOfSale: PointOfSale[];
  pointsOfSale: PointOfSale[];
}

function storesCacheKey(businessId: string) {
  return `vertial_delivery_stores_cache:${businessId}`;
}

function readStoresCache(businessId: string): CachedStores | null {
  if (!businessId) return null;
  try {
    const raw = sessionStorage.getItem(storesCacheKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStores;
    if (!parsed || !Array.isArray(parsed.retailWorkCenters)) return null;
    const hasData =
      parsed.retailWorkCenters.length > 0 ||
      (Array.isArray(parsed.allPointsOfSale) && parsed.allPointsOfSale.length > 0);
    if (!hasData) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoresCache(businessId: string, data: CachedStores) {
  if (!businessId) return;
  const hasData =
    data.retailWorkCenters.length > 0 || data.allPointsOfSale.length > 0;
  if (!hasData) return;
  try {
    sessionStorage.setItem(storesCacheKey(businessId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

function clearStoresCache(businessId: string) {
  if (!businessId) return;
  try {
    sessionStorage.removeItem(storesCacheKey(businessId));
  } catch {
    // ignore
  }
}

/**
 * Debe vivir bajo `BusinessProvider`. Si no hay contexto (árbol mal ordenado o HMR),
 * se renderizan los hijos sin romper; `useActiveStoreScope` usará el valor por defecto.
 */
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
  const { currentBusiness, businessesFetchSettled } = business;
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [allPointsOfSale, setAllPointsOfSale] = useState<PointOfSale[]>([]);
  const [retailWorkCenters, setRetailWorkCenters] = useState<WorkCenter[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '');
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user?.user_id, currentBusiness?.business_id, currentBusiness?.id],
  );

  const currentBusinessRef = useRef(currentBusiness);
  currentBusinessRef.current = currentBusiness;
  const businessIdRef = useRef(businessId);
  businessIdRef.current = businessId;
  const userRef = useRef(user);
  userRef.current = user;
  const loadInflightRef = useRef<Promise<void> | null>(null);
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

  // Hidratar tiendas desde caché al cambiar de negocio (nunca reutilizar tiendas del negocio anterior).
  useLayoutEffect(() => {
    if (!businessId) {
      setPointsOfSale([]);
      setAllPointsOfSale([]);
      setRetailWorkCenters([]);
      hasDisplayedStoresRef.current = false;
      return;
    }
    hasDisplayedStoresRef.current = false;
    const cached = readStoresCache(businessId);
    if (cached) {
      applyStores(cached.retailWorkCenters, cached.allPointsOfSale);
    } else {
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
      if (!dataUserId || !user?.user_id) {
        if (!hasDisplayedStoresRef.current) {
          setPointsOfSale([]);
          setAllPointsOfSale([]);
          setRetailWorkCenters([]);
        }
        return;
      }
      if (!isDeliveryBusinessType(biz?.businessType)) {
        setPointsOfSale([]);
        setAllPointsOfSale([]);
        setRetailWorkCenters([]);
        hasDisplayedStoresRef.current = false;
        return;
      }

      const showInitialSpinner = !hasDisplayedStoresRef.current;
      if (showInitialSpinner) setInitialLoading(true);

      try {
        const state = await loadDeliveryStores(userRef.current, biz ?? null);
        const retail = state.workCenters.filter(
          (wc) =>
            !wc.deletedAt &&
            (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
        );
        const allPdvs = state.pointsOfSale;
        applyStores(retail, allPdvs);
        const bid = String(biz?.business_id || biz?.id || '');
        if (bid) {
          writeStoresCache(bid, {
            retailWorkCenters: retail,
            allPointsOfSale: allPdvs,
            pointsOfSale: allPdvs.filter((p) => p.active !== false),
          });
        }
      } catch {
        // Conservar última lista válida (caché o estado previo).
      } finally {
        if (showInitialSpinner) setInitialLoading(false);
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
  }, [applyStores, dataUserId, user?.user_id]);

  const loadRef = useRef(load);
  loadRef.current = load;

  /** Referencia estable: evita bucles de refresh en Sidebar cuando `loading` cambia. */
  const refresh = useCallback(async () => {
    await loadRef.current();
  }, []);

  /** Tras cargar negocios: una sola carga de tiendas/PDV (evita competir con listBusinesses). */
  useEffect(() => {
    if (!businessId || !businessesFetchSettled) return;
    void load();
  }, [businessId, businessesFetchSettled, load]);

  useEffect(() => {
    const scheduleRefresh = () => {
      clearStoresCache(businessIdRef.current);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        void loadRef.current();
      }, 500);
    };
    window.addEventListener('work-centers:changed', scheduleRefresh);
    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      window.removeEventListener('work-centers:changed', scheduleRefresh);
    };
  }, []);

  useEffect(() => {
    const onExt = () => {
      bump();
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onExt);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onExt);
  }, [bump]);

  const activePreferenceRaw = useMemo(() => {
    if (!businessId || !dataUserId) return null;
    return readDeliveryOpsSelectedPdvId(businessId, dataUserId);
  }, [businessId, dataUserId, version, pointsOfSale.length, allPointsOfSale.length]);

  const activeSalesPointId = useMemo(() => {
    if (pointsOfSale.length === 0) return null;
    const resolved = resolvePreferenceToPdvId(pointsOfSale, activePreferenceRaw);
    if (resolved) return resolved;
    return pickDefaultActivePdvId(pointsOfSale);
  }, [pointsOfSale, activePreferenceRaw]);

  /** Normaliza preferencia (`wc:` → id PDV) y asegura siempre un PDV activo guardado. */
  useEffect(() => {
    if (!businessId || !dataUserId || pointsOfSale.length === 0) return;
    const raw = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    const normalized = normalizeStoredPdvPreference(pointsOfSale, raw);
    const targetId = normalized || pickDefaultActivePdvId(pointsOfSale);
    if (!targetId) return;
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
