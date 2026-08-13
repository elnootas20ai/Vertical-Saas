/**
 * Página CEO Cocina (`/saas/cocina`).
 * El KDS vive en RestaurantKitchenBoard; el TPV lo embebe sin salir del gate.
 */
import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useBusiness } from '../../context/BusinessContext';
import { isRestaurantBusinessType, isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import {
  RestaurantTabletBottomNav,
  shouldShowRestaurantTabletNav,
} from './RestaurantTabletBottomNav';
import { RestaurantKitchenBoard } from './RestaurantKitchenBoard';

export function RestaurantKitchenPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentBusiness, businessesFetchSettled } = useBusiness();
  const businessType = currentBusiness?.businessType;
  const isRestaurant = isRestaurantBusinessType(businessType);
  const showTabletNav = shouldShowRestaurantTabletNav({ pathname: location.pathname });

  useEffect(() => {
    if (!businessesFetchSettled || isRestaurant) return;
    navigate(
      isStrictDeliveryBusinessType(businessType) ? '/saas/delivery-kitchen' : '/saas/dashboard',
      { replace: true },
    );
  }, [businessesFetchSettled, isRestaurant, businessType, navigate]);

  if (!isRestaurant) {
    return (
      <Navigate
        to={isStrictDeliveryBusinessType(businessType) ? '/saas/delivery-kitchen' : '/saas/dashboard'}
        replace
      />
    );
  }

  return (
    <Layout title="Cocina" noPadding>
      <div className={`flex flex-col h-[calc(100vh-64px)] min-h-0 ${showTabletNav ? 'pb-14' : ''}`}>
        <RestaurantKitchenBoard
          className="flex-1 min-h-0"
          showMesasNav={!showTabletNav}
        />
        {showTabletNav ? <RestaurantTabletBottomNav active="cocina" /> : null}
      </div>
    </Layout>
  );
}
