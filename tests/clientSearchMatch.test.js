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

  it('oculta legacy sin business_id al filtrar por empresa activa (multi-empresa)', () => {
    expect(
      clientMatchesBusinessScope({ name: 'Ana' }, 'biz-a', { excludeUnscopedLegacy: true }),
    ).toBe(false);
  });

  it('con una sola empresa muestra legacy sin business_id (TPV/CRM)', () => {
    expect(
      clientMatchesBusinessScope({ name: 'Ana' }, 'biz-a', {
        legacySingleBusiness: true,
        excludeUnscopedLegacy: false,
      }),
    ).toBe(true);
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

  it('con varias empresas solo muestra la empresa activa (scoped)', () => {
    const scoped = { business_id: 'biz-a', name: 'Ana' };
    const other = { business_id: 'biz-b', name: 'Luis' };
    const opts = { legacySingleBusiness: false, excludeUnscopedLegacy: true };
    expect(clientMatchesBusinessScope(scoped, 'biz-a', opts)).toBe(true);
    expect(clientMatchesBusinessScope(other, 'biz-a', opts)).toBe(false);
    expect(clientMatchesBusinessScope({ name: 'Sin sede' }, 'biz-a', opts)).toBe(false);
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

  it('encuentra por prefijo desde el primer dígito', () => {
    expect(scorePhoneDigitsMatch('666123456', '6')).toBeGreaterThan(0);
    expect(scorePhoneDigitsMatch('34666123456', '66')).toBeGreaterThan(0);
  });

  it('con 1-2 dígitos no hace match suelto por sufijo', () => {
    expect(scorePhoneDigitsMatch('666123459', '9')).toBe(0);
    expect(scorePhoneDigitsMatch('666123459', '59')).toBe(0);
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

  it('encuentra por teléfono desde el primer dígito', () => {
    const doc = { name: 'Cliente', phone: '+34 666 123 456' };
    expect(scoreClientSearchMatch(doc, '6', '6', '6', true)).toBeGreaterThan(0);
    expect(scoreClientSearchMatch(doc, '66', '66', '66', true)).toBeGreaterThan(0);
  });

  it('encuentra por primera letra del nombre', () => {
    const doc = { name: 'María García', phone: '666123456' };
    expect(scoreClientSearchMatch(doc, 'm', 'm', '', false)).toBeGreaterThan(0);
    expect(scoreClientSearchMatch(doc, 'z', 'z', '', false)).toBe(0);
  });

  it('sigue encontrando cliente tras recrearlo con mismo teléfono (datos nuevos)', () => {
    const reimported = {
      name: 'Cliente Reimportado',
      phone: '+34 666 123 456',
      business_id: 'biz-a',
    };
    expect(scoreClientSearchMatch(reimported, '666', '666', '666', true)).toBeGreaterThan(0);
    expect(scoreClientSearchMatch(reimported, 'reimport', 'reimport', '', false)).toBeGreaterThan(0);
    expect(
      clientMatchesBusinessScope(reimported, 'biz-a', {
        legacySingleBusiness: true,
        excludeUnscopedLegacy: false,
      }),
    ).toBe(true);
  });
});
