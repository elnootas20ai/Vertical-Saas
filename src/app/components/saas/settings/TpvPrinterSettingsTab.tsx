import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../../../lib/deliveryApi';
import { coerceSelectedPdvId } from '../../../lib/deliveryOpsPdvSelection';
import { setActivePrinterScope } from '../../../lib/vertialPrint';
import { loadRetailStoresForBusiness } from '../../../verticals/retailScopeRegistry';
import type { Business } from '../../../lib/businessApi';
import { TpvPrinterSetupPanel } from '../TpvPrinterSetupPanel';

/**
 * Ajustes → Tickets. La impresora NUNCA depende de la tienda: el panel se
 * muestra siempre y guarda en este dispositivo. Si la tienda del usuario se
 * resuelve en segundo plano, además se sincroniza con ella (todos los TPV la heredan).
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
    if (!pdv) {
      setActivePrinterScope({});
      return;
    }
    setActivePrinterScope({ pdvId: pdv._id, pdv });
    return () => setActivePrinterScope({});
  }, [pdv?._id, pdv?._rev]);

  const handlePdvUpdated = useCallback(() => {
    void refresh();
  }, [refresh]);

  const scope = userId && pdv
    ? {
        userId,
        pdvId: pdv._id,
        pdv,
        storeLabel: displayLabelForActive || pointOfSaleDisplayLabel(pdv),
        onPdvUpdated: handlePdvUpdated,
      }
    : undefined;

  return <TpvPrinterSetupPanel variant="page" scope={scope} />;
}
