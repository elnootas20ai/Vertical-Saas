import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ScrollRestoration } from 'react-router-dom';
import { CookieConsentBanner } from './CookieConsentBanner';
import { shouldHideCookieConsentBannerOnIos } from '../lib/appStoreCompliance';
import { VertialLoadingState } from './VertialLoadingState';

function pathNeedsFullI18n(pathname: string) {
  if (pathname === '/' || pathname === '') return false;
  if (pathname.startsWith('/presentacion')) return false;
  // Legal/marketing públicos suelen usar landing o poco texto SaaS.
  if (pathname.startsWith('/legal') || pathname.startsWith('/privacidad') || pathname.startsWith('/cookies')) {
    return false;
  }
  return true;
}

export function RootLayout() {
  const location = useLocation();
  const isStandaloneMechanicView = location.pathname === '/mecanico';
  const isLandingPage = location.pathname === '/';
  const hideCookieBanner = shouldHideCookieConsentBannerOnIos();
  const needsFullI18n = pathNeedsFullI18n(location.pathname);
  const [i18nReady, setI18nReady] = useState(!needsFullI18n);

  useEffect(() => {
    if (!needsFullI18n) {
      setI18nReady(true);
      return;
    }
    let cancelled = false;
    setI18nReady(false);
    void import('../lib/i18n')
      .then(() => {
        if (!cancelled) setI18nReady(true);
      })
      .catch(() => {
        if (!cancelled) setI18nReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFullI18n]);

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
      <Suspense fallback={<VertialLoadingState variant="fullscreen" />}>
        {i18nReady ? <Outlet /> : <VertialLoadingState variant="fullscreen" />}
      </Suspense>
      {!isStandaloneMechanicView && !hideCookieBanner && <CookieConsentBanner />}
    </>
  );
}
