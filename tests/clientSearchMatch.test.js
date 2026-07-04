import { describe, expect, it } from 'vitest';
import {
  clientMatchesBusinessScope,
  scoreClientSearchMatch,
  scorePhoneDigitsMatch,
} from '../shared/clients/clientSearchMatch.js';

describe('clientMatchesBusinessScope', () => {
  it('incluye clientes legacy sin business_id si no hay filtro estricto', () => {
    expect(clientMatchesBusinessScope({ name: 'Ana' }, 'biz-a')).toBe(true);
  });

  it('oculta legacy sin business_id al filtrar por empresa activa', () => {
    expect(
      clientMatchesBusinessScope({ name: 'Ana' }, 'biz-a', { excludeUnscopedLegacy: true }),
    ).toBe(false);
  });

  it('filtra por empresa cuando hay varias activas', () => {
    const doc = { business_id: 'biz-a', name: 'Ana' };
    expect(clientMatchesBusinessScope(doc, 'biz-a', { legacySingleBusiness: false })).toBe(true);
    expect(clientMatchesBusinessScope(doc, 'biz-b', { legacySingleBusiness: false })).toBe(false);
  });

  it('con una sola empresa activa no excluye por business_id distinto', () => {
    const doc = { business_id: 'biz-old', name: 'Ana' };
    expect(clientMatchesBusinessScope(doc, 'biz-a', { legacySingleBusiness: true })).toBe(true);
  });
});

describe('scorePhoneDigitsMatch', () => {
  it('encuentra prefijo móvil aunque el doc tenga +34', () => {
    expect(scorePhoneDigitsMatch('34666123456', '666')).toBeGreaterThan(0);
    expect(scorePhoneDigitsMatch('34666123456', '666123456')).toBeGreaterThan(0);
  });

  it('encuentra móvil sin prefijo internacional', () => {
    expect(scorePhoneDigitsMatch('666123456', '666')).toBeGreaterThan(0);
  });
});

describe('scoreClientSearchMatch', () => {
  it('encuentra por nombre parcial como en CRM', () => {
    const doc = { name: 'María García', phone: '666123456' };
    expect(scoreClientSearchMatch(doc, 'garc', 'garc', '', false)).toBeGreaterThan(0);
  });

  it('encuentra por teléfono parcial con +34 almacenado', () => {
    const doc = { name: 'Cliente', phone: '+34 666 123 456' };
    expect(scoreClientSearchMatch(doc, '666', '666', '666', true)).toBeGreaterThan(0);
  });
});
