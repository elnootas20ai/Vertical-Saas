import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { BusinessType } from './businessApi';

export type VerticalDashboardProps = { onSelectGeneral?: () => void };

type VD = LazyExoticComponent<ComponentType<VerticalDashboardProps>>;

function lazyDash(
  loader: () => Promise<Record<string, ComponentType<VerticalDashboardProps>>>,
  name: string,
): VD {
  return lazy(() =>
    loader().then((m) => ({
      default: m[name] as ComponentType<VerticalDashboardProps>,
    })),
  );
}

/** Dashboards verticales: chunk solo al abrir home de esa vertical. */
export const VERTICAL_DASHBOARD_MAP: Partial<Record<BusinessType, VD>> = {
  restaurant: lazyDash(
    () => import('../verticals/restaurant/RestaurantDashboard'),
    'RestaurantDashboard',
  ),
  butcherShop: lazyDash(
    () => import('../pages/saas/dashboards/ButcherDashboard'),
    'ButcherDashboard',
  ),
  events: lazyDash(() => import('../pages/saas/dashboards/EventsDashboard'), 'EventsDashboard'),
  gym: lazyDash(() => import('../pages/saas/dashboards/GymDashboard'), 'GymDashboard'),
  construction: lazyDash(
    () => import('../pages/saas/dashboards/ConstructionDashboard'),
    'ConstructionDashboard',
  ),
  hotel: lazyDash(() => import('../pages/saas/dashboards/HotelDashboard'), 'HotelDashboard'),
  clinic: lazyDash(() => import('../pages/saas/dashboards/ClinicDashboard'), 'ClinicDashboard'),
  scrapyard: lazyDash(
    () => import('../pages/saas/dashboards/ScrapyardDashboard'),
    'ScrapyardDashboard',
  ),
  hairSalon: lazyDash(
    () => import('../pages/saas/dashboards/HairSalonDashboard'),
    'HairSalonDashboard',
  ),
  lawyer: lazyDash(() => import('../pages/saas/dashboards/LawyerDashboard'), 'LawyerDashboard'),
  academy: lazyDash(() => import('../pages/saas/dashboards/AcademyDashboard'), 'AcademyDashboard'),
  realEstate: lazyDash(
    () => import('../pages/saas/dashboards/RealEstateDashboard'),
    'RealEstateDashboard',
  ),
  nightclub: lazyDash(
    () => import('../pages/saas/dashboards/NightclubDashboard'),
    'NightclubDashboard',
  ),
  pharmacy: lazyDash(
    () => import('../pages/saas/dashboards/PharmacyDashboard'),
    'PharmacyDashboard',
  ),
  vet: lazyDash(() => import('../pages/saas/dashboards/VetDashboard'), 'VetDashboard'),
  carWash: lazyDash(() => import('../pages/saas/dashboards/CarWashDashboard'), 'CarWashDashboard'),
  taxi: lazyDash(() => import('../pages/saas/dashboards/TaxiDashboard'), 'TaxiDashboard'),
  spareParts: lazyDash(
    () => import('../pages/saas/dashboards/SparePartsDashboard'),
    'SparePartsDashboard',
  ),
};

export function getVerticalDashboard(
  businessType: BusinessType | string | null | undefined,
): VD | null {
  if (!businessType) return null;
  return VERTICAL_DASHBOARD_MAP[businessType as BusinessType] ?? null;
}
