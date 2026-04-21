import { Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from '../context/AppContext';
import { BusinessProvider, useBusiness } from '../context/BusinessContext';
import { GroupProvider } from '../context/GroupContext';
import { ActivationChecklistProvider } from '../context/ActivationChecklistContext';
import { SetupProgressProvider, useSetupProgress } from '../context/SetupProgressContext';
import { ScrapyardProvider } from '../context/ScrapyardContext';
import { PluginPanel } from '../../plugin/PluginPanel';
import { useAuth } from '../context/AuthContext';
import { EMAIL_SKIP_KEY } from './auth/VerifyEmailPending';

const SUPERADMIN_EMAIL = 'admin1@gmail.com';

interface OnboardingCompanyProfile {
  tradeName?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  province?: string;
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
      const skipped = localStorage.getItem(EMAIL_SKIP_KEY(user.user_id));
      if (!skipped) {
        navigate('/auth/verify-email-pending', { replace: true });
      }
    }
  }, [isInitializing, isAuthenticated, user, navigate]);

  useEffect(() => {
    if (
      isInitializing || !isAuthenticated || setupLoading || setupRedirectDone.current ||
      !setupStatus || setupStatus.overallCompleted
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
        city: profile?.province,
        phone: profile?.companyPhone,
        email: profile?.companyEmail,
        businessType: bt || 'carDealership',
      })
        .then((result) => {
          if (!result.success) {
            navigate('/auth/gate', { replace: true });
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

  const isSuperAdmin = user?.email === SUPERADMIN_EMAIL;

  if (location.pathname === '/saas/suspended') {
    return (
      <>
        <Outlet />
        {isSuperAdmin && <PluginPanel />}
      </>
    );
  }

  return (
    <>
      <Outlet />
      {isSuperAdmin && <PluginPanel />}
    </>
  );
}

export function SaasRoot() {
  return (
    <BusinessProvider>
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
    </BusinessProvider>
  );
}
