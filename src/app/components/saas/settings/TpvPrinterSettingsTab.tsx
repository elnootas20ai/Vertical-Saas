import { useEffect } from 'react';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { pointOfSaleDisplayLabel } from '../../../lib/deliveryApi';
import { setActivePrinterScope } from '../../../lib/vertialPrint';
import { TpvPrinterSetupPanel } from '../TpvPrinterSetupPanel';

/** Ajustes de gerente: misma UI que el modal del TPV, guardada en la tienda activa. */
export function TpvPrinterSettingsTab() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const { activeSalesPointId, pointsOfSale, displayLabelForActive, refresh } = useActiveStoreScope();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const pdv = pointsOfSale.find((p) => p._id === activeSalesPointId) || null;

  useEffect(() => {
    if (!pdv) {
      setActivePrinterScope({});
      return;
    }
    setActivePrinterScope({ pdvId: pdv._id, pdv });
    return () => setActivePrinterScope({});
  }, [pdv?._id, pdv?._rev]);

  if (!pdv || !userId) {
    return (
      <div className="max-w-2xl rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 text-sm text-amber-900 dark:text-amber-100">
        Selecciona una tienda en el selector superior para configurar su impresora.
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
