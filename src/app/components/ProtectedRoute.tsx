import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Espera a que AuthContext termine de restaurar sesión antes de decidir redirección.
    if (!isInitializing && !isAuthenticated) {
      navigate('/auth/entry', { replace: true });
    }
  }, [isAuthenticated, isInitializing, navigate]);

  if (isInitializing || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
