import { describe, expect, it } from 'vitest';
import {
  brandIdsForCatalogServiceSave,
  DEFAULT_CATALOG_SERVICE_RULES,
  mergeCatalogServiceRulesIntoCustomFields,
  readCatalogServiceRules,
  summarizeCatalogServiceRules,
  validateCatalogServiceRules,
} from '../src/app/lib/catalogServiceRules.ts';

describe('catalogServiceRules', () => {
  it('readCatalogServiceRules defaults', () => {
    const rules = readCatalogServiceRules(undefined);
    expect(rules.applicationMode).toBe('manual');
    expect(rules.deliveryTypes).toEqual([]);
  });

  it('merge and read catalog service rules roundtrip', () => {
    const cf = mergeCatalogServiceRulesIntoCustomFields({}, {
      ...DEFAULT_CATALOG_SERVICE_RULES,
      applicationMode: 'automatic',
      deliveryTypes: ['domicilio', 'sala'],
      brandScope: 'selected',
      brandIds: ['brand-1'],
      cashierCanRemove: false,
      tpvOnly: true,
    });
    const rules = readCatalogServiceRules(cf);
    expect(rules.applicationMode).toBe('automatic');
    expect(rules.deliveryTypes).toEqual(['domicilio', 'sala']);
    expect(rules.brandScope).toBe('selected');
    expect(rules.brandIds).toEqual(['brand-1']);
    expect(rules.cashierCanRemove).toBe(false);
    expect(rules.tpvOnly).toBe(true);
  });

  it('validateCatalogServiceRules requires delivery types when automatic', () => {
    expect(
      validateCatalogServiceRules({
        ...DEFAULT_CATALOG_SERVICE_RULES,
        applicationMode: 'automatic',
        deliveryTypes: [],
      }),
    ).toBeTruthy();
    expect(
      validateCatalogServiceRules({
        ...DEFAULT_CATALOG_SERVICE_RULES,
        applicationMode: 'automatic',
        deliveryTypes: ['domicilio'],
      }),
    ).toBeNull();
  });

  it('brandIdsForCatalogServiceSave', () => {
    expect(brandIdsForCatalogServiceSave(DEFAULT_CATALOG_SERVICE_RULES)).toEqual([]);
    expect(
      brandIdsForCatalogServiceSave({
        ...DEFAULT_CATALOG_SERVICE_RULES,
        brandScope: 'selected',
        brandIds: ['a', 'b'],
      }),
    ).toEqual(['a', 'b']);
  });

  it('summarizeCatalogServiceRules', () => {
    const text = summarizeCatalogServiceRules({
      ...DEFAULT_CATALOG_SERVICE_RULES,
      applicationMode: 'both',
      deliveryTypes: ['domicilio'],
      tpvOnly: true,
    });
    expect(text).toMatch(/Manual y auto/);
    expect(text).toMatch(/domicilio/i);
    expect(text).toMatch(/Solo TPV/);
  });
});
