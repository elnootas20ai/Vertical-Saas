import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
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

/** Ajustes de gerente: misma UI que el modal del TPV, guardada en la tienda activa. */
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
    loading,
  } = useActiveStoreScope();
  const userId = resolveBusinessDataUserId(user, currentBusiness);

  // Carga directa de respaldo: el contexto global puede decidir no cargar tiendas
  // (según vertical/caché), pero esta pestaña necesita el PDV sí o sí.
  const [fallbackStores, setFallbackStores] = useState<PointOfSale[] | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const fallbackAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const contextStores = useMemo(() => {
    const fromScope = pointsOfSale.filter((p) => p.active !== false);
    if (fromScope.length > 0) return fromScope;
    return allPointsOfSale.filter((p) => p.active !== false);
  }, [pointsOfSale, allPointsOfSale]);

  const loadFallbackStores = useCallback(async () => {
    if (!user || !currentBusiness) return;
    setFallbackLoading(true);
    setFallbackError(false);
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
      setFallbackError(true);
    } finally {
      setFallbackLoading(false);
    }
  }, [user, currentBusiness, businesses]);

  useEffect(() => {
    if (contextStores.length > 0) return;
    const bid = String(currentBusiness?.business_id || '').trim();
    if (!user || !bid) return;
    if (fallbackAttemptRef.current === bid) return;
    fallbackAttemptRef.current = bid;
    void loadFallbackStores();
  }, [contextStores.length, user, currentBusiness?.business_id, loadFallbackStores]);

  const activeStores = contextStores.length > 0 ? contextStores : (fallbackStores ?? []);

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

  // No afirmar "no hay tiendas" hasta que una búsqueda real haya terminado.
  const emptyStateSettled = contextStores.length > 0 || fallbackStores !== null || fallbackError;

  if (activeStores.length === 0 && (loading || fallbackLoading || !emptyStateSettled)) {
    return (
      <div className="max-w-2xl flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-sm text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Cargando tiendas…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="max-w-2xl rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 text-sm text-amber-900 dark:text-amber-100">
        Inicia sesión de nuevo para configurar la impresora del TPV.
      </div>
    );
  }

  if (!pdv) {
    return (
      <div className="max-w-2xl rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
        <p className="text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {fallbackError
            ? 'No se pudieron cargar las tiendas (fallo de conexión). Comprueba tu internet y reintenta.'
            : 'No se encontró ninguna tienda activa. Si ya tienes una creada, reintenta la carga; si no, créala en Ajustes → Tienda.'}
        </p>
        <button
          type="button"
          onClick={() => {
            fallbackAttemptRef.current = null;
            void refresh();
            void loadFallbackStores();
          }}
          disabled={fallbackLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {fallbackLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Reintentar carga de tiendas
        </button>
      </div>
    );
  }

  return (
    <TpvPrinterSetupPanel
      variant="page"
      scope={{
        userId,
        pdvId: pdv._id,
        pdv,
        storeLabel: displayLabelForActive || pointOfSaleDisplayLabel(pdv),
        onPdvUpdated: () => { void refresh(); },
      }}
    />
  );
}
