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

const TpvPrinterSetupPanel = lazy(() =>
  import('../TpvPrinterSetupPanel').then((m) => ({ default: m.TpvPrinterSetupPanel })),
);

/**
 * Ajustes → Empresa → Impresora. También accesible desde el icono de impresora en el TPV.
 * La IP se guarda en este dispositivo y se sincroniza con la tienda si hay PDV resuelto.
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
  } = useActiveStoreScope();
  const userId = resolveBusinessDataUserId(user, currentBusiness);

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

  // Carga directa en segundo plano si el contexto global no trae tiendas.
  // Nunca bloquea la UI: solo mejora el guardado (dispositivo → tienda).
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

  const scope = pdv
    ? {
        userId: userId || '',
        pdvId: pdv._id,
        pdv,
        terminalId: getActivePrinterScope().terminalId,
        storeLabel: displayLabelForActive || pointOfSaleDisplayLabel(pdv),
        onPdvUpdated: handlePdvUpdated,
      }
    : undefined;

  return (
    <Suspense fallback={<p className="text-sm text-gray-500 dark:text-gray-400 p-4">Cargando impresora…</p>}>
      <TpvPrinterSetupPanel scope={scope} />
    </Suspense>
  );
}
