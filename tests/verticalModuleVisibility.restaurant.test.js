import { describe, expect, it } from 'vitest';
import { isMenuItemVisibleForVertical } from '../src/app/lib/verticalModuleVisibility.ts';

describe('restaurant menu visibility', () => {
  it('oculta integraciones delivery en restaurant y deja promos CRM', () => {
    expect(isMenuItemVisibleForVertical('delivery-integrations', 'restaurant')).toBe(false);
    expect(isMenuItemVisibleForVertical('delivery-ops', 'restaurant')).toBe(false);
    expect(isMenuItemVisibleForVertical('sala', 'restaurant')).toBe(true);
    expect(isMenuItemVisibleForVertical('lista-espera', 'restaurant')).toBe(true);
    expect(isMenuItemVisibleForVertical('web-config', 'restaurant')).toBe(true);
    expect(isMenuItemVisibleForVertical('promotions', 'restaurant')).toBe(true);
  });

  it('delivery sigue viendo integraciones', () => {
    expect(isMenuItemVisibleForVertical('delivery-integrations', 'delivery')).toBe(true);
    expect(isMenuItemVisibleForVertical('delivery-ops', 'delivery')).toBe(true);
  });
});
