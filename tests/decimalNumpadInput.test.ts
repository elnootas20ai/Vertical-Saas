import { describe, expect, it } from 'vitest';
import {
  appendDecimalNumpadKey,
  parseDecimalPadValue,
  sanitizeDecimalTyping,
} from '../src/app/lib/decimalNumpadInput';

describe('decimalNumpadInput', () => {
  it('sanitizes comma to point', () => {
    expect(sanitizeDecimalTyping('12,34')).toBe('12.34');
    expect(sanitizeDecimalTyping('1,5')).toBe('1.5');
  });

  it('appends point as decimal separator', () => {
    expect(appendDecimalNumpadKey('12', '.')).toBe('12.');
    expect(appendDecimalNumpadKey('', '.')).toBe('0.');
    expect(appendDecimalNumpadKey('12.', '.')).toBe('12.');
  });

  it('limits decimal digits while typing', () => {
    expect(appendDecimalNumpadKey('1.2', '3')).toBe('1.23');
  });

  it('tras importe cerrado (Exacto / billete) el siguiente dígito empieza cantidad nueva', () => {
    expect(appendDecimalNumpadKey('1.23', '4')).toBe('4');
    expect(appendDecimalNumpadKey('61.40', '1')).toBe('1');
    expect(appendDecimalNumpadKey('100.00', '5')).toBe('5');
  });

  it('parses values with comma or point', () => {
    expect(parseDecimalPadValue('12.34')).toBe(12.34);
    expect(parseDecimalPadValue('12,34')).toBe(12.34);
    expect(parseDecimalPadValue('')).toBeNaN();
  });
});
