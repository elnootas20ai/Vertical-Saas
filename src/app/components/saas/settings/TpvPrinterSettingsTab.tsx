import { useEffect, useMemo, useState } from 'react';
import { Loader2, Store } from 'lucide-react';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { pointOfSaleDisplayLabel } from '../../../lib/deliveryApi';
import { coerceSelectedPdvId } from '../../../lib/deliveryOpsPdvSelection';
import { setActivePrinterScope } from '../../../lib/vertialPrint';
import { TpvPrinterSetupPanel } from '../TpvPrinterSetupPanel';
import { settingsInputClass, settingsLabelClass } from './settingsFormStyles';

/** Ajustes de gerente: misma UI que el modal del TPV, guardada en la tienda activa. */
export function TpvPrinterSettingsTab() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const {
    activeSalesPointId,
    pointsOfSale,
    allPointsOfSale,
    displayLabelForActive,
    refresh,
    loading,
    setActiveSalesPoint,
  } = useActiveStoreScope();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const [localPdvId, setLocalPdvId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const storePool = useMemo(() => {
    const activeFromScope = pointsOfSale.filter((p) => p.active !== false);
    if (activeFromScope.length > 0) return activeFromScope;
    return allPointsOfSale.filter((p) => p.active !== false);
  }, [pointsOfSale, allPointsOfSale]);

  const effectivePdvId = useMemo(() => {
    if (localPdvId && storePool.some((p) => p._id === localPdvId)) return localPdvId;
    return coerceSelectedPdvId(storePool, activeSalesPointId);
  }, [localPdvId, storePool, activeSalesPointId]);

  const pdv = storePool.find((p) => p._id === effectivePdvId) || null;

  useEffect(() => {
    if (storePool.length !== 1 || effectivePdvId) return;
    const only = storePool[0]._id;
    setLocalPdvId(only);
    setActiveSalesPoint(only);
  }, [storePool, effectivePdvId, setActiveSalesPoint]);

  useEffect(() => {
    if (!pdv) {
      setActivePrinterScope({});
      return;
    }
    setActivePrinterScope({ pdvId: pdv._id, pdv });
    return () => setActivePrinterScope({});
  }, [pdv?._id, pdv?._rev]);

  if (loading && storePool.length === 0) {
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

  if (storePool.length === 0) {
    return (
      <div className="max-w-2xl rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 text-sm text-amber-900 dark:text-amber-100">
        Aún no hay tiendas configuradas. Ve a <strong>Ajustes → Tienda</strong> para crear un punto de venta y vuelve aquí.
      </div>
    );
  }

  const storeLabel =
    (pdv ? pointOfSaleDisplayLabel(pdv) : null)
    || displayLabelForActive
    || 'Tienda';

  return (
    <div className="space-y-4 max-w-2xl">
      {storePool.length > 1 && (
        <label className="block rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <span className={`${settingsLabelClass} inline-flex items-center gap-1.5`}>
            <Store className="w-3.5 h-3.5" />
            Tienda a configurar
          </span>
          <select
            className={`${settingsInputClass} mt-2`}
            value={effectivePdvId || ''}
            onChange={(e) => {
              const id = e.target.value.trim();
              if (!id) return;
              setLocalPdvId(id);
              setActiveSalesPoint(id);
            }}
          >
            {storePool.map((item) => (
              <option key={item._id} value={item._id}>
                {pointOfSaleDisplayLabel(item)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Cada tienda puede tener su propia impresora térmica.
          </p>
        </label>
      )}

      {pdv ? (
        <TpvPrinterSetupPanel
          variant="page"
          scope={{
            userId,
            pdvId: pdv._id,
            pdv,
            storeLabel,
            onPdvUpdated: () => { void refresh(); },
          }}
        />
      ) : null}
    </div>
  );
}
