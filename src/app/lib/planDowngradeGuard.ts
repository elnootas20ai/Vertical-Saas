/** Orden de planes Vertial (para bloquear bajadas). */
export type VertialPlanRankId = 'basic' | 'normal' | 'pro';

export function planTierRank(planId: string | null | undefined): number {
  const id = String(planId || '').toLowerCase();
  if (id === 'pro') return 2;
  if (id === 'normal' || id === 'mediano') return 1;
  if (id === 'basic' || id === 'basico' || id === 'básico') return 0;
  return 0;
}

/** Cliente real en Pro: no puede bajar a Mediano/Básico desde la app. */
export function isProDowngradeBlocked(opts: {
  /** Admin con Mi plan / simulación: siempre false. */
  canSimulatePlans: boolean;
  activePlanId: string | null | undefined;
  targetPlanId: string | null | undefined;
}): boolean {
  if (opts.canSimulatePlans) return false;
  return planTierRank(opts.activePlanId) >= 2 && planTierRank(opts.targetPlanId) < 2;
}
