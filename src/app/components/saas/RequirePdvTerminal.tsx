import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { listPointsOfSaleRequest, type PointOfSale } from '../../lib/deliveryApi';
import { getBusinessHours, type BusinessHoursConfig } from '../../lib/settingsApi';

function hasActiveTerminal(pdvs: PointOfSale[]): boolean {
  return (pdvs || []).some((p) => Boolean(p.active) && (p.terminals || []).some((t) => Boolean(t.active)));
}

function hasValidBusinessHours(hours: BusinessHoursConfig | null): boolean {
  if (!hours?.schedule) return false;
  const days = Object.values(hours.schedule);
  return days.some((d) => d && d.open && typeof d.from === 'string' && typeof d.to === 'string' && d.from.trim() && d.to.trim() && d.from !== d.to);
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
  const [hours, setHours] = useState<BusinessHoursConfig | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (businessLoading || !dataUserId) return;
    setPdvs(null);
    listPointsOfSaleRequest(dataUserId)
      .then((r) => { if (!cancelled) setPdvs(r || []); })
      .catch(() => { if (!cancelled) setPdvs([]); });
    return () => { cancelled = true; };
  }, [businessLoading, dataUserId]);

  useEffect(() => {
    let cancelled = false;
    if (businessLoading || !dataUserId) return;
    setHours(null);
    getBusinessHours(dataUserId)
      .then((h) => { if (!cancelled) setHours(h || null); })
      .catch(() => { if (!cancelled) setHours(null); });
    return () => { cancelled = true; };
  }, [businessLoading, dataUserId]);

  const okPdv = pdvs ? hasActiveTerminal(pdvs) : true;
  const okHours = hours ? hasValidBusinessHours(hours) : true;
  const missing = !okHours; // PDV ya lo gestiona TpvRegisterGate; solo avisamos por horarios.

  if (businessLoading) return null;

  return (
    <>
      {missing && !bannerDismissed && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Configura los horarios del negocio para que las métricas y alertas funcionen al 100 %.
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/saas/settings/horarios')}
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

