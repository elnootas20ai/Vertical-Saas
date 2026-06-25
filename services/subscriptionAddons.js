import { PLAN_ADDON_CATALOG } from '../shared/billing/planAddons.js';

const ACTIVE_FOR_ADDON = new Set(['subscription_active', 'trial_active', 'trial_expiring']);

export function resolvePlanTier(planId, planName) {
  const id = String(planId || '').toLowerCase();
  const name = String(planName || '').toLowerCase();
  if (id === 'pro' || name.includes('pro')) return 'pro';
  if (id === 'normal' || name.includes('normal') || name.includes('mediano')) return 'normal';
  return 'basic';
}

export function getAddonDefinition(addonId) {
  return PLAN_ADDON_CATALOG[addonId] || null;
}

export function resolveAddonAmountCents(addonId, billingMode = 'monthly') {
  const addon = getAddonDefinition(addonId);
  if (!addon) return null;
  return billingMode === 'annual' ? addon.annualPrice : addon.monthlyPrice;
}

export function canPurchaseAddon(account, addonId) {
  const addon = getAddonDefinition(addonId);
  if (!addon) {
    return { ok: false, error: 'Ampliación no válida.' };
  }

  const sub = account?.subscription || {};
  if (!ACTIVE_FOR_ADDON.has(String(sub.status || ''))) {
    return {
      ok: false,
      error: 'Activa tu suscripción mensual antes de contratar ampliaciones.',
      code: 'SUBSCRIPTION_INACTIVE',
    };
  }

  const tier = resolvePlanTier(sub.selectedPlanId, sub.planName);
  if (tier !== 'pro' && !sub.adminProAccess) {
    return {
      ok: false,
      error: 'Necesitas plan Pro activo para contratar ampliaciones.',
      code: 'PRO_REQUIRED',
    };
  }

  return { ok: true, addon };
}

export function applyAddonSlots(subscription, addonId, quantity = 1) {
  const sub = { ...(subscription || {}) };
  const delta = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));

  if (addonId === 'extra_pdv') {
    sub.extraPointOfSaleSlots = Math.min(
      99,
      Math.max(0, Math.floor(Number(sub.extraPointOfSaleSlots) || 0)) + delta,
    );
  } else if (addonId === 'extra_brand') {
    sub.extraCommercialBrandSlots = Math.min(
      99,
      Math.max(0, Math.floor(Number(sub.extraCommercialBrandSlots) || 0)) + delta,
    );
  } else if (addonId === 'extra_business') {
    sub.extraBusinessSlots = Math.min(
      99,
      Math.max(0, Math.floor(Number(sub.extraBusinessSlots) || 0)) + delta,
    );
  }

  return sub;
}

export function applyAddonToAccount(account, addonId, quantity = 1) {
  return {
    ...account,
    subscription: applyAddonSlots(account.subscription, addonId, quantity),
  };
}
