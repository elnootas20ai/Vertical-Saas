import { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { pointOfSaleDisplayLabel } from '../../../lib/deliveryApi';
import { coerceSelectedPdvId } from '../../../lib/deliveryOpsPdvSelection';
import { setActivePrinterScope } from '../../../lib/vertialPrint';
import { TpvPrinterSetupPanel } from '../TpvPrinterSetupPanel';

/** Ajustes de gerente: misma UI que el modal del TPV, guardada en la tienda activa. */
export function TpvPrinterSettingsTab() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeStores = useMemo(() => {
    const fromScope = pointsOfSale.filter((p) => p.active !== false);
    if (fromScope.length > 0) return fromScope;
    return allPointsOfSale.filter((p) => p.active !== false);
  }, [pointsOfSale, allPointsOfSale]);

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

  if (loading && activeStores.length === 0) {
    return (
      <div className="max-w-2xl flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-sm text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Cargando tiendas…
      </div>
    );
  }

  if (!userId || !pdv) {
    return (
      <div className="max-w-2xl rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 text-sm text-amber-900 dark:text-amber-100">
        {activeStores.length === 0
          ? 'Aún no hay tiendas configuradas. Ve a Ajustes → Tienda para crear un punto de venta.'
          : 'No se pudo cargar la tienda activa. Recarga la página e inténtalo de nuevo.'}
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
