import { describe, expect, it } from 'vitest';
import { extractAlbaranRefsFromText } from '../services/couchdb.js';

describe('extractAlbaranRefsFromText', () => {
  it('extrae nº de albarán desde notas de factura', () => {
    expect(extractAlbaranRefsFromText('Según albarán ALB-2026-014 y total')).toEqual([
      'ALB-2026-014',
    ]);
    expect(extractAlbaranRefsFromText('Alb. n° 44521/A')).toEqual(['44521/A']);
  });

  it('no inventa refs si no hay mención', () => {
    expect(extractAlbaranRefsFromText('Factura FAC-9 sin referencia')).toEqual([]);
  });
});
