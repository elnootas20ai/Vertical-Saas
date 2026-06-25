/**
 * Provisiona suscripción de prueba según infraestructura declarada en el onboarding.
 * Sin pasarela real: al guardar tarjeta / completar alta se aplican plan + cupos extra.
 */

import {
  INCLUDED_BUSINESSES,
  INCLUDED_COMMERCIAL_BRANDS,
  PLAN_TIER_LABELS,
  POINT_OF_SALE_LIMITS,
  clampExtraBusinessSlots,
  clampExtraCommercialBrandSlots,
  clampExtraPointOfSaleSlots,
  resolvePlanTier,
} from './entitlements.js';
import { clampOnboardingPlanId } from './onboardingPlanRecommendation.js';

export function normalizeInfrastructureMetrics(metrics = {}) {
  return {
    userCount: Math.max(1, Math.floor(Number(metrics.userCount) || 1)),
    locationCount: Math.max(1, Math.floor(Number(metrics.locationCount) || 1)),
    businessCount: Math.max(1, Math.floor(Number(metrics.businessCount) || 1)),
    commercialBrandCount: Math.max(0, Math.floor(Number(metrics.commercialBrandCount) || 0)),
  };
}

export function computeOnboardingExtraSlots(planTier, metrics) {
  const m = normalizeInfrastructureMetrics(metrics);
  const tier = resolvePlanTier(planTier, planTier);
  const maxPdv = POINT_OF_SALE_LIMITS[tier] ?? POINT_OF_SALE_LIMITS.basic;
  const maxBiz = INCLUDED_BUSINESSES[tier] ?? INCLUDED_BUSINESSES.basic;
  const maxBrands = INCLUDED_COMMERCIAL_BRANDS[tier] ?? 0;

  return {
    extraPointOfSaleSlots: clampExtraPointOfSaleSlots(Math.max(0, m.locationCount - maxPdv)),
    extraBusinessSlots: clampExtraBusinessSlots(Math.max(0, m.businessCount - maxBiz)),
    extraCommercialBrandSlots: clampExtraCommercialBrandSlots(
      Math.max(0, m.commercialBrandCount - maxBrands),
    ),
  };
}

function resolvePlanIdFromOnboarding(onboardingData, overrides = {}) {
  const fromOverride = String(overrides.selectedPlanId || '').trim().toLowerCase();
  const fromSelection = String(onboardingData?.subscriptionSelection?.recommendedPlanId || '')
    .trim()
    .toLowerCase();
  const raw =
    fromOverride === 'basic' || fromOverride === 'normal' || fromOverride === 'pro'
      ? fromOverride
      : fromSelection === 'basic' || fromSelection === 'normal' || fromSelection === 'pro'
        ? fromSelection
        : 'basic';
  return clampOnboardingPlanId(raw, onboardingData);
}

function resolveBillingMode(onboardingData, overrides = {}) {
  const mode = String(overrides.billingMode || onboardingData?.subscriptionSelection?.billingMode || 'monthly')
    .trim()
    .toLowerCase();
  return mode === 'annual' ? 'annual' : 'monthly';
}

function resolveTrialEndsAt(onboardingData, existingSubscription = {}) {
  const trialEnd = onboardingData?.trial?.endDate;
  if (trialEnd) {
    const d = new Date(trialEnd);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return existingSubscription.trialEndsAt || null;
}

/**
 * Construye el objeto subscription de cuenta a partir del onboarding (sin cobro real).
 */
export function buildSubscriptionFromOnboarding(onboardingData, existingSubscription = {}, overrides = {}) {
  const prev = existingSubscription && typeof existingSubscription === 'object' ? existingSubscription : {};
  const planId = resolvePlanIdFromOnboarding(onboardingData, overrides);
  const tier = resolvePlanTier(planId, '');
  const metrics = normalizeInfrastructureMetrics(onboardingData?.businessMetrics || {});
  const extras = computeOnboardingExtraSlots(tier, metrics);
  const billingMode = resolveBillingMode(onboardingData, overrides);
  const now = new Date().toISOString();

  return {
    ...prev,
    status: prev.status || 'trial_active',
    selectedPlanId: tier,
    planName: PLAN_TIER_LABELS[tier] || 'Básico',
    billingMode,
    extraPointOfSaleSlots: extras.extraPointOfSaleSlots,
    extraBusinessSlots: extras.extraBusinessSlots,
    extraCommercialBrandSlots: extras.extraCommercialBrandSlots,
    trialEndsAt: resolveTrialEndsAt(onboardingData, prev) || prev.trialEndsAt,
    currentPeriodStart: prev.currentPeriodStart || now,
    onboardingProvisionedAt: now,
    /** Hasta enchufar MONEI: cupos según onboarding, sin cargo real. */
    paymentProvider: 'onboarding_stub',
  };
}
