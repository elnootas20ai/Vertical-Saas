import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';

/**
 * Solo `VERTIAL_SUPER_ADMIN_EMAIL` (p. ej. panel global / auditoría).
 * Defensa en frontend; los endpoints `/api/admin/*` deben validar en servidor.
 */
export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const allowed = isVertialSuperAdminEmail(user?.email);

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (!allowed) {
      navigate('/saas/settings', { replace: true });
    }
  }, [allowed, isLoading, navigate, user]);

  if (isLoading) return null;
  if (!user || !allowed) return null;
  return <>{children}</>;
}
