import { Outlet, useLocation, useNavigate, Navigate } from 'react-router';

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
  clearWorkerPayrollBypass,
  hasSkippedWorkerProfileGates,
  hasWorkerPayrollBypass,
  isWorkerUnlinkedAllowedPath,
  needsWorkerPayrollSetup,
  workerNeedsBusinessLink,
  WORKER_IDENTITY_SETUP_PATH,
  WORKER_PAYROLL_SETUP_PATH,
  WORKER_UNLINKED_HOME_PATH,
} from '../lib/workerProfileCompletion';
import {
  isBillingRecoveryPath,
  shouldBlockSaasAccess,
} from '../lib/billingRecovery';

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

  const { isAuthenticated, isInitializing, user, refreshCurrentUser, sessionSyncedWithServer } = useAuth();

  const businessCtx = useBusinessOptional();
  const businesses = businessCtx?.businesses ?? [];
  const isLoadingBusinesses = businessCtx?.isLoading ?? true;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const createBusiness = businessCtx?.createBusiness;
  const reloadBusinesses = businessCtx?.reloadBusinesses;

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
    if (!isAuthenticated || isInitializing) return;
    const syncSubscription = () => {
      void refreshCurrentUser();
    };
    syncSubscription();
    window.addEventListener('focus', syncSubscription);
    const interval = window.setInterval(syncSubscription, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', syncSubscription);
      window.clearInterval(interval);
    };
  }, [isAuthenticated, isInitializing, refreshCurrentUser]);

  useEffect(() => {

    if (!isInitializing && isAuthenticated && user && !user.emailVerified) {

      if (location.pathname.startsWith('/saas/settings')) return;
      if (location.pathname === WORKER_IDENTITY_SETUP_PATH) return;

      navigate('/auth/verify-email-pending', { replace: true });

    }

  }, [isInitializing, isAuthenticated, user, navigate, location.pathname]);



  useEffect(() => {
    if (isInitializing || !isAuthenticated || !user) return;
    if (!needsWorkerPayrollSetup(user)) {
      clearWorkerPayrollBypass(String(user.user_id || user.id || '').trim() || undefined);
      return;
    }

    const userId = String(user.user_id || user.id || '').trim();
    if (hasSkippedWorkerProfileGates(userId)) return;

    const navState = location.state as { payrollCompleted?: boolean } | null;
    if (navState?.payrollCompleted || hasWorkerPayrollBypass(userId || undefined)) return;

    const allowed = [
      WORKER_PAYROLL_SETUP_PATH,
      '/auth/verify-email-pending',
      '/saas/invitations',
    ];
    if (allowed.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) {
      return;
    }

    if (location.pathname === WORKER_IDENTITY_SETUP_PATH) {
      navigate(WORKER_PAYROLL_SETUP_PATH, { replace: true });
      return;
    }

    navigate(WORKER_PAYROLL_SETUP_PATH, { replace: true });
  }, [isInitializing, isAuthenticated, user, location.pathname, location.state, navigate]);



  const isUserAccount = user?.accountType === 'user';
  const isLinkedWorker = Boolean(
    isWorkerAccount(user) && String(user?.linkedBusinessId || '').trim(),
  );
  const unlinkedWorkerNeedsCompany = workerNeedsBusinessLink(user);

  useEffect(() => {
    if (isInitializing || !isAuthenticated || !user) return;
    if (!unlinkedWorkerNeedsCompany) return;
    if (isWorkerUnlinkedAllowedPath(location.pathname)) return;
    if (location.pathname.startsWith('/saas/worker')) {
      navigate(WORKER_UNLINKED_HOME_PATH, { replace: true });
    }
  }, [
    isInitializing,
    isAuthenticated,
    user,
    unlinkedWorkerNeedsCompany,
    location.pathname,
    navigate,
  ]);

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

          await reloadBusinesses?.();

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

    reloadBusinesses,

    navigate,

  ]);



  useEffect(() => {
    if (!sessionSyncedWithServer) return;
    if (user?.subscription?.billingExempt || subscription.billingExempt) return;
    if (subscription.status !== 'suspended') return;
    if (isBillingRecoveryPath(location.pathname)) return;
    navigate('/saas/suspended', { replace: true });
  }, [subscription.status, subscription.billingExempt, sessionSyncedWithServer, location.pathname, navigate, user?.subscription?.billingExempt]);

  useEffect(() => {
    if (!sessionSyncedWithServer) return;
    if (isWorkerAccount(user)) return;
    if (user?.subscription?.billingExempt || subscription.billingExempt) return;
    if (subscription.status === 'suspended') return;
    if (!shouldBlockSaasAccess(subscription.status, subscription)) return;
    if (isBillingRecoveryPath(location.pathname)) return;
    navigate('/saas/settings/facturacion', { replace: true });
  }, [sessionSyncedWithServer, subscription.status, subscription.billingExempt, location.pathname, navigate, user]);

  const billingRecoveryMode =
    shouldBlockSaasAccess(subscription.status, subscription) &&
    isBillingRecoveryPath(location.pathname);

  const isInitialBusinessLoad =
    !businessCtx || isLoadingBusinesses || !businessesFetchSettled;

  const skipBusinessLoadGate =
    location.pathname === WORKER_IDENTITY_SETUP_PATH
    || location.pathname === WORKER_PAYROLL_SETUP_PATH
    || location.pathname === '/saas/user-dashboard'
    || location.pathname === '/saas/invitations'
    || billingRecoveryMode
    || (unlinkedWorkerNeedsCompany && isWorkerUnlinkedAllowedPath(location.pathname))
    || (isLinkedWorker && location.pathname.startsWith('/saas/worker'));

  useEffect(() => {
    if (isInitializing || !isAuthenticated || !user) return;
    if (isUserAccount || isLinkedWorker) return;
    if (!businessesFetchSettled || isLoadingBusinesses) return;
    if (businesses.length > 0) return;
    if (isAutoCreating || autoCreateAttempted.current) return;
    navigate('/auth/gate', { replace: true });
  }, [
    isInitializing,
    isAuthenticated,
    user,
    isUserAccount,
    isLinkedWorker,
    businessesFetchSettled,
    isLoadingBusinesses,
    businesses.length,
    isAutoCreating,
    navigate,
  ]);

  if (isInitializing || ((!skipBusinessLoadGate && isInitialBusinessLoad) || isAutoCreating)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label="Cargando" />
      </div>
    );
  }



  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }



  if (
    businesses.length === 0 &&
    !isUserAccount &&
    !isLinkedWorker &&
    (!businessesFetchSettled || isLoadingBusinesses) &&
    !billingRecoveryMode
  ) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label="Preparando espacio de trabajo" />
      </div>
    );
  }

  if (businesses.length === 0 && !isUserAccount && !isLinkedWorker && businessesFetchSettled) {
    if (isAutoCreating || autoCreateAttempted.current) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-label="Preparando tu empresa" />
        </div>
      );
    }
    return <Navigate to="/auth/gate" replace />;
  }



  if (location.pathname === '/saas/suspended'
    || location.pathname === WORKER_IDENTITY_SETUP_PATH
    || location.pathname === WORKER_PAYROLL_SETUP_PATH
    || billingRecoveryMode) {

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


