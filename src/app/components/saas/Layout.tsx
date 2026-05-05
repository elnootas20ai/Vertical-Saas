import React, { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SubscriptionBanner } from './SubscriptionBanner';
import { BottomNav } from './BottomNav';
import { GlobalSearchModal } from './GlobalSearchModal';
import { BusinessCarousel } from './BusinessCarousel';

import { OnboardingTour } from './OnboardingTour';
import { GuidedStepsPopup } from './GuidedStepsPopup';
import { ErrorBoundary } from '../ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { Mail, X } from 'lucide-react';
import { EMAIL_SKIP_KEY } from '../../pages/auth/VerifyEmailPending';

interface LayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  noPadding?: boolean;
}

function UnverifiedEmailBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.emailVerified || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
  };

  const handleVerify = () => {
    if (user.user_id) {
      localStorage.removeItem(EMAIL_SKIP_KEY(user.user_id));
    }
    navigate('/auth/verify-email-pending');
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
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function Layout({ children, title, subtitle, noPadding }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { businesses, currentBusiness, switchBusiness } = useBusiness();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    return stored === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const isDashboard = location.pathname === '/saas/dashboard';
  const isGeneralActive = isDashboard && (() => {
    try { return localStorage.getItem('vertial_dash_general') === '1'; } catch { return false; }
  })();

  const handleSelectGeneral = useCallback(() => {
    try { localStorage.setItem('vertial_dash_general', '1'); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent('vertial:layout-general'));
    navigate('/saas/dashboard');
  }, [navigate]);

  const handleSwitchBusiness = useCallback((businessId: string) => {
    switchBusiness(businessId);
    if (isDashboard) {
      try { localStorage.setItem('vertial_dash_general', '0'); } catch { /* noop */ }
      window.dispatchEvent(new CustomEvent('vertial:layout-business'));
    }
  }, [switchBusiness, isDashboard]);

  // Two-key sequence tracking (G+D, N+V, etc.)
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
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

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Cmd/Ctrl+K → búsqueda global
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(v => !v);
        return;
      }

      if (isTyping) return;

      const key = e.key.toUpperCase();

      // Two-key sequences
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

        // N+X dispatches a custom event pages can listen to
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

      // First key of a sequence
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

  const desktopMargin = sidebarCollapsed ? 'md:ml-20' : 'md:ml-60';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main content */}
      <div className={`transition-all duration-300 ${desktopMargin}`}>
        <SubscriptionBanner />
        <UnverifiedEmailBanner />
        <Topbar
          title={title}
          subtitle={subtitle}
          onToggleSidebar={handleToggleSidebar}
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
        />
        {isDashboard && businesses.length > 1 && (
          <div className="px-3 md:px-4 pt-3">
            <BusinessCarousel
              businesses={businesses}
              currentBusinessId={currentBusiness?.business_id}
              onSwitchBusiness={handleSwitchBusiness}
              onSelectGeneral={handleSelectGeneral}
              isGeneralActive={isGeneralActive}
            />
          </div>
        )}
        {/* Extra bottom padding on mobile so content clears the BottomNav */}
        <main className={`overflow-x-auto ${noPadding ? 'pb-16 md:pb-0' : 'py-4 pb-16 md:pb-0 px-3 md:px-4'}`}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav />

      {/* Global overlays */}
      <GlobalSearchModal isOpen={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      <OnboardingTour />
      <GuidedStepsPopup />
    </div>
  );
}
