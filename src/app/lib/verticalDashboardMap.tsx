import type { ComponentType } from 'react';
import type { BusinessType } from './businessApi';
import { EventsDashboard } from '../pages/saas/dashboards/EventsDashboard';
import { GymDashboard } from '../pages/saas/dashboards/GymDashboard';
import { ConstructionDashboard } from '../pages/saas/dashboards/ConstructionDashboard';
import { HotelDashboard } from '../pages/saas/dashboards/HotelDashboard';
import { ClinicDashboard } from '../pages/saas/dashboards/ClinicDashboard';
import { ScrapyardDashboard } from '../pages/saas/dashboards/ScrapyardDashboard';
import { HairSalonDashboard } from '../pages/saas/dashboards/HairSalonDashboard';
import { LawyerDashboard } from '../pages/saas/dashboards/LawyerDashboard';
import { AcademyDashboard } from '../pages/saas/dashboards/AcademyDashboard';
import { RealEstateDashboard } from '../pages/saas/dashboards/RealEstateDashboard';
import { NightclubDashboard } from '../pages/saas/dashboards/NightclubDashboard';
import { PharmacyDashboard } from '../pages/saas/dashboards/PharmacyDashboard';
import { VetDashboard } from '../pages/saas/dashboards/VetDashboard';
import { CarWashDashboard } from '../pages/saas/dashboards/CarWashDashboard';
import { TaxiDashboard } from '../pages/saas/dashboards/TaxiDashboard';
import { SparePartsDashboard } from '../pages/saas/dashboards/SparePartsDashboard';
import { RestaurantDashboard } from '../verticals/restaurant/RestaurantDashboard';

export type VerticalDashboardProps = { onSelectGeneral?: () => void };

/** Dashboards verticales conectados al home según businessType. */
export const VERTICAL_DASHBOARD_MAP: Partial<
  Record<BusinessType, ComponentType<VerticalDashboardProps>>
> = {
  restaurant: RestaurantDashboard,
  events: EventsDashboard,
  gym: GymDashboard,
  construction: ConstructionDashboard,
  hotel: HotelDashboard,
  clinic: ClinicDashboard,
  scrapyard: ScrapyardDashboard,
  hairSalon: HairSalonDashboard,
  lawyer: LawyerDashboard,
  academy: AcademyDashboard,
  realEstate: RealEstateDashboard,
  nightclub: NightclubDashboard,
  pharmacy: PharmacyDashboard,
  vet: VetDashboard,
  carWash: CarWashDashboard,
  taxi: TaxiDashboard,
  spareParts: SparePartsDashboard,
};

export function getVerticalDashboard(
  businessType: BusinessType | string | null | undefined,
): ComponentType<VerticalDashboardProps> | null {
  if (!businessType) return null;
  return VERTICAL_DASHBOARD_MAP[businessType as BusinessType] ?? null;
}
