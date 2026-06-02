import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Impide onboarding y gate sin sesión activa y hasta que el email esté verificado. */
export function RequireEmailVerified({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isInitializing, isAuthenticated, user } = useAuth();
  if (isInitializing) return null;
  if (!isAuthenticated || !user?.user_id) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }
  if (!user.emailVerified) {
    return <Navigate to="/auth/verify-email-pending" replace />;
  }
  return <>{children}</>;
}
