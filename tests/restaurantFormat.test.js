/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  emptyRestaurantNeedsForFormat,
  getRestaurantFormatLabel,
  getRestaurantOpsTerms,
  normalizeRestaurantFormat,
  resolveRestaurantFormat,
} from '../src/app/verticals/restaurant/restaurantFormat.ts';

describe('restaurantFormat', () => {
  it('normaliza y resuelve formatos válidos', () => {
    expect(normalizeRestaurantFormat('bar')).toBe('bar');
    expect(normalizeRestaurantFormat('restaurant')).toBe('restaurant');
    expect(normalizeRestaurantFormat('bar_restaurant')).toBe('bar_restaurant');
    expect(normalizeRestaurantFormat('invalid')).toBeNull();
    expect(resolveRestaurantFormat(null)).toBe('restaurant');
    expect(resolveRestaurantFormat('bar')).toBe('bar');
  });

  it('expone etiqueta unificada bar/restaurante', () => {
    expect(getRestaurantFormatLabel('bar')).toBe('Bar/restaurante');
    expect(getRestaurantFormatLabel('restaurant')).toBe('Bar/restaurante');
    expect(getRestaurantFormatLabel('bar_restaurant')).toBe('Bar/restaurante');
  });

  it('terminología ops distinta por formato', () => {
    expect(getRestaurantOpsTerms('bar').orderSingular).toBe('Consumición');
    expect(getRestaurantOpsTerms('restaurant').orderSingular).toBe('Comanda');
    expect(getRestaurantOpsTerms('bar_restaurant').workspaceLabel).toBe('Barra y sala');
  });

  it('defaults de onboarding según formato', () => {
    expect(emptyRestaurantNeedsForFormat('bar').team).toBe(false);
    expect(emptyRestaurantNeedsForFormat('restaurant').team).toBe(true);
    expect(emptyRestaurantNeedsForFormat('bar_restaurant').team).toBe(true);
    expect(emptyRestaurantNeedsForFormat('bar').tpv).toBe(true);
  });
});
