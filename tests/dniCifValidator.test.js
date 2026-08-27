import { describe, expect, it } from 'vitest';
import {
  validateDni,
  validateDniOrNie,
  getDniOrNieError,
} from '../src/app/lib/dniCifValidator.ts';

describe('dniCifValidator', () => {
  it('acepta DNI con letra de control correcta (solo formato, no identidad real)', () => {
    expect(validateDni('12345678Z')).toBe(true);
    expect(getDniOrNieError('12345678Z')).toBeNull();
  });

  it('rechaza DNI con letra incorrecta', () => {
    expect(validateDni('12345678A')).toBe(false);
    expect(getDniOrNieError('12345678A')).toBeTruthy();
  });

  it('validateDniOrNie acepta NIE válido', () => {
    expect(validateDniOrNie('X1234567L')).toBe(true);
  });
});
