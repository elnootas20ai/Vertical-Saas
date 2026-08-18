import { describe, expect, it } from 'vitest';
import {
  canChangeBusinessMemberRole,
  canRemoveBusinessMember,
  isBusinessOwner,
  isOwnerGatedTeamRole,
  isTenantAccountOwner,
} from '../services/businessAccess.js';
import {
  canOwnerPrecedenceRemoveMember,
  isBusinessOwner as isBusinessOwnerFe,
  isOwnerGatedTeamRole as isOwnerGatedTeamRoleFe,
} from '../src/app/lib/accountOwnerPrecedence.ts';

describe('owner precedence (creador vs Admin invitado)', () => {
  const business = {
    owner_user_id: 'owner-1',
    members: [
      { user_id: 'admin-inv', role: 'Admin' },
      { user_id: 'comercial-1', role: 'Comercial' },
      { user_id: 'administ', role: 'Administrador' },
    ],
  };

  it('distingue propietario de miembro', () => {
    expect(isBusinessOwner(business, 'owner-1')).toBe(true);
    expect(isBusinessOwner(business, 'admin-inv')).toBe(false);
    expect(isBusinessOwnerFe(business, 'owner-1')).toBe(true);
  });

  it('cuenta empresa es titular; invitado no', () => {
    expect(isTenantAccountOwner({ accountType: 'company', email: 'a@b.com' })).toBe(true);
    expect(isTenantAccountOwner({ accountType: 'user', invitedBy: 'owner-1', email: 'w@b.com' })).toBe(false);
  });

  it('solo el propietario expulsa Admin / Administrador', () => {
    expect(canRemoveBusinessMember(business, 'owner-1', 'admin-inv')).toBe(true);
    expect(canRemoveBusinessMember(business, 'admin-inv', 'administ')).toBe(false);
    expect(canRemoveBusinessMember(business, 'admin-inv', 'comercial-1')).toBe(true);
    expect(canRemoveBusinessMember(business, 'admin-inv', 'owner-1')).toBe(false);
    expect(canOwnerPrecedenceRemoveMember(business, 'admin-inv', 'administ', 'Administrador')).toBe(false);
    expect(canOwnerPrecedenceRemoveMember(business, 'owner-1', 'administ', 'Administrador')).toBe(true);
  });

  it('solo el propietario asigna roles gated', () => {
    expect(isOwnerGatedTeamRole('Admin')).toBe(true);
    expect(isOwnerGatedTeamRoleFe('Administrador')).toBe(true);
    expect(canChangeBusinessMemberRole(business, 'admin-inv', 'Comercial', 'Admin')).toBe(false);
    expect(canChangeBusinessMemberRole(business, 'owner-1', 'Comercial', 'Admin')).toBe(true);
    expect(canChangeBusinessMemberRole(business, 'admin-inv', 'Comercial', 'Operaciones')).toBe(true);
  });
});
