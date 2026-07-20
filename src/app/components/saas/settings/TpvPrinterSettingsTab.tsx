import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  dedupePointsOfSale,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../../../lib/deliveryApi';
import {
  filterPointsOfSaleForWorkCenters,
  resolveBusinessScopeId,
  workCentersStrictlyForBusiness,
} from '../../../lib/deliverySetup';
import { coerceSelectedPdvId } from '../../../lib/deliveryOpsPdvSelection';
import { setActivePrinterScope, getActivePrinterScope } from '../../../lib/vertialPrint/printerActiveScope';
import { loadRetailStoresForBusiness } from '../../../verticals/retailScopeRegistry';
import type { Business } from '../../../lib/businessApi';
import type { TpvPrinterStoreGroup } from '../TpvPrinterSetupPanel';

const TpvPrinterSetupPanel = lazy(() =>
  import('../TpvPrinterSetupPanel').then((m) => ({ default: m.TpvPrinterSetupPanel })),
);

/**
 * Ajustes → Empresa → Impresora.
 * Empresas de la cuenta + tiendas reales de cada una (sin PDVs huérfanos de otras).
 */
export function TpvPrinterSettingsTab() {
  const { user } = useAuth();
  const { currentBusiness, businesses, switchBusiness } = useBusiness();
  const {
    activeSalesPointId,
    activePreferenceRaw,
    displayLabelForActive,
    refresh,
    setActiveSalesPoint,
  } = useActiveStoreScope();
  const userId = resolveBusinessDataUserId(user, currentBusiness);

  const [storeGroups, setStoreGroups] = useState<TpvPrinterStoreGroup[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  const businessList = useMemo(
    () => (Array.isArray(businesses) ? businesses : []).filter((b) => b?.business_id || b?.id),
    [businesses],
  );

  const knownBusinessIds = useMemo(
    () => businessList.map((b) => resolveBusinessScopeId(b as Business)).filter(Boolean),
    [businessList],
  );

  const loadAllStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      await refresh().catch(() => undefined);

      if (!user || businessList.length === 0) {
        setStoreGroups([]);
        return;
      }

      const groups = await Promise.all(
        businessList.map(async (biz) => {
          const businessId = resolveBusinessScopeId(biz as Business);
          const businessName = String(biz.name || '').trim() || 'Empresa';
          if (!businessId) {
            return { businessId: '', businessName, stores: [] as PointOfSale[] };
          }
          try {
            const state = await loadRetailStoresForBusiness(
              user,
              biz as Business,
              businesses as Business[],
              {
                includeInactivePdvs: false,
                tpvBootstrap: false,
                skipPdvMerge: true,
                ensureTabletCodes: false,
                accountBusinessCount: businessList.length,
                knownBusinessIds,
              },
            );
            // Multi-empresa: solo centros etiquetados a esta empresa (no huérfanos legacy).
            const strictCenters =
              businessList.length > 1
                ? workCentersStrictlyForBusiness(state.workCenters || [], businessId)
                : state.workCenters || [];
            const stores = dedupePointsOfSale(
              filterPointsOfSaleForWorkCenters(state.pointsOfSale || [], strictCenters, {
                businessId,
              }).filter((p) => p.active !== false),
            );
            return { businessId, businessName, stores };
          } catch {
            return { businessId, businessName, stores: [] as PointOfSale[] };
          }
        }),
      );

      setStoreGroups(groups.filter((g) => g.businessId));
    } finally {
      setLoadingStores(false);
    }
  }, [businessList, businesses, knownBusinessIds, refresh, user]);

  useEffect(() => {
    void loadAllStores();
  }, [loadAllStores]);

  const stores = useMemo(
    () => dedupePointsOfSale(storeGroups.flatMap((g) => g.stores)),
    [storeGroups],
  );

  const resolvedPdvId = useMemo(
    () => coerceSelectedPdvId(stores, activeSalesPointId || activePreferenceRaw),
    [stores, activeSalesPointId, activePreferenceRaw],
  );

  const pdv = stores.find((p) => p._id === resolvedPdvId) || stores[0] || null;

  useEffect(() => {
    if (!pdv) return;
    const terminalId = getActivePrinterScope().terminalId;
    setActivePrinterScope({ pdvId: pdv._id, pdv, terminalId });
  }, [pdv?._id, pdv?._rev]);

  const handlePdvUpdated = useCallback(() => {
    void loadAllStores();
  }, [loadAllStores]);

  const handleStoreSelect = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id) return;
      const group = storeGroups.find((g) => g.stores.some((s) => s._id === id));
      const currentId = resolveBusinessScopeId(currentBusiness as Business | null);
      if (group?.businessId && group.businessId !== currentId) {
        switchBusiness(group.businessId);
      }
      setActiveSalesPoint(id);
      const next = stores.find((p) => p._id === id);
      if (next) {
        setActivePrinterScope({
          pdvId: id,
          pdv: next,
          terminalId: getActivePrinterScope().terminalId,
        });
      }
    },
    [storeGroups, currentBusiness, switchBusiness, setActiveSalesPoint, stores],
  );

  const scope = pdv
    ? {
        userId: userId || '',
        pdvId: pdv._id,
        pdv,
        terminalId: getActivePrinterScope().terminalId,
        storeLabel: displayLabelForActive || pointOfSaleDisplayLabel(pdv),
        availableStores: stores,
        availableStoreGroups: storeGroups,
        onStoreSelect: handleStoreSelect,
        onPdvUpdated: handlePdvUpdated,
      }
    : storeGroups.length > 0
      ? {
          userId: userId || '',
          pdvId: '',
          availableStores: stores,
          availableStoreGroups: storeGroups,
          onStoreSelect: handleStoreSelect,
        }
      : undefined;

  return (
    <div className="space-y-4">
      {loadingStores && stores.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-1">Cargando tiendas…</p>
      ) : null}
      <Suspense fallback={<p className="text-sm text-gray-500 dark:text-gray-400 p-4">Cargando impresora…</p>}>
        <TpvPrinterSetupPanel scope={scope} />
      </Suspense>
    </div>
  );
}
