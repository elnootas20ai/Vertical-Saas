import { Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from '../context/AppContext';
import { ActiveStoreScopeProvider } from '../context/ActiveStoreScopeContext';
import { useBusiness } from '../context/BusinessContext';
import { GroupProvider } from '../context/GroupContext';
import { ActivationChecklistProvider } from '../context/ActivationChecklistContext';
import { SetupProgressProvider, useSetupProgress } from '../context/SetupProgressContext';
import { ScrapyardProvider } from '../context/ScrapyardContext';
import { useAuth } from '../context/AuthContext';

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
  const { businesses, isLoading: isLoadingBusinesses, createBusiness } = useBusiness();
  const { status: setupStatus, loading: setupLoading } = useSetupProgress();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAutoCreating, setIsAutoCreating] = useState(false);
  const autoCreateAttempted = useRef(false);
  const setupRedirectDone = useRef(false);

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
    if (
      isInitializing || !isAuthenticated || setupLoading || setupRedirectDone.current ||
      !setupStatus || setupStatus.overallCompleted || Boolean(setupStatus.skippedAt)
    ) return;
    if (location.pathname === '/saas/dashboard' || location.pathname === '/saas' || location.pathname === '/saas/') {
      setupRedirectDone.current = true;
      navigate('/saas/onboarding', { replace: true });
    }
  }, [isInitializing, isAuthenticated, setupLoading, setupStatus, location.pathname, navigate]);

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
            navigate('/saas/settings/centros-de-trabajo?action=new-pdv', { replace: true });
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

  if (isInitializing || isLoadingBusinesses || isAutoCreating) {
    return null;
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
    <ActiveStoreScopeProvider>
      <GroupProvider>
        <AppProvider>
          <ScrapyardProvider>
            <SetupProgressProvider>
              <ActivationChecklistProvider>
                <SaasContent />
              </ActivationChecklistProvider>
            </SetupProgressProvider>
          </ScrapyardProvider>
        </AppProvider>
      </GroupProvider>
    </ActiveStoreScopeProvider>
  );
}
