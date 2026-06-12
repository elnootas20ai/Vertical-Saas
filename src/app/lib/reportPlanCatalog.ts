import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { PLAN_TIER_LABELS } from './pointOfSaleLimits';

/** Identificadores de informe (pestañas en /saas/reports). */
export type ReportId =
  | 'ventas'
  | 'inventario'
  | 'crm'
  | 'financiero'
  | 'margen'
  | 'comerciales'
  | 'proveedores'
  | 'comparativa'
  | 'rentabilidad'
  | 'forecast'
  | 'rotacion'
  | 'grupo'
  | 'rgpd'
  | 'heatmap';

export type ReportCategory = 'operativo' | 'financiero' | 'estrategico' | 'compliance';

/** `mensual` = informe pensado para cierre de mes; `periodo` = rango libre. */
export type ReportCadence = 'mensual' | 'periodo';

export interface ReportCatalogEntry {
  id: ReportId;
  label: string;
  /** Subtítulo corto para UI / upgrade. */
  description: string;
  category: ReportCategory;
  cadence: ReportCadence;
  /** Plan mínimo de suscripción (basic solo si además basicPreview). */
  minPlan: SubscriptionPlanTier;
  /** Visible en plan Básico para demo / test (máx. 2 recomendado). */
  basicPreview?: boolean;
  /** Solo gerente / admin además del plan. */
  requiresManager?: boolean;
  /** Requiere permiso explícito de informes (financiero sensible). */
  requiresReportsPermission?: boolean;
}

const TIER_RANK: Record<SubscriptionPlanTier, number> = {
  basic: 0,
  normal: 1,
  pro: 2,
};

/**
 * Catálogo maestro de informes Vertial (core).
 * Plan Básico: sin informes salvo los marcados `basicPreview`.
 * Normal → Pro: desbloqueo progresivo.
 */
export const REPORT_CATALOG: ReportCatalogEntry[] = [
  {
    id: 'ventas',
    label: 'Ventas',
    description: 'Cierre mensual de ventas, ingresos y ticket medio.',
    category: 'operativo',
    cadence: 'mensual',
    minPlan: 'normal',
    basicPreview: true,
  },
  {
    id: 'inventario',
    label: 'Inventario',
    description: 'Stock, estados y valoración del parque / catálogo.',
    category: 'operativo',
    cadence: 'mensual',
    minPlan: 'normal',
    basicPreview: true,
  },
  {
    id: 'rotacion',
    label: 'Rotación',
    description: 'Días en stock y velocidad de rotación por unidad.',
    category: 'operativo',
    cadence: 'mensual',
    minPlan: 'normal',
  },
  {
    id: 'crm',
    label: 'CRM',
    description: 'Embudo, conversión y actividad comercial del mes.',
    category: 'operativo',
    cadence: 'mensual',
    minPlan: 'normal',
  },
  {
    id: 'comerciales',
    label: 'Comerciales',
    description: 'Ranking y productividad del equipo comercial.',
    category: 'operativo',
    cadence: 'mensual',
    minPlan: 'normal',
  },
  {
    id: 'comparativa',
    label: 'Comparativa',
    description: 'Mes vs mes anterior y vs mismo mes del año pasado.',
    category: 'operativo',
    cadence: 'mensual',
    minPlan: 'normal',
  },
  {
    id: 'heatmap',
    label: 'Actividad',
    description: 'Mapa de calor de actividad por día y franja.',
    category: 'operativo',
    cadence: 'periodo',
    minPlan: 'normal',
  },
  {
    id: 'proveedores',
    label: 'Proveedores',
    description: 'Compras, plazos y concentración de proveedores.',
    category: 'financiero',
    cadence: 'mensual',
    minPlan: 'normal',
    requiresReportsPermission: true,
  },
  {
    id: 'financiero',
    label: 'Financiero',
    description: 'Ingresos, gastos, flujo de caja y pendientes del mes.',
    category: 'financiero',
    cadence: 'mensual',
    minPlan: 'normal',
    requiresReportsPermission: true,
  },
  {
    id: 'rentabilidad',
    label: 'Rentabilidad',
    description: 'EBITDA, margen bruto y cuenta de resultados mensual.',
    category: 'financiero',
    cadence: 'mensual',
    minPlan: 'pro',
    requiresReportsPermission: true,
  },
  {
    id: 'margen',
    label: 'Margen real',
    description: 'Margen por operación, comisiones y coste real.',
    category: 'financiero',
    cadence: 'mensual',
    minPlan: 'pro',
    requiresReportsPermission: true,
  },
  {
    id: 'forecast',
    label: 'Forecast',
    description: 'Proyección de cierre y escenarios optimista / base / pesimista.',
    category: 'estrategico',
    cadence: 'mensual',
    minPlan: 'pro',
    requiresReportsPermission: true,
  },
  {
    id: 'grupo',
    label: 'Grupo',
    description: 'Consolidado multi-empresa del grupo.',
    category: 'estrategico',
    cadence: 'mensual',
    minPlan: 'pro',
    requiresReportsPermission: true,
  },
  {
    id: 'rgpd',
    label: 'RGPD',
    description: 'Consentimientos, solicitudes y cumplimiento de privacidad.',
    category: 'compliance',
    cadence: 'periodo',
    minPlan: 'pro',
    requiresManager: true,
  },
];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  operativo: 'Operativo',
  financiero: 'Financiero',
  estrategico: 'Estratégico',
  compliance: 'Cumplimiento',
};

export function getReportCatalogEntry(id: ReportId): ReportCatalogEntry | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}

export function planMeetsReportTier(
  userPlan: SubscriptionPlanTier,
  minPlan: SubscriptionPlanTier,
  basicPreview?: boolean,
): boolean {
  if (userPlan === 'basic') return Boolean(basicPreview);
  return TIER_RANK[userPlan] >= TIER_RANK[minPlan];
}

export type ReportAccessContext = {
  planTier: SubscriptionPlanTier;
  isManager: boolean;
  canViewSensitiveReports: boolean;
};

export function isReportUnlocked(
  entry: ReportCatalogEntry,
  ctx: ReportAccessContext,
): boolean {
  if (!planMeetsReportTier(ctx.planTier, entry.minPlan, entry.basicPreview)) {
    return false;
  }
  if (entry.requiresManager && !ctx.isManager) return false;
  if (entry.requiresReportsPermission && !ctx.canViewSensitiveReports) return false;
  return true;
}

export function getUnlockedReports(ctx: ReportAccessContext): ReportCatalogEntry[] {
  return REPORT_CATALOG.filter((entry) => isReportUnlocked(entry, ctx));
}

export function getLockedReports(ctx: ReportAccessContext): ReportCatalogEntry[] {
  return REPORT_CATALOG.filter((entry) => !isReportUnlocked(entry, ctx));
}

export function requiredPlanLabel(entry: ReportCatalogEntry): string {
  if (entry.basicPreview && entry.minPlan === 'normal') {
    return `${PLAN_TIER_LABELS.normal} (preview en ${PLAN_TIER_LABELS.basic})`;
  }
  return PLAN_TIER_LABELS[entry.minPlan];
}

export function reportsSummaryByPlan(planTier: SubscriptionPlanTier): {
  unlocked: number;
  total: number;
  previews: number;
} {
  const ctx: ReportAccessContext = {
    planTier,
    isManager: true,
    canViewSensitiveReports: true,
  };
  const unlocked = REPORT_CATALOG.filter((e) => isReportUnlocked(e, ctx)).length;
  const previews = REPORT_CATALOG.filter((e) => e.basicPreview).length;
  return { unlocked, total: REPORT_CATALOG.length, previews };
}
