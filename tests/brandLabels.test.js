import { describe, expect, it } from 'vitest';
import {
  buildBrandLabelsMap,
  displayBrandName,
  looksLikeBrandTechnicalId,
} from '../src/app/lib/brandLabels.ts';

describe('brandLabels UI', () => {
  it('detecta ids técnicos brand-uuid', () => {
    expect(looksLikeBrandTechnicalId('brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec')).toBe(true);
    expect(looksLikeBrandTechnicalId('96a8d7ce-e9af-459c-b8a9-48ffc55949ec')).toBe(true);
    expect(looksLikeBrandTechnicalId('Black Burger')).toBe(false);
    expect(looksLikeBrandTechnicalId('MODOMIO')).toBe(false);
  });

  it('resuelve nombre por alias y no muestra el uuid en UI', () => {
    const labels = buildBrandLabelsMap([
      { _id: 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec', name: 'Black Burger' },
    ]);
    expect(
      displayBrandName('brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec', labels),
    ).toBe('Black Burger');
    expect(
      displayBrandName('96a8d7ce-e9af-459c-b8a9-48ffc55949ec', labels),
    ).toBe('Black Burger');
    expect(displayBrandName('brand-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {})).toBe('Marca');
  });
});
