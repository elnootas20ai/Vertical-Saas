import { describe, expect, it } from 'vitest';
import { scoreClientSearchMatch, clientSearchPrefersPhone } from '../shared/clients/clientSearchMatch.js';

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function scoreName(name, q) {
  const doc = { type: 'client', name, phone: '' };
  const qFold = fold(q);
  const qDigits = String(q).replace(/\D/g, '');
  return scoreClientSearchMatch(doc, q, qFold, qDigits, clientSearchPrefersPhone(q, qDigits));
}

describe('client search name ranking', () => {
  it('pau exacto gana a Paula…', () => {
    expect(scoreName('pau', 'pau')).toBeGreaterThan(scoreName('Paula Núñez Vega', 'pau'));
    expect(scoreName('Pau', 'pau')).toBeGreaterThan(scoreName('Paula Iglesias', 'pau'));
  });

  it('uriel / alfons exactos puntúan alto', () => {
    expect(scoreName('uriel', 'uriel')).toBeGreaterThan(scoreName('Muriel', 'uriel'));
    expect(scoreName('Alfons', 'alfons')).toBeGreaterThan(0);
    expect(scoreName('alfonso', 'alfons')).toBeGreaterThan(0);
  });

  it('prefijo corto no usa includes suelto', () => {
    // «pau» no debe matchear por includes genérico en basura larga sin prefijo de palabra
    expect(scoreName('superpaqueta', 'pau')).toBe(0);
  });
});
