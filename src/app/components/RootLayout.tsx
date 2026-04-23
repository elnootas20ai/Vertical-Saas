import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ScrollRestoration } from 'react-router-dom';
import { CookieConsentBanner } from './CookieConsentBanner';

export function RootLayout() {
  const location = useLocation();
  const isStandaloneMechanicView = location.pathname === '/mecanico';
  const isLandingPage = location.pathname === '/';

  useEffect(() => {
    if (!isLandingPage) return;

    const root = document.documentElement;
    const hadDarkMode = root.classList.contains('dark');

    if (hadDarkMode) {
      root.classList.remove('dark');
    }

    return () => {
      if (hadDarkMode) {
        root.classList.add('dark');
      }
    };
  }, [isLandingPage]);

  return (
    <>
      {/* Necesario para que navigate(..., { preventScrollReset: true }) evite subir el scroll al cambiar de ruta */}
      <ScrollRestoration />
      <Outlet />
      {!isStandaloneMechanicView && <CookieConsentBanner />}
    </>
  );
}
