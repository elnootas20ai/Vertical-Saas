import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { listPointsOfSaleRequest, type PointOfSale } from '../../lib/deliveryApi';
import { anyActiveRetailStoreHasOpeningHours } from '../../lib/businessHoursUtils';
import { listWorkCentersForDelivery } from '../../lib/workCentersApi';
import {
  filterPointsOfSaleForWorkCenters,
  resolveBusinessScopeId,
  workCentersStrictlyForBusiness,
} from '../../lib/deliverySetup';

function hasActiveTerminal(pdvs: PointOfSale[]): boolean {
  return (pdvs || []).some((p) => Boolean(p.active) && (p.terminals || []).some((t) => Boolean(t.active)));
}

/**
 * Antes este componente forzaba la redirección a Ajustes si faltaba PDV u
 * horarios. Eso bloqueaba el primer acceso a TPV Rápido/Caja en cuentas
 * nuevas, generando la sensación de "no va": el usuario clica y se ve
 * expulsado a una pantalla de configuración.
 *
 * Ahora se comporta como guard suave: deja pasar siempre y muestra un banner
 * de aviso si falta algo. `TpvRegisterGate` ya ofrece una `OpeningScreen`
 * que maneja el caso "sin PDV" con un CTA claro para configurar.
 */
export function RequirePdvTerminal({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { currentBusiness, isLoading: businessLoading } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const navigate = useNavigate();
  const [pdvs, setPdvs] = useState<PointOfSale[] | null>(null);
  const [retailStoresOk, setRetailStoresOk] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const businessId = resolveBusinessScopeId(currentBusiness);

  useEffect(() => {
    let cancelled = false;
    if (businessLoading || !currentBusiness?.business_id || !dataUserId || !businessId) return;
    setPdvs(null);
    Promise.all([
      listPointsOfSaleRequest(dataUserId),
      listWorkCentersForDelivery(dataUserId, currentBusiness ?? null),
    ])
      .then(([rawPdvs, allWcs]) => {
        if (cancelled) return;
        const retail = workCentersStrictlyForBusiness(allWcs, businessId).filter(
          (wc) =>
            wc.active !== false &&
            (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
        );
        setPdvs(filterPointsOfSaleForWorkCenters(rawPdvs || [], retail));
      })
      .catch(() => {
        if (!cancelled) setPdvs([]);
      });
    return () => { cancelled = true; };
  }, [businessLoading, dataUserId, businessId, currentBusiness]);

  useEffect(() => {
    let cancelled = false;
    if (businessLoading || !dataUserId || !user?.user_id) return;
    setRetailStoresOk(null);
    listWorkCentersForDelivery(dataUserId, currentBusiness ?? null)
      .then((all) => {
        if (cancelled) return;
        const scoped = workCentersStrictlyForBusiness(all, businessId);
        const retailActive = scoped.filter(
          (wc) =>
            wc.active !== false &&
            (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
        );
        setRetailStoresOk(anyActiveRetailStoreHasOpeningHours(retailActive));
      })
      .catch(() => {
        if (!cancelled) setRetailStoresOk(null);
      });
    return () => { cancelled = true; };
  }, [businessLoading, dataUserId, user?.user_id, currentBusiness, businessId]);

  useEffect(() => {
    const onChanged = () => {
      if (businessLoading || !dataUserId || !user?.user_id) return;
      listWorkCentersForDelivery(dataUserId, currentBusiness ?? null)
        .then((all) => {
          const scoped = workCentersStrictlyForBusiness(all, businessId);
          const retailActive = scoped.filter(
            (wc) =>
              wc.active !== false &&
              (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
          );
          setRetailStoresOk(anyActiveRetailStoreHasOpeningHours(retailActive));
        })
        .catch(() => undefined);
    };
    window.addEventListener('work-centers:changed', onChanged);
    return () => window.removeEventListener('work-centers:changed', onChanged);
  }, [businessLoading, dataUserId, user?.user_id, currentBusiness, businessId]);

  const okPdv = pdvs ? hasActiveTerminal(pdvs) : true;
  const okHours = retailStoresOk !== false;
  const missing = okPdv && retailStoresOk === false;

  return (
    <>
      {missing && !bannerDismissed && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Configura el horario de apertura de tu tienda para que las métricas y alertas funcionen al 100 %.
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/saas/settings/tienda?action=horarios')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
            >
              Configurar <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="p-1 rounded-md text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              aria-label="Cerrar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {/* Variables expuestas para futura telemetría/UX; los gates downstream gestionan PDV. */}
      <span className="hidden" data-okpdv={okPdv ? '1' : '0'} />
      {children}
    </>
  );
}

