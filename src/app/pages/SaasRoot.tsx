import { Outlet, useLocation, useNavigate, Navigate } from 'react-router';

import { useEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';

import { AppProvider, useApp } from '../context/AppContext';

import { ActiveStoreScopeProvider } from '../context/ActiveStoreScopeContext';
import { BusinessScopeUrlSync } from '../components/saas/BusinessScopeUrlSync';

import { useBusinessOptional } from '../context/BusinessContext';

import { GroupProvider } from '../context/GroupContext';

import { ActivationChecklistProvider } from '../context/ActivationChecklistContext';

import { SetupProgressProvider } from '../context/SetupProgressContext';

import { ScrapyardProvider } from '../context/ScrapyardContext';

import { useAuth } from '../context/AuthContext';
import {
  isTpvTabletSaasSession,
} from '../lib/tpvTabletSession';
import { isWorkerAccount } from '../lib/authApi';
import {
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
  const tpvTabletSaasSession = isTpvTabletSaasSession(location.pathname);

  const [isAutoCreating, setIsAutoCreating] = useState(false);

  const autoCreateAttempted = useRef(false);
  const onboardingReloadAttempted = useRef(false);



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
      !businessesFetchSettled ||
      isLoadingBusinesses ||
      businesses.length > 0 ||
      isAutoCreating ||
      autoCreateAttempted.current ||
      isUserAccount ||
      tpvTabletSaasSession
    ) {
      return;
    }

    // El backend ya provisiona la empresa al completar el onboarding; solo recargar.
    if (user?.onboardingCompleted) {
      if (user?.onboardingData?.suppressAutoProvision) {
        return;
      }
      if (!onboardingReloadAttempted.current) {
        onboardingReloadAttempted.current = true;
        void (async () => {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            await reloadBusinesses?.();
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 350));
            }
          }
        })();
      }
      return;
    }

    if (user?.onboardingData?.suppressAutoProvision) {
      return;
    }

    if (!createBusiness) return;

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

        restaurantFormat:
          bt === 'restaurant'
            ? (onboarding?.restaurantFormat as import('../lib/businessApi').RestaurantFormat | undefined) ||
              'restaurant'
            : undefined,

      })

        .then(async (result) => {

          if (!result.success) {

            navigate('/auth/gate', { replace: true });

            return;

          }

          const created = result.business;

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

    tpvTabletSaasSession,

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
    || tpvTabletSaasSession
    || (unlinkedWorkerNeedsCompany && isWorkerUnlinkedAllowedPath(location.pathname))
    || (isLinkedWorker && location.pathname.startsWith('/saas/worker'));

  useEffect(() => {
    if (isInitializing || !isAuthenticated || !user) return;
    if (isUserAccount || isLinkedWorker) return;
    if (tpvTabletSaasSession) return;
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
    tpvTabletSaasSession,
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
    if (tpvTabletSaasSession) {
      return (
        <>
          <Outlet />
        </>
      );
    }
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
  // BusinessProvider vive en App.tsx (envuelve todo el router). Duplicarlo aquí
  // hacía que /auth/gate y /saas/* tuvieran estados distintos: switchBusiness en
  // Gate no aplicaba al entrar al panel.
  return <SaasRootProviders />;
}

function SaasRootProviders() {
  return (
    <SetupProgressProvider>
      <ActiveStoreScopeProvider>
        <GroupProvider>
          <AppProvider>
            <ScrapyardProvider>
              <ActivationChecklistProvider>
                <BusinessScopeUrlSync />
                <SaasContent />
              </ActivationChecklistProvider>
            </ScrapyardProvider>
          </AppProvider>
        </GroupProvider>
      </ActiveStoreScopeProvider>
    </SetupProgressProvider>
  );
}


