import { describe, expect, it } from 'vitest';
import {
  RESTAURANT_CAJA_PATH,
  RESTAURANT_CEO_TPV_PATH,
  RESTAURANT_OPS_HOME_PATH,
  RESTAURANT_REPORTS_PATH,
  RESTAURANT_SIDEBAR_PATH_OVERRIDES,
  DELIVERY_CAJA_PATH,
  DELIVERY_CEO_TPV_PATH,
} from '../src/app/lib/retailOpsPaths.ts';

describe('restaurant sidebar path overrides', () => {
  it('TPV y caja restaurant no apuntan a rutas delivery', () => {
    expect(RESTAURANT_SIDEBAR_PATH_OVERRIDES['tpv-rapido']).toBe(RESTAURANT_CEO_TPV_PATH);
    expect(RESTAURANT_SIDEBAR_PATH_OVERRIDES.caja).toBe(RESTAURANT_CAJA_PATH);
    expect(RESTAURANT_SIDEBAR_PATH_OVERRIDES['tpv-rapido']).not.toBe(DELIVERY_CEO_TPV_PATH);
    expect(RESTAURANT_SIDEBAR_PATH_OVERRIDES.caja).not.toBe(DELIVERY_CAJA_PATH);
  });

  it('ops e informes usan rutas restaurant', () => {
    expect(RESTAURANT_SIDEBAR_PATH_OVERRIDES['restaurant-ops']).toBe(RESTAURANT_OPS_HOME_PATH);
    expect(RESTAURANT_SIDEBAR_PATH_OVERRIDES.reports).toBe(RESTAURANT_REPORTS_PATH);
    expect(RESTAURANT_REPORTS_PATH).toMatch(/\/vertical\/restaurant\//);
  });

  it('cubre los ítems compartidos con delivery que rompen sin override', () => {
    expect(Object.keys(RESTAURANT_SIDEBAR_PATH_OVERRIDES).sort()).toEqual(
      ['caja', 'reports', 'restaurant-ops', 'tpv-rapido'].sort(),
    );
  });
});
