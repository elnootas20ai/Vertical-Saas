import { describe, expect, it } from 'vitest';
import { resolveTableCapacity } from '../src/app/verticals/restaurant/tableCapacity';

describe('resolveTableCapacity', () => {
  it('uses real capacity when it is not the grid area', () => {
    expect(
      resolveTableCapacity({ capacity: 4, gridW: 4, gridH: 4, sizePreset: 'medium' }),
    ).toBe(4);
    expect(
      resolveTableCapacity({ capacity: 8, gridW: 6, gridH: 4, sizePreset: 'large' }),
    ).toBe(8);
  });

  it('recovers from capacity === gridW×gridH bug (e.g. 3×3 → 9)', () => {
    expect(
      resolveTableCapacity({ capacity: 9, gridW: 3, gridH: 3, sizePreset: 'small' }),
    ).toBe(2);
    expect(
      resolveTableCapacity({ capacity: 16, gridW: 4, gridH: 4, sizePreset: 'medium' }),
    ).toBe(4);
  });
});
