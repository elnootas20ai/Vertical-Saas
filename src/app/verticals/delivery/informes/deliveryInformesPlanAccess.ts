import type { SubscriptionPlanTier } from '../../../lib/pointOfSaleLimits';
import { planMeetsMinTier, type VertialPlanId } from '../../../lib/planCatalog';
import type { DeliveryInformeEntry, DeliveryInformeNivel } from './deliveryInformesCatalog';

function nivelToMinPlan(nivel?: DeliveryInformeNivel): VertialPlanId {
  if (nivel === 'pro') return 'pro';
  if (nivel === 'normal') return 'normal';
  return 'basic';
}

/** ¿El plan del usuario puede abrir este informe del catálogo delivery? */
export function canAccessDeliveryInforme(
  entry: DeliveryInformeEntry,
  planTier: SubscriptionPlanTier,
): boolean {
  return planMeetsMinTier(planTier as VertialPlanId, nivelToMinPlan(entry.nivel));
}

export function deliveryInformeMinPlanLabel(entry: DeliveryInformeEntry): string {
  const min = nivelToMinPlan(entry.nivel);
  if (min === 'pro') return 'PRO';
  if (min === 'normal') return 'NORMAL';
  return 'Básico';
}
