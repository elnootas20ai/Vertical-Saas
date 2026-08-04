import { describe, expect, it } from 'vitest';
import {
  formatDateEs,
  formatDateRangeEs,
  formatDateTimeEs,
} from '../src/app/lib/formatDateEs.ts';

describe('formatDateEs', () => {
  it('formatea yyyy-mm-dd a día/mes/año', () => {
    expect(formatDateEs('2026-09-03')).toBe('03/09/2026');
  });

  it('rango en día/mes/año', () => {
    expect(formatDateRangeEs('2026-09-03', '2026-09-05')).toBe('03/09/2026 → 05/09/2026');
  });

  it('fecha+hora con día/mes/año', () => {
    const out = formatDateTimeEs('2026-09-03T14:30:00');
    expect(out).toMatch(/^03\/09\/2026/);
    expect(out).toMatch(/14:30/);
  });
});
