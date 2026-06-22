import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { PLAN_TIER_LABELS } from './pointOfSaleLimits';
import { planMeetsReportTier } from './reportPlanCatalog';

export type ClientsListFeatureId =
  | 'lista_busqueda'
  | 'lista_col_pedidos'
  | 'lista_col_gasto'
  | 'lista_col_ultimo'
  | 'lista_col_tags'
  | 'lista_col_loyalty'
  | 'lista_filtro_tags'
  | 'lista_segmentos'
  | 'lista_import_empresa'
  | 'lista_export';

export interface ClientsListFeatureEntry {
  id: ClientsListFeatureId;
  label: string;
  description: string;
  minPlan: SubscriptionPlanTier;
  basicPreview?: boolean;
}

export const CLIENTS_LIST_FEATURE_CATALOG: ClientsListFeatureEntry[] = [
  {
    id: 'lista_busqueda',
    label: 'Búsqueda de clientes',
    description: 'Buscar por nombre, email o teléfono.',
    minPlan: 'basic',
    basicPreview: true,
  },
  {
    id: 'lista_col_pedidos',
    label: 'Columna pedidos',
    description: 'Número de pedidos del cliente.',
    minPlan: 'basic',
    basicPreview: true,
  },
  {
    id: 'lista_col_gasto',
    label: 'Total gastado',
    description: 'Ingresos acumulados por cliente.',
    minPlan: 'normal',
  },
  {
    id: 'lista_col_ultimo',
    label: 'Último pedido',
    description: 'Fecha del último pedido.',
    minPlan: 'normal',
  },
  {
    id: 'lista_col_tags',
    label: 'Etiquetas en listado',
    description: 'Ver etiquetas CRM en cada fila.',
    minPlan: 'normal',
  },
  {
    id: 'lista_col_loyalty',
    label: 'Fidelización',
    description: 'Puntos y nivel del cliente.',
    minPlan: 'normal',
  },
  {
    id: 'lista_filtro_tags',
    label: 'Filtro por etiquetas',
    description: 'Filtrar clientes por etiqueta.',
    minPlan: 'normal',
  },
  {
    id: 'lista_segmentos',
    label: 'Segmentación avanzada',
    description: 'Crear segmentos con filtros combinados.',
    minPlan: 'normal',
  },
  {
    id: 'lista_export',
    label: 'Exportar clientes',
    description: 'Descargar listado completo.',
    minPlan: 'normal',
  },
  {
    id: 'lista_import_empresa',
    label: 'Importar de otra empresa',
    description: 'Copiar clientes entre empresas del grupo.',
    minPlan: 'pro',
  },
];

export function getClientsListFeature(id: ClientsListFeatureId): ClientsListFeatureEntry | undefined {
  return CLIENTS_LIST_FEATURE_CATALOG.find((f) => f.id === id);
}

export function isClientsListFeatureUnlocked(
  id: ClientsListFeatureId,
  planTier: SubscriptionPlanTier,
): boolean {
  const entry = getClientsListFeature(id);
  if (!entry) return true;
  return planMeetsReportTier(planTier, entry.minPlan, entry.basicPreview);
}

export function requiredPlanLabelForListFeature(id: ClientsListFeatureId): string {
  const entry = getClientsListFeature(id);
  if (!entry) return PLAN_TIER_LABELS.normal;
  return PLAN_TIER_LABELS[entry.minPlan];
}

export function clientsListSummaryByPlan(planTier: SubscriptionPlanTier) {
  const unlocked = CLIENTS_LIST_FEATURE_CATALOG.filter((f) =>
    isClientsListFeatureUnlocked(f.id, planTier),
  );
  const locked = CLIENTS_LIST_FEATURE_CATALOG.filter(
    (f) => !isClientsListFeatureUnlocked(f.id, planTier),
  );
  return { unlocked, locked, unlockedCount: unlocked.length, lockedCount: locked.length };
}
