import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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

export function RequirePdvTerminal({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { currentBusiness, isLoading: businessLoading } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [pdvs, setPdvs] = useState<PointOfSale[] | null>(null);
  const [hours, setHours] = useState<BusinessHoursConfig | null>(null);

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

  const okPdv = useMemo(() => (pdvs ? hasActiveTerminal(pdvs) : true), [pdvs]);
  const okHours = useMemo(() => (hours ? hasValidBusinessHours(hours) : true), [hours]);
  const ok = okPdv && okHours;

  useEffect(() => {
    if (businessLoading) return;
    if (!dataUserId) return;
    if (pdvs === null) return;
    if (hours === null) return;
    if (ok) return;

    const from = `${location.pathname}${location.search}`;
    if (!okPdv) {
      toast.error('Antes de usar TPV/Caja, configura un PDV con al menos 1 terminal activo.');
      navigate('/saas/settings/centros-de-trabajo', { replace: true, state: { from } });
      return;
    }
    if (!okHours) {
      toast.error('Antes de usar TPV/Caja, configura los horarios del negocio.');
      navigate('/saas/settings/horarios', { replace: true, state: { from } });
    }
  }, [businessLoading, dataUserId, pdvs, hours, ok, okPdv, okHours, navigate, location.pathname, location.search]);

  if (businessLoading || pdvs === null || hours === null) return null;
  if (!ok) return null;
  return <>{children}</>;
}

