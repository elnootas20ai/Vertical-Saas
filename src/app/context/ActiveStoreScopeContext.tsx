import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { loadDeliveryStores } from '../lib/deliverySetup';

export interface ActiveStoreScopeValue {
  pointsOfSale: PointOfSale[];
  /** `_id` del documento PDV delivery (resuelto desde preferencia `wc:` o id). */
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
  activeSalesPointId: null,
  activePreferenceRaw: null,
  setActiveSalesPoint: () => {},
  setActiveWorkCenterPreference: () => {},
  loading: false,
  refresh: async () => {},
  displayLabelForActive: '',
};

const ActiveStoreScopeContext = createContext<ActiveStoreScopeValue>(noopScope);

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
  const { currentBusiness } = business;
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '');
  const dataUserId = useMemo(() => resolveBusinessDataUserId(user, currentBusiness), [user, currentBusiness]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const load = useCallback(async () => {
    if (!dataUserId || !user) {
      setPointsOfSale([]);
      return;
    }
    setLoading(true);
    try {
      const state = await loadDeliveryStores(user, currentBusiness ?? null);
      setPointsOfSale(state.pointsOfSale);
    } catch {
      setPointsOfSale([]);
    } finally {
      setLoading(false);
    }
  }, [dataUserId, currentBusiness, user]);

  useEffect(() => {
    setPointsOfSale([]);
    void load();
  }, [load]);

  /** Al cambiar de empresa, vaciar lista hasta recargar (evita flash de PDV de otra empresa). */
  useEffect(() => {
    if (!businessId) return;
    setPointsOfSale([]);
    bump();
  }, [businessId, bump]);

  useEffect(() => {
    const onWorkCenters = () => {
      void load();
    };
    window.addEventListener('work-centers:changed', onWorkCenters);
    return () => window.removeEventListener('work-centers:changed', onWorkCenters);
  }, [load]);

  useEffect(() => {
    const onExt = () => {
      bump();
      void load();
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onExt);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onExt);
  }, [bump, load]);

  const activePreferenceRaw = useMemo(() => {
    if (!businessId || !dataUserId) return null;
    return readDeliveryOpsSelectedPdvId(businessId, dataUserId);
  }, [businessId, dataUserId, version, pointsOfSale.length]);

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
      notifyDeliveryActiveStoreChanged();
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
      activeSalesPointId,
      activePreferenceRaw,
      setActiveSalesPoint,
      setActiveWorkCenterPreference,
      loading,
      refresh: load,
      displayLabelForActive,
    }),
    [
      pointsOfSale,
      activeSalesPointId,
      activePreferenceRaw,
      setActiveSalesPoint,
      setActiveWorkCenterPreference,
      loading,
      load,
      displayLabelForActive,
    ],
  );

  return <ActiveStoreScopeContext.Provider value={value}>{children}</ActiveStoreScopeContext.Provider>;
}

export function useActiveStoreScope(): ActiveStoreScopeValue {
  return useContext(ActiveStoreScopeContext);
}
