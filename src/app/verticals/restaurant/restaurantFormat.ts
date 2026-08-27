/**
 * Formato interno del vertical restaurant (legacy: bar | restaurant | bar_restaurant).
 * En UI ya no se elige subtipo: todo es «Bar/restaurante» con default `restaurant`.
 */
import type { DeliveryNeedsSelection } from '../../lib/onboardingPlanRecommendation';

export type RestaurantFormat = 'bar' | 'restaurant' | 'bar_restaurant';

export const RESTAURANT_FORMATS: RestaurantFormat[] = ['bar', 'restaurant', 'bar_restaurant'];

export const RESTAURANT_FORMAT_LABEL = 'Bar/restaurante';

export function normalizeRestaurantFormat(
  value: string | null | undefined,
): RestaurantFormat | null {
  const v = String(value || '').trim() as RestaurantFormat;
  return RESTAURANT_FORMATS.includes(v) ? v : null;
}

/** Default para empresas nuevas y legacy sin valor. */
export function resolveRestaurantFormat(
  value: string | null | undefined,
): RestaurantFormat {
  return normalizeRestaurantFormat(value) ?? 'restaurant';
}

export function getRestaurantFormatLabel(_format?: RestaurantFormat | null): string {
  return RESTAURANT_FORMAT_LABEL;
}

export type RestaurantOpsTerms = {
  orderSingular: string;
  orderPlural: string;
  catalogItem: string;
  catalogItemPlural: string;
  workspaceLabel: string;
};

const OPS_TERMS: Record<RestaurantFormat, RestaurantOpsTerms> = {
  bar: {
    orderSingular: 'Consumición',
    orderPlural: 'Consumiciones',
    catalogItem: 'Bebida / Ración',
    catalogItemPlural: 'Carta de bar',
    workspaceLabel: 'Barra',
  },
  restaurant: {
    orderSingular: 'Comanda',
    orderPlural: 'Comandas',
    catalogItem: 'Plato',
    catalogItemPlural: 'Platos',
    workspaceLabel: 'Sala',
  },
  bar_restaurant: {
    orderSingular: 'Comanda',
    orderPlural: 'Comandas',
    catalogItem: 'Plato / Bebida',
    catalogItemPlural: 'Carta',
    workspaceLabel: 'Barra y sala',
  },
};

export function getRestaurantOpsTerms(
  format: RestaurantFormat | null | undefined,
): RestaurantOpsTerms {
  return OPS_TERMS[resolveRestaurantFormat(format)];
}

/** Necesidades por defecto en onboarding según formato. */
export function emptyRestaurantNeedsForFormat(
  format: RestaurantFormat | null | undefined,
): DeliveryNeedsSelection {
  const f = resolveRestaurantFormat(format);
  const base: DeliveryNeedsSelection = {
    tpv: true,
    catalogStock: false,
    deliveryOrders: true,
    autoShipping: false,
    clients: false,
    team: false,
    invoicing: false,
    reports: false,
  };
  if (f === 'bar') {
    return { ...base, deliveryOrders: true, autoShipping: false };
  }
  if (f === 'restaurant') {
    return { ...base, team: true };
  }
  return { ...base, team: true };
}
