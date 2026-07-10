import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isManagerRole } from '../services/managerRoles.js';

describe('isManagerRole', () => {
  it('delivery Encargado y Administrador cuentan como gerente', () => {
    assert.equal(isManagerRole('Encargado'), true);
    assert.equal(isManagerRole('Administrador'), true);
  });

  it('roles clásicos siguen siendo gerente', () => {
    assert.equal(isManagerRole('Admin'), true);
    assert.equal(isManagerRole('Gerente'), true);
  });

  it('trabajadores operativos no son gerente', () => {
    assert.equal(isManagerRole('Cocina'), false);
    assert.equal(isManagerRole('Mostrador / Atención'), false);
    assert.equal(isManagerRole('Usuario'), false);
  });
});
