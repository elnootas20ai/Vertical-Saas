import { describe, expect, it } from 'vitest';
import { getInvitePermissionsForUser } from '../src/app/lib/roleCatalog.ts';
import { canManagePayroll, canManageTeam } from '../src/app/lib/teamManagerAccess.ts';
import { isManagerRole } from '../src/app/lib/workerProfileCompletion.ts';

describe('Gestor invite access (nóminas + contratos)', () => {
  it('marks Gestor as manager / team payroll role', () => {
    expect(isManagerRole('Gestor')).toBe(true);
    expect(canManageTeam({ user_id: 'g1', role: 'Gestor' })).toBe(true);
    expect(canManagePayroll({ user_id: 'g1', role: 'Gestor' })).toBe(true);
  });

  it('invite matrix grants team + documents for Gestor', () => {
    const matrix = getInvitePermissionsForUser('Gestor', []);
    expect(matrix.team?.view).toBe(true);
    expect(matrix.team?.edit).toBe(true);
    expect(matrix.documents?.view).toBe(true);
    expect(matrix.documents?.edit).toBe(true);
  });

  it('does not grant team/documents to plain Usuario', () => {
    const matrix = getInvitePermissionsForUser('Usuario', []);
    expect(matrix.team?.view).toBe(false);
    expect(matrix.documents?.view).toBeFalsy();
  });
});
