import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Restringe el acceso a páginas "de negocio" (Centro Operativo, listas
 * completas, finanzas, ajustes globales…). Si el usuario es un team member
 * invitado (`accountType === 'user'` o tiene `invitedBy`), lo manda a su home
 * de trabajador para no exponer ingresos, históricos ni datos sensibles.
 *
 * Es defensa en frontend: el backend bloquea también los endpoints más
 * sensibles (p. ej. `/api/delivery/ops-center/...` devuelve 403 para workers).
 */
export function RequireBusinessOwner({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();
  const navigate = useNavigate();

  const isWorker = Boolean(
    user && (user.accountType === 'user' || (user as { invitedBy?: string }).invitedBy),
  );

  useEffect(() => {
    if (isInitializing) return;
    if (!user) return;
    if (isWorker) {
      navigate('/saas/worker', { replace: true });
    }
  }, [isInitializing, user, isWorker, navigate]);

  if (isInitializing) return null;
  if (isWorker) return null;
  return <>{children}</>;
}
