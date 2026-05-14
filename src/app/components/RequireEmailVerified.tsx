import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Impide onboarding y gate hasta que el email esté verificado (sesión activa). */
export function RequireEmailVerified({ children }: { children: React.ReactNode }) {
  const { isInitializing, isAuthenticated, user } = useAuth();
  if (isInitializing) return null;
  if (isAuthenticated && user && !user.emailVerified) {
    return <Navigate to="/auth/verify-email-pending" replace />;
  }
  return <>{children}</>;
}
