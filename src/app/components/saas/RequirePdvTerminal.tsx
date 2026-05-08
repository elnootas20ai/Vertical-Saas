import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
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
  const userId = user?.user_id || user?.id || '';
  const navigate = useNavigate();
  const location = useLocation();
  const [pdvs, setPdvs] = useState<PointOfSale[] | null>(null);
  const [hours, setHours] = useState<BusinessHoursConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    listPointsOfSaleRequest(userId)
      .then((r) => { if (!cancelled) setPdvs(r || []); })
      .catch(() => { if (!cancelled) setPdvs([]); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    getBusinessHours(userId)
      .then((h) => { if (!cancelled) setHours(h || null); })
      .catch(() => { if (!cancelled) setHours(null); });
    return () => { cancelled = true; };
  }, [userId]);

  const okPdv = useMemo(() => (pdvs ? hasActiveTerminal(pdvs) : true), [pdvs]);
  const okHours = useMemo(() => (hours ? hasValidBusinessHours(hours) : true), [hours]);
  const ok = okPdv && okHours;

  useEffect(() => {
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
  }, [pdvs, hours, ok, okPdv, okHours, navigate, location.pathname, location.search]);

  if (pdvs === null || hours === null) return null;
  if (!ok) return null;
  return <>{children}</>;
}

