import { describe, expect, it } from 'vitest';
import {
  canValidateRegisterClosings,
  resolveRestaurantTpvPermissions,
} from '../src/app/lib/restaurantTpvPermissions';

describe('canValidateRegisterClosings', () => {
  it('permite dueño / gerente / encargado', () => {
    expect(canValidateRegisterClosings({ isOwner: true })).toBe(true);
    expect(canValidateRegisterClosings({ role: 'gerente' })).toBe(true);
    expect(canValidateRegisterClosings({ employment: { role: 'encargado' } })).toBe(true);
    expect(canValidateRegisterClosings({ accountType: 'company' })).toBe(true);
  });

  it('bloquea trabajador invitado sin rol de gerente', () => {
    expect(
      canValidateRegisterClosings({
        accountType: 'user',
        invitedBy: 'owner-1',
        role: 'Camarero',
      }),
    ).toBe(false);
  });

  it('expone canValidateClosings en resolveRestaurantTpvPermissions', () => {
    expect(resolveRestaurantTpvPermissions({ role: 'gerente' }).canValidateClosings).toBe(true);
    expect(
      resolveRestaurantTpvPermissions({
        accountType: 'user',
        invitedBy: 'x',
        role: 'staff',
      }).canValidateClosings,
    ).toBe(false);
  });
});
