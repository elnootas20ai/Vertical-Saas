import React, { ReactNode, useState, useEffect, useCallback, useRef, useReducer } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SubscriptionBanner } from './SubscriptionBanner';
import { BusinessesSyncBanner } from './BusinessesSyncBanner';
import { PendingInvitationsBanner } from './PendingInvitationsBanner';
import { WorkerProfileCompletionBanner } from './WorkerProfileCompletionBanner';
import { BottomNav } from './BottomNav';
import { GlobalSearchModal } from './GlobalSearchModal';
import { BusinessCarousel } from './BusinessCarousel';
import { useDashboardViewOptional } from '../../context/DashboardViewContext';
import { usePortfolioPlanAccess } from '../../hooks/usePortfolioPlanAccess';
import { useSwitchActiveBusiness } from '../../hooks/useSwitchActiveBusiness';
import { PageLayoutProvider, usePageLayoutConfig, useRegisterPageLayout } from '../../context/PageLayoutContext';
import { isChromelessSaasRoute } from '../../lib/saasChromelessRoute';

import { OnboardingTour } from './OnboardingTour';
import { OnboardingTourCompleteToast } from './OnboardingTourCompleteToast';
import { GuidedStepsPopup } from './GuidedStepsPopup';
import { ActivationPageCoach } from './ActivationPageCoach';
import { ErrorBoundary } from '../ErrorBoundary';
import { useAuthOptional, type AuthContextType } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { useBusiness } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { resolveRetailOpsHomePath } from '../../lib/retailOpsPaths';
import { Mail, X, ArrowLeft } from 'lucide-react';
import {
  dismissBannerForRestOfLocalDay,
  isBannerDismissedForLocalToday,
} from '../../lib/dayBannerDismiss';

interface LayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  noPadding?: boolean;
  titleClassName?: string;
  subtitleClassName?: string;
}

/** Shell persistente: sidebar + topbar montados una sola vez por sesión SaaS. */
export function SaasAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (isChromelessSaasRoute(location.pathname)) {
    return <>{children}</>;
  }
  return (
    <PageLayoutProvider>
      <SaasAppShellInner>{children}</SaasAppShellInner>
    </PageLayoutProvider>
  );
}

/** Registra título/padding de la página activa; el chrome vive en SaasAppShell. */
export function Layout({
  children,
  title,
  subtitle,
  noPadding,
  titleClassName,
  subtitleClassName,
}: LayoutProps) {
  useRegisterPageLayout({ title, subtitle, noPadding, titleClassName, subtitleClassName });
  return <>{children}</>;
}

/** Navegación desde Centro Operativo (delivery): barra compacta para volver sin perder contexto */
function DeliveryOpsReturnStrip() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  if (isRestaurantBusinessType(currentBusiness?.businessType)) return null;
  const fromOps = Boolean((location.state as { returnToOps?: boolean } | null)?.returnToOps);
  if (!fromOps || location.pathname === '/saas/delivery-ops') return null;

  return (
    <div className="mb-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 flex flex-wrap items-center gap-2 shadow-sm">
      <button
        type="button"
        onClick={() => navigate(resolveRetailOpsHomePath(currentBusiness?.businessType))}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <ArrowLeft className="w-4 h-4 shrink-0" />
        Volver al Centro Operativo
      </button>
      <span className="text-xs text-gray-500 dark:text-gray-400">Abriste esta pantalla desde Ops</span>
    </div>
  );
}

function UnverifiedEmailBanner({ user }: { user: AuthContextType['user'] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const dismissKey = user?.user_id ? `vertial.banner.dismissDay.${user.user_id}.emailUnverified` : '';
  const dismissedToday = dismissKey && isBannerDismissedForLocalToday(dismissKey);

  useEffect(() => {
    rerender();
  }, [location.pathname]);

  useEffect(() => {
    const id = window.setInterval(() => rerender(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!user || user.emailVerified || dismissedToday) return null;

  const handleDismiss = () => {
    if (dismissKey) dismissBannerForRestOfLocalDay(dismissKey);
    rerender();
  };

  const handleVerify = () => {
    navigate('/saas/settings/seguridad');
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b text-sm text-white bg-violet-500 border-violet-600">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 shrink-0 text-white" />
        <span>
          Tu email aún no está verificado.{' '}
          <button
            onClick={handleVerify}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Verificar ahora
          </button>
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 rounded hover:opacity-80 transition-opacity"
        aria-label="Cerrar hasta mañana"
        title="No mostrar hoy (se restablece a las 00:00)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function SaasAppShellInner({ children }: { children: ReactNode }) {
  const auth = useAuthOptional();
  const navigate = useNavigate();
  const location = useLocation();
  const { title, subtitle, noPadding, titleClassName, subtitleClassName } = usePageLayoutConfig();
  const user = auth?.user;
  const { businesses, currentBusiness } = useBusiness();
  const switchActiveBusiness = useSwitchActiveBusiness();
  const dashboardView = useDashboardViewOptional();
  const portfolioPlan = usePortfolioPlanAccess();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const isDashboard = location.pathname === '/saas/dashboard';
  const showBusinessCarousel = isDashboard && businesses.length > 1;

  const handleSwitchBusiness = useCallback((businessId: string) => {
    switchActiveBusiness(businessId);
  }, [switchActiveBusiness]);

  const handlePortfolioTabClick = useCallback(() => {
    if (!portfolioPlan.canUsePortfolioView) {
      navigate('/saas/billing');
      return;
    }
    dashboardView?.setPortfolioView(true);
  }, [portfolioPlan.canUsePortfolioView, navigate, dashboardView]);

  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sidebarCollapsed) {
      localStorage.setItem('sidebarCollapsed', 'true');
    } else {
      localStorage.removeItem('sidebarCollapsed');
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileSidebarOpen(prev => !prev);
    } else {
      setSidebarCollapsed(prev => !prev);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(v => !v);
        return;
      }

      if (isTyping) return;

      const key = e.key.toUpperCase();

      if (lastKeyRef.current) {
        const seq = `${lastKeyRef.current}+${key}`;
        lastKeyRef.current = null;
        if (lastKeyTimerRef.current) clearTimeout(lastKeyTimerRef.current);

        const GO_MAP: Record<string, string> = {
          'G+D': '/saas/dashboard',
          'G+V': '/saas/vehicles',
          'G+C': '/saas/clients',
          'G+S': '/saas/sales',
          'G+P': '/saas/pipeline',
          'G+F': '/saas/finance',
          'G+R': '/saas/reports',
        };

        if (GO_MAP[seq]) {
          navigate(GO_MAP[seq]);
          return;
        }

        const NEW_MAP: Record<string, string> = {
          'N+V': 'vertial:new-vehicle',
          'N+L': 'vertial:new-lead',
          'N+C': 'vertial:new-client',
          'N+S': 'vertial:new-sale',
        };

        if (NEW_MAP[seq]) {
          window.dispatchEvent(new CustomEvent(NEW_MAP[seq]));
          return;
        }
        return;
      }

      if (['G', 'N'].includes(key)) {
        lastKeyRef.current = key;
        if (lastKeyTimerRef.current) clearTimeout(lastKeyTimerRef.current);
        lastKeyTimerRef.current = setTimeout(() => {
          lastKeyRef.current = null;
        }, 800);
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [navigate]);

  if (!auth || (auth.isInitializing && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  const desktopMargin = sidebarCollapsed ? 'md:ml-20' : 'md:ml-60';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className={`md:transition-[margin-left] md:duration-300 ${desktopMargin}`}>
        <SubscriptionBanner />
        <BusinessesSyncBanner />
        <UnverifiedEmailBanner user={user} />
        <PendingInvitationsBanner />
        <Topbar
          title={title}
          subtitle={subtitle}
          titleClassName={titleClassName}
          subtitleClassName={subtitleClassName}
          onToggleSidebar={handleToggleSidebar}
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
        />
        {showBusinessCarousel && (
          <div className="px-3 md:px-4 pt-3">
            <BusinessCarousel
              businesses={businesses}
              currentBusinessId={currentBusiness?.business_id}
              onSwitchBusiness={handleSwitchBusiness}
              showPortfolioTab={
                businesses.length > 1 &&
                (portfolioPlan.canUsePortfolioView || portfolioPlan.portfolioLocked)
              }
              portfolioViewActive={dashboardView?.isPortfolioView ?? false}
              portfolioTabLocked={portfolioPlan.portfolioLocked}
              onSelectPortfolioView={handlePortfolioTabClick}
              onPortfolioLockedClick={handlePortfolioTabClick}
            />
          </div>
        )}
        <main className={`overflow-x-auto ${noPadding ? 'pb-16 md:pb-0' : 'py-4 pb-16 md:pb-0 px-3 md:px-4'}`}>
          {/* key por ruta: un error en una página no debe dejar bloqueada la navegación al resto */}
          <ErrorBoundary key={location.pathname}>
            <DeliveryOpsReturnStrip />
            <WorkerProfileCompletionBanner />
            <ActivationPageCoach />
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav />

      <GlobalSearchModal isOpen={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      {!isWorkerAccount(user) ? <OnboardingTourCompleteToast /> : null}
      {!isWorkerAccount(user) ? <OnboardingTour /> : null}
      {!isWorkerAccount(user) ? <GuidedStepsPopup /> : null}
    </div>
  );
}
