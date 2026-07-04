import { describe, expect, it } from 'vitest';
import {
  sanitizeRetailTextFieldInput,
  sanitizeStoreDisplayName,
} from '../shared/naming/deliveryPointOfSaleCode.js';

describe('sanitizeStoreDisplayName live input', () => {
  it('permite espacio mientras se escribe', () => {
    expect(sanitizeRetailTextFieldInput('can ', 40)).toBe('can ');
    expect(sanitizeRetailTextFieldInput('can bar', 40)).toBe('can bar');
  });

  it('normaliza al guardar', () => {
    expect(sanitizeStoreDisplayName('  can bar  ')).toBe('can bar');
  });
});
