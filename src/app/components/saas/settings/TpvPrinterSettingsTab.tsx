import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../../../lib/deliveryApi';
import { coerceSelectedPdvId } from '../../../lib/deliveryOpsPdvSelection';
import { setActivePrinterScope, getActivePrinterScope } from '../../../lib/vertialPrint/printerActiveScope';
import { loadRetailStoresForBusiness } from '../../../verticals/retailScopeRegistry';
import type { Business } from '../../../lib/businessApi';
import { isVertialNativeApp } from '../../../lib/vertialPrint/isNativeApp';
import { StorePrintersManager } from './StorePrintersManager';

const TpvPrinterSetupPanel = lazy(() =>
  import('../TpvPrinterSetupPanel').then((m) => ({ default: m.TpvPrinterSetupPanel })),
);

/**
 * Ajustes → Empresa → Impresora.
 * En PC: gestión por tienda (tablet + PC).
 * En tablet/app: además el asistente de Red local / IP de este dispositivo.
 */
export function TpvPrinterSettingsTab() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const {
    activeSalesPointId,
    activePreferenceRaw,
    pointsOfSale,
    allPointsOfSale,
    displayLabelForActive,
    refresh,
    setActiveSalesPoint,
  } = useActiveStoreScope();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const isNative = isVertialNativeApp();

  const [fallbackStores, setFallbackStores] = useState<PointOfSale[]>([]);
  const fallbackAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const contextStores = useMemo(() => {
    const fromScope = pointsOfSale.filter((p) => p.active !== false);
    if (fromScope.length > 0) return fromScope;
    return allPointsOfSale.filter((p) => p.active !== false);
  }, [pointsOfSale, allPointsOfSale]);

  useEffect(() => {
    if (contextStores.length > 0) return;
    const bid = String(currentBusiness?.business_id || '').trim();
    if (!user || !bid) return;
    if (fallbackAttemptRef.current === bid) return;
    fallbackAttemptRef.current = bid;
    void (async () => {
      try {
        const state = await loadRetailStoresForBusiness(
          user,
          currentBusiness as Business,
          businesses as Business[],
          {
            includeInactivePdvs: false,
            tpvBootstrap: false,
            skipPdvMerge: true,
            ensureTabletCodes: false,
          },
        );
        setFallbackStores(state.pointsOfSale.filter((p) => p.active !== false));
      } catch {
        /* sin tienda también funciona: la impresora queda guardada en el dispositivo */
      }
    })();
  }, [contextStores.length, user, currentBusiness, businesses]);

  const activeStores = contextStores.length > 0 ? contextStores : fallbackStores;

  const resolvedPdvId = useMemo(
    () => coerceSelectedPdvId(activeStores, activeSalesPointId || activePreferenceRaw),
    [activeStores, activeSalesPointId, activePreferenceRaw],
  );

  const pdv = activeStores.find((p) => p._id === resolvedPdvId) || activeStores[0] || null;

  useEffect(() => {
    if (!pdv) return;
    const terminalId = getActivePrinterScope().terminalId;
    setActivePrinterScope({ pdvId: pdv._id, pdv, terminalId });
  }, [pdv?._id, pdv?._rev]);

  const handlePdvUpdated = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleStoreSelect = useCallback(
    (pdvId: string) => {
      const id = String(pdvId || '').trim();
      if (!id) return;
      setActiveSalesPoint(id);
      const next = activeStores.find((p) => p._id === id);
      if (next) {
        setActivePrinterScope({
          pdvId: id,
          pdv: next,
          terminalId: getActivePrinterScope().terminalId,
        });
      }
    },
    [activeStores, setActiveSalesPoint],
  );

  const scope = pdv
    ? {
        userId: userId || '',
        pdvId: pdv._id,
        pdv,
        terminalId: getActivePrinterScope().terminalId,
        storeLabel: displayLabelForActive || pointOfSaleDisplayLabel(pdv),
        availableStores: activeStores,
        onStoreSelect: handleStoreSelect,
        onPdvUpdated: handlePdvUpdated,
      }
    : activeStores.length > 0
      ? {
          userId: userId || '',
          pdvId: '',
          availableStores: activeStores,
          onStoreSelect: handleStoreSelect,
        }
      : undefined;

  return (
    <div className="space-y-10">
      <StorePrintersManager variant="settings" />

      {isNative ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              Este dispositivo (tablet)
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Permiso de red local y prueba de ticket en esta tablet. La IP de la tienda se gestiona arriba.
            </p>
          </div>
          <Suspense fallback={<p className="text-sm text-gray-500 dark:text-gray-400 p-4">Cargando…</p>}>
            <TpvPrinterSetupPanel scope={scope} />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
