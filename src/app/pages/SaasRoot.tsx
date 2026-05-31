import { Outlet, useLocation, useNavigate } from 'react-router';

import { useEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';

import { AppProvider, useApp } from '../context/AppContext';

import { ActiveStoreScopeProvider } from '../context/ActiveStoreScopeContext';

import { BusinessProvider, useBusinessOptional } from '../context/BusinessContext';

import { GroupProvider } from '../context/GroupContext';

import { ActivationChecklistProvider } from '../context/ActivationChecklistContext';

import { SetupProgressProvider } from '../context/SetupProgressContext';

import { ScrapyardProvider } from '../context/ScrapyardContext';

import { useAuth } from '../context/AuthContext';
import { isWorkerAccount } from '../lib/authApi';
import {
  ensureDeliveryDefaultBrand,
  isDeliveryBusinessType,
  readStoredOnboardingBusinessType,
} from '../lib/deliverySetup';
import {
  clearWorkerIdentityBypass,
  hasMinimumWorkerIdentity,
  hasSkippedWorkerProfileGates,
  hasWorkerIdentityBypass,
  WORKER_IDENTITY_SETUP_PATH,
  WORKER_PAYROLL_SETUP_PATH,
} from '../lib/workerProfileCompletion';



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

  const businessCtx = useBusinessOptional();
  const businesses = businessCtx?.businesses ?? [];
  const isLoadingBusinesses = businessCtx?.isLoading ?? true;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const createBusiness = businessCtx?.createBusiness;

  const location = useLocation();

  const navigate = useNavigate();

  const [isAutoCreating, setIsAutoCreating] = useState(false);

  const autoCreateAttempted = useRef(false);



  useEffect(() => {

    if (!isInitializing && !isAuthenticated) {

      navigate('/auth/login', { replace: true });

    }

  }, [isAuthenticated, isInitializing, navigate]);



  useEffect(() => {

    if (!isInitializing && isAuthenticated && user && !user.emailVerified) {

      if (location.pathname.startsWith('/saas/settings')) return;
      if (location.pathname === WORKER_IDENTITY_SETUP_PATH) return;

      navigate('/auth/verify-email-pending', { replace: true });

    }

  }, [isInitializing, isAuthenticated, user, navigate, location.pathname]);



  useEffect(() => {
    if (isInitializing || !isAuthenticated || !user) return;
    if (!isWorkerAccount(user)) return;
    if (hasMinimumWorkerIdentity(user)) {
      clearWorkerIdentityBypass();
      return;
    }

    const userId = String(user.user_id || user.id || '').trim();
    if (hasSkippedWorkerProfileGates(userId)) return;

    const navState = location.state as { identityCompleted?: boolean } | null;
    if (navState?.identityCompleted || hasWorkerIdentityBypass(userId || undefined)) return;

    const allowed = [
      WORKER_IDENTITY_SETUP_PATH,
      WORKER_PAYROLL_SETUP_PATH,
      '/auth/verify-email-pending',
      '/saas/user-dashboard',
      '/saas/invitations',
    ];
    if (allowed.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) {
      return;
    }
    if (location.pathname.startsWith('/saas/worker')) return;

    navigate(WORKER_IDENTITY_SETUP_PATH, { replace: true });
  }, [isInitializing, isAuthenticated, user, location.pathname, location.state, navigate]);



  const isUserAccount = user?.accountType === 'user';
  const isLinkedWorker = Boolean(
    isWorkerAccount(user) && String(user?.linkedBusinessId || '').trim(),
  );



  useEffect(() => {

    if (
      isInitializing ||
      !isAuthenticated ||
      !createBusiness ||
      !businessesFetchSettled ||
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

      const bt = (onboarding?.businessType ||

        readStoredOnboardingBusinessType(user?.user_id)) as import('../lib/businessApi').BusinessType | undefined;

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

        .then(async (result) => {

          if (!result.success) {

            navigate('/auth/gate', { replace: true });

            return;

          }

          const created = result.business;

          const createdType = String(created?.businessType || bt || '').trim();

          if (created?.business_id && isDeliveryBusinessType(createdType)) {

            try {

              await ensureDeliveryDefaultBrand(created.business_id, {

                preferredName: companyName,

              });

            } catch {

              /* Marca se crea al abrir Ajustes → Marca */

            }

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

    businessesFetchSettled,

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
      isWorkerAccount(user) ||
      subscription.status !== 'trial_expired' ||
      location.pathname === '/saas/billing' ||
      location.pathname === '/saas/settings' ||
      location.pathname === '/saas/help' ||
      location.pathname === '/saas/suspended'
    ) {
      return;
    }

    navigate('/saas/billing', { replace: true });

  }, [subscription.status, location.pathname, navigate, user]);

  const isInitialBusinessLoad =
    !businessCtx || isLoadingBusinesses || !businessesFetchSettled;

  const skipBusinessLoadGate =
    location.pathname === WORKER_IDENTITY_SETUP_PATH
    || location.pathname === WORKER_PAYROLL_SETUP_PATH
    || location.pathname === '/saas/user-dashboard'
    || (isLinkedWorker && location.pathname.startsWith('/saas/worker'));

  if (isInitializing || ((!skipBusinessLoadGate && isInitialBusinessLoad) || isAutoCreating)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label="Cargando" />
      </div>
    );
  }



  if (!isAuthenticated) {

    return null;

  }



  if (businesses.length === 0 && !isUserAccount && !isLinkedWorker) {

    return null;

  }



  if (location.pathname === '/saas/suspended'
    || location.pathname === WORKER_IDENTITY_SETUP_PATH
    || location.pathname === WORKER_PAYROLL_SETUP_PATH) {

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
    <BusinessProvider>
      <SaasRootProviders />
    </BusinessProvider>
  );
}

function SaasRootProviders() {
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


