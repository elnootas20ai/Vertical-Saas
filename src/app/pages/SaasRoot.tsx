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

import {
  ensureDeliveryDefaultBrand,
  isDeliveryBusinessType,
  readStoredOnboardingBusinessType,
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

      navigate('/auth/verify-email-pending', { replace: true });

    }

  }, [isInitializing, isAuthenticated, user, navigate, location.pathname]);



  const isUserAccount = user?.accountType === 'user';



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

      subscription.status === 'trial_expired' &&

      location.pathname !== '/saas/billing' &&

      location.pathname !== '/saas/settings' &&

      location.pathname !== '/saas/help' &&

      location.pathname !== '/saas/suspended'

    ) {

      navigate('/saas/billing', { replace: true });

    }

  }, [subscription.status, location.pathname, navigate]);

  const isInitialBusinessLoad =
    !businessCtx || (businesses.length === 0 && (!businessesFetchSettled || isLoadingBusinesses));

  if (isInitializing || isInitialBusinessLoad || isAutoCreating) {

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


