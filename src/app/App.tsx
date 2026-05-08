import { useEffect, useRef } from 'react';
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

function pathnameIsSaas(pathname: string) {
  return pathname === '/saas' || pathname.startsWith('/saas/');
}

/**
 * Reglas de tema:
 * - Fuera de /saas: siempre light (marketing/auth).
 * - Dentro de /saas: preferencia en vertial_saas_theme.
 * Solo aplicamos esa preferencia al cruzar el límite (entrar/salir). Si el efecto
 * dependiera de `theme`, cada cambio a claro volvería a leer "dark" de localStorage
 * hasta que se sincronizara — el modo oscuro parecía "atascado".
 */
function ThemeRouteGuard() {
  const { setTheme, resolvedTheme } = useTheme();
  const resolvedRef = useRef(resolvedTheme);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    resolvedRef.current = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!pathnameIsSaas(window.location.pathname)) return;
    const r = resolvedTheme;
    if (r === 'dark' || r === 'light') {
      localStorage.setItem(SAAS_THEME_STORAGE_KEY, r);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const applyForPath = (pathname: string) => {
      const inSaas = pathnameIsSaas(pathname);
      const prev = prevPathRef.current;
      const prevInSaas = prev !== null && pathnameIsSaas(prev);

      if (inSaas && !prevInSaas) {
        const saved = localStorage.getItem(SAAS_THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') setTheme(saved);
      } else if (!inSaas && prevInSaas) {
        const r = resolvedRef.current;
        if (r === 'dark' || r === 'light') {
          localStorage.setItem(SAAS_THEME_STORAGE_KEY, r);
        }
        setTheme('light');
      }

      prevPathRef.current = pathname;
    };

    applyForPath(window.location.pathname);

    const unsubscribe = router.subscribe((state) => {
      const pathname = state.location?.pathname || window.location.pathname;
      applyForPath(pathname);
    });

    return unsubscribe;
  }, [setTheme]);

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