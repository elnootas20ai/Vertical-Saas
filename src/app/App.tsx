import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { ThemeProvider, useTheme } from 'next-themes';
import { router } from './routes';
import { OnboardingProvider, useOnboarding } from './context/OnboardingContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Puente que conecta el userId del AuthContext con el OnboardingContext
function OnboardingUserSync() {
  const { user } = useAuth();
  const { setUserId } = useOnboarding();

  useEffect(() => {
    setUserId(user?.user_id ?? null);
  }, [user?.user_id, setUserId]);

  return null;
}

const SAAS_THEME_STORAGE_KEY = 'vertial_saas_theme';

/**
 * Reglas de tema:
 * - Fuera de /saas: siempre light (sin dark por defecto ni persistencia).
 * - Dentro de /saas: se restaura el último tema elegido para SaaS.
 */
function ThemeRouteGuard() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const applyForPath = (pathname: string) => {
      const inSaas = pathname === '/saas' || pathname.startsWith('/saas/');
      if (inSaas) {
        const saved = localStorage.getItem(SAAS_THEME_STORAGE_KEY);
        if (saved && saved !== theme) setTheme(saved);
        return;
      }

      // Al salir de SaaS, recordamos el tema usado en SaaS y forzamos light fuera.
      if (theme && theme !== 'light') {
        localStorage.setItem(SAAS_THEME_STORAGE_KEY, theme);
      }
      setTheme('light');
    };

    // Primer render
    applyForPath(window.location.pathname);

    // Cambios de ruta (Data Router)
    const unsubscribe = router.subscribe((state) => {
      const pathname = state.location?.pathname || window.location.pathname;
      applyForPath(pathname);
    });

    return unsubscribe;
  }, [setTheme, theme]);

  return null;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ThemeRouteGuard />
      <AuthProvider>
        <OnboardingProvider>
          <OnboardingUserSync />
          <RouterProvider router={router} />
        </OnboardingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}