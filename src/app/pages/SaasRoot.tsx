import { Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppProvider, useApp } from '../context/AppContext';
import { ActiveStoreScopeProvider } from '../context/ActiveStoreScopeContext';
import { useBusiness } from '../context/BusinessContext';
import { GroupProvider } from '../context/GroupContext';
import { ActivationChecklistProvider } from '../context/ActivationChecklistContext';
import { SetupProgressProvider, useSetupProgress } from '../context/SetupProgressContext';
import { ScrapyardProvider } from '../context/ScrapyardContext';
import { useAuth } from '../context/AuthContext';
import {
  countDeliveryPointsOfSale,
  DELIVERY_FIRST_PDV_PATH,
  isDeliveryBusinessType,
  isDeliveryPdvExemptPath,
} from '../lib/deliverySetup';

interface OnboardingCompanyProfile {
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  province?: string;
  city?: string;
  companyEmail?: string;
  companyPhone?: string;
}

interface OnboardingDataShape {
  businessType?: string;
  companyProfile?: OnboardingCompanyProfile;
}

function SaasContent() {
  const { subscription } = useApp();
  const { isAuthenticated, isInitializing, user } = useAuth();
  const { businesses, currentBusiness, isLoading: isLoadingBusinesses, createBusiness } = useBusiness();
  const { status: setupStatus, loading: setupLoading } = useSetupProgress();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAutoCreating, setIsAutoCreating] = useState(false);
  const autoCreateAttempted = useRef(false);
  const setupRedirectDone = useRef(false);
  const [deliveryHasPdv, setDeliveryHasPdv] = useState<boolean | null>(null);

  const activeBusinessType =
    currentBusiness?.businessType ||
    (user?.onboardingData as OnboardingDataShape | undefined)?.businessType ||
    businesses[0]?.businessType;
  const isDeliveryAccount = isDeliveryBusinessType(activeBusinessType);

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      navigate('/auth/login', { replace: true });
    }
  }, [isAuthenticated, isInitializing, navigate]);

  useEffect(() => {
    if (!isInitializing && isAuthenticated && user && !user.emailVerified) {
      if (location.pathname.startsWith('/saas/settings')) return;
      navigate('/auth/verify-email-pending', { replace: true });
    }
  }, [isInitializing, isAuthenticated, user, navigate, location.pathname]);

  useEffect(() => {
    if (!isAuthenticated || isInitializing || isLoadingBusinesses || !isDeliveryAccount) {
      setDeliveryHasPdv(null);
      return;
    }
    if (!user) {
      setDeliveryHasPdv(null);
      return;
    }
    let cancelled = false;
    setDeliveryHasPdv(null);
    void countDeliveryPointsOfSale(user, currentBusiness ?? businesses[0] ?? null)
      .then((count) => {
        if (!cancelled) setDeliveryHasPdv(count > 0);
      })
      .catch(() => {
        if (!cancelled) setDeliveryHasPdv(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    isInitializing,
    isLoadingBusinesses,
    isDeliveryAccount,
    user?.user_id,
    user?.id,
    currentBusiness,
    businesses,
  ]);

  /** Delivery: obligar primer PDV antes del checklist o del tour. */
  useEffect(() => {
    if (!isAuthenticated || isInitializing || isLoadingBusinesses || !isDeliveryAccount) return;
    if (deliveryHasPdv !== false) return;
    if (isDeliveryPdvExemptPath(location.pathname)) return;
    navigate(DELIVERY_FIRST_PDV_PATH, { replace: true });
  }, [
    isAuthenticated,
    isInitializing,
    isLoadingBusinesses,
    isDeliveryAccount,
    deliveryHasPdv,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (
      isInitializing || !isAuthenticated || setupLoading || setupRedirectDone.current ||
      !setupStatus || setupStatus.overallCompleted || Boolean(setupStatus.skippedAt)
    ) return;
    if (isDeliveryAccount && deliveryHasPdv === false) return;
    if (isDeliveryAccount && deliveryHasPdv === null) return;
    if (location.pathname === DELIVERY_FIRST_PDV_PATH) return;
    if (location.pathname === '/saas/dashboard' || location.pathname === '/saas' || location.pathname === '/saas/') {
      setupRedirectDone.current = true;
      navigate('/saas/onboarding', { replace: true });
    }
  }, [
    isInitializing,
    isAuthenticated,
    setupLoading,
    setupStatus,
    location.pathname,
    navigate,
    isDeliveryAccount,
    deliveryHasPdv,
  ]);

  const isUserAccount = user?.accountType === 'user';

  useEffect(() => {
    if (
      isInitializing ||
      !isAuthenticated ||
      isLoadingBusinesses ||
      businesses.length > 0 ||
      isAutoCreating ||
      autoCreateAttempted.current ||
      isUserAccount
    ) {
      return;
    }

    const onboarding = user?.onboardingData as OnboardingDataShape | undefined;
    const profile = onboarding?.companyProfile;
    const companyName = profile?.tradeName || user?.companyName;

    if (companyName) {
      autoCreateAttempted.current = true;
      setIsAutoCreating(true);
      const bt = onboarding?.businessType as import('../lib/businessApi').BusinessType | undefined;
      createBusiness({
        name: companyName,
        legalName: profile?.legalName,
        taxId: profile?.taxId,
        address: profile?.address,
        city: profile?.city || profile?.province,
        phone: profile?.companyPhone,
        email: profile?.companyEmail,
        businessType: bt || 'carDealership',
      })
        .then((result) => {
          if (!result.success) {
            navigate('/auth/gate', { replace: true });
            return;
          }
          if (onboarding?.businessType === 'delivery') {
            navigate(DELIVERY_FIRST_PDV_PATH, { replace: true });
          }
        })
        .catch(() => {
          navigate('/auth/gate', { replace: true });
        })
        .finally(() => setIsAutoCreating(false));
    } else {
      navigate('/auth/gate', { replace: true });
    }
  }, [
    isInitializing,
    isAuthenticated,
    isLoadingBusinesses,
    businesses.length,
    isAutoCreating,
    isUserAccount,
    user,
    createBusiness,
    navigate,
  ]);

  useEffect(() => {
    if (
      subscription.status === 'suspended' &&
      location.pathname !== '/saas/suspended' &&
      location.pathname !== '/saas/billing' &&
      location.pathname !== '/saas/help'
    ) {
      navigate('/saas/suspended', { replace: true });
    }
  }, [subscription.status, location.pathname, navigate]);

  useEffect(() => {
    if (
      subscription.status === 'trial_expired' &&
      location.pathname !== '/saas/billing' &&
      location.pathname !== '/saas/settings' &&
      location.pathname !== '/saas/help' &&
      location.pathname !== '/saas/suspended'
    ) {
      navigate('/saas/billing', { replace: true });
    }
  }, [subscription.status, location.pathname, navigate]);

  // Solo bloquear la primera carga de empresas; un reload desde Ajustes no debe desmontar el Outlet
  // (si no, Settings monta → reloadBusinesses → isLoading → null → desmonta → bucle).
  const isInitialBusinessLoad = isLoadingBusinesses && businesses.length === 0;
  const onFirstPdvRoute = location.pathname === DELIVERY_FIRST_PDV_PATH;
  const deliveryPdvGateLoading = isDeliveryAccount && deliveryHasPdv === null && !onFirstPdvRoute;

  if (isInitializing || isInitialBusinessLoad || isAutoCreating || deliveryPdvGateLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label="Cargando" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (businesses.length === 0 && !isUserAccount) {
    return null;
  }

  if (location.pathname === '/saas/suspended') {
    return (
      <>
        <Outlet />
      </>
    );
  }

  return (
    <>
      <Outlet />
    </>
  );
}

export function SaasRoot() {
  return (
    <SetupProgressProvider>
      <ActiveStoreScopeProvider>
        <GroupProvider>
          <AppProvider>
            <ScrapyardProvider>
              <ActivationChecklistProvider>
                <SaasContent />
              </ActivationChecklistProvider>
            </ScrapyardProvider>
          </AppProvider>
        </GroupProvider>
      </ActiveStoreScopeProvider>
    </SetupProgressProvider>
  );
}
