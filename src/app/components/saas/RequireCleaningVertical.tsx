import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AuthRouteLoading } from '../AuthRouteLoading';

/** Bloquea rutas de limpieza en negocios que no son cleaning. */
export function RequireCleaningVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = String(businessType || '').trim() === 'cleaning';

  useEffect(() => {
    if (pending) return;
    if (!allowed) {
      navigate('/saas/dashboard', { replace: true });
    }
  }, [allowed, pending, navigate]);

  if (pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }
  if (!allowed) return null;
  return <>{children}</>;
}
