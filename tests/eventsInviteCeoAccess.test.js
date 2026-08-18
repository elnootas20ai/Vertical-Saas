import { describe, expect, it } from 'vitest';
import {
  getDefaultInviteLandingPage,
  getInviteLandingPagesForBusiness,
} from '../src/app/lib/inviteDefaults.ts';
import { getFunctionRolesForBusiness } from '../src/app/lib/inviteFunctionRoles.ts';
import { canUseCeoAdminPanel } from '../src/app/lib/teamManagerAccess.ts';
import { getInvitePermissionsForUser } from '../src/app/lib/roleCatalog.ts';

describe('Events RRHH invite → panel como CEO', () => {
  it('Admin = nivel creador → dashboard y acceso total', () => {
    expect(getDefaultInviteLandingPage('events', 'Admin')).toBe('/saas/dashboard');
    expect(canUseCeoAdminPanel({ user_id: 'a0', role: 'Admin' })).toBe(true);
    const matrix = getInvitePermissionsForUser('Admin', []);
    expect(matrix.sales?.view).toBe(true);
    expect(matrix.sales?.edit).toBe(true);
    expect(matrix.team?.edit).toBe(true);
  });

  it('Administrador = lleva el SaaS → dashboard', () => {
    expect(getDefaultInviteLandingPage('events', 'Administrador')).toBe('/saas/dashboard');
    expect(canUseCeoAdminPanel({ user_id: 'a1', role: 'Administrador' })).toBe(true);
    const matrix = getInvitePermissionsForUser('Administrador', []);
    expect(matrix.sales?.view).toBe(true);
    expect(matrix.team?.edit).toBe(true);
  });

  it('Encargado y comercial aterrizan en contrataciones de eventos', () => {
    expect(getDefaultInviteLandingPage('events', 'Encargado')).toBe('/saas/vertical/eventos');
    expect(getDefaultInviteLandingPage('events', 'Comercial')).toBe('/saas/vertical/eventos');
    expect(getDefaultInviteLandingPage('events', 'Operaciones')).toBe('/saas/vertical/eventos');
  });

  it('ofrece dashboard y hub de eventos al invitar', () => {
    const ids = getInviteLandingPagesForBusiness('events').map((p) => p.id);
    expect(ids).toContain('/saas/dashboard');
    expect(ids).toContain('/saas/vertical/eventos');
  });

  it('incluye Admin y Administrador con textos distintos', () => {
    const roles = getFunctionRolesForBusiness('events');
    const ids = roles.map((r) => r.id);
    expect(ids).toContain('Admin');
    expect(ids).toContain('Administrador');
    expect(roles.find((r) => r.id === 'Admin')?.description).toMatch(/creador/i);
    expect(roles.find((r) => r.id === 'Administrador')?.description).toMatch(/SaaS/i);
  });
});
