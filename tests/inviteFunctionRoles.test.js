import { describe, expect, it } from 'vitest';
import {
  getFunctionRolesForBusiness,
  getInviteRoleDisplayLabel,
  getInvitePositionSuggestions,
  suggestPositionForInviteRole,
} from '../src/app/lib/inviteFunctionRoles.ts';

describe('inviteFunctionRoles', () => {
  it('restaurant: sin Reparto y labels de sala', () => {
    const roles = getFunctionRolesForBusiness('restaurant');
    expect(roles.map((r) => r.id)).not.toContain('Reparto');
    expect(roles.map((r) => r.id)).toContain('Mostrador / Atención');
    expect(getInviteRoleDisplayLabel('Mostrador / Atención', 'restaurant')).toBe('Sala / barra');
    expect(roles.find((r) => r.id === 'Mostrador / Atención')?.description).toMatch(/Camarero/i);
    expect(roles.find((r) => r.id === 'Cocina')?.description).toMatch(/comandas/i);
  });

  it('delivery: incluye Reparto', () => {
    const roles = getFunctionRolesForBusiness('delivery');
    expect(roles.map((r) => r.id)).toContain('Reparto');
  });

  it('sugiere cargos de bar al invitar', () => {
    expect(suggestPositionForInviteRole('Mostrador / Atención', 'restaurant')).toBe('Camarero/a');
    expect(suggestPositionForInviteRole('Cocina', 'restaurant')).toBe('Cocinero/a');
    expect(getInvitePositionSuggestions('restaurant')).toContain('Barista');
  });

  it('realEstate: roles inmobiliaria con Comercial (sin Reparto/Cocina)', () => {
    const roles = getFunctionRolesForBusiness('realEstate');
    expect(roles.map((r) => r.id)).toEqual([
      'Administrador',
      'Gestor',
      'Encargado',
      'Comercial',
    ]);
    expect(roles.map((r) => r.id)).not.toContain('Reparto');
    expect(roles.map((r) => r.id)).not.toContain('Cocina');
    expect(roles.find((r) => r.id === 'Comercial')?.description).toMatch(/Visitas/i);
    expect(suggestPositionForInviteRole('Comercial', 'realEstate')).toBe('Comercial');
    expect(getInvitePositionSuggestions('realEstate')).toContain('Agente inmobiliario');
  });
});
