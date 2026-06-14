import { describe, expect, it } from 'vitest';
import {
  isManagerRole,
  isWorkerProfileSubject,
  needsWorkerPayrollSetup,
  userOwnsAnyBusiness,
} from '../src/app/lib/workerProfileCompletion.ts';

describe('workerProfileCompletion', () => {
  it('isManagerRole reconoce gerentes en distintos formatos', () => {
    expect(isManagerRole('Gerente')).toBe(true);
    expect(isManagerRole('Admin')).toBe(true);
    expect(isManagerRole('gerente')).toBe(true);
    expect(isManagerRole('Comercial')).toBe(false);
  });

  it('cuenta company no es sujeto de ficha trabajador', () => {
    expect(
      isWorkerProfileSubject({
        accountType: 'company',
        linkedBusinessId: 'biz-1',
        role: 'Admin',
      }),
    ).toBe(false);
  });

  it('gerente invitado no es sujeto de ficha trabajador', () => {
    expect(
      isWorkerProfileSubject({
        accountType: 'user',
        invitedBy: 'owner-1',
        linkedBusinessId: 'biz-1',
        role: 'Gerente',
      }),
    ).toBe(false);
  });

  it('trabajador invitado sí es sujeto de ficha trabajador', () => {
    expect(
      isWorkerProfileSubject({
        accountType: 'user',
        invitedBy: 'owner-1',
        linkedBusinessId: 'biz-1',
        role: 'Comercial',
      }),
    ).toBe(true);
  });

  it('needsWorkerPayrollSetup no aplica a gerentes con empresa vinculada', () => {
    expect(
      needsWorkerPayrollSetup({
        accountType: 'user',
        linkedBusinessId: 'biz-1',
        role: 'Gerente',
        phone: '',
        personalData: {},
        employment: {},
      }),
    ).toBe(false);
  });

  it('needsWorkerPayrollSetup sí aplica a trabajadores sin identidad mínima', () => {
    expect(
      needsWorkerPayrollSetup({
        accountType: 'user',
        linkedBusinessId: 'biz-1',
        role: 'Comercial',
        phone: '',
        personalData: {},
        employment: {},
      }),
    ).toBe(true);
  });

  it('userOwnsAnyBusiness detecta empresas creadas por el usuario', () => {
    expect(userOwnsAnyBusiness('user-1', [{ owner_user_id: 'user-1' }])).toBe(true);
    expect(userOwnsAnyBusiness('user-1', [{ owner_user_id: 'user-2' }])).toBe(false);
    expect(userOwnsAnyBusiness('', [{ owner_user_id: 'user-1' }])).toBe(false);
  });
});
