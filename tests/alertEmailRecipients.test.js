import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canReceiveBusinessAlertEmail,
  isAlertEmailAdminRole,
} from '../services/alertEmitter.js';

describe('alert emails · solo owner + Admin', () => {
  const business = {
    owner_user_id: 'owner-1',
    members: [
      { user_id: 'admin-1', role: 'Admin' },
      { user_id: 'encargado-1', role: 'Encargado' },
      { user_id: 'gerente-1', role: 'Gerente' },
      { user_id: 'worker-1', role: 'Usuario' },
    ],
  };

  it('roles admin de correo', () => {
    assert.equal(isAlertEmailAdminRole('Admin'), true);
    assert.equal(isAlertEmailAdminRole('Administrador'), true);
    assert.equal(isAlertEmailAdminRole('Encargado'), false);
    assert.equal(isAlertEmailAdminRole('Gerente'), false);
    assert.equal(isAlertEmailAdminRole('Usuario'), false);
  });

  it('owner recibe email', () => {
    assert.equal(
      canReceiveBusinessAlertEmail({ user_id: 'owner-1', email: 'o@x.com', role: 'Admin' }, business),
      true,
    );
  });

  it('Admin invitado recibe email', () => {
    assert.equal(
      canReceiveBusinessAlertEmail({ user_id: 'admin-1', email: 'a@x.com', role: 'Admin' }, business),
      true,
    );
  });

  it('Encargado / Gerente / trabajador NO reciben email', () => {
    assert.equal(
      canReceiveBusinessAlertEmail({ user_id: 'encargado-1', email: 'e@x.com', role: 'Encargado' }, business),
      false,
    );
    assert.equal(
      canReceiveBusinessAlertEmail({ user_id: 'gerente-1', email: 'g@x.com', role: 'Gerente' }, business),
      false,
    );
    assert.equal(
      canReceiveBusinessAlertEmail({ user_id: 'worker-1', email: 'w@x.com', role: 'Usuario' }, business),
      false,
    );
  });
});
