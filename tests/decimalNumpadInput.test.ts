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

  it('limits decimal digits', () => {
    expect(appendDecimalNumpadKey('1.23', '4')).toBe('1.23');
    expect(appendDecimalNumpadKey('1.2', '3')).toBe('1.23');
  });

  it('parses values with comma or point', () => {
    expect(parseDecimalPadValue('12.34')).toBe(12.34);
    expect(parseDecimalPadValue('12,34')).toBe(12.34);
    expect(parseDecimalPadValue('')).toBeNaN();
  });
});
