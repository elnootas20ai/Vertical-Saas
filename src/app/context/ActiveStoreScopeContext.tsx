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
  readDeliveryOpsSelectedPdvId,
  resolvePreferenceToPdvId,
  writeDeliveryOpsSelectedPdvId,
} from '../lib/deliveryOpsPdvSelection';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../lib/deliveryApi';
import { loadDeliveryStores } from '../lib/deliverySetup';
import { listWorkCentersForDelivery } from '../lib/workCentersApi';

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
  /** Si la preferencia es `wc:` y aún no hay PDV en lista, mostrar al menos el nombre del centro. */
  const [wcPreferenceLabel, setWcPreferenceLabel] = useState('');

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
    void load();
  }, [load]);

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
    if (pointsOfSale.length === 1) return pointsOfSale[0]._id;
    return null;
  }, [pointsOfSale, activePreferenceRaw]);

  useEffect(() => {
    let cancelled = false;
    const raw = activePreferenceRaw?.trim();
    if (!raw || !dataUserId) {
      setWcPreferenceLabel('');
      return () => {
        cancelled = true;
      };
    }
    if (activeSalesPointId) {
      const p = pointsOfSale.find((x) => x._id === activeSalesPointId);
      if (p) {
        setWcPreferenceLabel('');
        return () => {
          cancelled = true;
        };
      }
    }
    if (!raw.startsWith('wc:')) {
      setWcPreferenceLabel('');
      return () => {
        cancelled = true;
      };
    }
    const wcId = raw.slice(3).trim();
    if (!wcId) {
      setWcPreferenceLabel('');
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const wcs = await listWorkCentersForDelivery(dataUserId, currentBusiness ?? null);
        const wc = wcs.find((w) => String(w._id || w.id || '') === wcId);
        if (!cancelled) {
          setWcPreferenceLabel(wc?.name?.trim() ? String(wc.name).trim() : '');
        }
      } catch {
        if (!cancelled) setWcPreferenceLabel('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePreferenceRaw, dataUserId, currentBusiness, activeSalesPointId, pointsOfSale]);

  useEffect(() => {
    if (!businessId || !dataUserId || pointsOfSale.length !== 1) return;
    const only = pointsOfSale[0]._id;
    const raw = readDeliveryOpsSelectedPdvId(businessId, dataUserId);
    if (resolvePreferenceToPdvId(pointsOfSale, raw) === only) return;
    writeDeliveryOpsSelectedPdvId(businessId, dataUserId, only);
    notifyDeliveryActiveStoreChanged();
    bump();
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
    if (activeSalesPointId) {
      const p = pointsOfSale.find((x) => x._id === activeSalesPointId);
      if (p) return pointOfSaleDisplayLabel(p);
    }
    return wcPreferenceLabel;
  }, [activeSalesPointId, pointsOfSale, wcPreferenceLabel]);

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
