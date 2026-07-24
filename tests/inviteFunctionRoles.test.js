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
});
