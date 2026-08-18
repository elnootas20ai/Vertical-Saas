import { describe, expect, it } from 'vitest';
import { canManagePayroll, canManageTeam, canUseCeoAdminPanel } from '../src/app/lib/teamManagerAccess.ts';

describe('teamManagerAccess', () => {
  it('allows Gestor role', () => {
    expect(canManageTeam({ user_id: 'u1', role: 'Gestor' })).toBe(true);
    expect(canManagePayroll({ user_id: 'u1', role: 'Gestor' })).toBe(true);
  });

  it('allows Encargado and Administrador', () => {
    expect(canManageTeam({ user_id: 'u1', role: 'Encargado' })).toBe(true);
    expect(canManageTeam({ user_id: 'u1', role: 'Administrador' })).toBe(true);
    expect(canUseCeoAdminPanel({ user_id: 'u1', role: 'Administrador' })).toBe(true);
  });

  it('denies plain Usuario', () => {
    expect(canManageTeam({ user_id: 'u1', role: 'Usuario' })).toBe(false);
    expect(canManagePayroll({ user_id: 'u1', role: 'Mostrador / Atención' })).toBe(false);
  });

  it('allows business owner', () => {
    expect(
      canManageTeam(
        { user_id: 'owner1', role: 'Usuario' },
        [{ owner_user_id: 'owner1' }],
      ),
    ).toBe(true);
  });
});
