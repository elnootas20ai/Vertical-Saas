/**
 * Cotización única Vertial (onboarding + transferencia).
 *
 * Fórmula:
 *   1) Precio lista mensual = plan + extras (precios mensuales enteros)
 *   2) Si cobro mensual → a pagar = lista mensual
 *   3) Si cobro anual → a pagar = redondeo_céntimos(lista mensual × 12 × 0,8)
 *      equivalente mensual mostrado = a pagar / 12
 */

import { PLAN_ADDON_CATALOG } from './planAddons.js';
import {
  INCLUDED_BUSINESSES,
  INCLUDED_COMMERCIAL_BRANDS,
  PLAN_TIER_LABELS,
  POINT_OF_SALE_LIMITS,
  WORKER_SEAT_LIMITS,
  clampExtraBusinessSlots,
  clampExtraCommercialBrandSlots,
  clampExtraPointOfSaleSlots,
  clampExtraWorkerSlots,
  resolvePlanTier,
} from './entitlements.js';

export const PLAN_QUOTE_CATALOG = {
  basic: { id: 'basic', name: 'Básico', monthlyEuros: 49 },
  normal: { id: 'normal', name: 'Normal', monthlyEuros: 149 },
  pro: { id: 'pro', name: 'Pro', monthlyEuros: 349 },
};

export const ANNUAL_DISCOUNT = 0.2;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toNonNegInt(n) {
  const v = Math.floor(Number(n) || 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function normalizeMetrics(metrics = {}) {
  return {
    userCount: Math.max(1, Math.floor(Number(metrics.userCount) || 1)),
    locationCount: Math.max(1, Math.floor(Number(metrics.locationCount) || 1)),
    businessCount: Math.max(1, Math.floor(Number(metrics.businessCount) || 1)),
    commercialBrandCount: Math.max(0, Math.floor(Number(metrics.commercialBrandCount) || 0)),
  };
}

function addonMonthlyEuros(addonId) {
  const row = PLAN_ADDON_CATALOG[addonId];
  if (!row) return 0;
  return Math.round(Number(row.monthlyPrice || 0) / 100);
}

export function resolveBillingMode(raw) {
  return String(raw || '').trim().toLowerCase() === 'annual' ? 'annual' : 'monthly';
}

export function resolvePlanId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return PLAN_QUOTE_CATALOG[id] ? id : 'basic';
}

function extrasFromMetrics(planId, metrics) {
  const m = normalizeMetrics(metrics);
  const tier = resolvePlanTier(planId, planId);
  return {
    extraPointOfSaleSlots: clampExtraPointOfSaleSlots(
      Math.max(0, m.locationCount - (POINT_OF_SALE_LIMITS[tier] ?? 1)),
    ),
    extraBusinessSlots: clampExtraBusinessSlots(
      Math.max(0, m.businessCount - (INCLUDED_BUSINESSES[tier] ?? 1)),
    ),
    extraCommercialBrandSlots: clampExtraCommercialBrandSlots(
      Math.max(0, m.commercialBrandCount - (INCLUDED_COMMERCIAL_BRANDS[tier] ?? 0)),
    ),
    extraWorkerSlots: clampExtraWorkerSlots(
      Math.max(0, m.userCount - (WORKER_SEAT_LIMITS[tier] ?? 2)),
    ),
  };
}

/**
 * Extras desde cupos ya guardados O desde métricas de infraestructura.
 */
export function resolveExtraSlots({
  planId,
  metrics,
  extraPointOfSaleSlots,
  extraBusinessSlots,
  extraCommercialBrandSlots,
  extraWorkerSlots,
} = {}) {
  const hasMetrics =
    metrics &&
    (metrics.userCount != null ||
      metrics.locationCount != null ||
      metrics.businessCount != null ||
      metrics.commercialBrandCount != null);

  if (hasMetrics) {
    return extrasFromMetrics(planId, metrics);
  }

  return {
    extraPointOfSaleSlots: toNonNegInt(extraPointOfSaleSlots),
    extraBusinessSlots: toNonNegInt(extraBusinessSlots),
    extraCommercialBrandSlots: toNonNegInt(extraCommercialBrandSlots),
    extraWorkerSlots: toNonNegInt(extraWorkerSlots),
  };
}

/**
 * @param {object} params
 */
export function quoteSubscription(params = {}) {
  const planId = resolvePlanId(params.planId);
  const billingMode = resolveBillingMode(params.billingMode);
  const plan = PLAN_QUOTE_CATALOG[planId];
  const tier = resolvePlanTier(planId, plan.name);

  const slots = resolveExtraSlots({
    planId: tier,
    metrics: params.metrics,
    extraPointOfSaleSlots: params.extraPointOfSaleSlots,
    extraBusinessSlots: params.extraBusinessSlots,
    extraCommercialBrandSlots: params.extraCommercialBrandSlots,
    extraWorkerSlots: params.extraWorkerSlots,
  });

  const extras = {
    extraPdv: toNonNegInt(slots.extraPointOfSaleSlots),
    extraBusinesses: toNonNegInt(slots.extraBusinessSlots),
    extraBrands: toNonNegInt(slots.extraCommercialBrandSlots),
    extraWorkers: toNonNegInt(slots.extraWorkerSlots),
  };

  const units = {
    plan: plan.monthlyEuros,
    pdv: addonMonthlyEuros('extra_pdv'),
    business: addonMonthlyEuros('extra_business'),
    brand: addonMonthlyEuros('extra_brand'),
    worker: addonMonthlyEuros('extra_worker'),
  };

  const lines = [
    { key: 'plan', label: `Plan ${plan.name}`, qty: 1, unitMonthly: units.plan, totalMonthly: units.plan },
  ];
  if (extras.extraPdv > 0) {
    lines.push({
      key: 'pdv',
      label: 'PDV extra',
      qty: extras.extraPdv,
      unitMonthly: units.pdv,
      totalMonthly: extras.extraPdv * units.pdv,
    });
  }
  if (extras.extraWorkers > 0) {
    lines.push({
      key: 'workers',
      label: 'Trabajadores extra',
      qty: extras.extraWorkers,
      unitMonthly: units.worker,
      totalMonthly: extras.extraWorkers * units.worker,
    });
  }
  if (extras.extraBusinesses > 0) {
    lines.push({
      key: 'businesses',
      label: 'Empresas extra',
      qty: extras.extraBusinesses,
      unitMonthly: units.business,
      totalMonthly: extras.extraBusinesses * units.business,
    });
  }
  if (extras.extraBrands > 0) {
    lines.push({
      key: 'brands',
      label: 'Marcas extra',
      qty: extras.extraBrands,
      unitMonthly: units.brand,
      totalMonthly: extras.extraBrands * units.brand,
    });
  }

  const listMonthlyEuros = round2(lines.reduce((sum, line) => sum + line.totalMonthly, 0));

  let amountDueEuros;
  let monthlyEquivalentEuros;
  if (billingMode === 'annual') {
    amountDueEuros = round2(listMonthlyEuros * 12 * (1 - ANNUAL_DISCOUNT));
    monthlyEquivalentEuros = round2(amountDueEuros / 12);
  } else {
    amountDueEuros = listMonthlyEuros;
    monthlyEquivalentEuros = listMonthlyEuros;
  }

  const included = {
    pdv: POINT_OF_SALE_LIMITS[tier] ?? 1,
    businesses: INCLUDED_BUSINESSES[tier] ?? 1,
    brands: INCLUDED_COMMERCIAL_BRANDS[tier] ?? 0,
    workers: WORKER_SEAT_LIMITS[tier] ?? 2,
  };

  return {
    planId,
    planName: PLAN_TIER_LABELS[tier] || plan.name,
    billingMode,
    extras,
    included,
    lines,
    /** Suma mensual a precio lista (sin descuento). */
    listMonthlyEuros,
    baseMonthlyEuros: units.plan,
    extrasMonthlyEuros: round2(listMonthlyEuros - units.plan),
    /** Cuota mensual a mostrar (con descuento ya prorrateado si es anual). */
    monthlyEquivalentEuros,
    /** Importe a pagar ahora. */
    amountDueEuros,
    amountDueCents: Math.round(amountDueEuros * 100),
    periodLabel: billingMode === 'annual' ? 'año' : 'mes',
    billingLabel: billingMode === 'annual' ? 'cobro anual (−20%)' : 'cobro mensual',
    formulaNote:
      billingMode === 'annual'
        ? `${listMonthlyEuros} €/mes × 12 × 0,8 = ${amountDueEuros} €/año`
        : `${listMonthlyEuros} €/mes`,
  };
}

/**
 * Cotiza desde cuenta: métricas del onboarding + plan/modo elegidos.
 */
export function quoteSubscriptionFromAccount(account = {}) {
  const sub = account.subscription && typeof account.subscription === 'object' ? account.subscription : {};
  const onboarding = account.onboardingData && typeof account.onboardingData === 'object' ? account.onboardingData : {};
  const selection =
    onboarding.subscriptionSelection && typeof onboarding.subscriptionSelection === 'object'
      ? onboarding.subscriptionSelection
      : {};
  const paymentSummary =
    account.paymentSummary && typeof account.paymentSummary === 'object' ? account.paymentSummary : {};
  const planId = resolvePlanId(
    selection.recommendedPlanId || sub.selectedPlanId || paymentSummary.selectedPlanId || 'basic',
  );
  const billingMode = resolveBillingMode(
    selection.billingMode || sub.billingMode || paymentSummary.billingMode || 'monthly',
  );

  const hasOnboardingMetrics = Boolean(onboarding.businessMetrics);

  return quoteSubscription({
    planId,
    billingMode,
    metrics: hasOnboardingMetrics ? normalizeMetrics(onboarding.businessMetrics || {}) : undefined,
    extraPointOfSaleSlots: sub.extraPointOfSaleSlots,
    extraBusinessSlots: sub.extraBusinessSlots,
    extraCommercialBrandSlots: sub.extraCommercialBrandSlots,
    extraWorkerSlots: sub.extraWorkerSlots,
  });
}
