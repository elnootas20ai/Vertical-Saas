/** Plan fijado manualmente por super-admin: no lo pisan onboarding ni MONEI. */

const VALID_PLAN_IDS = new Set(['basic', 'normal', 'pro']);

export const ADMIN_PLAN_LABELS = {
  basic: 'Básico',
  normal: 'Mediano',
  pro: 'Pro',
};

export function normalizeAdminPlanId(planId, planName) {
  const id = String(planId || '').trim().toLowerCase();
  if (VALID_PLAN_IDS.has(id)) return id;
  const name = String(planName || '').trim().toLowerCase();
  if (name.includes('pro')) return 'pro';
  if (name.includes('normal') || name.includes('mediano')) return 'normal';
  return 'basic';
}

export function adminPlanFieldsFromId(planId) {
  const id = normalizeAdminPlanId(planId, '');
  return {
    selectedPlanId: id,
    planName: ADMIN_PLAN_LABELS[id] || 'Básico',
  };
}

export function isAdminPlanLocked(subscription) {
  return Boolean(subscription?.adminPlanLocked);
}

export function applyAdminPlanLock(subscription, planId, planName, options = {}) {
  const id = normalizeAdminPlanId(planId, planName);
  const fields = adminPlanFieldsFromId(id);
  const now = options.at || new Date().toISOString();
  return {
    ...(subscription && typeof subscription === 'object' ? subscription : {}),
    ...fields,
    adminPlanLocked: true,
    adminPlanLockedAt: subscription?.adminPlanLockedAt || now,
  };
}

/** Restaura plan bloqueado por admin si el flujo intentó cambiarlo. */
export function preserveAdminLockedPlan(nextSubscription, previousSubscription) {
  const prev = previousSubscription && typeof previousSubscription === 'object' ? previousSubscription : {};
  const next = nextSubscription && typeof nextSubscription === 'object' ? nextSubscription : {};
  if (!isAdminPlanLocked(prev) && !isAdminPlanLocked(next)) return next;

  const source = isAdminPlanLocked(prev) ? prev : next;
  const fields = adminPlanFieldsFromId(source.selectedPlanId, source.planName);
  return {
    ...next,
    ...fields,
    adminPlanLocked: true,
    adminPlanLockedAt: source.adminPlanLockedAt || new Date().toISOString(),
  };
}
