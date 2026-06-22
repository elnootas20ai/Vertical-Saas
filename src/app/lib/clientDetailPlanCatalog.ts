import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { PLAN_TIER_LABELS } from './pointOfSaleLimits';
import { planMeetsReportTier } from './reportPlanCatalog';

/** Funciones de la ficha de cliente (delivery). */
export type ClientDetailFeatureId =
  | 'ficha_datos'
  | 'ficha_resumen_kpis'
  | 'ficha_resumen_analytics'
  | 'ficha_pedidos'
  | 'ficha_pedidos_detalle'
  | 'ficha_actividad'
  | 'ficha_promociones'
  | 'ficha_promociones_crear'
  | 'ficha_loyalty'
  | 'ficha_tags'
  | 'ficha_rgpd';

export interface ClientDetailFeatureEntry {
  id: ClientDetailFeatureId;
  label: string;
  description: string;
  minPlan: SubscriptionPlanTier;
  basicPreview?: boolean;
}

/** Máximo pedidos visibles en plan Básico (pestaña Pedidos). */
export const CLIENT_DETAIL_BASIC_MAX_ORDERS = 5;

/** Máximo pedidos recientes en resumen (Básico). */
export const CLIENT_DETAIL_BASIC_MAX_RECENT_ORDERS = 3;

/**
 * Plan Básico: ficha operativa mínima (datos, KPIs, últimos pedidos).
 * Normal: analíticas, actividad, promos (solo ver), fidelización, etiquetas.
 * Pro: crear promociones, RGPD completo.
 */
export const CLIENT_DETAIL_FEATURE_CATALOG: ClientDetailFeatureEntry[] = [
  {
    id: 'ficha_datos',
    label: 'Datos del cliente',
    description: 'Contacto, dirección y notas.',
    minPlan: 'basic',
    basicPreview: true,
  },
  {
    id: 'ficha_resumen_kpis',
    label: 'KPIs básicos',
    description: 'Total gastado, pedidos, ticket y último pedido.',
    minPlan: 'basic',
    basicPreview: true,
  },
  {
    id: 'ficha_resumen_analytics',
    label: 'Analíticas avanzadas',
    description: 'Gráficos, top productos, canales y segmento VIP.',
    minPlan: 'normal',
  },
  {
    id: 'ficha_pedidos',
    label: 'Historial de pedidos',
    description: 'Listado de pedidos del cliente.',
    minPlan: 'basic',
    basicPreview: true,
  },
  {
    id: 'ficha_pedidos_detalle',
    label: 'Detalle de pedidos',
    description: 'Líneas, extras y notas por pedido.',
    minPlan: 'normal',
  },
  {
    id: 'ficha_actividad',
    label: 'Actividad',
    description: 'Timeline e historial completo.',
    minPlan: 'normal',
  },
  {
    id: 'ficha_promociones',
    label: 'Promociones',
    description: 'Ver promociones asignadas al cliente.',
    minPlan: 'normal',
  },
  {
    id: 'ficha_promociones_crear',
    label: 'Crear promociones',
    description: 'Crear y gestionar promociones personalizadas.',
    minPlan: 'pro',
  },
  {
    id: 'ficha_loyalty',
    label: 'Fidelización',
    description: 'Puntos y nivel del cliente.',
    minPlan: 'normal',
  },
  {
    id: 'ficha_tags',
    label: 'Etiquetas',
    description: 'Etiquetas CRM (VIP, alergias…).',
    minPlan: 'normal',
  },
  {
    id: 'ficha_rgpd',
    label: 'RGPD',
    description: 'Consentimientos y privacidad.',
    minPlan: 'pro',
  },
];

export function getClientDetailFeature(id: ClientDetailFeatureId): ClientDetailFeatureEntry | undefined {
  return CLIENT_DETAIL_FEATURE_CATALOG.find((f) => f.id === id);
}

export function isClientDetailFeatureUnlocked(
  id: ClientDetailFeatureId,
  planTier: SubscriptionPlanTier,
): boolean {
  const entry = getClientDetailFeature(id);
  if (!entry) return true;
  return planMeetsReportTier(planTier, entry.minPlan, entry.basicPreview);
}

export function requiredPlanLabelForClientFeature(id: ClientDetailFeatureId): string {
  const entry = getClientDetailFeature(id);
  if (!entry) return PLAN_TIER_LABELS.normal;
  return PLAN_TIER_LABELS[entry.minPlan];
}

export function clientDetailSummaryByPlan(planTier: SubscriptionPlanTier) {
  const unlocked = CLIENT_DETAIL_FEATURE_CATALOG.filter((f) =>
    isClientDetailFeatureUnlocked(f.id, planTier),
  );
  const locked = CLIENT_DETAIL_FEATURE_CATALOG.filter(
    (f) => !isClientDetailFeatureUnlocked(f.id, planTier),
  );
  return { unlocked, locked, unlockedCount: unlocked.length, lockedCount: locked.length };
}
